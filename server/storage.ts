import {
  users,
  bills,
  paymentMethods,
  transactions,
  payLinks,
  memberships,
  type User,
  type UpsertUser,
  type Bill,
  type InsertBill,
  type PaymentMethod,
  type PaymentMethodWithBoolean,
  type InsertPaymentMethod,
  type Transaction,
  type InsertTransaction,
  type PayLink,
  type InsertPayLink,
  type Membership,
  stripeToInternalType,
  type InternalPaymentMethodType,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsersWithEmails(): Promise<User[]>;
  
  // Bill operations
  getBills(userId: string): Promise<Bill[]>;
  createBill(bill: InsertBill): Promise<Bill>;
  updateBill(id: string, userId: string, updates: Partial<Omit<InsertBill, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Bill | undefined>;
  updateBillStatus(id: string, status: string, providerId?: string): Promise<Bill | undefined>;
  cancelBill(id: string, userId: string): Promise<Bill | undefined>;
  getBill(id: string): Promise<Bill | undefined>;
  getBillBySourceId(sourceId: string): Promise<Bill | undefined>;
  getBillBySourceIdAndUserId(sourceId: string, userId: string): Promise<Bill | undefined>;
  getBillByProviderId(providerId: string): Promise<Bill | undefined>;
  findDuplicateBill(userId: string, payeeName: string, amountCents: number, dueDate: Date): Promise<Bill | undefined>;
  upsertBill(bill: Partial<InsertBill> & { sourceId: string; userId: string }): Promise<Bill>;
  cleanupDuplicateBills(userId: string): Promise<{ deletedCount: number; deletedBills: string[] }>;
  restoreCanceledBills(userId: string): Promise<{ restoredCount: number; bills: Bill[]; message: string }>;
  markBillExternallyPaid(billId: string, userId: string, paymentData: { settlementMethod: string; settledAt: Date; settlementReference?: string }): Promise<Bill | undefined>;
  
  // Profile operations
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string }): Promise<User | undefined>;
  updateUserPhase(userId: string, phase: string): Promise<User | undefined>;
  
  // Billing operations
  updateUserStripeCustomerId(userId: string, customerId: string): Promise<User | undefined>;
  updateUserAccountBalance(userId: string, balanceCents: number): Promise<User | undefined>;
  
  // Atomic balance operations
  checkUserBalance(userId: string): Promise<number>;
  deductFromBalance(userId: string, amountCents: number): Promise<{ success: boolean; newBalance: number; message?: string }>;
  addToBalance(userId: string, amountCents: number): Promise<{ success: boolean; newBalance: number }>;
  addToBalanceIdempotent(userId: string, amountCents: number, externalId: string, transactionData: Omit<InsertTransaction, 'stripeChargeId' | 'amountCents'>): Promise<{ success: boolean; newBalance: number; alreadyProcessed: boolean; message?: string }>;
  getUserWithDefaultPaymentMethod(userId: string): Promise<{ user: User; defaultPaymentMethod: PaymentMethodWithBoolean | null }>;
  
  getPaymentMethods(userId: string): Promise<PaymentMethodWithBoolean[]>;
  getPaymentMethod(id: string): Promise<PaymentMethodWithBoolean | undefined>;
  createPaymentMethod(method: InsertPaymentMethod): Promise<PaymentMethod>;
  deletePaymentMethod(id: string): Promise<void>;
  setDefaultPaymentMethod(userId: string, methodId: string): Promise<void>;
  getTransactions(userId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  
  // Concurrency protection methods
  checkTransactionExists(stripeChargeId: string): Promise<boolean>;
  atomicBillStatusTransition(billId: string, fromStatus: string, toStatus: string): Promise<{ success: boolean; bill?: Bill }>;
  
  // Balance recalculation
  recalculateUserBalance(userId: string): Promise<{ success: boolean; calculatedBalance: number; transactionCount: number }>;

  // Pay link operations
  createPayLink(payLink: InsertPayLink): Promise<PayLink>;
  getPayLinkByToken(token: string): Promise<PayLink | undefined>;
  getPayLinksByUserId(userId: string): Promise<PayLink[]>;
  updatePayLinkStatus(id: string, status: string, updates?: Partial<PayLink>): Promise<PayLink | undefined>;
  getPayLinkByStripeSessionId(sessionId: string): Promise<PayLink | undefined>;

  // Membership operations
  getMembershipByUserId(userId: string): Promise<Membership | undefined>;
  getMembershipByEmail(email: string): Promise<{ membership: Membership; user: User } | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertMembership(userId: string, data: Partial<Membership>): Promise<Membership>;
  getMembershipByStripeSubscriptionId(subscriptionId: string): Promise<Membership | undefined>;
  getMembershipByAppleTransactionId(transactionId: string): Promise<Membership | undefined>;
}

