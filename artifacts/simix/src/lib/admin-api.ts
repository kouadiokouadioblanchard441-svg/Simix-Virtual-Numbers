import { adminToken } from "./admin-token";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    ...adminToken.getHeader(),
    ...(body ? { "content-type": "application/json" } : {}),
  };
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: "include",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  /* Session expirée ou token invalide → redirection vers la connexion admin */
  if (res.status === 401) {
    adminToken.clear();
    const currentPath = window.location.pathname;
    if (!currentPath.includes("/admin/secure-login")) {
      window.location.href = `${BASE}/admin/secure-login`;
    }
    throw new Error("Session expirée. Veuillez vous reconnecter.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Erreur serveur");
  }
  return res.json() as Promise<T>;
}

export const adminApi = {
  getStats: () => req<AdminStats>("GET", "/admin/stats"),
  getAnalytics: (days = 30) => req<AdminAnalytics>("GET", `/admin/analytics?days=${days}`),

  getUsers: (params?: { limit?: number; offset?: number; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    if (params?.search) q.set("search", params.search);
    return req<{ users: AdminUser[]; total: number }>("GET", `/admin/users?${q}`);
  },
  getUser: (id: string) => req<AdminUserDetail>("GET", `/admin/users/${id}`),
  blockUser: (id: string, reason: string) => req("POST", `/admin/users/${id}/block`, { reason }),
  unblockUser: (id: string) => req("POST", `/admin/users/${id}/unblock`),
  adjustBalance: (id: string, amount: number, reason: string) => req("POST", `/admin/users/${id}/adjust-balance`, { amount, reason }),
  setLimits: (id: string, limits: { maxPurchasesPerMin?: number; maxBalance?: number; isRestricted?: boolean }) =>
    req<{ success: boolean; limits: Record<string, unknown> }>("POST", `/admin/users/${id}/set-limits`, limits),
  resetPassword: (id: string) => req<{ success: boolean; newPassword: string; message: string }>("POST", `/admin/users/${id}/reset-password`),
  forceLogout: (id: string) => req<{ success: boolean; message: string }>("POST", `/admin/users/${id}/force-logout`),
  deleteUser: (id: string) => req("DELETE", `/admin/users/${id}`),
  promoteUser: (id: string) => req("POST", `/admin/users/${id}/promote`),
  demoteUser: (id: string) => req("POST", `/admin/users/${id}/demote`),

  getOrders: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return req<{ orders: AdminOrder[]; total: number }>("GET", `/admin/orders?${q}`);
  },
  cancelOrder: (id: string) => req("POST", `/admin/orders/${id}/cancel`),

  getTransactions: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return req<{ transactions: AdminTransaction[]; total: number }>("GET", `/admin/transactions?${q}`);
  },

  getServices: () => req<AdminService[]>("GET", "/admin/services"),
  createService: (data: Partial<AdminService> & { name: string; slug: string }) => req<AdminService>("POST", "/admin/services", data),
  updateService: (id: string, data: Partial<AdminService>) => req("PUT", `/admin/services/${id}`, data),
  deleteService: (id: string) => req("DELETE", `/admin/services/${id}`),

  getCountries: () => req<AdminCountry[]>("GET", "/admin/countries"),
  updateCountry: (id: string, data: Partial<AdminCountry>) => req("PUT", `/admin/countries/${id}`, data),
  seedAfricanCountries: () => req<{ success: boolean; inserted: number; updated: number; total: number }>("POST", "/admin/countries/seed-africa"),
  seedWorldCountries: () => req<{ success: boolean; inserted: number; updated: number; total: number }>("POST", "/admin/countries/seed-world"),

  getPaymentMethods: () => req<AdminPaymentMethod[]>("GET", "/admin/payment-methods"),
  createPaymentMethod: (data: Partial<AdminPaymentMethod>) => req<AdminPaymentMethod>("POST", "/admin/payment-methods", data),
  updatePaymentMethod: (id: string, data: Partial<AdminPaymentMethod>) => req("PUT", `/admin/payment-methods/${id}`, data),
  deletePaymentMethod: (id: string) => req("DELETE", `/admin/payment-methods/${id}`),

  getPaymentConfigs: () => req<PaymentConfigData>("GET", "/admin/payment-configs"),
  updatePaymentConfig: (data: { countryCode: string; methodSlug: string; enabled: boolean; minDeposit: number; feePercent: number }) =>
    req("PUT", "/admin/payment-configs", data),
  addDepositCountry: (countryCode: string) =>
    req<{ success: boolean; country: { code: string; name: string }; inserted: number; total: number }>("POST", "/admin/payment-configs/add-country", { countryCode }),

  getProviders: () => req<ApiProvider[]>("GET", "/admin/api-providers"),
  createProvider: (data: Partial<ApiProvider>) => req<ApiProvider>("POST", "/admin/api-providers", data),
  updateProvider: (id: string, data: Partial<ApiProvider>) => req("PUT", `/admin/api-providers/${id}`, data),
  deleteProvider: (id: string) => req("DELETE", `/admin/api-providers/${id}`),
  testProvider: (id: string) => req<ProviderTestResult>("POST", `/admin/api-providers/${id}/test`),
  getProviderBalance: (id: string) => req<{ balance: number; currency: string } | null>("GET", `/admin/api-providers/${id}/balance`),
  syncProviderProducts: (id: string) => req<{ synced: number; added: number; updated: number; total: number; message: string }>("POST", `/admin/api-providers/${id}/sync-products`),
  getSyncStatus: () => req<{ lastSync: string | null; status: string | null }>("GET", "/admin/api-providers/sync-status"),

  bulkEnableServices: (slugs: string[], markPopular?: string[]) =>
    req<{ enabled: number; message: string }>("POST", "/admin/services/bulk-enable", { slugs, markPopular }),
  bulkDisableServices: (slugs: string[]) =>
    req<{ disabled: number; message: string }>("POST", "/admin/services/bulk-disable", { slugs }),

  getSettings: () => req<Record<string, string>>("GET", "/admin/settings"),
  updateSettings: (data: Record<string, string>) => req("PUT", "/admin/settings", data),
  testEmail: (email: string) => req<{ success: boolean; message: string; latencyMs?: number; id?: string; error?: string }>("POST", "/admin/emails/test", { email }),
  getPendingPawaPayDeposits: () => req<Array<{
    id: string;
    externalDepositId: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
    userId: string;
    userFullName: string;
    userPhone: string;
  }>>("GET", "/admin/pawapay/pending-deposits"),
  simulatePawaPayDeposit: (depositId: string, status: "COMPLETED" | "FAILED", depositedAmount?: string) =>
    req<{ success: boolean; message: string; depositId?: string; userId?: string; amount?: number; status?: string }>(
      "POST", "/admin/pawapay/simulate-deposit", { depositId, status, depositedAmount }
    ),
  testPawaPay: (token?: string, env?: string) => req<{
    success: boolean;
    message: string;
    latencyMs?: number;
    env?: string;
    activeCount?: number;
    totalCount?: number;
    operators?: { name: string; country: string; currency: string }[];
  }>("POST", "/admin/pawapay/test", { token, env }),

  /* ── Clapay ── */
  testClapay: (token?: string, baseUrl?: string) => req<{
    success: boolean;
    message: string;
    latencyMs?: number;
    countryCount?: number;
    countries?: { code: string; name: string; currency: string }[];
  }>("POST", "/admin/clapay/test", { token, baseUrl }),
  getPendingClapayDeposits: () => req<Array<{
    id: string;
    externalDepositId: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
    userId: string;
    userFullName: string;
    userPhone: string;
  }>>("GET", "/admin/clapay/pending-deposits"),
  simulateClapayDeposit: (depositId: string, status: "COMPLETED" | "FAILED", depositedAmount?: string) =>
    req<{ success: boolean; message: string; depositId?: string; userId?: string; amount?: number; status?: string }>(
      "POST", "/admin/clapay/simulate-deposit", { depositId, status, depositedAmount }
    ),

  /* ── Currencies & FX ── */
  getCurrencies: () => req<AdminCurrency[]>("GET", "/admin/currencies"),
  createCurrency: (data: { countryCode: string; currencyCode: string; currencyName: string; realRate: number; clientRate: number; active?: boolean }) =>
    req<AdminCurrency>("POST", "/admin/currencies", data),
  updateCurrency: (id: number, data: Partial<{ countryCode: string; currencyCode: string; currencyName: string; realRate: number; clientRate: number; active: boolean }>) =>
    req<AdminCurrency>("PUT", `/admin/currencies/${id}`, data),
  deleteCurrency: (id: number) => req("DELETE", `/admin/currencies/${id}`),
  getFxProfits: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return req<{ profits: AdminFxProfit[]; total: number }>("GET", `/admin/fx-profits?${q}`);
  },
  getFxSummary: () => req<AdminFxSummary>("GET", "/admin/fx-profits/summary"),

  getSecurityEvents: (severity?: string) => {
    const q = severity ? `?severity=${severity}` : "";
    return req<SecurityEvent[]>("GET", `/admin/security-events${q}`);
  },
  getLogs: () => req<AdminLogEntry[]>("GET", "/admin/logs"),

  /* ── Support IA ── */
  getSupportStats: () => req<SupportStats>("GET", "/admin/support/stats"),
  getSupportConversations: (params?: { limit?: number; offset?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    if (params?.status) q.set("status", params.status);
    return req<{ conversations: SupportConversation[]; total: number }>("GET", `/admin/support/conversations?${q}`);
  },
  getSupportMessages: (convId: string) => req<{ messages: SupportMessage[] }>("GET", `/admin/support/conversations/${convId}/messages`),
  sendSupportMessage: (convId: string, content: string, imageData?: string) =>
    req<{ message: SupportMessage }>("POST", `/admin/support/conversations/${convId}/messages`, { content, imageData }),
  updateConversationStatus: (convId: string, data: { status?: string; isHumanTakeover?: boolean; agentNote?: string; priority?: string }) =>
    req("PUT", `/admin/support/conversations/${convId}/status`, data),
  deleteConversation: (convId: string) => req("DELETE", `/admin/support/conversations/${convId}`),
  getKnowledge: (category?: string) => {
    const q = category ? `?category=${encodeURIComponent(category)}` : "";
    return req<KnowledgeEntry[]>("GET", `/admin/support/knowledge${q}`);
  },
  createKnowledge: (data: { category: string; title: string; content: string; isActive?: boolean; sortOrder?: number }) =>
    req<KnowledgeEntry>("POST", "/admin/support/knowledge", data),
  updateKnowledge: (id: string, data: Partial<KnowledgeEntry>) => req<KnowledgeEntry>("PUT", `/admin/support/knowledge/${id}`, data),
  deleteKnowledge: (id: string) => req("DELETE", `/admin/support/knowledge/${id}`),
  getAiConfig: () => req<AiConfigEntry[]>("GET", "/admin/support/config"),
  getRealtimeData: () => req<RealtimeData>("GET", "/admin/realtime"),
  updateAiConfig: (data: Record<string, string>) => req("PUT", "/admin/support/config", data),

  /* ── Notifications ── */
  sendNotification: (data: {
    title: string;
    body: string;
    type?: string;
    icon?: string;
    link?: string;
    recipientsType?: "all" | "specific";
    userIds?: string[];
    metadata?: Record<string, unknown>;
  }) => req<{ created: number; notifications: unknown[] }>("POST", "/admin/notifications", data),
  getAdminNotifications: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return req<{ notifications: unknown[]; total: number }>("GET", `/admin/notifications?${q}`);
  },
  getNotificationStats: () => req<{ total: number; global: number; targeted: number }>("GET", "/admin/notifications/stats"),
  deleteNotification: (id: string) => req("DELETE", `/admin/notifications/${id}`),

  /* ── Email Campaigns ── */
  sendEmailCampaign: (data: {
    subject: string;
    body?: string;
    htmlContent?: string;
    templateType?: string;
    recipientsType?: "all" | "specific";
    userIds?: string[];
  }) => req<{ campaignId: string; totalRecipients: number; message: string }>("POST", "/admin/emails/send", data),
  getEmailCampaigns: (params?: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return req<{ campaigns: unknown[]; total: number }>("GET", `/admin/emails/campaigns?${q}`);
  },
  getEmailCampaignLogs: (campaignId: string) =>
    req<{ logs: unknown[] }>("GET", `/admin/emails/campaigns/${campaignId}/logs`),
  getEmailStats: () =>
    req<{ totalCampaigns: number; totalSent: number; totalFailed: number; resendConfigured: boolean }>("GET", "/admin/emails/stats"),
  getEmailRecipients: (params?: { search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    return req<{ recipients: Array<{ id: string; fullName: string; email: string; phone?: string; status: string }>; total: number }>(
      "GET", `/admin/emails/recipients?${q}`
    );
  },

  /* ── Blacklist ── */
  getBlacklist: () => req<BlacklistEntry[]>("GET", "/admin/blacklist"),
  addBlacklist: (data: { type: string; value: string; reason?: string; permanent?: boolean; expiresAt?: string }) =>
    req<BlacklistEntry>("POST", "/admin/blacklist", data),
  removeBlacklist: (id: string) => req("DELETE", `/admin/blacklist/${id}`),
  checkBlacklist: (value: string) => req<{ banned: boolean; entries: BlacklistEntry[] }>("GET", `/admin/blacklist/check?value=${encodeURIComponent(value)}`),

  /* ── Login History / IP Tracker ── */
  getLoginHistory: (params?: { userId?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set("userId", params.userId);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    return req<{ entries: LoginHistoryEntry[]; total: number }>("GET", `/admin/login-history?${q}`);
  },
  getLoginHistoryStats: () => req<LoginHistoryStats>("GET", "/admin/login-history/stats"),

  /* ── Live Prices (5sim) ── */
  getLivePrices: (service?: string) => {
    const q = service ? `?service=${encodeURIComponent(service)}` : "";
    return req<{ data: LivePriceCountry[]; markup: number; providerName: string; generatedAt: string }>("GET", `/admin/live-prices${q}`);
  },
  getLivePriceServices: () => req<{ services: LivePriceService[]; markup: number; total: number; country: string }>("GET", "/admin/live-prices/services"),

  /* ── Site Content ── */
  getSiteContent: () => req<Record<string, string>>("GET", "/admin/site-content"),
  updateSiteContent: (data: Record<string, string>) => req("PUT", "/admin/site-content", data),

  /* ── Service Prices (per country) ── */
  getServicePrices: () => req<ServicePrice[]>("GET", "/admin/service-prices"),
  getServicePricesBySlug: (serviceSlug: string) =>
    req<ServicePrice[]>("GET", `/admin/service-prices?serviceSlug=${encodeURIComponent(serviceSlug)}`),
  upsertServicePrice: (data: { countryCode: string; serviceSlug: string; price: number; enabled?: boolean }) =>
    req<ServicePrice>("POST", "/admin/service-prices", data),
  bulkUpsertServicePrices: (prices: Array<{ countryCode: string; serviceSlug: string; price: number; enabled: boolean }>) =>
    req<{ updated: number; prices: ServicePrice[] }>("POST", "/admin/service-prices/bulk", { prices }),
  updateServicePrice: (id: string, data: { price?: number; enabled?: boolean }) =>
    req<ServicePrice>("PUT", `/admin/service-prices/${id}`, data),
  deleteServicePrice: (id: string) => req("DELETE", `/admin/service-prices/${id}`),

  /* ── 5sim Sync Dashboard ── */
  getSyncDashboard: () => req<SyncStatus>("GET", "/admin/sync/status"),
  syncServices: () => req<SyncServiceResult>("POST", "/admin/sync/services"),
  syncCountries: () => req<SyncCountryResult>("POST", "/admin/sync/countries"),
  syncFull: () => req<SyncFullResult>("POST", "/admin/sync/full"),
  getSyncLogs: () => req<SyncLogEntry[]>("GET", "/admin/sync/logs"),
};

export interface AdminStats {
  totalUsers: number;
  totalNumbers: number;
  totalTransactions: number;
  totalRevenueFcfa: number;
  monthlyRevenueFcfa: number;
  newUsersToday: number;
  weeklyTransactions: number;
  blockedUsers: number;
  restrictedUsers: number;
  criticalEventsThisWeek: number;
  activeNumbers: number;
  totalProviders: number;
  activeProviders: number;
}

export interface AdminAnalytics {
  dailyRevenue: Array<{ date: string; revenue: number; orders: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topCountries: Array<{ name: string; flag: string; count: number }>;
  txBreakdown: { recharge: number; purchase: number; refund: number };
  userGrowth: Array<{ date: string; newUsers: number }>;
  totalRevenue30d: number;
  totalOrders30d: number;
  avgOrderValue: number;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  balance?: number;
  details?: Record<string, unknown>;
}

export interface AdminUser {
  id: string;
  fullName: string;
  username?: string;
  phone: string;
  email: string;
  country?: string;
  balance: number;
  status: string;
  riskScore: number;
  isAdmin: boolean;
  verified: boolean;
  isRestricted: boolean;
  maxPurchasesPerMin: number;
  maxBalance: number;
  createdAt: string;
}

export interface AdminUserDetail {
  user: AdminUser & { blockedReason?: string };
  numbers: AdminOrder[];
  transactions: AdminTransaction[];
  securityEvents: SecurityEvent[];
}

export interface AdminOrder {
  id: string;
  phoneNumber: string;
  status: string;
  price: number;
  expiresAt: string;
  createdAt: string;
  userId: string;
  userFullName: string;
  userPhone: string;
  serviceName: string;
  countryName: string;
  countryFlag: string;
}

export interface AdminTransaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  method?: string;
  description?: string;
  createdAt: string;
  userFullName: string;
  userPhone: string;
}

export interface AdminService {
  id: string;
  name: string;
  slug: string;
  scope: string;
  price: number;
  providerPrice: number;
  margin: number;
  available: number;
  color: string;
  category: string;
  popular: boolean;
  enabled: boolean;
  logoUrl?: string | null;
}

export interface AdminCountry {
  id: string;
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  available: number;
  price: number;
  popular: boolean;
}

export interface AdminPaymentMethod {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  logoUrl?: string | null;
  recommended: boolean;
  sortOrder: number;
}

export interface PaymentConfig {
  id: string;
  countryCode: string;
  methodSlug: string;
  enabled: boolean;
  minDeposit: number;
  feePercent: number;
}

export interface PaymentConfigData {
  configs: PaymentConfig[];
  countries: { code: string; name: string; flag: string }[];
  methods: AdminPaymentMethod[];
}

export interface ApiProvider {
  id: string;
  name: string;
  slug: string;
  apiKey: string;
  baseUrl: string;
  active: boolean;
  priority: number;
  markup: number;
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  userId?: string;
  eventType: string;
  severity: string;
  ip?: string;
  details?: unknown;
  riskScore?: number;
  createdAt: string;
}

export interface AdminLogEntry {
  id: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: unknown;
  ip?: string;
  createdAt: string;
  adminName?: string;
}

export interface SupportStats {
  totalConversations: number;
  activeConversations: number;
  takeoverConversations: number;
  resolvedConversations: number;
  weeklyConversations: number;
  dailyConversations: number;
  totalMessages: number;
  adminMessages: number;
  knowledgeEntries: number;
  activeKnowledgeEntries: number;
}

export interface SupportConversation {
  id: string;
  sessionId: string;
  status: string;
  language: string;
  userName?: string;
  userEmail?: string;
  isHumanTakeover: boolean;
  priority: string;
  agentNote?: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  userFullName?: string;
  userPhone?: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  imageData?: string;
  sentByAdmin: boolean;
  createdAt: string;
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiConfigEntry {
  key: string;
  value: string;
  label: string;
  group: string;
}

export interface RealtimeSms {
  id: string;
  sender: string;
  body: string;
  code: string;
  receivedAt: string;
  phoneNumber: string | null;
  numberId: string;
  serviceName: string | null;
  userPhone: string | null;
  userFullName: string | null;
}

export interface RealtimeActiveNumber {
  id: string;
  phoneNumber: string;
  status: string;
  price: number;
  expiresAt: string;
  createdAt: string;
  serviceName: string | null;
  countryName: string | null;
  countryFlag: string | null;
  userPhone: string | null;
  userFullName: string | null;
}

export interface BlacklistEntry {
  id: string;
  type: string;
  value: string;
  reason: string;
  bannedBy?: string | null;
  permanent: boolean;
  expiresAt?: string | null;
  createdAt: string;
}

export interface LoginHistoryEntry {
  id: string;
  userId?: string | null;
  ip?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  isp?: string | null;
  userAgent?: string | null;
  deviceType?: string | null;
  success: string;
  failReason?: string | null;
  createdAt: string;
  userFullName?: string | null;
  userPhone?: string | null;
  userEmail?: string | null;
}

export interface LoginHistoryStats {
  total: number;
  today: number;
  failedThisWeek: number;
  topIps: { ip: string | null; c: number }[];
  topCountries: { country: string | null; c: number }[];
}

export interface LivePriceService {
  slug: string;
  name: string;
  qty: number;
  priceUsd: number;
  priceFcfa: number;
  priceWithMarkup: number;
  margin: number;
}

export interface LivePriceCountry {
  code: string;
  label: string;
  flag: string;
  service?: string;
  available?: boolean;
  qty?: number;
  priceUsd?: number;
  priceFcfa?: number;
  priceWithMarkup?: number;
  markup?: number;
  products?: { name: string; qty: number; priceUsd: number; priceFcfa: number; priceWithMarkup: number }[];
  error?: string;
}

export interface ServicePrice {
  id: string;
  countryCode: string;
  serviceSlug: string;
  price: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RealtimeData {
  recentSms: RealtimeSms[];
  activeNumbers: RealtimeActiveNumber[];
  revenue: {
    today: number;
    week: number;
    month: number;
    total: number;
  };
  smsToday: number;
  ordersToday: number;
  activeNumbersCount: number;
  hourlySms: { hour: string; count: number }[];
  generatedAt: string;
}

/* ── 5sim Sync ── */
export interface SyncLogEntry {
  id:          string;
  type:        "full" | "services" | "countries";
  triggeredBy: "scheduler" | "admin";
  startedAt:   string;
  completedAt: string;
  durationMs:  number;
  status:      "success" | "partial" | "failed";
  services?: {
    added:    number;
    updated:  number;
    skipped:  number;
    total:    number;
    priceProtected: number;
    countryErrors:  number;
  };
  countries?: {
    added:   number;
    updated: number;
    total:   number;
  };
  errors: string[];
}

export interface SyncStatus {
  inProgress:        boolean;
  lastServicesSync:  string | null;
  lastServiceStatus: string | null;
  lastCountriesSync: string | null;
  lastCountryStatus: string | null;
  stats: {
    totalServices:    number;
    enabledServices:  number;
    totalCountries:   number;
    priceProtected:   number;
    customPriceRules: number;
  };
  logs: SyncLogEntry[];
  generatedAt: string;
}

export interface SyncServiceResult {
  success:       boolean;
  message:       string;
  added:         number;
  updated:       number;
  skipped:       number;
  total:         number;
  priceProtected: number;
  countryErrors:  number;
  error?:         string;
}

export interface SyncCountryResult {
  success: boolean;
  message: string;
  added:   number;
  updated: number;
  total:   number;
  error?:  string;
}

export interface SyncFullResult {
  success:   boolean;
  message:   string;
  services:  { added: number; updated: number; skipped: number; total: number; priceProtected: number; countryErrors: number };
  countries: { added: number; updated: number; total: number };
  error?:    string;
}

/* ── Currencies & FX ── */
export interface AdminCurrency {
  id:           number;
  countryCode:  string;
  currencyCode: string;
  currencyName: string;
  realRate:     number;
  clientRate:   number;
  active:       boolean;
  updatedAt:    string;
}

export interface AdminFxProfit {
  id:            number;
  transactionId: string | null;
  currency:      string;
  localAmount:   number;
  realRate:      number;
  clientRate:    number;
  amountXof:     number;
  profitXof:     number;
  status:        string;
  createdAt:     string;
}

export interface AdminFxSummary {
  global: {
    totalProfit:      number;
    totalVolume:      number;
    transactionCount: number;
  };
  byCurrency: {
    currency:         string;
    totalProfit:      number;
    totalVolume:      number;
    totalLocalVolume: number;
    transactionCount: number;
  }[];
}
