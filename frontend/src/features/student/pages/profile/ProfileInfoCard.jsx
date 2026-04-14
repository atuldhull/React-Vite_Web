import { lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";

// Lazy-load AvatarCreator: it brings in @dicebear/collection (~1MB of
// SVG avatar styles) and is only rendered when the user enters the
// profile-edit state. Lazy-loading splits it into its own chunk, so
// the initial profile-page paint isn't paying for an avatar builder
// the user almost never opens.
const AvatarCreator = lazy(() => import("@/components/ui/AvatarCreator"));

export default function ProfileInfoCard({
  profile,
  editing,
  setEditing,
  editName,
  setEditName,
  editBio,
  setEditBio,
  saving,
  saveMsg,
  saveErr,
  uploadingAvatar,
  onSave,
  onCancel,
  onAvatarChange,
  onEmojiSelect,
  onColorSelect,
  onConfigChange,
  currentTitle,
  level,
}) {
  const avatarUrl = profile.avatar_url;
  const initial = (profile.name || "U").charAt(0).toUpperCase();

  return (
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
              {/* ── Full Avatar Creator (lazy-loaded) ── */}
              <div className="rounded-2xl border border-line/10 bg-black/10 p-5">
                <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-text-dim">Your Avatar</p>
                <Suspense fallback={
                  <div className="flex h-40 items-center justify-center text-xs text-text-dim">
                    Loading avatar builder…
                  </div>
                }>
                  <AvatarCreator
                    currentEmoji={profile.avatar_emoji || "😎"}
                    currentColor={profile.avatar_color || "linear-gradient(135deg,#7c3aed,#3b82f6)"}
                    currentConfig={profile.avatar_config}
                    avatarUrl={avatarUrl}
                    uploading={uploadingAvatar}
                    onEmojiSelect={onEmojiSelect}
                    onColorSelect={onColorSelect}
                    onConfigChange={onConfigChange}
                    onPhotoUpload={onAvatarChange}
                  />
                </Suspense>
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
                <Button size="sm" loading={saving} onClick={onSave}>
                  Save Changes
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.section>
  );
}
