import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useState } from 'react';
import * as React from 'react';
import { nanoid } from 'nanoid';
import { CreditCard, Plus, Trash2, DollarSign, Shield, Lock, CheckCircle, Award, History, TrendingUp, Building2, LinkIcon, Copy, XCircle, ExternalLink, RefreshCw, User2, Pencil } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Load Stripe (prefer production keys, fallback to test)
const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY || import.meta.env.VITE_TESTING_STRIPE_PUBLIC_KEY;
if (!stripePublicKey) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY or VITE_TESTING_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(stripePublicKey);

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  // Card-specific fields
  last4?: string;
  brand?: string;
  // Bank account specific fields (optional - only for UI compatibility)
  bankName?: string;
  accountType?: 'checking' | 'savings';
  isDefault: boolean;
  stripePaymentMethodId: string;
}

interface User {
  accountBalance: number;
  firstName: string | null;
  lastName: string | null;
}

interface Transaction {
  id: string;
  amountCents: number;
  description: string;
  createdAt: string;
}

const AddPaymentMethodForm = ({ onSuccess, paymentMethodType }: { onSuccess: () => void; paymentMethodType?: 'card' | 'bank_account' }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    // Prevent double submissions
    if (isLoading) {
      console.log('⚠️ Already processing, ignoring duplicate submission');
      return;
    }

    setIsLoading(true);
    
    try {
      // Handle credit card payment method
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) return;

      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      await apiRequest("POST", "/api/payment-methods", {
        paymentMethodId: paymentMethod.id
      });

      toast({
        title: "Payment Method Added",
        description: "Your card has been added successfully.",
      });

      // Invalidate cache to refresh payment methods list
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment method",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg">
        <CardElement 
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>
      <Button 
        type="submit" 
        disabled={!stripe || isLoading}
        className="w-full"
        data-testid="button-add-payment-method"
      >
        {isLoading ? 'Adding...' : 'Add Credit Card'}
      </Button>
    </form>
  );
};


