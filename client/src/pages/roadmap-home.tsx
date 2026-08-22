import { useState } from "react";
import { useLocation } from "wouter";
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
} from "@/components/ui/dialog";
import {
  Shield,
  Target,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Compass,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { RoadmapFooter as Footer } from "@/components/roadmap-footer";

interface QuizAnswers {
  overdraft_recent: boolean | null;
  knows_true_balance: boolean | null;
  has_high_interest_debt: boolean | null;
  has_emergency_savings: boolean | null;
  actively_investing: boolean | null;
}

const QUESTIONS = [
  {
    key: "overdraft_recent" as const,
    text: "Have you overdrafted in the last 3 months?",
    yesLabel: "Yes, I have",
    noLabel: "No, I haven't",
  },
  {
    key: "knows_true_balance" as const,
    text: "Do you know your exact available balance right now (including pending)?",
    yesLabel: "Yes, I do",
    noLabel: "No, not exactly",
  },
  {
    key: "has_high_interest_debt" as const,
    text: "Are you carrying high-interest debt?",
    yesLabel: "Yes, I am",
    noLabel: "No, I'm not",
  },
  {
    key: "has_emergency_savings" as const,
    text: "Do you have at least 1 month of emergency savings?",
    yesLabel: "Yes, I do",
    noLabel: "No, not yet",
  },
  {
    key: "actively_investing" as const,
    text: "Are you actively investing for long-term growth?",
    yesLabel: "Yes, I am",
    noLabel: "No, not yet",
  },
];

type Phase = "STABILIZE" | "ELIMINATE" | "BUILD";
type ReadinessBand = "STABILIZE_ZONE" | "ELIMINATE_ZONE" | "BUILD_ZONE";

function calculateReadinessScore(answers: QuizAnswers): number {
  let score = 0;
  if (answers.overdraft_recent === false) score += 30;
  if (answers.has_high_interest_debt === false) score += 25;
  if (answers.has_emergency_savings === true) score += 20;
  if (answers.knows_true_balance === true) score += 15;
  if (answers.actively_investing === true) score += 10;
  return score;
}

function getReadinessBand(score: number): ReadinessBand {
  if (score >= 70) return "BUILD_ZONE";
  if (score >= 40) return "ELIMINATE_ZONE";
  return "STABILIZE_ZONE";
}

const BAND_CONFIG: Record<ReadinessBand, { label: string; color: string; bgColor: string }> = {
  STABILIZE_ZONE: {
    label: "Stabilize Zone",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500",
  },
  ELIMINATE_ZONE: {
    label: "Eliminate Zone",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500",
  },
  BUILD_ZONE: {
    label: "Build Zone",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500",
  },
};

const SCORE_BREAKDOWN = [
  { key: "overdraft_recent" as const, label: "Cash Flow Stability", weight: 30, invertedLogic: true },
  { key: "has_high_interest_debt" as const, label: "Debt Pressure", weight: 25, invertedLogic: true },
  { key: "has_emergency_savings" as const, label: "Emergency Savings", weight: 20, invertedLogic: false },
  { key: "knows_true_balance" as const, label: "Balance Awareness", weight: 15, invertedLogic: false },
  { key: "actively_investing" as const, label: "Investing Behavior", weight: 10, invertedLogic: false },
];

function determinePhase(answers: QuizAnswers): Phase {
  if (answers.overdraft_recent === true) return "STABILIZE";
  if (answers.knows_true_balance === false) return "STABILIZE";

  if (answers.has_high_interest_debt === true) return "ELIMINATE";
  if (answers.has_emergency_savings === false) return "ELIMINATE";

  if (
    answers.has_emergency_savings === true &&
    answers.actively_investing === true &&
    answers.has_high_interest_debt === false
  )
    return "BUILD";

  return "ELIMINATE";
}

const PHASE_REDIRECT: Record<Phase, string> = {
  STABILIZE: "/membership?recommended=control",
  ELIMINATE: "/membership?recommended=momentum",
  BUILD: "/membership?recommended=legacy",
};

const PHASE_DATA = [
  {
    phase: "Phase 1",
    title: "Stabilize",
    icon: Shield,
    description: "Stop the bleeding. Get control of your cash flow, eliminate overdrafts, and know exactly where every dollar stands.",
    highlights: ["End overdraft cycles", "Track true balance", "Build awareness"],
    gradient: "from-amber-500/15 to-orange-500/10 dark:from-amber-500/10 dark:to-orange-500/5",
    iconColor: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    borderAccent: "border-l-amber-500",
  },
  {
    phase: "Phase 2",
    title: "Eliminate",
    icon: Target,
    description: "Attack high-interest debt with a clear strategy. Build momentum and free up income for what matters most.",
    highlights: ["Crush high-interest debt", "Build emergency fund", "Create momentum"],
    gradient: "from-blue-500/15 to-indigo-500/10 dark:from-blue-500/10 dark:to-indigo-500/5",
    iconColor: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    borderAccent: "border-l-blue-500",
  },
  {
    phase: "Phase 3",
    title: "Build",
    icon: TrendingUp,
    description: "Your foundation is set. Now invest, grow wealth, and create the legacy you've been working toward.",
    highlights: ["Invest for growth", "Build generational wealth", "Create your legacy"],
    gradient: "from-emerald-500/15 to-green-500/10 dark:from-emerald-500/10 dark:to-green-500/5",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    borderAccent: "border-l-emerald-500",
  },
];

const RESULT_CONFIG: Record<Phase, { title: string; subtitle: string; plan: string; color: string; icon: typeof Shield }> = {
  STABILIZE: {
    title: "Phase 1: Stabilize",
    subtitle: "Let's get your cash flow under control first.",
    plan: "Control Plan",
    color: "text-amber-600 dark:text-amber-400",
    icon: Shield,
  },
  ELIMINATE: {
    title: "Phase 2: Eliminate",
    subtitle: "Time to crush that debt and build momentum.",
    plan: "Momentum Plan",
    color: "text-blue-600 dark:text-blue-400",
    icon: Target,
  },
  BUILD: {
    title: "Phase 3: Build",
    subtitle: "You're ready to invest and build lasting wealth.",
    plan: "Legacy Plan",
    color: "text-emerald-600 dark:text-emerald-400",
    icon: TrendingUp,
  },
};

export default function Home() {
  const [, navigate] = useLocation();
  const [quizOpen, setQuizOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({
    overdraft_recent: null,
    knows_true_balance: null,
    has_high_interest_debt: null,
    has_emergency_savings: null,
    actively_investing: null,
  });
  const [result, setResult] = useState<Phase | null>(null);
  const [readinessScore, setReadinessScore] = useState<number>(0);
  const [showResult, setShowResult] = useState(false);
  const [showAcknowledgment, setShowAcknowledgment] = useState(false);
  const [ackChecks, setAckChecks] = useState({ informational: false, dataUse: false, noShare: false });

  const submitQuiz = (completeAnswers: { [K in keyof QuizAnswers]: boolean }) => {
    const phase = determinePhase(completeAnswers);
    const score = calculateReadinessScore(completeAnswers);
    setResult(phase);
    setReadinessScore(score);
    setShowAcknowledgment(false);
    setShowResult(true);

    fetch("/api/roadmap/quiz-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase,
        readiness_score: score,
        answers: completeAnswers,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) {
          localStorage.setItem("felixpay_result_id", data.id);
        }
      })
      .catch(() => {});
  };

  const handleAnswer = (value: boolean) => {
    const key = QUESTIONS[currentQuestion].key;
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);

    if (currentQuestion < QUESTIONS.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    } else {
      setShowAcknowledgment(true);
    }
  };

  const handleRedirect = () => {
    if (result) {
      localStorage.setItem("felixpay_diagnosis_phase", result);
      localStorage.setItem("felixpay_diagnosis_score", readinessScore.toString());
      setQuizOpen(false);
      navigate("/roadmap/diagnosis");
      window.scrollTo(0, 0);
    }
  };

  const resetQuiz = () => {
    setCurrentQuestion(0);
    setAnswers({
      overdraft_recent: null,
      knows_true_balance: null,
      has_high_interest_debt: null,
      has_emergency_savings: null,
      actively_investing: null,
    });
    setShowAcknowledgment(false);
    setAckChecks({ informational: false, dataUse: false, noShare: false });
    setResult(null);
    setReadinessScore(0);
    setShowResult(false);
  };

  const openQuiz = () => {
    resetQuiz();
    setQuizOpen(true);
  };

  const progress = showResult ? 100 : (currentQuestion / QUESTIONS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 dark:from-primary/8 dark:to-primary/3" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-12 sm:pt-12 sm:pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-3 text-primary" data-testid="img-logo">
              <Shield className="h-12 w-12" />
              <div className="text-left">
                <div className="text-3xl sm:text-4xl font-bold tracking-tight">Debt to Legacy</div>
                <div className="text-sm text-muted-foreground">Your Financial Operating System</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="mb-6" data-testid="badge-roadmap">
              <Compass className="w-3 h-3 mr-1" />
              Your Financial Roadmap
            </Badge>
          </motion.div>

          <motion.h1
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            data-testid="text-hero-title"
          >
            Most people know their credit score.
            <br />
            <span className="text-primary">Almost nobody knows their Financial Readiness Score.</span>
          </motion.h1>

          <motion.p
            className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            data-testid="text-hero-subtitle"
          >
            Take the 60-second assessment. Find out where you stand on the Debt to Legacy roadmap — and what to do next.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button size="lg" onClick={openQuiz} data-testid="button-find-my-phase">
              <Sparkles className="w-4 h-4 mr-2" />
              Find Your Financial Readiness Score
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-8" data-testid="phase-progress-meter">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        >
          <Card>
            <CardContent className="py-8 px-4 sm:px-8">
              <div className="relative flex items-center justify-between">
                <div className="absolute top-5 left-[calc(16.67%)] right-[calc(16.67%)] h-1 bg-muted rounded-full hidden sm:block" />

                <div className="absolute top-5 left-[calc(16.67%)] h-1 rounded-full hidden sm:block bg-gradient-to-r from-amber-500 to-blue-500" style={{ width: "33.33%" }} />
                <div className="absolute top-5 left-[calc(50%)] h-1 rounded-full hidden sm:block bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: "33.33%" }} />

                {[
                  {
                    icon: Shield,
                    label: "Stabilize",
                    sublabel: "Control",
                    color: "bg-amber-500",
                    textColor: "text-amber-600 dark:text-amber-400",
                    ringColor: "ring-amber-500/20",
                    step: 1,
                  },
                  {
                    icon: Target,
                    label: "Eliminate",
                    sublabel: "Momentum",
                    color: "bg-blue-500",
                    textColor: "text-blue-600 dark:text-blue-400",
                    ringColor: "ring-blue-500/20",
                    step: 2,
                  },
                  {
                    icon: TrendingUp,
                    label: "Build",
                    sublabel: "Legacy",
                    color: "bg-emerald-500",
                    textColor: "text-emerald-600 dark:text-emerald-400",
                    ringColor: "ring-emerald-500/20",
                    step: 3,
                  },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="relative z-10 flex flex-col items-center flex-1"
                      data-testid={`meter-step-${item.step}`}
                    >
                      <motion.div
                        className={`w-10 h-10 rounded-full ${item.color} ring-4 ${item.ringColor} flex items-center justify-center shadow-sm`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.5 + i * 0.15, type: "spring", stiffness: 200 }}
                      >
                        <Icon className="w-5 h-5 text-white" />
                      </motion.div>
                      <motion.div
                        className="mt-3 text-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.7 + i * 0.15 }}
                      >
                        <p className={`text-sm font-semibold ${item.textColor}`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.sublabel} Plan
                        </p>
                      </motion.div>
                    </div>
                  );
                })}
              </div>

              <motion.div
                className="flex items-center justify-center gap-4 mt-6 pt-5 border-t border-border"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 1.1 }}
              >
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your journey from debt to lasting wealth
                </p>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PHASE_DATA.map((phase, index) => {
            const Icon = phase.icon;
            return (
              <motion.div
                key={phase.title}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 * index + 0.3 }}
              >
                <Card
                  className="h-full hover-elevate"
                  data-testid={`card-phase-${index + 1}`}
                >
                  <CardContent className="p-6">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-md bg-gradient-to-br ${phase.gradient} mb-4`}>
                      <Icon className={`w-6 h-6 ${phase.iconColor}`} />
                    </div>

                    <Badge variant="secondary" className={`mb-3 ${phase.badgeClass} no-default-hover-elevate no-default-active-elevate`}>
                      {phase.phase}
                    </Badge>

                    <h3 className="text-xl font-semibold mb-2" data-testid={`text-phase-title-${index + 1}`}>
                      {phase.title}
                    </h3>

                    <p className="text-muted-foreground text-sm mb-4 leading-relaxed" data-testid={`text-phase-desc-${index + 1}`}>
                      {phase.description}
                    </p>

                    <ul className="space-y-2">
                      {phase.highlights.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${phase.iconColor}`} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <p className="text-muted-foreground text-sm mb-4">
            Not sure where you fall? It only takes 60 seconds.
          </p>
          <Button variant="outline" onClick={openQuiz} data-testid="button-find-my-phase-bottom">
            Find Your Financial Readiness Score
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      </section>

      <Dialog open={quizOpen} onOpenChange={setQuizOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-quiz">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {showResult ? "Your Result" : showAcknowledgment ? "Before We Show Your Results" : "Find Your Financial Readiness Score"}
            </DialogTitle>
            <DialogDescription>
              {showResult
                ? "Based on your answers, here's your recommended phase."
                : showAcknowledgment
                ? "Please review and acknowledge the following."
                : `Question ${currentQuestion + 1} of ${QUESTIONS.length}`}
            </DialogDescription>
          </DialogHeader>

          <Progress value={showAcknowledgment ? 100 : progress} className="h-1.5" data-testid="progress-quiz" />

          <AnimatePresence mode="wait">
            {showAcknowledgment && !showResult ? (
              <motion.div
                key="acknowledgment"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="py-4"
              >
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer" data-testid="label-ack-informational">
                    <input
                      type="checkbox"
                      checked={ackChecks.informational}
                      onChange={(e) => setAckChecks((prev) => ({ ...prev, informational: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary flex-shrink-0"
                      data-testid="checkbox-ack-informational"
                    />
                    <span className="text-sm text-muted-foreground">
                      I understand that this Assessment is for <strong className="text-foreground">informational purposes only</strong> and does not constitute financial, legal, or investment advice.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer" data-testid="label-ack-data-use">
                    <input
                      type="checkbox"
                      checked={ackChecks.dataUse}
                      onChange={(e) => setAckChecks((prev) => ({ ...prev, dataUse: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary flex-shrink-0"
                      data-testid="checkbox-ack-data-use"
                    />
                    <span className="text-sm text-muted-foreground">
                      I acknowledge that my responses will be used <strong className="text-foreground">solely</strong> to calculate my Financial Readiness Score and recommend a Debt to Legacy subscription plan.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer" data-testid="label-ack-no-share">
                    <input
                      type="checkbox"
                      checked={ackChecks.noShare}
                      onChange={(e) => setAckChecks((prev) => ({ ...prev, noShare: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary flex-shrink-0"
                      data-testid="checkbox-ack-no-share"
                    />
                    <span className="text-sm text-muted-foreground">
                      I understand that my information <strong className="text-foreground">will not be sold or shared</strong> for unrelated purposes.
                    </span>
                  </label>
                </div>

                <p className="text-[10px] text-muted-foreground/70 mt-4">
                  By submitting, you agree to our{" "}
                  <a href="/terms-of-use" target="_blank" className="underline hover:text-foreground transition-colors">Terms of Use</a>,{" "}
                  <a href="/privacy-policy" target="_blank" className="underline hover:text-foreground transition-colors">Privacy Policy</a>, and{" "}
                  <a href="/privacy-policy" target="_blank" className="underline hover:text-foreground transition-colors">Data Usage Disclosure</a>.
                </p>

                <Button
                  className="w-full mt-4"
                  disabled={!ackChecks.informational || !ackChecks.dataUse || !ackChecks.noShare}
                  onClick={() => {
                    const completeAnswers = answers as { [K in keyof QuizAnswers]: boolean };
                    submitQuiz(completeAnswers);
                  }}
                  data-testid="button-submit-assessment"
                >
                  Submit Assessment
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            ) : !showResult ? (
              <motion.div
                key={currentQuestion}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="py-4"
              >
                <p className="text-base font-medium mb-6" data-testid={`text-question-${currentQuestion + 1}`}>
                  {QUESTIONS[currentQuestion].text}
                </p>

                <div className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    className="justify-start text-left"
                    onClick={() => handleAnswer(true)}
                    data-testid={`button-answer-yes-${currentQuestion + 1}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                    {QUESTIONS[currentQuestion].yesLabel}
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start text-left"
                    onClick={() => handleAnswer(false)}
                    data-testid={`button-answer-no-${currentQuestion + 1}`}
                  >
                    <XCircle className="w-4 h-4 mr-2 text-muted-foreground flex-shrink-0" />
                    {QUESTIONS[currentQuestion].noLabel}
                  </Button>
                </div>
              </motion.div>
            ) : result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="py-4"
              >
                {(() => {
                  const config = RESULT_CONFIG[result];
                  const ResultIcon = config.icon;
                  const band = getReadinessBand(readinessScore);
                  const bandConfig = BAND_CONFIG[band];
                  return (
                    <>
                      <div className="text-center mb-5">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-3">
                          <ResultIcon className={`w-8 h-8 ${config.color}`} />
                        </div>
                        <h3 className={`text-xl font-bold mb-1 ${config.color}`} data-testid="text-result-title">
                          {config.title}
                        </h3>
                        <p className="text-muted-foreground text-sm" data-testid="text-result-subtitle">
                          {config.subtitle}
                        </p>
                      </div>

                      <div className="rounded-md bg-muted/50 p-4 mb-4" data-testid="readiness-score-panel">
                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Financial Readiness Index
                          </span>
                          <Badge
                            variant="secondary"
                            className={`${bandConfig.color} text-xs no-default-hover-elevate no-default-active-elevate`}
                            data-testid="badge-readiness-band"
                          >
                            {bandConfig.label}
                          </Badge>
                        </div>

                        <div className="flex items-end gap-2 mb-3">
                          <span className="text-3xl font-bold tabular-nums" data-testid="text-readiness-score">
                            {readinessScore}
                          </span>
                          <span className="text-sm text-muted-foreground mb-1">/ 100</span>
                        </div>

                        <div className="relative h-2.5 w-full bg-muted rounded-full overflow-hidden">
                          <motion.div
                            className={`absolute inset-y-0 left-0 rounded-full ${bandConfig.bgColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${readinessScore}%` }}
                            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                          />
                          <div className="absolute top-0 bottom-0 left-[40%] w-px bg-foreground/10" />
                          <div className="absolute top-0 bottom-0 left-[70%] w-px bg-foreground/10" />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">0</span>
                          <span className="text-[10px] text-muted-foreground">40</span>
                          <span className="text-[10px] text-muted-foreground">70</span>
                          <span className="text-[10px] text-muted-foreground">100</span>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between" data-testid="text-average-score">
                          <span className="text-xs text-muted-foreground">Average American Score:</span>
                          <span className="text-xs font-bold text-muted-foreground">41</span>
                        </div>
                      </div>

                      <div className="space-y-2 mb-5">
                        {SCORE_BREAKDOWN.map((item) => {
                          const val = answers[item.key];
                          const earned = item.invertedLogic ? val === false : val === true;
                          return (
                            <div key={item.key} className="flex items-center justify-between gap-2" data-testid={`breakdown-${item.key}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                {earned ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/50" />
                                )}
                                <span className={`text-xs truncate ${earned ? "" : "text-muted-foreground"}`}>
                                  {item.label}
                                </span>
                              </div>
                              <span className={`text-xs font-medium tabular-nums ${earned ? "" : "text-muted-foreground"}`}>
                                {earned ? `+${item.weight}` : "0"}/{item.weight}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            Recommended Based on Your Assessment
                          </span>
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <p className="text-sm mb-4">
                          Your score of <span className="font-bold">{readinessScore}/100</span> means the{" "}
                          <span className="font-semibold">{config.plan}</span> is built for exactly where you are.
                        </p>
                        <div className="flex flex-col gap-3">
                          <Button onClick={handleRedirect} data-testid="button-get-my-plan">
                            Get My Plan
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setQuizOpen(false);
                              navigate("/roadmap/dashboard");
                            }}
                            data-testid="button-view-dashboard"
                          >
                            View My Dashboard
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                          <Button variant="ghost" onClick={resetQuiz} data-testid="button-retake-quiz">
                            Retake Quiz
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}

