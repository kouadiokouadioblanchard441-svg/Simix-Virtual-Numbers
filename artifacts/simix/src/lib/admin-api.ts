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

  getProviders: () => req<ApiProvider[]>("GET", "/admin/api-providers"),
  createProvider: (data: Partial<ApiProvider>) => req<ApiProvider>("POST", "/admin/api-providers", data),
  updateProvider: (id: string, data: Partial<ApiProvider>) => req("PUT", `/admin/api-providers/${id}`, data),
  deleteProvider: (id: string) => req("DELETE", `/admin/api-providers/${id}`),

  getSettings: () => req<Record<string, string>>("GET", "/admin/settings"),
  updateSettings: (data: Record<string, string>) => req("PUT", "/admin/settings", data),

  getSecurityEvents: (severity?: string) => {
    const q = severity ? `?severity=${severity}` : "";
    return req<SecurityEvent[]>("GET", `/admin/security-events${q}`);
  },
  getLogs: () => req<AdminLogEntry[]>("GET", "/admin/logs"),
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
  criticalEventsThisWeek: number;
  activeNumbers: number;
  totalProviders: number;
  activeProviders: number;
}

export interface AdminUser {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  balance: number;
  status: string;
  riskScore: number;
  isAdmin: boolean;
  verified: boolean;
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
  available: number;
  color: string;
  category: string;
  popular: boolean;
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
