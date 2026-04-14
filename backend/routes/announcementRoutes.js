import express from "express";
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from "../controllers/announcementController.js";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";
import { validateBody } from "../validators/common.js";
import { createAnnouncementSchema } from "../validators/announcements.js";

const router = express.Router();
router.get("/",      requireAuth,    getAnnouncements);
router.post("/",     requireTeacher, validateBody(createAnnouncementSchema), createAnnouncement);
router.delete("/:id",requireTeacher, deleteAnnouncement);

export default router;
