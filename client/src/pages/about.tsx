import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, CreditCard, Shield, Clock, CheckCircle, ShieldCheck } from "lucide-react";

export default function About() {
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
              <h1 className="text-4xl font-bold text-foreground">About Felix Pay</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Felix Pay is a comprehensive bill payment solution that automates paper check mailing, 
              helping you stay on top of your bills with secure, reliable payment processing.
            </p>
          </div>

          {/* What We Do Section */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">What We Do</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <Card className="text-center">
                <CardHeader>
                  <CreditCard className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle>Automated Bill Importing</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Connect with BillWatch to automatically import your due bills, 
                    eliminating manual data entry and ensuring you never miss a payment.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle>Secure Check Mailing</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Physical checks are printed and mailed securely through Felixcheck.com, 
                    with full tracking from creation to delivery.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="text-center">
                <CardHeader>
                  <Clock className="w-12 h-12 text-primary mx-auto mb-4" />
                  <CardTitle>Smart Scheduling</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Bills are automatically scheduled to be mailed 7 days before their due date, 
                    with balance-aware scheduling to prevent overspending.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* How It Works Section */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">How It Works</h2>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">1</div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Import Your Bills</h3>
                  <p className="text-muted-foreground">Connect your BillWatch account to automatically import due bills, or add bills manually through our intuitive interface.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">2</div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Review & Schedule</h3>
                  <p className="text-muted-foreground">Review your bills and let our smart scheduling system automatically arrange payments based on your account balance and due dates.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">3</div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Automatic Processing</h3>
                  <p className="text-muted-foreground">Physical checks are printed and mailed through secure providers, with real-time status updates from scheduled to delivered.</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">4</div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Track & Confirm</h3>
                  <p className="text-muted-foreground">Monitor the status of all your payments through our dashboard, with webhook notifications for delivery confirmations.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Key Features Section */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">Key Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-foreground">BillWatch API Integration</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-foreground">Shared Clerk Authentication</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-foreground">Stripe Payment Processing</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-foreground">Real-time Webhook Tracking</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-foreground">Balance-aware Scheduling</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-foreground">Secure Check Printing</span>
              </div>
            </div>
          </section>

          {/* About Debt to Legacy Section */}
          <section className="space-y-8">
            <h2 className="text-3xl font-bold text-center text-foreground">About Debt to Legacy LLC</h2>
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-lg text-muted-foreground leading-relaxed">
                Felix Pay is proudly developed by Debt to Legacy LLC, a personal finance and debt management 
                consulting business that equips individuals with practical tools to regain control of their money, 
                eliminate debt, and build lasting wealth. Through comprehensive solutions, we guide clients step by 
                step from financial struggle to financial freedom and legacy building.
              </p>
            </div>
          </section>

          {/* Contact Section */}
          <section className="space-y-8 bg-muted rounded-lg p-8">
            <h2 className="text-3xl font-bold text-center text-foreground">Get In Touch</h2>
            <div className="text-center space-y-4">
              <p className="text-lg text-muted-foreground">
                Have questions about Felix Pay or need support with your account?
              </p>
              <div className="flex justify-center space-x-6">
                <a 
                  href="mailto:felix@debttolegacy.com" 
                  className="text-primary hover:underline font-medium"
                  data-testid="link-contact-email"
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
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
