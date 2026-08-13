import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Bill } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BillTableProps {
  bills: Bill[];
  isLoading: boolean;
  onCancelBill: (billId: string) => void;
  isCanceling: boolean;
  onPayNow: (billId: string) => void;
  isPaying: boolean;
  onImportBills?: () => void;
  isImporting?: boolean;
  onRestoreCanceledBills?: () => void;
  isRestoring?: boolean;
  userBalance?: number; // User's current balance in cents
  onEditBill?: (bill: Bill) => void; // New prop for handling bill edits
  userName?: string; // User's name for email template
  userEmail?: string; // User's email for email template
}

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'SCHEDULED':
      return 'default';
    case 'PROCESSING':
      return 'default';
    case 'SENT':
      return 'default';
    case 'DELIVERED':
      return 'default';
    case 'FAILED':
      return 'destructive';
    case 'CANCELED':
      return 'secondary';
    default:
      return 'default';
  }
};

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'PENDING':
      return 'bg-orange-400 text-orange-50 hover:bg-orange-400/80';
    case 'SCHEDULED':
      return 'bg-amber-500 text-amber-50 hover:bg-amber-500/80';
    case 'PROCESSING':
      return 'bg-purple-500 text-purple-50 hover:bg-purple-500/80';
    case 'SENT':
      return 'bg-blue-500 text-blue-50 hover:bg-blue-500/80';
    case 'DELIVERED':
      return 'bg-green-600 text-green-50 hover:bg-green-600/80';
    case 'FAILED':
      return 'bg-red-500 text-red-50 hover:bg-red-500/80';
    case 'CANCELED':
      return 'bg-gray-500 text-gray-50 hover:bg-gray-500/80';
    default:
      return '';
  }
};

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
};

// Calculate mailing fee (flat $1.50 per bill)
const MAILING_FEE_CENTS = 150; // $1.50 default cost for check mailing

// Check if user can afford to pay this bill (bill amount + mailing fee) - INDIVIDUAL check only
const canAffordBill = (userBalance: number | undefined, bill: Bill | undefined): boolean => {
  if (userBalance === undefined || bill === undefined) return false;
  const totalRequired = bill.amountCents + MAILING_FEE_CENTS;
  return userBalance >= totalRequired;
};

// Calculate which bills are payable based on SEQUENTIAL/CUMULATIVE balance logic
// Bills must be paid in order - only enable bills that can be CUMULATIVELY covered by balance
// Example: With $50 balance and bills $41, $30, $100 (sorted by due date):
//   - Bill 1 ($41+$1.50 = $42.50): Payable, remaining = $7.50
//   - Bill 2 ($30+$1.50 = $31.50): NOT payable (need $31.50, only have $7.50)
//   - Bill 3: NOT payable (blocked by bill 2)
const calculatePayableBills = (bills: Bill[], userBalance: number | undefined): Set<string> => {
  if (userBalance === undefined) return new Set();
  
  // Get only unpaid bills that can potentially be paid (PENDING, SCHEDULED, or FAILED)
  const unpaidBills = bills
    .filter(bill => ['PENDING', 'SCHEDULED', 'FAILED'].includes(bill.status))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  
  const payableBillIds = new Set<string>();
  let remainingBalance = userBalance;
  
  // Go through bills in order - deduct each bill's cost from remaining balance
  for (const bill of unpaidBills) {
    const totalRequired = bill.amountCents + MAILING_FEE_CENTS;
    if (remainingBalance >= totalRequired) {
      payableBillIds.add(bill.id);
      remainingBalance -= totalRequired;
    } else {
      // Once we hit a bill we can't afford, stop - no subsequent bills are payable
      break;
    }
  }
  
  return payableBillIds;
};

// Get total cost for displaying to user
const getTotalCost = (bill: Bill): number => {
  return bill.amountCents + MAILING_FEE_CENTS;
};

const getMailDate = (dueDate: Date) => {
  const mailDate = new Date(dueDate);
  mailDate.setDate(mailDate.getDate() - 7);
  return mailDate;
};

// Check if bill is within 10 days of due date
const isWithin10Days = (dueDate: Date): boolean => {
  const today = new Date();
  const daysDifference = differenceInDays(new Date(dueDate), today);
  return daysDifference <= 10;
};

