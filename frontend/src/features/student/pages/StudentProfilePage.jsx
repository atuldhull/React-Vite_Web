/**
 * StudentProfilePage — View another student's profile.
 * Route: /student/:userId
 *
 * Shows: avatar, name, title, XP, stats
 * Actions: Add Friend, Message (if friends), Block
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import MonumentHero from "@/components/monument/MonumentHero";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { useAuthStore } from "@/store/auth-store";
import { chat, user as userApi } from "@/lib/api";
import { encryptMessage, decryptMessage, getPublicKey } from "@/lib/crypto";
import http from "@/lib/http";

export default function StudentProfilePage() {
  useMonument("sky");
  const { userId } = useParams();
  const me = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState(null); // null | 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'blocked'
  const [actionLoading, setActionLoading] = useState(false);

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [peerKey, setPeerKey] = useState(null);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);

  // Fetch profile + friendship status
  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    Promise.all([
      http.get(`/user/student/${userId}`).catch(() => ({ data: null })),
      chat.getFriends().catch(() => ({ data: [] })),
      chat.getPending().catch(() => ({ data: [] })),
    ]).then(([profileRes, friendsRes, pendingRes]) => {
      setProfile(profileRes.data || { user_id: userId, name: "Student", xp: 0 });

      // Check friendship
      const friends = friendsRes.data || [];
      const pending = pendingRes.data || [];

      if (friends.some((f) => f.user_id === userId)) {
        setFriendStatus("friends");
      } else if (pending.some((p) => p.requester_id === userId)) {
        setFriendStatus("pending_received");
      } else {
        // Check if we sent them a request
        setFriendStatus("none");
      }

      setLoading(false);
    });
  }, [userId]);

  // Socket.IO for real-time chat
  useEffect(() => {
    if (!me?.id || !showChat) return;

    getPublicKey().then((pk) => chat.registerKey(pk).catch(() => {}));

    const socket = io(window.location.origin, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("register_user", me.id));

    socket.on("chat:receive", async (msg) => {
      if (msg.conversationId === conversation?.id) {
        try {
          const { data: sk } = await chat.getKey(msg.senderId);
          const content = await decryptMessage(msg.encryptedContent, msg.iv, sk.publicKey);
          setMessages((prev) => [...prev, { ...msg, content, decrypted: true }]);
        } catch {
          setMessages((prev) => [...prev, { ...msg, content: "[Encrypted]", decrypted: false }]);
        }
      }
    });

    return () => { socket.disconnect(); socketRef.current = null; };
  }, [me?.id, showChat, conversation?.id]);

  // Open chat
  const openChat = async () => {
    if (friendStatus !== "friends") return;
    setShowChat(true);

    try {
      const { data: conv } = await chat.getOrCreateConversation(userId);
      setConversation(conv);

      // Get peer key
      const { data: keyData } = await chat.getKey(userId);
      setPeerKey(keyData.publicKey);

      // Load messages
      const { data: msgs } = await chat.getMessages(conv.id);
      const decrypted = await Promise.all(
        (msgs || []).reverse().map(async (m) => {
          try {
            const sendKeyId = m.sender_id === me.id ? userId : m.sender_id;
            const { data: sk } = await chat.getKey(sendKeyId);
            const content = await decryptMessage(m.encrypted_content, m.iv, sk.publicKey);
            return { ...m, content, decrypted: true };
          } catch {
            return { ...m, content: "[Cannot decrypt]", decrypted: false };
          }
        })
      );
      setMessages(decrypted);
      chat.markAsRead(conv.id).catch(() => {});

      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
    } catch (err) {
      alert(err.response?.data?.error || "Cannot open chat");
      setShowChat(false);
    }
  };

  // Send message
  const handleSend = async () => {
    if (!chatInput.trim() || !conversation || !peerKey || sending) return;
    setSending(true);
    const text = chatInput.trim();
    setChatInput("");

    try {
      const { encrypted, iv } = await encryptMessage(text, peerKey);
      await chat.sendMessage(conversation.id, encrypted, iv, "text");
      socketRef.current?.emit("chat:send", {
        conversationId: conversation.id,
        recipientId: userId,
        encryptedContent: encrypted,
        iv,
        messageType: "text",
      });
      setMessages((prev) => [...prev, { sender_id: me.id, content: text, decrypted: true, created_at: new Date().toISOString() }]);
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50);
    } catch {
      setChatInput(text);
    }
    setSending(false);
  };

  // Friend actions
  const sendFriendRequest = async () => {
    setActionLoading(true);
    try {
      await chat.sendRequest(userId);
      setFriendStatus("pending_sent");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to send request");
    }
    setActionLoading(false);
  };

  const acceptRequest = async () => {
    setActionLoading(true);
    try {
      // Find the pending request ID
      const { data: pending } = await chat.getPending();
      const req = (pending || []).find((p) => p.requester_id === userId);
      if (req) {
        await chat.respondRequest(req.id, true);
        setFriendStatus("friends");
      }
    } catch (err) {
      alert(err.response?.data?.error || "Failed");
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.15} />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader variant="orbit" size="lg" label="Loading profile..." />
        </div>
      </div>
    );
  }

  const isMe = me?.id === userId;

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="sky" intensity={0.15} />
      <div className="relative z-10 space-y-8 pb-16">
        <MonumentHero monument="sky" title={profile?.name || "Student"} subtitle="Student Profile" />

        <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
          {/* Profile Card */}
          <div className="space-y-6">
            <Card variant="glass">
              <div className="flex items-center gap-5">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full text-3xl"
                  style={{
                    background: profile?.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)",
                    border: "2px solid var(--monument-sky)",
                    boxShadow: "0 0 20px rgba(182,149,248,0.3)",
                  }}
                >
                  {profile?.avatar_emoji || profile?.name?.charAt(0) || "?"}
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {profile?.name || "Student"}
                  </h2>
                  <p className="text-sm text-text-muted">{profile?.title || "Student"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="math-text inline-block rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold text-primary">
                      {(profile?.xp || 0).toLocaleString()} XP
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {!isMe && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {friendStatus === "none" && (
                    <Button onClick={sendFriendRequest} loading={actionLoading}>
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        Add Friend
                      </span>
                    </Button>
                  )}
                  {friendStatus === "pending_sent" && (
                    <Button variant="ghost" disabled>Request Sent ✓</Button>
                  )}
                  {friendStatus === "pending_received" && (
                    <Button onClick={acceptRequest} loading={actionLoading}>Accept Friend Request</Button>
                  )}
                  {friendStatus === "friends" && (
                    <>
                      <Button variant="ghost" disabled>
                        <span className="flex items-center gap-1.5">✓ Friends</span>
                      </Button>
                      <Button variant="secondary" onClick={openChat}>
                        <span className="flex items-center gap-2">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          Send Message
                        </span>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </Card>

            {/* Chat Section — only visible when opened and friends */}
            <AnimatePresence>
              {showChat && friendStatus === "friends" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Card variant="solid">
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                        Chat with {profile?.name?.split(" ")[0]}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] text-text-dim">🔒 E2EE</span>
                        <button onClick={() => setShowChat(false)} className="text-text-dim hover:text-white">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                      {messages.length === 0 && (
                        <p className="py-8 text-center text-xs text-text-dim">No messages yet. Say hello!</p>
                      )}
                      {messages.map((msg, i) => {
                        const isMine = msg.sender_id === me?.id;
                        return (
                          <div key={msg.id || i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] px-3 py-2 text-[13px] leading-relaxed ${
                              isMine
                                ? "rounded-2xl rounded-br-sm bg-primary/20 text-white"
                                : "rounded-2xl rounded-bl-sm bg-white/[0.05] text-text-muted"
                            }`}>
                              {msg.content}
                              <span className="mt-0.5 block text-right text-[9px] text-text-dim">
                                {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Input */}
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                        placeholder="Type a message..."
                        className="flex-1 rounded-xl border border-line/15 bg-black/15 px-3 py-2 text-sm text-white outline-none focus:border-primary/30"
                      />
                      <Button size="sm" onClick={handleSend} loading={sending} disabled={!chatInput.trim()}>
                        Send
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card variant="glass">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">Stats</p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="math-text text-2xl font-bold text-white">{(profile?.xp || 0).toLocaleString()}</p>
                  <p className="font-mono text-[10px] text-text-dim">XP</p>
                </div>
                <div>
                  <p className="math-text text-2xl font-bold text-white">{profile?.title || "Novice"}</p>
                  <p className="font-mono text-[10px] text-text-dim">Rank</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
