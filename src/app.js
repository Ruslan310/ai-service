import express from "express";
import { rateLimit } from "express-rate-limit";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests" },
  });

  app.use(limiter);
  app.use(express.json({ limit: "1mb" }));
  app.use("/", apiRouter);
  return app;
}
