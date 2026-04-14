/**
 * Messaging Controller — E2EE Chat System
 *
 * All message content is encrypted client-side. The server:
 *   - Stores encrypted blobs (cannot read messages)
 *   - Manages conversations, friendships, keys
 *   - Handles metadata (read receipts, timestamps)
 */

import { createClient } from "@supabase/supabase-js";
import { sendNotification } from "./notificationController.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Helper: order two user IDs consistently for conversation dedup
function orderIds(a, b) {
  return a < b ? [a, b] : [b, a];
}

// ═══════════════════════════════════════════════════════════
// PUBLIC KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════

/** Register/update user's E2EE public key */
export async function registerPublicKey(req, res) {
  try {
    const userId = req.session.user.id;
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ error: "publicKey required" });

    await supabase.from("user_public_keys").upsert({
      user_id: userId,
      public_key: JSON.stringify(publicKey),
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Get a user's public key (needed to encrypt messages to them) */
export async function getPublicKey(req, res) {
  try {
    const { userId } = req.params;
    const { data } = await supabase
      .from("user_public_keys")
      .select("public_key")
      .eq("user_id", userId)
      .single();

    if (!data) return res.status(404).json({ error: "User has no public key" });
    res.json({ publicKey: JSON.parse(data.public_key) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// FRIENDSHIPS
// ═══════════════════════════════════════════════════════════

/** Send friend request */
export async function sendFriendRequest(req, res) {
  try {
    const requesterId = req.session.user.id;
    const { recipientId } = req.body;
    if (!recipientId) return res.status(400).json({ error: "recipientId required" });
    if (requesterId === recipientId) return res.status(400).json({ error: "Cannot friend yourself" });

    // Check if blocked
    const { data: blocked } = await supabase
      .from("user_blocks")
      .select("blocker_id")
      .or(`blocker_id.eq.${requesterId},blocker_id.eq.${recipientId}`)
      .or(`blocked_id.eq.${requesterId},blocked_id.eq.${recipientId}`)
      .limit(1);
    if (blocked && blocked.length > 0) return res.status(403).json({ error: "Blocked" });

    // Check existing
    const { data: existing } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${requesterId},requester_id.eq.${recipientId}`)
      .or(`recipient_id.eq.${requesterId},recipient_id.eq.${recipientId}`)
      .limit(1);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: "Request already exists", status: existing[0].status });
    }

    const { data, error } = await supabase.from("friendships").insert({
      requester_id: requesterId,
      recipient_id: recipientId,
      status: "pending",
    }).select().single();

    if (error) throw error;

    // Get requester name for notification
    const { data: requester } = await req.db
      .from("students").select("name").eq("user_id", requesterId).maybeSingle();
    const requesterName = requester?.name || "Someone";

    // Send notification to recipient
    await sendNotification({
      userIds: [recipientId],
      title: "New Friend Request",
      body: `${requesterName} sent you a friend request`,
      type: "info",
      link: "/notifications",
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Accept/reject friend request */
export async function respondFriendRequest(req, res) {
  try {
    const userId = req.session.user.id;
    const { requestId, accept } = req.body;

    const { data: request } = await supabase
      .from("friendships")
      .select("*")
      .eq("id", requestId)
      .eq("recipient_id", userId)
      .eq("status", "pending")
      .single();

    if (!request) return res.status(404).json({ error: "Request not found" });

    if (accept) {
      await supabase.from("friendships").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", requestId);

      // Get acceptor name for notification
      const { data: acceptor } = await req.db
        .from("students").select("name").eq("user_id", userId).maybeSingle();
      const acceptorName = acceptor?.name || "Someone";

      // Notify the requester that their request was accepted
      await sendNotification({
        userIds: [request.requester_id],
        title: "Friend Request Accepted",
        body: `${acceptorName} accepted your friend request`,
        type: "success",
        link: `/student/${userId}`,
      });

      res.json({ status: "accepted" });
    } else {
      await supabase.from("friendships").delete().eq("id", requestId);
      res.json({ status: "rejected" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Get friends list */
export async function getFriends(req, res) {
  try {
    const userId = req.session.user.id;

    const { data } = await supabase
      .from("friendships")
      .select("*")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    // Get friend user IDs
    const friendIds = (data || []).map((f) =>
      f.requester_id === userId ? f.recipient_id : f.requester_id,
    );

    if (friendIds.length === 0) return res.json([]);

    // Get friend profiles
    const { data: profiles } = await req.db
      .from("students")
      .select("user_id, name, email, xp, title, avatar_emoji, avatar_color")
      .in("user_id", friendIds);

    res.json(profiles || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Get pending friend requests (received) */
export async function getPendingRequests(req, res) {
  try {
    const userId = req.session.user.id;

    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, created_at")
      .eq("recipient_id", userId)
      .eq("status", "pending");

    if (!data || data.length === 0) return res.json([]);

    const requesterIds = data.map((r) => r.requester_id);
    const { data: profiles } = await req.db
      .from("students")
      .select("user_id, name, email, avatar_emoji, avatar_color")
      .in("user_id", requesterIds);

    const result = data.map((r) => ({
      ...r,
      requester: profiles?.find((p) => p.user_id === r.requester_id) || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// CONVERSATIONS
// ═══════════════════════════════════════════════════════════

/** Get or create a conversation between two users */
export async function getOrCreateConversation(req, res) {
  try {
    const userId = req.session.user.id;
    const { otherUserId } = req.body;
    if (!otherUserId) return res.status(400).json({ error: "otherUserId required" });

    const [a, b] = orderIds(userId, otherUserId);

    // Check existing
    let { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .single();

    if (!conv) {
      // Check friendship/messaging permission
      const { data: settings } = await supabase
        .from("chat_settings")
        .select("allow_messages_from")
        .eq("user_id", otherUserId)
        .single();

      const permission = settings?.allow_messages_from || "friends";
      if (permission === "nobody") return res.status(403).json({ error: "User has disabled messaging" });

      if (permission === "friends") {
        const { data: friendship } = await supabase
          .from("friendships")
          .select("status")
          .eq("status", "accepted")
          .or(`requester_id.eq.${userId},requester_id.eq.${otherUserId}`)
          .or(`recipient_id.eq.${userId},recipient_id.eq.${otherUserId}`)
          .limit(1);
        if (!friendship || friendship.length === 0) {
          return res.status(403).json({ error: "Must be friends to message this user" });
        }
      }

      // Create conversation
      const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({ participant_a: a, participant_b: b })
        .select()
        .single();
      if (error) throw error;
      conv = newConv;
    }

    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Get all conversations for current user */
export async function getConversations(req, res) {
  try {
    const userId = req.session.user.id;

    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .order("last_message_at", { ascending: false });

    if (!convs || convs.length === 0) return res.json([]);

    // Get other participants' profiles
    const otherIds = convs.map((c) =>
      c.participant_a === userId ? c.participant_b : c.participant_a,
    );

    const { data: profiles } = await req.db
      .from("students")
      .select("user_id, name, email, avatar_emoji, avatar_color, title")
      .in("user_id", otherIds);

    // Get unread counts per conversation
    const { data: unreads } = await supabase
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", convs.map((c) => c.id))
      .neq("sender_id", userId)
      .eq("is_read", false);

    const unreadMap = {};
    (unreads || []).forEach((m) => {
      unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
    });

    const result = convs.map((c) => {
      const otherId = c.participant_a === userId ? c.participant_b : c.participant_a;
      return {
        ...c,
        otherUser: profiles?.find((p) => p.user_id === otherId) || null,
        unreadCount: unreadMap[c.id] || 0,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

/** Send an encrypted message */
export async function sendMessage(req, res) {
  try {
    const senderId = req.session.user.id;
    const { conversationId, encryptedContent, iv, messageType } = req.body;

    if (!conversationId || !encryptedContent || !iv) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verify sender is part of conversation
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (!conv || (conv.participant_a !== senderId && conv.participant_b !== senderId)) {
      return res.status(403).json({ error: "Not in this conversation" });
    }

    // Insert message
    const { data: msg, error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
      encrypted_content: encryptedContent,
      iv: iv,
      message_type: messageType || "text",
    }).select().single();

    if (error) throw error;

    // Update conversation last_message_at
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Get messages for a conversation (paginated) */
export async function getMessages(req, res) {
  try {
    const userId = req.session.user.id;
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    // Verify user is part of conversation
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (!conv || (conv.participant_a !== userId && conv.participant_b !== userId)) {
      return res.status(403).json({ error: "Not in this conversation" });
    }

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    res.json(messages || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Mark messages as read */
export async function markAsRead(req, res) {
  try {
    const userId = req.session.user.id;
    const { conversationId } = req.body;

    await supabase
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .eq("is_read", false);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// USER SEARCH / DISCOVERY
// ═══════════════════════════════════════════════════════════

/** Search students by name or email */
export async function searchUsers(req, res) {
  try {
    const userId = req.session.user.id;
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const { data } = await req.db
      .from("students")
      .select("user_id, name, email, xp, title, avatar_emoji, avatar_color")
      .neq("user_id", userId)
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(20);

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// BLOCK / REPORT
// ═══════════════════════════════════════════════════════════

/** Block a user */
export async function blockUser(req, res) {
  try {
    const blockerId = req.session.user.id;
    const { blockedId } = req.body;

    await supabase.from("user_blocks").upsert({ blocker_id: blockerId, blocked_id: blockedId });
    // Also remove any friendship
    await supabase.from("friendships").delete()
      .or(`requester_id.eq.${blockerId},requester_id.eq.${blockedId}`)
      .or(`recipient_id.eq.${blockerId},recipient_id.eq.${blockedId}`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Report a message */
export async function reportMessage(req, res) {
  try {
    const reporterId = req.session.user.id;
    const { messageId, reason } = req.body;

    await supabase.from("message_reports").insert({
      reporter_id: reporterId,
      message_id: messageId,
      reason: reason || "inappropriate",
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Get chat + profile privacy settings for the current user */
export async function getChatSettings(req, res) {
  try {
    const userId = req.session.user.id;
    const { data } = await supabase
      .from("chat_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Defaults MUST match the DEFAULT values in the two migrations
    // that created these columns (08_messaging_friendships.sql for
    // the chat-era fields, 20_profile_visibility.sql for the
    // profile-era fields). When a user has never opened the
    // settings dialog there's no row yet, so we return the same
    // shape the UI would get from a real row.
    res.json(data || {
      // from migration 08
      allow_messages_from: "friends",
      show_online_status: true,
      show_read_receipts: true,
      show_last_seen:     true,
      // from migration 20 (Phase 15 — profile privacy)
      profile_visibility: "public",
      show_activity_feed: true,
      show_friend_list:   true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * Update chat + profile privacy settings for the current user.
 *
 * Allowlist — anything NOT in this set is silently dropped. Previously
 * this controller spread `req.body` last in the upsert payload, which
 * let a client override the `user_id` field and upsert into another
 * user's row (an IDOR). The allowlist eliminates that class of bug
 * by shape, not by order.
 *
 * Value validation (enum membership, boolean shape) lives in the Zod
 * schema on the route. This controller trusts its parsed body.
 */
export async function updateChatSettings(req, res) {
  try {
    const userId = req.session.user.id;

    const allowed = [
      // chat-era fields (migration 08)
      "allow_messages_from",
      "show_online_status",
      "show_read_receipts",
      "show_last_seen",
      // profile-era fields (migration 20 — Phase 15)
      "profile_visibility",
      "show_activity_feed",
      "show_friend_list",
    ];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await supabase.from("chat_settings").upsert({
      user_id: userId,
      ...updates,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
