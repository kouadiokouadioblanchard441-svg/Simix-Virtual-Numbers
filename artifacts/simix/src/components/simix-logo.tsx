export function SimixLogo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <defs>
          <linearGradient id="simixS" x1="0" y1="0" x2="64" y2="64">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
        </defs>
        <path d="M48 18 C 48 10, 38 6, 28 8 C 14 10, 10 22, 18 28 C 26 34, 50 32, 50 42 C 50 52, 38 58, 26 56 C 16 54, 12 48, 14 42" stroke="url(#simixS)" strokeWidth="9" strokeLinecap="round" fill="none" />
      </svg>
      <span className="font-extrabold tracking-tight text-white" style={{ fontSize: size * 0.95 }}>imix</span>
    </div>
  );
}
