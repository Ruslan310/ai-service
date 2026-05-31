import express from "express";
import { rateLimit } from "express-rate-limit";
import { apiRouter } from "./routes/index.js";

/** Matches analyzeImage.js caps (60 MB decoded images) + base64/JSON overhead. */
const JSON_BODY_LIMIT_LARGE = "180mb";
const JSON_BODY_LIMIT_DEFAULT = "1mb";

const jsonDefault = express.json({ limit: JSON_BODY_LIMIT_DEFAULT });
const jsonLarge = express.json({ limit: JSON_BODY_LIMIT_LARGE });

/** Image upload routes (with or without reverse-proxy prefix e.g. /ai). */
function needsLargeJsonBody(req) {
  const path = req.path ?? "";
  const originalUrl = req.originalUrl ?? "";
  return path.includes("/analyze-image") || originalUrl.includes("/analyze-image");
}

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
    if (needsLargeJsonBody(req)) {
      return jsonLarge(req, res, next);
    }
    return jsonDefault(req, res, next);
  });

  // More specific mount first (reverse proxy base path /ai)
  app.use("/ai", apiRouter);
  app.use("/", apiRouter);

  app.use((err, req, res, next) => {
    if (err?.type === "entity.too.large") {
      const large = needsLargeJsonBody(req);
      return res.status(413).json({
        error: large
          ? `Request body too large (max ${JSON_BODY_LIMIT_LARGE} JSON for analyze-image)`
          : `Request body too large (max ${JSON_BODY_LIMIT_DEFAULT} JSON)`
      });
    }
    return next(err);
  });

  return app;
}
