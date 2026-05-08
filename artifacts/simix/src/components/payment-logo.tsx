import { useState } from "react";

/* ─── Official operator color constants ─── */
export const OPERATOR_COLORS: Record<string, { bg: string; text: string; gradient: string }> = {
  orange_money: { bg: "#FF6600", text: "#fff", gradient: "linear-gradient(135deg,#FF8C00,#FF4500)" },
  mtn_money:    { bg: "#FFCB00", text: "#1a1a1a", gradient: "linear-gradient(135deg,#FFE033,#FFA500)" },
  wave:         { bg: "#1ABCFE", text: "#fff", gradient: "linear-gradient(135deg,#40D0FF,#007BCC)" },
  moov_money:   { bg: "#003087", text: "#fff", gradient: "linear-gradient(135deg,#004FCC,#001A66)" },
  free_money:   { bg: "#E2001A", text: "#fff", gradient: "linear-gradient(135deg,#FF1A1A,#B30000)" },
  mpesa:        { bg: "#00A650", text: "#fff", gradient: "linear-gradient(135deg,#00CC66,#006633)" },
  airtel_money: { bg: "#E40000", text: "#fff", gradient: "linear-gradient(135deg,#FF0000,#990000)" },
};

/* ─── Inline SVG logos for key operators ─── */
function OrangeMoneyLogo({ size }: { size: number }) {
  const r = Math.round(size * 0.24);
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 shadow-lg"
      style={{ width: size, height: size, borderRadius: r, background: "linear-gradient(135deg,#FF8C00,#FF4500)" }}
    >
      <svg viewBox="0 0 100 100" width={size * 0.7} height={size * 0.7}>
        <circle cx="50" cy="50" r="42" fill="rgba(255,255,255,0.15)" />
        <text x="50" y="42" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="28" fill="white">OM</text>
        <text x="50" y="65" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="600" fontSize="13" fill="rgba(255,255,255,0.85)">Money</text>
      </svg>
    </div>
  );
}

function MTNLogo({ size }: { size: number }) {
  const r = Math.round(size * 0.24);
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 shadow-lg"
      style={{ width: size, height: size, borderRadius: r, background: "linear-gradient(135deg,#FFE033,#FFA500)" }}
    >
      <svg viewBox="0 0 100 100" width={size * 0.7} height={size * 0.7}>
        <text x="50" y="48" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="30" fill="#1a1a1a">MTN</text>
        <text x="50" y="68" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="14" fill="#333">MoMo</text>
      </svg>
    </div>
  );
}

function WaveLogo({ size }: { size: number }) {
  const r = Math.round(size * 0.24);
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 shadow-lg"
      style={{ width: size, height: size, borderRadius: r, background: "linear-gradient(135deg,#40D0FF,#007BCC)" }}
    >
      <svg viewBox="0 0 100 100" width={size * 0.7} height={size * 0.7}>
        <path d="M15 55 Q30 30 50 50 Q70 70 85 45" stroke="white" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <text x="50" y="82" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="22" fill="white">wave</text>
      </svg>
    </div>
  );
}

function MoovLogo({ size }: { size: number }) {
  const r = Math.round(size * 0.24);
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 shadow-lg"
      style={{ width: size, height: size, borderRadius: r, background: "linear-gradient(135deg,#004FCC,#001A66)" }}
    >
      <svg viewBox="0 0 100 100" width={size * 0.7} height={size * 0.7}>
        <circle cx="50" cy="42" r="22" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="4"/>
        <text x="50" y="50" textAnchor="middle" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="20" fill="white">M</text>
        <text x="50" y="78" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="14" fill="rgba(255,255,255,0.9)">Moov</text>
      </svg>
    </div>
  );
}

function GenericLogo({ name, color, size }: { name: string; color: string; size: number }) {
  const r = Math.round(size * 0.24);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 shadow-lg font-black text-white"
      style={{ width: size, height: size, borderRadius: r, background: color, fontSize: size * 0.34 }}
    >
      {initials}
    </div>
  );
}

/* ─── Main export: PaymentLogo ─── */
export function PaymentLogo({
  slug,
  name,
  color,
  logoUrl,
  size = 48,
}: {
  slug: string;
  name: string;
  color: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);

  /* Try CDN logo first if available and no prior error */
  if (logoUrl && !imgError) {
    return (
      <div
        className="flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), backgroundColor: color }}
      >
        <img
          src={logoUrl}
          alt={name}
          onError={() => setImgError(true)}
          className="object-contain"
          style={{ width: size * 0.9, height: size * 0.9 }}
        />
      </div>
    );
  }

  /* Built-in SVG logos for key operators */
  if (slug === "orange_money") return <OrangeMoneyLogo size={size} />;
  if (slug === "mtn_money")    return <MTNLogo size={size} />;
  if (slug === "wave")         return <WaveLogo size={size} />;
  if (slug === "moov_money")   return <MoovLogo size={size} />;

  return <GenericLogo name={name} color={color} size={size} />;
}
