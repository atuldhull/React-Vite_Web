import http from "@/lib/http";

// ── Auth ──
export const auth = {
  session: () => http.get("/auth/session"),
  login: (email, password) => http.post("/auth/login", { email, password }),
  register: (name, email, password) => http.post("/auth/register", { name, email, password }),
  logout: () => http.post("/auth/logout"),
  forgotPassword: (email) => http.post("/auth/forgot-password", { email }),
};

// ── User ──
export const user = {
  profile: () => http.get("/user/profile"),
  updateProfile: (data) => http.patch("/user/profile", data),
  stats: () => http.get("/user/stats"),
  changePassword: (currentPassword, newPassword) =>
    http.post("/user/change-password", { currentPassword, newPassword }),
  testHistory: () => http.get("/user/test-history"),
  getStudent: (userId) => http.get(`/user/student/${userId}`),
};

// ── Arena ──
export const arena = {
  submit: (challengeId, selectedIndex) =>
    http.post("/arena/submit", { challengeId, selectedIndex }),
  history: () => http.get("/arena/history"),
  stats: () => http.get("/arena/stats"),
};

// ── Challenges ──
export const challenges = {
  current: () => http.get("/challenge/current"),
  next: (difficulty) => http.get("/challenge/next", { params: { difficulty } }),
  all: () => http.get("/challenge/all"),
  get: (id) => http.get(`/challenge/${id}`),
  create: (data) => http.post("/challenge", data),
  update: (id, data) => http.patch(`/challenge/${id}`, data),
  remove: (id) => http.delete(`/challenge/${id}`),
  toggle: (id) => http.patch(`/challenge/${id}/toggle`),
};

// ── Leaderboard ──
export const leaderboard = {
  weekly: () => http.get("/leaderboard"),
  allTime: () => http.get("/leaderboard/alltime"),
  winners: () => http.get("/leaderboard/winners"),
  weekInfo: () => http.get("/leaderboard/week-info"),
};

// ── Events ──
export const events = {
  list: () => http.get("/events"),
  get: (id) => http.get(`/events/${id}`),
  create: (data) => http.post("/events", data),
  update: (id, data) => http.patch(`/events/${id}`, data),
  remove: (id) => http.delete(`/events/${id}`),
  toggleReg: (id) => http.patch(`/events/${id}/toggle-reg`),
  settings: () => http.get("/events/settings"),
  updateSetting: (key, value) => http.patch(`/events/settings/${key}`, { value }),
  // Registration
  register: (id, data) => http.post(`/events/${id}/register`, data || {}),
  cancelReg: (id) => http.delete(`/events/${id}/register`),
  registrations: (id) => http.get(`/events/${id}/registrations`),
  // Attendance
  checkin: (id, data) => http.post(`/events/${id}/checkin`, data || {}),
  manualCheckin: (id, data) => http.post(`/events/${id}/checkin-manual`, data),
  scanQr: (id, qr_token, session_label) => http.post(`/events/${id}/scan-qr`, { qr_token, session_label }),
  attendance: (id) => http.get(`/events/${id}/attendance`),
  // Event Leaderboard
  leaderboard: (id) => http.get(`/events/${id}/leaderboard`),
  updateScore: (id, data) => http.post(`/events/${id}/leaderboard`, data),
  publishResults: (id) => http.post(`/events/${id}/leaderboard/publish`),
  // Paid-event reconciliation (migration 19)
  submitPayment: (id, regId, paymentRef) =>
    http.post(`/events/${id}/registrations/${regId}/pay`, { paymentRef }),
  listPayments: (id) => http.get(`/events/${id}/payments`),
  markPaid: (id, regId) =>
    http.post(`/events/${id}/registrations/${regId}/mark-paid`, {}),
  rejectPayment: (id, regId, reason) =>
    http.post(`/events/${id}/registrations/${regId}/reject`, { reason }),
};

// ── Achievements ──
export const achievements = {
  list: () => http.get("/achievements"),
  mine: () => http.get("/achievements/me"),
  user: (userId) => http.get(`/achievements/user/${userId}`),
  grant: (data) => http.post("/achievements/grant", data),
};

// ── Insights ──
export const insights = {
  recommendations: () => http.get("/insights/recommendations"),
  eventHealth: (id) => http.get(`/insights/event/${id}/health`),
  admin: () => http.get("/insights/admin"),
};

