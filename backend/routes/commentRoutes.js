import express from "express";
import supabase from "../config/supabase.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { sendNotification } from "../controllers/notificationController.js";
import axios from "axios";

const router = express.Router();

/* ── GET comments for a challenge ── */
router.get("/:challengeId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("challenge_comments")
      .select("*")
      .eq("challenge_id", req.params.challengeId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      // Table might not exist — return empty
      if (error.code === "42P01") return res.json([]);
      throw error;
    }
    return res.json(data || []);
  } catch (err) {
    console.error("[Comments]", err.message);
    return res.json([]); // graceful fallback
  }
});

/* ── POST a comment ── */
router.post("/:challengeId", requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: "Content required" });

    const { data, error } = await supabase
      .from("challenge_comments")
      .insert({
        challenge_id: req.params.challengeId,
        user_id: req.userId,
        user_name: req.session.user.name || "User",
        content: content.trim().slice(0, 1000),
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist, create it
      if (error.code === "42P01") {
        await supabase.rpc("exec_sql", {
          sql: `CREATE TABLE IF NOT EXISTS challenge_comments (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            challenge_id uuid NOT NULL,
            user_id uuid NOT NULL,
            user_name text DEFAULT 'User',
            content text NOT NULL,
            is_ai boolean DEFAULT false,
            created_at timestamptz DEFAULT now()
          )`,
        }).catch(() => {});
        // Retry insert
        const { data: d2 } = await supabase
          .from("challenge_comments")
          .insert({ challenge_id: req.params.challengeId, user_id: req.userId, user_name: req.session.user.name || "User", content: content.trim().slice(0, 1000) })
          .select().single();
        return res.json({ success: true, comment: d2 });
      }
      throw error;
    }

    // Notify all teachers about the student's doubt
    const studentName = req.session.user.name || "A student";
    const { data: teachers } = await supabase
      .from("students")
      .select("user_id")
      .in("role", ["teacher", "admin", "super_admin"]);
    if (teachers && teachers.length > 0) {
      await sendNotification({
        userIds: teachers.map(t => t.user_id),
        title: "New Student Doubt",
        body: `${studentName} asked: "${content.trim().slice(0, 80)}${content.length > 80 ? "..." : ""}"`,
        type: "info",
        link: `/arena`,
      });
    }

    return res.json({ success: true, comment: data });
  } catch (err) {
    console.error("[Comments]", err.message);
    return res.status(500).json({ error: "Failed to post comment" });
  }
});

/* ── POST ask AI about a challenge ── */
router.post("/:challengeId/ask-ai", requireAuth, async (req, res) => {
  try {
    const { question, challengeTitle } = req.body;
    if (!question) return res.status(400).json({ error: "Question required" });

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are a math tutor helping with the challenge "${challengeTitle || "a math problem"}". Be Socratic — guide with hints, don't give the direct answer. Keep it short (under 200 words). Use plain text, no LaTeX.`,
          },
          { role: "user", content: question },
        ],
        temperature: 0.7,
        max_tokens: 400,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content || "AI couldn't respond. Try again.";

    // Save AI reply as a comment
    await supabase.from("challenge_comments").insert({
      challenge_id: req.params.challengeId,
      user_id: req.userId,
      user_name: "PANDA AI 🐼",
      content: reply,
      is_ai: true,
    }).catch(() => {});

    return res.json({ reply });
  } catch (err) {
    console.error("[AI Comment]", err.message);
    return res.status(500).json({ error: "AI is unavailable right now" });
  }
});

export default router;
