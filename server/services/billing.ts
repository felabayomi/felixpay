/**
 * Billing service for cost calculation and payment processing
 */

import { Bill } from '@shared/schema';
import { DatabaseStorage } from '../storage';
import { scheduleBillSend } from './jobs';

// Cost calculation for bill payments
// Returns only the mailing/service fee (not the bill amount)
export const getMailingFeeCents = (): number => {
  return parseInt(process.env.CHECK_COST_CENTS || '150', 10); // $1.50 default
};

// Returns the TOTAL cost for paying a bill: bill amount + mailing fee
export const computeBillCostCents = (bill: Bill): number => {
  const mailingCostCents = getMailingFeeCents();
  
  // Total cost = bill amount + mailing fee
  return bill.amountCents + mailingCostCents;
};

// Validation helpers
export const isValidAmount = (amountCents: number): boolean => {
  return amountCents > 0 && amountCents <= 1000000; // Max $10,000 per transaction
};

export const formatCostDescription = (bill: Bill): string => {
  return `Check mailing cost for ${bill.payeeName} - Bill #${bill.id.slice(0, 8)}`;
};

export const formatTopUpDescription = (bill: Bill): string => {
  return `Account top-up for bill payment - ${bill.payeeName}`;
};

// Balance-aware scheduling types
export type SchedulingResult = {
  scheduledBills: string[]; // bill IDs that were scheduled
  pendingBills: string[];   // bill IDs left as pending due to insufficient balance
  totalCostCents: number;   // total cost of scheduled bills
  availableBalanceCents: number; // user's available balance
};

/**
 * Smart bill scheduling that only schedules bills if user has sufficient balance.
 * Prevents financial risk by ensuring user can afford scheduled bills.
 */
