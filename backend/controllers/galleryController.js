import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.join(__dirname, "..", "public", "images");

/* ══════════════════════════════════════════
   GET ALL GALLERY IMAGES
   GET /api/gallery
   Returns all images grouped by category (subfolder)
══════════════════════════════════════════ */
export const getGallery = async (req, res) => {
  try {
    if (!fs.existsSync(IMAGES_DIR)) {
      return res.json({ categories: [] });
    }

    const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

    // Each subfolder = one category
    const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
    const categories = [];

    // Also pick up loose images in /public/images/ root
    const rootImages = entries
      .filter(e => e.isFile() && IMAGE_EXTS.includes(path.extname(e.name).toLowerCase()))
      .map(e => `/images/${e.name}`);

    if (rootImages.length) {
      categories.push({ name: "General", slug: "general", images: rootImages });
    }

    // Subfolders
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(IMAGES_DIR, entry.name);
      const files = fs.readdirSync(folderPath)
        .filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
        .sort((a, b) => {
          // Sort numerically if filenames have numbers
          const na = parseInt(a.match(/\d+/)?.[0] || "0");
          const nb = parseInt(b.match(/\d+/)?.[0] || "0");
          return na - nb;
        })
        .map(f => `/images/${entry.name}/${f}`);

      if (files.length) {
        // Pretty-print the folder name
        const name = entry.name
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase());
        categories.push({ name, slug: entry.name, images: files });
      }
    }

    return res.json({ categories });
  } catch (err) {
    console.error("[Gallery]", err.message);
    return res.status(500).json({ error: "Failed to load gallery" });
  }
};

/* ══════════════════════════════════════════
   UPLOAD IMAGE (admin/teacher only)
   POST /api/gallery/upload
   Multipart: field "image", query "category"
══════════════════════════════════════════ */
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const category = (req.query.category || "general")
      .toLowerCase().replace(/[^a-z0-9-_]/g, "");

    const destDir = path.join(IMAGES_DIR, category);
    fs.mkdirSync(destDir, { recursive: true });

    const destPath = path.join(destDir, req.file.filename);
    fs.renameSync(req.file.path, destPath);

    return res.json({
      success: true,
      url:     `/images/${category}/${req.file.filename}`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ══════════════════════════════════════════
   DELETE IMAGE (admin only)
   DELETE /api/gallery
   Body: { imagePath: "/images/category/file.jpg" }
══════════════════════════════════════════ */
export const deleteImage = async (req, res) => {
  try {
    const { imagePath } = req.body;
    if (!imagePath) return res.status(400).json({ error: "imagePath required" });

    // Security: only allow paths inside /public/images/
    const resolved = path.resolve(path.join(__dirname, "..", "public", imagePath));
    const allowed  = path.resolve(IMAGES_DIR);
    if (!resolved.startsWith(allowed)) {
      return res.status(403).json({ error: "Invalid path" });
    }

    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ══════════════════════════════════════════
   CREATE CATEGORY (admin only)
   POST /api/gallery/category
   Body: { name: "my-event" }
══════════════════════════════════════════ */
export const createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    fs.mkdirSync(path.join(IMAGES_DIR, slug), { recursive: true });
    return res.json({ success: true, slug });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};