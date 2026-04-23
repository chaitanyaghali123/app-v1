import { kafkaProducer } from "../services/kafka.js";
import { saveInvoice } from "../services/db.service.js";
import { pool } from "../services/db.service.js"; // reuse pg pool

export async function handleSubscription(req, res) {
  try {
    const { userId, name, email, plan } = req.body;
    if (!userId || !name || !email || !plan) {
      return res.status(400).json({ error: "userId, name, email, and plan are required" });
    }

    // ✅ Calculate amount
    const amount = plan === "Prime" ? 999 : 499;

    // ✅ Update user subscription status
    await pool.query(
      `UPDATE users SET is_subscribed = true WHERE id = $1`,
      [userId]
    );

    // ✅ Save invoice in DB
    const invoiceId = await saveInvoice({ email, plan, amount, url: "" });

    // ✅ Push invoice job to Kafka (for async processing / n8n)
    await kafkaProducer.send({
      topic: "invoice-jobs",
      messages: [
        { value: JSON.stringify({ userId, name, email, plan, amount, invoiceId }) }
      ]
    });

    res.status(202).json({
      message: "Subscription activated. Invoice will be emailed shortly.",
      plan,
      amount,
      invoiceId
    });
  } catch (err) {
    console.error("❌ Subscription error:", err);
    res.status(500).json({ error: "Failed to activate subscription" });
  }
}
