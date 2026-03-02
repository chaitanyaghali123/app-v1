export async function sendInvoiceEmail({ to, name, invoiceUrl }) {
  console.log(`📧 [DEV MODE] Email to ${to}: Hi ${name}, download invoice at ${invoiceUrl}`);
}
