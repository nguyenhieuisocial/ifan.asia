/**
 * Bộ phận dùng chung của "gạch gốm iFan" — chất liệu thương hiệu (luật thiết
 * kế, Phụ lục C: một chất liệu xuyên suốt, KHÔNG mượn gỗ của Cabinet).
 * Gạch men vuông bo góc ~22%, thân đất nung ấm sáng dần lên trên, MỘT vệt men
 * sáng góc trên-trái, MỘT cạnh dưới sẫm gợi độ dày. Motif vẽ phẳng màu kem.
 * Màu để literal trong SVG (asset thương hiệu — giữ nguyên ở nền sáng lẫn tối).
 */

export const TILE_LIGHT = "#E06B35"; // thân trên (men bắt sáng)
export const TILE_BASE = "#C94C18"; // thân dưới (= --primary quy đổi hex)
export const TILE_DARK = "#A03A10"; // cạnh dày phía dưới
export const TILE_CREAM = "#FAF5EF"; // men kem vẽ motif

/** Defs dùng chung trong 1 svg chứa gạch: gradient thân + blur vệt men sáng. */
export function TileDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={TILE_LIGHT} />
        <stop offset="1" stopColor={TILE_BASE} />
      </linearGradient>
      <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.5" />
      </filter>
    </defs>
  );
}

/** Thân gạch trong hệ tọa độ 100×100 (chưa xoay): cạnh dày + thân + vệt men. */
export function TileBody({ defsId }: { defsId: string }) {
  return (
    <g>
      <rect x="9" y="9.5" width="82" height="82" rx="18" fill={TILE_DARK} />
      <rect
        x="9"
        y="6"
        width="82"
        height="82"
        rx="18"
        fill={`url(#${defsId}-body)`}
      />
      <ellipse
        cx="31"
        cy="22"
        rx="14"
        ry="7.5"
        fill="#FFFFFF"
        opacity="0.28"
        filter={`url(#${defsId}-soft)`}
        transform="rotate(-16 31 22)"
      />
    </g>
  );
}

/** Motif bong bóng chat (hộp thư). Root là <g> để satori/resvg đọc được. */
export function GlyphMessage() {
  return (
    <g>
      <path
        d="M39 31 H61 Q70.5 31 70.5 40.5 V49.5 Q70.5 59 61 59 H44 L33.5 68.25 L39 59 Q29.5 59 29.5 49.5 V40.5 Q29.5 31 39 31 Z"
        fill={TILE_CREAM}
      />
      <circle cx="41" cy="45" r="2.6" fill={TILE_BASE} />
      <circle cx="50" cy="45" r="2.6" fill={TILE_BASE} />
      <circle cx="59" cy="45" r="2.6" fill={TILE_BASE} />
    </g>
  );
}

/** Motif người (khách hàng). */
export function GlyphContact() {
  return (
    <g fill={TILE_CREAM}>
      <circle cx="50" cy="37" r="9" />
      <path d="M32 67 C32 57 40 49 50 49 C60 49 68 57 68 67 Z" />
    </g>
  );
}

/** Motif tia sáng (AI / khách nóng). */
export function GlyphSpark() {
  return (
    <g fill={TILE_CREAM}>
      <path d="M50 25 C52.6 38 55.8 41.2 68.5 43.8 C55.8 46.4 52.6 49.6 50 62.6 C47.4 49.6 44.2 46.4 31.5 43.8 C44.2 41.2 47.4 38 50 25 Z" />
      <path d="M64.5 54.5 C65.6 59.4 66.6 60.4 71.5 61.5 C66.6 62.6 65.6 63.6 64.5 68.5 C63.4 63.6 62.4 62.6 57.5 61.5 C62.4 60.4 63.4 59.4 64.5 54.5 Z" />
    </g>
  );
}

/** Motif cột số liệu (tổng quan / bản tin). */
export function GlyphChart() {
  return (
    <g fill={TILE_CREAM}>
      <rect x="30.5" y="52" width="10" height="15" rx="3.5" />
      <rect x="45" y="42" width="10" height="25" rx="3.5" />
      <rect x="59.5" y="31" width="10" height="36" rx="3.5" />
    </g>
  );
}

/** Motif phích cắm (kết nối kênh). */
export function GlyphPlug() {
  return (
    <g fill={TILE_CREAM}>
      <rect x="40.5" y="27.5" width="5.5" height="12" rx="2.75" />
      <rect x="54" y="27.5" width="5.5" height="12" rx="2.75" />
      <path d="M36 39.5 H64 C66.2 39.5 68 41.3 68 43.5 V46 C68 52.6 62.6 58 56 58 H44 C37.4 58 32 52.6 32 46 V43.5 C32 41.3 33.8 39.5 36 39.5 Z" />
      <rect x="47.25" y="58" width="5.5" height="12.5" rx="2.75" />
    </g>
  );
}
