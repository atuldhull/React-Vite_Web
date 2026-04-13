import express from "express";
import {
  getNotifications, markRead, markAllRead,
  clearAll, broadcastNotification,
  subscribePush, unsubscribePush,
} from "../controllers/notificationController.js";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/",              requireAuth,    getNotifications);
router.patch("/:id/read",   requireAuth,    markRead);
router.patch("/read-all",   requireAuth,    markAllRead);
router.delete("/clear",     requireAuth,    clearAll);
router.post("/broadcast",   requireTeacher, broadcastNotification);

// Web Push subscription lifecycle. The browser-generated PushSubscription
// (endpoint + keys.auth + keys.p256dh) is POSTed here after the user grants
// notification permission; it's stored per-user and consulted whenever the
// server fires a notification via services/webPush.js.
router.post("/push-subscribe",    requireAuth, subscribePush);
router.post("/push-unsubscribe",  requireAuth, unsubscribePush);

export default router;
