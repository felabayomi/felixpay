import { Queue, Worker, Job } from 'bullmq';
import { storage } from '../storage';
import { billWatchService } from './billWatch';
import { processAtomicPayment } from './payment';

interface SendBillJobData {
  billId: string;
  idempotencyKey: string;
}

interface BackgroundImportJobData {
  timestamp: string;
}

// Create job queue - Redis is optional
const redisUrl = process.env.REDIS_URL; // undefined if not set
const connection = redisUrl ? { url: redisUrl } : undefined; // accept both redis:// and rediss://
const hasRedis = !!connection;

export const billSendQueue = hasRedis ? new Queue('bill.send', { connection }) : null;

export const backgroundImportQueue = hasRedis ? new Queue('background.import', { connection }) : null;

// Job processor
// Background import service - imports bills for all users
export const importBillsForUser = async (userEmail: string, userId: string) => {
  try {
    console.log(`🔄 Background importing bills for user: ${userEmail}`);
    
    const billWatchBills = await billWatchService.importDueBills(userEmail);
    console.log(`📊 Found ${billWatchBills.length} bills for ${userEmail}`);
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (const bwBill of billWatchBills) {
      // Skip bills without company name or invalid data
      if (!bwBill.company || !bwBill.amount || !bwBill.dueDate) {
        skippedCount++;
        continue;
      }

      // Check if bill already exists to avoid duplicates
      const existingBill = await storage.getBillBySourceId(bwBill.id);
      if (existingBill) {
        skippedCount++;
        continue;
      }

      const billData = {
        sourceId: bwBill.id,
        payeeName: bwBill.company.trim(),
        addressLine1: 'N/A',
        addressLine2: null,
        city: 'N/A',
        state: 'N/A', 
        postalCode: 'N/A',
        country: 'US',
        amountCents: Math.round(parseFloat(bwBill.amount) * 100),
        dueDate: new Date(bwBill.dueDate),
        memo: bwBill.description || `${bwBill.company} - Account: ${bwBill.accountNumber || 'N/A'}`,
        status: 'PENDING' as const, // CRITICAL FIX: Import as PENDING, not SCHEDULED - balance check required
        provider: process.env.PAYMENT_PROVIDER || 'felixcheck',
        userId,
      };

      const bill = await storage.upsertBill(billData);
      // REMOVED: await scheduleBillSend(bill.id, bill.dueDate); - This bypassed balance check
      // Instead: Bills will be scheduled through balance-aware logic
      importedCount++;
    }
    
    console.log(`✅ Background import complete for ${userEmail}: ${importedCount} imported, ${skippedCount} skipped`);
    return { importedCount, skippedCount };
  } catch (error) {
    console.error(`❌ Background import failed for ${userEmail}:`, error);
    throw error;
  }
};

