import supabase          from "../config/supabase.js";
import nodemailer         from "nodemailer";
import path               from "path";
import fs                 from "fs";
import os                 from "os";
import { execSync }       from "child_process";
import { fileURLToPath }  from "url";
import axios              from "axios";
import { sendNotification } from "./notificationController.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, "..", "public", "uploads", "cert-assets");
fs.mkdirSync(ASSET_DIR, { recursive: true });

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.CONTACT_EMAIL, pass: process.env.CONTACT_APP_PASSWORD },
  });
}

/* ═══════════════════════════════════════════════════════════════
   COLOR EXTRACTION via sharp
   Reads dominant RGB from each uploaded logo.
   Returns palette: { primary, accent, light, dark }
═══════════════════════════════════════════════════════════════ */
async function extractPalette(logoPaths) {
  const colors = [];
  for (const lp of logoPaths.filter(p => p && fs.existsSync(p))) {
    try {
      const sharp = (await import("sharp")).default;
      const { dominant } = await sharp(lp).resize(80, 80, { fit: "cover" }).stats();
      const hex = "#" + [dominant.r, dominant.g, dominant.b]
        .map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
      // skip near-white and near-black (not useful for design)
      const lum = 0.299 * dominant.r + 0.587 * dominant.g + 0.114 * dominant.b;
      if (lum > 20 && lum < 235) colors.push({ hex, lum, ...dominant });
    } catch {}
  }

  // Sort by saturation (most colorful first)
  colors.sort((a, b) => {
    const satA = Math.max(a.r,a.g,a.b) - Math.min(a.r,a.g,a.b);
    const satB = Math.max(b.r,b.g,b.b) - Math.min(b.r,b.g,b.b);
    return satB - satA;
  });

  return {
    primary:    colors[0]?.hex || "#1a3a5c",
    secondary:  colors[1]?.hex || "#c9a84c",
    accent:     colors[2]?.hex || "#7c3aed",
    allColors:  colors.map(c => c.hex),
    hasColors:  colors.length > 0,
  };
}

