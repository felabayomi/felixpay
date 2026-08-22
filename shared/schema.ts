import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  boolean,
  pgSchema,
  timestamp,
  varchar,
  integer,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const felixpaySchema = pgSchema("felixpay");

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = felixpaySchema.table(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = felixpaySchema.table("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeCustomerId: varchar("stripe_customer_id"),
  accountBalance: integer("account_balance").default(0), // in cents
  phase: varchar("phase", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const billStatusEnum = felixpaySchema.enum("bill_status", [
  "PENDING",
  "SCHEDULED",
  "PROCESSING",
  "SENT", 
  "DELIVERED",
  "FAILED",
  "CANCELED"
]);

export const settlementSourceEnum = felixpaySchema.enum("settlement_source", [
  "system",
  "external"
]);

export const settlementMethodEnum = felixpaySchema.enum("settlement_method", [
  "ach",
  "wire",
  "cash",
  "check",
  "debit_card",
  "credit_card",
  "other"
]);

export const bills = felixpaySchema.table("bills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id"), // BillWatch id (bw_*)
  payeeName: text("payee_name").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("US"),
  paymentUrl: text("payment_url"), // Online payment URL (alternative to mailing check)
  amountCents: integer("amount_cents").notNull(),
  dueDate: timestamp("due_date").notNull(),
  memo: text("memo"),
  status: billStatusEnum("status").notNull().default("PENDING"),
  provider: text("provider").notNull(), // "checkbook" | "lob"
  providerId: text("provider_id"),
  // Settlement tracking fields
  settlementSource: settlementSourceEnum("settlement_source").default("system"),
  settledAt: timestamp("settled_at"),
  settlementMethod: settlementMethodEnum("settlement_method"),
  settlementReference: text("settlement_reference"),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payLinkStatusEnum = felixpaySchema.enum("pay_link_status", [
  "active",
  "paid",
  "expired",
  "canceled"
]);

export const payLinks = felixpaySchema.table("pay_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: varchar("token").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  message: text("message"),
  status: payLinkStatusEnum("status").notNull().default("active"),
  payerName: text("payer_name"),
  payerEmail: text("payer_email"),
  stripeSessionId: varchar("stripe_session_id"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const membershipStatusEnum = felixpaySchema.enum("membership_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
  "inactive",
]);

export const membershipTierEnum = felixpaySchema.enum("membership_tier", [
  "control",
  "momentum",
  "legacy",
]);

export const memberships = felixpaySchema.table("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  stripePriceId: varchar("stripe_price_id"),
  tier: membershipTierEnum("tier").notNull().default("control"),
  billingCadence: varchar("billing_cadence", { length: 10 }).notNull().default("monthly"),
  status: membershipStatusEnum("status").notNull().default("inactive"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end").default(0),
  trialEnd: timestamp("trial_end"),
  purchaseSource: varchar("purchase_source", { length: 20 }).default("stripe"),
  appleOriginalTransactionId: varchar("apple_original_transaction_id"),
  appleProductId: varchar("apple_product_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const TIER_TOOLS: Record<string, string[]> = {
  control: ['FinanceWatch', 'ExpenseWatch', 'BillWatch', 'IncomeLift'],
  momentum: ['FinanceWatch', 'ExpenseWatch', 'BillWatch', 'IncomeLift', 'DIY Debt', 'SavingsPro'],
  legacy: ['FinanceWatch', 'ExpenseWatch', 'BillWatch', 'IncomeLift', 'DIY Debt', 'SavingsPro', 'SteadyVest', 'WealthWatch', 'Felix Pay', 'Felix CheckBook'],
};

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Bill = typeof bills.$inferSelect;
export type InsertBill = typeof bills.$inferInsert;
export type PayLink = typeof payLinks.$inferSelect;
export type InsertPayLink = typeof payLinks.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = typeof memberships.$inferInsert;

// Payment method types enum (temporarily disabled to avoid casting issues)
// export const paymentMethodTypeEnum = felixpaySchema.enum("payment_method_type", ["card"]);

// Payment methods table
export const paymentMethods = felixpaySchema.table("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  stripePaymentMethodId: varchar("stripe_payment_method_id").notNull(),
  type: varchar("type").notNull().default("card"),
  // Card-specific fields
  last4: varchar("last4", { length: 4 }),
  brand: varchar("brand"),
  // Legacy ACH fields (temporarily preserved to avoid data loss)
  routingNumber: varchar("routing_number"),
  accountType: varchar("account_type"),
  accountHolderType: varchar("account_holder_type"),
  bankName: varchar("bank_name"),
  isDefault: integer("is_default").default(0), // 0 = false, 1 = true
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Transactions table
export const transactions = felixpaySchema.table("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  billId: varchar("bill_id").references(() => bills.id),
  amountCents: integer("amount_cents").notNull(),
  description: text("description").notNull(),
  stripeChargeId: varchar("stripe_charge_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Unique constraint on external payment IDs to prevent duplicate crediting
  unique("unique_stripe_charge_id").on(table.stripeChargeId)
]);

export type PaymentMethod = typeof paymentMethods.$inferSelect;
// Type for payment methods returned from API
export type PaymentMethodWithBoolean = Omit<PaymentMethod, 'isDefault'> & { 
  isDefault: boolean;
};
export type InsertPaymentMethod = typeof paymentMethods.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

export const insertBillSchema = createInsertSchema(bills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  dueDate: z.coerce.date(), // Accept date strings and coerce to Date
  addressLine2: z.string().optional(), // Make optional fields truly optional
  memo: z.string().optional(), // Make optional fields truly optional
  paymentUrl: z.string().url().optional().or(z.literal('')), // Optional payment URL for online payments
});

// Schema for marking a bill as externally paid
export const externalPaymentSchema = z.object({
  settlementMethod: z.enum(["ach", "wire", "cash", "check", "debit_card", "credit_card", "other"]),
  settledAt: z.coerce.date(),
  settlementReference: z.string().optional(),
});

export const updateBillSchema = insertBillSchema.omit({
  userId: true,
  provider: true,
  sourceId: true,
}).partial();

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
});

export const createPayLinkSchema = z.object({
  amountCents: z.number().int().min(100, "Minimum amount is $1.00"),
  message: z.string().max(500).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional().default(7),
});

export type InsertBillType = z.infer<typeof insertBillSchema>;
export type InsertUserType = z.infer<typeof insertUserSchema>;
export type CreatePayLinkType = z.infer<typeof createPayLinkSchema>;

// Payment method type utilities for credit card only
export type StripePaymentMethodType = 'card';
export type InternalPaymentMethodType = 'card';

// Helper functions - simplified for credit card only
export function stripeToInternalType(stripeType: StripePaymentMethodType): InternalPaymentMethodType {
  return stripeType;
}

export function internalToStripeType(internalType: InternalPaymentMethodType): StripePaymentMethodType {
  return internalType;
}

// Validation function to check if a payment method type is supported
export function isValidInternalPaymentMethodType(type: string): type is InternalPaymentMethodType {
  return type === 'card';
}

export function isValidStripePaymentMethodType(type: string): type is StripePaymentMethodType {
  return type === 'card';
}


export const roadmapQuizResults = felixpaySchema.table("roadmap_quiz_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phase: text("phase").notNull(),
  readinessScore: integer("readiness_score").notNull(),
  upgradeAvailable: text("upgrade_available"),
  overdraftRecent: boolean("overdraft_recent").notNull(),
  knowsTrueBalance: boolean("knows_true_balance").notNull(),
  hasHighInterestDebt: boolean("has_high_interest_debt").notNull(),
  hasEmergencySavings: boolean("has_emergency_savings").notNull(),
  activelyInvesting: boolean("actively_investing").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roadmapLeads = felixpaySchema.table("roadmap_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  phase: text("phase").notNull(),
  readinessScore: integer("readiness_score").notNull(),
  quizResultId: varchar("quiz_result_id").references(() => roadmapQuizResults.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRoadmapQuizResultSchema = createInsertSchema(roadmapQuizResults).omit({
  id: true,
  createdAt: true,
});
export const insertRoadmapLeadSchema = createInsertSchema(roadmapLeads).omit({
  id: true,
  createdAt: true,
});
export type RoadmapQuizResult = typeof roadmapQuizResults.$inferSelect;
export type InsertRoadmapQuizResult = typeof roadmapQuizResults.$inferInsert;
export type RoadmapLead = typeof roadmapLeads.$inferSelect;
export type InsertRoadmapLead = typeof roadmapLeads.$inferInsert;
