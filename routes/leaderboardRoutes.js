import express from "express";
import {
  getLeaderboard,
  getAllTimeLeaderboard,
  getWinners,
  getWeekInfo,
} from "../controllers/leaderboardController.js";

const router = express.Router();

router.get("/",        getLeaderboard);         // weekly (default)
router.get("/alltime", getAllTimeLeaderboard);   // all-time rankings
router.get("/winners", getWinners);              // hall of fame
router.get("/week-info", getWeekInfo);           // countdown timer

export default router;
