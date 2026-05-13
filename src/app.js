import express from "express";
import { rateLimit } from "express-rate-limit";
import { apiRouter } from "./routes/index.js";

const jsonDefault = express.json({ limit: "1mb" });
const jsonLarge = express.json({ limit: "180mb" });

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
  app.use((req, res, next) => {
    if (req.path.startsWith("/analyze-image")) {
      return jsonLarge(req, res, next);
    }
    return jsonDefault(req, res, next);
  });
  app.use("/", apiRouter);
  return app;
}
