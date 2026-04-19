/**
 * Certificate PDF generation via pdfkit.
 *
 * Replaces the old XeLaTeX pipeline which required `xelatex` + the
 * TexLive distribution (~1GB) on the host — nonexistent on Render
 * free tier, which is why prod certs silently failed.
 *
 * This module is pure JS:
 *   - pdfkit        — vector PDF writer (already a dep)
 *   - qrcode        — PNG QR generation (installed alongside this work)
 *   - sharp         — logo dominant-colour sampling (already a dep)
 *
 * Three preset templates, picked by `template` prop:
 *   - "classic"   navy + gold, serif, academic
 *   - "modern"    theme-purple, sans-serif, contemporary
 *   - "minimal"   black-on-white, spaced typography
 *
 * Every certificate gets:
 *   - A cryptographically unique ID (MC-XXXX-XXXX-XXXX) tied to the
 *     row's download_token
 *   - A QR code encoding a public verify URL
 *   - XMP metadata (title, author, subject) so PDF viewers expose
 *     issuer + recipient without needing to parse the body
 *   - A footer line with the verify URL for anyone who can't scan
 */

import PDFDocument from "pdfkit";
import QRCode      from "qrcode";
import fs          from "fs";
import { extractPalette } from "./helpers.js";

// A4 landscape in PDF points (1 point = 1/72 in). 842 × 595.
const PAGE = { W: 842, H: 595 };

// Public verify URL base. Falls back to FRONTEND_URL env var or a
// sensible production default if unset.
function verifyUrlFor(token) {
  const base = (process.env.FRONTEND_URL || "https://math-collective.onrender.com").replace(/\/$/, "");
  return `${base}/verify?token=${token}`;
}

