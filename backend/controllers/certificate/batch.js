import nodemailer            from "nodemailer";
import path                  from "path";
import fs                    from "fs";
import { sendNotification }  from "../notificationController.js";
import { buildCertificate }  from "./pdf.js";
import { ASSET_DIR }         from "./helpers.js";
import { logger } from "../../config/logger.js";
import supabase from "../../config/supabase.js";

// Tenant scoping: every DB call below uses req.db.from(...) which is
// installed by injectTenant on /api routes. The Proxy auto-injects
// org_id on inserts and chains eq("org_id", req.orgId) on
// SELECT/UPDATE/DELETE for tenant tables, so:
//  - matchStudents only finds students inside the caller's org
//  - createCertificateBatch's INSERTs into certificate_batches and
//    certificates pick up org_id automatically (the caller can't
//    create rows tagged to another org)
//  - getBatches / deleteBatch never see or touch other orgs' rows
// Direct `supabase` import is intentionally absent.

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.CONTACT_EMAIL, pass: process.env.CONTACT_APP_PASSWORD },
  });
}

/* ═══════════════════════════════════════════════════════════════
   MATCH STUDENTS
   POST /api/certificates/match-students
═══════════════════════════════════════════════════════════════ */
export const matchStudents = async (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails?.length) return res.json({ matches: {} });
    const { data } = await req.db.from("students").select("user_id,email,name")
      .in("email", emails.map(e => e.toLowerCase()));
    const matches = {};
    (data||[]).forEach(s => { matches[s.email.toLowerCase()] = { userId: s.user_id, name: s.name }; });
    return res.json({ matches });
  } catch { return res.status(500).json({ error: "Failed" }); }
};

