// Minimal inline-SVG icon set for the shinobi UI — no icon-font dependency.
const PATHS: Record<string, string> = {
  bolt: 'M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  case: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  shield: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z',
};

export function Icon({ name, size = 17 }: { name: keyof typeof PATHS | string; size?: number }) {
  const filled = name === 'bolt';
  return (
    <svg width={filled ? 18 : size} height={filled ? 18 : size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
