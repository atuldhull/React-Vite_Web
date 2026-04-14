/**
 * RichProfilePage — Phase 15 profile route (/profile/:userId).
 *
 * Fetches the aggregate profile + access flags from
 * GET /api/users/:id/profile and renders:
 *   - ProfileHeader with FriendButton / MessageButton
 *   - ProfileTabs switcher (Overview / Achievements / Friends / Activity)
 *   - Tab content (Phase 8 — currently placeholder)
 *
 * Privacy handling
 * ────────────────
 * When access.canViewProfile is false, the backend already returns a
 * minimal private-card payload (`profile.isPrivate === true`). The
 * header renders the "Private" chip; the tab switcher + tab content
 * disappear entirely — there's nothing to show.
 *
 * Self-detection
 * ──────────────
 * We compare :userId against the logged-in user's id. Matched → the
 * header's "Edit profile" link shows (which points to the legacy
 * /profile route where the self-edit UX lives today); mismatched →
 * the FriendButton + MessageButton show instead.
 *
 * Loading / error states
 * ──────────────────────
 *   - while fetching: centered Loader
 *   - 404 from API: "User not found" card
 *   - other error:   "Couldn't load profile" card with retry
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Loader from "@/components/ui/Loader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { users } from "@/lib/api";
import ProfileHeader from "@/features/profile/components/ProfileHeader";
import ProfileTabs from "@/features/profile/components/ProfileTabs";

export default function RichProfilePage() {
  useMonument("jungle");
  const { userId } = useParams();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await users.profile(userId);
      setData(data);
    } catch (err) {
      setError(err?.response?.status === 404 ? "not_found" : "error");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // When the target profile is private, force the user back to the
  // Overview-equivalent view — clicking any tab would be a no-op
  // anyway, but this is the safe default.
  useEffect(() => {
    if (data?.access && !data.access.canViewProfile) setActiveTab("overview");
  }, [data]);

  const shell = (content) => (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="jungle" intensity={0.12} />
      <div className="relative z-10 mx-auto max-w-4xl space-y-6 px-4 py-10">
        {content}
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader variant="orbit" size="lg" label="Loading profile..." />
      </div>,
    );
  }

  if (error === "not_found") {
    return shell(
      <Card variant="glass" className="py-12 text-center">
        <p className="text-4xl">🌫️</p>
        <p className="mt-4 font-display text-lg text-white">User not found</p>
        <p className="mt-2 text-sm text-text-dim">
          This profile doesn&apos;t exist, or they&apos;re not part of your organisation.
        </p>
      </Card>,
    );
  }

  if (error === "error" || !data) {
    return shell(
      <Card variant="glass" className="py-12 text-center">
        <p className="text-4xl">⚠️</p>
        <p className="mt-4 font-display text-lg text-white">Couldn&apos;t load profile</p>
        <div className="mt-4 flex justify-center">
          <Button size="sm" variant="secondary" onClick={fetchProfile}>Retry</Button>
        </div>
      </Card>,
    );
  }

  const { profile, access } = data;

  return shell(
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <ProfileHeader profile={profile} access={access} userId={userId} />

      {/* Only show tabs + content when the profile is viewable. Private
          profiles end at the header ("This user has a private profile"
          is effectively what the header's Private chip signals). */}
      {access.canViewProfile && (
        <>
          <ProfileTabs active={activeTab} onChange={setActiveTab} access={access} />

          {/* Tab CONTENT placeholders — filled in Phase 8 */}
          <div role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
            {activeTab === "overview" && (
              <Card variant="glass" className="py-10 text-center text-sm text-text-dim">
                Overview tab — coming next phase
              </Card>
            )}
            {activeTab === "achievements" && (
              <Card variant="glass" className="py-10 text-center text-sm text-text-dim">
                Achievements — coming next phase
              </Card>
            )}
            {activeTab === "friends" && (
              <Card variant="glass" className="py-10 text-center text-sm text-text-dim">
                Friends — coming next phase
              </Card>
            )}
            {activeTab === "activity" && (
              <Card variant="glass" className="py-10 text-center text-sm text-text-dim">
                Activity — coming next phase
              </Card>
            )}
          </div>
        </>
      )}

      {/* When access.canViewProfile is false, explicitly show the
          "private" message below the header so the page isn't just a
          bare card. */}
      {!access.canViewProfile && (
        <Card variant="glass" className="py-10 text-center">
          <p className="text-3xl">🔒</p>
          <p className="mt-3 font-display text-base text-white">This profile is private</p>
          <p className="mt-1 text-sm text-text-dim">
            Only the profile owner can view the full page.
          </p>
        </Card>
      )}
    </motion.div>,
  );
}