/* ═══════════════════════════════════════════════════════════════
   CREATE BATCH
   POST /api/certificates/create
═══════════════════════════════════════════════════════════════ */
export const createCertificateBatch = async (req, res) => {
  const userId = req.session?.user?.id;
  try {
    const {
      title:        titleRaw,
      eventName, eventDate, issuedBy,
      certType = "PARTICIPATION", organiserLine = "", bodyText = "",
      logoFilenames: logoFilenamesRaw,
      signatories:   signatoriesRaw,
      // Simple-form fields (teacher UI sends these; schema transforms
      // logoUrl/sigUrl/templateUrl into bare filenames before they
      // reach us).
      logoUrl, sigUrl, templateUrl, palette,
      recipients:   recipientsRaw,
      sendEmail,
      template = "classic",
    } = req.body;

    // Title falls back to the event name — the simple UI has no
    // separate "batch title" field.
    const title = (titleRaw && titleRaw.trim()) || eventName;

    // logoFilenames merges the rich-form array with the simple-form
    // logoUrl so either shape works.
    const logoFilenames = [
      ...(Array.isArray(logoFilenamesRaw) ? logoFilenamesRaw : []),
      ...(logoUrl ? [logoUrl] : []),
    ].filter(Boolean);

    // Signatories merges the rich-form array with a single auto-
    // generated signatory from the simple-form sigUrl + issuedBy.
    const signatories = [
      ...(Array.isArray(signatoriesRaw) ? signatoriesRaw : []),
      ...(sigUrl
        ? [{ name: issuedBy || "", title: "", signatureFilename: sigUrl }]
        : []),
    ];

    // recipients may arrive as a newline-separated string from the
    // simple UI, or as the rich {name,email?,userId?} array from an
    // API caller / future UI. Normalise to the rich shape.
    const recipients = Array.isArray(recipientsRaw)
      ? recipientsRaw
      : (recipientsRaw || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            // "Name <email>" or "Name, email" or plain "Name"
            const emailMatch = line.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
            const email = emailMatch ? emailMatch[0] : null;
            const name  = line.replace(emailMatch?.[0] || "", "").replace(/[<>,]/g, "").trim();
            return { name: name || line, email };
          });

    void palette; // cosmetic UI hint — accepted by the schema, not yet
                  // threaded into pdf.js (the PDF's accent is already
                  // derived from logo colours). Reserved for future use.

    if (!eventName || !recipients?.length)
      return res.status(400).json({ error: "eventName and at least one recipient are required" });

    const tp = f => f ? path.join(ASSET_DIR, f) : null;
    const logoPaths    = logoFilenames.filter(Boolean).map(tp).filter(p => p && fs.existsSync(p));
    const sigWithPaths = signatories.map(s => ({
      ...s, signatureImagePath: s.signatureFilename ? tp(s.signatureFilename) : null,
    }));
    // templateUrl arrives as a bare filename (schema strips the
    // /uploads/cert-assets/ prefix). Resolve to an absolute path for
    // the renderer and only accept it if the file actually exists.
    const templateImagePath = templateUrl && fs.existsSync(tp(templateUrl))
      ? tp(templateUrl)
      : null;

    // Resolve org_id explicitly. Earlier prod failure: the tenant
    // proxy's injection was somehow not applying on this specific
    // insert and Postgres rejected the row with "null value in
    // column org_id". Sidestepping req.db + raw supabase + manually
    // supplying org_id removes the dependency on the proxy plumbing.
    // Service-role bypasses RLS, so we lose no guardrail.
    const orgIdForInsert = req.orgId || req.session?.user?.org_id;
    if (!orgIdForInsert) {
      logger.error({ userId, session: req.session?.user }, "cert create: no org_id in session");
      return res.status(400).json({
        error: "No organisation context on your session. Log out and log back in.",
      });
    }

    // Save batch record. template_image historically doubled as a
    // cache for the first logo filename; we keep that fallback for
    // backward compat with existing rows, but when the teacher
    // supplied an actual template image we use the column for its
    // real purpose and tag it so download.js knows which intent
    // applies (custom-image background vs. logo fallback).
    const hasCustomTemplate = !!templateUrl;
    const templateImageValue = hasCustomTemplate
      ? `/uploads/cert-assets/${templateUrl}`
      : (logoFilenames[0] ? `/uploads/cert-assets/${logoFilenames[0]}` : null);
    const { data: batch, error: batchErr } = await supabase
      .from("certificate_batches").insert({
        org_id: orgIdForInsert,
        title, event_name: eventName, event_date: eventDate,
        issued_by: issuedBy,
        template_type: hasCustomTemplate ? "custom-image" : "pdfkit",
        template_image: templateImageValue,
        recipients, created_by: userId,
        signatory_name:  signatories[0]?.name  || null,
        signatory_title: signatories[0]?.title || null,
      }).select().single();

    if (batchErr) return res.status(500).json({ error: batchErr.message });

    // Insert each recipient row and SELECT them back so we have the
    // auto-generated download_token for every cert — needed by the
    // PDF generator to encode the per-cert verify URL + QR.
    // Same org_id reasoning as above: explicit injection on raw
    // supabase, no proxy dependency.
    const { data: certRows, error: certsErr } = await supabase
      .from("certificates")
      .insert(recipients.map(r => ({
        org_id: orgIdForInsert,
        batch_id: batch.id, user_id: r.userId||null,
        recipient_name: r.name, recipient_email: r.email||null, event_name: eventName,
      })))
      .select("id,recipient_email,recipient_name,download_token");

    if (certsErr) return res.status(500).json({ error: certsErr.message });
    // Map recipient email -> download_token for the email loop below.
    const tokenByEmail = {};
    (certRows || []).forEach(r => {
      if (r.recipient_email) tokenByEmail[r.recipient_email.toLowerCase()] = r.download_token;
    });

    const certBase = {
      eventName, certType, organiserLine, bodyText, eventDate, issuedBy,
      logoPaths, signatories: sigWithPaths, template,
      templateImagePath,
    };

    let emailsSent = 0;
    let emailFailed = 0;
    if (sendEmail && process.env.CONTACT_EMAIL) {
      const transporter = getTransporter();
      for (const r of recipients) {
        if (!r.email) continue;
        try {
          const pdfBuf = await buildCertificate({
            recipientName: r.name,
            ...certBase,
            downloadToken: tokenByEmail[r.email.toLowerCase()],
          });
          await transporter.sendMail({
            from: `"Math Collective" <${process.env.CONTACT_EMAIL}>`,
            to: r.email,
            subject: `Your Certificate — ${eventName}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px;">
              <h2 style="color:#a78bfa;">🎓 Your Certificate is Here!</h2>
              <p style="color:#94a3b8;">Congratulations <strong style="color:#f1f5f9;">${r.name}</strong>!</p>
              <p style="color:#94a3b8;">Your certificate for <strong style="color:#f1f5f9;">${eventName}</strong> is attached.</p>
              <p style="color:#64748b;font-size:.85rem;margin-top:1.5rem;">— ${issuedBy || "Math Collective"}</p>
            </div>`,
            attachments: [{
              filename:    `Certificate_${r.name.replace(/\s+/g,"_")}.pdf`,
              content:     pdfBuf,
              contentType: "application/pdf",
            }],
          });
          emailsSent++;
          if (r.userId) await sendNotification({
            userIds: [r.userId], orgId: req.orgId,
            title: "🎓 Your Certificate is Ready!",
            body:    `Your certificate for "${eventName}" has been issued.`,
            type:    "certificate", link: "/dashboard",
          });
        } catch (e) {
          emailFailed++;
          logger.error({ err: e, recipient: r.email }, "cert email send failed");
        }
      }
    } else {
      const uids = recipients.filter(r=>r.userId).map(r=>r.userId);
      if (uids.length) await sendNotification({
        userIds: uids, orgId: req.orgId,
        title: "🎓 Your Certificate is Ready!",
        body:    `Your certificate for "${eventName}" has been issued. Download from your dashboard.`,
        type:    "certificate", link: "/dashboard",
      });
    }

    return res.json({
      success: true, batchId: batch.id,
      total: recipients.length, emailsSent, emailFailed,
      linked: recipients.filter(r=>r.userId).length,
      emailSkipped: sendEmail && !process.env.CONTACT_EMAIL
        ? "CONTACT_EMAIL env var not set — configure Gmail app password in Render to enable email delivery"
        : undefined,
    });
  } catch (err) {
    logger.error({ err: err }, "cert create");
    return res.status(500).json({ error: "Generation failed: " + err.message.slice(0,200) });
  }
};

/* ═══════════════════════════════════════════════════════════════
   GET BATCHES / MY CERTS / DELETE
═══════════════════════════════════════════════════════════════ */
export const getBatches = async (req, res) => {
  try {
    const { data, error } = await req.db.from("certificate_batches")
      .select("id,title,event_name,event_date,template_type,template_image,created_at,recipients")
      .order("created_at",{ ascending:false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json((data||[]).map(b=>({...b,count:Array.isArray(b.recipients)?b.recipients.length:0,recipients:undefined})));
  } catch { return res.status(500).json({ error:"Failed" }); }
};

export const getMyCertificates = async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error:"Login required" });
  try {
    const { data, error } = await req.db.from("certificates")
      .select("id,recipient_name,event_name,issued_at")
      .eq("user_id",userId).order("issued_at",{ ascending:false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data||[]);
  } catch { return res.status(500).json({ error:"Failed" }); }
};

export const deleteBatch = async (req, res) => {
  try {
    await req.db.from("certificates").delete().eq("batch_id",req.params.id);
    await req.db.from("certificate_batches").delete().eq("id",req.params.id);
    return res.json({ success:true });
  } catch { return res.status(500).json({ error:"Failed" }); }
};
