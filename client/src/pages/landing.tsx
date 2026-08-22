import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, PiggyBank, CreditCard, Target, Wallet, DollarSign, Building2, ShieldCheck, BookCheck, Coins, LineChart } from "lucide-react";
import { useClerk } from "@clerk/clerk-react";

export default function Landing() {
  const { openSignIn } = useClerk();

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-primary">Felix Pay</h1>
            </div>
            <Button 
              onClick={() => openSignIn({ fallbackRedirectUrl: "/" })}
              data-testid="button-login"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <div className="mb-8">
            <p className="text-lg text-muted-foreground mb-2">by Debt to Legacy LLC</p>
            <h2 className="text-4xl font-bold text-foreground">
              Automated Bill Payment Made Simple
            </h2>
          </div>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Import your bills from BillWatch and automatically send paper checks via trusted providers. 
            Track delivery status and never miss a payment again.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button 
              size="lg"
              onClick={() => window.location.href = '/membership'}
              data-testid="button-get-started"
            >
              Get Started with Membership
            </Button>
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => window.location.href = '/roadmap'}
              data-testid="button-roadmap-web"
            >
              Use Financial Roadmap Online
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.open('https://apps.apple.com/us/app/debt-to-legacy/id6760262157', '_blank', 'noopener,noreferrer')}
              data-testid="button-roadmap-ios"
            >
              Download the iOS App
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <svg className="w-6 h-6 text-primary mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                  Import Bills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Automatically import due bills from BillWatch with one click
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <svg className="w-6 h-6 text-primary mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Schedule Payments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Automatically schedule paper checks to be mailed 7 days before due dates
                </CardDescription>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <svg className="w-6 h-6 text-primary mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Track Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Real-time tracking from scheduled to sent to delivered status
                </CardDescription>
              </CardContent>
            </Card>
          </div>

        </div>

        {/* Company Branding Section */}
        <section className="space-y-8 mt-20">
          <div className="text-center space-y-6">
            <h3 className="text-3xl font-bold text-foreground">About Debt to Legacy LLC</h3>
            <div className="max-w-4xl mx-auto">
              <p className="text-lg text-muted-foreground leading-relaxed">
                Debt to Legacy is a personal finance and debt management consulting business that equips 
                individuals with practical tools to regain control of their money, eliminate debt, and build 
                lasting wealth. Through comprehensive solutions, we guide clients step by step from financial 
                struggle to financial freedom and legacy building.
              </p>
            </div>
          </div>
        </section>

        {/* Product Navigation Suite */}
        <section className="space-y-8 mt-16">
          <div className="text-center space-y-4">
            <h3 className="text-3xl font-bold text-foreground">Complete Financial Suite</h3>
            <p className="text-lg text-muted-foreground">
              Explore our comprehensive range of financial tools and services
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* IncomeLift */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-6 h-6 text-primary mr-2" />
                  IncomeLift
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Boost your income streams
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit IncomeLift →
                </a>
              </CardContent>
            </Card>

            {/* SteadyVest */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PiggyBank className="w-6 h-6 text-primary mr-2" />
                  SteadyVest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Steady growth investing
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit SteadyVest →
                </a>
              </CardContent>
            </Card>

            {/* BillWatch */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="w-6 h-6 text-primary mr-2" />
                  BillWatch
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Smart bill management
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit BillWatch →
                </a>
              </CardContent>
            </Card>

            {/* DIY Debt */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="w-6 h-6 text-primary mr-2" />
                  DIY Debt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Debt elimination strategies
                </CardDescription>
                <a 
                  href="https://diydebt.org" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit DIY Debt →
                </a>
              </CardContent>
            </Card>

            {/* Felix Pay (Current App - Highlighted) */}
            <Card className="hover:shadow-lg transition-shadow duration-300 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Wallet className="w-6 h-6 text-primary mr-2" />
                  Felix Pay
                  <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">You're Here</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Secure payment solutions
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit Felix Pay →
                </a>
              </CardContent>
            </Card>

            {/* ExpenseWatch */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="w-6 h-6 text-primary mr-2" />
                  ExpenseWatch
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Advanced expense tracking
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit ExpenseWatch →
                </a>
              </CardContent>
            </Card>

            {/* FinanceWatch */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Building2 className="w-6 h-6 text-primary mr-2" />
                  FinanceWatch
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Complete financial overview
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit FinanceWatch →
                </a>
              </CardContent>
            </Card>

            {/* Felix CheckBook */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BookCheck className="w-6 h-6 text-primary mr-2" />
                  Felix CheckBook
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Check printing & mailing service
                </CardDescription>
                <a 
                  href="https://dtlfos.felixpay.online/finance" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit FelixCheck →
                </a>
              </CardContent>
            </Card>

            {/* Savings Pro */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Coins className="w-6 h-6 text-primary mr-2" />
                  SavingsPro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Smart savings strategies
                </CardDescription>
                <a 
                  href="https://savingspro.app" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit SavingsPro →
                </a>
              </CardContent>
            </Card>

            {/* WealthWatch */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <LineChart className="w-6 h-6 text-primary mr-2" />
                  WealthWatch
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-4">
                  Track Your Cash Flow, Build Your Wealth
                </CardDescription>
                <a 
                  href="https://wealth-watch.app" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Visit WealthWatch →
                </a>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background/95 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <div className="flex justify-center space-x-6 text-sm text-muted-foreground">
              <a href="/privacy-policy" className="hover:text-foreground transition-colors" data-testid="link-privacy-footer">Privacy Policy</a>
              <a href="/terms-of-use" className="hover:text-foreground transition-colors" data-testid="link-terms-footer">Terms of Use</a>
              <a href="https://debttolegacy.com/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors" data-testid="link-contact-footer">Contact</a>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Debt to Legacy LLC. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
