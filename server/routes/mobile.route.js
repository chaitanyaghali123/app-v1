import express from "express";
import {
  getMobileRagContext,
} from "../controllers/mobile.controller.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/rag-context", authenticate, getMobileRagContext);

export default router;
