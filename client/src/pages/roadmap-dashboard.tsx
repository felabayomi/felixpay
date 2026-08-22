import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  Target,
  TrendingUp,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { RoadmapFooter as Footer } from "@/components/roadmap-footer";
import type { RoadmapQuizResult as QuizResult } from "@shared/schema";

type Phase = "STABILIZE" | "ELIMINATE" | "BUILD";

const PHASE_CONFIG: Record<Phase, {
  title: string;
  label: string;
  plan: string;
  icon: typeof Shield;
  color: string;
  bgColor: string;
  badgeClass: string;
}> = {
  STABILIZE: {
    title: "Phase 1: Stabilize",
    label: "Stabilize",
    plan: "Control",
    icon: Shield,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  ELIMINATE: {
    title: "Phase 2: Eliminate",
    label: "Eliminate",
    plan: "Momentum",
    icon: Target,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  BUILD: {
    title: "Phase 3: Build",
    label: "Build",
    plan: "Legacy",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
};

const UPGRADE_MESSAGES: Record<string, { banner: string; description: string }> = {
  ELIMINATE: {
    banner: "You're ready to move to the Eliminate phase!",
    description: "Your financial stability score shows you're ready to start crushing debt and building momentum.",
  },
  BUILD: {
    banner: "You're financially ready to begin building wealth.",
    description: "Your readiness score shows you've mastered debt elimination and are ready to invest for long-term growth.",
  },
};

const REDIRECT_MAP: Record<string, string> = {
  STABILIZE: "/membership?recommended=control",
  ELIMINATE: "/membership?recommended=momentum",
  BUILD: "/membership?recommended=legacy",
};

function getScoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

function getScoreLabel(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 40) return "Developing";
  return "Needs Attention";
}

function getImprovementTip(result: QuizResult): string {
  if (result.overdraftRecent) return "Focus on eliminating overdrafts to significantly boost your score.";
  if (result.hasHighInterestDebt) return "Prioritize paying down high-interest debt to unlock your next phase.";
  if (!result.hasEmergencySavings) return "Build at least 1 month of emergency savings to strengthen your foundation.";
  if (!result.knowsTrueBalance) return "Start tracking your true balance including pending transactions.";
  if (!result.activelyInvesting) return "Begin investing for long-term growth to reach your full potential.";
  return "You're doing great! Keep up the strong financial habits.";
}

const SCORE_BREAKDOWN = [
  { key: "overdraftRecent" as const, label: "Cash Flow Stability", weight: 30, invertedLogic: true },
  { key: "hasHighInterestDebt" as const, label: "Debt Pressure", weight: 25, invertedLogic: true },
  { key: "hasEmergencySavings" as const, label: "Emergency Savings", weight: 20, invertedLogic: false },
  { key: "knowsTrueBalance" as const, label: "Balance Awareness", weight: 15, invertedLogic: false },
  { key: "activelyInvesting" as const, label: "Investing Behavior", weight: 10, invertedLogic: false },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  const resultId = typeof window !== "undefined" ? localStorage.getItem("felixpay_result_id") : null;

  useEffect(() => {
    if (!resultId) {
      navigate("/roadmap");
    }
  }, [resultId, navigate]);

  const { data: result, isLoading } = useQuery<QuizResult>({
    queryKey: ["/api/roadmap/quiz-results", resultId],
    enabled: !!resultId,
  });

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/roadmap/quiz-results/${resultId}/confirm-upgrade`);
      return res.json();
    },
    onSuccess: (data) => {
      setUpgradeDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/roadmap/quiz-results", resultId] });
      if (data.redirect) {
        const fullUrl = data.redirect.startsWith("http")
          ? data.redirect
          : `${window.location.origin}${data.redirect}`;
        window.location.href = fullUrl;
      }
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: async (answers: {
      overdraft_recent: boolean;
      knows_true_balance: boolean;
      has_high_interest_debt: boolean;
      has_emergency_savings: boolean;
      actively_investing: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/roadmap/recalculate-readiness", { id: resultId, answers });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/roadmap/quiz-results", resultId] });
    },
  });

  if (!resultId) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No results found.</p>
        <Button onClick={() => navigate("/roadmap")} data-testid="button-take-quiz-fallback">
          Take the Quiz
        </Button>
      </div>
    );
  }

  const phase = result.phase as Phase;
  const config = PHASE_CONFIG[phase];
  const PhaseIcon = config.icon;
  const score = result.readinessScore;
  const upgradeAvailable = result.upgradeAvailable as Phase | null;
  const upgradeConfig = upgradeAvailable ? PHASE_CONFIG[upgradeAvailable] : null;
  const upgradeMsg = upgradeAvailable ? UPGRADE_MESSAGES[upgradeAvailable] : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
                Your Financial Dashboard
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Track your progress and unlock your next phase.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/roadmap")} data-testid="button-back-home">
              Back to Roadmap
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="mb-6" data-testid="card-readiness-bar">
            <CardContent className="py-5 px-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <span className="text-sm font-medium">Financial Readiness</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold tabular-nums" data-testid="text-dashboard-score">
                    {score}%
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-xs no-default-hover-elevate no-default-active-elevate ${
                      score >= 70
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : score >= 40
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                    data-testid="badge-score-label"
                  >
                    {getScoreLabel(score)}
                  </Badge>
                </div>
              </div>

              <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={`absolute inset-y-0 left-0 rounded-full ${getScoreColor(score)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
                <div className="absolute top-0 bottom-0 left-[40%] w-px bg-foreground/15" />
                <div className="absolute top-0 bottom-0 left-[70%] w-px bg-foreground/15" />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">0</span>
                <span className="text-[10px] text-orange-500 dark:text-orange-400 font-medium">40</span>
                <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">70</span>
                <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium">100</span>
              </div>

              <p className="text-xs text-muted-foreground mt-3 italic" data-testid="text-improvement-tip">
                {getImprovementTip(result)}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {upgradeAvailable && upgradeConfig && upgradeMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="mb-6 border-primary/30" data-testid="card-upgrade-banner">
              <CardContent className="py-5 px-5">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full ${upgradeConfig.bgColor} flex items-center justify-center`}>
                    <ArrowUp className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold mb-1" data-testid="text-upgrade-banner-title">
                      {upgradeMsg.banner}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3" data-testid="text-upgrade-banner-desc">
                      {upgradeMsg.description}
                    </p>
                    <Button
                      onClick={() => setUpgradeDialogOpen(true)}
                      data-testid="button-upgrade-phase"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Upgrade to {upgradeConfig.label}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="mb-6" data-testid="card-current-phase">
            <CardContent className="py-5 px-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center`}>
                  <PhaseIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className={`font-semibold ${config.color}`} data-testid="text-current-phase">
                    {config.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {config.plan} Plan
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {SCORE_BREAKDOWN.map((item) => {
                  const val = result[item.key];
                  const earned = item.invertedLogic ? val === false : val === true;
                  return (
                    <div key={item.key} className="flex items-center justify-between gap-2" data-testid={`dashboard-breakdown-${item.key}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {earned ? (
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/50" />
                        )}
                        <span className={`text-sm ${earned ? "" : "text-muted-foreground"}`}>
                          {item.label}
                        </span>
                      </div>
                      <span className={`text-sm font-medium tabular-nums ${earned ? "" : "text-muted-foreground"}`}>
                        {earned ? `+${item.weight}` : "0"}/{item.weight}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              localStorage.removeItem("felixpay_result_id");
              navigate("/roadmap");
            }}
            data-testid="button-retake-quiz-dashboard"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retake Quiz
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              const redirect = REDIRECT_MAP[phase] || REDIRECT_MAP.ELIMINATE;
              window.location.href = redirect;
            }}
            data-testid="button-get-plan-dashboard"
          >
            Get My {config.plan} Plan
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </div>

      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-upgrade-confirm">
          <DialogHeader>
            <DialogTitle>Confirm Phase Upgrade</DialogTitle>
            <DialogDescription>
              {upgradeConfig
                ? `You're about to upgrade from ${config.label} to ${upgradeConfig.label}. This will update your recommended plan.`
                : "Confirm your upgrade."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className={`w-12 h-12 rounded-full ${config.bgColor} flex items-center justify-center mx-auto mb-2`}>
                  <PhaseIcon className="w-6 h-6 text-white" />
                </div>
                <p className="text-sm font-medium">{config.label}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
              {upgradeConfig && (() => {
                const UpgradeIcon = upgradeConfig.icon;
                return (
                  <div className="text-center">
                    <div className={`w-12 h-12 rounded-full ${upgradeConfig.bgColor} flex items-center justify-center mx-auto mb-2`}>
                      <UpgradeIcon className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm font-medium">{upgradeConfig.label}</p>
                  </div>
                );
              })()}
            </div>

            <div className="mt-4 rounded-md bg-muted/50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  This upgrade cannot be reversed. Your subscription plan will be updated to match your new phase.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)} data-testid="button-cancel-upgrade">
              Cancel
            </Button>
            <Button
              onClick={() => upgradeMutation.mutate()}
              disabled={upgradeMutation.isPending}
              data-testid="button-confirm-upgrade"
            >
              {upgradeMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4 mr-2" />
              )}
              Confirm Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

