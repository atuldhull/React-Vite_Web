/**
 * Core Team — anonymous chat.
 *
 * Every core member can post. Messages are ANONYMOUS to everyone:
 * the author is stored but never returned... except to the single
 * owner account (OWNER_EMAIL), who sees who sent each message. The
 * owner can also delete messages (light moderation).
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";

// The one account allowed to see real identities.
const OWNER_EMAIL = "24ug1byai146@bmsit.in";

function isOwner(req) {
  return (req.session?.user?.email || "").toLowerCase() === OWNER_EMAIL;
}

/* GET /api/core/chat — recent messages (author hidden unless owner) */
export const listChat = catchAsync(async (req, res) => {
  const owner = isOwner(req);
  const me = req.coreMember;

  const { data, error } = await supabase
    .from("core_chat")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) return res.status(500).json({ error: "Could not load chat." });

  // Oldest-first for display; strip the author for everyone but the owner.
  const messages = (data || []).reverse().map((m) => ({
    id:         m.id,
    body:       m.body,
    created_at: m.created_at,
    mine:       m.author_user_id === me.user_id,
    author:     owner ? (m.author_name || "Unknown") : null,
  }));

  return res.json({ isOwner: owner, messages });
});

/* POST /api/core/chat — post a message */
export const postChat = catchAsync(async (req, res) => {
  const me = req.coreMember;

  const { data, error } = await supabase
    .from("core_chat")
    .insert({ author_user_id: me.user_id, author_name: me.name, body: req.body.body })
    .select("id, body, created_at")
    .single();
  if (error) return res.status(500).json({ error: "Could not send message." });

  return res.status(201).json({
    success: true,
    message: { ...data, mine: true, author: isOwner(req) ? me.name : null },
  });
});

/* DELETE /api/core/chat/:id — owner-only moderation */
export const deleteChatMessage = catchAsync(async (req, res) => {
  if (!isOwner(req)) {
    return res.status(403).json({ error: "Only the chat owner can remove messages." });
  }
  await supabase.from("core_chat").delete().eq("id", req.params.id);
  return res.json({ success: true });
});
