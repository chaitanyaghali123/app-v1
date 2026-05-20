// routes/subscription.route.js

import express from "express";
import {
  createSubscription,
  listUserInvoices
} from "../controllers/subscription.controller.js";

const router = express.Router();

// ✅ Create a new subscription (invoice)
router.post("/", createSubscription);

// ✅ List invoices for a user
router.get("/", listUserInvoices);

export default router;
