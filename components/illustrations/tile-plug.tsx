import { GlyphPlug, TileBody, TileDefs } from "./tile-parts";

/** Gạch gốm motif phích cắm — dùng cho ngữ cảnh kết nối kênh. */
export function TilePlug({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <TileDefs id="ifan-tile-plug" />
      <g transform="rotate(-3 50 50)">
        <TileBody defsId="ifan-tile-plug" />
        <GlyphPlug />
      </g>
    </svg>
  );
}
