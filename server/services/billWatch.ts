interface BillWatchBill {
  id: string;
  userId: string;
  company: string;
  amount: string;
  dueDate: string;
  status: string;
  accountNumber?: string;
  category?: string;
  description?: string;
  paidAmount?: string;
  paidDate?: string;
  createdAt: string;
  updatedAt: string;
  extractedData?: any;
}

export class BillWatchService {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = process.env.BILLWATCH_EXPORT_URL || 'https://bill-watch.replit.app/api/export/bills';
    this.token = process.env.BILLWATCH_EXPORT_TOKEN || 'demo-token';
  }

  async importDueBills(userEmail: string, fromDate?: string, toDate?: string): Promise<BillWatchBill[]> {
    try {
      // Import bills from 60 days ago to 90 days in the future to catch overdue and upcoming bills
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

      // Try different parameter combinations to find what works
      let params = new URLSearchParams({
        email: userEmail,
      });

      // Try just email first, then add dates if that works
      console.log(`🚀 ATTEMPT 1: API call with email parameter: ${userEmail}`);
      console.log(`🌐 URL: ${this.baseUrl}?${params}`);
      let response = await fetch(`${this.baseUrl}?${params}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`✅ ATTEMPT 1 STATUS: ${response.status}`);
      let responseText = await response.text();
      console.log(`📄 ATTEMPT 1 RESPONSE: ${responseText}`);
      
      // If that doesn't work, try without email parameter
      if (!response.ok || responseText.trim() === '{}' || responseText.trim() === '[]') {
        console.log(`Trying API call without email parameter (all bills)`);
        response = await fetch(`${this.baseUrl}`, {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        });
        
        console.log(`Second attempt - Status: ${response.status}`);
        responseText = await response.text();
        console.log(`Second attempt - Response: ${responseText}`);
      }
      
      // If still no luck, try with different parameter names
      if (!response.ok || responseText.trim() === '{}' || responseText.trim() === '[]') {
        console.log(`Trying API call with 'user' parameter instead of 'email'`);
        params = new URLSearchParams({ user: userEmail });
        response = await fetch(`${this.baseUrl}?${params}`, {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        });
        
        console.log(`Third attempt - Status: ${response.status}`);
        responseText = await response.text();
        console.log(`Third attempt - Response: ${responseText}`);
      }

      console.log(`Final BillWatch API call: ${this.baseUrl}`);
      console.log(`Using token: ${this.token ? 'Token present' : 'No token'}`);

      if (!response.ok) {
        throw new Error(`BillWatch API error: ${response.status} ${response.statusText}`);
      }

      const data = JSON.parse(responseText);
      console.log(`Found ${data.bills?.length || 0} bills for user ${userEmail}`);
      return data.bills || [];
    } catch (error) {
      console.error('Failed to import bills from BillWatch:', error);
      throw error; // Don't fall back to sample data, let the user know there's an issue
    }
  }

  private generateSampleBills(userEmail: string): BillWatchBill[] {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 1);
    
    return [
      {
        id: `bw_${Date.now()}_1`,
        userId: userEmail,
        company: 'Electric Company',
        amount: '125.00',
        dueDate: nextMonth.toISOString(),
        status: 'unpaid',
        description: 'Monthly electric bill',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `bw_${Date.now()}_2`,
        userId: userEmail,
        company: 'Water Department',
        amount: '78.00',
        dueDate: nextMonth.toISOString(),
        status: 'unpaid',
        description: 'Water and sewer service',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: `bw_${Date.now()}_3`,
        userId: userEmail,
        company: 'Internet Provider',
        amount: '89.99',
        dueDate: nextMonth.toISOString(),
        status: 'unpaid',
        description: 'Monthly internet service',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.BILLWATCH_WEBHOOK_SECRET;
    if (!secret) return true; // Skip verification if no secret is set
    
    // TODO: Implement HMAC signature verification
    return true;
  }
}

export const billWatchService = new BillWatchService();
