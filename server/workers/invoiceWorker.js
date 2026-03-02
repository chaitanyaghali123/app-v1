import { kafkaConsumer } from "../services/kafka.js";
import { generateInvoice } from "../utils/invoiceGenerator.js";
import { sendInvoiceEmail } from "../services/email.service.js";
import { saveInvoiceMetadata } from "../services/db.service.js";

await kafkaConsumer.subscribe({ topic: "invoice-jobs" });

await kafkaConsumer.run({
  eachMessage: async ({ message }) => {
    const { name, email, plan, amount } = JSON.parse(message.value.toString());

    try {
      const { invoiceId, invoiceUrl } = await generateInvoice({ name, email, plan, amount });
      await saveInvoiceMetadata({ invoiceId, email, plan, amount, invoiceUrl });
      await sendInvoiceEmail({ to: email, name, invoiceUrl });
      console.log(`✅ Invoice ${invoiceId} sent to ${email}`);
    } catch (err) {
      console.error(`❌ Failed invoice job: ${err.message}`);
    }
  }
});
