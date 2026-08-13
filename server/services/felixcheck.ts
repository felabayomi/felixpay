interface FelixcheckCheckRequest {
  bill_id: string;
  name: string;
  recipient: {
    line_1: string;
    line_2?: string;
    city: string;
    state: string;
    zip: string;
  };
  amount: number;
  description?: string;
}

interface FelixcheckCheckResponse {
  id: string;
  billId: string;
  status: string;
  amount: number;
}

export class FelixcheckService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.FELIXCHECK_API_KEY || '';
    this.baseUrl = 'https://felixcheck.com/api';
    
    if (!this.apiKey) {
      console.warn('⚠️ FELIXCHECK_API_KEY not set - Felixcheck service will not be available');
    } else {
      console.log('✅ Felixcheck service initialized');
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async createCheck(billId: string, payeeName: string, address: {
    line_1: string;
    line_2?: string;
    city: string;
    state: string;
    zip: string;
  }, amountDollars: number, memo?: string): Promise<FelixcheckCheckResponse> {
    if (!this.isAvailable()) {
      throw new Error('Felixcheck service not configured - FELIXCHECK_API_KEY required');
    }

    const requestBody: FelixcheckCheckRequest = {
      bill_id: billId,
      name: payeeName,
      recipient: {
        line_1: address.line_1,
        line_2: address.line_2,
        city: address.city,
        state: address.state,
        zip: address.zip
      },
      amount: amountDollars,
      description: memo
    };

    console.log(`📝 Creating check via Felixcheck for bill ${billId}: $${amountDollars} to ${payeeName}`);

    try {
      const response = await fetch(`${this.baseUrl}/checks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Felixcheck API error: ${response.status} ${errorText}`);
        throw new Error(`Felixcheck API error: ${response.status} ${errorText}`);
      }

      const result: FelixcheckCheckResponse = await response.json();
      console.log(`✅ Felixcheck check created: ${result.id} (status: ${result.status})`);
      
      return result;
    } catch (error) {
      console.error('❌ Failed to create check with Felixcheck:', error);
      throw error;
    }
  }

  mapWebhookStatusToBillStatus(felixcheckStatus: string): string {
    switch (felixcheckStatus.toUpperCase()) {
      case 'IN_QUEUE':
      case 'PENDING':
      case 'PROCESSING':
        return 'SENT';
      case 'PRINTED':
      case 'MAILED':
      case 'SENT':
      case 'IN_TRANSIT':
        return 'SENT';
      case 'DELIVERED':
        return 'DELIVERED';
      case 'FAILED':
      case 'RETURNED':
        return 'FAILED';
      case 'CANCELED':
        return 'CANCELED';
      default:
        return 'SENT';
    }
  }
}

let felixcheckServiceInstance: FelixcheckService | null = null;

export function getFelixcheckService(): FelixcheckService {
  if (!felixcheckServiceInstance) {
    felixcheckServiceInstance = new FelixcheckService();
  }
  return felixcheckServiceInstance;
}

export const felixcheckService = new FelixcheckService();
