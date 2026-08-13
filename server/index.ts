import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { validateStripeConfiguration } from "./lib/stripe";
import { validateMercuryConfiguration } from "./services/mercury";

const app = express();

// Apply raw body middleware for Stripe webhooks BEFORE JSON parsing
// This is critical for webhook signature verification which requires the raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // PRODUCTION READINESS: Validate all critical configurations at startup
  console.log('🔧 Validating application configuration...');
  
  try {
    // Validate Stripe configuration (will throw if invalid)
    validateStripeConfiguration();
    console.log('✅ Stripe configuration validated successfully');
    
    // Validate Mercury configuration (optional - will warn if misconfigured but not block startup)
    try {
      validateMercuryConfiguration();
      console.log('✅ Mercury configuration validated successfully');
    } catch (mercuryError: any) {
      console.warn('⚠️ Mercury configuration validation failed:', mercuryError.message);
      console.warn('💡 Mercury funding will be unavailable, falling back to Stripe-only mode');
      console.warn('💡 To enable Mercury: Set MERCURY_API_TOKEN environment variable');
    }
    
    console.log('✅ All payment system configurations validated successfully');
  } catch (error: any) {
    console.error('❌ Configuration validation failed:', error.message);
    console.error('🚨 Application cannot start safely without proper configuration');
    console.error('Please check your environment variables and try again.');
    process.exit(1); // Fail fast to prevent runtime issues
  }
  
  console.log('🚀 Configuration validation complete, starting application...');
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
