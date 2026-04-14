/**
 * ProfileTabs — horizontal tab switcher for the rich profile page.
 *
 * Currently renders Overview / Achievements / Friends / Activity.
 * Tabs that the viewer isn't allowed to see (e.g. friend list
 * hidden by target's show_friend_list=false) are still rendered
 * as DISABLED tabs — clicking them does nothing visible, but the
 * user can see the section exists. Hiding tabs entirely would
 * create a "why is my layout shifting" surprise.
 *
 * The component is controlled — parent owns the `active` tab id.
 * That's so deep links like /profile/:id?tab=friends (future) can
 * set the initial tab without component-level routing.
 */

const TAB_DEFS = [
  { id: "overview",    label: "Overview",    requires: "canViewProfile" },
  { id: "achievements",label: "Achievements",requires: "canViewProfile" },
  { id: "friends",     label: "Friends",     requires: "canViewFriendList" },
  { id: "activity",    label: "Activity",    requires: "canViewActivityFeed" },
];

/**
 * @param {{
 *   active: string,
 *   onChange: (id: string) => void,
 *   access: { canViewProfile?: boolean, canViewFriendList?: boolean, canViewActivityFeed?: boolean },
 * }} props
 */
export default function ProfileTabs({ active, onChange, access }) {
  return (
    <div role="tablist" aria-label="Profile sections" className="flex gap-1 overflow-x-auto border-b border-line/10">
      {TAB_DEFS.map((tab) => {
        const allowed = access?.[tab.requires] !== false;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={!allowed}
            onClick={() => allowed && onChange(tab.id)}
            className={[
              "relative shrink-0 px-4 py-3 font-mono text-[11px] uppercase tracking-wider transition",
              isActive
                ? "text-white"
                : allowed
                  ? "text-text-dim hover:text-text-muted"
                  : "cursor-not-allowed text-text-dim/40",
            ].join(" ")}
          >
            {tab.label}
            {isActive && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
