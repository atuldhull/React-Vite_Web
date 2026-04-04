import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import MonumentHero from "@/components/monument/MonumentHero";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Loader from "@/components/ui/Loader";
import AvatarCreator from "@/components/ui/AvatarCreator";
import AchievementBadge from "@/components/ui/AchievementBadge";
import { user, chat, achievements as achievementsApi, events as eventsApi } from "@/lib/api";

/* ── animation variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

/* ── fallback XP titles (used if backend doesn't provide them) ── */
const FALLBACK_XP_TITLES = [
  { title: "Novice", minXp: 0 },
  { title: "Apprentice", minXp: 100 },
  { title: "Scholar", minXp: 300 },
  { title: "Mathematician", minXp: 600 },
  { title: "Theorist", minXp: 1000 },
  { title: "Prodigy", minXp: 1800 },
  { title: "Master", minXp: 3000 },
  { title: "Grandmaster", minXp: 5000 },
  { title: "Legend", minXp: 8000 },
];

function getCurrentTitle(xp, titles) {
  let current = titles[0];
  for (const t of titles) {
    if (xp >= t.minXp) current = t;
    else break;
  }
  return current;
}

function getNextTitle(xp, titles) {
  for (const t of titles) {
    if (xp < t.minXp) return t;
  }
  return null;
}

