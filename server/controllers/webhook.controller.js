import { kafkaProducer } from "../services/kafka.js";
import { saveInvoice } from "../services/db.service.js";
import { pool } from "../services/db.service.js";

export async function handleWebhook(req, res) {
  try {
    const { userId, email, plan, paymentId, amount } = req.body;

    if (!userId || !email || !plan || !paymentId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ✅ Mark user as subscribed
    await pool.query(
      `UPDATE users SET is_subscribed = true WHERE id = $1`,
      [userId]
    );

    // ✅ Save invoice in DB
    const invoiceId = await saveInvoice({
      email,
      plan,
      amount,
      url: `https://razorpay.com/payment/${paymentId}`
    });

    // ✅ Push invoice job to Kafka for async email/n8n
    await kafkaProducer.send({
      topic: "invoice-jobs",
      messages: [
        { value: JSON.stringify({ userId, email, plan, amount, invoiceId, paymentId }) }
      ]
    });

    res.json({ status: "ok", invoiceId });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ error: "Webhook handling failed" });
  }
}
