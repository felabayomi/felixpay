import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, Scale, Shield, FileText, Mail, ShieldCheck } from "lucide-react";

export default function TermsOfUse() {
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="mb-8">
              <p className="text-lg text-muted-foreground mb-2">by Debt to Legacy LLC</p>
              <h1 className="text-4xl font-bold text-foreground">Terms of Use</h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Last updated: January 2025
            </p>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              These Terms of Use govern your access to and use of Felix Pay services provided by Debt to Legacy LLC.
            </p>
          </div>

          {/* Key Points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card className="text-center">
              <CardHeader>
                <Scale className="w-12 h-12 text-primary mx-auto mb-4" />
                <CardTitle className="text-lg">Fair & Transparent</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Clear terms with no hidden fees or confusing clauses. What you see is what you get.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
                <CardTitle className="text-lg">Secure Service</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Your security is our priority. We maintain high standards for data protection and service reliability.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <FileText className="w-12 h-12 text-primary mx-auto mb-4" />
                <CardTitle className="text-lg">User Rights</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Clear explanation of your rights, responsibilities, and what to expect from our service.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          {/* Content Sections */}
          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Agreement to Terms</h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  By accessing and using Felix Pay ("the Service"), you agree to be bound by these Terms of Use ("Terms"). 
                  If you do not agree to these Terms, please do not use our Service.
                </p>
                <p>
                  These Terms constitute a legal agreement between you and Debt to Legacy LLC ("Company", "we", "us", or "our"). 
                  We may update these Terms from time to time, and your continued use of the Service after such changes 
                  constitutes acceptance of the updated Terms.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Service Description</h2>
              <div className="text-muted-foreground space-y-3">
                <p>Felix Pay is an automated bill payment service that:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Imports bills from BillWatch or allows manual bill entry</li>
                  <li>Processes payments through physical check printing and mailing</li>
                  <li>Provides real-time tracking and status updates</li>
                  <li>Manages account balances and payment methods through Stripe</li>
                  <li>Offers secure authentication through Clerk</li>
                </ul>
                <p className="mt-4">
                  The Service is designed to help users manage their bill payments more efficiently. However, 
                  we cannot guarantee that all bills will be paid on time due to factors outside our control, 
                  such as postal delays or recipient processing times.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Account Registration and Security</h2>
              <div className="text-muted-foreground space-y-3">
                <p>To use Felix Pay, you must:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Have a valid Felix Financial Suite account for authentication</li>
                  <li>Provide accurate and complete information</li>
                  <li>Be at least 18 years old or have legal capacity to enter contracts</li>
                  <li>Maintain the security and confidentiality of your account</li>
                </ul>
                <p className="mt-4">
                  You are responsible for all activities that occur under your account. If you suspect unauthorized 
                  access to your account, notify us immediately at <a href="mailto:felix@debttolegacy.com" className="text-primary hover:underline">felix@debttolegacy.com</a>.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Payment Terms and Billing</h2>
              <div className="text-muted-foreground space-y-3">
                <p><strong className="text-foreground">Pay-As-You-Go Model:</strong> Felix Pay operates on a pay-as-you-go basis. You are only charged when we successfully create and mail a check on your behalf.</p>
                
                <p><strong className="text-foreground">Account Balance:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>You must maintain sufficient account balance to cover bill payments</li>
                  <li>Automatic top-ups can be configured with a valid payment method</li>
                  <li>Balance-aware scheduling ensures you won't be charged for bills you can't afford</li>
                </ul>

                <p><strong className="text-foreground">Payment Methods:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We accept major credit and debit cards through Stripe</li>
                  <li>All payment processing is handled securely by Stripe</li>
                  <li>You can add, remove, or modify payment methods at any time</li>
                </ul>

                <p><strong className="text-foreground">Refunds:</strong> Refunds may be issued for:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Failed check creation or mailing (automatic)</li>
                  <li>Service errors or technical failures on our part</li>
                  <li>Bills cancelled before processing begins</li>
                </ul>
                <p>Refunds are not available once a check has been successfully mailed.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">User Responsibilities</h2>
              <div className="text-muted-foreground space-y-3">
                <p>You agree to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Provide Accurate Information:</strong> Ensure all bill details, payee information, and account data are correct</li>
                  <li><strong className="text-foreground">Sufficient Funds:</strong> Maintain adequate account balance or valid payment methods</li>
                  <li><strong className="text-foreground">Timely Review:</strong> Review and verify bill information before payments are processed</li>
                  <li><strong className="text-foreground">Compliance:</strong> Use the Service in accordance with all applicable laws and regulations</li>
                  <li><strong className="text-foreground">Notification:</strong> Inform us promptly of any errors, unauthorized transactions, or account issues</li>
                </ul>
                
                <p className="mt-4">You are ultimately responsible for ensuring your bills are paid on time. 
                While Felix Pay automates the payment process, you should monitor your account and verify 
                that payments are being processed as expected.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Service Limitations and Disclaimers</h2>
              <div className="text-muted-foreground space-y-3">
                <p><strong className="text-foreground">Service Availability:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>The Service may be temporarily unavailable due to maintenance, updates, or technical issues</li>
                  <li>We strive for high uptime but cannot guarantee 100% availability</li>
                  <li>Scheduled maintenance will be communicated in advance when possible</li>
                </ul>

                <p><strong className="text-foreground">Third-Party Dependencies:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We rely on third-party services (Felixcheck.com, Stripe, BillWatch, postal services)</li>
                  <li>Delays or failures by these providers may affect our service</li>
                  <li>We are not responsible for third-party service outages or errors</li>
                </ul>

                <p><strong className="text-foreground">Geographic Limitations:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Felix Pay currently supports domestic US bill payments only</li>
                  <li>International payments are not supported at this time</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Prohibited Uses</h2>
              <div className="text-muted-foreground space-y-3">
                <p>You may not use Felix Pay to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Pay for illegal goods, services, or activities</li>
                  <li>Make payments that violate any laws or regulations</li>
                  <li>Attempt to circumvent security measures or gain unauthorized access</li>
                  <li>Use the Service for money laundering or other financial crimes</li>
                  <li>Submit false, misleading, or fraudulent payment information</li>
                  <li>Use automated systems to abuse or overload the Service</li>
                  <li>Reverse engineer or attempt to extract source code</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Intellectual Property</h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  The Felix Pay service, including its design, functionality, text, graphics, and software, 
                  is owned by Debt to Legacy LLC and is protected by copyright, trademark, and other 
                  intellectual property laws.
                </p>
                <p>
                  You are granted a limited, non-exclusive, non-transferable license to access and use 
                  the Service for your personal bill payment needs. This license does not permit you to 
                  resell, distribute, or create derivative works based on our Service.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Privacy and Data Protection</h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  Your privacy is important to us. Our collection, use, and protection of your personal 
                  information is governed by our <Link href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>, 
                  which is incorporated into these Terms by reference.
                </p>
                <p>
                  By using Felix Pay, you consent to the collection and use of your information as 
                  described in our Privacy Policy.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Limitation of Liability</h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  To the fullest extent permitted by law, Debt to Legacy LLC shall not be liable for any 
                  indirect, incidental, special, consequential, or punitive damages, or any loss of profits 
                  or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, 
                  or other intangible losses.
                </p>
                <p>
                  Our total liability to you for all claims arising from or relating to the Service shall 
                  not exceed the total amount paid by you to us in the twelve months preceding the claim.
                </p>
                <p>
                  Some jurisdictions do not allow the exclusion or limitation of certain damages, so some 
                  of the above limitations may not apply to you.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Indemnification</h2>
              <div className="text-muted-foreground">
                <p>
                  You agree to indemnify, defend, and hold harmless Debt to Legacy LLC and its officers, 
                  directors, employees, and agents from any claims, liabilities, damages, losses, and 
                  expenses arising from your use of the Service, violation of these Terms, or violation 
                  of any rights of another person or entity.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Termination</h2>
              <div className="text-muted-foreground space-y-3">
                <p><strong className="text-foreground">By You:</strong> You may terminate your account at any time by contacting us at <a href="mailto:felix@debttolegacy.com" className="text-primary hover:underline">felix@debttolegacy.com</a>.</p>
                
                <p><strong className="text-foreground">By Us:</strong> We may terminate or suspend your access to the Service at any time, with or without notice, for:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Violation of these Terms</li>
                  <li>Fraudulent or illegal activity</li>
                  <li>Non-payment of fees</li>
                  <li>Extended periods of inactivity</li>
                </ul>

                <p><strong className="text-foreground">Effect of Termination:</strong></p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Your access to the Service will be revoked</li>
                  <li>Scheduled payments may be cancelled</li>
                  <li>Account data will be retained as required by law</li>
                  <li>Outstanding balances remain your responsibility</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Governing Law and Disputes</h2>
              <div className="text-muted-foreground space-y-3">
                <p>
                  These Terms are governed by and construed in accordance with the laws of the United States 
                  and the state where Debt to Legacy LLC is incorporated, without regard to conflict of law principles.
                </p>
                <p>
                  Any disputes arising from these Terms or the Service will be resolved through good faith 
                  negotiation. If negotiation fails, disputes may be resolved through binding arbitration or 
                  in the appropriate courts with jurisdiction.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Contact Information</h2>
              <div className="text-muted-foreground">
                <p>
                  If you have questions about these Terms of Use, please contact us at:
                </p>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p><strong className="text-foreground">Debt to Legacy LLC</strong></p>
                  <p>Email: <a href="mailto:felix@debttolegacy.com" className="text-primary hover:underline">felix@debttolegacy.com</a></p>
                  <p>Website: <a href="https://debttolegacy.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">debttolegacy.com</a></p>
                </div>
              </div>
            </section>

            {/* Contact Section */}
            <Card className="bg-muted">
              <CardHeader className="text-center">
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Questions About These Terms?</CardTitle>
                <CardDescription>
                  We're here to help clarify any questions about these Terms of Use or your rights and responsibilities.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="flex justify-center space-x-6">
                  <a 
                    href="mailto:felix@debttolegacy.com" 
                    className="text-primary hover:underline font-medium"
                    data-testid="link-terms-contact"
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
          </div>
        </div>
      </main>
    </div>
  );
}