/* ═══════════════════════════════════════════════════════════════
   AI LATEX GENERATOR
   Sends all certificate parameters to DeepSeek via OpenRouter.
   AI returns a complete, compilable XeLaTeX document.
   We validate it contains \begin{document} then compile.
═══════════════════════════════════════════════════════════════ */
async function generateLatexWithAI({
  recipientName,
  eventName,
  certType,         // "PARTICIPATION" | "EXCELLENCE" | etc.
  organiserLine,
  bodyText,
  eventDate,
  issuedBy,
  palette,          // { primary, secondary, accent, allColors }
  logoPaths,        // absolute paths on disk
  signatories,      // [{name, title, signatureImagePath?}]
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  // Build logo info for the prompt
  const logoInfo = logoPaths
    .filter(p => p && fs.existsSync(p))
    .map((p, i) => `Logo ${i+1}: ${p.replace(/\\/g, "/")} (use \\includegraphics)`)
    .join("\n");

  const sigInfo = signatories
    .filter(s => s.name)
    .map((s, i) => {
      const hasSig = s.signatureImagePath && fs.existsSync(s.signatureImagePath);
      return `Signatory ${i+1}: Name="${s.name}", Title="${s.title || ""}"${hasSig ? `, SignatureImage="${s.signatureImagePath.replace(/\\/g, "/")}"` : ""}`;
    }).join("\n");

  const colorDesc = palette.hasColors
    ? `Dominant colors extracted from logos: ${palette.allColors.slice(0,5).join(", ")}. Primary: ${palette.primary}, Secondary: ${palette.secondary}.`
    : "No logos provided — use a professional blue/gold color scheme.";

  const prompt = `You are a world-class LaTeX certificate designer. Generate a COMPLETE, immediately compilable XeLaTeX certificate document.

CERTIFICATE DETAILS:
- Recipient Name: ${recipientName}
- Event Name: ${eventName}
- Certificate Type: CERTIFICATE OF ${certType}
- Organiser Line: ${organiserLine || "none"}
- Body Text: ${bodyText}
- Event Date: ${eventDate || ""}
- Issued By: ${issuedBy || ""}

COLORS FROM LOGOS (use these for the design):
${colorDesc}

LOGOS TO INCLUDE:
${logoInfo || "No logos provided"}

SIGNATORIES:
${sigInfo || "No signatories"}

MANDATORY DOCUMENT SETUP (you MUST use this exact documentclass and geometry):
\\documentclass[a4paper,landscape]{article}
\\usepackage[landscape,paperwidth=297mm,paperheight=210mm,margin=0pt]{geometry}

DESIGN REQUIREMENTS:
1. Use XeLaTeX with fontspec, tikz, xcolor, graphicx, pgfornament, geometry
2. MUST be LANDSCAPE orientation (297mm wide × 210mm tall) — this is NON-NEGOTIABLE
3. Use Times New Roman or TeX Gyre Pagella as main font
4. Make it visually STUNNING — use the logo colors creatively for decorations
5. Diagonal corner decorations, ornamental borders, or geometric patterns
6. If logos exist: place them in a horizontal strip at the top
7. If signature images exist: include them above the signatory lines using \\includegraphics
8. The recipient name must be prominent and centered
9. Use \\addfontfeature{LetterSpace=X} for letter-spacing on headings
10. Make it look like a REAL professional certificate issued by a top university
11. Background should be WHITE or very light cream — logos must not clash
12. Use pgfornament corners if it fits the style
13. Be creative — each certificate should look unique and beautiful
14. Do NOT use placeholder comments like "% add logo here" — actually include the \\includegraphics commands with the real paths provided

CRITICAL RULES:
- Output ONLY the raw LaTeX code, nothing else
- No markdown, no explanation, no \`\`\` fences
- Must start with \\documentclass[a4paper,landscape]
- MUST be LANDSCAPE — do NOT use portrait orientation
- Must be 100% compilable with xelatex on the first try
- Escape special chars: & → \\&, % → \\%, $ → \\$, # → \\#, _ → \\_
- All \\includegraphics paths must use forward slashes
- Do not use packages that aren't standard in TeX Live / MiKTeX

Generate the complete .tex file now:`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model:    "deepseek/deepseek-chat",
      messages: [
        {
          role:    "system",
          content: "You are an expert LaTeX typographer. You output only valid, complete, immediately compilable XeLaTeX code. No markdown. No explanation. Just the raw .tex file starting with \\documentclass.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens:  4000,
    },
    {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://mathcollective.bmsit.in",
      },
      timeout: 90000,
    }
  );

  let latex = response.data?.choices?.[0]?.message?.content || "";

  // Strip any markdown fences if AI added them despite instructions
  latex = latex
    .replace(/^```(?:latex|tex)?\s*/i, "")
    .replace(/\s*```\s*$/,             "")
    .trim();

  // Validate it looks like a LaTeX document
  if (!latex.includes("\\documentclass") || !latex.includes("\\begin{document}")) {
    throw new Error("AI did not return valid LaTeX. Response: " + latex.slice(0, 200));
  }

  // FORCE landscape orientation — even if AI ignored the instruction
  // Replace portrait documentclass with landscape
  latex = latex.replace(
    /\\documentclass\[?\s*a4paper\s*\]?\{article\}/,
    "\\documentclass[a4paper,landscape]{article}"
  );
  // Ensure geometry package has landscape
  if (latex.includes("\\usepackage") && latex.includes("geometry")) {
    if (!latex.includes("landscape") || !latex.includes("paperwidth=297mm")) {
      latex = latex.replace(
        /\\usepackage\[([^\]]*)\]\{geometry\}/,
        "\\usepackage[landscape,paperwidth=297mm,paperheight=210mm,margin=0pt]{geometry}"
      );
    }
  } else if (!latex.includes("geometry")) {
    // Add geometry package if missing
    latex = latex.replace(
      "\\begin{document}",
      "\\usepackage[landscape,paperwidth=297mm,paperheight=210mm,margin=0pt]{geometry}\n\\begin{document}"
    );
  }

  return latex;
}

