import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: "What is Felix Pay and how does it work?",
    answer: "Felix Pay is an automated bill payment service that imports your bills from BillWatch and sends physical checks on your behalf. Simply connect your BillWatch account, review your bills, and we'll automatically schedule and mail checks to your payees 7 days before the due date."
  },
  {
    question: "How do I get started with Felix Pay?",
    answer: "Getting started is easy! Sign in with your Felix Financial Suite account, import bills from BillWatch or add them manually, add funds to your account or set up automatic payments with a credit/debit card, and let Felix Pay handle the rest."
  },
  {
    question: "What is BillWatch and do I need it?",
    answer: "BillWatch is a bill tracking service that helps you monitor due bills. While BillWatch integration makes importing bills easier, you can also add bills manually to Felix Pay if you prefer not to use BillWatch."
  },
  {
    question: "How does billing work?",
    answer: "Felix Pay uses a simple pay-as-you-go model. You're only charged when we actually send a check on your behalf. Add funds to your account balance or set up a payment method for automatic top-ups when your balance runs low."
  },
  {
    question: "When are checks sent?",
    answer: "Checks are automatically scheduled to be mailed 7 days before the bill's due date to ensure they arrive on time. You can also pay bills immediately using the 'Pay Now' option in your dashboard."
  },
  {
    question: "What happens if I don't have enough balance?",
    answer: "Felix Pay uses balance-aware scheduling. If your account balance is insufficient to cover all bills, only the bills you can afford will be scheduled for payment. The remaining bills will stay in 'PENDING' status until you add more funds."
  },
  {
    question: "Can I cancel a scheduled payment?",
    answer: "Yes! You can cancel any bill with 'SCHEDULED' status from your dashboard. Once a check has been sent (status changes to 'PROCESSING' or 'SENT'), it cannot be cancelled."
  },
  {
    question: "How do I track my payments?",
    answer: "Your dashboard shows real-time status updates for all bills. You'll see statuses like SCHEDULED, PROCESSING, SENT, DELIVERED, or FAILED. We receive updates directly from our check mailing providers via webhooks."
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit and debit cards through Stripe. You can add multiple payment methods and set one as default for automatic balance top-ups."
  },
  {
    question: "Is my financial information secure?",
    answer: "Absolutely. We use Clerk authentication, encrypted data transmission, and secure payment processing through Stripe. Your financial data is never stored in plain text."
  },
  {
    question: "What if a payment fails or is returned?",
    answer: "If a check fails to be created or is returned by the payee, the bill status will be updated to 'FAILED' and you'll be notified. You can then retry the payment or contact the payee directly to resolve any issues."
  },
  {
    question: "Can I edit bill information after it's imported?",
    answer: "Currently, imported bills from BillWatch cannot be edited to maintain data integrity. However, you can cancel an imported bill and create a new manual bill with the correct information if needed."
  },
  {
    question: "Do you support international payments?",
    answer: "Felix Pay currently focuses on domestic US payments. All checks are printed and mailed within the United States through our trusted provider Felixcheck.com."
  },
  {
    question: "How much does each check cost?",
    answer: "Check printing and mailing costs vary by provider and delivery speed. You'll see the exact cost for each bill before it's processed. Typically, costs range from $1-3 per check including printing, mailing, and processing fees."
  },
  {
    question: "Can I schedule recurring payments?",
    answer: "Felix Pay focuses on one-time bill payments. For recurring bills, you'll need to import or add them each billing cycle. This ensures you have full control and can review each payment before it's sent."
  },
  {
    question: "What if I need to dispute a charge?",
    answer: "If you need to dispute a charge, please contact our support team at felix@debttolegacy.com. We'll work with you and our payment processors to resolve any billing issues quickly and fairly."
  }
];

export default function FAQ() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

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
              <h1 className="text-4xl font-bold text-foreground">Frequently Asked Questions</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Find answers to common questions about Felix Pay, bill payments, billing, and account management.
            </p>
          </div>

          {/* FAQ Items */}
          <div className="space-y-4">
            {faqData.map((item, index) => (
              <Card key={index} className="border">
                <Collapsible 
                  open={openItems.includes(index)}
                  onOpenChange={() => toggleItem(index)}
                >
                  <CollapsibleTrigger className="w-full" data-testid={`faq-question-${index}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 hover:bg-muted/50 transition-colors">
                      <CardTitle className="text-left text-lg font-medium">
                        {item.question}
                      </CardTitle>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        openItems.includes(index) ? 'rotate-180' : ''
                      }`} />
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <p className="text-muted-foreground leading-relaxed" data-testid={`faq-answer-${index}`}>
                        {item.answer}
                      </p>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </div>

          {/* Contact Section */}
          <Card className="bg-muted">
            <CardHeader className="text-center">
              <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Still Have Questions?</CardTitle>
              <CardDescription>
                Can't find the answer you're looking for? Our support team is here to help.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Get direct assistance with your account, billing questions, or technical issues.
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
            </CardContent>
          </Card>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-8">
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">Getting Started</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href="/how-to-use">
                  <Button variant="outline" className="w-full" data-testid="link-how-to-use">
                    View How-to Guide
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
                <CardTitle className="text-lg">Legal Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Link href="/privacy-policy">
                    <Button variant="ghost" size="sm" className="w-full" data-testid="link-privacy">
                      Privacy Policy
                    </Button>
                  </Link>
                  <Link href="/terms-of-use">
                    <Button variant="ghost" size="sm" className="w-full" data-testid="link-terms">
                      Terms of Use
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
