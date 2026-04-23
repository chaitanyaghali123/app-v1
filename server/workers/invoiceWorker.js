// server/invoiceWorker.js

import { kafkaConsumer } from "../services/kafka.js";
import { generateInvoice } from "../utils/invoiceGenerator.js";
import { sendInvoiceEmail } from "../services/email.service.js";
import { saveInvoice } from "../services/db.service.js"; // ✅ use saveInvoice

async function startInvoiceWorker() {
  await kafkaConsumer.subscribe({ topic: "invoice-jobs" });

  await kafkaConsumer.run({
    eachMessage: async ({ message }) => {
      const { name, email, plan, amount } = JSON.parse(message.value.toString());

      try {
        // ✅ Generate invoice PDF
        const { invoiceId, invoiceUrl } = await generateInvoice({ name, email, plan, amount });

        // ✅ Save invoice metadata in DB
        await saveInvoice({ email, plan, amount, url: invoiceUrl });

        // ✅ Send invoice email
        await sendInvoiceEmail({ to: email, name, invoiceUrl });

        console.log(`✅ Invoice ${invoiceId} sent to ${email}`);
      } catch (err) {
        console.error(`❌ Failed invoice job: ${err.message}`);
        // Optional: push to DLQ or retry
      }
    }
  });
}

// ✅ Start worker
startInvoiceWorker().catch((err) => {
  console.error("❌ Invoice worker failed to start:", err);
});
