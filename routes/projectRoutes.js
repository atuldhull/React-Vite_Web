import express from "express";
import {
  getProjects, getCategories, getMyTeam,
  createTeam, submitProject, voteProject,
  approveProject, getPendingProjects, addCategory, deleteCategory,
} from "../controllers/projectController.js";
import { requireAuth, requireTeacher, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/",                     getProjects);
router.get("/categories",           getCategories);
router.get("/my-team",              requireAuth,    getMyTeam);
router.post("/teams",               requireAuth,    createTeam);
router.post("/",                    requireAuth,    submitProject);
router.post("/:id/vote",            requireAuth,    voteProject);
router.patch("/:id/approve",        requireTeacher, approveProject);
router.get("/pending",              requireTeacher, getPendingProjects);
router.post("/categories",          requireTeacher, addCategory);
router.delete("/categories/:id",    requireAdmin,   deleteCategory);

export default router;
