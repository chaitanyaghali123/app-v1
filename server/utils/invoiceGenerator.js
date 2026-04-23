// server/utils/invoiceGenerator.js
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function generateInvoice({ name, email, plan, amount }) {
  const invoiceId = uuidv4();
  const invoicesDir = path.join(process.cwd(), "invoices"); // ✅ safe relative path

  // Ensure invoices directory exists
  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  const filePath = path.join(invoicesDir, `${invoiceId}.pdf`);
  const doc = new PDFDocument();

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Invoice content
    doc.fontSize(20).text("Subscription Invoice", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice ID: ${invoiceId}`);
    doc.text(`Name: ${name}`);
    doc.text(`Email: ${email}`);
    doc.text(`Plan: ${plan}`);
    doc.text(`Amount: ₹${amount}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();
    doc.text("Thank you for subscribing!", { align: "center" });

    doc.end();

    stream.on("finish", () => {
      resolve({
        invoiceId,
        invoiceUrl: `/invoices/${invoiceId}.pdf` // ✅ works if invoices folder is served statically
      });
    });

    stream.on("error", (err) => {
      console.error("❌ Invoice generation failed:", err);
      reject(err);
    });
  });
}
