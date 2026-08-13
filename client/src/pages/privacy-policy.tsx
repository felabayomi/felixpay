import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, Shield, Lock, Eye, Mail, ShieldCheck } from "lucide-react";

export default function PrivacyPolicy() {
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
              <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
            </div>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Last updated: January 2025
            </p>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Your privacy is important to us. This Privacy Policy explains how Felix Pay collects, uses, and protects your information.
            </p>
          </div>

          {/* Privacy Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <Card className="text-center">
              <CardHeader>
                <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
                <CardTitle className="text-lg">Secure by Design</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Industry-standard encryption and security practices protect your financial data at all times.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
                <CardTitle className="text-lg">No Data Selling</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  We never sell, rent, or share your personal information with third parties for marketing purposes.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Eye className="w-12 h-12 text-primary mx-auto mb-4" />
                <CardTitle className="text-lg">Transparent Practices</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Clear disclosure of what data we collect, how we use it, and your rights regarding your information.
                </CardDescription>
              </CardContent>
            </Card>
          </div>

          {/* Content Sections */}
          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Information We Collect</h2>
              <div className="space-y-4 text-muted-foreground">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Account Information</h3>
                  <p>When you sign up for Felix Pay using Clerk authentication, we collect:</p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Your account information (name, email, profile picture)</li>
                    <li>Account preferences and settings</li>
                    <li>Authentication tokens and session data</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Financial Information</h3>
                  <p>To process payments, we collect:</p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Payment method details (through Stripe, securely encrypted)</li>
                    <li>Account balance and transaction history</li>
                    <li>Bill information (payee details, amounts, due dates)</li>
                    <li>BillWatch integration data when you connect your account</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Usage Data</h3>
                  <p>We automatically collect certain information when you use our service:</p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Log data including IP addresses, browser type, and access times</li>
                    <li>Feature usage and interaction patterns</li>
                    <li>Error reports and performance metrics</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">How We Use Your Information</h2>
              <div className="text-muted-foreground space-y-3">
                <p>We use your information to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Provide our services:</strong> Process bill payments, maintain your account, and deliver core functionality</li>
                  <li><strong className="text-foreground">Improve user experience:</strong> Analyze usage patterns to enhance features and fix issues</li>
                  <li><strong className="text-foreground">Security and fraud prevention:</strong> Monitor for suspicious activity and protect your account</li>
                  <li><strong className="text-foreground">Communication:</strong> Send important updates, notifications, and support responses</li>
                  <li><strong className="text-foreground">Legal compliance:</strong> Meet regulatory requirements and respond to legal requests</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Information Sharing and Disclosure</h2>
              <div className="text-muted-foreground space-y-3">
                <p>We may share your information with:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Service providers:</strong> Trusted partners like Stripe (payments), Felixcheck.com (check printing and mailing), and BillWatch (bill imports) who help us operate the service</li>
                  <li><strong className="text-foreground">Legal requirements:</strong> When required by law, court order, or government request</li>
                  <li><strong className="text-foreground">Business transfers:</strong> In case of merger, acquisition, or sale of assets (with notice to users)</li>
                  <li><strong className="text-foreground">Protection of rights:</strong> To protect our rights, property, and the safety of users</li>
                </ul>
                <p className="mt-4">We <strong className="text-foreground">never sell</strong> your personal information to advertisers or marketers.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Data Security</h2>
              <div className="text-muted-foreground space-y-3">
                <p>We implement comprehensive security measures to protect your information:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Encryption:</strong> All data is encrypted in transit and at rest using industry-standard protocols</li>
                  <li><strong className="text-foreground">Access controls:</strong> Strict employee access controls and authentication requirements</li>
                  <li><strong className="text-foreground">Regular audits:</strong> Security assessments and penetration testing of our systems</li>
                  <li><strong className="text-foreground">Secure infrastructure:</strong> Hosted on secure, monitored cloud platforms with built-in protections</li>
                  <li><strong className="text-foreground">PCI compliance:</strong> Payment processing follows PCI DSS standards through Stripe</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Your Rights and Choices</h2>
              <div className="text-muted-foreground space-y-3">
                <p>You have the following rights regarding your personal information:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Access:</strong> Request a copy of the personal information we have about you</li>
                  <li><strong className="text-foreground">Correction:</strong> Update or correct inaccurate information in your account</li>
                  <li><strong className="text-foreground">Deletion:</strong> Request deletion of your account and associated data</li>
                  <li><strong className="text-foreground">Portability:</strong> Obtain your data in a machine-readable format</li>
                  <li><strong className="text-foreground">Opt-out:</strong> Unsubscribe from non-essential communications</li>
                </ul>
                <p className="mt-4">To exercise these rights, contact us at <a href="mailto:felix@debttolegacy.com" className="text-primary hover:underline">felix@debttolegacy.com</a>.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Data Retention</h2>
              <div className="text-muted-foreground space-y-3">
                <p>We retain your information for different periods based on the type of data:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Account data:</strong> Retained while your account is active, plus 7 years for financial records</li>
                  <li><strong className="text-foreground">Transaction records:</strong> Kept for 7 years to meet financial regulations</li>
                  <li><strong className="text-foreground">Log data:</strong> Typically retained for 90 days for security and debugging purposes</li>
                  <li><strong className="text-foreground">Marketing communications:</strong> Until you unsubscribe or close your account</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Third-Party Services</h2>
              <div className="text-muted-foreground space-y-3">
                <p>Felix Pay integrates with several trusted third-party services:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong className="text-foreground">Replit:</strong> Authentication and account management</li>
                  <li><strong className="text-foreground">Stripe:</strong> Payment processing and billing</li>
                  <li><strong className="text-foreground">Felixcheck.com:</strong> Check printing and mailing services</li>
                  <li><strong className="text-foreground">BillWatch:</strong> Bill import and tracking (optional)</li>
                </ul>
                <p className="mt-4">Each service has its own privacy policy. We encourage you to review their privacy practices.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Children's Privacy</h2>
              <div className="text-muted-foreground">
                <p>Felix Pay is not intended for use by children under 13. We do not knowingly collect personal information from children under 13. If we discover that we have collected information from a child under 13, we will delete that information immediately.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Changes to This Policy</h2>
              <div className="text-muted-foreground">
                <p>We may update this Privacy Policy from time to time. When we make significant changes, we will:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Update the "Last updated" date at the top of this policy</li>
                  <li>Notify you via email or through the service</li>
                  <li>Post the updated policy on our website</li>
                </ul>
                <p className="mt-4">Your continued use of Felix Pay after any changes indicates acceptance of the updated policy.</p>
              </div>
            </section>

            {/* Contact Section */}
            <Card className="bg-muted">
              <CardHeader className="text-center">
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Questions About Privacy?</CardTitle>
                <CardDescription>
                  We're here to help with any questions about this Privacy Policy or how we handle your data.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground"><strong>Data Protection Officer:</strong></p>
                  <p className="text-lg">Debt to Legacy LLC</p>
                </div>
                <div className="flex justify-center space-x-6">
                  <a 
                    href="mailto:felix@debttolegacy.com" 
                    className="text-primary hover:underline font-medium"
                    data-testid="link-privacy-contact"
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
