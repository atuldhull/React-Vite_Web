import express from "express";
import {
  getNotifications, markRead, markAllRead,
  clearAll, broadcastNotification,
} from "../controllers/notificationController.js";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/",              requireAuth,    getNotifications);
router.patch("/:id/read",   requireAuth,    markRead);
router.patch("/read-all",   requireAuth,    markAllRead);
router.delete("/clear",     requireAuth,    clearAll);
router.post("/broadcast",   requireTeacher, broadcastNotification);

export default router;