export default function ProfilePage() {
  useMonument("sky");
  /* ── profile data ── */
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── edit profile ── */
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveErr, setSaveErr] = useState(null);

  /* ── avatar upload ── */
  const fileInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  /* ── change password ── */
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState(null);
  const [pwError, setPwError] = useState(null);

  /* ── stats ── */
  const [stats, setStats] = useState(null);

  /* ── fetch profile on mount ── */
  useEffect(() => {
    fetchProfile();
    fetchStats();
  }, []);

  async function fetchProfile() {
    try {
      setLoading(true);
      setError(null);
      const { data } = await user.profile();
      setProfile(data);
      setEditName(data.name || "");
      setEditBio(data.bio || "");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const { data } = await user.stats();
      setStats(data);
    } catch {
      // stats are optional, fail silently
    }
  }

  /* ── save profile ── */
  async function handleSaveProfile() {
    setSaveMsg(null);
    setSaveErr(null);

    if (!editName.trim()) {
      setSaveErr("Name cannot be empty.");
      return;
    }

    try {
      setSaving(true);
      const { data } = await user.updateProfile
        ? await user.updateProfile({ name: editName.trim(), bio: editBio.trim() })
        : await (await import("@/lib/http")).default.patch("/user/profile", {
            name: editName.trim(),
            bio: editBio.trim(),
          });
      setProfile((prev) => ({
        ...prev,
        ...(data || {}),
        name: editName.trim(),
        bio: editBio.trim(),
      }));
      setSaveMsg("Profile updated!");
      setEditing(false);
    } catch (err) {
      setSaveErr(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  /* ── avatar upload — accepts event or raw File ── */
  async function handleAvatarChange(fileOrEvent) {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent?.target?.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      const http = (await import("@/lib/http")).default;
      const fd = new FormData();
      fd.append("avatar", file);
      const { data } = await http.patch("/user/profile", fd);
      setProfile((prev) => ({
        ...prev,
        avatar_url: data?.avatar_url || prev.avatar_url,
      }));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /* ── change password ── */
  async function handleChangePassword(e) {
    e.preventDefault();
    setPwMessage(null);
    setPwError(null);

    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters");
      return;
    }

    try {
      setPwLoading(true);
      await user.changePassword(currentPassword, newPassword);
      setPwMessage("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwError(err.response?.data?.message || "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  }

  /* ═══════════════════════════════════════════
     LOADING STATE
     ═══════════════════════════════════════════ */
  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.2} />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader variant="orbit" size="lg" label="Loading profile..." />
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     ERROR STATE
     ═══════════════════════════════════════════ */
  if (error) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="sky" intensity={0.2} />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <p className="text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchProfile}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  /* ── derived data ── */
  const xp = profile.xp ?? 0;
  const level = profile.level ?? 1;
  const xpTitles = profile.xpTitles || FALLBACK_XP_TITLES;
  const currentTitle = profile.title
    ? { title: profile.title }
    : getCurrentTitle(xp, xpTitles);
  const nextTitle = profile.nextTitle
    ? { title: profile.nextTitle.title, minXp: profile.nextTitle.minXp }
    : getNextTitle(xp, xpTitles);

  const currentTitleData = xpTitles.find((t) => t.title === currentTitle.title) || xpTitles[0];
  const progressToNext = nextTitle?.minXp
    ? ((xp - (currentTitleData.minXp || 0)) / (nextTitle.minXp - (currentTitleData.minXp || 0))) * 100
    : 100;

  const avatarUrl = profile.avatar_url;
  const initial = (profile.name || "U").charAt(0).toUpperCase();

  /* ═══════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════ */
  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="sky" intensity={0.2} />

      <div className="relative z-10 space-y-8 pb-16">
        {/* ── Page Header ── */}
        <MonumentHero
          monument="sky"
          title="Your Profile"
          subtitle="Pilot Dossier"
        />

        <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
          {/* ══════════════ LEFT COLUMN ══════════════ */}
          <div className="space-y-8">
            {/* ── Profile Info Card ── */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card variant="glass">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
                  Identity
                </p>

                <AnimatePresence mode="wait">
                  {!editing ? (
                    <motion.div
                      key="view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 space-y-5"
                    >
                      {/* Avatar + basic info */}
                      <div className="flex items-center gap-5">
                        <div className="group relative">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={profile.name}
                              className="h-20 w-20 rounded-full object-cover"
                              style={{ border: "2px solid var(--monument-sky)", boxShadow: "0 0 20px rgba(182,149,248,0.3)" }}
                            />
                          ) : (
                            <div
                              className="flex h-20 w-20 items-center justify-center rounded-full text-3xl"
                              style={{
                                background: profile.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)",
                                border: "2px solid var(--monument-sky)",
                                boxShadow: "0 0 20px rgba(182,149,248,0.3)",
                              }}
                            >
                              {profile.avatar_emoji || initial}
                            </div>
                          )}

                          {/* Upload overlay */}
                          <button
                            onClick={() => setEditing(true)}
                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <span className="font-mono text-[10px] uppercase tracking-wider text-white">
                              Edit
                            </span>
                          </button>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h2 className="truncate font-display text-2xl font-bold text-white">
                            {profile.name}
                          </h2>
                          <p className="truncate text-sm text-text-muted">{profile.email}</p>
                        </div>
                      </div>

                      {/* Bio */}
                      {profile.bio && (
                        <p className="text-sm leading-7 text-text-muted">{profile.bio}</p>
                      )}

                      {/* Badges */}
                      <div className="flex flex-wrap gap-3">
                        <span className="inline-block font-mono text-[10px] uppercase tracking-wider" style={{ clipPath: "var(--clip-para)", background: "rgba(182,149,248,0.15)", color: "var(--monument-sky)", padding: "0.3rem 0.85rem" }}>
                          {profile.role || "Student"}
                        </span>
                        <span className="math-text inline-block font-mono text-[10px] uppercase tracking-wider" style={{ clipPath: "var(--clip-para)", background: "rgba(182,149,248,0.15)", color: "var(--monument-sky)", padding: "0.3rem 0.85rem" }}>
                          Level {level}
                        </span>
                        <span className="inline-block font-mono text-[10px] uppercase tracking-wider" style={{ clipPath: "var(--clip-para)", background: "var(--monument-sky)", color: "#000", padding: "0.3rem 0.85rem" }}>
                          {currentTitle.title}
                        </span>
                      </div>

                      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                        Edit Profile
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="edit"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 space-y-6"
                    >
                      {/* ── Full Avatar Creator ── */}
                      <div className="rounded-2xl border border-line/10 bg-black/10 p-5">
                        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-text-dim">Your Avatar</p>
                        <AvatarCreator
                          currentEmoji={profile.avatar_emoji || "😎"}
                          currentColor={profile.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)"}
                          currentConfig={profile.avatar_config}
                          avatarUrl={avatarUrl}
                          uploading={uploadingAvatar}
                          onEmojiSelect={async (emoji) => {
                            try {
                              const http = (await import("@/lib/http")).default;
                              await http.patch("/user/profile", { avatar_emoji: emoji });
                              setProfile((prev) => ({ ...prev, avatar_emoji: emoji }));
                            } catch { /* ignore */ }
                          }}
                          onColorSelect={async (gradient) => {
                            try {
                              const http = (await import("@/lib/http")).default;
                              await http.patch("/user/profile", { avatar_color: gradient });
                              setProfile((prev) => ({ ...prev, avatar_color: gradient }));
                            } catch { /* ignore */ }
                          }}
                          onConfigChange={async (config) => {
                            try {
                              const http = (await import("@/lib/http")).default;
                              await http.patch("/user/profile", { avatar_config: config });
                              setProfile((prev) => ({ ...prev, avatar_config: config }));
                            } catch { /* ignore */ }
                          }}
                          onPhotoUpload={handleAvatarChange}
                        />
                      </div>

                      {/* ── Name & Bio Fields ── */}
                      <InputField
                        label="Display Name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your name"
                      />

                      <InputField
                        label="Bio"
                        multiline
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Tell the collective about yourself — what do you study, what math excites you?"
                        helper="Visible to other students on the leaderboard"
                      />

                      {saveMsg && (
                        <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
                          {saveMsg}
                        </motion.p>
                      )}
                      {saveErr && (
                        <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                          {saveErr}
                        </motion.p>
                      )}

                      <div className="flex gap-3 pt-2">
                        <Button size="sm" loading={saving} onClick={handleSaveProfile}>
                          Save Changes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(false);
                            setEditName(profile.name || "");
                            setEditBio(profile.bio || "");
                            setSaveMsg(null);
                            setSaveErr(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.section>

            {/* ── Activity Stats ── */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card variant="glass">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                  Activity
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-white">
                  Your Stats
                </h2>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    {
                      label: "XP Earned",
                      value: xp.toLocaleString(),
                      color: "text-primary",
                    },
                    {
                      label: "Level",
                      value: level,
                      color: "text-secondary",
                    },
                    {
                      label: "Quizzes Taken",
                      value: stats?.quizzesTaken ?? stats?.testsAttempted ?? "--",
                      color: "text-glow",
                    },
                    {
                      label: "Accuracy",
                      value:
                        stats?.accuracy != null
                          ? `${Math.round(stats.accuracy)}%`
                          : stats?.correctAnswers != null && stats?.totalAnswers
                            ? `${Math.round((stats.correctAnswers / stats.totalAnswers) * 100)}%`
                            : "--",
                      color: "text-success",
                    },
                    {
                      label: "Challenges Solved",
                      value: stats?.challengesSolved ?? stats?.arenaAttempts ?? "--",
                      color: "text-warning",
                    },
                    {
                      label: "Current Streak",
                      value: stats?.streak ?? stats?.currentStreak ?? "--",
                      color: "text-danger",
                    },
                    {
                      label: "Best Streak",
                      value: stats?.bestStreak ?? stats?.longestStreak ?? "--",
                      color: "text-primary",
                    },
                    {
                      label: "Rank",
                      value: stats?.rank ?? currentTitle.title,
                      color: "text-glow",
                    },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                      className="rounded-2xl border border-line/10 bg-black/10 px-3 py-4 text-center"
                    >
                      <p className={`math-text text-2xl font-bold ${stat.color}`}>
                        {stat.value}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                        {stat.label}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.section>

            {/* ── Change Password ── */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card variant="solid">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
                      Security
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-bold text-white">
                      Change Password
                    </h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Button>
                </div>

                <AnimatePresence>
                  {showPassword && (
                    <motion.form
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                      onSubmit={handleChangePassword}
                    >
                      <div className="mt-6 space-y-4">
                        <InputField
                          label="Current Password"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                          required
                        />
                        <InputField
                          label="New Password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          required
                        />
                        <InputField
                          label="Confirm New Password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          error={
                            confirmPassword && newPassword !== confirmPassword
                              ? "Passwords do not match"
                              : undefined
                          }
                          required
                        />

                        {pwMessage && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-success"
                          >
                            {pwMessage}
                          </motion.p>
                        )}
                        {pwError && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-danger"
                          >
                            {pwError}
                          </motion.p>
                        )}

                        <Button type="submit" size="sm" loading={pwLoading}>
                          Update Password
                        </Button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </Card>
            </motion.section>
          </div>

          {/* ══════════════ RIGHT SIDEBAR ══════════════ */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* ── XP Card ── */}
            <Card variant="glow">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">
                Experience
              </p>
              <div className="mt-4 text-center">
                <p className="math-text text-5xl font-bold text-white">
                  {xp.toLocaleString()}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  Total XP
                </p>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">{currentTitle.title}</span>
                  <span className="font-mono text-xs text-white">
                    {nextTitle ? nextTitle.title : "Max Rank"}
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(progressToNext, 100)}%` }}
                    transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                    className="relative h-full overflow-hidden rounded-full"
                    style={{ background: "var(--monument-sky)" }}
                  >
                    <span
                      className="absolute inset-0"
                      style={{
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
                        backgroundSize: "200% 100%",
                        animation: "xpShimmer 2s ease-in-out infinite",
                      }}
                    />
                  </motion.div>
                </div>
                <style>{`@keyframes xpShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                {nextTitle && (
                  <p className="mt-2 text-center text-xs text-text-dim">
                    {((nextTitle.minXp || 0) - xp).toLocaleString()} XP to{" "}
                    <span className="text-white">{nextTitle.title}</span>
                  </p>
                )}
              </div>
            </Card>

            {/* ── Title Progression ── */}
            <Card variant="solid">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
                Title Progression
              </p>
              <h3 className="mt-2 font-display text-xl font-bold text-white">
                Rank Ladder
              </h3>

              <div className="mt-5 space-y-2">
                {xpTitles.map((t, i) => {
                  const isActive = currentTitle.title === t.title;
                  const isUnlocked = xp >= t.minXp;

                  return (
                    <motion.div
                      key={t.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.06 }}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition ${
                        isActive
                          ? "border-primary/30 bg-primary/10"
                          : isUnlocked
                            ? "border-line/15 bg-white/[0.03]"
                            : "border-line/8 bg-black/10 opacity-50"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                          isActive
                            ? "bg-primary/20 text-primary"
                            : isUnlocked
                              ? "bg-success/15 text-success"
                              : "bg-white/5 text-text-dim"
                        }`}
                      >
                        {isUnlocked ? "\u2713" : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            isActive ? "text-white" : "text-text-muted"
                          }`}
                        >
                          {t.title}
                        </p>
                        <p className="math-text text-[10px] text-text-dim">
                          {(t.minXp ?? 0).toLocaleString()} XP
                        </p>
                      </div>
                      {isActive && (
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-primary">
                          Current
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </Card>

            {/* ── Quick Stats ── */}
            <Card variant="glass">
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
                Quick Stats
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="math-text text-2xl font-bold text-white">{level}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    Level
                  </p>
                </div>
                <div>
                  <p className="math-text text-2xl font-bold text-white">
                    {xp.toLocaleString()}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    XP
                  </p>
                </div>
              </div>
            </Card>

            {/* ── Achievements ── */}
            <AchievementsSection />

            {/* ── Events Attended ── */}
            <EventsAttendedSection />

            {/* ── Friends & Messages ── */}
            <FriendsSection />
          </motion.aside>
        </div>
      </div>
    </div>
  );
}

/** Achievements section — shows unlocked achievement badges */
function AchievementsSection() {
  const [allAch, setAllAch] = useState([]);
  const [myAch, setMyAch] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([
      achievementsApi.list().catch(() => ({ data: [] })),
      achievementsApi.mine().catch(() => ({ data: [] })),
    ]).then(([all, mine]) => {
      setAllAch(Array.isArray(all.data) ? all.data : []);
      setMyAch(Array.isArray(mine.data) ? mine.data : []);
      setLoading(false);
    });
  }, []);

  const unlockedIds = new Set(myAch.map(u => u.achievement_id));
  const unlockedCount = unlockedIds.size;
  const totalCount = allAch.length;
  const display = showAll ? allAch : allAch.slice(0, 6);

  return (
    <Card variant="glass">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
          Achievements
        </p>
        <span className="math-text text-xs text-text-dim">{unlockedCount}/{totalCount}</span>
      </div>
      {loading ? (
        <div className="mt-4 flex justify-center"><Loader variant="dots" size="sm" /></div>
      ) : allAch.length === 0 ? (
        <p className="mt-3 text-xs text-text-dim">No achievements available yet</p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {display.map(ach => (
              <AchievementBadge
                key={ach.id}
                achievement={ach}
                unlocked={unlockedIds.has(ach.id)}
                compact
              />
            ))}
          </div>
          {totalCount > 6 && (
            <button onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full text-center font-mono text-[10px] text-primary/60 hover:text-primary transition">
              {showAll ? "Show less" : `Show all ${totalCount} achievements`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/** Events attended section — shows recent event participation */
function EventsAttendedSection() {
  const [eventsList, setEventsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventsApi.list()
      .then(r => {
        const all = Array.isArray(r.data) ? r.data : [];
        // Show events where user has registered (user_registration exists)
        const attended = all.filter(e => e.user_registration && e.user_registration.status === "attended");
        const registered = all.filter(e => e.user_registration && e.user_registration.status !== "cancelled" && e.user_registration.status !== "attended");
        setEventsList([...attended, ...registered].slice(0, 8));
      })
      .catch(() => setEventsList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card variant="glass">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-success">
        My Events
      </p>
      {loading ? (
        <div className="mt-4 flex justify-center"><Loader variant="dots" size="sm" /></div>
      ) : eventsList.length === 0 ? (
        <div className="mt-3 text-center">
          <p className="text-xs text-text-dim">No events yet</p>
          <Link to="/events" className="mt-2 inline-block font-mono text-[10px] text-primary hover:underline">
            Browse events →
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {eventsList.map(ev => (
            <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-line/10 bg-white/[0.02] px-3 py-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                ev.user_registration?.status === "attended"
                  ? "bg-success/15 text-success" : "bg-secondary/15 text-secondary"
              }`}>
                {ev.user_registration?.status === "attended" ? "✓" : "→"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{ev.title}</p>
                <p className="font-mono text-[9px] text-text-dim">
                  {ev.starts_at || ev.date ? new Date(ev.starts_at || ev.date).toLocaleDateString() : ""}
                  {ev.xp_reward > 0 && <span className="ml-2 text-primary">+{ev.xp_reward} XP</span>}
                </p>
              </div>
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[7px] uppercase ${
                ev.user_registration?.status === "attended" ? "bg-success/10 text-success"
                : ev.user_registration?.status === "waitlisted" ? "bg-warning/10 text-warning"
                : "bg-secondary/10 text-secondary"
              }`}>
                {ev.user_registration?.status || "—"}
              </span>
            </div>
          ))}
          <Link to="/events" className="block text-center font-mono text-[10px] text-primary/60 hover:text-primary transition mt-2">
            View all events →
          </Link>
        </div>
      )}
    </Card>
  );
}

/** Friends section — shows friends list, pending requests, search, and links to profiles */
function FriendsSection() {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [tab, setTab] = useState("friends");
  const [loadingFriends, setLoadingFriends] = useState(true);

  useEffect(() => {
    Promise.all([
      chat.getFriends().catch(() => ({ data: [] })),
      chat.getPending().catch(() => ({ data: [] })),
    ]).then(([f, p]) => {
      setFriends(f.data || []);
      setPending(p.data || []);
      setLoadingFriends(false);
    });
  }, []);

  const handleSearch = async (q) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    try {
      const { data } = await chat.searchUsers(q);
      setResults(data || []);
    } catch { setResults([]); }
  };

  return (
    <Card variant="solid">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
          Friends & Messages
        </p>
        {pending.length > 0 && (
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {pending.length}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 rounded-lg bg-white/[0.03] p-0.5">
        {[
          { key: "friends", label: `Friends (${friends.length})` },
          { key: "requests", label: `Requests${pending.length ? ` (${pending.length})` : ""}` },
          { key: "find", label: "Find People" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition ${
              tab === t.key ? "bg-primary/15 text-white" : "text-text-dim hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
        {/* Friends tab */}
        {tab === "friends" && (
          loadingFriends ? (
            <p className="py-4 text-center text-xs text-text-dim">Loading...</p>
          ) : friends.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xl">👥</p>
              <p className="mt-2 text-xs text-text-dim">No friends yet</p>
              <button onClick={() => setTab("find")} className="mt-2 text-[10px] text-primary hover:underline">
                Find people to connect with
              </button>
            </div>
          ) : (
            friends.map((f) => (
              <Link
                key={f.user_id}
                to={`/student/${f.user_id}`}
                className="flex items-center gap-3 rounded-xl border border-line/5 bg-black/10 px-3 py-2.5 transition hover:border-primary/20 hover:bg-primary/5"
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{ background: f.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)" }}
                >
                  {f.avatar_emoji || f.name?.charAt(0) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{f.name}</p>
                  <p className="text-[9px] text-text-dim">{f.title || "Student"} · {(f.xp || 0).toLocaleString()} XP</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </Link>
            ))
          )
        )}

        {/* Requests tab */}
        {tab === "requests" && (
          pending.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-dim">No pending requests</p>
          ) : (
            pending.map((req) => (
              <div key={req.id} className="flex items-center gap-2.5 rounded-xl border border-line/5 bg-black/10 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{req.requester?.name || "User"}</p>
                  <p className="text-[9px] text-text-dim">{req.requester?.email || ""}</p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    await chat.respondRequest(req.id, true);
                    setPending((p) => p.filter((r) => r.id !== req.id));
                    chat.getFriends().then((r) => setFriends(r.data || []));
                  }}
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await chat.respondRequest(req.id, false);
                    setPending((p) => p.filter((r) => r.id !== req.id));
                  }}
                >
                  ✕
                </Button>
              </div>
            ))
          )
        )}

        {/* Find People tab */}
        {tab === "find" && (
          <>
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-xl border border-line/15 bg-black/15 px-3 py-2 text-sm text-white outline-none focus:border-primary/30"
            />
            {results.length === 0 && search.length >= 2 && (
              <p className="py-4 text-center text-xs text-text-dim">No one found</p>
            )}
            {results.map((u) => (
              <div key={u.user_id} className="flex items-center gap-2.5 rounded-xl border border-line/5 bg-black/10 px-3 py-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{ background: u.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)" }}
                >
                  {u.avatar_emoji || u.name?.charAt(0) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{u.name}</p>
                  <p className="text-[9px] text-text-dim">{(u.xp || 0).toLocaleString()} XP</p>
                </div>
                <Link
                  to={`/student/${u.user_id}`}
                  className="rounded-lg bg-primary/15 px-2.5 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/25"
                >
                  View Profile
                </Link>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}
