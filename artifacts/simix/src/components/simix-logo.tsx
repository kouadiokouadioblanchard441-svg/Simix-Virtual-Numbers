interface SimixLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function SimixLogo({ size = 32, showText = true, className = "" }: SimixLogoProps) {
  const uid = `simix-${size}`;
  const textSize = Math.round(size * 0.78);

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Simix"
        style={{ flexShrink: 0 }}
      >
        <defs>
          {/* Background: deep violet */}
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#5B21B6" />
            <stop offset="55%"  stopColor="#4316A0" />
            <stop offset="100%" stopColor="#2E0D7A" />
          </linearGradient>

          {/* Subtle inner edge highlight */}
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* S letter: blue → cyan gradient (top-to-bottom) */}
          <linearGradient id={`${uid}-s`} x1="20" y1="8" x2="20" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#BAD7FF" />
            <stop offset="35%"  stopColor="#7EB8FF" />
            <stop offset="70%"  stopColor="#38BADC" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>

          {/* Outer glow behind icon */}
          <filter id={`${uid}-drop`} x="-35%" y="-35%" width="170%" height="170%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#6D28D9" floodOpacity="0.55" />
          </filter>

          {/* Soft glow around S */}
          <filter id={`${uid}-sglow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Rounded square background */}
        <rect width="40" height="40" rx="10" fill={`url(#${uid}-bg)`} filter={`url(#${uid}-drop)`} />

        {/* Shine overlay (top half lighter) */}
        <rect width="40" height="40" rx="10" fill={`url(#${uid}-shine)`} />

        {/* Very subtle border highlight */}
        <rect width="40" height="40" rx="10" stroke="white" strokeOpacity="0.12" strokeWidth="0.8" fill="none" />

        {/* S letter */}
        <path
          d="M26.5 13.5 C26.5 9.5 13.5 9 13.5 16.2 C13.5 20.2 26.5 20.5 26.5 24.2 C26.5 31 13.5 30.5 13.5 27"
          stroke={`url(#${uid}-s)`}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter={`url(#${uid}-sglow)`}
        />
      </svg>

      {showText && (
        <span
          style={{
            fontSize: textSize,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            background: "linear-gradient(125deg, #ffffff 0%, #dde8ff 35%, #c4b5fd 80%, #a78bfa 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          imix
        </span>
      )}
    </div>
  );
}

export function SimixIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <SimixLogo size={size} showText={false} className={className} />;
}
