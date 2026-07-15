import express from "express";
import { getSubjects } from "../controllers/subject.controller.js";

const router = express.Router();

router.get("/subjects", getSubjects);

export default router;