export class DatabaseStorage implements IStorage {
  /**
   * LEGACY DATA NORMALIZATION - Handle existing payment method records
   * 
   * This method normalizes payment method types from legacy data where
   * 'us_bank_account' might have been stored directly instead of our
   * internal 'bank_account' representation.
   * 
   * @param rawType - The payment method type from database (potentially legacy)
   * @returns Normalized internal payment method type
   */
  private normalizeLegacyPaymentMethodType(rawType: string): InternalPaymentMethodType {
    // Handle legacy us_bank_account -> bank_account conversion
    if (rawType === 'us_bank_account') {
      console.log(`📦 Legacy data normalization: Converting 'us_bank_account' to 'bank_account'`);
      return 'card'; // Default to card since bank accounts are disabled
    }
    
    // Handle direct Stripe type conversion (for robustness)
    if (rawType === 'card' || rawType === 'us_bank_account') {
      return stripeToInternalType(rawType as any);
    }
    
    // Already normalized or unknown type - pass through with validation
    if (rawType === 'card' || rawType === 'bank_account') {
      return rawType as InternalPaymentMethodType;
    }
    
    // Unknown type - log warning and default to card for safety
    console.warn(`⚠️ Unknown payment method type in database: '${rawType}', defaulting to 'card'`);
    return 'card';
  }

  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsersWithEmails(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(sql`email IS NOT NULL AND email != ''`);
  }

  // Bill operations
  async getBills(userId: string): Promise<Bill[]> {
    return await db
      .select()
      .from(bills)
      .where(eq(bills.userId, userId))
      .orderBy(bills.dueDate);
  }

  async createBill(bill: InsertBill): Promise<Bill> {
    const [newBill] = await db.insert(bills).values(bill).returning();
    return newBill;
  }

