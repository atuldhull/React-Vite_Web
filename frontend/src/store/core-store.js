import { create } from "zustand";
import { core } from "@/lib/api";

/**
 * core-store — tracks whether the signed-in user is a Core Team member.
 *
 * status:  idle | loading | member | outsider | error
 *   member   → has redeemed an access code; `member` holds their row
 *   outsider → authenticated, but not (yet) a core member
 *
 * The CoreTeamLayout calls fetchMe() once on mount; portal pages read
 * `member` straight from here instead of re-fetching.
 */
export const useCoreStore = create((set) => ({
  status: "idle",
  member: null,
  teamRank: null,

  fetchMe: async () => {
    set({ status: "loading" });
    try {
      const { data } = await core.me();
      if (data.isCoreMember) {
        set({ status: "member", member: data.member, teamRank: data.teamRank || null });
      } else {
        set({ status: "outsider", member: null, teamRank: null });
      }
    } catch {
      set({ status: "error" });
    }
  },

  reset: () => set({ status: "idle", member: null, teamRank: null }),
}));