export const startJobWorker = () => {
  console.log('Starting job workers...');
  
  if (!hasRedis) {
    console.log('⚠️  Redis not available - job processing disabled');
    return;
  }
  
  const billSendWorker = new Worker(
    'bill.send',
    async (job: Job<SendBillJobData>) => {
      const { billId, idempotencyKey } = job.data;
      
      console.log(`Processing bill send job for bill ${billId} with key ${idempotencyKey}`);
      
      try {
        // Fetch bill from database
        const bill = await storage.getBill(billId);
        if (!bill) {
          throw new Error(`Bill ${billId} not found`);
        }

        // Only process if still scheduled
        if (bill.status !== 'SCHEDULED') {
          console.log(`Bill ${billId} status is ${bill.status}, skipping`);
          return;
        }

        // ATOMIC PAYMENT PROCESSING - Fixed billing integrity issues for scheduled payments
        const paymentResult = await processAtomicPayment(bill.userId, bill);
        
        if (!paymentResult.success) {
          if (paymentResult.requiresPayment) {
            console.warn(`⚠️ Scheduled bill ${billId} failed - insufficient balance and payment required: ${paymentResult.message}`);
            await storage.updateBillStatus(billId, 'FAILED');
            throw new Error(`Payment required: ${paymentResult.message}`);
          } else {
            console.error(`❌ Scheduled bill ${billId} failed - payment processing error: ${paymentResult.message}`);
            await storage.updateBillStatus(billId, 'FAILED');
            throw new Error(paymentResult.message);
          }
        }
        
        console.log(`🎉 SCHEDULED PAYMENT SUCCESS - Bill ${billId}, Check ${paymentResult.checkId}, Balance: $${((paymentResult.newBalance || 0) / 100).toFixed(2)}`);
        
      } catch (error) {
        console.error(`Failed to process bill ${billId}:`, error);
        
        // Update bill status to failed after max retries
        if (job.attemptsMade >= (job.opts.attempts || 3)) {
          await storage.updateBillStatus(billId, 'FAILED');
        }
        
        throw error;
      }
    },
    { 
      connection,
      concurrency: 5,
    }
  );

  billSendWorker.on('completed', (job) => {
    console.log(`Bill send job ${job.id} completed successfully`);
  });

  billSendWorker.on('failed', (job, err) => {
    console.error(`Bill send job ${job?.id} failed:`, err);
  });

  // Background import worker
  const backgroundImportWorker = new Worker(
    'background.import',
    async (job: Job<BackgroundImportJobData>) => {
      console.log(`🚀 Starting background import for all users...`);
      
      try {
        const allUsers = await storage.getAllUsersWithEmails();
        console.log(`📋 Found ${allUsers.length} users to import bills for`);
        
        let totalImported = 0;
        let totalSkipped = 0;
        
        for (const user of allUsers) {
          if (user.email) {
            const result = await importBillsForUser(user.email, user.id);
            totalImported += result.importedCount;
            totalSkipped += result.skippedCount;
          }
        }
        
        console.log(`🎉 Background import complete: ${totalImported} bills imported, ${totalSkipped} skipped across ${allUsers.length} users`);
      } catch (error) {
        console.error('❌ Background import failed:', error);
        throw error;
      }
    },
    { 
      connection,
      concurrency: 1, // Run one at a time to avoid overwhelming BillWatch API
    }
  );

  backgroundImportWorker.on('completed', (job) => {
    console.log(`Background import job ${job.id} completed successfully`);
  });

  backgroundImportWorker.on('failed', (job, err) => {
    console.error(`Background import job ${job?.id} failed:`, err);
  });

  return { billSendWorker, backgroundImportWorker };
};

export const scheduleBillSend = async (billId: string, dueDate: Date) => {
  try {
    // Schedule job to run 7 days before due date
    const sendDate = new Date(dueDate);
    sendDate.setDate(sendDate.getDate() - 7);
    
    const delay = Math.max(0, sendDate.getTime() - Date.now());
    const idempotencyKey = `bill:${billId}:${dueDate.toISOString()}`;
    
    if (!billSendQueue) {
      console.warn(`Failed to schedule bill ${billId} - Redis not available`);
      console.log(`Bill ${billId} imported but not scheduled for automatic sending`);
      return;
    }

    await billSendQueue.add(
      'send-bill',
      { billId, idempotencyKey },
      {
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
    
    console.log(`Scheduled bill ${billId} to be sent on ${sendDate.toISOString()}`);
  } catch (error: any) {
    console.warn(`Failed to schedule bill ${billId} - Redis may not be available:`, error.message);
    console.log(`Bill ${billId} imported but not scheduled for automatic sending`);
  }
};

// Schedule background imports to run every 4 hours
export const scheduleBackgroundImports = async () => {
  try {
    if (!backgroundImportQueue) {
      console.log('⚠️  Background imports disabled - Redis not available');
      console.log('💡 Bills can still be imported manually using the "Import Bills" button');
      return;
    }

    await backgroundImportQueue.add(
      'background-import',
      { timestamp: new Date().toISOString() },
      {
        repeat: { 
          every: 4 * 60 * 60 * 1000, // Every 4 hours
        },
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );
    
    console.log(`🔄 Scheduled background imports to run every 4 hours`);
  } catch (error: any) {
    console.warn(`Failed to schedule background imports - Redis may not be available:`, error.message);
  }
};
