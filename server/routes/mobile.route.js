import express from "express";
import {
  getMobileRagContext,
  polishMobileAnswer,
} from "../controllers/mobile.controller.js";

const router = express.Router();

router.post("/rag-context", getMobileRagContext);
router.post("/polish", polishMobileAnswer);

export default router;
