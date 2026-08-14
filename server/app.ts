import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic, log } from "./runtime.js";
import { validateStripeConfiguration } from "./lib/stripe.js";
import { validateMercuryConfiguration } from "./services/mercury.js";

const app = express();
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) log(`${req.method} ${req.path} ${res.statusCode} in ${Date.now() - start}ms`);
  });
  next();
});

try { validateStripeConfiguration(); } catch (error) { console.warn("Stripe is not configured; payment features remain unavailable.", error); }
try { validateMercuryConfiguration(); } catch (error) { console.warn("Mercury is not configured; Mercury features remain unavailable.", error); }

const server = await registerRoutes(app);
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status || err.statusCode || 500).json({ message: err.message || "Internal Server Error" });
});

if (app.get("env") === "development" && !process.env.VERCEL) {
  const { setupVite } = await import("./vite.js");
  await setupVite(app, server);
} else {
  serveStatic(app);
}

export default app;
export { server };
