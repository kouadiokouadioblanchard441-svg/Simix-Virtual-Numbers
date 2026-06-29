export function GmailIcon3D({ size = 44 }: { size?: number }) {
  const id = "gml";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* ── Drop shadow ── */}
        <filter id={`${id}-shadow`} x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
        </filter>

        {/* ── White envelope face ── */}
        <linearGradient id={`${id}-env`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8E8F0" />
        </linearGradient>

        {/* ── Red left column 3D gradient ── */}
        <linearGradient id={`${id}-red`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#D93025" />
          <stop offset="50%"  stopColor="#EA4335" />
          <stop offset="100%" stopColor="#F06B63" />
        </linearGradient>

        {/* ── Red right column 3D gradient ── */}
        <linearGradient id={`${id}-red2`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#F06B63" />
          <stop offset="50%"  stopColor="#EA4335" />
          <stop offset="100%" stopColor="#C5221F" />
        </linearGradient>

        {/* ── Blue left triangle gradient ── */}
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#5E97F6" />
          <stop offset="100%" stopColor="#1A73E8" />
        </linearGradient>

        {/* ── Green right triangle gradient ── */}
        <linearGradient id={`${id}-green`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#57BB8A" />
          <stop offset="100%" stopColor="#1E8E3E" />
        </linearGradient>

        {/* ── Yellow top-right corner gradient ── */}
        <linearGradient id={`${id}-yellow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#FFD666" />
          <stop offset="100%" stopColor="#FBBC05" />
        </linearGradient>

        {/* ── Envelope specular highlight ── */}
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>

        {/* ── Top bevel (3D thickness) ── */}
        <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#CCCCDD" />
          <stop offset="100%" stopColor="#AAAACC" />
        </linearGradient>
      </defs>

      <g filter={`url(#${id}-shadow)`}>

        {/* ── ENVELOPE BODY — white face ── */}
        <rect x="6" y="18" width="76" height="52" rx="6" fill={`url(#${id}-env)`} />

        {/* ── 3-D bevel: top edge ── */}
        <rect x="6" y="18" width="76" height="4" rx="3" fill={`url(#${id}-bevel)`} opacity="0.5" />

        {/* ── LEFT RED COLUMN ── */}
        <rect x="6"  y="18" width="18" height="52" rx="0" fill={`url(#${id}-red)`} />
        <rect x="6"  y="18" width="18" height="52"
              rx="0" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
        {/* left col top-left radius */}
        <path d="M6 24 Q6 18 12 18 L6 18 Z" fill={`url(#${id}-red)`} />

        {/* ── RIGHT RED COLUMN ── */}
        <rect x="64" y="18" width="18" height="52" rx="0" fill={`url(#${id}-red2)`} />
        {/* right col top-right radius */}
        <path d="M82 24 Q82 18 76 18 L82 18 Z" fill={`url(#${id}-red2)`} />

        {/* ── BLUE LOWER-LEFT TRIANGLE ── */}
        <polygon points="6,70 6,18 24,36" fill={`url(#${id}-blue)`} />

        {/* ── GREEN LOWER-RIGHT TRIANGLE ── */}
        <polygon points="82,70 82,18 64,36" fill={`url(#${id}-green)`} />

        {/* ── YELLOW TOP-RIGHT CORNER ── */}
        <polygon points="64,18 82,18 82,36" fill={`url(#${id}-yellow)`} />

        {/* ── THE "M" FOLD — red diagonal lines on white ── */}
        {/* Left diagonal going down-right */}
        <polygon
          points="6,18 44,52 44,52 6,18"
          fill="none"
        />
        {/* Left red diagonal (blue area cover) */}
        <polygon
          points="24,18 44,36 44,52 6,70 6,18"
          fill={`url(#${id}-env)`}
        />
        {/* Right red diagonal (green area cover) */}
        <polygon
          points="64,18 44,36 44,52 82,70 82,18"
          fill={`url(#${id}-env)`}
        />
        {/* Center "M" valley */}
        <polygon
          points="24,18 44,36 64,18"
          fill={`url(#${id}-env)`}
        />

        {/* ── M OUTLINE STROKES for depth ── */}
        <polyline
          points="6,18 44,52 82,18"
          fill="none"
          stroke="rgba(180,180,200,0.35)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* ── BOTTOM FLAP LINE ── */}
        <line x1="6" y1="70" x2="82" y2="70" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
      </g>

      {/* ── SPECULAR OVERLAY ── */}
      <rect x="6" y="18" width="76" height="26" rx="3" fill={`url(#${id}-shine)`} opacity="0.5" />

      {/* ── EDGE HIGHLIGHT (top rim) ── */}
      <line x1="8" y1="19" x2="80" y2="19" stroke="white" strokeWidth="1.5" strokeOpacity="0.6" />
    </svg>
  );
}