// ── Admin ──
export const admin = {
  stats: () => http.get("/admin/stats"),
  activeUsers: () => http.get("/admin/active-users"),
  users: (page, limit) => http.get("/admin/users", { params: { page, limit } }),
  createUser: (data) => http.post("/admin/users/create", data),
  deleteUser: (id) => http.delete(`/admin/users/${id}`),
  resetPassword: (id, newPassword) => http.post(`/admin/users/${id}/reset-password`, { newPassword }),
  updateRole: (id, role) => http.patch(`/admin/users/${id}/role`, { role }),
  resetWeek: () => http.post("/admin/reset-week"),
  generate: (topic, difficulty) => http.get("/admin/generate", { params: { topic, difficulty } }),
  saveQuestion: (data) => http.post("/admin/save", data),
  // Data ops
  teams: () => http.get("/admin/data/teams"),
  deleteTeam: (id) => http.delete(`/admin/data/teams/${id}`),
  deleteProject: (id) => http.delete(`/admin/data/projects/${id}`),
  tests: () => http.get("/admin/data/tests"),
  deleteTest: (id) => http.delete(`/admin/data/tests/${id}`),
  clearAttempts: (userId) => http.delete(`/admin/data/attempts/${userId}`),
  resetXp: (userId) => http.patch(`/admin/data/reset-xp/${userId}`),
  clearAllAttempts: () => http.delete("/admin/data/all-attempts"),
  exportAll: () => http.get("/admin/export", { responseType: "blob" }),
};

// ── Teacher ──
export const teacher = {
  profile: () => http.get("/teacher/profile"),
  stats: () => http.get("/teacher/stats"),
  students: () => http.get("/teacher/students"),
  performance: () => http.get("/teacher/performance"),
  activity: () => http.get("/teacher/activity"),
  generate: (topic, difficulty) => http.get("/teacher/generate", { params: { topic, difficulty } }),
  saveQuestion: (data) => http.post("/teacher/save-question", data),
  challenges: () => http.get("/teacher/challenges"),
  toggleChallenge: (id) => http.patch(`/teacher/challenges/${id}/toggle`),
  leaderboard: () => http.get("/teacher/leaderboard"),
};

// ── Certificates ──
export const certificates = {
  uploadAsset: (file, type) => {
    const fd = new FormData();
    fd.append("asset", file);
    return http.post(`/certificates/upload-asset?type=${type}`, fd);
  },
  preview: (data) => http.post("/certificates/preview", data, { responseType: "blob" }),
  matchStudents: (recipients) => http.post("/certificates/match-students", { recipients }),
  create: (data) => http.post("/certificates/create", data),
  batches: () => http.get("/certificates/batches"),
  deleteBatch: (id) => http.delete(`/certificates/batches/${id}`),
  downloadZip: (batchId) => http.get(`/certificates/batch/${batchId}/zip`, { responseType: "blob" }),
  download: (id) => http.get(`/certificates/download/${id}`, { responseType: "blob" }),
  mine: () => http.get("/certificates/mine"),
};

// ── Projects ──
export const projects = {
  list: () => http.get("/projects"),
  categories: () => http.get("/projects/categories"),
  myTeam: () => http.get("/projects/my-team"),
  createTeam: (data) => http.post("/projects/teams", data),
  submit: (data) => http.post("/projects", data),
  vote: (id) => http.post(`/projects/${id}/vote`),
  approve: (id) => http.patch(`/projects/${id}/approve`),
  pending: () => http.get("/projects/pending"),
  createCategory: (data) => http.post("/projects/categories", data),
  deleteCategory: (id) => http.delete(`/projects/categories/${id}`),
};

// ── Notifications ──
export const notifications = {
  list: () => http.get("/notifications"),
  markRead: (id) => http.patch(`/notifications/${id}/read`),
  markAllRead: () => http.patch("/notifications/read-all"),
  clear: () => http.delete("/notifications/clear"),
  broadcast: (title, message) => http.post("/notifications/broadcast", { title, message }),
};

// ── Announcements ──
export const announcements = {
  list: () => http.get("/announcements"),
  create: (data) => http.post("/announcements", data),
  remove: (id) => http.delete(`/announcements/${id}`),
};

// ── Gallery ──
export const gallery = {
  list: () => http.get("/gallery"),
  upload: (file) => {
    const fd = new FormData();
    fd.append("image", file);
    return http.post("/gallery/upload", fd);
  },
  remove: (imageId) => http.delete("/gallery", { data: { imageId } }),
  createCategory: (data) => http.post("/gallery/category", data),
};

// ── Quiz ──
export const quiz = {
  challenges: () => http.get("/quiz/challenges"),
  aiBulk: (data) => http.post("/quiz/ai-generate-bulk", data),
  uploadCsv: (file, save) => {
    const fd = new FormData();
    fd.append("csv", file);
    return http.post(`/quiz/upload-csv?save=${save}`, fd);
  },
  createTest: (data) => http.post("/quiz/scheduled", data),
  listTests: () => http.get("/quiz/scheduled"),
  activeTests: () => http.get("/quiz/active"),
  getTest: (id) => http.get(`/quiz/scheduled/${id}`),
  submitTest: (id, answers) => http.post(`/quiz/scheduled/${id}/submit`, { answers }),
  deleteTest: (id) => http.delete(`/quiz/scheduled/${id}`),
};

