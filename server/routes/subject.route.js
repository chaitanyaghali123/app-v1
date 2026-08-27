import express from "express";
import { getSubjects, getGsPapers } from "../controllers/subject.controller.js";

const router = express.Router();

router.get("/subjects", getSubjects);
router.get("/gs-papers", getGsPapers);

export default router;
