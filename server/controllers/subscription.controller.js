import { kafkaProducer } from "../services/kafka.js";

export async function handleSubscription(req, res) {
  const { name, email, plan } = req.body;
  if (!name || !email || !plan) {
    return res.status(400).json({ error: "Name, email, and plan are required" });
  }
  const amount = plan === "Prime" ? 999 : 499;

  await kafkaProducer.send({
    topic: "invoice-jobs",
    messages: [{ value: JSON.stringify({ name, email, plan, amount }) }]
  });

  res.status(202).json({ message: "Subscription accepted. Invoice will be emailed shortly." });
}
