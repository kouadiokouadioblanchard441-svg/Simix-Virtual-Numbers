import { db, loginHistoryTable } from "@workspace/db";
import { lookupIp } from "./geoip";
import { sendLoginAlert } from "./telegram";

export function notifySuccessfulLogin(
  user: {
    id: string;
    fullName: string;
    phone: string | null;
  },
  ip: string,
  userAgent: string,
): void {
  void (async () => {
    try {
      const deviceType = /mobile|android|iphone|ipad/i.test(userAgent)
        ? "mobile"
        : "desktop";
      const geo = await lookupIp(ip);
      await db.insert(loginHistoryTable).values({
        userId: user.id,
        ip,
        userAgent,
        deviceType,
        country: geo.country ?? null,
        city: geo.city ?? null,
        region: geo.region ?? null,
        isp: geo.isp ?? null,
        success: "true",
      });
      await sendLoginAlert({
        userId: user.id,
        userName: user.fullName,
        userPhone: user.phone,
        ip,
        userAgent,
        geo,
        success: true,
      });
    } catch {
      /* Login history and Telegram alerts must not block authentication. */
    }
  })();
}
