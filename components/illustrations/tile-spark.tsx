import { GlyphSpark, TileBody, TileDefs } from "./tile-parts";

/** Gạch gốm motif tia sáng — dùng cho ngữ cảnh AI / khách nóng. */
export function TileSpark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <TileDefs id="ifan-tile-spark" />
      <g transform="rotate(-2 50 50)">
        <TileBody defsId="ifan-tile-spark" />
        <GlyphSpark />
      </g>
    </svg>
  );
}
