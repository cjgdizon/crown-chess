interface ChessLogoProps {
  size?: 'sm' | 'lg';
  showSubtitle?: boolean;
}

export function ChessLogo({ size = 'sm', showSubtitle = false }: ChessLogoProps) {
  const isLarge = size === 'lg';
  const tileSize = isLarge ? 'h-12 w-12 rounded-2xl' : 'h-8 w-8 rounded-lg';
  const svgSize = isLarge ? 'h-7 w-7' : 'h-5 w-5';

  return (
    <div className="inline-flex items-center gap-3 select-none">
      <div
        className={`${tileSize} relative flex shrink-0 items-center justify-center border border-[var(--border-strong)] bg-[#14171D] shadow-[var(--shadow-card)]`}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background:
              'linear-gradient(145deg, rgba(16, 185, 129, 0.22) 0%, rgba(16, 185, 129, 0) 56%, rgba(245, 158, 11, 0.16) 100%)',
          }}
        />
        <svg
          viewBox="0 0 36 36"
          fill="none"
          aria-hidden="true"
          className={`${svgSize} relative z-10`}
        >
          <path
            d="M18 4.25V9.25M15.75 6.5H20.25"
            stroke="#10B981"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <path
            d="M6.5 25.5L5.25 13.5L12.5 18.25L18 10.75L23.5 18.25L30.75 13.5L29.5 25.5H6.5Z"
            fill="#F3F4F6"
            stroke="#F3F4F6"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect x="7" y="28.25" width="22" height="3.25" rx="1.5" fill="#F59E0B" />
          <circle cx="5.25" cy="12" r="1.5" fill="#F3F4F6" />
          <circle cx="30.75" cy="12" r="1.5" fill="#F3F4F6" />
        </svg>
      </div>

      <div className="flex flex-col leading-none">
        <span
          className={
            isLarge
              ? 'text-2xl font-semibold tracking-[0.22em] text-[var(--text-primary)]'
              : 'text-sm font-semibold tracking-[0.2em] text-[var(--text-primary)]'
          }
        >
          CROWN
        </span>
        {showSubtitle && (
          <span
            className={
              isLarge
                ? 'mt-1.5 text-xs font-medium tracking-[0.16em] text-[var(--text-secondary)] uppercase'
                : 'mt-0.5 text-[10px] font-medium tracking-[0.14em] text-[var(--text-secondary)] uppercase'
            }
          >
            Modern Chess
          </span>
        )}
      </div>
    </div>
  );
}
