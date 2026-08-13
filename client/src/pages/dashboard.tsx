import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBillSchema, updateBillSchema, type InsertBillType } from "@shared/schema";
import { z } from "zod";
import { BillTable } from "@/components/bill-table";
import { StatsCards } from "@/components/stats-cards";
import { MercuryStatusCard } from "@/components/mercury-status-card";
import type { Bill, User } from "@shared/schema";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";

export default function Dashboard() {
  // Feature flag to control display of unimplemented navigation tabs
  const SHOW_UNIMPLEMENTED_TABS = false;
  
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const editFormRef = useRef<HTMLDivElement>(null);
  
  // Use shared schema with dollar amount extension
  const manualBillForm = insertBillSchema
    .omit({ amountCents: true, userId: true, provider: true })
    .extend({ 
      amount: z.coerce.number().min(0.01, "Amount must be at least $0.01"),
      dueDate: z.coerce.date()
    });

  // Edit form schema - same as manual bill form
  const editBillFormSchema = insertBillSchema
    .omit({ amountCents: true, userId: true, provider: true })
    .extend({ 
      amount: z.coerce.number().min(0.01, "Amount must be at least $0.01"),
      dueDate: z.coerce.date()
    });

  const form = useForm<z.infer<typeof manualBillForm>>({
    resolver: zodResolver(manualBillForm),
    defaultValues: {
      payeeName: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
      amount: 0,
      dueDate: new Date(),
      memo: "",
    },
  });

  // Edit form - separate form for editing bills
  const editForm = useForm<z.infer<typeof editBillFormSchema>>({
    resolver: zodResolver(editBillFormSchema),
    defaultValues: {
      payeeName: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
      paymentUrl: "",
      amount: 0,
      dueDate: new Date(),
      memo: "",
    },
  });

  // Mutation to create manual bill
  const createBillMutation = useMutation({
    mutationFn: async (data: z.infer<typeof manualBillForm>) => {
      // Transform form data to match exact InsertBillType 
      const billData: any = {
        payeeName: data.payeeName,
        addressLine1: data.addressLine1,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country || "US",
        amountCents: Math.round(data.amount * 100), // Convert dollars to cents
        dueDate: data.dueDate, // Backend expects Date object
      };
      
      // Only include optional fields if they have values
      if (data.addressLine2 && data.addressLine2.trim()) {
        billData.addressLine2 = data.addressLine2;
      }
      if (data.memo && data.memo.trim()) {
        billData.memo = data.memo;
      }
      
      const response = await apiRequest("POST", "/api/bills", billData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Success",
        description: "Bill added successfully",
      });
      form.reset();
      setShowAddForm(false);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add bill. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation to update bill
  const updateBillMutation = useMutation({
    mutationFn: async (data: { billId: string; updates: z.infer<typeof editBillFormSchema> }) => {
      // Transform form data to match the API expectations
      const billUpdates: any = {
        payeeName: data.updates.payeeName,
        addressLine1: data.updates.addressLine1,
        city: data.updates.city,
        state: data.updates.state,
        postalCode: data.updates.postalCode,
        country: data.updates.country || "US",
        amountCents: Math.round(data.updates.amount * 100), // Convert dollars to cents
        dueDate: data.updates.dueDate,
      };
      
      // Only include optional fields if they have values
      if (data.updates.addressLine2 && data.updates.addressLine2.trim()) {
        billUpdates.addressLine2 = data.updates.addressLine2;
      }
      if (data.updates.memo && data.updates.memo.trim()) {
        billUpdates.memo = data.updates.memo;
      }
      if (data.updates.paymentUrl && data.updates.paymentUrl.trim()) {
        billUpdates.paymentUrl = data.updates.paymentUrl;
      }
      
      const response = await apiRequest("PUT", `/api/bills/${data.billId}`, billUpdates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Success",
        description: "Bill updated successfully",
      });
      editForm.reset();
      setEditingBill(null);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update bill. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handler for editing bills
  const handleEditBill = (bill: Bill) => {
    setEditingBill(bill);
    // Pre-populate the edit form with the bill data
    editForm.reset({
      payeeName: bill.payeeName,
      addressLine1: bill.addressLine1,
      addressLine2: bill.addressLine2 || "",
      city: bill.city,
      state: bill.state,
      postalCode: bill.postalCode,
      country: bill.country || "US",
      paymentUrl: bill.paymentUrl || "",
      amount: bill.amountCents / 100, // Convert cents to dollars
      dueDate: new Date(bill.dueDate),
      memo: bill.memo || "",
    });
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Scroll to edit form when it opens
  useEffect(() => {
    if (editingBill && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editingBill]);

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
    enabled: isAuthenticated,
  });

  // Fetch fresh balance from billing endpoint (more reliable than auth context)
  const { data: billingData } = useQuery<{ accountBalance: number }>({
    queryKey: ["/api/user/billing"],
    enabled: isAuthenticated,
  });

  // Use fresh balance from billing endpoint, fallback to auth user balance
  const currentBalance = billingData?.accountBalance ?? (user as any)?.accountBalance ?? 0;

  const refreshStatusMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bills/refresh-statuses");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Status Refreshed",
        description: `Updated ${data.updatedCount} bill(s) from Felixcheck.com`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to refresh bill statuses",
        variant: "destructive",
      });
    },
  });

  const importBillsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bills/import");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Success",
        description: "Bills imported successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to import bills",
        variant: "destructive",
      });
    },
  });

  const emergencyRebalanceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bills/emergency-rebalance");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      const message = data.message || `Applied 7-day rule and balance checking: ${data.scheduledCount} scheduled, ${data.pendingCount} pending`;
      toast({
        title: "✅ Emergency Fix Applied",
        description: message,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized", 
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Emergency fix failed",
        description: "Failed to apply fixes",
        variant: "destructive",
      });
    },
  });

  const cancelBillMutation = useMutation({
    mutationFn: async (billId: string) => {
      const response = await apiRequest("POST", `/api/bills/${billId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      toast({
        title: "Success",
        description: "Bill canceled successfully",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to cancel bill",
        variant: "destructive",
      });
    },
  });

  const payNowMutation = useMutation({
    mutationFn: async (billId: string) => {
      const response = await apiRequest("POST", `/api/bills/${billId}/pay-now`);
      return response.json();
    },
    onSuccess: (data: { 
      message?: string; 
      bill?: any; 
      checkId?: string; 
      newBalance?: number; 
      charged?: boolean;
      fundingSource?: 'stripe' | 'mercury';
      mercuryTransferId?: string;
      chargeId?: string;
    }) => {
      // Invalidate all relevant queries to refresh data across the app
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/billing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      
      // Simplified, cleaner success message
      const newBalanceDisplay = data.newBalance !== undefined 
        ? `$${(data.newBalance / 100).toFixed(2)}`
        : 'updated';
      
      toast({
        title: "Check is on its way!",
        description: `Your payment has been processed successfully. New balance: ${newBalanceDisplay}`,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }

      // Parse error message for specific payment failure scenarios
      let errorTitle = "Payment failed";
      let errorDescription = "Failed to process payment. Please try again.";
      
      if (error.message.includes("insufficient balance")) {
        errorTitle = "Insufficient balance";
        errorDescription = "Your account balance is too low. Please add funds to your account or add a payment method for automatic top-ups.";
      } else if (error.message.includes("no payment method") || error.message.includes("default payment method")) {
        errorTitle = "No payment method";
        errorDescription = "Please add a payment method to your account to enable automatic payments for bills.";
      } else if (error.message.includes("card was declined") || error.message.includes("insufficient funds")) {
        errorTitle = "Payment declined";
        errorDescription = "Your payment method was declined. Please check your card or try a different payment method.";
      } else if (error.message) {
        // Use the specific error message if available
        errorDescription = error.message;
      }
      
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    },
  });

  // Restore canceled bills mutation
  const restoreCanceledBillsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bills/restore-canceled");
      return response.json();
    },
    onSuccess: (data: { message?: string; restoredCount: number; scheduledCount: number; pendingCount: number }) => {
      // Invalidate all relevant queries to refresh data across the app
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/billing"] });
      
      let successMessage = data.message || `Successfully restored ${data.restoredCount} canceled bills.`;
      
      if (data.scheduledCount > 0) {
        successMessage += ` ${data.scheduledCount} bills scheduled for payment, ${data.pendingCount} bills pending due to balance.`;
      } else if (data.restoredCount > 0) {
        successMessage += ` All restored bills are pending payment due to insufficient balance.`;
      }
      
      toast({
        title: "Bills restored",
        description: successMessage,
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Restore failed",
        description: error.message || "Failed to restore canceled bills. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Recalculate balance mutation
  const recalculateBalanceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/balance/recalculate");
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string; newBalance: number; transactionCount: number }) => {
      // Force refetch to update balance everywhere (sidebar, billing page, etc.)
      queryClient.refetchQueries({ queryKey: ["/api/user/billing"] });
      queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      
      toast({
        title: "Balance updated",
        description: `Your balance is now $${(data.newBalance / 100).toFixed(2)}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Balance update failed",
        description: error.message || "Failed to recalculate balance. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Fix orphaned bills mutation
  const fixOrphanedBillsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bills/fix-orphaned");
      return response.json();
    },
    onSuccess: (data: { message: string; fixedCount: number; fixedBills: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      
      toast({
        title: data.fixedCount > 0 ? "Bills fixed" : "No issues found",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fix failed",
        description: error.message || "Failed to fix orphaned bills.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  // Calculate bills created this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  const billStats = {
    scheduled: bills.filter(b => b.status === 'SCHEDULED').length, // Match table display: all scheduled bills
    processing: bills.filter(b => b.status === 'PROCESSING').length, // Match table display: all processing bills
    sent: bills.filter(b => b.status === 'SENT').length, // Match table display: all sent bills
    delivered: bills.filter(b => b.status === 'DELIVERED').length, // Include all delivered (both system and external)
    failed: bills.filter(b => b.status === 'FAILED').length, // Match table display: all failed bills
    thisMonthsAmount: bills
      .filter(b => {
        if (!b.createdAt) return false;
        const billDate = new Date(b.createdAt);
        return billDate >= startOfMonth && billDate <= endOfMonth;
      })
      .reduce((total, bill) => total + bill.amountCents, 0) / 100, // Convert cents to dollars
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
              <nav className="hidden md:ml-10 md:flex md:space-x-8">
                <Link href="/dashboard" className="text-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-dashboard">Dashboard</Link>
                <Link href="/billing" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-billing">Billing</Link>
                
                {/* History Tab - Hidden until implemented */}
                {false && (
                  <Link href="/history" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-history">History</Link>
                )}
                
                {/* Settings Tab - Hidden until implemented */}
                {false && (
                  <Link href="/settings" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-settings">Settings</Link>
                )}
                
                <Link href="/membership" className="text-muted-foreground hover:text-primary px-3 py-2 text-sm font-medium" data-testid="link-membership">Membership</Link>
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
                    className="text-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                    data-testid="mobile-link-dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link 
                    href="/billing" 
                    className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                    data-testid="mobile-link-billing"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Billing
                  </Link>
                  
                  {/* History Tab - Hidden until implemented */}
                  {false && (
                    <Link 
                      href="/history" 
                      className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                      data-testid="mobile-link-history"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      History
                    </Link>
                  )}
                  
                  {/* Settings Tab - Hidden until implemented */}
                  {false && (
                    <Link 
                      href="/settings" 
                      className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                      data-testid="mobile-link-settings"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Settings
                    </Link>
                  )}
                  
                  <Link 
                    href="/membership" 
                    className="text-muted-foreground hover:text-primary px-3 py-2 text-lg font-medium border-b border-border" 
                    data-testid="mobile-link-membership"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Membership
                  </Link>
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
                  <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-3 mt-6" data-testid="mobile-balance-display">
                    <div className="flex items-center">
                      <svg className="w-4 h-4 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                      </svg>
                      <span className="text-sm font-medium text-foreground" data-testid="mobile-text-balance">
                        Account Balance: ${(currentBalance / 100).toFixed(2)}
                      </span>
                    </div>
                    <button
                      onClick={() => recalculateBalanceMutation.mutate()}
                      disabled={recalculateBalanceMutation.isPending}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                      title="Sync balance from transactions"
                    >
                      {recalculateBalanceMutation.isPending ? 'Syncing...' : 'Sync'}
                    </button>
                  </div>
                  
                  {/* User Info for Mobile */}
                  <div className="flex items-center space-x-3 px-3 py-3 bg-muted rounded-lg" data-testid="mobile-user-info">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                      {(user as any)?.profileImageUrl ? (
                        <img 
                          src={(user as any).profileImageUrl} 
                          alt="Profile" 
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary-foreground text-sm font-medium">
                          {(user as any)?.firstName?.[0] || (user as any)?.email?.[0] || 'U'}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground" data-testid="mobile-text-username">
                      {(user as any)?.firstName || (user as any)?.email || 'User'}
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
              <div className="hidden sm:flex items-center bg-muted rounded-lg px-3 py-2 space-x-2" data-testid="balance-display">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                </svg>
                <span className="text-sm font-medium text-foreground" data-testid="text-balance">
                  ${(currentBalance / 100).toFixed(2)}
                </span>
                <button
                  onClick={() => recalculateBalanceMutation.mutate()}
                  disabled={recalculateBalanceMutation.isPending}
                  className="text-xs text-blue-600 hover:text-blue-800 underline ml-1"
                  title="Sync balance from transactions"
                >
                  {recalculateBalanceMutation.isPending ? '...' : 'sync'}
                </button>
              </div>

              <div className="flex items-center space-x-3" data-testid="user-info">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  {(user as any)?.profileImageUrl ? (
                    <img 
                      src={(user as any).profileImageUrl} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-primary-foreground text-sm font-medium">
                      {(user as any)?.firstName?.[0] || (user as any)?.email?.[0] || 'U'}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground" data-testid="text-username">
                  {(user as any)?.firstName || (user as any)?.email || 'User'}
                </span>
              </div>
              <button 
                className="text-muted-foreground hover:text-foreground p-2"
                onClick={() => window.location.href = '/api/logout'}
                data-testid="button-logout"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Bill Payments</h2>
              <p className="mt-2 text-muted-foreground">Manage and track your scheduled bill payments</p>
            </div>
            <div className="mt-4 sm:mt-0 flex space-x-3">
              <Button
                onClick={() => refreshStatusMutation.mutate()}
                disabled={refreshStatusMutation.isPending}
                variant="outline"
                data-testid="button-refresh-status"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                {refreshStatusMutation.isPending ? 'Refreshing...' : 'Refresh Status'}
              </Button>
              <Button
                onClick={() => fixOrphanedBillsMutation.mutate()}
                disabled={fixOrphanedBillsMutation.isPending}
                variant="outline"
                data-testid="button-fix-bills"
                title="Fix bills that were paid but not marked as sent"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                {fixOrphanedBillsMutation.isPending ? 'Fixing...' : 'Fix Bills'}
              </Button>
              <Button
                onClick={() => importBillsMutation.mutate()}
                disabled={importBillsMutation.isPending}
                data-testid="button-import-bills"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                {importBillsMutation.isPending ? 'Importing...' : 'Import Bills'}
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowAddForm(!showAddForm)}
                data-testid="button-add-manual"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                </svg>
                Add Manual
              </Button>
            </div>
          </div>
        </div>

        <StatsCards stats={billStats} bills={bills} />

        {/* Mercury Banking Status - Hidden from users (admin-only configuration) */}
        {false && (
        <div className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <MercuryStatusCard />
            </div>
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-medium">Funding Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Stripe (Credit Cards & ACH)</p>
                          <p className="text-sm text-muted-foreground">Primary funding with 1.5% instant fees</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"></path>
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Mercury Banking (Direct ACH)</p>
                          <p className="text-sm text-muted-foreground">Same-day transfers, 100 free/month</p>
                        </div>
                      </div>
                      <div data-testid="mercury-funding-status">
                        {/* This will be dynamically updated based on Mercury status */}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        )}

        {showAddForm && (
          <Card className="mb-6" data-testid="manual-bill-form">
            <CardHeader>
              <CardTitle>Add Manual Bill</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createBillMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="payeeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payee Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter payee name" data-testid="input-payee" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount ($)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              placeholder="0.00" 
                              data-testid="input-amount"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              data-testid="input-due-date"
                              {...field}
                              value={
                                field.value instanceof Date && !isNaN(field.value.getTime()) 
                                  ? field.value.toISOString().split('T')[0] 
                                  : ''
                              }
                              onChange={(e) => field.onChange(new Date(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main St" data-testid="input-address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" data-testid="input-city" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input placeholder="CA" data-testid="input-state" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code</FormLabel>
                          <FormControl>
                            <Input placeholder="90210" data-testid="input-postal-code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="memo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Memo (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Payment note" data-testid="input-memo" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex space-x-3 mt-6">
                    <Button 
                      type="submit" 
                      disabled={createBillMutation.isPending}
                      data-testid="button-save-manual-bill"
                    >
                      {createBillMutation.isPending ? 'Saving...' : 'Save Bill'}
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddForm(false)}
                      data-testid="button-cancel-manual-bill"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Edit Bill Form */}
        {editingBill && (
          <Card ref={editFormRef} className="mb-8" data-testid="card-edit-bill">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                Edit Bill
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit((data) => updateBillMutation.mutate({ billId: editingBill.id, updates: data }))} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={editForm.control}
                      name="payeeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payee Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Company or person to pay" data-testid="edit-input-payee-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount *</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              min="0.01" 
                              placeholder="0.00" 
                              data-testid="edit-input-amount" 
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={editForm.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 1 *</FormLabel>
                          <FormControl>
                            <Input placeholder="Street address" data-testid="edit-input-address-1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address Line 2</FormLabel>
                          <FormControl>
                            <Input placeholder="Apt, suite, etc. (optional)" data-testid="edit-input-address-2" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={editForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input placeholder="City" data-testid="edit-input-city" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State *</FormLabel>
                          <FormControl>
                            <Input placeholder="State" maxLength={2} data-testid="edit-input-state" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ZIP Code *</FormLabel>
                          <FormControl>
                            <Input placeholder="ZIP" data-testid="edit-input-postal-code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={editForm.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date *</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              data-testid="edit-input-due-date" 
                              {...field} 
                              value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : field.value}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="paymentUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment URL (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://pay.example.com/bill" data-testid="edit-input-payment-url" {...field} value={field.value || ""} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">For bills that can be paid online instead of by check</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="memo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Memo</FormLabel>
                          <FormControl>
                            <Input placeholder="Payment note" data-testid="edit-input-memo" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex space-x-3 mt-6">
                    <Button 
                      type="submit" 
                      disabled={updateBillMutation.isPending}
                      data-testid="button-save-edit-bill"
                    >
                      {updateBillMutation.isPending ? 'Updating...' : 'Update Bill'}
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingBill(null);
                        editForm.reset();
                      }}
                      data-testid="button-cancel-edit-bill"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <BillTable 
          bills={bills} 
          isLoading={billsLoading || importBillsMutation.isPending}
          onCancelBill={(billId) => cancelBillMutation.mutate(billId)}
          isCanceling={cancelBillMutation.isPending}
          onPayNow={(billId) => payNowMutation.mutate(billId)}
          isPaying={payNowMutation.isPending}
          onImportBills={() => importBillsMutation.mutate()}
          isImporting={importBillsMutation.isPending}
          onRestoreCanceledBills={() => restoreCanceledBillsMutation.mutate()}
          isRestoring={restoreCanceledBillsMutation.isPending}
          userBalance={currentBalance}
          onEditBill={handleEditBill}
          userName={(user as any)?.firstName}
          userEmail={(user as any)?.email}
        />
      </main>

      <footer className="bg-card border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-4 mb-4 md:mb-0">
              <p className="text-sm text-muted-foreground">
                Powered by 
                <span className="font-medium text-foreground ml-1">Felixcheck.com</span>
                <span className="ml-1">for secure check delivery</span>
              </p>
            </div>
            <div className="flex items-center space-x-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors duration-200">Help</a>
              <a href="#" className="hover:text-foreground transition-colors duration-200">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors duration-200">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
