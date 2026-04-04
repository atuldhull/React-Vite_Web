import express from "express";
import {
  getTeacherProfile,
  getTeacherStats,
  getStudents,
  getChallengePerformance,
  getRecentActivity,
  teacherGenerateQuestion,
  teacherSaveQuestion,
  getTeacherChallenges,
  toggleTeacherChallenge,
  getTeacherLeaderboard,
} from "../controllers/teacherController.js";
import { requireTeacher } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(requireTeacher);  // all teacher routes require teacher or admin role

router.get("/profile",              getTeacherProfile);
router.get("/stats",                getTeacherStats);
router.get("/students",             getStudents);
router.get("/performance",          getChallengePerformance);
router.get("/activity",             getRecentActivity);
router.get("/generate",             teacherGenerateQuestion);
router.post("/save-question",       teacherSaveQuestion);
router.get("/challenges",           getTeacherChallenges);
router.patch("/challenges/:id/toggle", toggleTeacherChallenge);
router.get("/leaderboard",          getTeacherLeaderboard);

export default router;
