/**
 * Centralized Stripe Configuration and Key Management
 * 
 * This module provides:
 * - Consistent Stripe key precedence and validation
 * - Fail-fast error handling for missing configurations
 * - Centralized Stripe client initialization
 * - Production-ready logging and validation
 */

import Stripe from 'stripe';

// Singleton Stripe client instance
let stripeClient: Stripe | null = null;
let webhookSecret: string | null = null;

/**
 * Configuration validation and error messages
 */
interface StripeConfig {
  secretKey: string;
  webhookSecret: string | null;
}

class StripeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigurationError';
  }
}

/**
 * Centralized Stripe key management with consistent precedence
 * 
 * Precedence (highest to lowest):
 * 1. STRIPE_SECRET_KEY (production)
 * 2. TESTING_STRIPE_SECRET_KEY (development/testing)
 * 
 * Throws StripeConfigurationError with detailed message if keys are missing
 */
function getStripeConfig(): StripeConfig {
  // Check for production key first
  const productionKey = process.env.STRIPE_SECRET_KEY;
  if (productionKey) {
    console.log('🔑 Using production Stripe configuration (STRIPE_SECRET_KEY)');
    return {
      secretKey: productionKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null
    };
  }
  
  // Fallback to testing key
  const testingKey = process.env.TESTING_STRIPE_SECRET_KEY;
  if (testingKey) {
    console.log('🧪 Using testing Stripe configuration (TESTING_STRIPE_SECRET_KEY)');
    return {
      secretKey: testingKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null
    };
  }
  
  // No keys found - fail fast with detailed error
  throw new StripeConfigurationError(
    'Missing required Stripe secret key. Please set either:\n' +
    '- STRIPE_SECRET_KEY (for production)\n' +
    '- TESTING_STRIPE_SECRET_KEY (for development/testing)\n' +
    'These environment variables are required for payment processing.'
  );
}

/**
 * Get centralized Stripe client instance
 * 
 * Uses lazy initialization with singleton pattern to:
 * - Avoid startup crashes when keys are missing
 * - Ensure consistent configuration across the application
 * - Provide clear error messages for configuration issues
 * 
 * @throws StripeConfigurationError when configuration is invalid
 */
export function getStripe(): Stripe {
  if (!stripeClient) {
    const config = getStripeConfig();
    
    // Validate secret key format
    if (!config.secretKey.startsWith('sk_')) {
      throw new StripeConfigurationError(
        `Invalid Stripe secret key format: "${config.secretKey.substring(0, 10)}...". ` +
        'Stripe secret keys must start with "sk_"'
      );
    }
    
    // Initialize Stripe client 
    stripeClient = new Stripe(config.secretKey);
    console.log(`✅ Stripe client initialized successfully`);
  }
  
  return stripeClient;
}

/**
 * Get webhook secret for signature verification
 * 
 * @param required - Whether webhook secret is required (default: true)
 * @throws StripeConfigurationError when required but missing
 */
export function getWebhookSecret(): string;
export function getWebhookSecret(required: false): string | null;
export function getWebhookSecret(required: boolean = true): string | null {
  if (webhookSecret === null) {
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;
  }
  
  if (required && !webhookSecret) {
    throw new StripeConfigurationError(
      'Missing required STRIPE_WEBHOOK_SECRET environment variable. ' +
      'This is required for secure webhook signature verification. ' +
      'Please set this value from your Stripe dashboard webhook settings.'
    );
  }
  
  return webhookSecret;
}

/**
 * Validate Stripe configuration at startup
 * 
 * This function can be called at application startup to validate
 * configuration early and provide clear error messages
 */
export function validateStripeConfiguration(): void {
  try {
    // This will throw if configuration is invalid
    getStripeConfig();
    console.log('✅ Stripe configuration validation passed');
  } catch (error: any) {
    console.error('❌ Stripe configuration validation failed:', error.message);
    throw error;
  }
}

/**
 * Reset Stripe client (useful for testing)
 */
export function resetStripeClient(): void {
  stripeClient = null;
  webhookSecret = null;
}

export { StripeConfigurationError };

/**
 * Stripe Fee Calculation
 * 
 * Standard Stripe pricing: 2.9% + $0.30 per transaction
 * 
 * To ensure the business receives the full amount after fees,
 * we calculate how much to charge the customer.
 */
export const STRIPE_FEE_PERCENT = 0.029; // 2.9%
export const STRIPE_FEE_FIXED_CENTS = 30; // $0.30

/**
 * Calculate the total amount to charge so the business receives the desired net amount
 * 
 * Formula: chargeAmount = (desiredNetCents + 30) / (1 - 0.029)
 * 
 * @param desiredNetCents - The amount the business wants to receive (in cents)
 * @returns Object with charge amount, fee amount, and net amount (all in cents)
 */
export function calculateChargeWithFee(desiredNetCents: number): {
  chargeAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
} {
  // Calculate total to charge: (net + fixed_fee) / (1 - percent_fee)
  const chargeAmountCents = Math.ceil((desiredNetCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PERCENT));
  const feeAmountCents = chargeAmountCents - desiredNetCents;
  
  return {
    chargeAmountCents,
    feeAmountCents,
    netAmountCents: desiredNetCents
  };
}

/**
 * Calculate the fee for a given charge amount (for display purposes)
 * 
 * @param chargeAmountCents - The amount being charged (in cents)
 * @returns The Stripe fee in cents
 */
export function calculateStripeFee(chargeAmountCents: number): number {
  return Math.ceil(chargeAmountCents * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED_CENTS;
}