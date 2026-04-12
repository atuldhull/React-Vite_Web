import path          from "path";
import fs            from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ASSET_DIR is two levels up: controllers/certificate/ → controllers/ → project root → public/uploads/cert-assets
export const ASSET_DIR = path.join(__dirname, "..", "..", "public", "uploads", "cert-assets");
fs.mkdirSync(ASSET_DIR, { recursive: true });

/* ═══════════════════════════════════════════════════════════════
   COLOR EXTRACTION via sharp
   Reads dominant RGB from each uploaded logo.
   Returns palette: { primary, accent, light, dark }
═══════════════════════════════════════════════════════════════ */
export async function extractPalette(logoPaths) {
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
    } catch { /* sharp not available or image unreadable — skip */ }
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
