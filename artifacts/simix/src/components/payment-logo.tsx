import { useState } from "react";

/* ─── Local logo assets map (slug → path in /public/logos/) ─── */
const LOGO_ASSETS: Record<string, string> = {
  orange_money:  "/logos/orange-money.svg",
  mtn_money:     "/logos/mtn-mobile-money.png",
  wave:          "/logos/wave.svg",
  moov_money:    "/logos/moov-money.png",
  free_money:    "/logos/free-money.svg",
  airtel_money:  "/logos/airtel-money.svg",
  mpesa:         "/logos/m-pesa.svg",
  vodacom_mpesa: "/logos/vodacom-mpesa.svg",
  zamtel:        "/logos/zamtel-kwacha.png",
  flooz:         "/logos/flooz.svg",
  tmoney:        "/logos/tmoney.svg",
  mvola:         "/logos/mvola.png",
  econet:        "/logos/ecocash.png",
};

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
  const [primaryErr, setPrimaryErr] = useState(false);
  const [fallbackErr, setFallbackErr] = useState(false);

  const primary = logoUrl && !primaryErr ? logoUrl : null;
  const local   = !primary && LOGO_ASSETS[slug] && !fallbackErr ? LOGO_ASSETS[slug] : null;

  const wrapStyle = {
    width:           size,
    height:          size,
    borderRadius:    Math.round(size * 0.24),
    backgroundColor: color + "22",
    flexShrink:      0,
  } as const;

  if (primary) {
    return (
      <div className="flex items-center justify-center shadow-lg overflow-hidden" style={wrapStyle}>
        <img
          src={primary}
          alt={name}
          onError={() => setPrimaryErr(true)}
          className="object-contain"
          style={{ width: size * 0.9, height: size * 0.9 }}
        />
      </div>
    );
  }

  if (local) {
    return (
      <div className="flex items-center justify-center shadow-lg overflow-hidden" style={wrapStyle}>
        <img
          src={local}
          alt={name}
          onError={() => setFallbackErr(true)}
          className="object-contain"
          style={{ width: size * 0.9, height: size * 0.9 }}
        />
      </div>
    );
  }

  return <GenericLogo name={name} color={color} size={size} />;
}