/* ═══════════════════════════════════════════════════════════════
   FALLBACK LATEX TEMPLATE
   Used if AI fails. Still looks great — BMSIT classic style.
═══════════════════════════════════════════════════════════════ */
function fallbackLatex({
  recipientName, eventName, certType, organiserLine,
  bodyText, eventDate, issuedBy, palette, logoPaths, signatories,
}) {
  function le(s) {
    if (!s) return "";
    return String(s)
      .replace(/\\/g,"\\textbackslash{}")
      .replace(/&/g,"\\&").replace(/%/g,"\\%")
      .replace(/\$/g,"\\$").replace(/#/g,"\\#")
      .replace(/_/g,"\\_").replace(/~/g,"\\textasciitilde{}");
  }

  const pc = (palette.primary || "#1a3a5c").replace("#","");
  const ac = (palette.secondary || "#c9a84c").replace("#","");

  const validLogos = logoPaths.filter(p => p && fs.existsSync(p));
  let logoTex = "";
  if (validLogos.length > 0) {
    const spacing = 20 / (validLogos.length + 1);
    logoTex = validLogos.map((lp, i) =>
      `    \\node at (${((i+1)*spacing).toFixed(1)}cm, 0) {\\includegraphics[height=1.1cm,keepaspectratio]{${lp.replace(/\\/g,"/")}};`
    ).join("\n");
  }

  const sigs = signatories.filter(s=>s.name).slice(0,3);
  const sigPositions = sigs.length===1?[10.5]:sigs.length===2?[5.5,15.5]:[3.5,10.5,17.5];
  const sigTex = sigs.map((s,i) => {
    const hasSigImg = s.signatureImagePath && fs.existsSync(s.signatureImagePath);
    return `
  ${hasSigImg ? `\\node[anchor=south] at (${sigPositions[i]}cm,1.35cm){\\includegraphics[width=2cm,height=0.85cm,keepaspectratio]{${s.signatureImagePath.replace(/\\/g,"/")}};` : ""}
  \\draw[line width=0.5pt,color=black!35](${sigPositions[i]-1.6}cm,0.85cm)--(${sigPositions[i]+1.6}cm,0.85cm);
  \\node[font=\\fontsize{9}{11}\\selectfont\\bfseries,color=primary,anchor=north] at (${sigPositions[i]}cm,0.78cm){${le(s.name)}};
  \\node[font=\\fontsize{7.5}{9}\\selectfont,color=black!55,text width=3.8cm,align=center,anchor=north] at (${sigPositions[i]}cm,0.36cm){${le(s.title||"")}};`;
  }).join("\n");

  const hasLogos = validLogos.length > 0;
  const nameY    = hasLogos ? "7.4" : "6.2";
  const bodyY    = hasLogos ? "9.0" : "7.8";

  return `\\documentclass[a4paper,landscape]{article}
\\usepackage[margin=0pt,paperwidth=297mm,paperheight=210mm]{geometry}
\\usepackage{tikz}\\usepackage{xcolor}\\usepackage{fontspec}
\\usepackage{graphicx}\\usepackage{pgfornament}\\usepackage{microtype}
\\usetikzlibrary{calc}
\\setmainfont{Times New Roman}
\\setsansfont{Arial}[BoldFont=Arial Bold]
\\definecolor{primary}{HTML}{${pc}}
\\definecolor{accent}{HTML}{${ac}}
\\begin{document}\\pagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[white](current page.south west)rectangle(current page.north east);
  \\fill[primary](current page.south west)--($(current page.south west)+(7.5cm,0)$)--($(current page.south west)+(0,5.5cm)$)--cycle;
  \\fill[accent](current page.south west)--($(current page.south west)+(4.8cm,0)$)--($(current page.south west)+(0,3.5cm)$)--cycle;
  \\fill[primary](current page.south east)--($(current page.south east)+(-7.5cm,0)$)--($(current page.south east)+(0,5.5cm)$)--cycle;
  \\fill[accent](current page.south east)--($(current page.south east)+(-4.8cm,0)$)--($(current page.south east)+(0,3.5cm)$)--cycle;
  \\fill[primary](current page.north west)rectangle($(current page.north east)+(0,-0.2cm)$);
  \\draw[line width=1.4pt,color=accent]($(current page.south west)+(0.55cm,0.55cm)$)rectangle($(current page.north east)+(-0.55cm,-0.55cm)$);
  \\node[color=accent] at ($(current page.north west)+(2cm,-2cm)$){\\pgfornament[width=2cm]{61}};
  \\node[color=accent] at ($(current page.north east)+(-2cm,-2cm)$){\\pgfornament[width=2cm,symmetry=v]{61}};
  \\begin{scope}[shift={($(current page.north west)+(0.5cm,-1.5cm)$)}]
${logoTex}
  \\end{scope}
  ${hasLogos ? `\\draw[line width=0.4pt,color=black!15]($(current page.north west)+(0.8cm,-2.1cm)$)--($(current page.north east)+(-0.8cm,-2.1cm)$);` : ""}
  ${issuedBy ? `\\node[font=\\fontsize{9}{11}\\selectfont\\bfseries\\sffamily,color=primary] at ($(current page.north)+(0,-${hasLogos?"2.45":"1.3"}cm)$){${le(issuedBy)}};` : ""}
  ${organiserLine ? `\\node[font=\\fontsize{10}{12}\\selectfont\\bfseries,color=black!65] at ($(current page.north)+(0,-${hasLogos?"2.95":"1.8"}cm)$){$\\longrightarrow$~${le(organiserLine)}~$\\longleftarrow$};` : ""}
  \\node[font=\\fontsize{36}{40}\\selectfont\\bfseries\\sffamily,color=primary] at ($(current page.north)+(0,-${hasLogos?"4.0":"2.8"}cm)$){\\addfontfeature{LetterSpace=3.0}${le(eventName)}};
  \\node[font=\\fontsize{19}{22}\\selectfont\\bfseries\\itshape,color=primary!80] at ($(current page.north)+(0,-${hasLogos?"5.1":"3.9"}cm)$){CERTIFICATE OF ${le(certType)}};
  \\node[font=\\fontsize{11}{13}\\selectfont\\bfseries\\sffamily,color=black!60] at ($(current page.north)+(0,-${hasLogos?"6.0":"4.8"}cm)$){THIS CERTIFICATE IS AWARDED TO};
  \\node[font=\\fontsize{28}{32}\\selectfont\\bfseries,color=primary,draw=black!30,line width=0.5pt,inner xsep=1.1cm,inner ysep=0.3cm] at ($(current page.north)+(0,-${nameY}cm)$){${le(recipientName)}};
  \\node[font=\\fontsize{9.5}{13}\\selectfont,color=black!70,text width=17cm,align=center] at ($(current page.north)+(0,-${bodyY}cm)$){${le(bodyText)}};
  \\begin{scope}[shift={($(current page.south west)+(0,1.6cm)$)}]
${sigTex}
  \\end{scope}
  \\node[font=\\fontsize{6}{7}\\selectfont,color=black!18,anchor=south east] at ($(current page.south east)+(-0.4cm,0.2cm)$){Certificate ID: MC-${Date.now().toString(36).toUpperCase()}};
\\end{tikzpicture}
\\end{document}`;
}

/* ═══════════════════════════════════════════════════════════════
   COMPILE LaTeX → PDF
═══════════════════════════════════════════════════════════════ */
async function compilePDF(latexSrc) {
  const jobId  = `cert_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const tmpDir = path.join(os.tmpdir(), jobId);
  fs.mkdirSync(tmpDir, { recursive: true });

  const texFile = path.join(tmpDir, "cert.tex");
  const pdfFile = path.join(tmpDir, "cert.pdf");

  try {
    fs.writeFileSync(texFile, latexSrc, "utf-8");
    const cmd = `xelatex -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir}" "${texFile}"`;

    try { execSync(cmd, { timeout: 120000, stdio: "pipe" }); } catch {}
    // Second pass for stable layout
    try { execSync(cmd, { timeout: 120000, stdio: "pipe" }); } catch {}

    if (!fs.existsSync(pdfFile)) {
      const log = fs.existsSync(path.join(tmpDir,"cert.log"))
        ? fs.readFileSync(path.join(tmpDir,"cert.log"),"utf-8")
            .split("\n").filter(l=>l.startsWith("!")||l.includes("Error")).slice(0,8).join("\n")
        : "No log";
      throw new Error("Compile failed:\n" + log);
    }

    return fs.readFileSync(pdfFile);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/* ═══════════════════════════════════════════════════════════════
   MASTER FUNCTION — ties everything together
   1. Extract colors from logos
   2. Call AI to generate LaTeX
   3. If AI fails → use fallback
   4. Compile with xelatex
   5. Return PDF buffer
═══════════════════════════════════════════════════════════════ */
async function buildCertificate(params) {
  const {
    recipientName, eventName, certType = "PARTICIPATION",
    organiserLine = "", bodyText = "", eventDate = "", issuedBy = "",
    logoPaths = [], signatories = [],
    useAI = true,
  } = params;

  // 1. Extract palette from logos
  const palette = await extractPalette(logoPaths);

  // 2. Build final body text
  const body = (bodyText ||
    `This is to certify that the individual participated in ${eventName}${eventDate ? ", held on " + eventDate : ""}, demonstrating dedication, problem-solving skills, and innovation.`)
    .replace(/\{name\}/gi, recipientName);

  const certParams = {
    recipientName, eventName, certType, organiserLine,
    bodyText: body, eventDate, issuedBy,
    palette, logoPaths, signatories,
  };

  // 3. Try AI generation, fall back if it fails
  let latex;
  if (useAI) {
    try {
      console.log(`[Cert] AI generating LaTeX for "${recipientName}"...`);
      latex = await generateLatexWithAI(certParams);
      console.log(`[Cert] AI LaTeX generated (${latex.length} chars)`);
    } catch (aiErr) {
      console.warn("[Cert] AI failed, using fallback:", aiErr.message);
      latex = fallbackLatex(certParams);
    }
  } else {
    latex = fallbackLatex(certParams);
  }

  // 4. Compile
  return compilePDF(latex);
}

/* ═══════════════════════════════════════════════════════════════
   UPLOAD ASSET
   POST /api/certificates/upload-asset
═══════════════════════════════════════════════════════════════ */
export const uploadAsset = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    return res.json({
      success:  true,
      url:      `/uploads/cert-assets/${req.file.filename}`,
      filename: req.file.filename,
    });
  } catch (err) {
    return res.status(500).json({ error: "Upload failed" });
  }
};

