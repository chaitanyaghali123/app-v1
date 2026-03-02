import express from "express";
import { createOrder } from "../controllers/payment.controller.js";

const router = express.Router();
router.post("/order", createOrder);
export default router;
