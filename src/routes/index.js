import { Router } from "express";
import { analyzeDreamRouter } from "./analyzeDream.js";
import { analyzeImageRouter } from "./analyzeImage.js";

export const apiRouter = Router();

apiRouter.use("/analyze-dream", analyzeDreamRouter);
apiRouter.use("/analyze-image", analyzeImageRouter);
