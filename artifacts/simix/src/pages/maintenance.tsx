import { useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function MaintenancePage() {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    await new Promise(r => setTimeout(r, 900));
    window.location.reload();
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* ── Hero illustration ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          aspectRatio: "1 / 1",
          overflow: "hidden",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <img
          src={`${BASE}/maintenance-hero.png`}
          alt="Maintenance"
          style={{
            width: "100%",
            height: "200%",
            objectFit: "cover",
            objectPosition: "top center",
            display: "block",
          }}
          draggable={false}
        />
      </div>

      {/* ── Content card ── */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          padding: "0 24px 48px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Title */}
        <h1
          style={{
            color: "#DC2626",
            fontWeight: 800,
            fontSize: "clamp(18px, 5vw, 22px)",
            textAlign: "center",
            margin: "0 0 12px",
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
          }}
        >
          Le site est actuellement en maintenance.
        </h1>

        {/* Subtitle */}
        <p
          style={{
            color: "#6B7280",
            fontSize: "clamp(13px, 3.5vw, 15px)",
            textAlign: "center",
            margin: "0 0 28px",
            lineHeight: 1.6,
          }}
        >
          Nous effectuons actuellement une intervention technique afin d'améliorer
          la stabilité, les performances et la sécurité de notre plateforme.
          Nos équipes travaillent activement pour rétablir tous les services
          dans les meilleurs délais. Merci de votre patience et de votre compréhension.
        </p>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#E5E7EB", marginBottom: 24 }} />

        {/* Status row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <span style={{ fontWeight: 700, color: "#111827", fontSize: 15 }}>Statut :</span>
          <span
            style={{
              backgroundColor: "#DC2626",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.06em",
              padding: "4px 14px",
              borderRadius: 999,
              textTransform: "uppercase",
            }}
          >
            Maintenance en cours
          </span>
        </div>

        {/* Estimated time row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "2px solid #D1D5DB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <span style={{ color: "#374151", fontSize: 14 }}>
            Disponibilité estimée :{" "}
            <strong style={{ color: "#DC2626", fontWeight: 700 }}>Bientôt disponible</strong>
          </span>
        </div>

        {/* Contact box */}
        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 28,
            backgroundColor: "#FAFAFA",
          }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: "2px solid #BFDBFE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              backgroundColor: "#EFF6FF",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <polyline points="2,4 12,14 22,4" />
            </svg>
          </span>
          <div>
            <div style={{ color: "#6B7280", fontSize: 12, marginBottom: 3 }}>
              Pour toute information, contactez-nous :
            </div>
            <a
              href="mailto:simixsupport@gmail.com"
              style={{
                color: "#2563EB",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              simixsupport@gmail.com
            </a>
          </div>
        </div>

        {/* Retry button */}
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{
            width: "100%",
            backgroundColor: retrying ? "#3B5EAE" : "#1D4ED8",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 16,
            border: "none",
            borderRadius: 14,
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            cursor: retrying ? "default" : "pointer",
            transition: "background-color 0.15s",
            outline: "none",
            WebkitTapHighlightColor: "transparent",
            letterSpacing: "0.01em",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: retrying ? "spin 1s linear infinite" : "none",
            }}
          >
            <polyline points="1 4 1 10 7 10" />
            <polyline points="23 20 23 14 17 14" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          {retrying ? "Vérification…" : "Réessayer"}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        button:hover:not(:disabled) {
          background-color: #1E40AF !important;
        }
        button:active:not(:disabled) {
          background-color: #1E3A8A !important;
          transform: scale(0.99);
        }
      `}</style>
    </div>
  );
}
