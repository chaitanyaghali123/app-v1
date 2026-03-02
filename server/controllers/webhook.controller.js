import { kafkaProducer } from "../services/kafka.js";

export async function handleWebhook(req, res) {
  const { email, plan } = req.body;

  await kafkaProducer.send({
    topic: "invoice-jobs",
    messages: [{ value: JSON.stringify({ name: "User", email, plan, amount: 999 }) }]
  });

  res.json({ status: "ok (stubbed)" });
}
