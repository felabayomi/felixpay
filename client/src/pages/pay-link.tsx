import { useState, useEffect } from "react";
import { useParams, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, DollarSign, CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface PayLinkPublicData {
  token: string;
  amountCents: number;
  message: string | null;
  status: string;
  expiresAt: string | null;
  userName: string;
  isPaid: boolean;
  payerName?: string;
}

export default function PayLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const isSuccess = searchParams.get("success") === "true";
  const isCanceled = searchParams.get("canceled") === "true";

  const [payLinkData, setPayLinkData] = useState<PayLinkPublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    async function fetchPayLink() {
      try {
        const res = await fetch(`/api/pay-links/public/${token}`);
        if (res.status === 404) {
          setError("This payment link was not found.");
          return;
        }
        if (res.status === 410) {
          const data = await res.json();
          setError(data.message || "This payment link is no longer available.");
          return;
        }
        if (!res.ok) {
          setError("Something went wrong. Please try again later.");
          return;
        }
        const data = await res.json();
        setPayLinkData(data);
      } catch {
        setError("Unable to load payment link. Please check your connection.");
      } finally {
        setLoading(false);
      }
    }
    if (token) fetchPayLink();
  }, [token]);

  const handlePay = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(`/api/pay-links/public/${token}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Failed to start payment.");
        return;
      }
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } catch {
      setError("Failed to start payment. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-12 w-1/2 mx-auto" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess || (payLinkData && payLinkData.isPaid)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-green-800">Payment Successful!</h1>
            <p className="text-muted-foreground">
              {payLinkData
                ? `Your payment of ${formatCurrency(payLinkData.amountCents)} to ${payLinkData.userName} has been received.`
                : "Your payment has been received. Thank you!"}
            </p>
            <p className="text-sm text-muted-foreground">
              The funds will be added to their Felix Pay balance shortly.
            </p>
            <div className="pt-4 border-t">
              <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs">Secured by Felix Pay & Stripe</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isCanceled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-6">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-yellow-800">Payment Canceled</h1>
            <p className="text-muted-foreground">
              The payment was not completed. You can try again using the button below.
            </p>
            {payLinkData && (
              <Button onClick={handlePay} disabled={checkoutLoading} className="w-full" size="lg">
                {checkoutLoading ? "Loading..." : `Try Again - ${formatCurrency(payLinkData.amountCents)}`}
              </Button>
            )}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs">Secured by Felix Pay & Stripe</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-red-800">Link Unavailable</h1>
            <p className="text-muted-foreground">{error}</p>
            <Link href="/">
              <Button variant="outline" className="mt-4">Go to Felix Pay</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!payLinkData) return null;

  const STRIPE_FEE_PERCENT = 0.029;
  const STRIPE_FEE_FIXED_CENTS = 30;
  const chargeAmountCents = Math.ceil(
    (payLinkData.amountCents + STRIPE_FEE_FIXED_CENTS) / (1 - STRIPE_FEE_PERCENT)
  );
  const feeCents = chargeAmountCents - payLinkData.amountCents;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-primary">Felix Pay</span>
          </div>
          <CardTitle className="text-lg font-medium text-muted-foreground">
            {payLinkData.userName} is requesting a payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-foreground">
              {formatCurrency(payLinkData.amountCents)}
            </div>
            {payLinkData.message && (
              <p className="mt-3 text-muted-foreground bg-muted rounded-lg p-3 text-sm">
                "{payLinkData.message}"
              </p>
            )}
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment amount:</span>
              <span>{formatCurrency(payLinkData.amountCents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Processing fee (2.9% + $0.30):</span>
              <span>{formatCurrency(feeCents)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium border-t pt-2">
              <span>Total charge:</span>
              <span>{formatCurrency(chargeAmountCents)}</span>
            </div>
          </div>

          {payLinkData.expiresAt && (
            <div className="flex items-center justify-center text-xs text-muted-foreground space-x-1">
              <Clock className="h-3 w-3" />
              <span>Expires {new Date(payLinkData.expiresAt).toLocaleDateString()}</span>
            </div>
          )}

          <Button
            onClick={handlePay}
            disabled={checkoutLoading}
            className="w-full"
            size="lg"
          >
            {checkoutLoading ? (
              "Redirecting to payment..."
            ) : (
              <>
                <DollarSign className="h-5 w-5 mr-2" />
                Pay {formatCurrency(chargeAmountCents)}
              </>
            )}
          </Button>

          <div className="text-center space-y-2">
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs">Payments secured by Stripe</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This payment goes directly to {payLinkData.userName}'s Felix Pay account balance to help pay their bills.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
