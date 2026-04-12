/**
 * CONTACT CONTROLLER
 * Sends contact form submissions to asymptotesbmsit@gmail.com
 */

import nodemailer from "nodemailer";

// Escape HTML special characters to prevent injection in rendered emails
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Basic email format validation (don't embed unexpected content in mailto links)
function isValidEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 320;
}

// Resolve arena URL from env, fall back sensibly
function arenaUrl() {
  const base = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || "").replace(/\/$/, "");
  return base ? `${base}/arena` : "/arena";
}

/* ─────────────────────────────────────
   SEND CONTACT MESSAGE
   Route: POST /api/contact/send
───────────────────────────────────── */
export const sendContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!email || !message) {
    return res.status(400).json({ error: "Email and message are required." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }
  if (typeof message !== "string" || message.length > 5000) {
    return res.status(400).json({ error: "Message too long (max 5000 chars)." });
  }
  if (name && (typeof name !== "string" || name.length > 200)) {
    return res.status(400).json({ error: "Name too long." });
  }
  if (subject && (typeof subject !== "string" || subject.length > 200)) {
    return res.status(400).json({ error: "Subject too long." });
  }

  // Escape all user input before embedding in HTML
  const safeName    = escapeHtml(name || "Anonymous");
  const safeEmail   = escapeHtml(email);
  const safeSubject = escapeHtml(subject || "—");
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const safeGreeting = escapeHtml(name ? name.split(" ")[0] : "there");

  // Subject header is also user-controlled — strip control chars
  const headerSubject = (subject || "New Contact Message").replace(/[\r\n]+/g, " ").slice(0, 150);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.CONTACT_EMAIL,
      pass: process.env.CONTACT_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from:    `"Math Collective Contact" <${process.env.CONTACT_EMAIL}>`,
      to:      process.env.CONTACT_EMAIL,
      replyTo: email,
      subject: `[Math Collective] ${headerSubject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="margin:0;font-size:1.3rem;color:#a78bfa;">\u{1F4EC} New Contact Form Submission</h2>
            <p style="color:#64748b;font-size:0.85rem;margin:4px 0 0;">Math Collective &middot; BMSIT</p>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:0.85rem;width:90px;">From</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;font-weight:600;">${safeName}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:0.85rem;">Email</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;"><a href="mailto:${encodeURIComponent(email)}" style="color:#a78bfa;">${safeEmail}</a></td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:0.85rem;">Subject</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e293b;">${safeSubject}</td>
            </tr>
            <tr>
              <td style="padding:16px 0;vertical-align:top;color:#94a3b8;font-size:0.85rem;">Message</td>
              <td style="padding:16px 0;">
                <div style="background:#1e293b;border-radius:8px;padding:16px;line-height:1.7;font-size:0.95rem;">
                  ${safeMessage}
                </div>
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;text-align:center;">
            <a href="mailto:${encodeURIComponent(email)}?subject=Re:%20${encodeURIComponent((subject || 'Your message').slice(0, 150))}"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:0.9rem;font-weight:600;">
              Reply to ${safeName}
            </a>
          </div>
          <p style="text-align:center;color:#334155;font-size:0.75rem;margin-top:24px;">
            Sent via Math Collective contact form &middot; ${new Date().toLocaleString("en-IN")}
          </p>
        </div>
      `,
    });

    // Auto-reply to the sender
    await transporter.sendMail({
      from:    `"Math Collective" <${process.env.CONTACT_EMAIL}>`,
      to:      email,
      subject: `We got your message \u2014 Math Collective`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="margin:0;font-size:1.3rem;">Thanks for reaching out, ${safeGreeting}! \u{1F44B}</h2>
          </div>
          <p style="color:#94a3b8;line-height:1.75;">
            We received your message and will get back to you within <strong style="color:#f1f5f9;">24 hours</strong>.
          </p>
          <div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #7c3aed;">
            <p style="color:#64748b;font-size:0.8rem;margin:0 0 8px;">Your message:</p>
            <p style="color:#94a3b8;margin:0;font-size:0.9rem;line-height:1.65;">${safeMessage}</p>
          </div>
          <p style="color:#94a3b8;line-height:1.75;">
            In the meantime, why not head to the Arena and solve some challenges?
          </p>
          <div style="text-align:center;margin-top:24px;">
            <a href="${arenaUrl()}"
               style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:0.9rem;font-weight:600;">
              \u2694 Go to Arena
            </a>
          </div>
          <p style="text-align:center;color:#334155;font-size:0.75rem;margin-top:24px;">
            Math Collective &middot; BMSIT &middot; This is an automated reply.
          </p>
        </div>
      `,
    });

    console.log(`[Contact] \u2713 Message from ${email} sent successfully`);
    return res.json({ success: true, message: "Message sent! We'll reply within 24 hours." });

  } catch (err) {
    console.error("[Contact] Email error:", err.message);
    return res.status(500).json({ error: "Failed to send message. Please try again." });
  }
};
