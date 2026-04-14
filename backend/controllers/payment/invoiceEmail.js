/**
 * Invoice email template + delivery.
 * Non-critical path — failures are logged, never thrown.
 */

import { getMailTransporter } from "./config.js";
import { logger } from "../../config/logger.js";

// Escape user-controlled strings before interpolating into the HTML body.
function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function invoiceHtml({ userName, orgName, planName, amount, orderId, paymentId, invoiceDate, expiryDate }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#7c3aed,#3b82f6);padding:32px;text-align:center;">
        <h1 style="margin:0;font-size:1.4rem;color:#fff;">\u2726 Math Collective</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:0.85rem;">Payment Invoice</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#94a3b8;">Hi ${esc(userName)},</p>
        <p style="color:#94a3b8;line-height:1.7;">
          Your payment was successful! Your organisation <strong style="color:#f1f5f9;">${esc(orgName)}</strong>
          has been upgraded to the <strong style="color:#a78bfa;">${esc(planName)}</strong> plan.
        </p>
        <div style="background:#1e293b;border-radius:10px;padding:20px;margin:24px 0;">
          <h3 style="margin:0 0 16px;color:#a78bfa;font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em;">Invoice Details</h3>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Invoice Date</td>
              <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;font-size:0.9rem;">${esc(invoiceDate)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Order ID</td>
              <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;font-size:0.8rem;color:#94a3b8;">${esc(orderId)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Payment ID</td>
              <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;font-size:0.8rem;color:#94a3b8;">${esc(paymentId)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Plan</td>
              <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;">${esc(planName)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Valid Until</td>
              <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;color:#4ade80;">${esc(expiryDate)}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;font-weight:700;font-size:1rem;">Total Paid</td>
              <td style="padding:12px 0;text-align:right;font-weight:700;font-size:1.1rem;color:#4ade80;">\u20B9${Number(amount).toLocaleString("en-IN")}</td>
            </tr>
          </table>
        </div>
        <p style="color:#64748b;font-size:0.8rem;line-height:1.7;">
          Your plan will auto-expire on ${esc(expiryDate)}. You will receive a reminder before expiry.
          For any billing queries, reply to this email.
        </p>
      </div>
      <div style="padding:20px 32px;border-top:1px solid #1e293b;text-align:center;">
        <p style="color:#334155;font-size:0.75rem;margin:0;">
          Math Collective &middot; BMSIT &middot; ${new Date().getFullYear()}<br>
          This is an automated payment confirmation.
        </p>
      </div>
    </div>
  `;
}

export async function sendInvoiceEmail({ to, userName, orgName, planName, amount, orderId, paymentId, expiresAt }) {
  const transporter = getMailTransporter();
  const invoiceDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const expiryDate  = expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  try {
    await transporter.sendMail({
      from:    `"Math Collective Billing" <${process.env.CONTACT_EMAIL}>`,
      to,
      subject: `Payment Confirmed \u2014 ${planName} Plan | Math Collective`,
      html: invoiceHtml({ userName, orgName, planName, amount, orderId, paymentId, invoiceDate, expiryDate }),
    });
    logger.info({ to }, "Payment invoice email sent");
  } catch (err) {
    logger.error({ err: err }, "Payment Invoice email failed");
    // Swallow — payment succeeded, invoice is non-critical
  }
}
