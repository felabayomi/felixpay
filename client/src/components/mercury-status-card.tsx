import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MercuryStatusData {
  success: boolean;
  status: 'healthy' | 'not_configured' | 'api_error' | 'error' | 'misconfigured';
  message: string;
  hasConnection: boolean;
  primaryAccount?: {
    id: string;
    name: string;
    type: string;
    status: string;
    availableBalance: number;
    formattedBalance: string;
  };
  fundingEnabled: boolean;
  error?: string;
}

interface MercuryBalanceData {
  success: boolean;
  availableBalance: number;
  accountId: string;
  accountName: string;
  formattedBalance: string;
  error?: string;
}

export function MercuryStatusCard() {
  const { data: mercuryStatus, isLoading: statusLoading, error: statusError } = useQuery<MercuryStatusData>({
    queryKey: ["/api/mercury/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: false
  });

  const { data: mercuryBalance, isLoading: balanceLoading } = useQuery<MercuryBalanceData>({
    queryKey: ["/api/mercury/balance"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: false,
    enabled: mercuryStatus?.success && mercuryStatus?.fundingEnabled
  });

  if (statusLoading) {
    return (
      <Card data-testid="card-mercury-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Mercury Banking</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Handle case where Mercury is not configured
  if (!mercuryStatus?.success || mercuryStatus?.status === 'not_configured') {
    return (
      <Card data-testid="card-mercury-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Mercury Banking</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <Badge variant="outline" className="text-xs">Not Configured</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure Mercury API token to enable direct bank funding
          </p>
        </CardContent>
      </Card>
    );
  }

  // Handle API errors
  if (mercuryStatus?.status === 'api_error' || mercuryStatus?.status === 'error') {
    return (
      <Card data-testid="card-mercury-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Mercury Banking</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <Badge variant="destructive" className="text-xs">Connection Error</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {mercuryStatus.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Payments will use Stripe funding
          </p>
        </CardContent>
      </Card>
    );
  }

  // Handle misconfigured state
  if (mercuryStatus?.status === 'misconfigured') {
    return (
      <Card data-testid="card-mercury-status">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Mercury Banking</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Misconfigured</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {mercuryStatus.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Contact support to fix account setup
          </p>
        </CardContent>
      </Card>
    );
  }

  // Healthy state with balance information
  const balance = mercuryBalance?.success ? mercuryBalance : mercuryStatus.primaryAccount;
  const showBalance = !balanceLoading && balance;

  return (
    <Card data-testid="card-mercury-status">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Mercury Banking</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Status indicator */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <Badge variant="outline" className="text-xs border-green-500 text-green-600">
              {mercuryStatus.fundingEnabled ? 'Active' : 'Connected'}
            </Badge>
          </div>

          {/* Account info */}
          {mercuryStatus.primaryAccount && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {mercuryStatus.primaryAccount.name}
              </p>
              {showBalance && (
                <p className="text-lg font-semibold text-foreground" data-testid="text-mercury-balance">
                  {balance.formattedBalance}
                </p>
              )}
              {balanceLoading && (
                <Skeleton className="h-6 w-20" />
              )}
            </div>
          )}

          {/* Funding status */}
          <div className="text-xs text-muted-foreground">
            {mercuryStatus.fundingEnabled ? (
              <span className="text-green-600">✓ Funding enabled</span>
            ) : (
              <span>Set ENABLE_MERCURY_FUNDING=true to enable</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}