export const scheduleWithBalanceCheck = async (
  storage: DatabaseStorage,
  userId: string,
  billsToConsider: Bill[]
): Promise<SchedulingResult> => {
  console.log(`🧮 Starting balance-aware scheduling for user ${userId} with ${billsToConsider.length} bills`);
  
  // Check user's current balance
  const rawBalanceCents = await storage.checkUserBalance(userId);
  
  // CRITICAL FIX: Calculate already-committed amounts and auto-correct overcommitment
  const existingBills = await storage.getBills(userId);
  const currentlyScheduledBills = existingBills.filter(bill => bill.status === 'SCHEDULED');
  const processingBills = existingBills.filter(bill => bill.status === 'PROCESSING');
  
  console.log(`📊 DEBUG: Found ${existingBills.length} total bills, ${currentlyScheduledBills.length} scheduled, ${processingBills.length} processing`);
  
  // Processing bills can't be downgraded (already in progress)
  // computeBillCostCents now returns total cost (bill amount + mailing fee)
  const lockedAmountCents = processingBills
    .reduce((total, bill) => total + computeBillCostCents(bill), 0);
  
  console.log(`💰 User raw balance: $${(rawBalanceCents / 100).toFixed(2)}`);
  console.log(`🔒 Locked in processing: $${(lockedAmountCents / 100).toFixed(2)}`);
  
  let balanceAfterLocked = rawBalanceCents - lockedAmountCents;
  console.log(`💡 Balance after locked: $${(balanceAfterLocked / 100).toFixed(2)}`);
  
  // BULLETPROOF AUTO-CORRECTION: Check for any overcommitment
  // computeBillCostCents now returns total cost (bill amount + mailing fee)
  const currentScheduledAmountCents = currentlyScheduledBills
    .reduce((total, bill) => total + computeBillCostCents(bill), 0);
  
  console.log(`🔍 Overcommitment check: balanceAfterLocked=${balanceAfterLocked}, scheduledCount=${currentlyScheduledBills.length}, scheduledAmount=$${(currentScheduledAmountCents / 100).toFixed(2)}`);
  
  // CRITICAL: Any scheduled amount exceeding available balance is overcommitment
  const isOvercommitted = currentScheduledAmountCents > balanceAfterLocked || 
                          (balanceAfterLocked <= 0 && currentlyScheduledBills.length > 0);
  
  if (isOvercommitted) {
    console.log(`🚨 OVERCOMMITMENT DETECTED - Scheduled: $${(currentScheduledAmountCents / 100).toFixed(2)}, Available: $${(balanceAfterLocked / 100).toFixed(2)}`);
    
    // IMMEDIATELY move ALL scheduled bills back to PENDING to clear overcommitment
    for (const bill of currentlyScheduledBills) {
      await storage.updateBillStatus(bill.id, 'PENDING');
      console.log(`⬇️ EMERGENCY: Downgraded overcommitted bill ${bill.id} (${bill.payeeName}) $${(bill.amountCents / 100).toFixed(2)} from SCHEDULED to PENDING`);
    }
    
    // Update our working set - all previously scheduled bills are now candidates for scheduling
    billsToConsider = [...billsToConsider, ...currentlyScheduledBills];
    
    console.log(`✅ EMERGENCY CORRECTION: ${currentlyScheduledBills.length} bills moved to PENDING, clearing $${(currentScheduledAmountCents / 100).toFixed(2)} overcommitment`);
  } else {
    console.log(`✅ No overcommitment detected`);
  }
  
  const availableBalanceCents = Math.max(0, balanceAfterLocked);
  console.log(`✅ Available balance for new scheduling: $${(availableBalanceCents / 100).toFixed(2)}`);
  
  // If user has $0 or negative available balance, don't schedule anything
  if (availableBalanceCents <= 0) {
    const message = availableBalanceCents < 0 
      ? `⚠️  User is overcommitted by $${(Math.abs(availableBalanceCents) / 100).toFixed(2)} - no new bills will be scheduled`
      : `⚠️  User has $0 available balance - no bills will be scheduled automatically`;
    console.log(message);
    return {
      scheduledBills: [],
      pendingBills: billsToConsider.map(b => b.id),
      totalCostCents: 0,
      availableBalanceCents: 0
    };
  }
  
  // Sort bills by due date (most urgent first) - this prioritizes which bills get scheduled
  const sortedBills = [...billsToConsider].sort((a, b) => 
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );
  
  let remainingBalanceCents = availableBalanceCents;
  const scheduledBills: string[] = [];
  const pendingBills: string[] = [];
  let totalCostCents = 0;
  
  for (const bill of sortedBills) {
    // TIMING RULE: Only schedule bills 7+ days before due date
    const daysUntilDue = Math.ceil((new Date(bill.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue <= 7) {
      // Bill is 7 days or less away - keep as PENDING
      await storage.updateBillStatus(bill.id, 'PENDING');
      pendingBills.push(bill.id);
      console.log(`⏰ Bill ${bill.id} (${bill.payeeName}) kept PENDING - Due in ${daysUntilDue} days (≤7 day limit)`);
      continue;
    }
    
    // CRITICAL FIX: Compare against total scheduling cost (bill amount + mailing fee)
    // computeBillCostCents now returns total cost (bill amount + mailing fee)
    const totalSchedulingCostCents = computeBillCostCents(bill);
    
    // Check if we can afford this bill (amount + mailing fee)
    if (remainingBalanceCents >= totalSchedulingCostCents) {
      // Schedule this bill
      try {
        // Update bill status to SCHEDULED
        await storage.updateBillStatus(bill.id, 'SCHEDULED');
        
        // Schedule the bill to be sent 7 days before due date
        await scheduleBillSend(bill.id, bill.dueDate);
        
        scheduledBills.push(bill.id);
        remainingBalanceCents -= totalSchedulingCostCents; // Deduct total cost (bill + fee)
        totalCostCents += totalSchedulingCostCents; // Track total spent including fees
        
        console.log(`✅ Scheduled bill ${bill.id} (${bill.payeeName}) - Bill: $${(bill.amountCents / 100).toFixed(2)}, Fee: $${(getMailingFeeCents() / 100).toFixed(2)}, Total: $${(totalSchedulingCostCents / 100).toFixed(2)}, Remaining: $${(remainingBalanceCents / 100).toFixed(2)}`);
      } catch (error) {
        console.error(`Failed to schedule bill ${bill.id}:`, error);
        // If scheduling fails, treat as pending
        await storage.updateBillStatus(bill.id, 'PENDING');
        pendingBills.push(bill.id);
      }
    } else {
      // Can't afford this bill - mark as PENDING
      await storage.updateBillStatus(bill.id, 'PENDING');
      pendingBills.push(bill.id);
      console.log(`⏳ Bill ${bill.id} (${bill.payeeName}) set to PENDING - Total needed: $${(totalSchedulingCostCents / 100).toFixed(2)} (Bill: $${(bill.amountCents / 100).toFixed(2)} + Fee: $${(getMailingFeeCents() / 100).toFixed(2)}), Available: $${(remainingBalanceCents / 100).toFixed(2)}`);
    }
  }
  
  console.log(`📊 Balance-aware scheduling complete: ${scheduledBills.length} scheduled, ${pendingBills.length} pending, Total cost: $${(totalCostCents / 100).toFixed(2)}`);
  
  return {
    scheduledBills,
    pendingBills,
    totalCostCents,
    availableBalanceCents
  };
};