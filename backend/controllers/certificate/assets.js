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
  } catch {
    return res.status(500).json({ error: "Upload failed" });
  }
};
