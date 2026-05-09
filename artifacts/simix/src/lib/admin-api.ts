const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
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
  updateService: (id: string, data: Partial<AdminService>) => req("PUT", `/admin/services/${id}`, data),

  getCountries: () => req<AdminCountry[]>("GET", "/admin/countries"),
  updateCountry: (id: string, data: Partial<AdminCountry>) => req("PUT", `/admin/countries/${id}`, data),

  getPaymentMethods: () => req<AdminPaymentMethod[]>("GET", "/admin/payment-methods"),
  createPaymentMethod: (data: Partial<AdminPaymentMethod>) => req<AdminPaymentMethod>("POST", "/admin/payment-methods", data),
  updatePaymentMethod: (id: string, data: Partial<AdminPaymentMethod>) => req("PUT", `/admin/payment-methods/${id}`, data),
  deletePaymentMethod: (id: string) => req("DELETE", `/admin/payment-methods/${id}`),

  getPaymentConfigs: () => req<PaymentConfigData>("GET", "/admin/payment-configs"),
  updatePaymentConfig: (data: { countryCode: string; methodSlug: string; enabled: boolean; minDeposit: number; feePercent: number }) =>
    req("PUT", "/admin/payment-configs", data),

  getProviders: () => req<ApiProvider[]>("GET", "/admin/api-providers"),
  createProvider: (data: Partial<ApiProvider>) => req<ApiProvider>("POST", "/admin/api-providers", data),
  updateProvider: (id: string, data: Partial<ApiProvider>) => req("PUT", `/admin/api-providers/${id}`, data),
  deleteProvider: (id: string) => req("DELETE", `/admin/api-providers/${id}`),
  testProvider: (id: string) => req<ProviderTestResult>("POST", `/admin/api-providers/${id}/test`),
  getProviderBalance: (id: string) => req<{ balance: number; currency: string } | null>("GET", `/admin/api-providers/${id}/balance`),
  syncProviderProducts: (id: string) => req<{ synced: number; message: string }>("POST", `/admin/api-providers/${id}/sync-products`),

  getSettings: () => req<Record<string, string>>("GET", "/admin/settings"),
  updateSettings: (data: Record<string, string>) => req("PUT", "/admin/settings", data),

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
  updateAiConfig: (data: Record<string, string>) => req("PUT", "/admin/support/config", data),
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
