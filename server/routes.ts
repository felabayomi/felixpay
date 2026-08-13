import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import { billWatchService } from "./services/billWatch";
import { felixcheckService } from "./services/felixcheck";
import { processAtomicPayment } from "./services/payment";
import { scheduleBillSend, startJobWorker, scheduleBackgroundImports } from "./services/jobs";
import { scheduleWithBalanceCheck } from "./services/billing";
import { insertBillSchema, updateBillSchema, externalPaymentSchema, createPayLinkSchema, isValidStripePaymentMethodType, stripeToInternalType, isValidInternalPaymentMethodType } from "@shared/schema";
import { getStripe, getWebhookSecret, calculateChargeWithFee } from "./lib/stripe";
import { getMercuryService, MercuryConfigurationError, MercuryApiError } from "./services/mercury";
import { z } from "zod";
import { nanoid } from "nanoid";

// Stripe client - lazy initialized in payment service to avoid startup crashes

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Start job worker (optional if Redis is available)
  try {
    startJobWorker();
    console.log('Job worker started successfully');
    
    // Schedule background imports to run every 4 hours
    await scheduleBackgroundImports();
    console.log('Background bill imports scheduled successfully');
  } catch (error: any) {
    console.warn('Failed to start job worker - Redis may not be available:', error.message);
    console.log('Bills can still be imported and managed manually');
  }

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await storage.getUser(userId);
      
      // If user doesn't exist, create them using claims from the authenticated session
      if (!user) {
        console.log(`Creating missing user record for authenticated user: ${userId}`);
        const claims = req.user.claims;
        await storage.upsertUser({
          id: claims.sub,
          email: claims.email,
          firstName: claims.first_name,
          lastName: claims.last_name,
          profileImageUrl: claims.profile_image_url,
        });
        // Re-fetch the user after creation
        user = await storage.getUser(userId);
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch('/api/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName } = req.body;

      if (!firstName && !lastName) {
        return res.status(400).json({ message: "Please provide a first name or last name" });
      }

      const updatedUser = await storage.updateUserProfile(userId, {
        firstName: firstName?.trim() || undefined,
        lastName: lastName?.trim() || undefined,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ============================================
  // MEMBERSHIP ROUTES - Central Membership Hub
  // ============================================

  const VALID_TIERS = ['control', 'momentum', 'legacy'] as const;
  const VALID_CADENCES = ['monthly', 'annual'] as const;
  const ALL_TOOLS = ['FinanceWatch', 'ExpenseWatch', 'BillWatch', 'IncomeLift', 'DIY Debt', 'SavingsPro', 'SteadyVest', 'WealthWatch', 'Felix Pay', 'Felix CheckBook'];

  function isAdminEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return adminEmails.includes(email.toLowerCase());
  }

  function getMembershipPriceId(tier: string, cadence: string): string | null {
    const key = `MEMBERSHIP_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
    return process.env[key] || null;
  }

  function getTierFromPriceId(priceId: string): { tier: string; cadence: string } | null {
    for (const tier of VALID_TIERS) {
      for (const cadence of VALID_CADENCES) {
        const key = `MEMBERSHIP_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
        if (process.env[key] === priceId) {
          return { tier, cadence };
        }
      }
    }
    return null;
  }

  app.get('/api/membership/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const userEmail = user?.email || req.user.claims?.email;

      if (isAdminEmail(userEmail)) {
        const membership = await storage.getMembershipByUserId(userId);
        return res.json({
          status: membership?.status || 'active',
          active: true,
          tier: membership?.tier || 'legacy',
          billingCadence: membership?.billingCadence || null,
          currentPeriodEnd: membership?.currentPeriodEnd || null,
          cancelAtPeriodEnd: false,
          trialEnd: null,
          isAdmin: true,
        });
      }

      const membership = await storage.getMembershipByUserId(userId);
      if (!membership) {
        return res.json({ status: 'inactive', active: false, tier: null });
      }
      const isActive = (membership.status === 'active' || membership.status === 'trialing') && 
        membership.currentPeriodEnd && new Date(membership.currentPeriodEnd) > new Date();
      res.json({
        status: membership.status,
        active: isActive,
        tier: isActive ? membership.tier : null,
        billingCadence: membership.billingCadence,
        currentPeriodEnd: membership.currentPeriodEnd,
        cancelAtPeriodEnd: !!membership.cancelAtPeriodEnd,
        trialEnd: membership.trialEnd,
      });
    } catch (error) {
      console.error("Error fetching membership status:", error);
      res.status(500).json({ message: "Failed to fetch membership status" });
    }
  });

  app.post('/api/membership/checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const { tier, cadence } = req.body;
      if (!tier || !VALID_TIERS.includes(tier)) {
        return res.status(400).json({ message: "Invalid tier. Must be control, momentum, or legacy." });
      }
      if (!cadence || !VALID_CADENCES.includes(cadence)) {
        return res.status(400).json({ message: "Invalid cadence. Must be monthly or annual." });
      }

      const priceId = getMembershipPriceId(tier, cadence);
      if (!priceId) {
        return res.status(500).json({ message: `Pricing not configured for ${tier} ${cadence}. Please set MEMBERSHIP_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()} environment variable.` });
      }

      const stripe = getStripe();
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserStripeCustomerId(userId, customerId);
      }

      const existing = await storage.getMembershipByUserId(userId);
      if (existing && (existing.status === 'active' || existing.status === 'trialing') && existing.currentPeriodEnd && new Date(existing.currentPeriodEnd) > new Date()) {
        return res.status(400).json({ message: "You already have an active membership. Use the billing portal to change plans." });
      }

      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      const sessionParams: any = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/membership?membership=success`,
        cancel_url: `${baseUrl}/membership?membership=canceled`,
        metadata: {
          type: 'membership',
          userId: user.id,
          tier,
          cadence,
        },
      };

      if (tier === 'momentum') {
        sessionParams.subscription_data = {
          trial_period_days: 14,
          metadata: { type: 'membership', userId: user.id, tier, cadence },
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams);
      res.json({ checkoutUrl: session.url });
    } catch (error: any) {
      console.error("Error creating membership checkout:", error);
      res.status(500).json({ message: error.message || "Failed to create checkout session" });
    }
  });

  app.post('/api/membership/portal', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing account found" });
      }

      const stripe = getStripe();
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/membership`,
      });

      res.json({ portalUrl: portalSession.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: error.message || "Failed to create portal session" });
    }
  });

  app.get('/api/membership/verify', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'];
      const expectedKey = process.env.MEMBERSHIP_VERIFY_API_KEY;
      
      if (!expectedKey) {
        return res.status(500).json({ message: "Membership verification not configured" });
      }
      if (!apiKey || apiKey !== expectedKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const email = req.query.email as string;
      const tool = req.query.tool as string;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (isAdminEmail(email)) {
        return res.json({
          active: true,
          status: 'active',
          tier: 'legacy',
          expiresAt: null,
          allowedTools: ALL_TOOLS,
          hasAccess: true,
          isAdmin: true,
        });
      }

      const result = await storage.getMembershipByEmail(email);
      if (!result) {
        return res.json({ active: false, status: 'no_account', tier: null, allowedTools: [], hasAccess: false, expiresAt: null });
      }

      const { membership } = result;
      const isActive = (membership.status === 'active' || membership.status === 'trialing') &&
        membership.currentPeriodEnd && new Date(membership.currentPeriodEnd) > new Date();

      const { TIER_TOOLS } = await import('@shared/schema');
      const allowedTools = isActive && membership.tier ? (TIER_TOOLS[membership.tier] || []) : [];
      const hasAccess = tool ? allowedTools.includes(tool) : isActive;

      res.json({
        active: isActive,
        status: membership.status,
        tier: isActive ? membership.tier : null,
        expiresAt: membership.currentPeriodEnd,
        allowedTools,
        hasAccess,
      });
    } catch (error) {
      console.error("Error verifying membership:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // ============================================
  // APPLE IN-APP PURCHASE ENDPOINTS
  // ============================================

  app.post('/api/membership/apple-purchase', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      const expectedKey = process.env.MEMBERSHIP_VERIFY_API_KEY;
      if (!apiKey || !expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const { email, tier, cadence, originalTransactionId, productId, expiresAt } = req.body;

      if (!email || !tier || !originalTransactionId) {
        return res.status(400).json({ 
          message: "Missing required fields",
          required: { email: "string", tier: "control|momentum|legacy", originalTransactionId: "string" },
          optional: { cadence: "monthly|annual (default: monthly)", productId: "string", expiresAt: "ISO date string" }
        });
      }

      if (!['control', 'momentum', 'legacy'].includes(tier)) {
        return res.status(400).json({ message: "Invalid tier. Must be: control, momentum, or legacy" });
      }

      const validCadence = cadence || 'monthly';
      if (!['monthly', 'annual'].includes(validCadence)) {
        return res.status(400).json({ message: "Invalid cadence. Must be: monthly or annual" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ 
          message: "User not found. The user must sign in to Felix Pay at least once before an Apple purchase can be linked.",
          email 
        });
      }

      const existingApple = await storage.getMembershipByAppleTransactionId(originalTransactionId);
      if (existingApple && existingApple.userId !== user.id) {
        return res.status(409).json({ message: "This Apple transaction is already linked to a different account" });
      }

      const periodEnd = expiresAt ? new Date(expiresAt) : new Date(Date.now() + (validCadence === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);

      const membership = await storage.upsertMembership(user.id, {
        tier: tier as any,
        billingCadence: validCadence,
        status: 'active' as any,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: 0,
        purchaseSource: 'apple',
        appleOriginalTransactionId: originalTransactionId,
        appleProductId: productId || null,
      });

      console.log(`🍎 Apple membership activated: user=${user.id}, email=${email}, tier=${tier}, txn=${originalTransactionId}`);

      res.json({
        success: true,
        membership: {
          tier: membership.tier,
          status: membership.status,
          billingCadence: membership.billingCadence,
          currentPeriodEnd: membership.currentPeriodEnd,
          purchaseSource: membership.purchaseSource,
        }
      });
    } catch (error) {
      console.error("Error processing Apple purchase:", error);
      res.status(500).json({ message: "Failed to process Apple purchase" });
    }
  });

  app.post('/api/membership/apple-status', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      const expectedKey = process.env.MEMBERSHIP_VERIFY_API_KEY;
      if (!apiKey || !expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const { email, originalTransactionId, status, expiresAt } = req.body;

      if (!originalTransactionId || !status) {
        return res.status(400).json({ 
          message: "Missing required fields",
          required: { originalTransactionId: "string", status: "active|canceled|expired|billing_retry" },
          optional: { email: "string", expiresAt: "ISO date string" }
        });
      }

      const membership = await storage.getMembershipByAppleTransactionId(originalTransactionId);
      if (!membership) {
        return res.status(404).json({ message: "No membership found for this Apple transaction" });
      }

      const statusMap: Record<string, string> = {
        active: 'active',
        canceled: 'canceled',
        expired: 'canceled',
        billing_retry: 'past_due',
      };
      const mappedStatus = statusMap[status] || 'inactive';

      const updates: any = {
        status: mappedStatus,
        updatedAt: new Date(),
      };

      if (status === 'expired') {
        updates.cancelAtPeriodEnd = 1;
        updates.currentPeriodEnd = expiresAt ? new Date(expiresAt) : new Date();
      } else if (status === 'canceled') {
        updates.cancelAtPeriodEnd = 1;
        if (expiresAt) {
          updates.currentPeriodEnd = new Date(expiresAt);
        }
      } else if (status === 'active') {
        updates.cancelAtPeriodEnd = 0;
        if (expiresAt) {
          updates.currentPeriodEnd = new Date(expiresAt);
        }
      } else if (expiresAt) {
        updates.currentPeriodEnd = new Date(expiresAt);
      }

      const updated = await storage.upsertMembership(membership.userId, updates);

      console.log(`🍎 Apple membership status update: user=${membership.userId}, status=${status}, txn=${originalTransactionId}`);

      res.json({
        success: true,
        membership: {
          tier: updated.tier,
          status: updated.status,
          currentPeriodEnd: updated.currentPeriodEnd,
          cancelAtPeriodEnd: !!updated.cancelAtPeriodEnd,
        }
      });
    } catch (error) {
      console.error("Error updating Apple membership status:", error);
      res.status(500).json({ message: "Failed to update membership status" });
    }
  });

  app.get('/api/user/phase', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ phase: user.phase || null });
    } catch (error) {
      console.error("Error fetching user phase:", error);
      res.status(500).json({ message: "Failed to fetch phase" });
    }
  });

  app.post('/api/user/phase', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { phase } = req.body;
      const validPhases = ['STABILIZE', 'ELIMINATE', 'BUILD'];
      if (!phase || !validPhases.includes(phase.toUpperCase())) {
        return res.status(400).json({ message: "Invalid phase. Must be STABILIZE, ELIMINATE, or BUILD." });
      }
      const updated = await storage.updateUserPhase(userId, phase.toUpperCase());
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ phase: updated.phase });
    } catch (error) {
      console.error("Error updating user phase:", error);
      res.status(500).json({ message: "Failed to update phase" });
    }
  });

  app.post('/api/membership/set-phase', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      const expectedKey = process.env.MEMBERSHIP_VERIFY_API_KEY;
      if (!apiKey || !expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ message: "Invalid API key" });
      }
      const { email, phase } = req.body;
      const validPhases = ['STABILIZE', 'ELIMINATE', 'BUILD'];
      if (!email || !phase || !validPhases.includes(phase.toUpperCase())) {
        return res.status(400).json({
          message: "Invalid request",
          required: { email: "string", phase: "STABILIZE | ELIMINATE | BUILD" }
        });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ message: "User not found" });
      const updated = await storage.updateUserPhase(user.id, phase.toUpperCase());
      res.json({
        success: true,
        email,
        phase: updated?.phase,
        redirectUrl: `https://felixpay.net/membership?recommended=${phase.toUpperCase() === 'STABILIZE' ? 'control' : phase.toUpperCase() === 'ELIMINATE' ? 'momentum' : 'legacy'}`
      });
    } catch (error) {
      console.error("Error setting user phase via API:", error);
      res.status(500).json({ message: "Failed to set phase" });
    }
  });

  // Bill routes
  app.get('/api/bills', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const bills = await storage.getBills(userId);
      res.json(bills);
    } catch (error) {
      console.error("Error fetching bills:", error);
      res.status(500).json({ message: "Failed to fetch bills" });
    }
  });

  // Fix orphaned bills (bills with provider_id but wrong status)
  app.post('/api/bills/fix-orphaned', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`🔧 Fixing orphaned bills for user: ${userId}`);
      
      // Find bills that have a provider_id (check was sent) but status is still PENDING
      const bills = await storage.getBills(userId);
      const orphanedBills = bills.filter(bill => 
        bill.providerId && 
        bill.providerId.startsWith('chk_') && 
        bill.status === 'PENDING'
      );
      
      let fixedCount = 0;
      const fixedBills: string[] = [];
      
      for (const bill of orphanedBills) {
        await storage.updateBillStatus(bill.id, 'SENT', bill.providerId!);
        fixedCount++;
        fixedBills.push(`${bill.payeeName} ($${(bill.amountCents / 100).toFixed(2)})`);
        console.log(`✅ Fixed orphaned bill: ${bill.id} (${bill.payeeName}) - marked as SENT`);
      }
      
      res.json({
        message: fixedCount > 0 
          ? `Fixed ${fixedCount} orphaned bills`
          : 'No orphaned bills found',
        fixedCount,
        fixedBills
      });
    } catch (error: any) {
      console.error('Error fixing orphaned bills:', error);
      res.status(500).json({ message: "Failed to fix orphaned bills" });
    }
  });

  // Cleanup duplicate bills endpoint
  app.post('/api/bills/cleanup-duplicates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`🧹 Manual duplicate cleanup requested for user: ${userId}`);
      
      const result = await storage.cleanupDuplicateBills(userId);
      
      console.log(`🧹 Cleaned up ${result.deletedCount} duplicate bills`);
      
      res.json({
        message: result.deletedCount > 0 
          ? `Removed ${result.deletedCount} duplicate bills`
          : 'No duplicates found',
        deletedCount: result.deletedCount,
        deletedBills: result.deletedBills
      });
    } catch (error: any) {
      console.error('Error cleaning up duplicates:', error);
      res.status(500).json({ message: "Failed to cleanup duplicates" });
    }
  });

  app.post('/api/bills/import', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      
      console.log(`Import request for user: ${userId}, email: ${userEmail}`);
      
      // First, cleanup any existing duplicates before importing
      const cleanupResult = await storage.cleanupDuplicateBills(userId);
      if (cleanupResult.deletedCount > 0) {
        console.log(`🧹 Pre-import cleanup: Removed ${cleanupResult.deletedCount} duplicate bills`);
      }
      
      if (!userEmail) {
        return res.status(400).json({ message: "User email not found in session" });
      }
      
      // Import bills from BillWatch for this specific user
      console.log(`🔍 STARTING BILL IMPORT FOR USER`);
      const billWatchBills = await billWatchService.importDueBills(userEmail);
      console.log(`📊 BILLWATCH RETURNED ${billWatchBills.length} BILLS`);
      
      const importedBills = [];
      const skippedBills = [];
      
      for (const bwBill of billWatchBills) {
        // Skip bills without company name or invalid data
        if (!bwBill.company || !bwBill.amount || !bwBill.dueDate) {
          console.log(`⚠️  SKIPPING BILL - Missing required data:`, {
            id: bwBill.id,
            company: bwBill.company,
            amount: bwBill.amount,
            dueDate: bwBill.dueDate
          });
          skippedBills.push(bwBill);
          continue;
        }

        // Skip bills that are already paid
        if (bwBill.paidAmount || bwBill.paidDate) {
          console.log(`💰 SKIPPING PAID BILL`);
          skippedBills.push(bwBill);
          continue;
        }

        // Import bills due within 60 days from now or overdue by no more than 30 days
        // Extended window to catch more bills and let user manage them
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDate = new Date(bwBill.dueDate);
        const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const daysUntilDue = Math.floor((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue < -30 || daysUntilDue > 60) {
          console.log(`📅 SKIPPING BILL - Outside -30 to +60 day window (due in ${daysUntilDue} days)`);
          skippedBills.push(bwBill);
          continue;
        }

        // Parse date first since we need it for duplicate detection
        // Handle both "2026-02-01" and "2026-02-01T00:00:00.000Z" formats
        let parsedDueDate: Date;
        try {
          const dateStr = bwBill.dueDate.split('T')[0]; // Gets "2026-02-01" from either format
          const [year, month, day] = dateStr.split('-').map(Number);
          if (isNaN(year) || isNaN(month) || isNaN(day)) {
            throw new Error('Invalid date components');
          }
          parsedDueDate = new Date(year, month - 1, day, 12, 0, 0); // noon local time
          
          if (isNaN(parsedDueDate.getTime())) {
            throw new Error('Invalid date');
          }
        } catch (dateError) {
          console.log(`⚠️ SKIPPING BILL - Invalid date format: ${bwBill.dueDate}`, dateError);
          skippedBills.push(bwBill);
          continue;
        }

        const amountCents = Math.round(parseFloat(bwBill.amount) * 100);

        // Check if bill already exists by sourceId
        let existingBill = await storage.getBillBySourceIdAndUserId(bwBill.id, userId);
        
        // Also check for duplicates by name/amount/date (handles BillWatch sending same bill with different IDs)
        if (!existingBill) {
          existingBill = await storage.findDuplicateBill(userId, bwBill.company, amountCents, parsedDueDate);
          if (existingBill) {
            console.log(`🔄 FOUND DUPLICATE BY NAME/AMOUNT/DATE - ${bwBill.company} (existing sourceId: ${existingBill.sourceId}, new: ${bwBill.id})`);
          }
        }

        if (existingBill) {
          // Skip if bill is already being processed (SENT, DELIVERED, or externally paid)
          if (['SENT', 'DELIVERED'].includes(existingBill.status) || existingBill.settlementSource === 'external') {
            console.log(`🔄 SKIPPING - Bill ${bwBill.company} already processed (status: ${existingBill.status})`);
            skippedBills.push(bwBill);
            continue;
          }
          console.log(`🔄 UPDATING EXISTING BILL - ${bwBill.company} (status: ${existingBill.status})`);
          // Will update with latest data but preserve status
        }

        const billData: any = {
          // Use existing bill's sourceId if updating a duplicate, otherwise use the new sourceId
          sourceId: existingBill?.sourceId || bwBill.id,
          payeeName: bwBill.company.trim(),
          addressLine1: 'N/A', // BillWatch doesn't provide address details
          addressLine2: null,
          city: 'N/A',
          state: 'N/A', 
          postalCode: 'N/A',
          country: 'US',
          amountCents,
          dueDate: parsedDueDate,
          memo: bwBill.description || `${bwBill.company} - Account: ${bwBill.accountNumber || 'N/A'}`,
          provider: process.env.PAYMENT_PROVIDER || 'felixcheck',
          userId,
        };
        
        // Only set status to PENDING for new bills, preserve existing status for updates
        if (!existingBill) {
          billData.status = 'PENDING';
        } else {
          // Skip adding to importedBills since we're just updating, already tracked
          skippedBills.push(bwBill);
          continue;
        }

        const bill = await storage.upsertBill(billData);
        
        // Don't schedule immediately - will be handled by balance-aware scheduling below
        importedBills.push(bill);
      }

      // Apply balance-aware scheduling to all imported bills
      if (importedBills.length > 0) {
        console.log(`🧮 Applying balance-aware scheduling to ${importedBills.length} imported bills`);
        const schedulingResult = await scheduleWithBalanceCheck(storage, userId, importedBills);
        
        const baseMessage = skippedBills.length > 0 
          ? `Imported ${importedBills.length} bills from BillWatch. ${skippedBills.length} duplicates/invalid bills skipped.`
          : `Successfully imported ${importedBills.length} bills from BillWatch.`;
        
        const balanceMessage = schedulingResult.scheduledBills.length > 0 
          ? ` ${schedulingResult.scheduledBills.length} bills scheduled for payment, ${schedulingResult.pendingBills.length} pending due to balance.`
          : ` All bills are pending payment due to insufficient balance.`;

        res.json({ 
          message: baseMessage + balanceMessage,
          imported: importedBills.length,
          scheduled: schedulingResult.scheduledBills.length,
          pending: schedulingResult.pendingBills.length,
          skipped: skippedBills.length,
          totalCostCents: schedulingResult.totalCostCents,
          availableBalanceCents: schedulingResult.availableBalanceCents,
          bills: importedBills 
        });
      } else {
        const message = skippedBills.length > 0 
          ? `No new bills to import. ${skippedBills.length} duplicates/invalid bills skipped.`
          : `No new bills to import from BillWatch.`;

        res.json({ 
          message,
          imported: 0,
          scheduled: 0,
          pending: 0,
          skipped: skippedBills.length,
          totalCostCents: 0,
          availableBalanceCents: 0,
          bills: [] 
        });
      }
    } catch (error) {
      console.error("Error importing bills:", error);
      res.status(500).json({ message: "Failed to import bills" });
    }
  });

  app.post('/api/bills', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate only client-facing fields (omit server-populated fields)
      const clientSchema = insertBillSchema.omit({ 
        userId: true, 
        provider: true, 
        sourceId: true, 
        providerId: true, 
        status: true 
      });
      const validatedClient = clientSchema.parse(req.body);
      
      // Merge validated client data with server fields (create as PENDING initially)
      const billData = {
        ...validatedClient,
        userId,
        provider: process.env.PAYMENT_PROVIDER || 'felixcheck',
        status: 'PENDING' as const, // Create as pending, then apply balance-aware scheduling
      };

      const bill = await storage.createBill(billData);
      
      // Apply balance-aware scheduling to the new bill
      console.log(`🧮 Applying balance-aware scheduling to manually created bill ${bill.id}`);
      const schedulingResult = await scheduleWithBalanceCheck(storage, userId, [bill]);
      
      const isScheduled = schedulingResult.scheduledBills.includes(bill.id);
      const message = isScheduled 
        ? "Bill created and scheduled for payment."
        : "Bill created but pending payment due to insufficient balance.";

      res.json({ 
        ...bill, 
        status: isScheduled ? 'SCHEDULED' : 'PENDING',
        message,
        schedulingResult: {
          scheduled: schedulingResult.scheduledBills.length,
          pending: schedulingResult.pendingBills.length,
          totalCostCents: schedulingResult.totalCostCents,
          availableBalanceCents: schedulingResult.availableBalanceCents
        }
      });
    } catch (error) {
      console.error("Error creating bill:", error);
      
      // Improved error handling with Zod error details
      if (error instanceof Error && error.name === 'ZodError') {
        const zodError = error as any; // Cast to access Zod-specific properties
        console.error('Zod validation failed:', zodError.errors);
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: zodError.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to create bill" });
    }
  });

  app.put('/api/bills/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const billId = req.params.id;
      
      // First check if the bill exists and belongs to the user
      const existingBill = await storage.getBill(billId);
      if (!existingBill || existingBill.userId !== userId) {
        return res.status(404).json({ message: "Bill not found" });
      }

      // Only allow updates to bills in certain statuses
      if (!['PENDING', 'SCHEDULED', 'FAILED'].includes(existingBill.status)) {
        return res.status(400).json({ 
          message: "Can only edit bills that are pending, scheduled, or failed" 
        });
      }
      
      // Validate the request body using the update schema
      const validatedUpdates = updateBillSchema.parse(req.body);
      
      // The updateBillSchema already expects amountCents, no conversion needed here
      
      // Update the bill
      const updatedBill = await storage.updateBill(billId, userId, validatedUpdates);
      
      if (!updatedBill) {
        return res.status(500).json({ message: "Failed to update bill" });
      }
      
      res.json({ 
        ...updatedBill, 
        message: "Bill updated successfully" 
      });
    } catch (error) {
      console.error("Error updating bill:", error);
      
      // Handle Zod validation errors
      if (error instanceof Error && error.name === 'ZodError') {
        const zodError = error as any;
        console.error('Zod validation failed:', zodError.errors);
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: zodError.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to update bill" });
    }
  });

  app.post('/api/bills/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const billId = req.params.id;
      
      const bill = await storage.getBill(billId);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ message: "Bill not found" });
      }
      
      if (bill.status !== 'SCHEDULED' && bill.status !== 'PENDING' && bill.status !== 'FAILED') {
        return res.status(400).json({ message: "Can only cancel bills that are scheduled, pending, or failed" });
      }
      
      const canceledBill = await storage.cancelBill(billId, userId);
      res.json(canceledBill);
    } catch (error) {
      console.error("Error canceling bill:", error);
      res.status(500).json({ message: "Failed to cancel bill" });
    }
  });

  app.post('/api/bills/bulk-cancel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { billIds } = req.body;
      
      if (!Array.isArray(billIds) || billIds.length === 0) {
        return res.status(400).json({ message: "billIds must be a non-empty array" });
      }
      
      let canceledCount = 0;
      const errors: string[] = [];
      
      for (const billId of billIds) {
        try {
          const bill = await storage.getBill(billId);
          if (!bill || bill.userId !== userId) {
            errors.push(`Bill ${billId} not found`);
            continue;
          }
          if (bill.status !== 'SCHEDULED' && bill.status !== 'PENDING' && bill.status !== 'FAILED') {
            errors.push(`Bill ${bill.payeeName} cannot be canceled (status: ${bill.status})`);
            continue;
          }
          await storage.cancelBill(billId, userId);
          canceledCount++;
        } catch (err) {
          errors.push(`Failed to cancel bill ${billId}`);
        }
      }
      
      res.json({ canceledCount, errors, total: billIds.length });
    } catch (error) {
      console.error("Error bulk canceling bills:", error);
      res.status(500).json({ message: "Failed to bulk cancel bills" });
    }
  });

  app.post('/api/bills/bulk-external-pay', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { billIds, settlementMethod, settledAt, settlementReference } = req.body;
      
      if (!Array.isArray(billIds) || billIds.length === 0) {
        return res.status(400).json({ message: "billIds must be a non-empty array" });
      }
      
      if (billIds.length > 200) {
        return res.status(400).json({ message: "Cannot process more than 200 bills at once" });
      }
      
      const normalizedSettledAt = settledAt ? new Date(settledAt) : new Date();
      const validMethod = settlementMethod || 'other';
      
      console.log(`📦 Bulk external pay request: ${billIds.length} bills, method: ${validMethod}`);
      
      let markedCount = 0;
      const errors: string[] = [];
      
      for (const billId of billIds) {
        try {
          const bill = await storage.getBill(billId);
          if (!bill || bill.userId !== userId) {
            errors.push(`Bill ${billId} not found`);
            continue;
          }
          if (bill.status === 'DELIVERED' && bill.settlementSource === 'external') {
            errors.push(`Bill ${bill.payeeName} is already externally paid`);
            continue;
          }
          if (bill.status !== 'SCHEDULED' && bill.status !== 'PENDING' && bill.status !== 'FAILED' && bill.status !== 'CANCELED') {
            errors.push(`Bill ${bill.payeeName} cannot be marked externally paid (status: ${bill.status})`);
            continue;
          }
          await storage.markBillExternallyPaid(billId, userId, {
            settlementMethod: validMethod,
            settledAt: normalizedSettledAt,
            settlementReference: settlementReference || ''
          });
          markedCount++;
          console.log(`  ✅ Marked bill ${bill.payeeName} as externally paid`);
        } catch (err) {
          console.error(`  ❌ Failed to mark bill ${billId}:`, err);
          errors.push(`Failed to mark bill ${billId} as externally paid`);
        }
      }
      
      console.log(`📦 Bulk external pay result: ${markedCount}/${billIds.length} marked, ${errors.length} errors`);
      res.json({ markedCount, errors, total: billIds.length });
    } catch (error) {
      console.error("Error bulk marking bills as externally paid:", error);
      res.status(500).json({ message: "Failed to bulk mark bills as externally paid" });
    }
  });

  app.post('/api/bills/:id/external-pay', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const billId = req.params.id;
      
      // Validate request body
      const validatedData = externalPaymentSchema.parse(req.body);
      
      const bill = await storage.getBill(billId);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ message: "Bill not found" });
      }
      
      if (bill.status === 'DELIVERED' && bill.settlementSource === 'external') {
        return res.status(409).json({ message: "Bill is already marked as externally paid" });
      }
      
      if (bill.status !== 'SCHEDULED' && bill.status !== 'PENDING' && bill.status !== 'FAILED' && bill.status !== 'CANCELED') {
        return res.status(400).json({ message: `Bill cannot be marked as externally paid - current status: ${bill.status}` });
      }
      
      const updatedBill = await storage.markBillExternallyPaid(billId, userId, {
        settlementMethod: validatedData.settlementMethod,
        settledAt: validatedData.settledAt,
        settlementReference: validatedData.settlementReference
      });
      
      if (!updatedBill) {
        return res.status(500).json({ message: "Failed to mark bill as externally paid" });
      }
      
      res.json({ 
        message: "Bill marked as externally paid",
        bill: updatedBill
      });
      
    } catch (error) {
      console.error("Error marking bill as externally paid:", error);
      
      // Handle Zod validation errors
      if (error instanceof Error && error.name === 'ZodError') {
        const zodError = error as any;
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: zodError.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to mark bill as externally paid" });
    }
  });

  // Mark external bill as delivered
  app.post('/api/bills/:id/mark-delivered', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const billId = req.params.id;
      
      const bill = await storage.getBill(billId);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ message: "Bill not found" });
      }
      
      // Only external bills can be marked as delivered
      if (bill.settlementSource !== 'external') {
        return res.status(400).json({ message: "Only external bills can be marked as delivered" });
      }
      
      // If bill is already delivered and external, that's fine - just return success
      if (bill.status === 'DELIVERED' && bill.settlementSource === 'external') {
        return res.json({ 
          message: "Bill already marked as delivered",
          bill: bill
        });
      }
      
      // Don't allow if already delivered via other means
      if (bill.status === 'DELIVERED') {
        return res.status(409).json({ message: "Bill is already marked as delivered" });
      }
      
      // Update bill status to DELIVERED
      await storage.updateBillStatus(billId, 'DELIVERED');
      
      const updatedBill = await storage.getBill(billId);
      
      res.json({ 
        message: "Bill marked as delivered",
        bill: updatedBill
      });
      
    } catch (error) {
      console.error("Error marking bill as delivered:", error);
      res.status(500).json({ message: "Failed to mark bill as delivered" });
    }
  });

  // Refresh bill statuses from Felixcheck.com
  app.post('/api/bills/refresh-statuses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all bills that have a providerId (sent to Felixcheck.com)
      const allBills = await storage.getBills(userId);
      const billsToRefresh = allBills.filter(
        bill => bill.providerId && ['SCHEDULED', 'PROCESSING', 'SENT'].includes(bill.status)
      );
      
      console.log(`🔄 Refreshing status for ${billsToRefresh.length} bills from Felixcheck.com`);
      
      let updatedCount = 0;
      const updates: { billId: string; oldStatus: string; newStatus: string }[] = [];
      
      // Note: Felixcheck sends status updates via webhooks to /api/webhooks/custom-check
      // This endpoint now just returns the current count for UI feedback
      // Status updates happen automatically when Felixcheck calls our webhook
      console.log(`📊 Found ${billsToRefresh.length} bills with provider IDs (status updates come via Felixcheck webhooks)`);
      updatedCount = 0; // Status updates now happen via webhooks, not polling
      
      res.json({
        message: `Refreshed ${billsToRefresh.length} bills, ${updatedCount} updated`,
        updatedCount,
        updates
      });
      
    } catch (error) {
      console.error("Error refreshing bill statuses:", error);
      res.status(500).json({ message: "Failed to refresh bill statuses" });
    }
  });

  app.post('/api/bills/:id/pay-now', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const billId = req.params.id;
      
      const bill = await storage.getBill(billId);
      if (!bill || bill.userId !== userId) {
        return res.status(404).json({ message: "Bill not found" });
      }

      if (bill.status !== 'SCHEDULED' && bill.status !== 'PENDING' && bill.status !== 'FAILED') {
        return res.status(400).json({ message: `Bill cannot be paid - current status: ${bill.status}` });
      }

      // ATOMIC PAYMENT PROCESSING - Fixed billing integrity issues
      const paymentResult = await processAtomicPayment(userId, bill);
      
      if (!paymentResult.success) {
        if (paymentResult.requiresPayment) {
          return res.status(402).json({ 
            message: paymentResult.message,
            requiresPayment: true,
            type: "insufficient_balance"
          });
        } else {
          // Update bill status to failed for non-payment errors
          await storage.updateBillStatus(billId, 'FAILED');
          return res.status(500).json({ message: paymentResult.message });
        }
      }

      // Get the updated bill with SENT status
      const updatedBill = await storage.getBill(billId);
      
      res.json({ 
        message: "Payment processed successfully",
        bill: updatedBill,
        checkId: paymentResult.checkId,
        newBalance: paymentResult.newBalance,
        charged: paymentResult.chargeId ? true : false
      });
      
    } catch (error) {
      console.error("Error processing manual payment:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });


  // ============ PAY LINKS ============

  app.post('/api/pay-links', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validated = createPayLinkSchema.parse(req.body);

      const token = nanoid(16);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (validated.expiresInDays || 7));

      const payLink = await storage.createPayLink({
        token,
        userId,
        amountCents: validated.amountCents,
        message: validated.message || null,
        status: 'active',
        expiresAt,
      });

      const user = await storage.getUser(userId);
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;

      res.json({
        ...payLink,
        payUrl: `${baseUrl}/pay/${token}`,
        userName: user?.firstName || user?.email || 'Felix Pay User',
      });
    } catch (error: any) {
      console.error("Error creating pay link:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create pay link" });
    }
  });

  app.get('/api/pay-links', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const links = await storage.getPayLinksByUserId(userId);
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      res.json(links.map(link => ({
        ...link,
        payUrl: `${baseUrl}/pay/${link.token}`,
      })));
    } catch (error) {
      console.error("Error fetching pay links:", error);
      res.status(500).json({ message: "Failed to fetch pay links" });
    }
  });

  app.post('/api/pay-links/:id/cancel', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const linkId = req.params.id;
      const links = await storage.getPayLinksByUserId(userId);
      const link = links.find(l => l.id === linkId);
      if (!link) {
        return res.status(404).json({ message: "Pay link not found" });
      }
      if (link.status !== 'active') {
        return res.status(400).json({ message: "Can only cancel active pay links" });
      }
      const updated = await storage.updatePayLinkStatus(linkId, 'canceled');
      res.json(updated);
    } catch (error) {
      console.error("Error canceling pay link:", error);
      res.status(500).json({ message: "Failed to cancel pay link" });
    }
  });

  app.get('/api/pay-links/public/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const payLink = await storage.getPayLinkByToken(token);

      if (!payLink) {
        return res.status(404).json({ message: "Pay link not found" });
      }

      if (payLink.status === 'paid') {
        const user = await storage.getUser(payLink.userId);
        return res.json({
          token: payLink.token,
          amountCents: payLink.amountCents,
          message: payLink.message,
          status: payLink.status,
          expiresAt: payLink.expiresAt,
          userName: user?.firstName || 'A Felix Pay user',
          isPaid: true,
        });
      }

      if (payLink.status === 'canceled') {
        return res.status(410).json({ message: "This pay link has been canceled" });
      }

      if (payLink.status === 'expired' || (payLink.expiresAt && new Date(payLink.expiresAt) < new Date())) {
        if (payLink.status !== 'expired') {
          await storage.updatePayLinkStatus(payLink.id, 'expired');
        }
        return res.status(410).json({ message: "This pay link has expired" });
      }

      const user = await storage.getUser(payLink.userId);
      res.json({
        token: payLink.token,
        amountCents: payLink.amountCents,
        message: payLink.message,
        status: payLink.status,
        expiresAt: payLink.expiresAt,
        userName: user?.firstName || 'A Felix Pay user',
        isPaid: false,
      });
    } catch (error) {
      console.error("Error fetching public pay link:", error);
      res.status(500).json({ message: "Failed to fetch pay link" });
    }
  });

  app.post('/api/pay-links/public/:token/checkout', async (req, res) => {
    try {
      const { token } = req.params;
      const payLink = await storage.getPayLinkByToken(token);

      if (!payLink) {
        return res.status(404).json({ message: "Pay link not found" });
      }

      if (payLink.status !== 'active') {
        return res.status(400).json({ message: "This pay link is no longer active" });
      }

      if (payLink.expiresAt && new Date(payLink.expiresAt) < new Date()) {
        await storage.updatePayLinkStatus(payLink.id, 'expired');
        return res.status(410).json({ message: "This pay link has expired" });
      }

      const user = await storage.getUser(payLink.userId);
      const stripe = getStripe();
      const feeBreakdown = calculateChargeWithFee(payLink.amountCents);
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Payment for ${user?.firstName || 'Felix Pay User'}`,
              description: payLink.message || `Fund Felix Pay balance for ${user?.firstName || 'a user'}`,
            },
            unit_amount: feeBreakdown.chargeAmountCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/pay/${token}?success=true`,
        cancel_url: `${baseUrl}/pay/${token}?canceled=true`,
        metadata: {
          type: 'pay_link',
          payLinkId: payLink.id,
          payLinkToken: token,
          recipientUserId: payLink.userId,
          requestedAmountCents: payLink.amountCents.toString(),
          processingFeeCents: feeBreakdown.feeAmountCents.toString(),
        },
      });

      await storage.updatePayLinkStatus(payLink.id, 'active', {
        stripeSessionId: session.id,
      } as any);

      res.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("Error creating checkout session for pay link:", error);
      res.status(500).json({ message: "Failed to create payment session" });
    }
  });

  // ============ STRIPE WEBHOOK HANDLERS ============

  // Stripe webhook handler functions
  async function handlePaymentIntentProcessing(paymentIntent: any) {
    try {
      console.log(`💳 Payment processing: ${paymentIntent.id} for $${(paymentIntent.amount / 100).toFixed(2)}`);
      
      // For ACH payments, this means the payment is being processed (3-5 business days)
      // We don't credit the balance yet, but we can track the processing state
      if (paymentIntent.metadata?.type === 'manual_balance_topup') {
        const userId = paymentIntent.metadata.userId;
        console.log(`🔄 ACH payment processing for user ${userId}, amount: $${(paymentIntent.amount / 100).toFixed(2)}`);
        
        // TODO: Could store pending payment record for user visibility
        // For now, just log the processing state
      }
    } catch (error) {
      console.error("Error handling payment_intent.processing:", error);
    }
  }

  async function handlePaymentIntentSucceeded(paymentIntent: any) {
    try {
      console.log(`✅ Payment succeeded: ${paymentIntent.id} for $${(paymentIntent.amount / 100).toFixed(2)}`);
      
      // Credit user balance for manual top-ups (idempotent)
      if (paymentIntent.metadata?.type === 'manual_balance_topup') {
        const userId = paymentIntent.metadata.userId;
        const amountCents = paymentIntent.amount;
        
        console.log(`💰 Crediting balance via webhook: User ${userId}, Amount: $${(amountCents / 100).toFixed(2)}`);
        
        // Use the PaymentIntent ID directly as idempotency key (matches immediate credit)
        const addResult = await storage.addToBalanceIdempotent(
          userId,
          amountCents,
          paymentIntent.id,
          {
            userId,
            description: `Balance top-up via webhook: $${(amountCents / 100).toFixed(2)} (${paymentIntent.id})`
          }
        );
        
        if (addResult.success) {
          console.log(`✅ Balance credited successfully via webhook for user ${userId}`);
          
          // DEPOSIT NOTIFICATION: Log deposit for admin visibility
          // This can be expanded to send email notifications in the future
          console.log(`💰 ========== DEPOSIT NOTIFICATION ==========`);
          console.log(`   📧 User ID: ${userId}`);
          console.log(`   💵 Amount: $${(amountCents / 100).toFixed(2)}`);
          console.log(`   🔑 PaymentIntent: ${paymentIntent.id}`);
          console.log(`   📅 Timestamp: ${new Date().toISOString()}`);
          console.log(`   ✅ Status: Funds successfully added to account`);
          console.log(`💰 ==========================================`);
        } else {
          console.log(`ℹ️ Balance already credited for PaymentIntent ${paymentIntent.id} (idempotent)`);
        }
      }
    } catch (error) {
      console.error("Error handling payment_intent.succeeded:", error);
    }
  }

  async function handleCheckoutSessionCompleted(session: any) {
    try {
      console.log(`🔗 Checkout session completed: ${session.id}`);

      if (session.metadata?.type === 'membership') {
        await handleMembershipCheckoutCompleted(session);
        return;
      }

      if (session.metadata?.type !== 'pay_link') {
        console.log(`ℹ️ Non-pay-link checkout session, skipping: ${session.id}`);
        return;
      }

      const payLinkId = session.metadata.payLinkId;
      const recipientUserId = session.metadata.recipientUserId;
      const requestedAmountCents = parseInt(session.metadata.requestedAmountCents);

      console.log(`🔗 Pay link payment: Link ${payLinkId}, Recipient ${recipientUserId}, Amount $${(requestedAmountCents / 100).toFixed(2)}`);

      const payLink = await storage.getPayLinkByStripeSessionId(session.id);
      if (!payLink) {
        const linkById = await storage.getPayLinkByToken(session.metadata.payLinkToken);
        if (linkById && linkById.status === 'paid') {
          console.log(`ℹ️ Pay link ${payLinkId} already marked as paid (idempotent)`);
          return;
        }
      }

      if (payLink && payLink.status === 'paid') {
        console.log(`ℹ️ Pay link ${payLinkId} already paid (idempotent)`);
        return;
      }

      const customerEmail = session.customer_details?.email || null;
      const customerName = session.customer_details?.name || null;

      await storage.updatePayLinkStatus(payLinkId, 'paid', {
        paidAt: new Date(),
        payerEmail: customerEmail,
        payerName: customerName,
        stripePaymentIntentId: session.payment_intent,
      } as any);

      const externalId = `paylink_${session.payment_intent || session.id}`;
      const addResult = await storage.addToBalanceIdempotent(
        recipientUserId,
        requestedAmountCents,
        externalId,
        {
          userId: recipientUserId,
          description: `Pay link deposit from ${customerName || customerEmail || 'someone'}: $${(requestedAmountCents / 100).toFixed(2)}`,
        }
      );

      if (addResult.success && !addResult.alreadyProcessed) {
        console.log(`💰 ========== PAY LINK DEPOSIT ==========`);
        console.log(`   👤 Recipient: ${recipientUserId}`);
        console.log(`   💵 Amount: $${(requestedAmountCents / 100).toFixed(2)}`);
        console.log(`   🔗 Pay Link: ${payLinkId}`);
        console.log(`   💳 Payer: ${customerName || customerEmail || 'Anonymous'}`);
        console.log(`   💰 New Balance: $${(addResult.newBalance / 100).toFixed(2)}`);
        console.log(`   📅 Timestamp: ${new Date().toISOString()}`);
        console.log(`💰 ========================================`);
      } else {
        console.log(`ℹ️ Pay link deposit already processed for ${externalId}`);
      }
    } catch (error) {
      console.error("Error handling checkout.session.completed:", error);
    }
  }

  async function handlePaymentIntentFailed(paymentIntent: any) {
    try {
      console.log(`❌ Payment failed: ${paymentIntent.id} - ${paymentIntent.last_payment_error?.message || 'Unknown error'}`);
      
      if (paymentIntent.metadata?.type === 'manual_balance_topup') {
        const userId = paymentIntent.metadata.userId;
        console.log(`💔 ACH payment failed for user ${userId}: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`);
        
        // For failed payments, we don't need to reverse anything since we only credit on success
        // But we could notify the user or log for customer service
      }
    } catch (error) {
      console.error("Error handling payment_intent.payment_failed:", error);
    }
  }

  async function handleMembershipCheckoutCompleted(session: any) {
    try {
      const userId = session.metadata?.userId;
      const tier = session.metadata?.tier || 'control';
      const cadence = session.metadata?.cadence || 'monthly';
      const subscriptionId = session.subscription;
      
      if (!userId || !subscriptionId) {
        console.error("Missing userId or subscriptionId in membership checkout session");
        return;
      }

      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const mapStatus = (s: string) => {
        if (s === 'active') return 'active';
        if (s === 'trialing') return 'trialing';
        return 'inactive';
      };

      const sub = subscription as any;
      await storage.upsertMembership(userId, {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: sub.items?.data?.[0]?.price?.id || null,
        tier: tier as any,
        billingCadence: cadence,
        status: mapStatus(sub.status) as any,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end ? 1 : 0,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      });

      console.log(`🎉 Membership activated: user=${userId}, tier=${tier}, cadence=${cadence}, sub=${subscriptionId}`);
    } catch (error) {
      console.error("Error handling membership checkout:", error);
    }
  }

  async function handleSubscriptionEvent(subscription: any) {
    try {
      const customerId = subscription.customer;
      const status = subscription.status;
      
      console.log(`📋 Subscription event: ${subscription.id}, status: ${status}`);

      const existing = await storage.getMembershipByStripeSubscriptionId(subscription.id);
      if (!existing) {
        console.log(`ℹ️ No membership found for subscription ${subscription.id}, might be non-membership sub`);
        return;
      }

      const priceId = subscription.items?.data?.[0]?.price?.id;
      const tierInfo = priceId ? getTierFromPriceId(priceId) : null;

      const mapStatus = (s: string) => {
        if (s === 'active') return 'active';
        if (s === 'trialing') return 'trialing';
        if (s === 'canceled') return 'canceled';
        if (s === 'past_due') return 'past_due';
        return 'inactive';
      };

      await storage.upsertMembership(existing.userId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId || existing.stripePriceId,
        ...(tierInfo && { tier: tierInfo.tier as any, billingCadence: tierInfo.cadence }),
        status: mapStatus(status) as any,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end ? 1 : 0,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      });

      console.log(`📋 Membership updated: user=${existing.userId}, status=${status}${tierInfo ? `, tier=${tierInfo.tier}` : ''}`);
    } catch (error) {
      console.error("Error handling subscription event:", error);
    }
  }

  // Stripe webhook endpoint for payment processing events
  app.post('/api/stripe/webhook', async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      
      // SECURITY: Verify webhook signature is present
      if (!signature) {
        console.error("Stripe webhook: Missing signature header");
        return res.status(400).json({ message: "Missing signature" });
      }
      
      // Use centralized Stripe configuration with proper error handling
      const stripe = getStripe();
      const webhookSecret = getWebhookSecret(); // Required for security (default: true)
      
      // SECURITY FIX: Use raw body buffer for signature verification
      // req.body is now a Buffer thanks to express.raw() middleware
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      } catch (err: any) {
        console.error("Stripe webhook signature verification failed:", err.message);
        return res.status(400).json({ message: "Invalid signature" });
      }
      // Only process webhook if signature verification succeeded
      console.log(`🔔 Stripe webhook verified and received: ${event.type}`);
      console.log(`🔐 Webhook signature verification: SUCCESS`);
      
      switch (event.type) {
        case 'payment_intent.processing':
          await handlePaymentIntentProcessing(event.data.object);
          break;
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(event.data.object);
          break;
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object);
          break;
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await handleSubscriptionEvent(event.data.object);
          break;
        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
      }
      
      res.json({ received: true });
    } catch (error: any) {
      // PRODUCTION ERROR HANDLING: Detailed webhook error logging
      console.error("🚨 Critical error processing Stripe webhook:", {
        error: error.message,
        stack: error.stack,
        eventType: error.event?.type || 'unknown',
        timestamp: new Date().toISOString(),
        webhookId: error.event?.id || 'unknown'
      });
      
      // Return appropriate error based on error type
      if (error.name === 'StripeConfigurationError') {
        res.status(500).json({ message: "Payment service configuration error" });
      } else {
        res.status(500).json({ message: "Failed to process webhook" });
      }
    }
  });

  // Custom Check Service Webhook - For your own check printing/mailing service
  // Your service calls this endpoint to update bill status in Felix Pay
  // Example: POST https://felixpay.net/api/webhooks/custom-check
  // Body: { "bill_id": "abc123", "status": "SENT", "api_key": "your-secret-key" }
  app.post('/api/webhooks/custom-check', async (req, res) => {
    try {
      const { bill_id, status, api_key, provider_id, tracking_number, message } = req.body;
      
      // Verify API key (optional but recommended)
      const expectedApiKey = process.env.CUSTOM_CHECK_API_KEY;
      if (expectedApiKey && api_key !== expectedApiKey) {
        console.log('❌ Custom check webhook: Invalid API key');
        return res.status(401).json({ message: "Invalid API key" });
      }
      
      // Validate required fields
      if (!bill_id || !status) {
        return res.status(400).json({ 
          message: "Missing required fields. Need: bill_id, status",
          example: {
            bill_id: "your-bill-id",
            status: "SENT",
            provider_id: "optional-check-id",
            tracking_number: "optional-tracking",
            message: "optional-message"
          }
        });
      }
      
      // Map status from your service to Felix Pay status
      const statusMap: { [key: string]: string } = {
        'PENDING': 'PENDING',
        'SCHEDULED': 'SCHEDULED',
        'PROCESSING': 'PROCESSING',
        'PRINTED': 'PROCESSING',
        'MAILED': 'SENT',
        'SENT': 'SENT',
        'IN_TRANSIT': 'SENT',
        'DELIVERED': 'DELIVERED',
        'FAILED': 'FAILED',
        'RETURNED': 'FAILED',
        'CANCELED': 'CANCELED',
        'CANCELLED': 'CANCELED'
      };
      
      const mappedStatus = statusMap[status.toUpperCase()] || status.toUpperCase();
      
      // Find and update the bill
      const bill = await storage.getBill(bill_id);
      
      if (!bill) {
        // Try to find by provider_id if bill_id doesn't match
        const billByProvider = provider_id ? await storage.getBillByProviderId(provider_id) : null;
        if (!billByProvider) {
          return res.status(404).json({ message: "Bill not found" });
        }
        await storage.updateBillStatus(billByProvider.id, mappedStatus, provider_id);
        console.log(`✅ Custom check webhook: Updated bill ${billByProvider.id} to ${mappedStatus}`);
        return res.json({ 
          success: true,
          message: `Bill status updated to ${mappedStatus}`,
          bill_id: billByProvider.id
        });
      }
      
      // Update bill status and optionally set provider_id
      await storage.updateBillStatus(bill.id, mappedStatus, provider_id || bill.providerId);
      console.log(`✅ Custom check webhook: Updated bill ${bill.id} to ${mappedStatus}`);
      
      res.json({ 
        success: true,
        message: `Bill status updated to ${mappedStatus}`,
        bill_id: bill.id
      });
    } catch (error) {
      console.error("Error processing custom check webhook:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // Legacy webhook route (redirects to Felixcheck webhook)
  // Note: Primary webhook endpoint is /api/webhooks/custom-check for Felixcheck
  app.post('/api/webhooks/provider', async (req, res) => {
    try {
      const { check_id, status } = req.body;
      
      if (!check_id || !status) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Find bill by provider ID and update status
      const bill = await storage.getBillByProviderId(check_id);
      
      if (bill) {
        const newStatus = felixcheckService.mapWebhookStatusToBillStatus(status);
        await storage.updateBillStatus(bill.id, newStatus);
        console.log(`Updated bill ${bill.id} status to ${newStatus} via legacy webhook`);
      }
      
      res.json({ message: "Webhook processed successfully" });
    } catch (error) {
      console.error("Error processing provider webhook:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // Billing routes
  // Get Stripe account info (for admin visibility)
  app.get('/api/stripe/account-info', isAuthenticated, async (req: any, res) => {
    try {
      const stripe = getStripe();
      const account = await stripe.accounts.retrieve();
      
      res.json({
        id: account.id,
        email: account.email || null,
        businessName: account.business_profile?.name || null,
        country: account.country || null,
        isLive: !process.env.TESTING_STRIPE_SECRET_KEY || !!process.env.STRIPE_SECRET_KEY,
        mode: process.env.STRIPE_SECRET_KEY ? 'production' : 'testing'
      });
    } catch (error: any) {
      console.error("Error fetching Stripe account info:", error);
      res.status(500).json({ message: "Failed to fetch Stripe account info", error: error.message });
    }
  });

  // Calculate Stripe fees for add funds (for UI display)
  app.get('/api/calculate-fees', isAuthenticated, async (req: any, res) => {
    try {
      const amountCents = parseInt(req.query.amountCents as string);
      
      if (isNaN(amountCents) || amountCents < 50) {
        return res.status(400).json({ message: "Invalid amount. Minimum is $0.50 (50 cents)" });
      }
      
      const feeBreakdown = calculateChargeWithFee(amountCents);
      
      res.json({
        requestedAmountCents: amountCents,
        processingFeeCents: feeBreakdown.feeAmountCents,
        totalChargeCents: feeBreakdown.chargeAmountCents,
        netAmountCents: feeBreakdown.netAmountCents
      });
    } catch (error) {
      console.error("Error calculating fees:", error);
      res.status(500).json({ message: "Failed to calculate fees" });
    }
  });

  app.get('/api/user/billing', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      // Return current balance and profile info from database
      res.json({
        accountBalance: user?.accountBalance || 0,
        firstName: user?.firstName || null,
        lastName: user?.lastName || null,
      });
    } catch (error) {
      console.error("Error fetching user billing info:", error);
      res.status(500).json({ message: "Failed to fetch billing info" });
    }
  });

  app.post('/api/user/balance/recalculate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      console.log(`🔄 Balance recalculation requested for user: ${userId}`);
      
      const result = await storage.recalculateUserBalance(userId);
      
      if (result.success) {
        res.json({
          success: true,
          message: `Balance recalculated from ${result.transactionCount} transactions`,
          newBalance: result.calculatedBalance,
          transactionCount: result.transactionCount
        });
      } else {
        res.status(500).json({ message: "Failed to recalculate balance" });
      }
    } catch (error) {
      console.error("Error recalculating balance:", error);
      res.status(500).json({ message: "Failed to recalculate balance" });
    }
  });

  app.get('/api/payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const paymentMethods = await storage.getPaymentMethods(userId);
      res.json(paymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.get('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const transactions = await storage.getTransactions(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.delete('/api/payment-methods/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const methodId = req.params.id;
      
      const method = await storage.getPaymentMethod(methodId);
      if (!method || method.userId !== userId) {
        return res.status(404).json({ message: "Payment method not found" });
      }
      
      // Detach from Stripe using centralized configuration
      const stripe = getStripe();
      await stripe.paymentMethods.detach(method.stripePaymentMethodId);
      
      // Remove from database
      await storage.deletePaymentMethod(methodId);
      
      res.json({ message: "Payment method removed" });
    } catch (error) {
      console.error("Error removing payment method:", error);
      res.status(500).json({ message: "Failed to remove payment method" });
    }
  });

  app.put('/api/payment-methods/:id/default', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const methodId = req.params.id;
      
      await storage.setDefaultPaymentMethod(userId, methodId);
      
      res.json({ message: "Default payment method updated" });
    } catch (error) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ message: "Failed to update default payment method" });
    }
  });

  // Add funds to account balance
  const addFundsSchema = z.object({
    amountCents: z.number().int().min(50, "Minimum amount is $0.50"),
    paymentMethodId: z.string().min(1, "Payment method ID is required"),
    idempotencyToken: z.string().min(1, "Idempotency token is required")
  });

  app.post('/api/add-funds', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body with Zod
      const validation = addFundsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: validation.error.issues.map(issue => issue.message)
        });
      }
      
      const { amountCents, paymentMethodId, idempotencyToken } = validation.data;
      
      // Calculate fees: charge total amount so business receives the requested amount
      const feeBreakdown = calculateChargeWithFee(amountCents);
      const chargeAmountCents = feeBreakdown.chargeAmountCents;
      const processingFeeCents = feeBreakdown.feeAmountCents;
      
      console.log(`💰 Add funds request: $${(amountCents / 100).toFixed(2)} requested, charging $${(chargeAmountCents / 100).toFixed(2)} (includes $${(processingFeeCents / 100).toFixed(2)} processing fee)`);
      
      // Get user and verify payment method ownership
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: "User has no Stripe customer ID" });
      }
      
      const paymentMethod = await storage.getPaymentMethod(paymentMethodId);
      if (!paymentMethod || paymentMethod.userId !== userId) {
        return res.status(404).json({ message: "Payment method not found" });
      }

      // Allow both credit cards and bank accounts for add-funds - use helper function for validation
      if (!isValidInternalPaymentMethodType(paymentMethod.type)) {
        return res.status(400).json({ 
          message: "Only credit cards and bank accounts are supported for adding funds." 
        });
      }
      
      // Initialize Stripe using centralized configuration
      const stripe = getStripe();
      
      // Use client-provided idempotency token directly for Stripe
      const stripeIdempotencyKey = `manual-topup-${idempotencyToken}`;
      
      // Charge the total amount (requested + processing fee)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: chargeAmountCents,
        currency: 'usd',
        customer: user.stripeCustomerId,
        payment_method: paymentMethod.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          userId,
          type: 'manual_balance_topup',
          paymentMethodId,
          requestedAmountCents: amountCents.toString(),
          processingFeeCents: processingFeeCents.toString()
        },
        description: `Balance top-up: $${(amountCents / 100).toFixed(2)} + $${(processingFeeCents / 100).toFixed(2)} processing fee`
      }, {
        idempotencyKey: stripeIdempotencyKey
      });
      
      // Handle different payment statuses properly for ALL payment types
      if (paymentIntent.status === 'succeeded') {
        // HOTFIX: Credit card payments NO LONGER credited immediately to prevent double-crediting
        // Balance will be credited ONLY via webhook when payment_intent.succeeded fires
        console.log(`🚨 HOTFIX ACTIVE: Credit card payment succeeded immediately: ${paymentIntent.id}`);
        console.log(`🔧 DOUBLE-CREDITING FIX: Balance will be credited ONLY via webhook, not immediately`);
        console.log(`💳 Credit card payment processing: ${paymentIntent.id} - balance will be credited via webhook`);
        
        res.json({
          success: true,
          amountCents,
          chargeAmountCents,
          processingFeeCents,
          paymentIntentId: paymentIntent.id,
          status: 'succeeded',
          message: `Payment processed successfully! $${(amountCents / 100).toFixed(2)} will be added to your balance. (Total charged: $${(chargeAmountCents / 100).toFixed(2)} including $${(processingFeeCents / 100).toFixed(2)} processing fee)`
        });
        
      } else if (paymentIntent.status === 'processing') {
        // ACH payments: processing status, balance will be credited via webhook
        console.log(`🏦 ACH payment processing: ${paymentIntent.id} - balance will be credited when payment settles`);
        
        res.json({
          success: true,
          amountCents,
          chargeAmountCents,
          processingFeeCents,
          paymentIntentId: paymentIntent.id,
          status: 'processing',
          message: `ACH payment initiated! $${(amountCents / 100).toFixed(2)} will be added to your balance when settled. (Total: $${(chargeAmountCents / 100).toFixed(2)} including $${(processingFeeCents / 100).toFixed(2)} fee)`
        });
        
      } else {
        // Failed or other unexpected status
        return res.status(400).json({ 
          message: `Payment failed: ${paymentIntent.status}`,
          details: paymentIntent.last_payment_error?.message || 'Unknown error'
        });
      }
      
    } catch (error: any) {
      console.error("Error adding funds:", error);
      
      // Handle specific Stripe errors
      if (error.type === 'StripeCardError') {
        return res.status(400).json({ 
          message: error.message || 'Card payment failed'
        });
      }
      
      res.status(500).json({ message: "Failed to add funds. Please try again." });
    }
  });

  app.post('/api/payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { paymentMethodId } = req.body;
      
      console.log(`🔍 Adding payment method for user ${userId}: ${paymentMethodId}`);
      
      // Validate input
      if (!paymentMethodId) {
        console.error(`❌ Missing paymentMethodId in request body`);
        return res.status(400).json({ message: "Payment method ID is required" });
      }
      
      // CRITICAL FIX: Handle case where authenticated user doesn't exist in database yet
      let user = await storage.getUser(userId);
      
      // If user doesn't exist, create them using claims from the authenticated session
      if (!user) {
        console.log(`Creating missing user record for authenticated user: ${userId}`);
        const claims = req.user.claims;
        await storage.upsertUser({
          id: claims.sub,
          email: claims.email,
          firstName: claims.first_name,
          lastName: claims.last_name,
          profileImageUrl: claims.profile_image_url,
        });
        // Re-fetch the user after creation
        user = await storage.getUser(userId);
        
        if (!user) {
          console.error(`Failed to create/fetch user record for ${userId}`);
          return res.status(500).json({ message: "Unable to create user account" });
        }
      }
      
      let customerId = user.stripeCustomerId;
      
      // Create Stripe customer if doesn't exist using centralized configuration
      const stripe = getStripe();
      
      if (!customerId) {
        console.log(`🆕 Creating new Stripe customer for user ${userId}`);
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId }
        });
        customerId = customer.id;
        await storage.updateUserStripeCustomerId(userId, customerId);
        console.log(`✅ Created new customer: ${customerId}`);
      } else {
        // CRITICAL FIX: Verify customer exists in current Stripe mode (live vs test)
        console.log(`🔍 Verifying existing customer ${customerId} exists in current Stripe mode`);
        try {
          await stripe.customers.retrieve(customerId);
          console.log(`✅ Customer ${customerId} verified successfully`);
        } catch (customerError: any) {
          if (customerError.code === 'resource_missing') {
            console.log(`🔄 Customer ${customerId} doesn't exist in current Stripe mode, creating new one`);
            const customer = await stripe.customers.create({
              email: user.email || undefined,
              metadata: { userId }
            });
            customerId = customer.id;
            await storage.updateUserStripeCustomerId(userId, customerId);
            console.log(`✅ Created replacement customer: ${customerId}`);
          } else {
            throw customerError; // Re-throw if it's not a missing customer error
          }
        }
      }
      
      // Attach payment method to customer
      console.log(`🔗 Attaching payment method ${paymentMethodId} to customer ${customerId}`);
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId
        });
        console.log(`✅ Payment method attached successfully`);
      } catch (attachError: any) {
        console.error(`❌ Failed to attach payment method:`, {
          paymentMethodId,
          customerId,
          error: attachError.message,
          code: attachError.code,
          type: attachError.type,
          statusCode: attachError.statusCode
        });
        return res.status(400).json({ 
          message: `Failed to attach payment method: ${attachError.message}`,
          details: attachError.code || 'unknown_error'
        });
      }
      
      // Get payment method details
      console.log(`📋 Retrieving payment method details for ${paymentMethodId}`);
      let paymentMethod;
      try {
        paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        console.log(`✅ Payment method retrieved: type=${paymentMethod.type}`);
      } catch (retrieveError: any) {
        console.error(`❌ Failed to retrieve payment method:`, {
          paymentMethodId,
          error: retrieveError.message,
          code: retrieveError.code,
          type: retrieveError.type,
          statusCode: retrieveError.statusCode
        });
        return res.status(400).json({ 
          message: `Failed to retrieve payment method: ${retrieveError.message}`,
          details: retrieveError.code || 'unknown_error'
        });
      }
      
      // Check if this is the user's first payment method
      const existingMethods = await storage.getPaymentMethods(userId);
      const isFirstMethod = existingMethods.length === 0;
      
      // Validate payment method type using helper function
      if (!isValidStripePaymentMethodType(paymentMethod.type)) {
        return res.status(400).json({ 
          message: "Only credit cards and bank accounts are supported." 
        });
      }

      // Convert Stripe type to internal type and extract payment method fields
      const internalType = stripeToInternalType(paymentMethod.type);
      let methodData;

      if (internalType === 'card') {
        methodData = {
          userId,
          stripePaymentMethodId: paymentMethod.id,
          type: 'card' as const,
          last4: paymentMethod.card?.last4 || '',
          brand: paymentMethod.card?.brand || '',
          isDefault: isFirstMethod ? 1 : 0 // First method is default
        };
      } else if (internalType === 'bank_account') {
        // Handle us_bank_account from Stripe, convert to our internal bank_account type
        // Note: Bank account support is currently disabled (only card fields are saved)
        methodData = {
          userId,
          stripePaymentMethodId: paymentMethod.id,
          type: 'card' as const, // Save as card type since bank_account not supported in current schema
          last4: paymentMethod.us_bank_account?.last4 || '',
          brand: 'Bank Account', // Use brand field to indicate it's a bank account
          isDefault: isFirstMethod ? 1 : 0 // First method is default
        };
      } else {
        return res.status(400).json({ message: "Unsupported payment method type" });
      }
      
      // Save to database
      const savedMethod = await storage.createPaymentMethod(methodData);
      
      res.json(savedMethod);
    } catch (error: any) {
      console.error("❌ Error adding payment method:", {
        error: error.message,
        code: error.code,
        type: error.type,
        statusCode: error.statusCode,
        stack: error.stack
      });
      
      // Handle specific Stripe errors with proper status codes
      if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
        return res.status(400).json({ 
          message: error.message || 'Payment method error',
          details: error.code || 'unknown_error'
        });
      }
      
      res.status(500).json({ message: "Failed to add payment method" });
    }
  });

  // Sync existing Stripe balance
  const syncStripeBalance = async (userId: string, customerId: string) => {
    try {
      // Use centralized Stripe configuration for balance sync
      const stripe = getStripe();
      
      // Get recent payments made to this Stripe account
      const charges = await stripe.charges.list({
        customer: customerId,
        limit: 100,
        created: {
          gte: Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60) // Last 90 days
        }
      });
      
      // Calculate total successful charges (in cents)
      const totalPaidCents = charges.data
        .filter(charge => charge.paid && charge.status === 'succeeded')
        .reduce((sum, charge) => sum + charge.amount, 0);
      
      // Get current user balance
      const user = await storage.getUser(userId);
      const currentBalance = user?.accountBalance || 0;
      
      // If Stripe balance is higher than current balance, update it
      if (totalPaidCents > currentBalance) {
        await storage.updateUserAccountBalance(userId, totalPaidCents);
        
        // Record the balance sync as a transaction
        await storage.createTransaction({
          userId,
          amountCents: totalPaidCents - currentBalance,
          description: 'Account balance sync from Stripe payments',
          stripeChargeId: null
        });
      }
    } catch (error) {
      console.error('Error syncing Stripe balance:', error);
    }
  };

  // User account reset endpoint
  app.post('/api/user/reset-bills', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`🔄 Resetting bills for user ${userId}`);
      const result = await storage.clearUserBills(userId);
      
      res.json({ 
        success: true,
        deletedCount: result.deletedCount,
        message: result.message
      });
    } catch (error) {
      console.error("Error resetting user bills:", error);
      res.status(500).json({ 
        success: false,
        deletedCount: 0,
        message: "Failed to reset bills" 
      });
    }
  });

  // EMERGENCY FIX: Apply 7-day rule and balance checking to existing bills
  app.post('/api/bills/emergency-rebalance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`🚨 EMERGENCY REBALANCE for user ${userId}`);
      
      // Get user balance
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      const userBalance = user.accountBalance || 0;
      console.log(`💰 User balance: $${(userBalance / 100).toFixed(2)}`);
      
      // Get all bills for user
      const allBills = await storage.getBills(userId);
      console.log(`📊 Found ${allBills.length} total bills`);
      
      const now = Date.now();
      let changedCount = 0;
      
      // Apply 7-day rule: Move bills >7 days away to PENDING
      for (const bill of allBills) {
        if (bill.status === 'SCHEDULED') {
          const daysUntilDue = Math.ceil((new Date(bill.dueDate).getTime() - now) / (1000 * 60 * 60 * 24));
          
          if (daysUntilDue > 7) {
            await storage.updateBillStatus(bill.id, 'PENDING');
            console.log(`⏰ Moved ${bill.payeeName} to PENDING - Due in ${daysUntilDue} days (>7 day limit)`);
            changedCount++;
          }
        }
      }
      
      // Apply balance checking to remaining scheduled bills
      await scheduleWithBalanceCheck(storage, userId, []);
      
      const finalBills = await storage.getBills(userId);
      const scheduledCount = finalBills.filter(b => b.status === 'SCHEDULED').length;
      const pendingCount = finalBills.filter(b => b.status === 'PENDING').length;
      
      res.json({
        success: true,
        message: `Emergency rebalance complete. Applied 7-day rule and balance checking.`,
        changedCount,
        scheduledCount,
        pendingCount,
        userBalance: userBalance / 100
      });
    } catch (error) {
      console.error("Emergency rebalance error:", error);
      res.status(500).json({ success: false, message: "Emergency rebalance failed" });
    }
  });

  // Restore canceled bills endpoint
  app.post('/api/bills/restore-canceled', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`🔄 Restoring canceled bills for user ${userId}`);
      
      // First restore canceled bills to PENDING status
      const restoreResult = await storage.restoreCanceledBills(userId);
      
      if (restoreResult.restoredCount === 0) {
        return res.json({
          success: true,
          restoredCount: 0,
          scheduledCount: 0,
          pendingCount: 0,
          message: restoreResult.message
        });
      }
      
      // Apply balance-aware scheduling to the restored bills
      console.log(`🧮 Applying balance-aware scheduling to ${restoreResult.restoredCount} restored bills`);
      const schedulingResult = await scheduleWithBalanceCheck(storage, userId, restoreResult.bills);
      
      const scheduledCount = schedulingResult.scheduledBills.length;
      const pendingCount = schedulingResult.pendingBills.length;
      
      let message = `Restored ${restoreResult.restoredCount} canceled bills. `;
      if (scheduledCount > 0) {
        message += `${scheduledCount} bills scheduled for payment, ${pendingCount} bills pending due to balance.`;
      } else {
        message += `All restored bills are pending payment due to insufficient balance.`;
      }

      res.json({
        success: true,
        restoredCount: restoreResult.restoredCount,
        scheduledCount: scheduledCount,
        pendingCount: pendingCount,
        totalCostCents: schedulingResult.totalCostCents,
        availableBalanceCents: schedulingResult.availableBalanceCents,
        message: message
      });
    } catch (error) {
      console.error("Error restoring canceled bills:", error);
      res.status(500).json({
        success: false,
        restoredCount: 0,
        scheduledCount: 0,
        pendingCount: 0,
        message: "Failed to restore canceled bills"
      });
    }
  });

  app.post('/api/webhooks/billwatch', async (req, res) => {
    try {
      const signature = req.headers['x-signature'] as string;
      const payload = JSON.stringify(req.body);
      
      // Verify webhook signature
      const isValid = billWatchService.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid signature" });
      }
      
      // TODO: Handle BillWatch webhook events
      res.json({ message: "BillWatch webhook processed successfully" });
    } catch (error) {
      console.error("Error processing BillWatch webhook:", error);
      res.status(500).json({ message: "Failed to process webhook" });
    }
  });

  // Mercury Banking API endpoints
  app.get('/api/mercury/balance', isAuthenticated, async (req: any, res) => {
    try {
      const mercuryService = getMercuryService();
      const balanceInfo = await mercuryService.getMercuryFundingBalance();
      
      res.json({
        success: true,
        availableBalance: balanceInfo.availableBalance,
        accountId: balanceInfo.accountId,
        accountName: balanceInfo.accountName,
        formattedBalance: `$${(balanceInfo.availableBalance / 100).toFixed(2)}`
      });
    } catch (error: any) {
      console.error('❌ Error fetching Mercury balance:', error);
      
      if (error instanceof MercuryConfigurationError) {
        return res.status(503).json({
          success: false,
          message: 'Mercury funding is not configured',
          error: 'MERCURY_NOT_CONFIGURED'
        });
      }
      
      if (error instanceof MercuryApiError) {
        return res.status(502).json({
          success: false,
          message: 'Mercury API error',
          error: error.code,
          details: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Mercury balance',
        error: 'INTERNAL_ERROR'
      });
    }
  });

  app.get('/api/mercury/status', isAuthenticated, async (req: any, res) => {
    try {
      const mercuryService = getMercuryService();
      
      // Test Mercury connection by fetching account info
      const accounts = await mercuryService.getAccounts();
      const primaryAccount = accounts.find(acc => acc.type === 'checking' && acc.status === 'active');
      
      if (!primaryAccount) {
        return res.json({
          success: false,
          status: 'misconfigured',
          message: 'No active checking account found',
          hasConnection: true,
          accountCount: accounts.length
        });
      }
      
      res.json({
        success: true,
        status: 'healthy',
        message: 'Mercury service is operational',
        hasConnection: true,
        accountCount: accounts.length,
        primaryAccount: {
          id: primaryAccount.id,
          name: primaryAccount.name,
          type: primaryAccount.type,
          status: primaryAccount.status,
          availableBalance: primaryAccount.availableBalance,
          formattedBalance: `$${(primaryAccount.availableBalance / 100).toFixed(2)}`
        },
        fundingEnabled: process.env.ENABLE_MERCURY_FUNDING === 'true'
      });
    } catch (error: any) {
      console.error('❌ Mercury status check failed:', error);
      
      if (error instanceof MercuryConfigurationError) {
        return res.json({
          success: false,
          status: 'not_configured',
          message: 'Mercury funding is not configured',
          hasConnection: false,
          error: 'MERCURY_NOT_CONFIGURED',
          fundingEnabled: false
        });
      }
      
      if (error instanceof MercuryApiError) {
        return res.json({
          success: false,
          status: 'api_error',
          message: 'Mercury API connection failed',
          hasConnection: false,
          error: error.code,
          details: error.message,
          fundingEnabled: process.env.ENABLE_MERCURY_FUNDING === 'true'
        });
      }
      
      res.json({
        success: false,
        status: 'error',
        message: 'Mercury service error',
        hasConnection: false,
        error: 'INTERNAL_ERROR',
        fundingEnabled: false
      });
    }
  });

  // Mercury test endpoints for development and verification
  app.get('/api/mercury/test/accounts', isAuthenticated, async (req: any, res) => {
    try {
      const mercuryService = getMercuryService();
      const accounts = await mercuryService.getAccounts();
      
      res.json({
        success: true,
        accounts: accounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          status: acc.status,
          availableBalance: acc.availableBalance,
          currentBalance: acc.currentBalance,
          formattedAvailable: `$${(acc.availableBalance / 100).toFixed(2)}`,
          formattedCurrent: `$${(acc.currentBalance / 100).toFixed(2)}`
        }))
      });
    } catch (error: any) {
      console.error('❌ Mercury test accounts failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Mercury accounts',
        error: error.message
      });
    }
  });

  app.post('/api/mercury/test/validate-payment', isAuthenticated, async (req: any, res) => {
    try {
      const { amountCents } = req.body;
      
      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount in cents is required and must be positive'
        });
      }
      
      const mercuryService = getMercuryService();
      const primaryAccount = await mercuryService.getPrimaryAccount();
      const validation = await mercuryService.validateAccountForPayment(primaryAccount.id, amountCents);
      
      res.json({
        success: true,
        validation: {
          valid: validation.valid,
          message: validation.message,
          balance: validation.balance ? {
            availableBalance: validation.balance.availableBalance,
            currentBalance: validation.balance.currentBalance,
            formattedAvailable: `$${(validation.balance.availableBalance / 100).toFixed(2)}`,
            formattedCurrent: `$${(validation.balance.currentBalance / 100).toFixed(2)}`
          } : null
        },
        testAmount: {
          amountCents,
          formattedAmount: `$${(amountCents / 100).toFixed(2)}`
        }
      });
    } catch (error: any) {
      console.error('❌ Mercury payment validation test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate Mercury payment',
        error: error.message
      });
    }
  });

  // EMERGENCY: Fix overcommitment by ensuring only affordable bills stay scheduled
  app.post('/api/bills/rebalance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`🚨 EMERGENCY REBALANCE requested for user ${userId}`);
      
      // Get user's current balance and all bills
      const userBalance = await storage.checkUserBalance(userId);
      const allBills = await storage.getBills(userId);
      const scheduledBills = allBills.filter(bill => bill.status === 'SCHEDULED');
      
      console.log(`💰 User balance: $${(userBalance / 100).toFixed(2)}`);
      console.log(`📊 Found ${scheduledBills.length} scheduled bills`);
      
      if (scheduledBills.length === 0) {
        return res.json({
          message: "No overcommitment found - no scheduled bills exist",
          scheduledCount: 0,
          pendingCount: allBills.filter(b => b.status === 'PENDING').length,
          availableBalanceCents: userBalance
        });
      }
      
      // STEP 1: Move ALL scheduled bills to PENDING (clear overcommitment)
      for (const bill of scheduledBills) {
        await storage.updateBillStatus(bill.id, 'PENDING');
        console.log(`⬇️ EMERGENCY: Moved ${bill.payeeName} $${(bill.amountCents / 100).toFixed(2)} to PENDING`);
      }
      
      // STEP 2: Apply smart scheduling with balance check
      const schedulingResult = await scheduleWithBalanceCheck(storage, userId, scheduledBills);
      
      const message = `EMERGENCY REBALANCE: Fixed overcommitment. ${schedulingResult.scheduledBills.length} bills scheduled, ${schedulingResult.pendingBills.length} pending within $${(userBalance / 100).toFixed(2)} budget.`;
      
      res.json({
        message,
        beforeScheduled: scheduledBills.length,
        afterScheduled: schedulingResult.scheduledBills.length,  
        pending: schedulingResult.pendingBills.length,
        availableBalanceCents: schedulingResult.availableBalanceCents,
        correctionApplied: true
      });
    } catch (error) {
      console.error("Error during emergency rebalance:", error);
      res.status(500).json({ message: "Emergency rebalance failed", error: (error as any)?.message });
    }
  });

  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Debug endpoint for production troubleshooting
  app.get('/api/debug/health', (req, res) => {
    try {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'unknown',
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        hasTestingKey: !!process.env.TESTING_STRIPE_SECRET_KEY,
        hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        hasDatabase: !!process.env.DATABASE_URL,
        hasMercuryToken: !!process.env.MERCURY_API_TOKEN,
        mercuryFundingEnabled: process.env.ENABLE_MERCURY_FUNDING === 'true'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
