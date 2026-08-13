import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  TrendingUp, PiggyBank, CreditCard, Target, Wallet, DollarSign,
  Building2, ShieldCheck, BookCheck, Coins, LineChart, CheckCircle,
  Crown, ArrowRight, ExternalLink, Zap, Star, Check, ChevronRight
} from "lucide-react";

interface MembershipStatus {
  status: string;
  active: boolean;
  tier: string | null;
  billingCadence?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string;
}

const TIER_CONFIG = {
  control: {
    name: 'CONTROL',
    phase: 'Phase 1 – Stabilize',
    monthlyPrice: 24,
    annualPrice: 240,
    icon: ShieldCheck,
    cta: 'Enter Control',
    description: 'Master your financial foundation',
    features: [
      'FinanceWatch (core dashboard)',
      'ExpenseWatch',
      'BillWatch',
      'IncomeLift',
      'Basic reports & insights',
      'Email support',
    ],
  },
  momentum: {
    name: 'MOMENTUM',
    phase: 'Phase 2 – Eliminate',
    monthlyPrice: 39,
    annualPrice: 390,
    icon: Zap,
    popular: true,
    trial: true,
    cta: 'Start Momentum (14-Day Trial)',
    description: 'Accelerate your financial growth',
    features: [
      'Everything in Control',
      'DIY Debt Defense',
      'SavingsPro',
      'Advanced cash flow projections',
      'Smart bill optimization insights',
      'Priority support',
    ],
  },
  legacy: {
    name: 'LEGACY',
    phase: 'Phase 3 – Build',
    monthlyPrice: 59,
    annualPrice: 590,
    icon: Crown,
    cta: 'Enter Legacy',
    description: 'Build generational wealth',
    features: [
      'Everything in Momentum',
      'SteadyVest',
      'WealthWatch analytics',
      'Felix Pay automation suite',
      'Felix CheckBook services',
      'AI-driven financial insights',
      'Quarterly strategy sessions',
    ],
  },
};

const tools = [
  { name: 'FinanceWatch', icon: Building2, url: 'https://financewatch.app', tier: 'control' },
  { name: 'ExpenseWatch', icon: DollarSign, url: 'https://expensewatch.pro', tier: 'control' },
  { name: 'BillWatch', icon: CreditCard, url: 'https://billwatch.pro', tier: 'control' },
  { name: 'IncomeLift', icon: TrendingUp, url: 'https://incomelift.co', tier: 'control' },
  { name: 'DIY Debt', icon: Target, url: 'https://diydebt.org', tier: 'momentum' },
  { name: 'SavingsPro', icon: Coins, url: 'https://savingspro.app', tier: 'momentum' },
  { name: 'SteadyVest', icon: PiggyBank, url: 'https://steadyvest.org', tier: 'legacy' },
  { name: 'WealthWatch', icon: LineChart, url: 'https://wealth-watch.app', tier: 'legacy' },
  { name: 'Felix Pay', icon: Wallet, url: null, tier: 'legacy', current: true },
  { name: 'Felix CheckBook', icon: BookCheck, url: 'https://felixcheck.com', tier: 'legacy' },
];

function tierIncludes(userTier: string, requiredTier: string): boolean {
  const order = ['control', 'momentum', 'legacy'];
  return order.indexOf(userTier) >= order.indexOf(requiredTier);
}

