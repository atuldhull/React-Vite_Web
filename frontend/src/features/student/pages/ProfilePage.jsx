import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import MonumentHero from "@/components/monument/MonumentHero";
import { useMonument } from "@/hooks/useMonument";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { user } from "@/lib/api";
import http from "@/lib/http";

import ProfileInfoCard from "./profile/ProfileInfoCard";
import ActivityStatsCard from "./profile/ActivityStatsCard";
import PasswordChangeSection from "./profile/PasswordChangeSection";
import XPSidebar from "./profile/XPSidebar";
import AchievementsSection from "./profile/AchievementsSection";
import EventsAttendedSection from "./profile/EventsAttendedSection";
import FriendsSection from "./profile/FriendsSection";

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
        : await http.patch("/user/profile", {
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

  /* ── avatar upload — accepts event or raw File ──
     The backend's updateProfile doesn't have a file-upload middleware
     (no multer wired on /api/user/profile), so we convert the file to
     a base64 data URL client-side and persist it via the existing
     avatar_config JSON field. Rendering switches to <img> when
     avatar_config.type === "photo" (see ProfileInfoCard + IdentityGlyph
     fallbacks). Capped at 200 KB so a single row doesn't bloat — a
     well-compressed JPEG at ~500×500 fits comfortably. */
  async function handleAvatarChange(fileOrEvent) {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent?.target?.files?.[0];
    if (!file) return;

    const MAX_BYTES = 200 * 1024;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      alert("Please pick a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      alert("Image too large (max 200 KB). Try a smaller/compressed version.");
      return;
    }

    try {
      setUploadingAvatar(true);
      // Read the file as a data URL (base64-encoded). FileReader is
      // async with events, not promises, so we wrap it.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const nextConfig = { type: "photo", dataUrl };
      await http.patch("/user/profile", { avatar_config: nextConfig });
      setProfile((prev) => ({
        ...(prev || {}),
        avatar_config: nextConfig,
      }));
    } catch (err) {
      alert(err.response?.data?.error || err.response?.data?.message || "Failed to upload avatar");
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

  /* ── avatar field callbacks ── */
  async function handleEmojiSelect(emoji) {
    try {
      await http.patch("/user/profile", { avatar_emoji: emoji });
      setProfile((prev) => ({ ...prev, avatar_emoji: emoji }));
    } catch { /* ignore */ }
  }

  async function handleColorSelect(gradient) {
    try {
      await http.patch("/user/profile", { avatar_color: gradient });
      setProfile((prev) => ({ ...prev, avatar_color: gradient }));
    } catch { /* ignore */ }
  }

  async function handleConfigChange(config) {
    try {
      await http.patch("/user/profile", { avatar_config: config });
      setProfile((prev) => ({ ...prev, avatar_config: config }));
    } catch { /* ignore */ }
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
            <ProfileInfoCard
              profile={profile}
              editing={editing}
              setEditing={setEditing}
              editName={editName}
              setEditName={setEditName}
              editBio={editBio}
              setEditBio={setEditBio}
              saving={saving}
              saveMsg={saveMsg}
              saveErr={saveErr}
              uploadingAvatar={uploadingAvatar}
              onSave={handleSaveProfile}
              onCancel={() => {
                setEditing(false);
                setEditName(profile.name || "");
                setEditBio(profile.bio || "");
                setSaveMsg(null);
                setSaveErr(null);
              }}
              onAvatarChange={handleAvatarChange}
              onEmojiSelect={handleEmojiSelect}
              onColorSelect={handleColorSelect}
              onConfigChange={handleConfigChange}
              currentTitle={currentTitle}
              level={level}
            />

            <ActivityStatsCard
              xp={xp}
              level={level}
              stats={stats}
              currentTitle={currentTitle}
            />

            <PasswordChangeSection
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              pwLoading={pwLoading}
              pwMessage={pwMessage}
              pwError={pwError}
              onSubmit={handleChangePassword}
            />
          </div>

          {/* ══════════════ RIGHT SIDEBAR ══════════════ */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            <XPSidebar
              xp={xp}
              level={level}
              currentTitle={currentTitle}
              nextTitle={nextTitle}
              xpTitles={xpTitles}
              progressToNext={progressToNext}
            />

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
