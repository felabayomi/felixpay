import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import BillingPage from "@/pages/billing";
import MembershipPage from "@/pages/membership";
import About from "@/pages/about";
import FAQ from "@/pages/faq";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfUse from "@/pages/terms-of-use";
import HowToUse from "@/pages/how-to-use";
import PayLinkPage from "@/pages/pay-link";
import NotFound from "@/pages/not-found";
import { useClerk } from "@clerk/clerk-react";
import { useEffect } from "react";

function AuthRedirectCompatibility() {
  const { openSignIn, signOut } = useClerk();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signIn") === "true") openSignIn({ redirectUrl: window.location.pathname });
    if (params.get("signOut") === "true") void signOut({ redirectUrl: "/" });
  }, [openSignIn, signOut]);
  return null;
}

function MembershipGate({ component: Component, requiredTier }: { component: React.ComponentType; requiredTier?: string }) {
  const { data: membership, isLoading } = useQuery<{ active: boolean; tier: string | null }>({
    queryKey: ['/api/membership/status'],
  });

  if (isLoading) return null;
  if (!membership?.active) return <Redirect to="/membership" />;
  
  if (requiredTier) {
    const tierOrder = ['control', 'momentum', 'legacy'];
    const userTierIndex = tierOrder.indexOf(membership.tier || '');
    const requiredTierIndex = tierOrder.indexOf(requiredTier);
    if (userTierIndex < requiredTierIndex) return <Redirect to="/membership" />;
  }
  
  return <Component />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/about" component={About} />
          <Route path="/faq" component={FAQ} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms-of-use" component={TermsOfUse} />
          <Route path="/how-to-use" component={HowToUse} />
          <Route path="/pay/:token" component={PayLinkPage} />
          <Route path="/dashboard" component={Landing} />
          <Route path="/billing" component={Landing} />
          <Route path="/membership" component={MembershipPage} />
        </>
      ) : (
        <>
          <Route path="/membership" component={MembershipPage} />
          <Route path="/">{() => <MembershipGate component={Dashboard} requiredTier="legacy" />}</Route>
          <Route path="/dashboard">{() => <MembershipGate component={Dashboard} requiredTier="legacy" />}</Route>
          <Route path="/billing">{() => <MembershipGate component={BillingPage} requiredTier="legacy" />}</Route>
          <Route path="/about" component={About} />
          <Route path="/faq" component={FAQ} />
          <Route path="/privacy-policy" component={PrivacyPolicy} />
          <Route path="/terms-of-use" component={TermsOfUse} />
          <Route path="/how-to-use" component={HowToUse} />
          <Route path="/pay/:token" component={PayLinkPage} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthRedirectCompatibility />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
