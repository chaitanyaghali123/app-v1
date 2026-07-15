import express from "express";
import {
  getMobileRagContext,
  getMobileModelArtifact,
} from "../controllers/mobile.controller.js";

const router = express.Router();

router.post("/rag-context", getMobileRagContext);
router.get("/models/:file", getMobileModelArtifact);

export default router;