// ── Payments ──
export const payments = {
  plans: () => http.get("/payment/plans"),
  createOrder: (planId) => http.post("/payment/create-order", { planId }),
  verify: (data) => http.post("/payment/verify", data),
  history: () => http.get("/payment/history"),
};

// ── Super Admin ──
export const superAdmin = {
  analytics: () => http.get("/super-admin/analytics"),
  leaderboard: () => http.get("/super-admin/leaderboard"),
  auditLogs: () => http.get("/super-admin/audit-logs"),
  orgs: () => http.get("/super-admin/organisations"),
  createOrg: (data) => http.post("/super-admin/organisations", data),
  updateOrg: (id, data) => http.patch(`/super-admin/organisations/${id}`, data),
  deleteOrg: (id) => http.delete(`/super-admin/organisations/${id}`),
  suspendOrg: (id) => http.post(`/super-admin/organisations/${id}/suspend`),
  activateOrg: (id) => http.post(`/super-admin/organisations/${id}/activate`),
  assignPlan: (id, planName) => http.post(`/super-admin/organisations/${id}/plan`, { planName }),
  setFeatures: (id, features) => http.put(`/super-admin/organisations/${id}/features`, { flags: features }),
  orgStats: (id) => http.get(`/super-admin/organisations/${id}/stats`),
  forceSuspendUsers: (id) => http.post(`/super-admin/organisations/${id}/force-suspend-users`),
  impersonate: (orgId) => http.post(`/super-admin/impersonate/${orgId}`),
  stopImpersonate: () => http.delete("/super-admin/impersonate"),
  plans: () => http.get("/super-admin/plans"),
  payments: () => http.get("/super-admin/payments"),
};

// ── Org Admin ──
export const orgAdmin = {
  stats: () => http.get("/org-admin/org-stats"),
  analytics: () => http.get("/org-admin/analytics"),
  users: (params) => http.get("/org-admin/users", { params }),
  updateRole: (id, role) => http.patch(`/org-admin/users/${id}/role`, { role }),
  suspendUser: (id) => http.post(`/org-admin/users/${id}/suspend`),
  activateUser: (id) => http.post(`/org-admin/users/${id}/activate`),
  invite: (email, role) => http.post("/org-admin/invite", { email, role }),
  branding: () => http.get("/org-admin/branding"),
  updateBranding: (data) => http.patch("/org-admin/branding", data),
  features: () => http.get("/org-admin/features"),
  toggleFeature: (feature, enabled) => http.patch("/org-admin/features", { feature, enabled }),
};

// ── Contact ──
export const contact = {
  send: (data) => http.post("/contact/send", data),
};

// ── Bot ──
export const bot = {
  chat: (messages, challengeContext) => http.post("/bot/chat", { messages, challengeContext }),
};

// ── Comments ──
export const comments = {
  list: (challengeId) => http.get(`/comments/${challengeId}`),
  post: (challengeId, content) => http.post(`/comments/${challengeId}`, { content }),
  askAi: (challengeId, question, challengeTitle) => http.post(`/comments/${challengeId}/ask-ai`, { question, challengeTitle }),
};

// ── Referrals ──
export const referral = {
  getCode: () => http.get("/referral/code"),
  apply: (code) => http.post("/referral/apply", { code }),
  stats: () => http.get("/referral/stats"),
  leaderboard: () => http.get("/referral/leaderboard"),
  validate: (code) => http.get(`/referral/validate/${code}`),
};

// ── Chat / Messaging (E2EE) ──
export const chat = {
  // Keys
  registerKey: (publicKey) => http.post("/chat/keys/register", { publicKey }),
  getKey: (userId) => http.get(`/chat/keys/${userId}`),
  // Friends
  sendRequest: (recipientId) => http.post("/chat/friends/request", { recipientId }),
  respondRequest: (requestId, accept) => http.post("/chat/friends/respond", { requestId, accept }),
  getFriends: () => http.get("/chat/friends"),
  getPending: () => http.get("/chat/friends/pending"),
  // Conversations
  getOrCreateConversation: (otherUserId) => http.post("/chat/conversations", { otherUserId }),
  getConversations: () => http.get("/chat/conversations"),
  // Messages
  sendMessage: (conversationId, encryptedContent, iv, messageType) =>
    http.post("/chat/messages", { conversationId, encryptedContent, iv, messageType }),
  getMessages: (conversationId, page) => http.get(`/chat/messages/${conversationId}?page=${page || 1}`),
  markAsRead: (conversationId) => http.post("/chat/messages/read", { conversationId }),
  // Discovery
  searchUsers: (q) => http.get(`/chat/search?q=${encodeURIComponent(q)}`),
  // Block/Report
  blockUser: (blockedId) => http.post("/chat/block", { blockedId }),
  reportMessage: (messageId, reason) => http.post("/chat/report", { messageId, reason }),
  // Settings
  getSettings: () => http.get("/chat/settings"),
  updateSettings: (settings) => http.patch("/chat/settings", settings),
};
