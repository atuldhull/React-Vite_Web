import express from "express";
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from "../controllers/announcementController.js";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/",      requireAuth,    getAnnouncements);
router.post("/",     requireTeacher, createAnnouncement);
router.delete("/:id",requireTeacher, deleteAnnouncement);

export default router;