/* ═══════════════════════════════════════════════════════════════
   PREVIEW
   POST /api/certificates/preview
═══════════════════════════════════════════════════════════════ */
export const previewCertificate = async (req, res) => {
  try {
    const {
      eventName = "Sample Event", certType = "PARTICIPATION",
      organiserLine = "", bodyText = "", eventDate = "", issuedBy = "",
      logoFilenames = [], signatories = [],
    } = req.body;

    const tp = f => f ? path.join(ASSET_DIR, f) : null;
    const logoPaths = logoFilenames.filter(Boolean).map(tp).filter(p => p && fs.existsSync(p));
    const sigWithPaths = signatories.map(s => ({
      ...s,
      signatureImagePath: s.signatureFilename ? tp(s.signatureFilename) : null,
    }));

    const pdfBuf = await buildCertificate({
      recipientName: "Recipient Name",
      eventName, certType, organiserLine,
      bodyText, eventDate, issuedBy,
      logoPaths, signatories: sigWithPaths,
      useAI: true,
    });

    res.setHeader("Content-Type",        "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"preview.pdf\"");
    return res.send(pdfBuf);
  } catch (err) {
    console.error("[Preview]", err.message);
    return res.status(500).json({ error: err.message.slice(0, 300) });
  }
};

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
   DOWNLOAD SINGLE