function certIdFor(token) {
  // MC-XXXX-XXXX-XXXX, derived from the first 12 hex chars of the
  // download_token UUID. Deterministic, unique-per-cert, reads well
  // aloud, easy to type into a verify form if the QR won't scan.
  const hex = (token || "").replace(/-/g, "").toUpperCase().padEnd(12, "0");
  return `MC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

// ═══════════════════════════════════════════════════════════
// Template palettes
// ═══════════════════════════════════════════════════════════

const TEMPLATES = {
  classic: {
    bg:       "#fbfaf6",
    border:   "#0b2545",
    accent:   "#b08a3e",
    heading:  "#0b2545",
    body:     "#1a1a2e",
    muted:    "#6b6b7a",
    fontTitle: "Times-Bold",
    fontBody:  "Times-Roman",
    fontItalic: "Times-Italic",
  },
  modern: {
    bg:       "#ffffff",
    border:   "#7c3aed",
    accent:   "#22d3ee",
    heading:  "#0f172a",
    body:     "#1e293b",
    muted:    "#64748b",
    fontTitle: "Helvetica-Bold",
    fontBody:  "Helvetica",
    fontItalic: "Helvetica-Oblique",
  },
  minimal: {
    bg:       "#ffffff",
    border:   "#0a0a0a",
    accent:   "#0a0a0a",
    heading:  "#0a0a0a",
    body:     "#2a2a2a",
    muted:    "#6e6e6e",
    fontTitle: "Helvetica-Bold",
    fontBody:  "Helvetica",
    fontItalic: "Helvetica-Oblique",
  },
};

// ═══════════════════════════════════════════════════════════
// Public entry — same signature as the old latex.js buildCertificate
// ═══════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {string} opts.recipientName
 * @param {string} opts.eventName
 * @param {string} [opts.certType]        PARTICIPATION | EXCELLENCE | COMPLETION | etc.
 * @param {string} [opts.organiserLine]
 * @param {string} [opts.bodyText]        custom middle paragraph
 * @param {string} [opts.eventDate]       ISO or human string
 * @param {string} [opts.issuedBy]
 * @param {string[]} [opts.logoPaths]     absolute paths to PNG/JPG logos
 * @param {Array<{name:string,title?:string,signatureImagePath?:string}>} [opts.signatories]
 * @param {string} [opts.template]        classic | modern | minimal (default classic)
 * @param {string} [opts.templateImagePath] absolute path to a full-bleed user-uploaded
 *                                        background PNG/JPG. When present, it REPLACES
 *                                        the preset background fill and border so the
 *                                        teacher's design carries the visual branding.
 *                                        Text, signatures, and QR still render on top.
 * @param {string} [opts.downloadToken]   UUID from certificates.download_token; used for verify URL + cert ID
 * @returns {Promise<Buffer>}
 */
export async function buildCertificate(opts) {
  const {
    recipientName,
    eventName,
    certType        = "PARTICIPATION",
    organiserLine   = "",
    bodyText        = "",
    eventDate       = "",
    issuedBy        = "Math Collective",
    logoPaths       = [],
    signatories     = [],
    template: templateKey,
    templateImagePath,
    downloadToken,
  } = opts || {};

  // When the caller supplied a custom template image, it supplies the
  // background + border + any brand marks by itself — so we skip the
  // preset background fill and the ornamental border. If the image
  // doesn't exist on disk we silently fall back to the preset style.
  const useCustomTemplate = !!(templateImagePath && fs.existsSync(templateImagePath));

  const tKey = (templateKey && TEMPLATES[templateKey]) ? templateKey : "classic";
  const T    = TEMPLATES[tKey];

  // Derive accent colour from a logo if one was provided + the
  // preset is "modern" (which is meant to adapt). Classic + minimal
  // keep their defined palettes for brand consistency.
  let accent = T.accent;
  if (tKey === "modern" && logoPaths[0] && fs.existsSync(logoPaths[0])) {
    try {
      const pal = await extractPalette(logoPaths[0]);
      if (pal?.primary) accent = pal.primary;
    } catch { /* keep preset */ }
  }

  // Cert ID + verify URL come from the row's download_token. If
  // the caller forgot to pass one (e.g. live preview), synthesise
  // a random throwaway so the page still looks right.
  const token = downloadToken || cryptoRandomToken();
  const certId    = certIdFor(token);
  const verifyUrl = verifyUrlFor(token);

  // Render the QR as a PNG buffer for embedding.
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    margin: 1,
    width: 220,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  // Build the doc.
  const doc = new PDFDocument({
    size:   [PAGE.W, PAGE.H],
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    info: {
      Title:    `Certificate — ${eventName}`,
      Author:   issuedBy || "Math Collective",
      Subject:  `Certificate of ${certType} awarded to ${recipientName}`,
      Keywords: `certificate, ${certType}, ${eventName}, Math Collective, ${certId}`,
      Producer: "Math Collective PDF Engine",
    },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ─────── Background
  if (useCustomTemplate) {
    try {
      doc.image(templateImagePath, 0, 0, { width: PAGE.W, height: PAGE.H });
    } catch {
      // The file exists but pdfkit rejected it (unsupported format,
      // corrupt, etc.). Fall back to the preset fill + border so the
      // cert still renders rather than erroring the whole batch.
      doc.rect(0, 0, PAGE.W, PAGE.H).fill(T.bg);
      drawBorder(doc, T, accent);
    }
  } else {
    doc.rect(0, 0, PAGE.W, PAGE.H).fill(T.bg);
    // ─────── Outer ornamental border
    drawBorder(doc, T, accent);
  }

  // ─────── Logo row (top centre) — stack horizontally if multiple
  const validLogos = logoPaths.filter((p) => p && fs.existsSync(p)).slice(0, 3);
  if (validLogos.length > 0) {
    const logoH    = 60;
    const gap      = 20;
    const totalW   = validLogos.length * logoH + (validLogos.length - 1) * gap;
    let x          = (PAGE.W - totalW) / 2;
    const y        = 50;
    for (const p of validLogos) {
      try {
        doc.image(p, x, y, { fit: [logoH, logoH], align: "center", valign: "center" });
      } catch { /* bad image, skip */ }
      x += logoH + gap;
    }
  }

  // ─────── Header — "CERTIFICATE OF …"
  doc.fillColor(T.muted)
     .font(T.fontBody)
     .fontSize(11)
     .text("MATH COLLECTIVE · BMSIT", 0, validLogos.length ? 130 : 80, { align: "center", characterSpacing: 3 });

  doc.fillColor(T.heading)
     .font(T.fontTitle)
     .fontSize(40)
     .text(`Certificate of ${capFirst(certType)}`, 0, validLogos.length ? 150 : 100, { align: "center" });

  // Decorative rule under header
  const ruleY = validLogos.length ? 212 : 162;
  doc.moveTo(PAGE.W / 2 - 80, ruleY).lineTo(PAGE.W / 2 + 80, ruleY)
     .lineWidth(1).strokeColor(accent).stroke();

  // ─────── "This is to certify that"
  doc.fillColor(T.muted)
     .font(T.fontItalic)
     .fontSize(13)
     .text("This is to certify that", 0, ruleY + 18, { align: "center" });

  // ─────── Recipient name — the star of the doc
  doc.fillColor(T.heading)
     .font(T.fontTitle)
     .fontSize(36)
     .text(recipientName, 0, ruleY + 44, { align: "center" });

  // ─────── Body — either the caller's custom bodyText or a sensible default
  const paragraph = bodyText
    || `has successfully ${defaultVerb(certType)} ${eventName}${organiserLine ? `, organised by ${organiserLine}` : ""}${eventDate ? `, on ${prettyDate(eventDate)}` : ""}.`;

  doc.fillColor(T.body)
     .font(T.fontBody)
     .fontSize(13)
     .text(paragraph, 100, ruleY + 100, { align: "center", width: PAGE.W - 200, lineGap: 4 });

  // ─────── Signatories row (bottom)
  drawSignatories(doc, T, signatories);

  // ─────── QR + cert ID (bottom-right)
  drawQrBlock(doc, T, qrPng, certId, verifyUrl);

  // ─────── Footer verify line
  doc.fillColor(T.muted)
     .font(T.fontBody)
     .fontSize(8)
     .text(
       `Verify at ${verifyUrl}  ·  ID ${certId}`,
       40, PAGE.H - 22,
       { align: "center", width: PAGE.W - 80, characterSpacing: 0.6 },
     );

  doc.end();
  return done;
}

// ═══════════════════════════════════════════════════════════
// Drawing helpers
// ═══════════════════════════════════════════════════════════

function drawBorder(doc, T, accent) {
  // Outer thick frame
  doc.lineWidth(2)
     .strokeColor(T.border)
     .rect(22, 22, PAGE.W - 44, PAGE.H - 44)
     .stroke();
  // Inner accent frame
  doc.lineWidth(0.6)
     .strokeColor(accent)
     .rect(30, 30, PAGE.W - 60, PAGE.H - 60)
     .stroke();
  // Corner flourishes — small filled squares at each inner corner
  const corners = [
    [30, 30], [PAGE.W - 30, 30],
    [30, PAGE.H - 30], [PAGE.W - 30, PAGE.H - 30],
  ];
  for (const [x, y] of corners) {
    doc.rect(x - 3, y - 3, 6, 6).fill(accent);
  }
}

function drawSignatories(doc, T, signatories) {
  const row = (signatories || []).filter((s) => s?.name).slice(0, 3);
  if (row.length === 0) return;

  const slotW = (PAGE.W - 200) / row.length;
  const y     = PAGE.H - 140;

  row.forEach((s, i) => {
    const cx = 100 + slotW * i + slotW / 2;

    // Signature image above the rule (if present)
    if (s.signatureImagePath && fs.existsSync(s.signatureImagePath)) {
      try {
        doc.image(s.signatureImagePath, cx - 50, y - 40, { fit: [100, 36] });
      } catch { /* skip */ }
    }

    // Rule
    doc.moveTo(cx - 70, y).lineTo(cx + 70, y).lineWidth(0.6).strokeColor(T.border).stroke();

    // Name + title
    doc.fillColor(T.heading).font(T.fontTitle).fontSize(11)
       .text(s.name, cx - 90, y + 6, { width: 180, align: "center" });
    if (s.title) {
      doc.fillColor(T.muted).font(T.fontItalic).fontSize(9)
         .text(s.title, cx - 90, y + 22, { width: 180, align: "center" });
    }
  });
}

function drawQrBlock(doc, T, qrPng, certId, verifyUrl) {
  void verifyUrl;                       // URL is rendered in footer; block shows short ID + QR
  const size = 72;
  const x    = PAGE.W - 40 - size;
  const y    = 50;

  // White card under the QR for contrast on coloured borders
  doc.rect(x - 6, y - 6, size + 12, size + 12 + 26)
     .fill("#ffffff")
     .lineWidth(0.4)
     .strokeColor(T.border)
     .stroke();
  doc.image(qrPng, x, y, { fit: [size, size] });

  // Cert ID under the QR
  doc.fillColor(T.heading)
     .font(T.fontBody)
     .fontSize(7)
     .text(certId, x - 6, y + size + 2, { width: size + 12, align: "center", characterSpacing: 0.5 });
}

// ═══════════════════════════════════════════════════════════
// Copy helpers
// ═══════════════════════════════════════════════════════════

function capFirst(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function prettyDate(s) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function defaultVerb(certType) {
  const t = (certType || "").toLowerCase();
  if (t.includes("excel"))    return "demonstrated excellence in";
  if (t.includes("achiev"))   return "achieved distinction in";
  if (t.includes("compl"))    return "completed";
  if (t.includes("winner"))   return "won";
  if (t.includes("merit"))    return "achieved merit in";
  if (t.includes("apprec"))   return "contributed to";
  return "participated in";
}

function cryptoRandomToken() {
  // Fallback for preview (no row exists yet).
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

export default buildCertificate;
