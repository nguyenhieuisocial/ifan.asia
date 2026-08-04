import { GlyphContact, TileBody, TileDefs } from "./tile-parts";

/** Gạch gốm motif người — dùng cho ngữ cảnh khách hàng. */
export function TileContact({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <TileDefs id="ifan-tile-contact" />
      <g transform="rotate(2 50 50)">
        <TileBody defsId="ifan-tile-contact" />
        <GlyphContact />
      </g>
    </svg>
  );
}