// Generate FelixPay email template
const generateFelixPayEmail = (bill: Bill, userName?: string, userEmail?: string): string => {
  const today = new Date();
  const threeDaysFromToday = new Date(today);
  threeDaysFromToday.setDate(today.getDate() + 3);
  
  const subject = `FelixPay Manual Payment Request - ${bill.payeeName} Bill Due ${format(new Date(bill.dueDate), 'MMM d, yyyy')}`;
  
  const body = `Dear FelixPay Team,

I would like to request a manual payment for the following bill:

=== BILL DETAILS ===
Payee Name: ${bill.payeeName}
Bill Amount: ${formatCurrency(bill.amountCents)}
Bill Due Date: ${format(new Date(bill.dueDate), 'MMM d, yyyy')}
Account Number: ${bill.memo || '[Please fill if needed]'}
Reference/Memo: ${bill.memo || '[Please fill if needed]'}

=== PAYMENT DESTINATION ===
Mail Check To:
${bill.addressLine1}
${bill.addressLine2 || ''}
${bill.city}, ${bill.state} ${bill.postalCode}

=== CUSTOMER INFORMATION ===
Name: ${userName || '[PLEASE FILL]'}
Email: ${userEmail || '[PLEASE FILL]'}
Phone: [PLEASE FILL IF NEEDED]
Address: [PLEASE FILL IF NEEDED]

=== INVOICE PREFERENCES ===
Invoice Date: ${format(today, 'MMM d, yyyy')}
Payment Due Date: ${format(threeDaysFromToday, 'MMM d, yyyy')}
☐ Repeat this invoice (check if this is a recurring payment)

=== PAYMENT METHODS REQUESTED ===
☐ Accept credit cards (Stripe fee applies)
☐ Accept ACH debit ($1 per debit, Daily limit of $20k)
☐ Manual ACH/Wire (free via Mercury)

=== PAYER MEMO ===
[Customer can add special instructions or reference numbers here]

=== ATTACHMENTS ===
[Please attach any supporting documents if needed]

Please send me an invoice for this payment. I understand this request should be made at least 10 days before the due date to ensure timely delivery.

Thank you,
${userName || '[CUSTOMER NAME]'}`;
  
  return `mailto:felix@debttolegacy.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export function BillTable({ bills, isLoading, onCancelBill, isCanceling, onPayNow, isPaying, onImportBills, isImporting, onRestoreCanceledBills, isRestoring, userBalance, onEditBill, userName, userEmail }: BillTableProps) {
  const [showFelixPayWarning, setShowFelixPayWarning] = useState(false);
  const [selectedBillForFelixPay, setSelectedBillForFelixPay] = useState<Bill | null>(null);
  const [showExternalPayDialog, setShowExternalPayDialog] = useState(false);
  const [selectedBillForExternalPay, setSelectedBillForExternalPay] = useState<Bill | null>(null);
  const [externalPayForm, setExternalPayForm] = useState({
    settlementMethod: 'ach',
    settledAt: new Date().toISOString().split('T')[0],
    settlementReference: ''
  });
  
  const [showPayConfirmModal, setShowPayConfirmModal] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);
  
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [showBulkExternalPayDialog, setShowBulkExternalPayDialog] = useState(false);
  const [bulkExternalPayForm, setBulkExternalPayForm] = useState({
    settlementMethod: 'ach',
    settledAt: new Date().toISOString().split('T')[0],
    settlementReference: ''
  });
  
  // Filter states
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [dueDateFilter, setDueDateFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("current"); // Default to current month
  const [showExternalOnly, setShowExternalOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Helper to check if a bill has valid address
  const isValidAddressField = (value: string | null | undefined): boolean => {
    return !!value && value.trim() !== '' && value.trim().toUpperCase() !== 'N/A';
  };
  
  const hasValidAddress = (bill: Bill): boolean => {
    return isValidAddressField(bill.addressLine1) && 
      isValidAddressField(bill.city) && 
      isValidAddressField(bill.state) && 
      isValidAddressField(bill.postalCode);
  };
  
  const hasPaymentUrl = (bill: Bill): boolean => {
    return !!(bill as any).paymentUrl && (bill as any).paymentUrl.trim() !== '';
  };
  
  // Handle Pay Now click - show confirmation modal
  const handlePayNowClick = (bill: Bill) => {
    setSelectedBillForPayment(bill);
    setShowPayConfirmModal(true);
  };
  
  // Proceed with payment after confirmation
  const proceedWithPayment = () => {
    if (selectedBillForPayment) {
      onPayNow(selectedBillForPayment.id);
    }
    setShowPayConfirmModal(false);
    setSelectedBillForPayment(null);
  };
  
  const handleFelixPayClick = (bill: Bill) => {
    setSelectedBillForFelixPay(bill);
    setShowFelixPayWarning(true);
  };
  
  const proceedWithFelixPay = () => {
    if (selectedBillForFelixPay) {
      const emailLink = generateFelixPayEmail(selectedBillForFelixPay, userName, userEmail);
      window.open(emailLink, '_blank');
    }
    setShowFelixPayWarning(false);
    setSelectedBillForFelixPay(null);
  };
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const externalPayMutation = useMutation({
    mutationFn: async (data: { billId: string; settlementMethod: string; settledAt: string; settlementReference?: string }) => {
      return apiRequest('POST', `/api/bills/${data.billId}/external-pay`, {
        settlementMethod: data.settlementMethod,
        settledAt: new Date(data.settledAt),
        settlementReference: data.settlementReference || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bills'] });
      setShowExternalPayDialog(false);
      setSelectedBillForExternalPay(null);
      setExternalPayForm({
        settlementMethod: 'ach',
        settledAt: new Date().toISOString().split('T')[0],
        settlementReference: ''
      });
      toast({
        title: "Success",
        description: "Bill marked as externally paid"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark bill as externally paid",
        variant: "destructive"
      });
    }
  });
  
  const bulkCancelMutation = useMutation({
    mutationFn: async (billIds: string[]) => {
      return apiRequest('POST', '/api/bills/bulk-cancel', { billIds });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/bills'] });
      setSelectedBillIds(new Set());
      toast({
        title: "Bulk Cancel Complete",
        description: `Canceled ${data.canceledCount} of ${data.total} bills${data.errors?.length ? `. ${data.errors.length} skipped.` : ''}`
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to bulk cancel", variant: "destructive" });
    }
  });

  const bulkExternalPayMutation = useMutation({
    mutationFn: async (data: { billIds: string[]; settlementMethod: string; settledAt: string; settlementReference?: string }) => {
      return apiRequest('POST', '/api/bills/bulk-external-pay', {
        ...data,
        settledAt: new Date(data.settledAt)
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/bills'] });
      setSelectedBillIds(new Set());
      setShowBulkExternalPayDialog(false);
      setBulkExternalPayForm({ settlementMethod: 'ach', settledAt: new Date().toISOString().split('T')[0], settlementReference: '' });
      toast({
        title: "Bulk External Pay Complete",
        description: `Marked ${data.markedCount} of ${data.total} bills as externally paid${data.errors?.length ? `. ${data.errors.length} skipped.` : ''}`
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to bulk mark as externally paid", variant: "destructive" });
    }
  });

  const toggleBillSelection = (billId: string) => {
    setSelectedBillIds(prev => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedBillIds.size === filteredBills.length) {
      setSelectedBillIds(new Set());
    } else {
      setSelectedBillIds(new Set(filteredBills.map(b => b.id)));
    }
  };

  const selectedBills = useMemo(() => {
    return bills.filter(b => selectedBillIds.has(b.id));
  }, [bills, selectedBillIds]);

  const canBulkCancel = selectedBills.some(b => ['PENDING', 'SCHEDULED', 'FAILED'].includes(b.status));
  const canBulkExternalPay = selectedBills.some(b => b.settlementSource !== 'external' && ['PENDING', 'SCHEDULED', 'FAILED', 'CANCELED'].includes(b.status));

  const handleCancelClick = (bill: Bill) => {
    if (selectedBillIds.size > 1 && selectedBillIds.has(bill.id)) {
      const cancelableIds = selectedBills
        .filter(b => ['PENDING', 'SCHEDULED', 'FAILED'].includes(b.status))
        .map(b => b.id);
      if (cancelableIds.length > 0) {
        bulkCancelMutation.mutate(cancelableIds);
      }
      return;
    }
    onCancelBill(bill.id);
  };

  const handleExternalPayClick = (bill: Bill) => {
    if (selectedBillIds.size > 1 && selectedBillIds.has(bill.id)) {
      setShowBulkExternalPayDialog(true);
      return;
    }
    setSelectedBillForExternalPay(bill);
    setShowExternalPayDialog(true);
  };

  
  const handleExternalPaySubmit = () => {
    if (selectedBillForExternalPay) {
      externalPayMutation.mutate({
        billId: selectedBillForExternalPay.id,
        settlementMethod: externalPayForm.settlementMethod,
        settledAt: externalPayForm.settledAt,
        settlementReference: externalPayForm.settlementReference
      });
    }
  };
  
  // Count active bills (exclude delivered and canceled) for "Recent Bills" display
  const activeBills = useMemo(() => {
    return bills.filter(bill => bill.status !== 'DELIVERED' && bill.status !== 'CANCELED');
  }, [bills]);

  // Filter bills based on status and due date
  const filteredBills = useMemo(() => {
    let filtered = bills;
    
    // Filter by search query (name or amount)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(bill => {
        const nameMatch = bill.payeeName.toLowerCase().includes(query);
        const amountMatch = (bill.amountCents / 100).toFixed(2).includes(query) || 
                           (bill.amountCents / 100).toString().includes(query);
        const memoMatch = bill.memo?.toLowerCase().includes(query);
        return nameMatch || amountMatch || memoMatch;
      });
    }
    
    // Filter by status
    if (statusFilters.length > 0) {
      filtered = filtered.filter(bill => statusFilters.includes(bill.status));
    } else if (!showExternalOnly) {
      // Default behavior: hide delivered and canceled bills to keep the main queue clean
      // They can still be viewed by explicitly selecting the "Delivered" or "Canceled" filter
      // Note: Skip this when External filter is active to show all external bills regardless of status
      filtered = filtered.filter(bill => bill.status !== 'DELIVERED' && bill.status !== 'CANCELED');
    }
    
    // Filter by external payment source
    if (showExternalOnly) {
      filtered = filtered.filter(bill => bill.settlementSource === 'external');
    }
    
    // Filter by month
    if (monthFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter(bill => {
        const dueDate = new Date(bill.dueDate);
        if (monthFilter === "current") {
          return dueDate.getMonth() === now.getMonth() && dueDate.getFullYear() === now.getFullYear();
        } else {
          // monthFilter format: "YYYY-MM"
          const [year, month] = monthFilter.split('-').map(Number);
          return dueDate.getMonth() === month - 1 && dueDate.getFullYear() === year;
        }
      });
    }

    // Filter by due date range
    if (dueDateFilter !== "all") {
      const today = new Date();
      filtered = filtered.filter(bill => {
        const dueDate = new Date(bill.dueDate);
        const daysDifference = differenceInDays(dueDate, today);
        
        switch (dueDateFilter) {
          case "1-7":
            return daysDifference >= 1 && daysDifference <= 7;
          case "7-14":
            return daysDifference >= 7 && daysDifference <= 14;
          case "14-30":
            return daysDifference >= 14 && daysDifference <= 30;
          case "30+":
            return daysDifference > 30;
          case "overdue":
            return daysDifference < 0;
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }, [bills, statusFilters, dueDateFilter, monthFilter, showExternalOnly, searchQuery]);
  
  // Calculate which bills are payable based on sequential/cumulative balance logic
  // Uses FILTERED bills so only visible bills affect the sequential calculation
  const payableBills = useMemo(() => {
    return calculatePayableBills(filteredBills, userBalance);
  }, [filteredBills, userBalance]);
  
  // Helper to check if a specific bill can be paid
  const isBillPayable = (billId: string): boolean => payableBills.has(billId);
  
  // Handle status filter changes
  const handleStatusFilterChange = (status: string, checked: boolean) => {
    setStatusFilters(prev => 
      checked 
        ? [...prev, status]
        : prev.filter(s => s !== status)
    );
  };
  
  // Clear all filters
  const clearFilters = () => {
    setStatusFilters([]);
    setDueDateFilter("all");
    setMonthFilter("current");
    setShowExternalOnly(false);
    setSearchQuery("");
    setSelectedBillIds(new Set());
  };
  
  // Generate month options for the last 12 months
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  }, []);
  
  // Check if there are any canceled bills to show the restore option
  const hasCanceledBills = bills.some(bill => bill.status === 'CANCELED');
  if (isLoading) {
    return (
      <Card data-testid="table-loading">
        <CardHeader>
          <CardTitle>Loading Bills...</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (bills.length === 0) {
    return (
      <Card data-testid="table-empty">
        <CardContent className="p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-muted-foreground mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <h3 className="text-lg font-medium text-foreground mb-2">No bills found</h3>
          <p className="text-muted-foreground mb-6">Get started by importing bills from BillWatch or adding them manually.</p>
          <Button 
            onClick={onImportBills}
            disabled={isImporting}
            data-testid="button-empty-import"
          >
            {isImporting ? 'Importing...' : 'Import Bills'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // If there are bills but all are filtered out
  if (filteredBills.length === 0 && bills.length > 0) {
    return (
      <Card data-testid="table-filtered-empty">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Recent Bills (0 of {activeBills.length})</CardTitle>
                <CardDescription>Track your bill payments and their delivery status</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                data-testid="button-clear-filters-empty"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-muted-foreground mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
          </svg>
          <h3 className="text-lg font-medium text-foreground mb-2">No bills match your filters</h3>
          <p className="text-muted-foreground mb-6">Try adjusting your filters to see more results.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card data-testid="table-bills">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Recent Bills ({filteredBills.length} of {activeBills.length})</CardTitle>
              <CardDescription>Track your bill payments and their delivery status</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                </svg>
                Filters
              </Button>
              {(statusFilters.length > 0 || dueDateFilter !== "all" || monthFilter !== "current" || showExternalOnly || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              )}
              {hasCanceledBills && onRestoreCanceledBills && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:text-orange-800 font-medium"
                  onClick={onRestoreCanceledBills}
                  disabled={isRestoring}
                  data-testid="button-restore-canceled"
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  {isRestoring ? 'Restoring...' : 'Restore Canceled Bills'}
                </Button>
              )}
            </div>
          </div>
          
          {/* Search Input */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, amount, or account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="input-search-bills"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          
          {/* Filter Section */}
          {showFilters && (
            <div className="border border-border rounded-lg p-4 bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label className="text-sm font-medium mb-3 block">Status</Label>
                  <div className="space-y-2">
                    {['PENDING', 'SCHEDULED', 'PROCESSING', 'SENT', 'DELIVERED', 'CANCELED'].map((status) => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${status}`}
                          checked={statusFilters.includes(status)}
                          onCheckedChange={(checked) => handleStatusFilterChange(status, !!checked)}
                          data-testid={`checkbox-status-${status.toLowerCase()}`}
                        />
                        <label
                          htmlFor={`status-${status}`}
                          className="text-sm cursor-pointer"
                        >
                          {status.charAt(0) + status.slice(1).toLowerCase()}
                        </label>
                      </div>
                    ))}
                    <div className="flex items-center space-x-2 pt-2 border-t border-border mt-2">
                      <Checkbox
                        id="filter-external"
                        checked={showExternalOnly}
                        onCheckedChange={(checked) => setShowExternalOnly(!!checked)}
                        data-testid="checkbox-external"
                      />
                      <label
                        htmlFor="filter-external"
                        className="text-sm cursor-pointer"
                      >
                        External
                      </label>
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm font-medium mb-3 block">Month</Label>
                  <Select value={monthFilter} onValueChange={setMonthFilter}>
                    <SelectTrigger data-testid="select-month-filter">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current Month</SelectItem>
                      <SelectItem value="all">All Months</SelectItem>
                      {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-sm font-medium mb-3 block">Due Date Range</Label>
                  <Select value={dueDateFilter} onValueChange={setDueDateFilter}>
                    <SelectTrigger data-testid="select-due-date-filter">
                      <SelectValue placeholder="Select due date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All bills</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="1-7">Due 1-7 days</SelectItem>
                      <SelectItem value="7-14">Due 7-14 days</SelectItem>
                      <SelectItem value="14-30">Due 14-30 days</SelectItem>
                      <SelectItem value="30+">Due 30+ days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-3 w-10">
                  <Checkbox
                    checked={filteredBills.length > 0 && selectedBillIds.size === filteredBills.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all bills"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Payee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Mail Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredBills.map((bill) => {
                const canEdit = onEditBill && ['PENDING', 'SCHEDULED', 'FAILED'].includes(bill.status);
                return (
                <tr 
                  key={bill.id} 
                  className={`hover:bg-muted/50 transition-colors duration-150 ${
                    canEdit ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20' : ''
                  } ${selectedBillIds.has(bill.id) ? 'bg-primary/5' : ''}`}
                  onClick={() => canEdit ? onEditBill(bill) : undefined}
                  data-testid={`row-bill-${bill.id}`}
                  title={canEdit ? 'Click to edit bill details' : undefined}
                >
                  <td className="px-3 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedBillIds.has(bill.id)}
                      onCheckedChange={() => toggleBillSelection(bill.id)}
                      aria-label={`Select ${bill.payeeName}`}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-foreground" data-testid={`text-payee-${bill.id}`}>
                        {bill.payeeName}
                      </div>
                      <div className="text-sm text-muted-foreground" data-testid={`text-address-${bill.id}`}>
                        {bill.addressLine1}, {bill.city}, {bill.state} {bill.postalCode}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground" data-testid={`text-amount-${bill.id}`}>
                      {formatCurrency(bill.amountCents)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-foreground" data-testid={`text-due-date-${bill.id}`}>
                      {format(new Date(bill.dueDate), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-foreground" data-testid={`text-mail-date-${bill.id}`}>
                      {format(getMailDate(new Date(bill.dueDate)), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Badge 
                        className={getStatusStyles(bill.status)}
                        data-testid={`badge-status-${bill.id}`}
                      >
                        {bill.status.charAt(0) + bill.status.slice(1).toLowerCase()}
                      </Badge>
                      {bill.settlementSource === 'external' && (
                        <Badge 
                          className="bg-purple-600 text-purple-50 hover:bg-purple-600/80 text-xs"
                          data-testid={`badge-external-${bill.id}`}
                        >
                          External
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {bill.status === 'CANCELED' ? (
                      <span className="text-muted-foreground text-sm">
                        Use "Restore Canceled Bills" button above
                      </span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            data-testid={`button-actions-${bill.id}`}
                          >
                            <span className="sr-only">Open menu</span>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
                            </svg>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {(bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                            <DropdownMenuItem
                              onClick={() => handlePayNowClick(bill)}
                              disabled={isPaying || !isBillPayable(bill.id)}
                              className={isBillPayable(bill.id) ? "text-green-700 hover:text-green-800 hover:bg-green-50" : "text-muted-foreground"}
                              data-testid={`menu-pay-now-${bill.id}`}
                              title={!isBillPayable(bill.id) ? `Insufficient balance or pay earlier bills first. Need ${formatCurrency(getTotalCost(bill))} total.` : undefined}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                              </svg>
                              {isPaying ? 'Paying...' : (bill.status === 'FAILED' ? 'Retry Payment' : 'Pay Now')}
                              {!isBillPayable(bill.id) && (
                                <span className="text-xs text-muted-foreground ml-2">(Insufficient funds)</span>
                              )}
                            </DropdownMenuItem>
                          )}
                          {!isBillPayable(bill.id) && (bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                            <DropdownMenuItem
                              disabled={true}
                              className="text-orange-600"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5C3.462 16.333 4.424 18 5.964 18z"></path>
                              </svg>
                              Add funds to pay bills
                            </DropdownMenuItem>
                          )}
                          {(bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                            <DropdownMenuItem
                              onClick={() => handleFelixPayClick(bill)}
                              className="text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                              data-testid={`menu-felixpay-${bill.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                              </svg>
                              FelixPay
                            </DropdownMenuItem>
                          )}
                          {bill.settlementSource !== 'external' && (
                            <DropdownMenuItem
                              onClick={() => handleExternalPayClick(bill)}
                              disabled={externalPayMutation.isPending}
                              className="text-purple-700 hover:text-purple-800 hover:bg-purple-50"
                              data-testid={`menu-external-pay-${bill.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
                              </svg>
                              {selectedBillIds.size > 1 && selectedBillIds.has(bill.id) ? `Mark ${selectedBillIds.size} as External` : 'Mark as Paid Externally'}
                            </DropdownMenuItem>
                          )}
                          {(bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                            <DropdownMenuItem
                              onClick={() => handleCancelClick(bill)}
                              disabled={isCanceling || isPaying || bulkCancelMutation.isPending}
                              className="text-red-700 hover:text-red-800 hover:bg-red-50"
                              data-testid={`menu-cancel-${bill.id}`}
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                              {selectedBillIds.size > 1 && selectedBillIds.has(bill.id) ? `Cancel ${selectedBillIds.size} Selected` : 'Cancel'}
                            </DropdownMenuItem>
                          )}
                          {(bill.status === 'SENT' || bill.status === 'DELIVERED') && (
                            <DropdownMenuItem
                              disabled={true}
                              className="text-muted-foreground"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                              </svg>
                              View Details
                            </DropdownMenuItem>
                          )}
                          {bill.status === 'PROCESSING' && (
                            <DropdownMenuItem
                              disabled={true}
                              className="text-muted-foreground"
                            >
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                              </svg>
                              Processing...
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={filteredBills.length > 0 && selectedBillIds.size === filteredBills.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all bills"
            />
            <span className="text-sm text-muted-foreground">Select all</span>
          </div>
          {filteredBills.map((bill) => {
            const canEdit = onEditBill && ['PENDING', 'SCHEDULED', 'FAILED'].includes(bill.status);
            return (
              <div 
                key={bill.id} 
                className={`border border-border rounded-lg p-4 bg-card ${
                  canEdit ? 'cursor-pointer hover:bg-muted/50' : ''
                } ${selectedBillIds.has(bill.id) ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => canEdit ? onEditBill(bill) : undefined}
                data-testid={`card-bill-${bill.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div onClick={(e) => e.stopPropagation()} className="pt-1">
                      <Checkbox
                        checked={selectedBillIds.has(bill.id)}
                        onCheckedChange={() => toggleBillSelection(bill.id)}
                        aria-label={`Select ${bill.payeeName}`}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground text-base" data-testid={`text-payee-${bill.id}`}>
                        {bill.payeeName}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1" data-testid={`text-address-${bill.id}`}>
                        {bill.addressLine1}, {bill.city}, {bill.state} {bill.postalCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge 
                      className={`${getStatusStyles(bill.status)} text-xs`}
                      data-testid={`badge-status-${bill.id}`}
                    >
                      {bill.status.charAt(0) + bill.status.slice(1).toLowerCase()}
                    </Badge>
                    {bill.settlementSource === 'external' && (
                      <Badge 
                        className="bg-purple-600 text-purple-50 hover:bg-purple-600/80 text-xs"
                        data-testid={`badge-external-${bill.id}`}
                      >
                        External
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Amount</p>
                    <p className="text-sm font-medium text-foreground" data-testid={`text-amount-${bill.id}`}>
                      {formatCurrency(bill.amountCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Due Date</p>
                    <p className="text-sm text-foreground" data-testid={`text-due-date-${bill.id}`}>
                      {format(new Date(bill.dueDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                {bill.memo && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Account #</p>
                    <p className="text-sm font-medium text-foreground">{bill.memo}</p>
                  </div>
                )}
                
                <div className="pt-3 border-t border-border">
                  {bill.status === 'CANCELED' ? (
                    <p className="text-muted-foreground text-sm">
                      Use "Restore Canceled Bills" button above
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePayNowClick(bill);
                          }}
                          disabled={isPaying || !isBillPayable(bill.id)}
                          className={isBillPayable(bill.id) ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                          variant={isBillPayable(bill.id) ? "default" : "outline"}
                          data-testid={`button-pay-now-${bill.id}`}
                        >
                          {isPaying ? 'Paying...' : (bill.status === 'FAILED' ? 'Retry' : 'Pay Now')}
                        </Button>
                      )}
                      {(bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFelixPayClick(bill);
                          }}
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          data-testid={`button-felixpay-${bill.id}`}
                        >
                          FelixPay
                        </Button>
                      )}
                      {bill.settlementSource !== 'external' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExternalPayClick(bill);
                          }}
                          className="border-purple-200 text-purple-700 hover:bg-purple-50"
                          data-testid={`button-external-pay-${bill.id}`}
                        >
                          Mark External
                        </Button>
                      )}
                      {(bill.status === 'PENDING' || bill.status === 'SCHEDULED' || bill.status === 'FAILED') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelClick(bill);
                          }}
                          disabled={isCanceling || isPaying || bulkCancelMutation.isPending}
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          data-testid={`button-cancel-${bill.id}`}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>

    {/* Floating Bulk Action Bar */}
    {selectedBillIds.size > 0 && (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap justify-center">
        <span className="text-sm font-medium text-foreground whitespace-nowrap">
          {selectedBillIds.size} bill{selectedBillIds.size > 1 ? 's' : ''} selected
        </span>
        <div className="h-4 w-px bg-border hidden sm:block" />
        {canBulkCancel && (
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => {
              const cancelableIds = selectedBills
                .filter(b => ['PENDING', 'SCHEDULED', 'FAILED'].includes(b.status))
                .map(b => b.id);
              if (cancelableIds.length > 0) {
                bulkCancelMutation.mutate(cancelableIds);
              }
            }}
            disabled={bulkCancelMutation.isPending}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {bulkCancelMutation.isPending ? 'Canceling...' : 'Cancel Selected'}
          </Button>
        )}
        {canBulkExternalPay && (
          <Button
            size="sm"
            variant="outline"
            className="border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={() => setShowBulkExternalPayDialog(true)}
            disabled={bulkExternalPayMutation.isPending}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Mark External
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedBillIds(new Set())}
        >
          Clear Selection
        </Button>
      </div>
    )}

    {/* Bulk External Pay Dialog */}
    <Dialog open={showBulkExternalPayDialog} onOpenChange={setShowBulkExternalPayDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark {selectedBillIds.size} Bill{selectedBillIds.size > 1 ? 's' : ''} as Paid Externally</DialogTitle>
          <DialogDescription>
            Record that you paid these bills outside of Felix Pay
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-lg max-h-32 overflow-y-auto">
            {selectedBills.filter(b => b.settlementSource !== 'external' && ['PENDING', 'SCHEDULED', 'FAILED', 'CANCELED'].includes(b.status)).map(b => (
              <div key={b.id} className="flex justify-between text-sm py-1">
                <span>{b.payeeName}</span>
                <span className="text-muted-foreground">{formatCurrency(b.amountCents)}</span>
              </div>
            ))}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bulk-settlement-method">Payment Method</Label>
            <Select 
              value={bulkExternalPayForm.settlementMethod} 
              onValueChange={(value) => setBulkExternalPayForm(prev => ({ ...prev, settlementMethod: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ach">ACH Transfer</SelectItem>
                <SelectItem value="wire">Wire Transfer</SelectItem>
                <SelectItem value="debit_card">Debit Card</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="check">Paper Check</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bulk-settled-date">Date Paid</Label>
            <Input
              id="bulk-settled-date"
              type="date"
              value={bulkExternalPayForm.settledAt}
              onChange={(e) => setBulkExternalPayForm(prev => ({ ...prev, settledAt: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bulk-reference">Reference/Notes (Optional)</Label>
            <Input
              id="bulk-reference"
              placeholder="Transaction ID, check number, etc."
              value={bulkExternalPayForm.settlementReference}
              onChange={(e) => setBulkExternalPayForm(prev => ({ ...prev, settlementReference: e.target.value }))}
            />
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowBulkExternalPayDialog(false)}
            disabled={bulkExternalPayMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            onClick={() => {
              const eligibleIds = selectedBills
                .filter(b => b.settlementSource !== 'external' && ['PENDING', 'SCHEDULED', 'FAILED', 'CANCELED'].includes(b.status))
                .map(b => b.id);
              bulkExternalPayMutation.mutate({
                billIds: eligibleIds,
                settlementMethod: bulkExternalPayForm.settlementMethod,
                settledAt: bulkExternalPayForm.settledAt,
                settlementReference: bulkExternalPayForm.settlementReference
              });
            }}
            disabled={bulkExternalPayMutation.isPending}
          >
            {bulkExternalPayMutation.isPending ? 'Marking as Paid...' : `Mark ${selectedBills.filter(b => b.settlementSource !== 'external' && ['PENDING', 'SCHEDULED', 'FAILED', 'CANCELED'].includes(b.status)).length} as Paid`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    {/* FelixPay Warning Dialog */}
    {selectedBillForFelixPay && (
      <AlertDialog open={showFelixPayWarning} onOpenChange={setShowFelixPayWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>FelixPay Manual Payment Request</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 15.5C3.462 16.333 4.424 18 5.964 18z"></path>
                  </svg>
                  <span className="font-medium text-amber-800 dark:text-amber-200">Important Timing Notice</span>
                </div>
                <p className="mt-2 text-amber-700 dark:text-amber-300">
                  <strong>Use this option at most 10 days before the due date</strong> to ensure your payment won't be late.
                </p>
              </div>
              
              {!isWithin10Days(new Date(selectedBillForFelixPay.dueDate)) && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span className="font-medium text-red-800 dark:text-red-200">Late Payment Risk</span>
                  </div>
                  <p className="mt-2 text-red-700 dark:text-red-300">
                    This bill is due in more than 10 days. Consider using regular payment methods to avoid potential delays.
                  </p>
                </div>
              )}
              
              <div className="text-sm text-muted-foreground">
                <p><strong>What happens next:</strong></p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Your email client will open with a pre-filled message</li>
                  <li>Review and complete any missing information</li>
                  <li>Send the email to request a manual invoice</li>
                  <li>FelixPay will invoice you directly</li>
                  <li>After payment, FelixPay will send the check</li>
                </ol>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowFelixPayWarning(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithFelixPay} className="bg-blue-600 hover:bg-blue-700">
              Continue to Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}

    {/* Pay Now Confirmation Modal */}
    {showPayConfirmModal && selectedBillForPayment && (
      <AlertDialog open={showPayConfirmModal} onOpenChange={setShowPayConfirmModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payment Details</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Please verify the payment information for <strong>{selectedBillForPayment.payeeName}</strong>
                </p>
                
                {/* Account Number / Memo */}
                {selectedBillForPayment.memo && (
                  <div className="p-3 rounded-lg border bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-gray-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                      <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300">Account Number (Memo)</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{selectedBillForPayment.memo}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Address Status */}
                <div className={`p-3 rounded-lg border ${hasValidAddress(selectedBillForPayment) ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'}`}>
                  <div className="flex items-start gap-2">
                    {hasValidAddress(selectedBillForPayment) ? (
                      <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                    <div>
                      <p className={`font-medium ${hasValidAddress(selectedBillForPayment) ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        Mailing Address
                      </p>
                      {hasValidAddress(selectedBillForPayment) ? (
                        <p className="text-sm text-green-600 dark:text-green-500">
                          {selectedBillForPayment.addressLine1}
                          {selectedBillForPayment.addressLine2 && `, ${selectedBillForPayment.addressLine2}`}
                          , {selectedBillForPayment.city}, {selectedBillForPayment.state} {selectedBillForPayment.postalCode}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600 dark:text-amber-500">
                          No valid mailing address. A check cannot be mailed without an address.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment URL Status */}
                <div className={`p-3 rounded-lg border ${hasPaymentUrl(selectedBillForPayment) ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800' : 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700'}`}>
                  <div className="flex items-start gap-2">
                    {hasPaymentUrl(selectedBillForPayment) ? (
                      <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    )}
                    <div>
                      <p className={`font-medium ${hasPaymentUrl(selectedBillForPayment) ? 'text-blue-700 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        Payment URL
                      </p>
                      {hasPaymentUrl(selectedBillForPayment) ? (
                        <p className="text-sm text-blue-600 dark:text-blue-500">
                          Online payment available
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No online payment URL configured
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Warning if neither address nor URL */}
                {!hasValidAddress(selectedBillForPayment) && !hasPaymentUrl(selectedBillForPayment) && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/20 dark:border-red-800">
                    <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                      This bill has no valid mailing address or payment URL. Please edit the bill to add payment details before proceeding.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowPayConfirmModal(false);
              setSelectedBillForPayment(null);
            }}>
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={proceedWithPayment} 
              className="bg-green-600 hover:bg-green-700"
              disabled={!hasValidAddress(selectedBillForPayment)}
            >
              Continue with Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}

    {/* External Payment Dialog */}
    <Dialog open={showExternalPayDialog} onOpenChange={setShowExternalPayDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Bill as Paid Externally</DialogTitle>
            <DialogDescription>
              Record that you paid this bill outside of Felix Pay (e.g., via direct ACH, wire transfer, etc.)
            </DialogDescription>
          </DialogHeader>
          
          {selectedBillForExternalPay && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium">{selectedBillForExternalPay.payeeName}</p>
                <p className="text-sm text-muted-foreground">
                  Amount: {formatCurrency(selectedBillForExternalPay.amountCents)}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="settlement-method">Payment Method</Label>
                <Select 
                  value={externalPayForm.settlementMethod} 
                  onValueChange={(value) => setExternalPayForm(prev => ({ ...prev, settlementMethod: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ach">ACH Transfer</SelectItem>
                    <SelectItem value="wire">Wire Transfer</SelectItem>
                    <SelectItem value="debit_card">Debit Card</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                    <SelectItem value="check">Paper Check</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="settled-date">Date Paid</Label>
                <Input
                  id="settled-date"
                  type="date"
                  value={externalPayForm.settledAt}
                  onChange={(e) => setExternalPayForm(prev => ({ ...prev, settledAt: e.target.value }))}
                  data-testid="input-settled-date"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reference">Reference/Notes (Optional)</Label>
                <Input
                  id="reference"
                  placeholder="Transaction ID, check number, etc."
                  value={externalPayForm.settlementReference}
                  onChange={(e) => setExternalPayForm(prev => ({ ...prev, settlementReference: e.target.value }))}
                  data-testid="input-settlement-reference"
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowExternalPayDialog(false)}
              disabled={externalPayMutation.isPending}
              data-testid="button-cancel-external-pay"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleExternalPaySubmit}
              disabled={externalPayMutation.isPending || !externalPayForm.settlementMethod || !externalPayForm.settledAt}
              data-testid="button-confirm-external-pay"
            >
              {externalPayMutation.isPending ? 'Marking as Paid...' : 'Mark as Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
