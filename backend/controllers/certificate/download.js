// Swapped away from the old xelatex-based generator (required
// TexLive on the host, which Render's free tier doesn't have —
// certs silently failed in prod). The new pdfkit-based generator
// has the same signature plus a `template` and `downloadToken`
// prop.
import { buildCertificate } from "./pdf.js";
import { ASSET_DIR }        from "./helpers.js";

// Tenant scoping: every DB call below uses req.db.from(...) which is
// installed by injectTenant on /api routes. The Proxy auto-adds
// eq("org_id", req.orgId) on every SELECT/UPDATE/DELETE for tenant
// tables, so a request from org A can never read or download org B's
// certificates by guessing an ID. Super_admin without impersonation
// gets the unfiltered Supabase client back, preserving cross-org
// admin tooling. Direct `supabase` import is intentionally absent.

/* ═══════════════════════════════════════════════════════════════
   PREVIEW
   POST /api/certificates/preview
═══════════════════════════════════════════════════════════════ */
import path from "path";
import fs   from "fs";
import { logger } from "../../config/logger.js";

export const previewCertificate = async (req, res) => {
  try {
    const {
      eventName = "Sample Event", certType = "PARTICIPATION",
      organiserLine = "", bodyText = "", eventDate = "", issuedBy = "",
      logoFilenames = [], signatories = [],
      // Simple-form passthroughs from the teacher UI. logoUrl/sigUrl
      // arrive as full /uploads/... paths; templateUrl is the optional
      // background image. We normalise all three to bare filenames so
      // the ASSET_DIR join below works.
      logoUrl, sigUrl, templateUrl,
    } = req.body;

    const stripPrefix = (s) => (s || "").replace(/^.*\/cert-assets\//, "").replace(/^\/+/, "");
    const mergedLogos = [
      ...logoFilenames,
      ...(logoUrl ? [stripPrefix(logoUrl)] : []),
    ].filter(Boolean);

    const tp = f => f ? path.join(ASSET_DIR, f) : null;
    const logoPaths = mergedLogos.map(tp).filter(p => p && fs.existsSync(p));
    const sigFilename = sigUrl ? stripPrefix(sigUrl) : null;
    const sigWithPaths = [
      ...signatories.map(s => ({
        ...s,
        signatureImagePath: s.signatureFilename ? tp(s.signatureFilename) : null,
      })),
      ...(sigFilename && fs.existsSync(tp(sigFilename))
        ? [{ name: issuedBy || "", title: "", signatureImagePath: tp(sigFilename) }]
        : []),
    ];

    const templateFilename = templateUrl ? stripPrefix(templateUrl) : null;
    const templateImagePath = templateFilename && fs.existsSync(tp(templateFilename))
      ? tp(templateFilename)
      : null;

    const pdfBuf = await buildCertificate({
      recipientName: "Recipient Name",
      eventName, certType, organiserLine,
      bodyText, eventDate, issuedBy,
      logoPaths, signatories: sigWithPaths,
      template: req.body.template || "classic",
      templateImagePath,
    });

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"preview.pdf\"");
    return res.send(pdfBuf);
  } catch (err) {
    logger.error({ err: err }, "Preview");
    return res.status(500).json({ error: err.message.slice(0, 300) });
  }
};

/* ═══════════════════════════════════════════════════════════════
   DOWNLOAD SINGLE
═══════════════════════════════════════════════════════════════ */
export const downloadCertificate = async (req, res) => {
  try {
    const { data: cert, error } = await req.db.from("certificates")
      .select("*,certificate_batches(*)").eq("id",req.params.id).maybeSingle();
    if (error||!cert) return res.status(404).json({ error: "Not found" });
    const b = cert.certificate_batches;
    // template_image doubles as either a custom background (when
    // template_type === "custom-image") or a logo-filename cache
    // (legacy behaviour, when template_type is "pdfkit" or missing).
    // Route it to the correct opts key so the renderer doesn't stretch
    // a small logo across the whole page.
    const storedPath = b.template_image
      ? path.join(ASSET_DIR, b.template_image.replace(/^.*\/cert-assets\//, ""))
      : null;
    const isCustomTemplate = b.template_type === "custom-image" && storedPath;
    const logoPaths = !isCustomTemplate && storedPath ? [storedPath] : [];
    const templateImagePath = isCustomTemplate ? storedPath : null;
    const pdfBuf = await buildCertificate({
      recipientName: cert.recipient_name,
      eventName:     cert.event_name,
      eventDate:     b.event_date  || "",
      issuedBy:      b.issued_by   || "",
      certType:      b.cert_type   || "PARTICIPATION",
      template:      b.template_variant || "classic",
      logoPaths,
      templateImagePath,
      signatories:   b.signatory_name ? [{ name: b.signatory_name, title: b.signatory_title }] : [],
      downloadToken: cert.download_token,
    });
    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Certificate_${cert.recipient_name.replace(/\s+/g,"_")}.pdf"`);
    return res.send(pdfBuf);
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

/* ═══════════════════════════════════════════════════════════════
   BULK ZIP
═══════════════════════════════════════════════════════════════ */
export const downloadBatchZip = async (req, res) => {
  try {
    const { data: batch } = await req.db.from("certificate_batches")
      .select("*").eq("id",req.params.batchId).maybeSingle();
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    const { data: certs } = await req.db.from("certificates").select("*").eq("batch_id",batch.id);
    const archiver = (await import("archiver")).default;
    res.setHeader("Content-Type","application/zip");
    res.setHeader("Content-Disposition",`attachment; filename="Certificates_${batch.event_name.replace(/\s+/g,"_")}.zip"`);
    const archive = archiver("zip",{ zlib:{ level:6 } });
    archive.pipe(res);
    const storedPath = batch.template_image
      ? path.join(ASSET_DIR, batch.template_image.replace(/^.*\/cert-assets\//, ""))
      : null;
    const isCustomTemplate = batch.template_type === "custom-image" && storedPath;
    const batchLogo         = !isCustomTemplate && storedPath ? [storedPath] : [];
    const batchTemplatePath = isCustomTemplate ? storedPath : null;
    for (const cert of (certs||[])) {
      const pdfBuf = await buildCertificate({
        recipientName: cert.recipient_name, eventName: cert.event_name,
        eventDate: batch.event_date||"", issuedBy: batch.issued_by||"",
        certType:  batch.cert_type || "PARTICIPATION",
        template:  batch.template_variant || "classic",
        logoPaths: batchLogo,
        templateImagePath: batchTemplatePath,
        signatories: batch.signatory_name?[{name:batch.signatory_name,title:batch.signatory_title}]:[],
        downloadToken: cert.download_token,
      });
      archive.append(pdfBuf,{ name:`${cert.recipient_name.replace(/\s+/g,"_")}.pdf` });
    }
    await archive.finalize();
  } catch (err) { logger.error({ err: err }, "zip"); res.status(500).end(); }
};
