// services/email.service.js
import axios from "axios";

const EMAIL_FROM = process.env.EMAIL_FROM || "admin@upsc-learning.com";

function hasSendGrid() {
  return Boolean(process.env.SENDGRID_API_KEY);
}

async function sendViaSendGrid({ to, subject, text, html }) {
  const response = await axios.post(
    "https://api.sendgrid.com/v3/mail/send",
    {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: EMAIL_FROM },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
  return response.status >= 200 && response.status < 300;
}

function logEmailFallback(to, subject, text) {
  console.log(`📧 [dev email] To: ${to}`);
  console.log(`📧 [dev email] Subject: ${subject}`);
  console.log(`📧 [dev email] Body:\n${text}`);
}

// Sends a 6-digit code either for email verification or password reset.
export async function sendAuthCodeEmail({ to, code, purpose }) {
  const subject =
    purpose === "reset_password"
      ? "Aryabhata – Password Reset Code"
      : "Aryabhata – Verify Your Email";

  const text =
    purpose === "reset_password"
      ? `Your Aryabhata password reset code is: ${code}\n\nThis code is valid for 15 minutes. If you did not request it, you can safely ignore this email.`
      : `Welcome to Aryabhata! Your email verification code is: ${code}\n\nThis code is valid for 15 minutes.`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <h2 style="color:#4f46e5;margin:0 0 12px;">Aryabhata</h2>
      <p style="color:#374151;font-size:15px;line-height:1.5;">${text
        .split("\n")
        .filter(Boolean)
        .join("<br/>")}</p>
      <div style="background:#f3f4ff;border:1px dashed #c7d2fe;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
        <span style="font-size:28px;font-weight:800;letter-spacing:6px;color:#111827;">${code}</span>
      </div>
      <p style="color:#9ca3af;font-size:12px;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  return sendAuthCodeEmailRaw({ to, subject, text, html });
}

async function sendAuthCodeEmailRaw({ to, subject, text, html }) {
  if (!hasSendGrid()) {
    logEmailFallback(to, subject, text);
    return true;
  }

  try {
    return await sendViaSendGrid({ to, subject, text, html });
  } catch (err) {
    console.error("❌ Email send failed:", err.message);
    logEmailFallback(to, subject, text);
    return false;
  }
}