  async updateBill(id: string, userId: string, updates: Partial<Omit<InsertBill, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<Bill | undefined> {
    const [updatedBill] = await db
      .update(bills)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(bills.id, id), eq(bills.userId, userId)))
      .returning();
    return updatedBill;
  }

  async updateBillStatus(id: string, status: string, providerId?: string): Promise<Bill | undefined> {
    const updateData: any = { status, updatedAt: new Date() };
    if (providerId) {
      updateData.providerId = providerId;
    }
    
    const [updatedBill] = await db
      .update(bills)
      .set(updateData)
      .where(eq(bills.id, id))
      .returning();
    return updatedBill;
  }

  async cancelBill(id: string, userId: string): Promise<Bill | undefined> {
    const [canceledBill] = await db
      .update(bills)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(eq(bills.id, id))
      .returning();
    return canceledBill;
  }

  async getBill(id: string): Promise<Bill | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.id, id));
    return bill;
  }

  async getBillBySourceId(sourceId: string): Promise<Bill | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.sourceId, sourceId));
    return bill;
  }

  async getBillBySourceIdAndUserId(sourceId: string, userId: string): Promise<Bill | undefined> {
    const [bill] = await db.select().from(bills).where(
      and(
        eq(bills.sourceId, sourceId),
        eq(bills.userId, userId)
      )
    );
    return bill;
  }

  async getBillByProviderId(providerId: string): Promise<Bill | undefined> {
    const [bill] = await db.select().from(bills).where(eq(bills.providerId, providerId));
    return bill;
  }

  async findDuplicateBill(userId: string, payeeName: string, amountCents: number, dueDate: Date): Promise<Bill | undefined> {
    // Normalize: compare by lowercase name, exact amount, and same date (within 1 day tolerance)
    const normalizedName = payeeName.toLowerCase().trim().replace(/\s+/g, ' ');
    const dueDateStart = new Date(dueDate);
    dueDateStart.setHours(0, 0, 0, 0);
    const dueDateEnd = new Date(dueDate);
    dueDateEnd.setHours(23, 59, 59, 999);
    
    // Get all bills for user with same amount and similar date
    const potentialDuplicates = await db
      .select()
      .from(bills)
      .where(
        and(
          eq(bills.userId, userId),
          eq(bills.amountCents, amountCents),
          gte(bills.dueDate, dueDateStart),
          lte(bills.dueDate, dueDateEnd)
        )
      );
    
    // Find one with matching normalized name
    for (const bill of potentialDuplicates) {
      const existingNormalizedName = bill.payeeName.toLowerCase().trim().replace(/\s+/g, ' ');
      if (existingNormalizedName === normalizedName) {
        return bill;
      }
    }
    return undefined;
  }

  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string }): Promise<User | undefined> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateUserPhase(userId: string, phase: string): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ phase, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateUserStripeCustomerId(userId: string, customerId: string): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateUserAccountBalance(userId: string, balanceCents: number): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ accountBalance: balanceCents, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  // Atomic balance operations for billing
  async checkUserBalance(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    return user?.accountBalance || 0;
  }

  async deductFromBalance(userId: string, amountCents: number): Promise<{ success: boolean; newBalance: number; message?: string }> {
    try {
      // ATOMIC DEDUCTION: Use conditional UPDATE with balance check in WHERE clause
      // This prevents race conditions and overdrafts by ensuring balance >= amount at UPDATE time
      const results = await db
        .update(users)
        .set({ 
          accountBalance: sql`account_balance - ${amountCents}`,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(users.id, userId),
            sql`account_balance >= ${amountCents}` // CRITICAL: Atomic balance guard
          )
        )
        .returning({ newBalance: users.accountBalance });

      if (results.length === 0) {
        // No rows were updated - either user doesn't exist or insufficient balance
        const currentBalance = await this.checkUserBalance(userId);
        if (currentBalance < amountCents) {
          return { 
            success: false, 
            newBalance: currentBalance,
            message: `Insufficient balance: $${(currentBalance / 100).toFixed(2)} < $${(amountCents / 100).toFixed(2)}`
          };
        } else {
          return { 
            success: false, 
            newBalance: currentBalance,
            message: 'Balance deduction failed - concurrent update detected'
          };
        }
      }

      const [result] = results;
      const newBalance = result.newBalance ?? 0; // Handle potential null value
      console.log(`💸 Balance deducted: $${(amountCents / 100).toFixed(2)}, new balance: $${(newBalance / 100).toFixed(2)}`);
      
      return { 
        success: true, 
        newBalance: newBalance,
        message: `Successfully deducted $${(amountCents / 100).toFixed(2)}`
      };

    } catch (error) {
      console.error('Error deducting from balance:', error);
      const currentBalance = await this.checkUserBalance(userId);
      return { 
        success: false, 
        newBalance: currentBalance,
        message: 'Database error during balance deduction'
      };
    }
  }

  async addToBalance(userId: string, amountCents: number): Promise<{ success: boolean; newBalance: number }> {
    try {
      const [result] = await db
        .update(users)
        .set({ 
          accountBalance: sql`account_balance + ${amountCents}`,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning({ newBalance: users.accountBalance });

      return { 
        success: !!result, 
        newBalance: result?.newBalance || 0 
      };
    } catch (error) {
      console.error('Error adding to balance:', error);
      return { success: false, newBalance: 0 };
    }
  }

  /**
   * IDEMPOTENT BALANCE ADD - Prevents duplicate crediting from same external payment
   * This is the ATOMIC replacement for the old checkTransactionExists + addToBalance pattern
   * 
   * Uses database transaction to ensure atomicity between transaction record creation and balance update
   * 
   * @param userId - User ID to credit
   * @param amountCents - Amount to add (positive)
   * @param externalId - External payment ID (PaymentIntent, Charge ID, etc.)
   * @param transactionData - Transaction details to record
   * @returns Result with success status and balance info
   */
  async addToBalanceIdempotent(
    userId: string, 
    amountCents: number, 
    externalId: string,
    transactionData: Omit<InsertTransaction, 'stripeChargeId' | 'amountCents'>
  ): Promise<{ success: boolean; newBalance: number; alreadyProcessed: boolean; message?: string }> {
    try {
      // First, check if this external ID was already processed (before starting transaction)
      const existingTransaction = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.stripeChargeId, externalId))
        .limit(1);

      if (existingTransaction.length > 0) {
        console.log(`🔍 External ID ${externalId} already processed - idempotent operation detected`);
        
        // Get current balance to return, but don't modify anything
        const currentBalance = await this.checkUserBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          alreadyProcessed: true,
          message: 'Payment already processed - no duplicate crediting'
        };
      }

      // ATOMIC DATABASE TRANSACTION: Ensure transaction record and balance update happen atomically
      const result = await db.transaction(async (tx) => {
        // Step 1: Create transaction record with unique external ID
        const transactionRecord: InsertTransaction = {
          ...transactionData,
          amountCents,
          stripeChargeId: externalId
        };
        
        const [transaction] = await tx.insert(transactions).values(transactionRecord).returning();
        console.log(`💾 Created transaction record for external ID ${externalId} in database transaction`);

        // Step 2: Atomically update user balance in the same transaction
        const [updatedUser] = await tx
          .update(users)
          .set({ 
            accountBalance: sql`account_balance + ${amountCents}`,
            updatedAt: new Date()
          })
          .where(eq(users.id, userId))
          .returning({ newBalance: users.accountBalance });

        if (!updatedUser) {
          throw new Error(`User ${userId} not found during balance update`);
        }

        return {
          transaction,
          newBalance: updatedUser.newBalance ?? 0 // Handle potential null value
        };
      });

      console.log(`💰 Idempotent balance add: $${(amountCents / 100).toFixed(2)}, new balance: $${(result.newBalance / 100).toFixed(2)}`);
      
      return { 
        success: true, 
        newBalance: result.newBalance,
        alreadyProcessed: false,
        message: `Successfully added $${(amountCents / 100).toFixed(2)}`
      };

    } catch (error: any) {
      // Check if this is a unique constraint violation (duplicate external ID) that occurred during the transaction
      if (error.code === '23505' && error.constraint?.includes('unique_stripe_charge_id')) {
        console.log(`🔍 Concurrent processing detected for external ID ${externalId} - idempotent operation`);
        
        // Get current balance to return, but don't modify anything
        const currentBalance = await this.checkUserBalance(userId);
        return {
          success: true,
          newBalance: currentBalance,
          alreadyProcessed: true,
          message: 'Payment already processed by concurrent request - no duplicate crediting'
        };
      }

      console.error('Error in idempotent balance add:', error);
      const currentBalance = await this.checkUserBalance(userId);
      return { 
        success: false, 
        newBalance: currentBalance,
        alreadyProcessed: false,
        message: 'Database error during idempotent balance operation'
      };
    }
  }

  async getUserWithDefaultPaymentMethod(userId: string): Promise<{ user: User; defaultPaymentMethod: PaymentMethodWithBoolean | null }> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const paymentMethods = await this.getPaymentMethods(userId);
    const defaultPaymentMethod = paymentMethods.find(pm => pm.isDefault) || null;

    return { user, defaultPaymentMethod };
  }

  async getPaymentMethods(userId: string): Promise<PaymentMethodWithBoolean[]> {
    const methods = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId))
      .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));
    
    // Convert isDefault integer to boolean, normalize legacy payment method types, and exclude sensitive bank data
    return methods.map(method => ({
      id: method.id,
      userId: method.userId,
      stripePaymentMethodId: method.stripePaymentMethodId,
      // LEGACY DATA NORMALIZATION: Convert any legacy 'us_bank_account' to 'card'
      type: this.normalizeLegacyPaymentMethodType(method.type),
      // Only include credit card fields - bank accounts are disabled
      last4: method.last4,
      brand: method.brand,
      // Bank account fields - null for credit cards
      routingNumber: null,
      accountType: null,
      accountHolderType: null,
      bankName: null,
      isDefault: Boolean(method.isDefault),
      createdAt: method.createdAt,
      updatedAt: method.updatedAt
    }));
  }

  async getPaymentMethod(id: string): Promise<PaymentMethodWithBoolean | undefined> {
    const [method] = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.id, id));
    
    if (!method) return undefined;
    
    // Return safe fields only, normalize legacy types - only credit cards supported
    return {
      id: method.id,
      userId: method.userId,
      stripePaymentMethodId: method.stripePaymentMethodId,
      // LEGACY DATA NORMALIZATION: Convert any legacy 'us_bank_account' to 'card'
      type: this.normalizeLegacyPaymentMethodType(method.type),
      last4: method.last4,
      brand: method.brand,
      // Bank account fields - null for credit cards
      routingNumber: null,
      accountType: null,
      accountHolderType: null,
      bankName: null,
      isDefault: Boolean(method.isDefault),
      createdAt: method.createdAt,
      updatedAt: method.updatedAt
    };
  }

  async deletePaymentMethod(id: string): Promise<void> {
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
  }

  async setDefaultPaymentMethod(userId: string, methodId: string): Promise<void> {
    // First, set all methods for this user to non-default
    await db
      .update(paymentMethods)
      .set({ isDefault: 0 })
      .where(eq(paymentMethods.userId, userId));
    
    // Then set the chosen method as default
    await db
      .update(paymentMethods)
      .set({ isDefault: 1 })
      .where(eq(paymentMethods.id, methodId));
  }

  async createPaymentMethod(method: InsertPaymentMethod): Promise<PaymentMethod> {
    const [newMethod] = await db
      .insert(paymentMethods)
      .values(method)
      .returning();
    return newMethod;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return newTransaction;
  }

  // User account reset functionality
  async clearUserBills(userId: string): Promise<{ deletedCount: number; message: string }> {
    try {
      const userBills = await this.getBills(userId);
      const deletedBills = await db
        .delete(bills)
        .where(eq(bills.userId, userId))
        .returning();
      
      console.log(`🗑️  Cleared ${deletedBills.length} bills for user ${userId}`);
      
      return {
        deletedCount: deletedBills.length,
        message: `Successfully cleared ${deletedBills.length} bills. You can now reimport bills from BillWatch.`
      };
    } catch (error) {
      console.error('Error clearing user bills:', error);
      return {
        deletedCount: 0,
        message: 'Failed to clear bills. Please try again.'
      };
    }
  }

  // Restore canceled bills functionality
  async restoreCanceledBills(userId: string): Promise<{ restoredCount: number; bills: Bill[]; message: string }> {
    try {
      // Find all canceled bills for this user
      const canceledBills = await db
        .select()
        .from(bills)
        .where(
          and(
            eq(bills.userId, userId),
            eq(bills.status, 'CANCELED')
          )
        );
      
      if (canceledBills.length === 0) {
        return {
          restoredCount: 0,
          bills: [],
          message: 'No canceled bills found to restore.'
        };
      }

      // Update all canceled bills to PENDING status
      const restoredBills = await db
        .update(bills)
        .set({ 
          status: 'PENDING',
          updatedAt: new Date() 
        })
        .where(
          and(
            eq(bills.userId, userId),
            eq(bills.status, 'CANCELED')
          )
        )
        .returning();
      
      console.log(`🔄 Restored ${restoredBills.length} canceled bills for user ${userId} to PENDING status`);
      
      return {
        restoredCount: restoredBills.length,
        bills: restoredBills,
        message: `Successfully restored ${restoredBills.length} canceled bills. They will be processed through balance-aware scheduling.`
      };
    } catch (error) {
      console.error('Error restoring canceled bills:', error);
      return {
        restoredCount: 0,
        bills: [],
        message: 'Failed to restore canceled bills. Please try again.'
      };
    }
  }

  async upsertBill(bill: Partial<InsertBill> & { sourceId: string; userId: string }): Promise<Bill> {
    const [existingBill] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.sourceId, bill.sourceId), eq(bills.userId, bill.userId)));

    if (existingBill) {
      const [updatedBill] = await db
        .update(bills)
        .set({ ...bill, updatedAt: new Date() })
        .where(and(eq(bills.sourceId, bill.sourceId), eq(bills.userId, bill.userId)))
        .returning();
      return updatedBill;
    } else {
      const [newBill] = await db
        .insert(bills)
        .values(bill as InsertBill)
        .returning();
      return newBill;
    }
  }

  async cleanupDuplicateBills(userId: string): Promise<{ deletedCount: number; deletedBills: string[] }> {
    // Find all bills for user, group by normalized name + amount + date
    const userBills = await db
      .select()
      .from(bills)
      .where(eq(bills.userId, userId))
      .orderBy(bills.createdAt);

    // Group bills by normalized key
    const groups = new Map<string, Bill[]>();
    for (const bill of userBills) {
      // Skip bills already processed
      if (['SENT', 'DELIVERED', 'CANCELED'].includes(bill.status)) continue;
      
      const normalizedName = bill.payeeName.toLowerCase().trim().replace(/\s+/g, ' ');
      const dateKey = bill.dueDate.toISOString().split('T')[0];
      const key = `${normalizedName}|${bill.amountCents}|${dateKey}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(bill);
    }

    // Find duplicates (groups with more than 1 bill)
    const duplicateIds: string[] = [];
    const deletedNames: string[] = [];
    
    groups.forEach((groupBills) => {
      if (groupBills.length > 1) {
        // Keep the first (oldest), delete the rest
        for (let i = 1; i < groupBills.length; i++) {
          duplicateIds.push(groupBills[i].id);
          deletedNames.push(groupBills[i].payeeName);
        }
      }
    });

    // Delete duplicates
    if (duplicateIds.length > 0) {
      for (const id of duplicateIds) {
        await db.delete(bills).where(eq(bills.id, id));
      }
    }

    return {
      deletedCount: duplicateIds.length,
      deletedBills: deletedNames
    };
  }

  async markBillExternallyPaid(billId: string, userId: string, paymentData: { settlementMethod: string; settledAt: Date; settlementReference?: string }): Promise<Bill | undefined> {
    try {
      // First check if bill exists and belongs to user
      const existingBill = await this.getBill(billId);
      if (!existingBill || existingBill.userId !== userId) {
        return undefined;
      }

      // Check if bill is already externally settled
      if (existingBill.settlementSource === 'external') {
        throw new Error('Bill is already marked as externally paid');
      }

      // Update bill with external settlement data
      const [updatedBill] = await db
        .update(bills)
        .set({
          status: 'DELIVERED',
          settlementSource: 'external',
          settlementMethod: paymentData.settlementMethod as any,
          settledAt: paymentData.settledAt,
          settlementReference: paymentData.settlementReference,
          provider: 'external',
          updatedAt: new Date()
        })
        .where(and(eq(bills.id, billId), eq(bills.userId, userId)))
        .returning();

      if (updatedBill) {
        // Create transaction record for audit trail
        await this.createTransaction({
          userId,
          billId,
          amountCents: updatedBill.amountCents,
          description: `External payment (${paymentData.settlementMethod.toUpperCase()})${paymentData.settlementReference ? ` - ${paymentData.settlementReference}` : ''}`,
          createdAt: paymentData.settledAt
        });

        console.log(`💰 Bill ${billId} marked as externally paid via ${paymentData.settlementMethod}`);
      }

      return updatedBill;
    } catch (error) {
      console.error('Error marking bill as externally paid:', error);
      throw error;
    }
  }

  // Concurrency protection methods
  async checkTransactionExists(stripeChargeId: string): Promise<boolean> {
    const [existingTransaction] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.stripeChargeId, stripeChargeId))
      .limit(1);
    
    return !!existingTransaction;
  }

  async atomicBillStatusTransition(billId: string, fromStatus: string, toStatus: string): Promise<{ success: boolean; bill?: Bill }> {
    try {
      // ATOMIC STATUS TRANSITION: Use conditional UPDATE with status check in WHERE clause
      // This prevents race conditions by ensuring only one request can transition the bill
      const results = await db
        .update(bills)
        .set({ 
          status: toStatus as any,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(bills.id, billId),
            eq(bills.status, fromStatus as any) // CRITICAL: Atomic status guard
          )
        )
        .returning();

      if (results.length === 0) {
        // No rows were updated - either bill doesn't exist or wrong status
        const currentBill = await this.getBill(billId);
        if (!currentBill) {
          return { success: false };
        }
        
        return { 
          success: false,
          bill: currentBill
        };
      }

      const [updatedBill] = results;
      console.log(`🔒 Atomic status transition: ${billId} ${fromStatus} → ${toStatus}`);
      
      return { 
        success: true, 
        bill: updatedBill
      };

    } catch (error) {
      console.error('Error in atomic bill status transition:', error);
      return { success: false };
    }
  }

  async recalculateUserBalance(userId: string): Promise<{ success: boolean; calculatedBalance: number; transactionCount: number }> {
    try {
      // SIMPLE: Only count webhook deposits (the actual money from Stripe)
      const webhookDeposits = await db
        .select({ amountCents: transactions.amountCents })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            sql`${transactions.description} LIKE '%webhook%'`,
            sql`${transactions.amountCents} > 0`
          )
        );

      const depositTotal = webhookDeposits.reduce((sum, t) => sum + (t.amountCents || 0), 0);

      // Get SENT bills (checks we mailed)
      const userBills = await this.getBills(userId);
      const sentBills = userBills.filter(bill => bill.status === 'SENT');

      // Each sent bill costs: bill amount + $1.50 mailing fee
      const MAILING_FEE_CENTS = 150;
      const sentBillsCost = sentBills.reduce((sum, bill) => sum + bill.amountCents + MAILING_FEE_CENTS, 0);

      // Balance = deposits - sent bills cost
      const calculatedBalance = Math.max(0, depositTotal - sentBillsCost);
      
      console.log(`🔄 SIMPLE BALANCE: $${(depositTotal / 100).toFixed(2)} deposits - $${(sentBillsCost / 100).toFixed(2)} sent = $${(calculatedBalance / 100).toFixed(2)}`);

      await db
        .update(users)
        .set({ accountBalance: calculatedBalance, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return { success: true, calculatedBalance, transactionCount: webhookDeposits.length };
    } catch (error) {
      console.error('Error recalculating user balance:', error);
      return { success: false, calculatedBalance: 0, transactionCount: 0 };
    }
  }

  async createPayLink(payLink: InsertPayLink): Promise<PayLink> {
    const [newPayLink] = await db.insert(payLinks).values(payLink).returning();
    return newPayLink;
  }

  async getPayLinkByToken(token: string): Promise<PayLink | undefined> {
    const [payLink] = await db.select().from(payLinks).where(eq(payLinks.token, token));
    return payLink;
  }

  async getPayLinksByUserId(userId: string): Promise<PayLink[]> {
    return await db
      .select()
      .from(payLinks)
      .where(eq(payLinks.userId, userId))
      .orderBy(desc(payLinks.createdAt));
  }

  async updatePayLinkStatus(id: string, status: string, updates?: Partial<PayLink>): Promise<PayLink | undefined> {
    const updateData: any = { status, updatedAt: new Date(), ...updates };
    const [updated] = await db
      .update(payLinks)
      .set(updateData)
      .where(eq(payLinks.id, id))
      .returning();
    return updated;
  }

  async getPayLinkByStripeSessionId(sessionId: string): Promise<PayLink | undefined> {
    const [payLink] = await db.select().from(payLinks).where(eq(payLinks.stripeSessionId, sessionId));
    return payLink;
  }

  async getMembershipByUserId(userId: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, userId));
    return membership;
  }

  async getMembershipByEmail(email: string): Promise<{ membership: Membership; user: User } | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return undefined;
    const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    if (!membership) return undefined;
    return { membership, user };
  }

  async upsertMembership(userId: string, data: Partial<Membership>): Promise<Membership> {
    const existing = await this.getMembershipByUserId(userId);
    if (existing) {
      const [updated] = await db
        .update(memberships)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(memberships.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(memberships)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getMembershipByStripeSubscriptionId(subscriptionId: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships).where(eq(memberships.stripeSubscriptionId, subscriptionId));
    return membership;
  }

  async getMembershipByAppleTransactionId(transactionId: string): Promise<Membership | undefined> {
    const [membership] = await db.select().from(memberships).where(eq(memberships.appleOriginalTransactionId, transactionId));
    return membership;
  }
}

export const storage = new DatabaseStorage();
