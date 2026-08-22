import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Target, TrendingUp, ArrowRight, Star, CheckCircle2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { RoadmapFooter as Footer } from "@/components/roadmap-footer";
import { apiRequest } from "@/lib/queryClient";

type Phase = "STABILIZE" | "ELIMINATE" | "BUILD";

const PHASE_REDIRECT: Record<Phase, string> = {
  STABILIZE: "/membership?recommended=control",
  ELIMINATE: "/membership?recommended=momentum",
  BUILD: "/membership?recommended=legacy",
};

const DIAGNOSIS_DATA: Record<Phase, {
  title: string;
  icon: typeof Shield;
  color: string;
  bgColor: string;
  borderColor: string;
  bullets: string[];
  priority: string;
  planName: string;
  recommendedPlan: string;
}> = {
  STABILIZE: {
    title: "Stabilize Phase",
    icon: Shield,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500",
    borderColor: "border-amber-500",
    bullets: [
      "Cash flow instability is limiting progress",
      "Emergency savings are not yet established",
      "Debt pressure is affecting financial flexibility",
    ],
    priority: "Financial Control",
    planName: "Stabilize",
    recommendedPlan: "Control Plan",
  },
  ELIMINATE: {
    title: "Eliminate Phase",
    icon: Target,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500",
    borderColor: "border-blue-500",
    bullets: [
      "High-interest debt is slowing your momentum",
      "Savings need a stronger foundation",
      "Cash flow is stable but not yet optimized",
    ],
    priority: "Debt Elimination",
    planName: "Eliminate",
    recommendedPlan: "Momentum Plan",
  },
  BUILD: {
    title: "Build Phase",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500",
    borderColor: "border-emerald-500",
    bullets: [
      "Your financial foundation is strong",
      "You're ready to grow wealth through investing",
      "Legacy-building opportunities are within reach",
    ],
    priority: "Wealth Building",
    planName: "Build",
    recommendedPlan: "Legacy Plan",
  },
};

export default function Diagnosis() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [score, setScore] = useState<number>(0);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    const storedPhase = localStorage.getItem("felixpay_diagnosis_phase");
    const storedScore = parseInt(localStorage.getItem("felixpay_diagnosis_score") || "0", 10);
    const validPhases: Phase[] = ["STABILIZE", "ELIMINATE", "BUILD"];
    if (!storedPhase || !validPhases.includes(storedPhase as Phase)) {
      navigate("/roadmap");
      return;
    }
    setPhase(storedPhase as Phase);
    setScore(isNaN(storedScore) ? 0 : Math.max(0, Math.min(100, storedScore)));
  }, [navigate]);

  if (!phase) return null;

  const data = DIAGNOSIS_DATA[phase];
  const Icon = data.icon;

  const handleActivate = () => {
    window.location.href = PHASE_REDIRECT[phase];
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setEmailSubmitting(true);
    try {
      const quizResultId = localStorage.getItem("felixpay_result_id");
      await apiRequest("POST", "/api/roadmap/leads", {
        email,
        phase,
        readiness_score: score,
        quiz_result_id: quizResultId || undefined,
      });
      setEmailSubmitted(true);
    } catch {
      setEmailError("Something went wrong. Please try again.");
    } finally {
      setEmailSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4"
            >
              <Icon className={`w-10 h-10 ${data.color}`} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Your Financial Readiness Score
              </p>
              <p className="text-5xl font-bold mb-2" data-testid="text-diagnosis-score">{score}</p>
              <p className="text-xs text-muted-foreground" data-testid="text-diagnosis-average">
                Average American Score: <span className="font-bold">41</span>
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className={`rounded-lg border-l-4 ${data.borderColor} bg-card p-6 shadow-sm mb-6`}
          >
            <p className="text-base mb-1 text-muted-foreground">You are currently in the</p>
            <h2 className={`text-2xl font-bold mb-4 ${data.color}`} data-testid="text-diagnosis-phase">
              {data.title}
            </h2>

            <p className="text-sm font-medium text-foreground mb-3">This means:</p>
            <ul className="space-y-2.5 mb-6">
              {data.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2.5" data-testid={`text-diagnosis-bullet-${i}`}>
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${data.bgColor} flex-shrink-0`} />
                  <span className="text-sm text-muted-foreground">{bullet}</span>
                </li>
              ))}
            </ul>

            <div className="border-t border-border pt-4">
              <p className="text-sm text-muted-foreground mb-1">Your first financial priority should be:</p>
              <p className={`text-lg font-bold ${data.color}`} data-testid="text-diagnosis-priority">
                {data.priority}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="space-y-3 mb-8"
          >
            <div className="flex items-center justify-center gap-2 mb-1" data-testid="text-recommendation-banner">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-sm font-semibold text-foreground">
                Recommended Based on Your Assessment
              </span>
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <p className="text-center text-xs text-muted-foreground mb-2" data-testid="text-recommendation-detail">
              Your score of <span className="font-bold text-foreground">{score}/100</span> places you in the{" "}
              <span className={`font-bold ${data.color}`}>{data.planName} Phase</span> — the{" "}
              <span className="font-semibold text-foreground">{data.recommendedPlan}</span> is built for exactly where you are.
            </p>
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={handleActivate}
              data-testid="button-activate-plan"
            >
              Activate Your {data.planName} Plan
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/roadmap/dashboard")}
              data-testid="button-diagnosis-dashboard"
            >
              View My Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/roadmap")}
              data-testid="button-diagnosis-retake"
            >
              Retake Quiz
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="rounded-lg border border-border/50 bg-muted/30 p-5"
          >
            {!emailSubmitted ? (
              <>
                <p className="text-sm font-medium text-foreground mb-1 text-center" data-testid="text-contact-title">
                  Not ready yet?
                </p>
                <p className="text-xs text-muted-foreground text-center mb-4">
                  Leave your email and we'll follow up when you're ready.
                </p>

                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                    className="h-10"
                    data-testid="input-email"
                  />
                  {emailError && (
                    <p className="text-xs text-destructive" data-testid="text-email-error">{emailError}</p>
                  )}
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full h-10"
                    disabled={emailSubmitting || !email.trim()}
                    data-testid="button-send-roadmap"
                  >
                    {emailSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Keep Me Updated"
                    )}
                  </Button>
                </form>

                <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
                  We respect your privacy. No spam.
                </p>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="text-center py-1"
              >
                <CheckCircle2 className="w-8 h-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground mb-1" data-testid="text-contact-success">
                  You're on the list.
                </p>
                <p className="text-xs text-muted-foreground">
                  We'll reach out to <span className="font-medium text-foreground">{email}</span> with more information.
                </p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}

