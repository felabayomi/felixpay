/**
 * Mercury Banking API Service
 * 
 * CRITICAL: All monetary amounts in this service are in CENTS (not dollars)
 * Example: $100.00 = 10000 cents, $1.23 = 123 cents
 * 
 * This module provides:
 * - Secure API authentication with Bearer token
 * - Account information retrieval
 * - ACH payment capabilities with idempotency safety
 * - Comprehensive error handling and logging
 * - Production-ready configuration validation
 * - Request timeout and retry logic with exponential backoff
 */

// Mercury API Interfaces
export interface MercuryAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings';
  accountNumber: string;
  routingNumber: string;
  availableBalance: number; // Amount in CENTS
  currentBalance: number;   // Amount in CENTS
  status: 'active' | 'inactive' | 'frozen';
}

export interface MercuryTransaction {
  id: string;
  accountId: string;
  amount: number; // Amount in CENTS
  description: string;
  status: 'pending' | 'posted' | 'failed';
  type: 'debit' | 'credit';
  createdAt: string;
  postedAt?: string;
  counterpartyName?: string;
  counterpartyAccountNumber?: string;
  counterpartyRoutingNumber?: string;
}

export interface MercuryACHPayment {
  recipientId: string;      // Use stored recipient instead of raw bank details
  amount: number;           // Amount in CENTS
  description: string;
  accountId: string;
  sameDay?: boolean;        // Advisory only - will not reject if after cutoff
  idempotencyKey?: string;  // Optional - will be auto-generated if not provided
}

// Legacy interface for backward compatibility - DEPRECATED
export interface MercuryACHPaymentLegacy {
  recipientName: string;
  recipientAccountNumber: string;
  recipientRoutingNumber: string;
  amount: number; // Amount in CENTS
  description: string;
  accountId: string;
  sameDay?: boolean;
  idempotencyKey?: string;
}

export interface MercuryACHPaymentResponse {
  id: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'returned';
  amount: number; // Amount in CENTS
  recipientName: string;
  estimatedDelivery?: string;
  createdAt: string;
  failureReason?: string;
}


export interface MercuryError {
  code: string;
  message: string;
  details?: any;
}

// Mercury Recipient Interfaces
export interface MercuryRecipient {
  id: string;
  name: string;
  accountNumber: string;
  routingNumber: string;
  bankName?: string;
  accountType: 'checking' | 'savings';
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
}

export interface MercuryCreateRecipientData {
  name: string;
  accountNumber: string;
  routingNumber: string;
  bankName?: string;
  accountType: 'checking' | 'savings';
  metadata?: Record<string, any>;
}

export interface MercuryUpdateRecipientData {
  name?: string;
  accountNumber?: string;
  routingNumber?: string;
  bankName?: string;
  accountType?: 'checking' | 'savings';
  status?: 'active' | 'inactive';
  metadata?: Record<string, any>;
}

// Custom Error Classes
class MercuryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MercuryConfigurationError';
  }
}

class MercuryApiError extends Error {
  public code: string;
  public statusCode: number;
  
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'MercuryApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class MercuryService {
  private apiToken: string;
  private baseUrl: string;
  private environment: string;
  private readonly requestTimeout: number = 30000; // 30 seconds
  private readonly maxRetries: number = 3;
  private checkbookRecipientId: string | null = null; // Cache for Checkbook recipient ID

  constructor() {
    this.apiToken = process.env.MERCURY_API_TOKEN || '';
    this.environment = process.env.MERCURY_ENV || 'production';
    
    // Base URL for Mercury API
    this.baseUrl = 'https://api.mercury.com/api/v1';
    
    // Validate required credentials at startup
    if (!this.apiToken) {
      throw new MercuryConfigurationError(
        'MERCURY_API_TOKEN environment variable is required. ' +
        'Please obtain your API token from Mercury banking dashboard under API settings.'
      );
    }

    // SECURITY FIX: Only validate token presence, never log any portion of it
    if (!this.apiToken.trim()) {
      throw new MercuryConfigurationError(
        'Invalid Mercury API token: token appears to be empty or whitespace only'
      );
    }
    
    console.log(`🏛️ Mercury banking service initialized in ${this.environment} mode`);
  }

