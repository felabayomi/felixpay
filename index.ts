// Vercel's Express detector expects a root entrypoint importing Express.
import express from "express";
import app from "./server/app.js";

void express;
export default app;
