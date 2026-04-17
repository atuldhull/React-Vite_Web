export const mainNavigation = [
  { to: "/", label: "Home", note: "System overview" },
  { to: "/arena", label: "Arena", note: "Challenge zone" },
  { to: "/leaderboard", label: "Leaderboard", note: "Rankings" },
  { to: "/events", label: "Events", note: "Competitions" },
  { to: "/gallery", label: "Gallery", note: "Photos" },
];

export const studentNavigation = [
  { to: "/dashboard", label: "Dashboard", note: "My stats" },
  { to: "/arena", label: "Arena", note: "Solve challenges" },
  { to: "/live-quiz", label: "Live Quiz", note: "Join a quiz" },
  { to: "/projects", label: "Projects", note: "Team work" },
  { to: "/certificates", label: "Certificates", note: "My certs" },
  { to: "/notifications", label: "Notifications", note: "Updates" },
];

export const teacherNavigation = [
  { to: "/teacher", label: "Dashboard", note: "Overview" },
  { to: "/teacher/students", label: "Students", note: "Student list" },
  { to: "/teacher/challenges", label: "Challenges", note: "Question bank" },
  { to: "/teacher/certificates", label: "Certificates", note: "Generate certs" },
  { to: "/teacher/quiz", label: "Quiz", note: "Live quiz" },
];

export const adminNavigation = [
  { to: "/admin", label: "Overview", note: "Mission control" },
  { to: "/admin/users", label: "Users", note: "User management" },
  { to: "/admin/challenges", label: "Challenges", note: "Question ops" },
  { to: "/admin/events", label: "Events", note: "Event management" },
  { to: "/admin/data", label: "Data Ops", note: "Data management" },
  { to: "/admin/features", label: "Features", note: "Feature flags + plan" },
  { to: "/admin/settings", label: "Settings", note: "System config" },
];

export const superAdminNavigation = [
  { to: "/super-admin", label: "Analytics", note: "Platform stats" },
  { to: "/super-admin/organisations", label: "Organisations", note: "Org management" },
  { to: "/super-admin/plans", label: "Plans & Billing", note: "Subscriptions" },
  { to: "/super-admin/access", label: "Access Control", note: "Impersonation & flags" },
];