═══════════════════════════════════════════════════════════════ */
export const downloadCertificate = async (req, res) => {
  try {
    const { data: cert, error } = await supabase.from("certificates")
      .select("*,certificate_batches(*)").eq("id",req.params.id).maybeSingle();
    if (error||!cert) return res.status(404).json({ error: "Not found" });
    const b = cert.certificate_batches;
    const pdfBuf = await buildCertificate({
      recipientName: cert.recipient_name,
      eventName:     cert.event_name,
      eventDate:     b.event_date  || "",
      issuedBy:      b.issued_by   || "",
      signatories:   b.signatory_name ? [{ name: b.signatory_name, title: b.signatory_title }] : [],
      useAI:         false, // use fast fallback for re-downloads
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
    const { data: batch } = await supabase.from("certificate_batches")
      .select("*").eq("id",req.params.batchId).maybeSingle();
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    const { data: certs } = await supabase.from("certificates").select("*").eq("batch_id",batch.id);
    const archiver = (await import("archiver")).default;
    res.setHeader("Content-Type","application/zip");
    res.setHeader("Content-Disposition",`attachment; filename="Certificates_${batch.event_name.replace(/\s+/g,"_")}.zip"`);
    const archive = archiver("zip",{ zlib:{ level:6 } });
    archive.pipe(res);
    for (const cert of (certs||[])) {
      const pdfBuf = await buildCertificate({
        recipientName: cert.recipient_name, eventName: cert.event_name,
        eventDate: batch.event_date||"", issuedBy: batch.issued_by||"",
        signatories: batch.signatory_name?[{name:batch.signatory_name,title:batch.signatory_title}]:[],
        useAI: false,
      });
      archive.append(pdfBuf,{ name:`${cert.recipient_name.replace(/\s+/g,"_")}.pdf` });
    }
    await archive.finalize();
  } catch (err) { console.error("[zip]",err.message); res.status(500).end(); }
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