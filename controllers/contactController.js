/**
 * CONTACT CONTROLLER
 * Sends contact form submissions to asymptotesbmsit@gmail.com
 */

import nodemailer from "nodemailer";

/* ─────────────────────────────────────
   SEND CONTACT MESSAGE
   Route: POST /api/contact/send
───────────────────────────────────── */
export const sendContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required." });
  }

  // ← FIXED: create transporter HERE (inside function), not at top of file
  // This ensures process.env vars are available when the function runs
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.CONTACT_EMAIL,
      pass: process.env.CONTACT_APP_PASSWORD,
    },
  });

  try {
    // Email to YOU
    await transporter.sendMail({
      from:    `"Math Collective Contact" <${process.env.CONTACT_EMAIL}>`,
      to:      process.env.CONTACT_EMAIL,
      replyTo: email,
      subject: `[Math Collective] ${subject || "New Contact Message"}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="margin:0;font-size:1.3rem;color:#a78bfa;">📬 New Contact Form Submission</h2>
            <p style="color:#64748b;font-size:0.85rem;margin:4px 0 0;">Math Collective · BMSIT</p>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:0.85rem;width:90px;">From</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;font-weight:600;">${name || "Anonymous"}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:0.85rem;">Email</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;"><a href="mailto:${email}" style="color:#a78bfa;">${email}</a></td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:0.85rem;">Subject</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;">${subject || "—"}</td>
            </tr>
            <tr>
              <td style="padding:16px 0;vertical-align:top;color:#94a3b8;font-size:0.85rem;">Message</td>
              <td style="padding:16px 0;">
                <div style="background:#1e293b;border-radius:8px;padding:16px;line-height:1.7;font-size:0.95rem;">
                  ${message.replace(/\n/g, "<br>")}
                </div>
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;text-align:center;">
            <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject || 'Your message')}"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:0.9rem;font-weight:600;">
              Reply to ${name || email}
            </a>
          </div>
          <p style="text-align:center;color:#334155;font-size:0.75rem;margin-top:24px;">
            Sent via Math Collective contact form · ${new Date().toLocaleString("en-IN")}
          </p>
        </div>
      `,
    });

    // Auto-reply to the student
    await transporter.sendMail({
      from:    `"Math Collective" <${process.env.CONTACT_EMAIL}>`,
      to:      email,
      subject: `We got your message — Math Collective`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="margin:0;font-size:1.3rem;">Thanks for reaching out, ${name ? name.split(" ")[0] : "there"}! 👋</h2>
          </div>
          <p style="color:#94a3b8;line-height:1.75;">
            We received your message and will get back to you within <strong style="color:#f1f5f9;">24 hours</strong>.
          </p>
          <div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #7c3aed;">
            <p style="color:#64748b;font-size:0.8rem;margin:0 0 8px;">Your message:</p>
            <p style="color:#94a3b8;margin:0;font-size:0.9rem;line-height:1.65;">${message.replace(/\n/g, "<br>")}</p>
          </div>
          <p style="color:#94a3b8;line-height:1.75;">
            In the meantime, why not head to the Arena and solve some challenges?
          </p>
          <div style="text-align:center;margin-top:24px;">
            <a href="http://localhost:3000/arena"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:0.9rem;font-weight:600;">
              ⚔ Go to Arena
            </a>
          </div>
          <p style="text-align:center;color:#334155;font-size:0.75rem;margin-top:24px;">
            Math Collective · BMSIT · This is an automated reply.
          </p>
        </div>
      `,
    });

    console.log(`[Contact] ✓ Message from ${email} sent successfully`);
    return res.json({ success: true, message: "Message sent! We'll reply within 24 hours." });

  } catch (err) {
    console.error("[Contact] Email error:", err.message);
    return res.status(500).json({ error: "Failed to send message. Please try again." });
  }
};