import { GlyphMessage, TileBody, TileDefs } from "./tile-parts";

/** Gạch gốm motif bong bóng chat — dùng cho ngữ cảnh hộp thư. */
export function TileMessage({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <TileDefs id="ifan-tile-msg" />
      <g transform="rotate(-3 50 50)">
        <TileBody defsId="ifan-tile-msg" />
        <GlyphMessage />
      </g>
    </svg>
  );
}