  private async makeApiCall<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
    body?: any,
    idempotencyKey?: string
  ): Promise<T> {
    return this.makeApiCallWithRetry<T>(endpoint, method, body, idempotencyKey, 0);
  }

  private async makeApiCallWithRetry<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
    body?: any,
    idempotencyKey?: string,
    attempt: number = 0
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mercury-Service/1.0'
      };

      // Add idempotency key for POST requests (payments) to prevent duplicates
      if (method === 'POST' && idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetails: MercuryError;
        
        try {
          errorDetails = JSON.parse(errorText);
        } catch {
          errorDetails = {
            code: 'HTTP_ERROR',
            message: errorText || `HTTP ${response.status} error`,
            details: { status: response.status, statusText: response.statusText }
          };
        }

        // Check if we should retry (5xx errors, network timeouts)
        if (attempt < this.maxRetries && this.shouldRetry(response.status, errorDetails.code)) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
          console.log(`⚠️ Retrying Mercury API call to ${endpoint} after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeApiCallWithRetry<T>(endpoint, method, body, idempotencyKey, attempt + 1);
        }

        throw new MercuryApiError(
          `Mercury API error: ${errorDetails.message}`,
          errorDetails.code,
          response.status
        );
      }

      // FIXED: Mercury API returns direct JSON, not wrapped in { success, data, message }
      return await response.json();
    } catch (error) {
      if (error instanceof MercuryApiError) {
        throw error;
      }

      // Handle timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`⚠️ Retrying Mercury API call to ${endpoint} after timeout (attempt ${attempt + 1}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeApiCallWithRetry<T>(endpoint, method, body, idempotencyKey, attempt + 1);
        }
        throw new MercuryApiError(
          `Mercury API request timeout after ${this.requestTimeout}ms`,
          'REQUEST_TIMEOUT',
          0
        );
      }
      
      console.error(`Failed to call Mercury API ${endpoint}:`, error);
      throw new MercuryApiError(
        `Network error calling Mercury API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        0
      );
    }
  }

  private shouldRetry(statusCode: number, errorCode: string): boolean {
    // Retry on 5xx server errors, rate limiting, and specific network errors
    return (
      statusCode >= 500 ||
      statusCode === 429 ||
      errorCode === 'REQUEST_TIMEOUT' ||
      errorCode === 'NETWORK_ERROR'
    );
  }

  private generateIdempotencyKey(): string {
    // Generate a unique idempotency key using timestamp + random string
    return `mercury_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get all accounts for the authenticated user
   */
  async getAccounts(): Promise<MercuryAccount[]> {
    console.log('📊 Fetching Mercury accounts...');
    
    try {
      const accounts = await this.makeApiCall<MercuryAccount[]>('/accounts');
      
      console.log(`✅ Successfully fetched ${accounts.length} Mercury accounts`);
      return accounts;
    } catch (error) {
      console.error('❌ Failed to fetch Mercury accounts:', error);
      throw error;
    }
  }

  /**
   * Get account details by ID
   */
  async getAccount(accountId: string): Promise<MercuryAccount> {
    console.log(`📊 Fetching Mercury account: ${accountId}`);
    
    try {
      const account = await this.makeApiCall<MercuryAccount>(`/accounts/${accountId}`);
      
      console.log(`✅ Successfully fetched Mercury account: ${accountId}`);
      return account;
    } catch (error) {
      console.error(`❌ Failed to fetch Mercury account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Get transactions for a specific account
   */
  async getAccountTransactions(
    accountId: string, 
    limit: number = 50, 
    offset: number = 0
  ): Promise<MercuryTransaction[]> {
    console.log(`📈 Fetching transactions for account: ${accountId}`);
    
    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString()
      });

      const transactions = await this.makeApiCall<MercuryTransaction[]>(
        `/accounts/${accountId}/transactions?${queryParams}`
      );
      
      console.log(`✅ Successfully fetched ${transactions.length} transactions for account: ${accountId}`);
      return transactions;
    } catch (error) {
      console.error(`❌ Failed to fetch transactions for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Create an ACH payment using a stored recipient
   * CRITICAL: Amount must be in CENTS (e.g., $100.00 = 10000)
   * Includes idempotency safety and advisory same-day processing
   */
  async createACHPayment(paymentData: MercuryACHPayment): Promise<MercuryACHPaymentResponse> {
    try {
      // Validate payment amount (must be in cents)
      if (paymentData.amount <= 0) {
        throw new MercuryApiError(
          'Payment amount must be greater than 0 cents',
          'INVALID_AMOUNT',
          400
        );
      }

      // Validate recipient exists
      if (!paymentData.recipientId?.trim()) {
        throw new MercuryApiError(
          'Recipient ID is required. Use createRecipient() first to store recipient details.',
          'INVALID_RECIPIENT_ID',
          400
        );
      }

      // Get recipient details to use in payment
      const recipient = await this.getRecipient(paymentData.recipientId);
      
      console.log(`💸 Creating ACH payment: $${(paymentData.amount / 100).toFixed(2)} to ${recipient.name} (${paymentData.recipientId})`);

      // ADVISORY SAME-DAY CHECK: Don't block payment, just warn and adjust
      let effectiveSameDay = paymentData.sameDay || false;
      if (effectiveSameDay) {
        // Check amount limit for same-day ACH (SAME_DAY_ACH_LIMIT_CENTS = $1M in cents)
        const SAME_DAY_ACH_LIMIT_CENTS = 100000000;
        if (paymentData.amount > SAME_DAY_ACH_LIMIT_CENTS) {
          console.log(`⚠️ Advisory: Payment of $${(paymentData.amount / 100).toFixed(2)} exceeds same-day ACH limit of $1,000,000. Processing as standard ACH.`);
          effectiveSameDay = false;
        }

        // Check time for same-day ACH (before 12 PM PT) - advisory only
        const now = new Date();
        const ptTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          hour12: false
        }).format(now);
        
        const currentHour = parseInt(ptTime);
        if (currentHour >= 12) {
          console.log('⚠️ Advisory: Same-day ACH requested after 12 PM PT. Processing as standard ACH.');
          effectiveSameDay = false;
        }
      }

      // Generate idempotency key if not provided
      const idempotencyKey = paymentData.idempotencyKey || this.generateIdempotencyKey();

      const achPayload = {
        recipientId: paymentData.recipientId,
        amount: paymentData.amount,
        description: paymentData.description,
        accountId: paymentData.accountId,
        sameDay: effectiveSameDay
      };

      const paymentResponse = await this.makeApiCall<MercuryACHPaymentResponse>(
        '/payments/ach',
        'POST',
        achPayload,
        idempotencyKey
      );
      
      console.log(`✅ ACH payment created successfully: ${paymentResponse.id} (${effectiveSameDay ? 'same-day' : 'standard'})`);
      return paymentResponse;
    } catch (error) {
      console.error('❌ Failed to create ACH payment:', error);
      throw error;
    }
  }

  /**
   * Create an ACH payment using legacy raw bank details (DEPRECATED)
   * Use createACHPayment() with recipientId for better security and management
   */
  async createACHPaymentLegacy(paymentData: MercuryACHPaymentLegacy): Promise<MercuryACHPaymentResponse> {
    console.log('⚠️ WARNING: Using legacy ACH payment method. Consider using createACHPayment() with stored recipients.');
    
    try {
      // Validate payment amount (must be in cents)
      if (paymentData.amount <= 0) {
        throw new MercuryApiError(
          'Payment amount must be greater than 0 cents',
          'INVALID_AMOUNT',
          400
        );
      }

      console.log(`💸 Creating legacy ACH payment: $${(paymentData.amount / 100).toFixed(2)} to ${paymentData.recipientName}`);

      // Generate idempotency key if not provided
      const idempotencyKey = paymentData.idempotencyKey || this.generateIdempotencyKey();

      // ADVISORY SAME-DAY CHECK
      let effectiveSameDay = paymentData.sameDay || false;
      if (effectiveSameDay) {
        const SAME_DAY_ACH_LIMIT_CENTS = 100000000;
        if (paymentData.amount > SAME_DAY_ACH_LIMIT_CENTS) {
          console.log(`⚠️ Advisory: Processing as standard ACH due to amount exceeding $1M limit.`);
          effectiveSameDay = false;
        }

        const now = new Date();
        const ptTime = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          hour12: false
        }).format(now);
        
        if (parseInt(ptTime) >= 12) {
          console.log('⚠️ Advisory: Processing as standard ACH due to time cutoff.');
          effectiveSameDay = false;
        }
      }

      const achPayload = {
        recipientName: paymentData.recipientName,
        recipientAccountNumber: paymentData.recipientAccountNumber,
        recipientRoutingNumber: paymentData.recipientRoutingNumber,
        amount: paymentData.amount,
        description: paymentData.description,
        accountId: paymentData.accountId,
        sameDay: effectiveSameDay
      };

      const paymentResponse = await this.makeApiCall<MercuryACHPaymentResponse>(
        '/payments/ach',
        'POST',
        achPayload,
        idempotencyKey
      );
      
      console.log(`✅ Legacy ACH payment created successfully: ${paymentResponse.id} (${effectiveSameDay ? 'same-day' : 'standard'})`);
      return paymentResponse;
    } catch (error) {
      console.error('❌ Failed to create legacy ACH payment:', error);
      throw error;
    }
  }

  /**
   * Get ACH payment status by ID
   */
  async getACHPaymentStatus(paymentId: string): Promise<MercuryACHPaymentResponse> {
    console.log(`📊 Checking ACH payment status: ${paymentId}`);
    
    try {
      const paymentStatus = await this.makeApiCall<MercuryACHPaymentResponse>(
        `/payments/ach/${paymentId}`
      );
      
      console.log(`✅ ACH payment status fetched: ${paymentId} - ${paymentStatus.status}`);
      return paymentStatus;
    } catch (error) {
      console.error(`❌ Failed to fetch ACH payment status ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    console.log('🔍 Testing Mercury API connection...');
    
    try {
      await this.getAccounts();
      console.log('✅ Mercury API connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Mercury API connection test failed:', error);
      return false;
    }
  }

  // ======================
  // RECIPIENT MANAGEMENT METHODS
  // ======================

  /**
   * Create a new recipient for ACH payments
   * Recipients must be created before ACH payments can be sent to them
   */
  async createRecipient(recipientData: MercuryCreateRecipientData): Promise<MercuryRecipient> {
    console.log(`👤 Creating Mercury recipient: ${recipientData.name}`);
    
    try {
      // Validate required fields
      if (!recipientData.name?.trim()) {
        throw new MercuryApiError(
          'Recipient name is required',
          'INVALID_RECIPIENT_NAME',
          400
        );
      }

      if (!recipientData.accountNumber?.trim()) {
        throw new MercuryApiError(
          'Recipient account number is required',
          'INVALID_ACCOUNT_NUMBER',
          400
        );
      }

      if (!recipientData.routingNumber?.trim()) {
        throw new MercuryApiError(
          'Recipient routing number is required',
          'INVALID_ROUTING_NUMBER',
          400
        );
      }

      // Validate routing number format (9 digits)
      const routingNumberRegex = /^\d{9}$/;
      if (!routingNumberRegex.test(recipientData.routingNumber)) {
        throw new MercuryApiError(
          'Routing number must be exactly 9 digits',
          'INVALID_ROUTING_NUMBER_FORMAT',
          400
        );
      }

      // Validate account number (basic format check)
      if (recipientData.accountNumber.length < 4 || recipientData.accountNumber.length > 20) {
        throw new MercuryApiError(
          'Account number must be between 4 and 20 characters',
          'INVALID_ACCOUNT_NUMBER_LENGTH',
          400
        );
      }

      const payload = {
        name: recipientData.name.trim(),
        accountNumber: recipientData.accountNumber.trim(),
        routingNumber: recipientData.routingNumber.trim(),
        bankName: recipientData.bankName?.trim(),
        accountType: recipientData.accountType || 'checking',
        metadata: recipientData.metadata || {}
      };

      const recipient = await this.makeApiCall<MercuryRecipient>(
        '/recipients',
        'POST',
        payload
      );
      
      console.log(`✅ Recipient created successfully: ${recipient.id} - ${recipient.name}`);
      return recipient;
    } catch (error) {
      console.error('❌ Failed to create recipient:', error);
      throw error;
    }
  }

  /**
   * Get all recipients
   */
  async getRecipients(): Promise<MercuryRecipient[]> {
    console.log('👥 Fetching Mercury recipients...');
    
    try {
      const recipients = await this.makeApiCall<MercuryRecipient[]>('/recipients');
      
      console.log(`✅ Successfully fetched ${recipients.length} Mercury recipients`);
      return recipients;
    } catch (error) {
      console.error('❌ Failed to fetch Mercury recipients:', error);
      throw error;
    }
  }

  /**
   * Get recipient details by ID
   */
  async getRecipient(recipientId: string): Promise<MercuryRecipient> {
    console.log(`👤 Fetching Mercury recipient: ${recipientId}`);
    
    try {
      if (!recipientId?.trim()) {
        throw new MercuryApiError(
          'Recipient ID is required',
          'INVALID_RECIPIENT_ID',
          400
        );
      }

      const recipient = await this.makeApiCall<MercuryRecipient>(`/recipients/${recipientId}`);
      
      console.log(`✅ Successfully fetched Mercury recipient: ${recipientId} - ${recipient.name}`);
      return recipient;
    } catch (error) {
      console.error(`❌ Failed to fetch Mercury recipient ${recipientId}:`, error);
      throw error;
    }
  }

  /**
   * Update recipient information
   */
  async updateRecipient(recipientId: string, updates: MercuryUpdateRecipientData): Promise<MercuryRecipient> {
    console.log(`✏️ Updating Mercury recipient: ${recipientId}`);
    
    try {
      if (!recipientId?.trim()) {
        throw new MercuryApiError(
          'Recipient ID is required',
          'INVALID_RECIPIENT_ID',
          400
        );
      }

      // Validate routing number format if provided
      if (updates.routingNumber) {
        const routingNumberRegex = /^\d{9}$/;
        if (!routingNumberRegex.test(updates.routingNumber)) {
          throw new MercuryApiError(
            'Routing number must be exactly 9 digits',
            'INVALID_ROUTING_NUMBER_FORMAT',
            400
          );
        }
      }

      // Validate account number if provided
      if (updates.accountNumber && (updates.accountNumber.length < 4 || updates.accountNumber.length > 20)) {
        throw new MercuryApiError(
          'Account number must be between 4 and 20 characters',
          'INVALID_ACCOUNT_NUMBER_LENGTH',
          400
        );
      }

      // Clean up the payload
      const payload: MercuryUpdateRecipientData = {};
      if (updates.name?.trim()) payload.name = updates.name.trim();
      if (updates.accountNumber?.trim()) payload.accountNumber = updates.accountNumber.trim();
      if (updates.routingNumber?.trim()) payload.routingNumber = updates.routingNumber.trim();
      if (updates.bankName?.trim()) payload.bankName = updates.bankName.trim();
      if (updates.accountType) payload.accountType = updates.accountType;
      if (updates.status) payload.status = updates.status;
      if (updates.metadata) payload.metadata = updates.metadata;

      const recipient = await this.makeApiCall<MercuryRecipient>(
        `/recipients/${recipientId}`,
        'PUT',
        payload
      );
      
      console.log(`✅ Recipient updated successfully: ${recipientId} - ${recipient.name}`);
      return recipient;
    } catch (error) {
      console.error(`❌ Failed to update Mercury recipient ${recipientId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a recipient
   */
  async deleteRecipient(recipientId: string): Promise<boolean> {
    console.log(`🗑️ Deleting Mercury recipient: ${recipientId}`);
    
    try {
      if (!recipientId?.trim()) {
        throw new MercuryApiError(
          'Recipient ID is required',
          'INVALID_RECIPIENT_ID',
          400
        );
      }

      const deleteResponse = await this.makeApiCall<{ deleted: boolean }>(
        `/recipients/${recipientId}`,
        'DELETE'
      );
      
      console.log(`✅ Recipient deleted successfully: ${recipientId}`);
      return deleteResponse.deleted;
    } catch (error) {
      console.error(`❌ Failed to delete Mercury recipient ${recipientId}:`, error);
      throw error;
    }
  }

  // ======================
  // ACCOUNT HELPER METHODS
  // ======================

  /**
   * Get the primary checking account for payments
   * Returns the first active checking account found
   */
  async getPrimaryAccount(): Promise<MercuryAccount> {
    console.log('🏦 Finding primary Mercury account...');
    
    try {
      const accounts = await this.getAccounts();
      
      // Filter for active checking accounts
      const checkingAccounts = accounts.filter(
        account => account.type === 'checking' && account.status === 'active'
      );

      if (checkingAccounts.length === 0) {
        throw new MercuryApiError(
          'No active checking accounts found',
          'NO_PRIMARY_ACCOUNT',
          404
        );
      }

      // Return the first checking account as primary
      const primaryAccount = checkingAccounts[0];
      console.log(`✅ Primary account found: ${primaryAccount.id} - ${primaryAccount.name}`);
      return primaryAccount;
    } catch (error) {
      console.error('❌ Failed to find primary Mercury account:', error);
      throw error;
    }
  }

  /**
   * Get account balance by account ID
   */
  async getAccountBalance(accountId: string): Promise<{ availableBalance: number; currentBalance: number }> {
    console.log(`💰 Fetching balance for account: ${accountId}`);
    
    try {
      if (!accountId?.trim()) {
        throw new MercuryApiError(
          'Account ID is required',
          'INVALID_ACCOUNT_ID',
          400
        );
      }

      const account = await this.getAccount(accountId);
      
      const balance = {
        availableBalance: account.availableBalance,
        currentBalance: account.currentBalance
      };

      console.log(`✅ Balance retrieved for ${accountId}: Available: $${(balance.availableBalance / 100).toFixed(2)}, Current: $${(balance.currentBalance / 100).toFixed(2)}`);
      return balance;
    } catch (error) {
      console.error(`❌ Failed to fetch balance for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Validate account has sufficient funds for payment
   */
  async validateAccountForPayment(accountId: string, amount: number): Promise<{ valid: boolean; message?: string; balance?: { availableBalance: number; currentBalance: number } }> {
    console.log(`✅ Validating account ${accountId} for payment of $${(amount / 100).toFixed(2)}`);
    
    try {
      if (!accountId?.trim()) {
        throw new MercuryApiError(
          'Account ID is required',
          'INVALID_ACCOUNT_ID',
          400
        );
      }

      if (amount <= 0) {
        return {
          valid: false,
          message: 'Payment amount must be greater than 0'
        };
      }

      const account = await this.getAccount(accountId);
      
      // Check account status
      if (account.status !== 'active') {
        return {
          valid: false,
          message: `Account is ${account.status} and cannot be used for payments`,
          balance: {
            availableBalance: account.availableBalance,
            currentBalance: account.currentBalance
          }
        };
      }

      // Check if account type is suitable for payments
      if (account.type !== 'checking') {
        return {
          valid: false,
          message: 'Only checking accounts can be used for ACH payments',
          balance: {
            availableBalance: account.availableBalance,
            currentBalance: account.currentBalance
          }
        };
      }

      // Check available balance
      if (account.availableBalance < amount) {
        return {
          valid: false,
          message: `Insufficient funds. Available: $${(account.availableBalance / 100).toFixed(2)}, Required: $${(amount / 100).toFixed(2)}`,
          balance: {
            availableBalance: account.availableBalance,
            currentBalance: account.currentBalance
          }
        };
      }

      console.log(`✅ Account validation passed: ${accountId} can handle payment of $${(amount / 100).toFixed(2)}`);
      return {
        valid: true,
        balance: {
          availableBalance: account.availableBalance,
          currentBalance: account.currentBalance
        }
      };
    } catch (error) {
      console.error(`❌ Failed to validate account ${accountId} for payment:`, error);
      throw error;
    }
  }

  /**
   * Map Mercury ACH status to bill status
   */
  mapACHStatusToBillStatus(achStatus: string): string {
    switch (achStatus.toLowerCase()) {
      case 'sent':
        return 'SENT';
      case 'processing':
        return 'PROCESSING';
      case 'failed':
      case 'returned':
        return 'FAILED';
      case 'pending':
        return 'PENDING';
      default:
        return 'SENT';
    }
  }

  // ======================
  // CHECKBOOK INTEGRATION METHODS
  // ======================

  /**
   * Get Checkbook's bank details for recipient creation
   * These would typically be provided by Checkbook or stored in environment variables
   */
  private getCheckbookBankDetails(): MercuryCreateRecipientData {
    // In production, these would come from Checkbook's API or environment variables
    // For now, using placeholder values that would be configured properly
    const checkbookAccountNumber = process.env.CHECKBOOK_ACCOUNT_NUMBER;
    const checkbookRoutingNumber = process.env.CHECKBOOK_ROUTING_NUMBER;
    const checkbookBankName = process.env.CHECKBOOK_BANK_NAME || 'Checkbook Bank';

    if (!checkbookAccountNumber || !checkbookRoutingNumber) {
      throw new MercuryConfigurationError(
        'Checkbook bank details not configured. Please set CHECKBOOK_ACCOUNT_NUMBER and CHECKBOOK_ROUTING_NUMBER environment variables.'
      );
    }

    return {
      name: 'Checkbook Inc',
      accountNumber: checkbookAccountNumber,
      routingNumber: checkbookRoutingNumber,
      bankName: checkbookBankName,
      accountType: 'checking',
      metadata: {
        purpose: 'check_funding',
        integration: 'mercury_to_checkbook',
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create or retrieve Checkbook as a Mercury recipient
   * Includes caching to avoid duplicate recipient creation
   */
  async ensureCheckbookRecipient(): Promise<MercuryRecipient> {
    try {
      // If we have a cached recipient ID, try to fetch it first
      if (this.checkbookRecipientId) {
        try {
          const cachedRecipient = await this.getRecipient(this.checkbookRecipientId);
          console.log(`✅ Using cached Checkbook recipient: ${cachedRecipient.id} - ${cachedRecipient.name}`);
          return cachedRecipient;
        } catch (error) {
          console.log(`⚠️ Cached Checkbook recipient ${this.checkbookRecipientId} not found, will create new one`);
          this.checkbookRecipientId = null; // Clear invalid cache
        }
      }

      // Search for existing Checkbook recipient by name and metadata
      const recipients = await this.getRecipients();
      const existingCheckbookRecipient = recipients.find(r => 
        r.name === 'Checkbook Inc' && 
        r.metadata?.purpose === 'check_funding' &&
        r.status === 'active'
      );

      if (existingCheckbookRecipient) {
        console.log(`✅ Found existing Checkbook recipient: ${existingCheckbookRecipient.id}`);
        this.checkbookRecipientId = existingCheckbookRecipient.id; // Cache it
        return existingCheckbookRecipient;
      }

      // Create new Checkbook recipient
      console.log('🏦 Creating Checkbook as Mercury recipient...');
      const checkbookDetails = this.getCheckbookBankDetails();
      const newRecipient = await this.createRecipient(checkbookDetails);
      
      this.checkbookRecipientId = newRecipient.id; // Cache the new recipient ID
      console.log(`✅ Created Checkbook recipient: ${newRecipient.id} - ${newRecipient.name}`);
      
      return newRecipient;
    } catch (error) {
      console.error('❌ Failed to ensure Checkbook recipient:', error);
      throw error;
    }
  }

  /**
   * Transfer funds from Mercury to Checkbook via ACH
   * CRITICAL: Amount must be in CENTS (e.g., $100.00 = 10000)
   * Uses same-day ACH when possible for faster transfers
   */
  async transferToCheckbook(amountCents: number, description: string = 'Check funding transfer'): Promise<MercuryACHPaymentResponse> {
    try {
      console.log(`🚀 Initiating Mercury to Checkbook transfer: $${(amountCents / 100).toFixed(2)}`);

      // Validate amount
      if (amountCents <= 0) {
        throw new MercuryApiError(
          'Transfer amount must be greater than 0 cents',
          'INVALID_AMOUNT',
          400
        );
      }

      // Check if transfer is feasible
      const feasibilityCheck = await this.canTransferToCheckbook(amountCents);
      if (!feasibilityCheck.canTransfer) {
        throw new MercuryApiError(
          feasibilityCheck.reason || 'Transfer not feasible',
          'TRANSFER_NOT_FEASIBLE',
          400
        );
      }

      // Get the primary checking account for the transfer
      const checkingAccount = await this.getPrimaryAccount();

      // Ensure Checkbook recipient exists
      const checkbookRecipient = await this.ensureCheckbookRecipient();

      // Determine if same-day ACH is beneficial and possible
      const shouldUseSameDay = this.shouldUseSameDayACH(amountCents);

      // Create the ACH payment
      const paymentData: MercuryACHPayment = {
        recipientId: checkbookRecipient.id,
        amount: amountCents,
        description: `${description} - Mercury to Checkbook funding`,
        accountId: checkingAccount.id,
        sameDay: shouldUseSameDay,
        idempotencyKey: `checkbook_transfer_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
      };

      const transferResult = await this.createACHPayment(paymentData);
      
      console.log(`✅ Mercury to Checkbook transfer initiated: ${transferResult.id}`);
      console.log(`📊 Transfer details: $${(amountCents / 100).toFixed(2)} ${shouldUseSameDay ? '(same-day)' : '(standard)'} - Status: ${transferResult.status}`);
      
      return transferResult;
    } catch (error) {
      console.error('❌ Failed to transfer funds to Checkbook:', error);
      throw error;
    }
  }

  /**
   * Check if mercury transfer to checkbook is feasible based on amount and balance
   */
  async canTransferToCheckbook(amountCents: number): Promise<{
    canTransfer: boolean;
    mercuryBalance: number;
    reason?: string;
  }> {
    try {
      // Get the first active checking account
      const accounts = await this.getAccounts();
      const checkingAccount = accounts.find(acc => acc.type === 'checking' && acc.status === 'active');
      
      if (!checkingAccount) {
        return {
          canTransfer: false,
          mercuryBalance: 0,
          reason: 'No active Mercury checking account found'
        };
      }

      const availableBalance = checkingAccount.availableBalance;
      
      if (availableBalance < amountCents) {
        return {
          canTransfer: false,
          mercuryBalance: availableBalance,
          reason: `Insufficient Mercury balance. Available: $${(availableBalance / 100).toFixed(2)}, Required: $${(amountCents / 100).toFixed(2)}`
        };
      }

      return {
        canTransfer: true,
        mercuryBalance: availableBalance
      };
    } catch (error) {
      console.error('❌ Failed to check Mercury transfer feasibility:', error);
      return {
        canTransfer: false,
        mercuryBalance: 0,
        reason: `Error checking Mercury balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Determine if same-day ACH should be used based on amount and time
   * Private helper method for transfer optimization
   */
  private shouldUseSameDayACH(amountCents: number): boolean {
    try {
      // Check amount limit for same-day ACH ($1M = 100,000,000 cents)
      const SAME_DAY_ACH_LIMIT_CENTS = 100000000;
      if (amountCents > SAME_DAY_ACH_LIMIT_CENTS) {
        console.log(`💡 Amount $${(amountCents / 100).toFixed(2)} exceeds same-day ACH limit, using standard ACH`);
        return false;
      }

      // Check time for same-day ACH (before 12 PM PT)
      const now = new Date();
      const ptTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        hour12: false
      }).format(now);
      
      const currentHour = parseInt(ptTime);
      if (currentHour >= 12) {
        console.log(`💡 Current time ${currentHour}:00 PT is after same-day ACH cutoff, using standard ACH`);
        return false;
      }

      console.log(`💡 Using same-day ACH: amount under $1M and before 12 PM PT cutoff`);
      return true;
    } catch (error) {
      console.log('💡 Error checking same-day ACH criteria, defaulting to standard ACH');
      return false;
    }
  }

  /**
   * Get Mercury account balance for check funding purposes
   */
  async getMercuryFundingBalance(): Promise<{
    availableBalance: number; // in cents
    accountId: string;
    accountName: string;
  }> {
    try {
      const checkingAccount = await this.getPrimaryAccount();
      
      return {
        availableBalance: checkingAccount.availableBalance,
        accountId: checkingAccount.id,
        accountName: checkingAccount.name
      };
    } catch (error) {
      console.error('❌ Failed to get Mercury funding balance:', error);
      throw error;
    }
  }

  /**
   * Clear cached Checkbook recipient ID (useful for testing or if recipient changes)
   */
  clearCheckbookRecipientCache(): void {
    console.log('🧹 Clearing Checkbook recipient cache');
    this.checkbookRecipientId = null;
  }
}

// Configuration validation function
export function validateMercuryConfiguration(): void {
  try {
    new MercuryService();
    console.log('✅ Mercury configuration validation passed');
  } catch (error: any) {
    console.error('❌ Mercury configuration validation failed:', error.message);
    throw error;
  }
}

// Export singleton instance (will be created when token is available)
let mercuryServiceInstance: MercuryService | null = null;

export function getMercuryService(): MercuryService {
  if (!mercuryServiceInstance) {
    mercuryServiceInstance = new MercuryService();
  }
  return mercuryServiceInstance;
}

export { MercuryConfigurationError, MercuryApiError };