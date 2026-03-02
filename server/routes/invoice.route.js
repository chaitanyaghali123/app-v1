import express from "express";
import { getInvoices } from "../controllers/invoice.controller.js";
const router = express.Router();
router.get("/", getInvoices);
export default router;
