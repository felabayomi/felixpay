import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Bill } from "@shared/schema";

interface StatsCardsProps {
  stats: {
    scheduled: number;
    processing: number;
    sent: number;
    delivered: number;
    failed: number;
    thisMonthsAmount: number;
  };
  bills?: Bill[];
}

type StatusType = 'SCHEDULED' | 'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED';

const statusConfig: Record<StatusType | 'thisMonth', { label: string; bgColor: string; textColor: string; badgeVariant: string }> = {
  SCHEDULED: { label: 'Scheduled', bgColor: 'bg-amber-100', textColor: 'text-amber-600', badgeVariant: 'bg-amber-100 text-amber-800' },
  PENDING: { label: 'Pending', bgColor: 'bg-amber-100', textColor: 'text-amber-600', badgeVariant: 'bg-amber-100 text-amber-800' },
  PROCESSING: { label: 'Processing', bgColor: 'bg-purple-100', textColor: 'text-purple-600', badgeVariant: 'bg-purple-100 text-purple-800' },
  SENT: { label: 'Sent', bgColor: 'bg-blue-100', textColor: 'text-blue-600', badgeVariant: 'bg-blue-100 text-blue-800' },
  DELIVERED: { label: 'Delivered', bgColor: 'bg-green-100', textColor: 'text-green-600', badgeVariant: 'bg-green-100 text-green-800' },
  FAILED: { label: 'Failed', bgColor: 'bg-red-100', textColor: 'text-red-600', badgeVariant: 'bg-red-100 text-red-800' },
  thisMonth: { label: 'This Month', bgColor: 'bg-teal-100', textColor: 'text-teal-600', badgeVariant: 'bg-teal-100 text-teal-800' },
};

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function StatsCards({ stats, bills = [] }: StatsCardsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  const handleCardClick = (status: string, title: string) => {
    setSelectedStatus(status);
    setModalTitle(title);
    setModalOpen(true);
  };

  const getFilteredBills = (): Bill[] => {
    if (!selectedStatus) return [];
    
    if (selectedStatus === 'thisMonth') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      return bills.filter(bill => {
        const dueDate = new Date(bill.dueDate);
        return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;
      });
    }
    
    if (selectedStatus === 'SCHEDULED') {
      return bills.filter(bill => bill.status === 'SCHEDULED' || bill.status === 'PENDING');
    }
    
    return bills.filter(bill => bill.status === selectedStatus);
  };

  const filteredBills = getFilteredBills();

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Card 
          data-testid="card-scheduled" 
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-amber-300"
          onClick={() => handleCardClick('SCHEDULED', 'Scheduled Bills')}
        >
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-scheduled-count">
                  {stats.scheduled}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          data-testid="card-processing"
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-purple-300"
          onClick={() => handleCardClick('PROCESSING', 'Processing Bills')}
        >
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Processing</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-processing-count">
                  {stats.processing}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          data-testid="card-sent"
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-blue-300"
          onClick={() => handleCardClick('SENT', 'Sent Bills')}
        >
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Sent</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-sent-count">
                  {stats.sent}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          data-testid="card-delivered"
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-green-300"
          onClick={() => handleCardClick('DELIVERED', 'Delivered Bills')}
        >
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Delivered</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-delivered-count">
                  {stats.delivered}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          data-testid="card-failed"
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-red-300"
          onClick={() => handleCardClick('FAILED', 'Failed Bills')}
        >
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-failed-count">
                  {stats.failed}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          data-testid="card-this-months-bills"
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-teal-300"
          onClick={() => handleCardClick('thisMonth', 'This Month\'s Bills')}
        >
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-this-months-amount-count">
                  ${stats.thisMonthsAmount.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>
              {filteredBills.length} bill{filteredBills.length !== 1 ? 's' : ''} found
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {filteredBills.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bills found for this category
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBills.map((bill) => (
                  <div 
                    key={bill.id} 
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{bill.payeeName}</p>
                      <p className="text-sm text-muted-foreground">
                        Due: {formatDate(bill.dueDate)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {bill.addressLine1}, {bill.city}, {bill.state}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-4">
                      <span className="font-semibold text-foreground">
                        {formatCurrency(bill.amountCents)}
                      </span>
                      <Badge 
                        variant="secondary"
                        className={statusConfig[bill.status as StatusType]?.badgeVariant || 'bg-gray-100 text-gray-800'}
                      >
                        {bill.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
