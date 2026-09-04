/** Inline line icons (24×24, 2px stroke) — no icon font/library, per the design.
 *  Add paths here as new icons are needed across screens. */
const ICON_PATHS: Record<string, string> = {
  home: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  beer:
    "M17 11h1a3 3 0 0 1 0 6h-1 M9 12v6 M13 12v6 M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 3 11 3s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5 M5 8v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V8",
  wine: "M8 22h8 M7 10h10 M12 15v7 M12 15a5 5 0 0 0 5-5c0-2-.5-4-1-8H8c-.5 4-1 6-1 8a5 5 0 0 0 5 5Z",
  drink: "M8 22h8 M12 11v11 M19 3H5l7 8 7-8Z",
  spirit:
    "M10 2h4 M10 2v3.2c0 .5-.2 1-.6 1.4L8 8.2A2 2 0 0 0 7 9.6V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9.6a2 2 0 0 0-.4-1.4l-1.4-1.6a2 2 0 0 1-.6-1.4V2 M7 13h10",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z M16 16l5 5",
  chevronDown: "m6 9 6 6 6-6",
  check: "M20 6 9 17l-5-5",
  plus: "M12 5v14 M5 12h14",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  deck: "M4 6h16 M4 12h16 M4 18h16",
  table: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18",
  gallery: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v14",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  sort: "m21 16-4 4-4-4 M17 20V4 M3 8l4-4 4 4 M7 4v16",
  gear:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.9 1.09V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 8l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.9 1.09l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 12H21a2 2 0 0 1 0 4h-.09",
  trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6",
  filter: "M4 4h16l-6.5 8.5V19l-3 2v-8.5Z",
};

export type IconName = keyof typeof ICON_PATHS;

export default function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 2,
}: {
  name: IconName | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const d = ICON_PATHS[name] ?? "";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  );
}
