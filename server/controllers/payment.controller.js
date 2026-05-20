import { kafkaProducer } from "../services/kafka.js";
import { saveInvoice } from "../services/db.service.js";
import { pool } from "../services/db.service.js"; // reuse pg pool

// ✅ Step 1: Create Razorpay order (stubbed for now)
export async function createOrder(req, res) {
  try {
    const { userId, name, email, plan } = req.body;
    if (!userId || !name || !email || !plan) {
      return res.status(400).json({ error: "userId, name, email, and plan are required" });
    }

    const amount = plan === "Prime" ? 99900 : 49900; // paise (₹999 / ₹499)

    res.json({
      orderId: `order_${Date.now()}`,
      key: "rzp_test_stub",
      amount,
      currency: "INR",
    });
  } catch (err) {
    console.error("❌ createOrder error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}

// ✅ Step 2: Handle payment success → activate subscription
export async function handlePaymentSuccess(req, res) {
  try {
    const { userId, name, email, plan, paymentId } = req.body;
    if (!userId || !name || !email || !plan || !paymentId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const amount = plan === "Prime" ? 999 : 499;

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

    // ✅ Push invoice job to Kafka (for async email/n8n)
    await kafkaProducer.send({
      topic: "invoice-jobs",
      messages: [
        { value: JSON.stringify({ userId, name, email, plan, amount, invoiceId, paymentId }) }
      ]
    });

    res.json({
      success: true,
      message: "Subscription activated successfully",
      plan,
      amount,
      invoiceId
    });
  } catch (err) {
    console.error("❌ handlePaymentSuccess error:", err);
    res.status(500).json({ error: "Failed to activate subscription" });
  }
}