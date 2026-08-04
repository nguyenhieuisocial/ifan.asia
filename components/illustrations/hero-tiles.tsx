import {
  GlyphContact,
  GlyphMessage,
  GlyphSpark,
  TileBody,
  TileDefs,
} from "./tile-parts";

/**
 * Bộ 3 gạch gốm cho hero landing: tin nhắn + khách + tia sáng, xếp chồng nhẹ
 * (cảm giác rải → gom về một mối). Tĩnh, không phụ thuộc animation.
 */
export function HeroTiles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 222 110" className={className} aria-hidden focusable="false">
      <TileDefs id="ifan-hero-tiles" />
      <g transform="translate(2 20) scale(0.78) rotate(-7 50 50)">
        <TileBody defsId="ifan-hero-tiles" />
        <GlyphMessage />
      </g>
      <g transform="translate(140 16) scale(0.78) rotate(7 50 50)">
        <TileBody defsId="ifan-hero-tiles" />
        <GlyphSpark />
      </g>
      <g transform="translate(62 6) scale(0.94) rotate(2 50 50)">
        <TileBody defsId="ifan-hero-tiles" />
        <GlyphContact />
      </g>
    </svg>
  );
}
