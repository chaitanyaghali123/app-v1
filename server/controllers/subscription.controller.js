// controllers/subscription.controller.js

import { saveInvoice, listInvoices } from "../services/db.service.js";

// ✅ Create a new subscription invoice
export const createSubscription = async (req, res) => {
  try {
    const { email, plan, amount, url } = req.body;

    if (!email || !plan || !amount || !url) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const invoiceId = await saveInvoice({ email, plan, amount, url });

    return res.json({
      success: true,
      invoiceId,
      message: "Subscription created successfully"
    });
  } catch (err) {
    console.error("❌ createSubscription error:", err.message);
    return res.status(500).json({ error: "Failed to create subscription" });
  }
};

// ✅ List all invoices for a user
export const listUserInvoices = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const invoices = await listInvoices(email);

    return res.json({ invoices });
  } catch (err) {
    console.error("❌ listUserInvoices error:", err.message);
    return res.status(500).json({ error: "Failed to fetch invoices" });
  }
};
