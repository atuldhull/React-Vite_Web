import express from "express";
import multer  from "multer";
import path    from "path";
import fs      from "fs";
import { fileURLToPath } from "url";
import { getGallery, uploadImage, deleteImage, createCategory } from "../controllers/galleryController.js";
import { requireTeacher, requireAdmin } from "../middleware/authMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getTmpDir = () => {
  const tmpDir = path.join(__dirname, "..", "public", "images", "_tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getTmpDir()),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || ".jpg";
    const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits:     { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("Only images allowed"), ok);
  },
});

const router = express.Router();

router.get("/",                  getGallery);
router.post("/upload",           requireTeacher, upload.single("image"), uploadImage);
router.delete("/",               requireAdmin,   deleteImage);
router.post("/category",         requireAdmin,   createCategory);

export default router;