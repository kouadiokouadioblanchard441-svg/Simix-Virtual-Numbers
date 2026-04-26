import { FaWhatsapp, FaTelegram, FaFacebookF, FaGoogle, FaInstagram, FaTiktok, FaSnapchatGhost, FaDiscord, FaApple, FaMicrosoft } from "react-icons/fa";
import { SiX, SiSignal } from "react-icons/si";
import type { ReactNode } from "react";

const brand: Record<string, { Icon: any; bg: string; fg: string }> = {
  whatsapp:  { Icon: FaWhatsapp,       bg: "#25D366", fg: "#FFFFFF" },
  telegram:  { Icon: FaTelegram,       bg: "#229ED9", fg: "#FFFFFF" },
  facebook:  { Icon: FaFacebookF,      bg: "#1877F2", fg: "#FFFFFF" },
  google:    { Icon: FaGoogle,         bg: "#FFFFFF", fg: "#4285F4" },
  instagram: { Icon: FaInstagram,      bg: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF,#515BD4)", fg: "#FFFFFF" },
  twitter:   { Icon: SiX,              bg: "#000000", fg: "#FFFFFF" },
  x:         { Icon: SiX,              bg: "#000000", fg: "#FFFFFF" },
  tiktok:    { Icon: FaTiktok,         bg: "#000000", fg: "#FFFFFF" },
  snapchat:  { Icon: FaSnapchatGhost,  bg: "#FFFC00", fg: "#000000" },
  discord:   { Icon: FaDiscord,        bg: "#5865F2", fg: "#FFFFFF" },
  signal:    { Icon: SiSignal,         bg: "#3A76F0", fg: "#FFFFFF" },
  apple:     { Icon: FaApple,          bg: "#000000", fg: "#FFFFFF" },
  microsoft: { Icon: FaMicrosoft,      bg: "#0078D4", fg: "#FFFFFF" },
};

function keyFor(name: string, slug?: string) {
  const k = (slug || name).toLowerCase().replace(/\s+\/\s+/g, "_").replace(/\s+/g, "_");
  if (brand[k]) return k;
  if (k.includes("whatsapp")) return "whatsapp";
  if (k.includes("telegram")) return "telegram";
  if (k.includes("facebook")) return "facebook";
  if (k.includes("google")) return "google";
  if (k.includes("instagram")) return "instagram";
  if (k.includes("twitter") || k === "x" || k.includes("/x")) return "twitter";
  if (k.includes("tiktok")) return "tiktok";
  if (k.includes("snap")) return "snapchat";
  if (k.includes("discord")) return "discord";
  if (k.includes("signal")) return "signal";
  if (k.includes("apple")) return "apple";
  if (k.includes("microsoft")) return "microsoft";
  return "";
}

export function ServiceIcon({
  name,
  slug,
  size = 48,
  rounded = "xl",
}: {
  name: string;
  slug?: string;
  size?: number;
  rounded?: "lg" | "xl" | "2xl" | "full";
}): ReactNode {
  const k = keyFor(name, slug);
  const entry = brand[k];
  const radius = { lg: 12, xl: 16, "2xl": 20, full: 9999 }[rounded];
  const iconSize = Math.round(size * 0.55);

  if (!entry) {
    return (
      <div
        className="flex items-center justify-center shrink-0 shadow-sm"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: "linear-gradient(135deg,#A855F7,#6366F1)",
        }}
      >
        <span className="text-white font-bold" style={{ fontSize: size * 0.42 }}>
          {name.charAt(0)}
        </span>
      </div>
    );
  }
  const { Icon, bg, fg } = entry;
  return (
    <div
      className="flex items-center justify-center shrink-0 shadow-sm"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
      }}
    >
      <Icon style={{ width: iconSize, height: iconSize, color: fg }} />
    </div>
  );
}
