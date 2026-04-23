// routes/profile.route.js
import express from "express";
import { getProfile } from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/", getProfile);

export default router;
