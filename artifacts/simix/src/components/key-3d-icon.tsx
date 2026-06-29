export function Key3DIcon({ size = 36 }: { size?: number }) {
  const id = "k3d";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Metallic gold gradient — top bright → bottom shadow */}
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFF3A3" />
          <stop offset="18%"  stopColor="#FFD94C" />
          <stop offset="55%"  stopColor="#D4900A" />
          <stop offset="100%" stopColor="#8B5A00" />
        </linearGradient>

        {/* Side-lit gradient for the ring face */}
        <radialGradient id={`${id}-ring`} cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stopColor="#FFF5B0" />
          <stop offset="40%"  stopColor="#FFD040" />
          <stop offset="80%"  stopColor="#C07800" />
          <stop offset="100%" stopColor="#7A4A00" />
        </radialGradient>

        {/* Blade face gradient — left-lit */}
        <linearGradient id={`${id}-blade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE86A" />
          <stop offset="40%"  stopColor="#FFBC1A" />
          <stop offset="100%" stopColor="#8B5A00" />
        </linearGradient>

        {/* Tooth gradient */}
        <linearGradient id={`${id}-tooth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#D4900A" />
          <stop offset="100%" stopColor="#5C3500" />
        </linearGradient>

        {/* Side face gradient (3-D bevel on bottom of blade) */}
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6B3D00" />
          <stop offset="100%" stopColor="#3D2000" />
        </linearGradient>

        {/* Drop shadow filter */}
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.55" />
        </filter>

        {/* Ring inner hole — dark with subtle glint */}
        <radialGradient id={`${id}-hole`} cx="40%" cy="35%" r="60%">
          <stop offset="0%"   stopColor="#1a1025" />
          <stop offset="100%" stopColor="#0d0a1a" />
        </radialGradient>

        {/* Specular glint on ring */}
        <radialGradient id={`${id}-glint`} cx="30%" cy="25%" r="50%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#${id}-shadow)`}>
        {/* ── RING (bow of the key) ── */}
        {/* Outer ring face */}
        <circle cx="28" cy="28" r="19" fill={`url(#${id}-ring)`} />
        {/* Bevel bottom edge of ring (3-D thickness illusion) */}
        <circle cx="29" cy="30" r="19" fill="#6B3D00" opacity="0.35" />
        {/* Inner hole */}
        <circle cx="28" cy="28" r="10" fill={`url(#${id}-hole)`} />
        {/* Inner hole rim highlight */}
        <circle cx="28" cy="28" r="10" stroke="#C07800" strokeWidth="1" fill="none" opacity="0.5" />

        {/* ── BLADE (shank) ── */}
        {/* Main blade face */}
        <rect x="45" y="22" width="30" height="12" rx="3" fill={`url(#${id}-blade)`} />
        {/* Bottom bevel (3-D thickness) */}
        <rect x="46" y="33" width="29" height="4" rx="2" fill={`url(#${id}-side)`} />
        {/* Right tip bevel */}
        <rect x="72" y="22" width="3" height="12" rx="1.5" fill="#6B3D00" />

        {/* ── TEETH ── */}
        {/* Tooth 1 */}
        <rect x="52" y="34" width="9" height="8" rx="2" fill={`url(#${id}-tooth)`} />
        <rect x="53" y="41" width="8" height="2" rx="1" fill={`url(#${id}-side)`} />

        {/* Tooth 2 */}
        <rect x="65" y="34" width="7" height="6" rx="2" fill={`url(#${id}-tooth)`} />
        <rect x="66" y="39" width="6" height="2" rx="1" fill={`url(#${id}-side)`} />

        {/* ── CONNECTION between ring and blade ── */}
        <rect x="43" y="22" width="8" height="12" fill={`url(#${id}-blade)`} />
        <rect x="44" y="33" width="7" height="4" fill={`url(#${id}-side)`} />
      </g>

      {/* ── SPECULAR HIGHLIGHTS (light source top-left) ── */}
      {/* Ring glint */}
      <circle cx="28" cy="28" r="19" fill={`url(#${id}-glint)`} />
      {/* Blade top-edge shine */}
      <rect x="46" y="22" width="27" height="3" rx="1.5" fill="white" opacity="0.18" />
      {/* Tooth 1 top shine */}
      <rect x="53" y="34" width="7" height="2" rx="1" fill="white" opacity="0.15" />
      {/* Tooth 2 top shine */}
      <rect x="66" y="34" width="5" height="2" rx="1" fill="white" opacity="0.15" />
      {/* Ring highlight crescent */}
      <ellipse cx="21" cy="19" rx="7" ry="4" fill="white" opacity="0.2" transform="rotate(-35 21 19)" />
    </svg>
  );
}
