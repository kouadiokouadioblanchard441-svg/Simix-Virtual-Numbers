interface SimixLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export function SimixLogo({ size = 32, showText = true, className = "" }: SimixLogoProps) {
  const uid = `simix-g-${size}`;
  const textSize = Math.round(size * 0.75);

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Simix"
      >
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="60%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#7C3AED" floodOpacity="0.4" />
          </filter>
        </defs>
        <rect
          width="40"
          height="40"
          rx="10"
          fill={`url(#${uid})`}
          filter={`url(#${uid}-shadow)`}
        />
        <path
          d="M27.5 12.5 C27.5 8.5 12.5 8.5 12.5 16.5 C12.5 20.5 27.5 19.5 27.5 23.5 C27.5 31.5 12.5 31.5 12.5 27.5"
          stroke="white"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {showText && (
        <span
          className="font-extrabold tracking-tight text-white leading-none"
          style={{ fontSize: textSize }}
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