export default function MembershipPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [annual, setAnnual] = useState(false);
  const { isAuthenticated } = useAuth();
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const params = new URLSearchParams(window.location.search);
  const urlRecommended = params.get('recommended') as string | null;

  const { data: phaseData } = useQuery<{ phase: string | null }>({
    queryKey: ['/api/user/phase'],
    enabled: isAuthenticated && !urlRecommended,
  });

  const phaseToTier: Record<string, string> = { STABILIZE: 'control', ELIMINATE: 'momentum', BUILD: 'legacy' };
  const recommended = urlRecommended || (phaseData?.phase ? phaseToTier[phaseData.phase] : null) || null;

  const { data: membershipStatus, isLoading } = useQuery<MembershipStatus>({
    queryKey: ['/api/membership/status'],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (params.get('membership') === 'success') {
      toast({ title: "Welcome to the Suite!", description: "Your membership is now active. You have access to your financial tools." });
      queryClient.invalidateQueries({ queryKey: ['/api/membership/status'] });
      window.history.replaceState({}, '', '/membership');
    } else if (params.get('membership') === 'canceled') {
      toast({ title: "Checkout Canceled", description: "You can subscribe anytime to unlock your tools.", variant: "destructive" });
      window.history.replaceState({}, '', '/membership');
    }
  }, []);

  useEffect(() => {
    if (recommended && cardRefs.current[recommended]) {
      setTimeout(() => {
        cardRefs.current[recommended]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
    }
  }, [recommended, phaseData]);

  const checkoutMutation = useMutation({
    mutationFn: async ({ tier, cadence }: { tier: string; cadence: string }) => {
      const response = await apiRequest("POST", "/api/membership/checkout", { tier, cadence });
      return response.json();
    },
    onSuccess: (data: { checkoutUrl: string }) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to start checkout.", variant: "destructive" });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/membership/portal");
      return response.json();
    },
    onSuccess: (data: { portalUrl: string }) => {
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to open billing portal.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Skeleton className="h-12 w-64 mx-auto mb-8" />
          <Skeleton className="h-48 w-full mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-96" />)}
          </div>
        </div>
      </div>
    );
  }

  const isActive = membershipStatus?.active;
  const currentTier = membershipStatus?.tier;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <h1 className="text-xl sm:text-2xl font-bold text-primary">Debt to Legacy</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {isActive && currentTier === 'legacy' && (
                <Button variant="outline" size="sm" onClick={() => setLocation('/dashboard')}>
                  Enter Felix Pay
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <p className="text-sm font-medium text-primary mb-2 tracking-wider uppercase">Your Financial Operating System</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Choose Your Phase.<br className="hidden sm:block" /> Enter Your Financial Command Center.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            From stabilization to legacy-building, your financial system starts here.
          </p>

          {/* Phase Progress Bar */}
          <div className="flex items-center justify-center gap-0 max-w-md mx-auto">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center border-2 border-emerald-500">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-emerald-600 mt-1.5">STABILIZE</span>
            </div>
            <div className="flex-1 h-0.5 bg-gradient-to-r from-emerald-400 to-blue-400 mx-1 mt-[-12px]" />
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center border-2 border-blue-500">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-semibold text-blue-600 mt-1.5">ELIMINATE</span>
            </div>
            <div className="flex-1 h-0.5 bg-gradient-to-r from-blue-400 to-purple-400 mx-1 mt-[-12px]" />
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center border-2 border-purple-500">
                <Crown className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-xs font-semibold text-purple-600 mt-1.5">BUILD</span>
            </div>
          </div>
        </div>

        {/* Active Membership Banner */}
        {isActive && currentTier && (
          <Card className="mb-8 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 dark:border-green-800">
            <CardContent className="py-5 px-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <Crown className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{TIER_CONFIG[currentTier as keyof typeof TIER_CONFIG]?.name} Member</h3>
                      <Badge className="bg-green-600">Active</Badge>
                      {membershipStatus?.status === 'trialing' && (
                        <Badge variant="outline" className="border-blue-400 text-blue-600">Trial</Badge>
                      )}
                    </div>
                    {membershipStatus?.currentPeriodEnd && (
                      <p className="text-sm text-muted-foreground">
                        {membershipStatus.cancelAtPeriodEnd
                          ? `Access until ${new Date(membershipStatus.currentPeriodEnd).toLocaleDateString()}`
                          : `Renews ${new Date(membershipStatus.currentPeriodEnd).toLocaleDateString()}`
                        }
                        {membershipStatus.billingCadence === 'annual' ? ' (Annual)' : ' (Monthly)'}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? 'Loading...' : 'Manage Subscription'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expired/Canceled Banner */}
        {!isActive && membershipStatus?.status && membershipStatus.status !== 'inactive' && (
          <Card className="mb-8 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 dark:border-amber-800">
            <CardContent className="py-5 px-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    {membershipStatus.status === 'canceled' ? 'Your subscription has ended' :
                     membershipStatus.status === 'past_due' ? 'Payment failed — action needed' :
                     'Your subscription has expired'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {membershipStatus.status === 'past_due'
                      ? 'Please update your payment method or choose a new plan below to restore access.'
                      : 'Choose a plan below to regain access to your financial tools.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Billing Toggle */}
        {!isActive && (
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className={`text-sm font-medium ${!annual ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <span className={`text-sm font-medium ${annual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Annual
            </span>
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              Save 2 months
            </Badge>
          </div>
        )}

        {/* Pricing Cards */}
        {!isActive && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {(Object.entries(TIER_CONFIG)).map(([key, config]) => {
              const Icon = config.icon;
              const isPopular = key === 'momentum';
              const hasTrial = key === 'momentum';
              const isRecommended = recommended === key;
              const price = annual ? config.annualPrice : config.monthlyPrice;
              const perMonth = annual ? Math.round(config.annualPrice / 12) : config.monthlyPrice;

              return (
                <Card
                  key={key}
                  ref={(el: HTMLDivElement | null) => { cardRefs.current[key] = el; }}
                  className={`relative flex flex-col transition-all duration-300 ${
                    isRecommended
                      ? 'border-2 border-primary shadow-xl shadow-primary/15 scale-[1.03] ring-2 ring-primary/20'
                      : isPopular
                        ? 'border-2 border-blue-500 shadow-lg shadow-blue-500/10 scale-[1.02]'
                        : ''
                  }`}
                >
                  {isRecommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge className="bg-primary px-3 py-1 text-xs font-semibold whitespace-nowrap">
                        <Star className="h-3 w-3 mr-1" /> Recommended For You
                      </Badge>
                    </div>
                  )}
                  {isPopular && !isRecommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-600 px-3 py-1 text-xs font-semibold">
                        <Star className="h-3 w-3 mr-1" /> Most Popular
                      </Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-5 w-5 ${
                        key === 'control' ? 'text-emerald-600' :
                        key === 'momentum' ? 'text-blue-600' : 'text-purple-600'
                      }`} />
                      <CardTitle className="text-lg">{config.name}</CardTitle>
                    </div>
                    <p className={`text-xs font-semibold tracking-wide uppercase ${
                      key === 'control' ? 'text-emerald-600' :
                      key === 'momentum' ? 'text-blue-600' : 'text-purple-600'
                    }`}>
                      Best for: {config.phase}
                    </p>
                    <CardDescription className="mt-1">{config.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">${perMonth}</span>
                        <span className="text-muted-foreground">/mo</span>
                      </div>
                      {annual && (
                        <p className="text-sm text-muted-foreground mt-1">
                          ${price}/year — 2 months free
                        </p>
                      )}
                      {hasTrial && (
                        <p className="text-sm text-blue-600 font-medium mt-1">
                          14-day free trial included
                        </p>
                      )}
                    </div>

                    <ul className="space-y-2.5 mb-6 flex-1">
                      {config.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                            key === 'control' ? 'text-emerald-500' :
                            key === 'momentum' ? 'text-blue-500' : 'text-purple-500'
                          }`} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={`w-full ${
                        isRecommended
                          ? 'bg-primary hover:bg-primary/90'
                          : isPopular
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : key === 'legacy'
                              ? 'bg-purple-600 hover:bg-purple-700'
                              : ''
                      }`}
                      variant={key === 'control' && !isRecommended ? 'outline' : 'default'}
                      size="lg"
                      onClick={() => {
                        if (!isAuthenticated) {
                          window.location.href = '/api/login';
                          return;
                        }
                        checkoutMutation.mutate({ tier: key, cadence: annual ? 'annual' : 'monthly' });
                      }}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending ? 'Loading...' : config.cta}
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tools Grid */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-center mb-2">Your Financial Command Center</h3>
          <p className="text-muted-foreground text-center mb-6">
            {isActive ? 'Access your tools based on your current plan' : 'All tools included across our three tiers'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const hasAccess = isActive && currentTier && tierIncludes(currentTier, tool.tier);
              const tierLabel = tool.tier === 'control' ? 'Control+' : tool.tier === 'momentum' ? 'Momentum+' : 'Legacy';

              return (
                <Card
                  key={tool.name}
                  className={`transition-all ${
                    tool.current ? 'border-primary' : ''
                  } ${hasAccess ? 'hover:shadow-md' : 'opacity-60'}`}
                >
                  <CardContent className="py-4 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${hasAccess ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium text-sm">{tool.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] px-1.5">{tierLabel}</Badge>
                      {hasAccess ? (
                        tool.current ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => setLocation('/dashboard')}
                          >
                            Open <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        ) : tool.url ? (
                          <a href={tool.url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                              Open <ExternalLink className="ml-1 h-3 w-3" />
                            </Button>
                          </a>
                        ) : null
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Questions? Visit <a href="https://debttolegacy.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Debt to Legacy</a> or contact us anytime.
          </p>
        </div>
      </main>

      <footer className="border-t border-border bg-background/95 backdrop-blur-sm mt-8">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center space-x-6 text-sm text-muted-foreground">
              <a href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</a>
              <a href="/terms-of-use" className="hover:text-foreground transition-colors">Terms of Use</a>
              <a href="https://debttolegacy.com/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Contact</a>
            </div>
            <p className="text-xs text-muted-foreground">
              © 2025 Debt to Legacy LLC. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
