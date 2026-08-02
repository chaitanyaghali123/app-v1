import express from "express";
import {
  getMobileRagContext,
} from "../controllers/mobile.controller.js";

const router = express.Router();

router.post("/rag-context", getMobileRagContext);

export default router;