export default function BillingPage() {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [currentIdempotencyToken, setCurrentIdempotencyToken] = useState<string | null>(null);
  const [paymentMethodType, setPaymentMethodType] = useState<'card' | 'bank_account'>('card');
  const [showCreatePayLink, setShowCreatePayLink] = useState(false);
  const [payLinkAmount, setPayLinkAmount] = useState('');
  const [payLinkMessage, setPayLinkMessage] = useState('');
  const [payLinkExpiry, setPayLinkExpiry] = useState('7');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  
  // Feature flag - set to false to hide bank account functionality
  const ENABLE_BANK_ACCOUNTS = false;

  // Stripe fee calculation (2.9% + $0.30)
  const STRIPE_FEE_PERCENT = 0.029;
  const STRIPE_FEE_FIXED_CENTS = 30;
  
  const calculateFees = (amountDollars: number) => {
    if (!amountDollars || amountDollars < 0.5) return null;
    const requestedCents = Math.round(amountDollars * 100);
    const chargeAmountCents = Math.ceil((requestedCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PERCENT));
    const feeCents = chargeAmountCents - requestedCents;
    return {
      requestedCents,
      feeCents,
      totalCents: chargeAmountCents
    };
  };
  
  const feeBreakdown = calculateFees(parseFloat(fundAmount) || 0);

  // Fetch user info for account balance
  const { data: user, isLoading: userLoading, refetch: refetchBalance, isFetching: balanceRefetching } = useQuery<User>({
    queryKey: ['/api/user/billing'],
  });

  // Fetch payment methods (only credit cards supported)
  const { data: allPaymentMethods = [], isLoading: methodsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/payment-methods'],
  });
  
  // Show only credit cards
  const paymentMethods = allPaymentMethods.filter(method => method.type === 'card');

  // Fetch transaction history
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ['/api/transactions'],
  });

  // Filter transactions for deposits (positive amounts)
  const deposits = transactions.filter(transaction => transaction.amountCents > 0);

  interface PayLinkData {
    id: string;
    token: string;
    amountCents: number;
    message: string | null;
    status: string;
    payerName: string | null;
    payerEmail: string | null;
    payUrl: string;
    paidAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  }

  const { data: payLinksData = [], isLoading: payLinksLoading } = useQuery<PayLinkData[]>({
    queryKey: ['/api/pay-links'],
  });

  interface MembershipStatus {
    status: string;
    active: boolean;
    tier: string | null;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  }

  const { data: membershipStatus } = useQuery<MembershipStatus>({
    queryKey: ['/api/membership/status'],
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string }) => {
      const response = await apiRequest("PATCH", "/api/user/profile", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/billing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({ title: "Profile Updated", description: "Your name has been updated." });
      setEditingProfile(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update profile.", variant: "destructive" });
    },
  });

  const createPayLinkMutation = useMutation({
    mutationFn: async (data: { amountCents: number; message?: string; expiresInDays: number }) => {
      const response = await apiRequest("POST", "/api/pay-links", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pay-links'] });
      toast({ title: "Pay Link Created", description: "Your payment link is ready to share." });
      setShowCreatePayLink(false);
      setPayLinkAmount('');
      setPayLinkMessage('');
      setPayLinkExpiry('7');
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create pay link.", variant: "destructive" });
    },
  });

  const cancelPayLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/pay-links/${id}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pay-links'] });
      toast({ title: "Pay Link Canceled", description: "The payment link has been deactivated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to cancel pay link.", variant: "destructive" });
    },
  });

  const copyPayLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(id);
      toast({ title: "Link Copied!", description: "Payment link copied to clipboard." });
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch {
      toast({ title: "Copy Failed", description: "Please copy the link manually.", variant: "destructive" });
    }
  };

  // Delete payment method mutation
  const deletePaymentMethod = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/payment-methods/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
      toast({
        title: "Payment Method Removed",
        description: "Your payment method has been removed.",
      });
    },
  });

  // Set default payment method mutation
  const setDefaultPaymentMethod = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/payment-methods/${id}/default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
      toast({
        title: "Default Payment Method Updated",
        description: "Your default payment method has been updated.",
      });
    },
  });

  // Add funds mutation
  const addFundsMutation = useMutation({
    mutationFn: async ({ amount, paymentMethodId, idempotencyToken }: { amount: number; paymentMethodId: string; idempotencyToken: string }) => {
      const response = await apiRequest("POST", "/api/add-funds", {
        amountCents: Math.round(amount * 100),
        paymentMethodId,
        idempotencyToken // Reuse the stored token to prevent duplicate charges
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate all relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/user/billing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      
      toast({
        title: "Funds Added Successfully",
        description: `$${(data.amountCents / 100).toFixed(2)} has been added to your account balance.`,
      });
      
      // Reset form
      setFundAmount('');
      setSelectedPaymentMethod('');
      setCurrentIdempotencyToken(null); // Clear the idempotency token for next transaction
      setShowAddFunds(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Add Funds",
        description: error.message || "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (userLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

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
              <nav className="hidden md:ml-10 md:flex md:space-x-8">
                <Link href="/dashboard" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-dashboard">Dashboard</Link>
                <Link href="/billing" className="text-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-billing">Billing</Link>
                <a href="#" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium">History</a>
                <a href="#" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium">Settings</a>
                <a href="https://debttolegacy.com/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-contact">Contact</a>
              </nav>
            </div>
            
            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" data-testid="button-mobile-menu">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                  </svg>
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle>Felix Pay</SheetTitle>
                  <SheetDescription>Navigate your bill payment dashboard</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col mt-6 space-y-4">
                  <Link 
                    href="/dashboard" 
                    className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                    data-testid="mobile-link-dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link 
                    href="/billing" 
                    className="text-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                    data-testid="mobile-link-billing"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Billing
                  </Link>
                  <a 
                    href="#" 
                    className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    History
                  </a>
                  <a 
                    href="#" 
                    className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Settings
                  </a>
                  <a 
                    href="https://debttolegacy.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border"
                    data-testid="mobile-link-contact"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Contact
                  </a>
                  
                  {/* Account Balance for Mobile */}
                  <div className="flex items-center bg-muted rounded-lg px-3 py-3 mt-6" data-testid="mobile-balance-display">
                    <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                    </svg>
                    <span className="text-sm font-medium text-foreground" data-testid="mobile-text-balance">
                      Account Balance: ${((authUser as any)?.accountBalance || 0) / 100}
                    </span>
                  </div>
                  
                  {/* User Info for Mobile */}
                  <div className="flex items-center space-x-3 px-3 py-3 bg-muted rounded-lg" data-testid="mobile-user-info">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      {(authUser as any)?.profileImageUrl ? (
                        <img 
                          src={(authUser as any).profileImageUrl} 
                          alt="Profile" 
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary-foreground text-sm font-medium">
                          {(authUser as any)?.firstName?.[0] || (authUser as any)?.email?.[0] || 'U'}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground" data-testid="mobile-text-username">
                      {(authUser as any)?.firstName || (authUser as any)?.email || 'User'}
                    </span>
                  </div>
                  
                  {/* Logout Button for Mobile */}
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => window.location.href = '/api/logout'}
                    data-testid="mobile-button-logout"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                    </svg>
                    Sign Out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <div className="flex items-center space-x-4">
              {/* Account Balance */}
              <div className="hidden sm:flex items-center bg-muted rounded-lg px-3 py-2" data-testid="balance-display">
                <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                </svg>
                <span className="text-sm font-medium text-foreground" data-testid="text-balance">
                  ${((authUser as any)?.accountBalance || 0) / 100}
                </span>
              </div>

              <div className="flex items-center space-x-3" data-testid="user-info">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  {(authUser as any)?.profileImageUrl ? (
                    <img 
                      src={(authUser as any).profileImageUrl} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-primary-foreground text-sm font-medium">
                      {(authUser as any)?.firstName?.[0] || (authUser as any)?.email?.[0] || 'U'}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground" data-testid="text-username">
                  {(authUser as any)?.firstName || (authUser as any)?.email || 'User'}
                </span>
              </div>
              <button 
                className="text-muted-foreground hover:text-foreground p-2"
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing & Payment Methods</h1>
        <p className="text-muted-foreground">Manage your payment methods and view your billing information</p>
      </div>

      {/* Profile Name */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User2 className="h-5 w-5" />
                Profile Name
              </CardTitle>
              <CardDescription>This name appears on pay links and payment receipts</CardDescription>
            </div>
            {!editingProfile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setProfileFirstName(user?.firstName || '');
                  setProfileLastName(user?.lastName || '');
                  setEditingProfile(true);
                }}
                title="Edit name"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingProfile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profileFirstName}
                    onChange={(e) => setProfileFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profileLastName}
                    onChange={(e) => setProfileLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => updateProfileMutation.mutate({ firstName: profileFirstName, lastName: profileLastName })}
                  disabled={updateProfileMutation.isPending || (!profileFirstName.trim() && !profileLastName.trim())}
                  size="sm"
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingProfile(false)}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-lg font-medium">
              {user?.firstName || user?.lastName
                ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
                : <span className="text-muted-foreground italic">No name set - tap the edit icon to add your name</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Membership Banner */}
      <Link href="/membership">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 dark:border-blue-800">
          <CardContent className="py-4 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-sm">Financial Operating System</p>
                  <p className="text-xs text-muted-foreground">
                    {membershipStatus?.active && membershipStatus.tier
                      ? `${membershipStatus.tier.charAt(0).toUpperCase() + membershipStatus.tier.slice(1)} plan - manage your subscription`
                      : 'Enter your financial command center'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {membershipStatus?.active && membershipStatus.tier && (
                  <Badge variant="default" className={`text-xs ${
                    membershipStatus.tier === 'legacy' ? 'bg-purple-600' :
                    membershipStatus.tier === 'momentum' ? 'bg-blue-600' : 'bg-emerald-600'
                  }`}>
                    {membershipStatus.tier.charAt(0).toUpperCase() + membershipStatus.tier.slice(1)}
                  </Badge>
                )}
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Account Balance */}
      <Card data-testid="card-balance">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Account Balance
              </CardTitle>
              <CardDescription>Your current account balance for bill payments</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchBalance()}
              disabled={balanceRefetching}
              title="Refresh balance"
            >
              <RefreshCw className={`h-4 w-4 ${balanceRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600" data-testid="text-balance">
            {formatCurrency(user?.accountBalance || 0)}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            This balance is used to pay for check printing and mailing costs
          </p>
        </CardContent>
      </Card>

      {/* Add Funds */}
      <Card data-testid="card-add-funds">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Add Funds
              </CardTitle>
              <CardDescription>Add money to your account balance from your saved payment methods</CardDescription>
            </div>
            <Button 
              onClick={() => setShowAddFunds(!showAddFunds)}
              variant={showAddFunds ? "outline" : "default"}
              data-testid="button-toggle-add-funds"
            >
              <Plus className="h-4 w-4 mr-2" />
              {showAddFunds ? 'Cancel' : 'Add Funds'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddFunds && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.5"
                    placeholder="Enter amount"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    data-testid="input-fund-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-method">Payment Method</Label>
                  {paymentMethods.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-3 border rounded-md">
                      No payment methods available. Add a card first.
                    </div>
                  ) : (
                    <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.id}>
                            {method.brand} •••• {method.last4}
                            {method.isDefault && " (Default)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              
              {/* Fee breakdown */}
              {feeBreakdown && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Payment Summary</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount to add:</span>
                    <span>${(feeBreakdown.requestedCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Processing fee (2.9% + $0.30):</span>
                    <span>${(feeBreakdown.feeCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t pt-2">
                    <span>Total charge:</span>
                    <span>${(feeBreakdown.totalCents / 100).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    The processing fee covers card transaction costs. Your account will receive ${(feeBreakdown.requestedCents / 100).toFixed(2)}.
                  </p>
                </div>
              )}
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowAddFunds(false);
                    setFundAmount('');
                    setSelectedPaymentMethod('');
                    setCurrentIdempotencyToken(null); // Clear idempotency token on cancel
                  }}
                  data-testid="button-cancel-add-funds"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    const amount = parseFloat(fundAmount);
                    if (!amount || amount < 0.5) {
                      toast({
                        title: "Invalid Amount",
                        description: "Please enter a valid amount of at least $0.50.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!selectedPaymentMethod) {
                      toast({
                        title: "No Payment Method Selected",
                        description: "Please select a payment method.",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Generate idempotency token only once per transaction attempt
                    const idempotencyToken = currentIdempotencyToken || nanoid();
                    if (!currentIdempotencyToken) {
                      setCurrentIdempotencyToken(idempotencyToken);
                    }
                    
                    addFundsMutation.mutate({ 
                      amount, 
                      paymentMethodId: selectedPaymentMethod,
                      idempotencyToken
                    });
                  }}
                  disabled={addFundsMutation.isPending || !fundAmount || !selectedPaymentMethod || paymentMethods.length === 0}
                  data-testid="button-add-funds"
                >
                  {addFundsMutation.isPending ? 'Processing...' : feeBreakdown ? `Pay $${(feeBreakdown.totalCents / 100).toFixed(2)}` : 'Add Funds'}
                </Button>
              </div>
              
              {fundAmount && selectedPaymentMethod && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  <strong>Summary:</strong> Add ${parseFloat(fundAmount || '0').toFixed(2)} to your account balance using{' '}
                  {paymentMethods.find(m => m.id === selectedPaymentMethod)?.brand} •••• {paymentMethods.find(m => m.id === selectedPaymentMethod)?.last4}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card data-testid="card-payment-methods">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>Manage your credit cards and payment methods</CardDescription>
            </div>
            <Button 
              onClick={() => setShowAddForm(!showAddForm)}
              variant={showAddForm ? "outline" : "default"}
              data-testid="button-toggle-add-form"
            >
              <Plus className="h-4 w-4 mr-2" />
              {showAddForm ? 'Cancel' : 'Add Payment Method'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddForm && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Payment Method Type Selector */}
                  <div>
                    <Label className="text-sm font-medium">Payment Method Type</Label>
                    <div className="flex gap-4 mt-2">
                      <Button
                        type="button"
                        variant={paymentMethodType === 'card' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPaymentMethodType('card')}
                        className="flex items-center gap-2"
                        data-testid="button-select-card"
                      >
                        <CreditCard className="h-4 w-4" />
                        Credit Card
                      </Button>
                      {ENABLE_BANK_ACCOUNTS ? (
                        <Button
                          type="button"
                          variant={paymentMethodType === 'bank_account' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPaymentMethodType('bank_account')}
                          className="flex items-center gap-2"
                          data-testid="button-select-bank"
                        >
                          <Building2 className="h-4 w-4" />
                          Bank Account
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled
                          className="flex items-center gap-2 opacity-50 cursor-not-allowed"
                          data-testid="button-bank-coming-soon"
                        >
                          <Building2 className="h-4 w-4" />
                          Bank Account (Coming Soon)
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Conditional Form Rendering */}
                  <Elements stripe={stripePromise}>
                    <AddPaymentMethodForm 
                      onSuccess={() => setShowAddForm(false)} 
                      paymentMethodType={paymentMethodType}
                    />
                  </Elements>
                </div>
              </CardContent>
            </Card>
          )}

          {methodsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : paymentMethods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No payment methods added yet</p>
              <p className="text-sm">Add a card to automatically pay for your bills</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <div 
                  key={method.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`card-method-${method.id}`}
                >
                  <div className="flex items-center gap-4">
                    {method.type === 'card' ? (
                      <CreditCard className="h-6 w-6" />
                    ) : (
                      <Building2 className="h-6 w-6" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {method.type === 'card' ? (
                            `${method.brand} •••• ${method.last4}`
                          ) : (
                            `${method.bankName || 'Bank Account'} •••• ${method.last4}`
                          )}
                        </span>
                        {method.isDefault && (
                          <Badge variant="default" data-testid="badge-default">Default</Badge>
                        )}
                      </div>
                      {method.type === 'bank_account' && (
                        <div className="text-sm text-muted-foreground">
                          {method.accountType === 'checking' ? 'Checking' : 'Savings'} Account
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!method.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultPaymentMethod.mutate(method.id)}
                        disabled={setDefaultPaymentMethod.isPending}
                        data-testid={`button-set-default-${method.id}`}
                      >
                        Set Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePaymentMethod.mutate(method.id)}
                      disabled={deletePaymentMethod.isPending}
                      data-testid={`button-delete-${method.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Assurance Section */}
      <Card className="bg-muted/30" data-testid="card-security">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-lg">Bank-Level Security</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* SSL Encryption */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full">
                  <Lock className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">256-bit SSL Encryption</p>
                  <p className="text-xs text-muted-foreground">Industry-standard encryption protects all data transmission</p>
                </div>
              </div>

              {/* PCI Compliance */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                  <Award className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">PCI DSS Compliant</p>
                  <p className="text-xs text-muted-foreground">Meets the highest payment card industry standards</p>
                </div>
              </div>

              {/* Trusted Partners */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-full">
                  <CheckCircle className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Trusted Partners</p>
                  <p className="text-xs text-muted-foreground">Secured by Stripe and other trusted payment providers</p>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground mt-4 pt-4 border-t">
              <p>Your payment information is never stored on our servers. All transactions are processed securely by our certified payment partners.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pay Links - Request Payment from Others */}
      <Card data-testid="card-pay-links">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Pay Links
              </CardTitle>
              <CardDescription>Generate a payment link someone else can use to add funds to your balance</CardDescription>
            </div>
            <Button
              onClick={() => setShowCreatePayLink(!showCreatePayLink)}
              variant={showCreatePayLink ? "outline" : "default"}
            >
              <Plus className="h-4 w-4 mr-2" />
              {showCreatePayLink ? 'Cancel' : 'Create Pay Link'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreatePayLink && (
            <Card className="border-dashed">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paylink-amount">Amount ($)</Label>
                    <Input
                      id="paylink-amount"
                      type="number"
                      step="0.01"
                      min="1"
                      placeholder="Enter amount"
                      value={payLinkAmount}
                      onChange={(e) => setPayLinkAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paylink-expiry">Expires In</Label>
                    <Select value={payLinkExpiry} onValueChange={setPayLinkExpiry}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select expiry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 day</SelectItem>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paylink-message">Message (optional)</Label>
                  <Input
                    id="paylink-message"
                    placeholder="e.g., Help me pay my electric bill"
                    value={payLinkMessage}
                    onChange={(e) => setPayLinkMessage(e.target.value)}
                    maxLength={500}
                  />
                </div>
                {payLinkAmount && parseFloat(payLinkAmount) >= 1 && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Your balance will receive:</span>
                      <span className="font-medium">${parseFloat(payLinkAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payer will be charged (incl. fees):</span>
                      <span className="font-medium">
                        ${(Math.ceil((parseFloat(payLinkAmount) * 100 + 30) / (1 - 0.029)) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={createPayLinkMutation.isPending || !payLinkAmount || parseFloat(payLinkAmount) < 1}
                  onClick={() => {
                    const amount = parseFloat(payLinkAmount);
                    if (amount < 1) return;
                    createPayLinkMutation.mutate({
                      amountCents: Math.round(amount * 100),
                      message: payLinkMessage || undefined,
                      expiresInDays: parseInt(payLinkExpiry),
                    });
                  }}
                >
                  {createPayLinkMutation.isPending ? 'Creating...' : 'Create Pay Link'}
                </Button>
              </CardContent>
            </Card>
          )}

          {payLinksLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : payLinksData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <LinkIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pay links created yet</p>
              <p className="text-sm">Create a payment link to let someone else add funds to your account</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payLinksData.map((link) => (
                <div
                  key={link.id}
                  className={`p-4 border rounded-lg ${
                    link.status === 'paid' ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200' :
                    link.status === 'active' ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200' :
                    'bg-muted/30 border-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-lg">{formatCurrency(link.amountCents)}</span>
                        <Badge variant={
                          link.status === 'paid' ? 'default' :
                          link.status === 'active' ? 'secondary' :
                          'outline'
                        } className={
                          link.status === 'paid' ? 'bg-green-600' :
                          link.status === 'active' ? 'bg-blue-600 text-white' :
                          ''
                        }>
                          {link.status === 'paid' ? 'Paid' :
                           link.status === 'active' ? 'Active' :
                           link.status === 'expired' ? 'Expired' : 'Canceled'}
                        </Badge>
                      </div>
                      {link.message && (
                        <p className="text-sm text-muted-foreground mt-1">"{link.message}"</p>
                      )}
                      {link.status === 'paid' && link.payerName && (
                        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                          Paid by {link.payerName}
                          {link.paidAt && ` on ${new Date(link.paidAt).toLocaleDateString()}`}
                        </p>
                      )}
                      {link.status === 'active' && link.expiresAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Expires {new Date(link.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Created {new Date(link.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {link.status === 'active' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyPayLink(link.payUrl, link.id)}
                            className="flex items-center gap-1"
                          >
                            {copiedLinkId === link.id ? (
                              <><CheckCircle className="h-3 w-3" /> Copied</>
                            ) : (
                              <><Copy className="h-3 w-3" /> Copy Link</>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelPayLinkMutation.mutate(link.id)}
                            disabled={cancelPayLinkMutation.isPending}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card data-testid="card-transactions">
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>View your billing transactions and deposit history</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all" className="flex items-center gap-2" data-testid="tab-all-transactions">
                <History className="h-4 w-4" />
                All Transactions
              </TabsTrigger>
              <TabsTrigger value="deposits" className="flex items-center gap-2" data-testid="tab-deposits">
                <TrendingUp className="h-4 w-4" />
                Deposit History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-6">
              {transactionsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No transactions yet</p>
                  <p className="text-sm">Transaction history will appear here after your first bill payment</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <div 
                      key={transaction.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`transaction-${transaction.id}`}
                    >
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${transaction.amountCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {transaction.amountCents < 0 ? '-' : '+'}{formatCurrency(Math.abs(transaction.amountCents))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="deposits" className="mt-6">
              {transactionsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : deposits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No deposits yet</p>
                  <p className="text-sm">Your deposit history will appear here after adding funds to your account</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deposits.map((deposit) => (
                    <div 
                      key={deposit.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-green-50/50 dark:bg-green-900/10"
                      data-testid={`deposit-${deposit.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">{deposit.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(deposit.createdAt).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600 text-lg">
                          +{formatCurrency(deposit.amountCents)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Deposit
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Deposit Summary */}
                  <div className="mt-6 pt-4 border-t bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        <span className="font-medium">Total Deposits</span>
                      </div>
                      <p className="font-bold text-green-600 text-xl">
                        {formatCurrency(deposits.reduce((sum, deposit) => sum + deposit.amountCents, 0))}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {deposits.length} deposit{deposits.length !== 1 ? 's' : ''} made to your account
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      </main>
    </div>
  );
}