import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(`${time} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) throw new Error(`Could not find the build directory: ${distPath}`);
  app.use(express.static(distPath));
  app.use("*", (_req, res) => res.sendFile(path.resolve(distPath, "index.html")));
}
