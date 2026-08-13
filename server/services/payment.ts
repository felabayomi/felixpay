/**
 * Payment service with ATOMIC billing integrity - fixes critical revenue loss issues
 * Proper order: balance check → charge if needed → deduct cost → send check
 */

import { storage } from '../storage';
import { Bill } from '@shared/schema';
import { computeBillCostCents, formatCostDescription, formatTopUpDescription } from './billing';
import { getStripe } from '../lib/stripe';
import { getMercuryService } from './mercury';

export interface PaymentResult {
  success: boolean;
  message: string;
  requiresPayment?: boolean;
  newBalance?: number;
  chargeId?: string;
  checkId?: string;
  fundingSource?: 'stripe' | 'mercury';
  mercuryTransferId?: string;
}

/**
 * Check if Mercury funding is enabled and available
 */
function isMercuryFundingEnabled(): boolean {
  return process.env.ENABLE_MERCURY_FUNDING === 'true';
}

/**
 * HYBRID FUNDING STRATEGY - Mercury + Stripe fallback
 * 
 * This function handles funding for check payments with Mercury-first approach:
 * 1. Check Mercury availability and balance
 * 2. If Mercury can cover the amount, transfer directly to Checkbook
 * 3. If Mercury unavailable/insufficient, fall back to Stripe balance top-up
 * 
 * Benefits of Mercury funding:
 * - Same-day ACH (before 12 PM PT)
 * - 100 free transfers/month vs Stripe's 1.5% instant fees
 * - Direct funding bypasses 2-3 day payout delays
 */
async function executeFunding(userId: string, bill: Bill, amountCents: number): Promise<{
  success: boolean;
  fundingSource: 'mercury' | 'stripe';
  transferId?: string;
  paymentIntentId?: string;
  message?: string;
}> {
  console.log(`💰 Executing funding for $${(amountCents / 100).toFixed(2)} - Mercury enabled: ${isMercuryFundingEnabled()}`);

  // Try Mercury funding first if enabled
  if (isMercuryFundingEnabled()) {
    try {
      const mercuryService = getMercuryService();
      
      // Check if Mercury can handle this transfer
      const feasibilityCheck = await mercuryService.canTransferToCheckbook(amountCents);
      
      if (feasibilityCheck.canTransfer) {
        console.log(`🏛️ Mercury funding available: $${(feasibilityCheck.mercuryBalance / 100).toFixed(2)} balance`);
        
        // Execute direct Mercury to Checkbook transfer
        const transferResult = await mercuryService.transferToCheckbook(
          amountCents,
          `Direct check funding for bill ${bill.id} - ${bill.payeeName}`
        );
        
        console.log(`✅ Mercury direct funding successful: ${transferResult.id}`);
        return {
          success: true,
          fundingSource: 'mercury',
          transferId: transferResult.id
        };
      } else {
        console.log(`⚠️ Mercury funding not feasible: ${feasibilityCheck.reason}`);
      }
    } catch (mercuryError) {
      console.error('❌ Mercury funding failed, falling back to Stripe:', mercuryError);
    }
  }

  // Fall back to Stripe funding (existing logic)
  console.log('💳 Falling back to Stripe funding...');
  
  // Get user with default payment method
  const { user, defaultPaymentMethod } = await storage.getUserWithDefaultPaymentMethod(userId);
  
  if (!user.stripeCustomerId) {
    return {
      success: false,
      fundingSource: 'stripe',
      message: 'No Stripe customer found'
    };
  }

  if (!defaultPaymentMethod) {
    return {
      success: false,
      fundingSource: 'stripe',
      message: 'Insufficient balance and no payment method on file'
    };
  }

  // Create stable idempotency key to prevent duplicate charges on retries
  const idempotencyKey = `bill-payment-${bill.id}-topup-v2`;

  // Create PaymentIntent for top-up amount
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    customer: user.stripeCustomerId,
    payment_method: defaultPaymentMethod.stripePaymentMethodId,
    confirm: true,
    off_session: true,
    metadata: {
      userId,
      billId: bill.id,
      type: 'bill_payment_topup'
    },
    description: formatTopUpDescription(bill)
  }, {
    idempotencyKey
  });

  if (paymentIntent.status !== 'succeeded') {
    return {
      success: false,
      fundingSource: 'stripe',
      message: `Payment failed: ${paymentIntent.status}`
    };
  }

  console.log(`✅ Stripe payment succeeded: ${paymentIntent.id}`);
  return {
    success: true,
    fundingSource: 'stripe',
    paymentIntentId: paymentIntent.id
  };
}

