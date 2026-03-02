import express from "express";
import { handleSubjects } from "../controllers/subjects.controller.js";

const router = express.Router();

// GET /api/subjects
router.get("/", handleSubjects);

export default router;
