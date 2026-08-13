import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, LogIn, Download, CreditCard, Send, CheckCircle, Clock, AlertCircle, Mail, ShieldCheck } from "lucide-react";

export default function HowToUse() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-primary">Felix Pay</h1>
              </div>
            </div>
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="mb-8">
              <p className="text-lg text-muted-foreground mb-2">by Debt to Legacy LLC</p>
              <h1 className="text-4xl font-bold text-foreground">How to Use Felix Pay</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Follow this step-by-step guide to start automating your bill payments with Felix Pay.
            </p>
          </div>

          {/* Quick Start Guide */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">Getting Started</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="text-center">
                <CardHeader>
                  <LogIn className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle className="text-lg">1. Sign In</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Use your shared Felix Financial Suite account to securely sign into Felix Pay
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Download className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle className="text-lg">2. Import Bills</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Connect BillWatch or add bills manually with payee details
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <CreditCard className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle className="text-lg">3. Add Payment Method</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Set up your credit/debit card for automatic account top-ups
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Send className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle className="text-lg">4. Schedule & Pay</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Let Felix Pay automatically schedule and mail your checks
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Detailed Step-by-Step Guide */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">Detailed Instructions</h2>
            
            <div className="space-y-8">
              {/* Step 1 */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">1</div>
                    <CardTitle className="text-2xl">Account Setup & Sign In</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">First-Time Users:</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Visit Felix Pay and click "Sign In"</li>
                      <li>You'll be shown Clerk's secure authentication screen</li>
                      <li>Sign in with your existing Suite account or create one if needed</li>
                      <li>Grant Felix Pay permission to access your basic profile information</li>
                      <li>You'll be automatically redirected back to your Felix Pay dashboard</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Returning Users:</h4>
                    <p className="text-muted-foreground">Simply click "Sign In" and use the shared Clerk sign-in for the Felix Financial Suite.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Step 2 */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">2</div>
                    <CardTitle className="text-2xl">Import or Add Your Bills</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Option A: BillWatch Integration (Recommended)</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Click "Import Bills" on your dashboard</li>
                      <li>This connects to BillWatch API to automatically fetch your due bills</li>
                      <li>Review imported bills for accuracy - all details are pre-filled</li>
                      <li>Bills import with payee information, amounts, and due dates</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Option B: Manual Bill Entry</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Click "Add Manual Bill" on your dashboard</li>
                      <li>Fill in payee details: name and complete mailing address</li>
                      <li>Enter bill amount in dollars (e.g., "25.50")</li>
                      <li>Set the due date for proper scheduling</li>
                      <li>Add an optional memo that will appear on the check</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Step 3 */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">3</div>
                    <CardTitle className="text-2xl">Set Up Payment Methods</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Adding Your First Payment Method:</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Navigate to the "Billing" page from the top menu</li>
                      <li>Click "Add Payment Method" in the Payment Methods section</li>
                      <li>Enter your credit or debit card details securely through Stripe</li>
                      <li>Your first card will automatically be set as the default</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Account Balance Management:</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Add funds directly: Use "Add Funds" to manually top up your account</li>
                      <li>Set up auto-refill: Configure automatic balance top-ups when funds run low</li>
                      <li>Monitor usage: Track your balance and spending in the billing section</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Step 4 */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">4</div>
                    <CardTitle className="text-2xl">Understanding Bill Scheduling</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Automatic Scheduling:</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Bills are automatically scheduled to mail 7 days before their due date</li>
                      <li>This ensures checks arrive on time even with postal delays</li>
                      <li>Balance-aware scheduling only schedules bills you can afford</li>
                      <li>Remaining bills stay "PENDING" until you add more funds</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Manual Payment Options:</h4>
                    <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                      <li>Use "Pay Now" to immediately process a bill payment</li>
                      <li>Cancel scheduled payments before they're processed</li>
                      <li>Restore cancelled bills to resume automatic scheduling</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Step 5 */}
              <Card className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">5</div>
                    <CardTitle className="text-2xl">Track Payment Status</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">Your dashboard shows real-time status updates for all bills:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-5 h-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-foreground">PENDING</p>
                          <p className="text-sm text-muted-foreground">Waiting for sufficient balance</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="font-medium text-foreground">SCHEDULED</p>
                          <p className="text-sm text-muted-foreground">Scheduled for automatic mailing</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Send className="w-5 h-5 text-purple-600" />
                        <div>
                          <p className="font-medium text-foreground">PROCESSING</p>
                          <p className="text-sm text-muted-foreground">Check is being created and prepared</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <Send className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium text-foreground">SENT</p>
                          <p className="text-sm text-muted-foreground">Check has been mailed</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-5 h-5 text-green-700" />
                        <div>
                          <p className="font-medium text-foreground">DELIVERED</p>
                          <p className="text-sm text-muted-foreground">Check delivered to recipient</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        <div>
                          <p className="font-medium text-foreground">FAILED</p>
                          <p className="text-sm text-muted-foreground">Payment failed - requires attention</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Tips and Best Practices */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">Tips & Best Practices</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">💡 Account Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Maintain a buffer in your account balance to ensure all bills can be scheduled</p>
                  <p>• Set up automatic top-ups to avoid payment delays</p>
                  <p>• Review your bill list regularly before the 7-day scheduling window</p>
                  <p>• Keep your payee addresses up-to-date for successful delivery</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">⚡ Timing & Scheduling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Import or add bills at least 10 days before they're due</p>
                  <p>• Use "Pay Now" for urgent bills that need immediate processing</p>
                  <p>• Remember that mailing takes 3-5 business days typically</p>
                  <p>• Check your dashboard regularly for status updates</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">🔒 Security & Safety</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Never share your account credentials with anyone</p>
                  <p>• Review all payment details before confirming</p>
                  <p>• Contact support immediately if you notice any suspicious activity</p>
                  <p>• Keep your payment methods current and monitor for expiration dates</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">❓ Troubleshooting</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Bills stuck in PENDING? Check your account balance</p>
                  <p>• Payment FAILED? Verify payee address and contact support</p>
                  <p>• Can't import bills? Check your BillWatch integration</p>
                  <p>• Need help? Contact felix@debttolegacy.com for support</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Common Scenarios */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">Common Scenarios</h2>
            
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>📝 Scenario 1: Setting Up Your First Monthly Bills</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  <p className="mb-3">You have monthly recurring bills like utilities, rent, and credit card payments:</p>
                  <ol className="list-decimal pl-6 space-y-1">
                    <li>Start by importing bills from BillWatch or adding them manually</li>
                    <li>Add sufficient funds to cover all bills for the month</li>
                    <li>Set up automatic top-ups to maintain your balance</li>
                    <li>Let Felix Pay automatically schedule payments 7 days before due dates</li>
                    <li>Monitor the dashboard for status updates and delivery confirmations</li>
                  </ol>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>⚡ Scenario 2: Making an Urgent Payment</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  <p className="mb-3">You need to pay a bill immediately due to a short deadline:</p>
                  <ol className="list-decimal pl-6 space-y-1">
                    <li>Add the bill manually with accurate payee details</li>
                    <li>Ensure you have sufficient account balance</li>
                    <li>Use the "Pay Now" action to process immediately</li>
                    <li>Track the bill status as it moves from PROCESSING to SENT</li>
                    <li>Follow up with the payee if needed to confirm receipt</li>
                  </ol>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>🔄 Scenario 3: Managing Insufficient Balance</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  <p className="mb-3">Your account balance isn't enough to cover all scheduled bills:</p>
                  <ol className="list-decimal pl-6 space-y-1">
                    <li>Review which bills are in PENDING status</li>
                    <li>Prioritize critical bills (rent, utilities, loan payments)</li>
                    <li>Add funds to your account or ensure auto-refill is working</li>
                    <li>Use "Pay Now" for the most urgent bills first</li>
                    <li>The remaining bills will automatically schedule once balance is sufficient</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Support Section */}
          <Card className="bg-muted">
            <CardHeader className="text-center">
              <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Need Help Getting Started?</CardTitle>
              <CardDescription>
                Our support team is here to help you set up Felix Pay and answer any questions about using the service.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  For setup assistance, billing questions, or technical support:
                </p>
              </div>
              <div className="flex justify-center space-x-6">
                <a 
                  href="mailto:felix@debttolegacy.com" 
                  className="text-primary hover:underline font-medium"
                  data-testid="link-support-email"
                >
                  felix@debttolegacy.com
                </a>
                <a 
                  href="https://debttolegacy.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                  data-testid="link-company-website"
                >
                  Visit Debt to Legacy →
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href="/faq">
                  <Button variant="outline" className="w-full" data-testid="link-faq">
                    View FAQ
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">About Felix Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href="/about">
                  <Button variant="outline" className="w-full" data-testid="link-about">
                    Learn More
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">Start Using Felix Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href="/">
                  <Button className="w-full" data-testid="link-get-started">
                    Get Started Now
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
