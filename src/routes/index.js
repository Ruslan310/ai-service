import { Router } from "express";
import { analyzeDreamRouter } from "./analyzeDream.js";

export const apiRouter = Router();

apiRouter.use("/analyze-dream", analyzeDreamRouter);
