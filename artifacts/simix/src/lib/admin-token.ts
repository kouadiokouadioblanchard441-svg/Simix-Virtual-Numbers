const KEY = "simix_admin_jwt";
const EXPIRY_KEY = "simix_admin_jwt_exp";

export const adminToken = {
  get(): string | null {
    return sessionStorage.getItem(KEY);
  },

  set(token: string, expiresAt: number): void {
    sessionStorage.setItem(KEY, token);
    sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
  },

  clear(): void {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  },

  isExpired(): boolean {
    const exp = sessionStorage.getItem(EXPIRY_KEY);
    if (!exp) return true;
    return Date.now() > parseInt(exp, 10) * 1000;
  },

  isValid(): boolean {
    const token = this.get();
    if (!token) return false;
    if (this.isExpired()) {
      this.clear();
      return false;
    }
    return true;
  },

  getHeader(): Record<string, string> {
    const token = this.get();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  },

  getSecondsRemaining(): number {
    const exp = sessionStorage.getItem(EXPIRY_KEY);
    if (!exp) return 0;
    return Math.max(0, Math.floor((parseInt(exp, 10) * 1000 - Date.now()) / 1000));
  },
};
