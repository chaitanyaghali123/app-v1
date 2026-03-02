import { listInvoices } from "../services/db.service.js";

export async function getInvoices(req, res) {
  try {
    const invoices = await listInvoices();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
}
