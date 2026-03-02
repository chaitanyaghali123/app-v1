import express from "express";
import { getRevisionsBySubject, getRevisionsByResponseId } from "../controllers/revision.controller.js";

const router = express.Router();

// FIX: frontend expects /api/revisions?subject_id=&user_id=
router.get("/", getRevisionsBySubject);

// keep existing by responseId
router.get("/:responseId", getRevisionsByResponseId);

export default router;
