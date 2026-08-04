import { GlyphChart, TileBody, TileDefs } from "./tile-parts";

/** Gạch gốm motif cột số liệu — dùng cho ngữ cảnh tổng quan / bản tin. */
export function TileChart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <TileDefs id="ifan-tile-chart" />
      <g transform="rotate(3 50 50)">
        <TileBody defsId="ifan-tile-chart" />
        <GlyphChart />
      </g>
    </svg>
  );
}
