const EXPIRY_KEY = "simix_admin_jwt_exp";
const LEGACY_TOKEN_KEY = "simix_admin_jwt";

function removeLegacyToken(): void {
  try {
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* Storage is only a UI hint; server authentication uses an HttpOnly cookie. */
  }
}

if (typeof window !== "undefined") removeLegacyToken();

export const adminToken = {
  setExpiry(expiresAt: number): void {
    removeLegacyToken();
    sessionStorage.setItem(EXPIRY_KEY, String(expiresAt));
  },

  clear(): void {
    removeLegacyToken();
    sessionStorage.removeItem(EXPIRY_KEY);
  },

  isExpired(): boolean {
    const exp = sessionStorage.getItem(EXPIRY_KEY);
    if (!exp) return true;
    return Date.now() > parseInt(exp, 10) * 1000;
  },

  isValid(): boolean {
    removeLegacyToken();
    if (this.isExpired()) {
      this.clear();
      return false;
    }
    return true;
  },

  getSecondsRemaining(): number {
    const exp = sessionStorage.getItem(EXPIRY_KEY);
    if (!exp) return 0;
    return Math.max(0, Math.floor((parseInt(exp, 10) * 1000 - Date.now()) / 1000));
  },
};