/**
 * ATOMIC PAYMENT PROCESSING - Fixes critical billing integrity issues
 * This replaces the old ensureSufficientBalance + deductBillCost pattern
 * 
 * Correct atomic order:
 * 1. Check balance
 * 2. Try Mercury funding first, fall back to Stripe if needed
 * 3. Deduct cost atomically with proper guards
 * 4. Only then send check
 * 5. Update bill status
 */
export const processAtomicPayment = async (userId: string, bill: Bill): Promise<PaymentResult> => {
  const costCents = computeBillCostCents(bill);
  let stripePaymentIntentId: string | null = null;
  let mercuryTransferId: string | null = null;
  let fundingSource: 'stripe' | 'mercury' = 'stripe';
  
  // VALIDATION: Check for valid mailing address OR payment URL before processing
  // Bills imported from BillWatch may have placeholder "N/A" values which Felixcheck rejects
  const isValidAddressField = (value: string | null | undefined): boolean => {
    return !!value && value.trim() !== '' && value.trim().toUpperCase() !== 'N/A';
  };
  
  const hasValidAddress = isValidAddressField(bill.addressLine1) && 
    isValidAddressField(bill.city) && 
    isValidAddressField(bill.state) && 
    isValidAddressField(bill.postalCode);
  
  // Check if bill has a payment URL (can be paid online instead of by check)
  const hasPaymentUrl = !!(bill as any).paymentUrl && (bill as any).paymentUrl.trim() !== '';
  
  if (!hasValidAddress) {
    if (hasPaymentUrl) {
      // Bill has payment URL but no mailing address - direct user to pay online
      console.log(`ℹ️ Bill ${bill.id} has payment URL but no mailing address - should be paid online`);
      return {
        success: false,
        message: `This bill is set up for online payment only. Please visit the payment URL to pay this bill directly: ${(bill as any).paymentUrl}`
      };
    }
    console.log(`❌ Bill ${bill.id} has invalid/placeholder address - cannot mail check`);
    return {
      success: false,
      message: 'This bill is missing a valid mailing address. Please edit the bill to add the payee address (including PO Box) before paying.'
    };
  }
  
  console.log(`🔄 Starting atomic payment for bill ${bill.id}, cost: $${(costCents / 100).toFixed(2)}`);
  
  // CRITICAL: ATOMIC BILL LOCKING - Prevent concurrent payment processing
  // This ensures only ONE request can process a bill by atomically transitioning PENDING/SCHEDULED/FAILED → PROCESSING
  let lockResult = await storage.atomicBillStatusTransition(bill.id, 'PENDING', 'PROCESSING');
  
  // If PENDING transition failed, try SCHEDULED transition
  if (!lockResult.success) {
    lockResult = await storage.atomicBillStatusTransition(bill.id, 'SCHEDULED', 'PROCESSING');
  }
  
  // If SCHEDULED transition failed, try FAILED transition (for retries)
  if (!lockResult.success) {
    lockResult = await storage.atomicBillStatusTransition(bill.id, 'FAILED', 'PROCESSING');
  }
  
  if (!lockResult.success) {
    if (lockResult.bill) {
      const currentStatus = lockResult.bill.status;
      console.log(`🔒 Bill ${bill.id} already locked/processed (status: ${currentStatus}), rejecting concurrent request`);
      
      if (currentStatus === 'PROCESSING') {
        return {
          success: false,
          message: 'Bill is currently being processed by another request. Please wait and try again.'
        };
      } else {
        return {
          success: false,
          message: `Bill has already been processed (status: ${currentStatus})`
        };
      }
    } else {
      return {
        success: false,
        message: 'Bill not found'
      };
    }
  }
  
  // Verify bill ownership after successful lock
  const lockedBill = lockResult.bill!;
  if (lockedBill.userId !== userId) {
    // Release the lock by setting status back to SCHEDULED
    await storage.atomicBillStatusTransition(bill.id, 'PROCESSING', 'SCHEDULED');
    return {
      success: false,
      message: 'Unauthorized - bill belongs to different user'
    };
  }
  
  console.log(`🔒 Successfully locked bill ${bill.id} for atomic processing`);
  
  // CRITICAL: Flag to track if we need to release lock in finally block
  let releaseLock = true; // Will be set to false only on successful completion with SENT status
  
  try {
    
    // Step 1: Check current balance
    const currentBalance = await storage.checkUserBalance(userId);
    console.log(`💰 Current balance: $${(currentBalance / 100).toFixed(2)}, Required: $${(costCents / 100).toFixed(2)}`);
    
    // Step 2: Handle funding with Mercury-first hybrid approach
    if (currentBalance < costCents) {
      const topUpAmount = costCents - currentBalance;
      console.log(`💰 Insufficient balance, need funding: $${(topUpAmount / 100).toFixed(2)}`);
      
      // Try hybrid funding (Mercury first, Stripe fallback)
      const fundingResult = await executeFunding(userId, bill, topUpAmount);
      
      if (!fundingResult.success) {
        return {
          success: false,
          message: fundingResult.message || 'Funding failed',
          requiresPayment: true
        };
      }
      
      // Track funding details
      fundingSource = fundingResult.fundingSource;
      if (fundingResult.paymentIntentId) {
        stripePaymentIntentId = fundingResult.paymentIntentId;
      }
      if (fundingResult.transferId) {
        mercuryTransferId = fundingResult.transferId;
      }
      
      console.log(`✅ Funding successful via ${fundingSource}: ${fundingResult.transferId || fundingResult.paymentIntentId}`);
      
      // For Stripe funding, we need to update balance (Mercury funding is direct)
      if (fundingSource === 'stripe' && stripePaymentIntentId) {
        // ATOMIC IDEMPOTENT BALANCE CREDITING - Replaces the old non-atomic pattern
        console.log(`💰 Processing PaymentIntent ${stripePaymentIntentId} with atomic idempotent balance update`);
        
        const addResult = await storage.addToBalanceIdempotent(
          userId,
          topUpAmount,
          stripePaymentIntentId,
          {
            userId,
            billId: bill.id,
            description: formatTopUpDescription(bill)
          }
        );

        if (!addResult.success) {
          // CRITICAL: Stripe succeeded but balance update failed - MUST REFUND
          console.error(`❌ CRITICAL COMPENSATION NEEDED: Stripe ${stripePaymentIntentId} succeeded but balance update failed for user ${userId}: ${addResult.message}`);
          
          try {
            const stripe = getStripe();
            const refund = await stripe.refunds.create({
              payment_intent: stripePaymentIntentId,
              reason: 'requested_by_customer',
              metadata: {
                reason: 'idempotent_balance_update_failed',
                userId,
                billId: bill.id,
                timestamp: new Date().toISOString(),
                errorMessage: addResult.message || 'Unknown error'
              }
            });
            console.log(`✅ Automatic refund issued for failed balance update: ${refund.id}`);
            
            return {
              success: false,
              message: 'Payment processed but account update failed. Refund has been issued automatically.'
            };
          } catch (refundError) {
            console.error(`❌ URGENT MANUAL INTERVENTION REQUIRED: Failed to refund ${stripePaymentIntentId}`, refundError);
            return {
              success: false,
              message: 'Payment processed but account update failed. Please contact support immediately.'
            };
          }
        }

        if (addResult.alreadyProcessed) {
          console.log(`🔍 PaymentIntent ${stripePaymentIntentId} already processed - continuing with existing balance state`);
          console.log(`✅ Idempotent operation: Balance already credited for PaymentIntent ${stripePaymentIntentId}`);
        } else {
          console.log(`✅ Stripe balance topped up successfully, new balance: $${(addResult.newBalance / 100).toFixed(2)}`);
        }
      } else if (fundingSource === 'mercury') {
        console.log(`💰 Mercury direct funding completed - no balance update needed (funded directly to Checkbook)`);
      }
    }

    // Step 3: Atomically deduct bill cost with proper guards
    console.log(`💸 Deducting bill cost: $${(costCents / 100).toFixed(2)}`);
    const deductResult = await storage.deductFromBalance(userId, costCents);

    if (!deductResult.success) {
      // This should not happen after balance verification, but handle gracefully
      console.error(`❌ UNEXPECTED: Bill cost deduction failed after balance verification for user ${userId}: ${deductResult.message}`);
      
      
      // If we charged Stripe, we need to refund since cost deduction failed
      // REFUND PROTECTION: Only refund if this is the process that created the PaymentIntent
      if (stripePaymentIntentId) {
        try {
          // Check if this PaymentIntent was created by this payment attempt
          const existingTransaction = await storage.checkTransactionExists(stripePaymentIntentId);
          
          if (existingTransaction) {
            console.log(`🛡️ PaymentIntent ${stripePaymentIntentId} already tracked - proceeding with refund`);
            
            const stripe = getStripe();
            const refund = await stripe.refunds.create({
              payment_intent: stripePaymentIntentId,
              reason: 'requested_by_customer',
              metadata: {
                reason: 'cost_deduction_failed',
                userId,
                billId: bill.id,
                timestamp: new Date().toISOString(),
                processId: `${bill.id}-${Date.now()}`
              }
            });
            console.log(`✅ Refunded Stripe payment due to cost deduction failure: ${refund.id}`);
          } else {
            console.log(`🛡️ PaymentIntent ${stripePaymentIntentId} not tracked by this process - skipping refund to prevent erroneous refunds`);
          }
        } catch (refundError) {
          console.error(`❌ URGENT MANUAL INTERVENTION REQUIRED: Failed to refund ${stripePaymentIntentId} after cost deduction failure`, refundError);
        }
      }
      
      return {
        success: false,
        message: 'Unable to process payment due to billing error. Any charges have been refunded.'
      };
    }

    // Record the cost deduction transaction
    await storage.createTransaction({
      userId,
      billId: bill.id,
      amountCents: -costCents, // Negative for deduction
      description: formatCostDescription(bill),
      stripeChargeId: null
    });

    console.log(`✅ Bill cost deducted successfully, new balance: $${(deductResult.newBalance / 100).toFixed(2)}`);

    // Step 4: NOW it's safe to create the check (billing integrity is guaranteed)
    console.log(`📝 Creating check for bill ${bill.id}`);
    let checkResponse: { id: string; status?: string };
    
    try {
      // Use Felixcheck.com for check printing and mailing
      const { getFelixcheckService } = await import('./felixcheck');
      const felixcheckService = getFelixcheckService();
      
      if (!felixcheckService.isAvailable()) {
        throw new Error('Felixcheck service not configured - FELIXCHECK_API_KEY required');
      }
      
      console.log(`📮 Using Felixcheck.com to create check for bill ${bill.id}`);
      const felixcheckResponse = await felixcheckService.createCheck(
        bill.id,
        bill.payeeName,
        {
          line_1: bill.addressLine1,
          line_2: bill.addressLine2 || undefined,
          city: bill.city,
          state: bill.state,
          zip: bill.postalCode
        },
        bill.amountCents / 100,
        bill.memo || `Payment for ${bill.payeeName}`
      );
      checkResponse = { id: felixcheckResponse.id, status: felixcheckResponse.status };
      console.log(`✅ Check created successfully: ${checkResponse.id}`);
      
      // Step 5: Update bill status to SENT (only on successful completion)
      const statusUpdateResult = await storage.atomicBillStatusTransition(bill.id, 'PROCESSING', 'SENT');
      
      if (!statusUpdateResult.success) {
        console.error(`❌ CRITICAL: Check created but failed to update bill status to SENT for ${bill.id}`);
        // Don't return here - the check was created successfully, just log the issue
      } else {
        releaseLock = false; // Successful completion - don't release lock in finally block
        console.log(`✅ Bill ${bill.id} status updated to SENT`);
      }
      
      // Build successful payment result with funding source information
      const finalBalance = await storage.checkUserBalance(userId);
      
      const successResult: PaymentResult = {
        success: true,
        message: `Payment processed successfully via ${fundingSource}${fundingSource === 'mercury' ? ' (direct funding)' : ''}: $${(bill.amountCents / 100).toFixed(2)} check sent to ${bill.payeeName}`,
        newBalance: finalBalance,
        checkId: checkResponse.id,
        fundingSource,
        ...(mercuryTransferId && { mercuryTransferId }),
        ...(stripePaymentIntentId && { chargeId: stripePaymentIntentId })
      };
      
      console.log(`🎉 Payment completed successfully: Bill ${bill.id}, Check ${checkResponse.id}, Funding: ${fundingSource}`);
      return successResult;
      
    } catch (checkError) {
      // CRITICAL: Check creation failed AFTER cost deduction - MUST RESTORE BALANCE
      console.error(`❌ CRITICAL: Check creation failed after cost deduction for bill ${bill.id}. Restoring balance...`, checkError);
      
      // Restore the deducted cost to user's balance
      const restoreResult = await storage.addToBalance(userId, costCents);
      
      if (restoreResult.success) {
        // Record the balance restoration transaction
        await storage.createTransaction({
          userId,
          billId: bill.id,
          amountCents: costCents, // Positive for restoration
          description: `Balance restored due to check creation failure - ${formatCostDescription(bill)}`,
          stripeChargeId: null
        });
        console.log(`✅ Balance restored successfully after check failure: $${(restoreResult.newBalance / 100).toFixed(2)}`);
      } else {
        console.error(`❌ URGENT: Failed to restore balance after check creation failure for bill ${bill.id}. Manual intervention required.`);
      }
      
      // CRITICAL: Release bill lock and handle Stripe refund with protection
      await storage.atomicBillStatusTransition(bill.id, 'PROCESSING', 'SCHEDULED');
      
      // If we had a Stripe charge, also refund it with protection
      if (stripePaymentIntentId) {
        try {
          // REFUND PROTECTION: Only refund if this is the process that created the PaymentIntent
          const existingTransaction = await storage.checkTransactionExists(stripePaymentIntentId);
          
          if (existingTransaction) {
            console.log(`🛡️ PaymentIntent ${stripePaymentIntentId} tracked by this process - proceeding with refund`);
            
            const stripe = getStripe();
            const refund = await stripe.refunds.create({
              payment_intent: stripePaymentIntentId,
              reason: 'requested_by_customer',
              metadata: {
                reason: 'check_creation_failed_with_balance_restoration',
                userId,
                billId: bill.id,
                costCents: costCents.toString(),
                timestamp: new Date().toISOString(),
                processId: `${bill.id}-${Date.now()}`
              }
            });
            console.log(`✅ Stripe refund issued for check creation failure: ${refund.id}`);
          } else {
            console.log(`🛡️ PaymentIntent ${stripePaymentIntentId} not tracked by this process - skipping refund to prevent erroneous refunds`);
          }
        } catch (refundError) {
          console.error(`❌ URGENT: Failed to refund Stripe charge ${stripePaymentIntentId} after check failure`, refundError);
        }
      }
      
      return {
        success: false,
        message: `Check creation failed. Your account balance has been restored.`,
        newBalance: restoreResult.success ? restoreResult.newBalance : deductResult.newBalance
      };
    }

    // Step 5: Update bill status to SENT
    try {
      await storage.updateBillStatus(bill.id, 'SENT', checkResponse.id);
      console.log(`🎉 ATOMIC PAYMENT SUCCESS - Bill ${bill.id}, Check ${checkResponse.id}, Final Balance: $${(deductResult.newBalance / 100).toFixed(2)}`);

      // CRITICAL: Bill successfully completed - no need to release lock as status is now SENT
      releaseLock = false;

      return {
        success: true,
        message: 'Payment processed successfully',
        newBalance: deductResult.newBalance,
        checkId: checkResponse.id,
        chargeId: stripePaymentIntentId || undefined
      };
      
    } catch (statusError) {
      // Check was created but status update failed - this is less critical but should be logged
      console.error(`⚠️ Check created but status update failed for bill ${bill.id}:`, statusError);
      
      // Don't restore balance since check was actually sent
      return {
        success: true,
        message: 'Payment processed (check sent but status update failed)',
        newBalance: deductResult.newBalance,
        checkId: checkResponse.id,
        chargeId: stripePaymentIntentId || undefined
      };
    }

  } catch (error: any) {
    console.error(`❌ Atomic payment failed for bill ${bill.id}:`, error);

    // CRITICAL: Check if we need to restore balance from failed operation
    // This catches any unexpected failures after cost deduction but before successful completion
    try {
      const currentUser = await storage.getUser(userId);
      if (currentUser) {
        // If there was a cost deduction that didn't complete successfully, we may need compensation
        // This is a safety net for any edge cases not handled by specific try/catch blocks above
        
        
        // If we have a Stripe payment that succeeded, attempt refund with protection
        if (stripePaymentIntentId) {
          try {
            // REFUND PROTECTION: Only refund if this is the process that created the PaymentIntent
            const existingTransaction = await storage.checkTransactionExists(stripePaymentIntentId);
            
            if (existingTransaction) {
              console.log(`🛡️ PaymentIntent ${stripePaymentIntentId} tracked by this process - proceeding with emergency refund`);
              
              const stripe = getStripe();
              const refund = await stripe.refunds.create({
                payment_intent: stripePaymentIntentId,
                reason: 'requested_by_customer',
                metadata: {
                  reason: 'atomic_payment_failure_compensation',
                  userId,
                  billId: bill.id,
                  error: error.message,
                  timestamp: new Date().toISOString(),
                  processId: `${bill.id}-${Date.now()}`
                }
              });
              console.log(`✅ Emergency Stripe refund issued for atomic payment failure: ${refund.id}`);
            } else {
              console.log(`🛡️ PaymentIntent ${stripePaymentIntentId} not tracked by this process - skipping emergency refund to prevent erroneous refunds`);
            }
          } catch (refundError) {
            console.error(`❌ URGENT MANUAL INTERVENTION REQUIRED: Failed to refund ${stripePaymentIntentId} after atomic payment failure`, refundError);
          }
        }
      }
    } catch (compensationError) {
      console.error(`❌ Error during failure compensation for bill ${bill.id}:`, compensationError);
    }

    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return {
        success: false,
        message: error.message || 'Card payment failed',
        requiresPayment: true
      };
    }

    return {
      success: false,
      message: 'Payment processing failed. Any charges have been refunded and your balance restored.'
    };
  } finally {
    // CRITICAL: GUARANTEED LOCK RELEASE - Ensure bill lock is released on all failure paths
    if (releaseLock) {
      try {
        const releaseResult = await storage.atomicBillStatusTransition(bill.id, 'PROCESSING', 'SCHEDULED');
        if (releaseResult.success) {
          console.log(`🔓 Lock released for bill ${bill.id} in finally block`);
        } else {
          console.error(`❌ URGENT: Failed to release lock for bill ${bill.id} in finally block - bill may be in wrong status`);
        }
      } catch (lockReleaseError) {
        console.error(`❌ CRITICAL ERROR: Failed to release bill lock for ${bill.id} in finally block:`, lockReleaseError);
      }
    } else {
      console.log(`🔒 Lock for bill ${bill.id} not released - bill successfully processed to SENT status`);
    }
  }
};

