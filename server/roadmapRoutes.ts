import type { Express } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.js";
import { roadmapLeads, roadmapQuizResults } from "@shared/schema";

const PHASE_ORDER = { STABILIZE: 0, ELIMINATE: 1, BUILD: 2 } as const;
type Phase = keyof typeof PHASE_ORDER;

const answersSchema = z.object({
  overdraft_recent: z.boolean(),
  knows_true_balance: z.boolean(),
  has_high_interest_debt: z.boolean(),
  has_emergency_savings: z.boolean(),
  actively_investing: z.boolean(),
});

function calculateReadinessScore(answers: z.infer<typeof answersSchema>): number {
  let score = 0;
  if (!answers.overdraft_recent) score += 30;
  if (!answers.has_high_interest_debt) score += 25;
  if (answers.has_emergency_savings) score += 20;
  if (answers.knows_true_balance) score += 15;
  if (answers.actively_investing) score += 10;
  return score;
}

function determinePhase(answers: z.infer<typeof answersSchema>): Phase {
  if (answers.overdraft_recent || !answers.knows_true_balance) return "STABILIZE";
  if (answers.has_high_interest_debt || !answers.has_emergency_savings) return "ELIMINATE";
  if (answers.actively_investing) return "BUILD";
  return "ELIMINATE";
}

function checkUpgradeTrigger(phase: string, score: number): Phase | null {
  if (phase === "STABILIZE" && score >= 50) return "ELIMINATE";
  if (phase === "ELIMINATE" && score >= 75) return "BUILD";
  return null;
}

const submissionSchema = z.object({
  phase: z.enum(["STABILIZE", "ELIMINATE", "BUILD"]),
  readiness_score: z.number().min(0).max(100),
  answers: answersSchema,
});

export function registerRoadmapRoutes(app: Express): void {
  app.post("/api/roadmap/quiz-results", async (req, res) => {
    try {
      const parsed = submissionSchema.parse(req.body);
      const [result] = await db.insert(roadmapQuizResults).values({
        phase: parsed.phase,
        readinessScore: parsed.readiness_score,
        upgradeAvailable: checkUpgradeTrigger(parsed.phase, parsed.readiness_score),
        overdraftRecent: parsed.answers.overdraft_recent,
        knowsTrueBalance: parsed.answers.knows_true_balance,
        hasHighInterestDebt: parsed.answers.has_high_interest_debt,
        hasEmergencySavings: parsed.answers.has_emergency_savings,
        activelyInvesting: parsed.answers.actively_investing,
      }).returning();
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid quiz data", errors: error.errors });
      } else {
        console.error("Roadmap quiz save failed", error);
        res.status(500).json({ message: "Failed to save quiz result" });
      }
    }
  });

  app.get("/api/roadmap/quiz-results/:id", async (req, res) => {
    try {
      const [result] = await db.select().from(roadmapQuizResults).where(eq(roadmapQuizResults.id, req.params.id));
      if (!result) return void res.status(404).json({ message: "Quiz result not found" });
      res.json(result);
    } catch (error) {
      console.error("Roadmap result fetch failed", error);
      res.status(500).json({ message: "Failed to fetch quiz result" });
    }
  });

  app.post("/api/roadmap/recalculate-readiness", async (req, res) => {
    try {
      const parsed = z.object({ id: z.string(), answers: answersSchema }).parse(req.body);
      const [existing] = await db.select().from(roadmapQuizResults).where(eq(roadmapQuizResults.id, parsed.id));
      if (!existing) return void res.status(404).json({ message: "Quiz result not found" });

      const newScore = calculateReadinessScore(parsed.answers);
      const calculatedPhase = determinePhase(parsed.answers);
      const currentOrder = PHASE_ORDER[existing.phase as Phase] ?? 0;
      const calculatedOrder = PHASE_ORDER[calculatedPhase] ?? 0;
      const finalPhase = calculatedOrder >= currentOrder ? calculatedPhase : existing.phase as Phase;
      const upgradeAvailable = checkUpgradeTrigger(finalPhase, newScore);

      const [updated] = await db.update(roadmapQuizResults).set({
        phase: finalPhase,
        readinessScore: newScore,
        upgradeAvailable,
        overdraftRecent: parsed.answers.overdraft_recent,
        knowsTrueBalance: parsed.answers.knows_true_balance,
        hasHighInterestDebt: parsed.answers.has_high_interest_debt,
        hasEmergencySavings: parsed.answers.has_emergency_savings,
        activelyInvesting: parsed.answers.actively_investing,
      }).where(eq(roadmapQuizResults.id, parsed.id)).returning();
      res.json({ ...updated, upgrade_triggered: !!upgradeAvailable });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ message: "Invalid data", errors: error.errors });
      else {
        console.error("Roadmap recalculation failed", error);
        res.status(500).json({ message: "Failed to recalculate readiness" });
      }
    }
  });

  app.post("/api/roadmap/quiz-results/:id/confirm-upgrade", async (req, res) => {
    try {
      const [existing] = await db.select().from(roadmapQuizResults).where(eq(roadmapQuizResults.id, req.params.id));
      if (!existing) return void res.status(404).json({ message: "Quiz result not found" });
      if (!existing.upgradeAvailable) return void res.status(400).json({ message: "No upgrade available" });
      const currentOrder = PHASE_ORDER[existing.phase as Phase] ?? 0;
      const upgradeOrder = PHASE_ORDER[existing.upgradeAvailable as Phase] ?? 0;
      if (upgradeOrder <= currentOrder) return void res.status(400).json({ message: "Cannot downgrade phase" });

      const nextPhase = existing.upgradeAvailable;
      const [updated] = await db.update(roadmapQuizResults).set({
        phase: nextPhase,
        upgradeAvailable: null,
      }).where(eq(roadmapQuizResults.id, req.params.id)).returning();
      const redirects: Record<string, string> = {
        ELIMINATE: "/membership?recommended=momentum",
        BUILD: "/membership?recommended=legacy",
      };
      res.json({ ...updated, redirect: redirects[nextPhase] || null });
    } catch (error) {
      console.error("Roadmap phase upgrade failed", error);
      res.status(500).json({ message: "Failed to confirm upgrade" });
    }
  });

  app.post("/api/roadmap/leads", async (req, res) => {
    try {
      const parsed = z.object({
        email: z.string().email(),
        phase: z.enum(["STABILIZE", "ELIMINATE", "BUILD"]),
        readiness_score: z.number().min(0).max(100),
        quiz_result_id: z.string().optional(),
      }).parse(req.body);
      const [lead] = await db.insert(roadmapLeads).values({
        email: parsed.email,
        phase: parsed.phase,
        readinessScore: parsed.readiness_score,
        quizResultId: parsed.quiz_result_id || null,
      }).returning({ id: roadmapLeads.id });
      res.json({ success: true, id: lead.id });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ message: "Invalid data", errors: error.errors });
      else {
        console.error("Roadmap lead save failed", error);
        res.status(500).json({ message: "Failed to save lead" });
      }
    }
  });
}
