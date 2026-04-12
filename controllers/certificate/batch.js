import supabase             from "../../config/supabase.js";
import nodemailer            from "nodemailer";
import path                  from "path";
import fs                    from "fs";
import { sendNotification }  from "../notificationController.js";
import { buildCertificate }  from "./latex.js";
import { ASSET_DIR }         from "./helpers.js";

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
    const { data } = await supabase.from("students").select("user_id,email,name")
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
      title, eventName, eventDate, issuedBy,
      certType = "PARTICIPATION", organiserLine = "", bodyText = "",
      logoFilenames = [], signatories = [],
      recipients, sendEmail,
    } = req.body;

    if (!title || !eventName || !recipients?.length)
      return res.status(400).json({ error: "title, eventName, and recipients required" });

    const tp = f => f ? path.join(ASSET_DIR, f) : null;
    const logoPaths    = logoFilenames.filter(Boolean).map(tp).filter(p => p && fs.existsSync(p));
    const sigWithPaths = signatories.map(s => ({
      ...s, signatureImagePath: s.signatureFilename ? tp(s.signatureFilename) : null,
    }));

    // Save batch record
    const { data: batch, error: batchErr } = await supabase
      .from("certificate_batches").insert({
        title, event_name: eventName, event_date: eventDate,
        issued_by: issuedBy, template_type: "ai-latex",
        template_image: logoFilenames[0] ? `/uploads/cert-assets/${logoFilenames[0]}` : null,
        recipients, created_by: userId,
        signatory_name:  signatories[0]?.name  || null,
        signatory_title: signatories[0]?.title || null,
      }).select().single();

    if (batchErr) return res.status(500).json({ error: batchErr.message });

    await supabase.from("certificates").insert(
      recipients.map(r => ({
        batch_id: batch.id, user_id: r.userId||null,
        recipient_name: r.name, recipient_email: r.email||null, event_name: eventName,
      }))
    );

    const certBase = {
      eventName, certType, organiserLine, bodyText, eventDate, issuedBy,
      logoPaths, signatories: sigWithPaths,
    };

    let emailsSent = 0;
    if (sendEmail && process.env.CONTACT_EMAIL) {
      const transporter = getTransporter();
      for (const r of recipients) {
        if (!r.email) continue;
        try {
          const pdfBuf = await buildCertificate({ recipientName: r.name, ...certBase, useAI: true });
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
            userIds: [r.userId], title: "🎓 Your Certificate is Ready!",
            body:    `Your certificate for "${eventName}" has been issued.`,
            type:    "certificate", link: "/dashboard",
          });
        } catch (e) { console.error("[cert email]", r.email, e.message); }
      }
    } else {
      const uids = recipients.filter(r=>r.userId).map(r=>r.userId);
      if (uids.length) await sendNotification({
        userIds: uids, title: "🎓 Your Certificate is Ready!",
        body:    `Your certificate for "${eventName}" has been issued. Download from your dashboard.`,
        type:    "certificate", link: "/dashboard",
      });
    }

    return res.json({
      success: true, batchId: batch.id,
      total: recipients.length, emailsSent,
      linked: recipients.filter(r=>r.userId).length,
    });
  } catch (err) {
    console.error("[cert create]", err.message);
    return res.status(500).json({ error: "Generation failed: " + err.message.slice(0,200) });
  }
};

/* ═══════════════════════════════════════════════════════════════
   GET BATCHES / MY CERTS / DELETE
═══════════════════════════════════════════════════════════════ */
export const getBatches = async (req, res) => {
  try {
    const { data, error } = await supabase.from("certificate_batches")
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
    const { data, error } = await supabase.from("certificates")
      .select("id,recipient_name,event_name,issued_at")
      .eq("user_id",userId).order("issued_at",{ ascending:false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data||[]);
  } catch { return res.status(500).json({ error:"Failed" }); }
};

export const deleteBatch = async (req, res) => {
  try {
    await supabase.from("certificates").delete().eq("batch_id",req.params.id);
    await supabase.from("certificate_batches").delete().eq("id",req.params.id);
    return res.json({ success:true });
  } catch { return res.status(500).json({ error:"Failed" }); }
};