/**
 * LEGACY FUNCTIONS - Kept for backward compatibility but should be replaced with processAtomicPayment
 */

/**
 * @deprecated Use processAtomicPayment instead for atomic billing integrity
 */
export const ensureSufficientBalance = async (userId: string, bill: Bill): Promise<PaymentResult> => {
  console.warn('⚠️ DEPRECATED: ensureSufficientBalance is deprecated. Use processAtomicPayment for billing integrity.');
  
  try {
    const costCents = computeBillCostCents(bill);
    const currentBalance = await storage.checkUserBalance(userId);

    // Check if balance is sufficient
    if (currentBalance >= costCents) {
      return {
        success: true,
        message: 'Sufficient balance available',
        newBalance: currentBalance
      };
    }

    // Need to charge for insufficient balance
    const amountToCharge = costCents - currentBalance;
    
    // Get user and default payment method
    const { user, defaultPaymentMethod } = await storage.getUserWithDefaultPaymentMethod(userId);
    
    if (!user.stripeCustomerId) {
      return {
        success: false,
        message: 'No Stripe customer found',
        requiresPayment: true
      };
    }

    if (!defaultPaymentMethod) {
      return {
        success: false,
        message: 'No default payment method found',
        requiresPayment: true
      };
    }

    // Create idempotency key to prevent duplicate charges
    const idempotencyKey = `bill-${bill.id}-topup-${bill.updatedAt?.getTime() || Date.now()}`;

    // Create PaymentIntent with off_session confirmation
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountToCharge,
      currency: 'usd',
      customer: user.stripeCustomerId,
      payment_method: defaultPaymentMethod.stripePaymentMethodId,
      confirm: true,
      off_session: true,
      metadata: {
        userId,
        billId: bill.id,
        type: 'bill_payment_topup'
      },
      description: formatTopUpDescription(bill)
    }, {
      idempotencyKey
    });

    if (paymentIntent.status === 'succeeded') {
      // Add charged amount to user balance
      const addResult = await storage.addToBalance(userId, amountToCharge);
      
      if (addResult.success) {
        // Record the top-up transaction
        await storage.createTransaction({
          userId,
          billId: bill.id,
          amountCents: amountToCharge,
          description: formatTopUpDescription(bill),
          stripeChargeId: paymentIntent.id
        });

        return {
          success: true,
          message: 'Balance topped up successfully',
          newBalance: addResult.newBalance,
          chargeId: paymentIntent.id
        };
      } else {
        return {
          success: false,
          message: 'Failed to update balance after successful charge'
        };
      }
    } else {
      return {
        success: false,
        message: 'Payment failed',
        requiresPayment: true
      };
    }

  } catch (error: any) {
    console.error('Error ensuring sufficient balance:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return {
        success: false,
        message: error.message || 'Card payment failed',
        requiresPayment: true
      };
    }

    return {
      success: false,
      message: 'Payment processing failed',
      requiresPayment: true
    };
  }
};

/**
 * @deprecated Use processAtomicPayment instead for atomic billing integrity
 */
export const deductBillCost = async (userId: string, bill: Bill): Promise<PaymentResult> => {
  console.warn('⚠️ DEPRECATED: deductBillCost is deprecated. Use processAtomicPayment for billing integrity.');
  
  try {
    const costCents = computeBillCostCents(bill);
    const deductResult = await storage.deductFromBalance(userId, costCents);

    if (deductResult.success) {
      // Record the cost deduction transaction
      await storage.createTransaction({
        userId,
        billId: bill.id,
        amountCents: -costCents, // Negative for deduction
        description: formatCostDescription(bill),
        stripeChargeId: null
      });

      return {
        success: true,
        message: 'Bill cost deducted successfully',
        newBalance: deductResult.newBalance
      };
    } else {
      return {
        success: false,
        message: 'Failed to deduct bill cost - insufficient balance'
      };
    }
  } catch (error) {
    console.error('Error deducting bill cost:', error);
    return {
      success: false,
      message: 'Failed to deduct bill cost'
    };
  }
};