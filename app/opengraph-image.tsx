import { ImageResponse } from "next/og";

/**
 * Ảnh OG cho link share (Zalo/Facebook/Twitter) — sinh tĩnh lúc build,
 * Node runtime mặc định của Next 16 cho file metadata.
 *
 * NGOẠI LỆ i18n CÓ CHỦ ĐÍCH: chữ ở đây nằm TRONG ẢNH render sẵn (asset),
 * không phải UI text — hardcode tiếng Việt, không đi qua messages/*.json.
 */

export const alt = "iFan.asia — Không để khách nhắn tin nào bị quên";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WORDMARK = "iFan";
const WORDMARK_SUFFIX = ".asia";
const TAGLINE = "Không để khách nhắn tin nào bị quên";

// Token thương hiệu quy đổi hex (satori không hiểu oklch):
// nền = --primary oklch(0.58 0.17 40); chữ phụ = --primary-tint oklch(0.96 0.02 40)
const BRAND_BG = "#c94c18";
const BRAND_TINT = "#ffeee8";

/*
 * Gạch gốm iFan bản satori (đồng bộ motif với components/illustrations/
 * tile-parts.tsx — satori không chạy component React nên vẽ lại bằng div +
 * svg thuần). Thân gạch sáng hơn 1 nấc so với bản web để nổi trên nền cam đất.
 */
const TILE_EDGE = "#A03A10";
const TILE_CREAM = "#FAF5EF";
const TILE_GRADIENT = "linear-gradient(180deg, #E8804A 0%, #D55F27 100%)";

// Path motif — cùng d với GlyphMessage/GlyphContact/GlyphSpark (tile-parts.tsx).
// viewBox 100 = toàn bộ mặt gạch → svg phải to bằng gạch để đúng tỉ lệ motif.
const GLYPHS = {
  message: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 100 100">
      <path
        d="M39 31 H61 Q70.5 31 70.5 40.5 V49.5 Q70.5 59 61 59 H44 L33.5 68.25 L39 59 Q29.5 59 29.5 49.5 V40.5 Q29.5 31 39 31 Z"
        fill={TILE_CREAM}
      />
      <circle cx="41" cy="45" r="2.6" fill="#D55F27" />
      <circle cx="50" cy="45" r="2.6" fill="#D55F27" />
      <circle cx="59" cy="45" r="2.6" fill="#D55F27" />
    </svg>
  ),
  contact: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 100 100">
      <circle cx="50" cy="37" r="9" fill={TILE_CREAM} />
      <path
        d="M32 67 C32 57 40 49 50 49 C60 49 68 57 68 67 Z"
        fill={TILE_CREAM}
      />
    </svg>
  ),
  spark: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 100 100">
      <path
        d="M50 25 C52.6 38 55.8 41.2 68.5 43.8 C55.8 46.4 52.6 49.6 50 62.6 C47.4 49.6 44.2 46.4 31.5 43.8 C44.2 41.2 47.4 38 50 25 Z"
        fill={TILE_CREAM}
      />
      <path
        d="M64.5 54.5 C65.6 59.4 66.6 60.4 71.5 61.5 C66.6 62.6 65.6 63.6 64.5 68.5 C63.4 63.6 62.4 62.6 57.5 61.5 C62.4 60.4 63.4 59.4 64.5 54.5 Z"
        fill={TILE_CREAM}
      />
    </svg>
  ),
};

function OgTile({
  glyph,
  size: tileSize,
  rotate,
}: {
  glyph: keyof typeof GLYPHS;
  size: number;
  rotate: number;
}) {
  return (
    <div
      style={{
        width: tileSize,
        height: tileSize,
        borderRadius: Math.round(tileSize * 0.22),
        backgroundImage: TILE_GRADIENT,
        boxShadow: `0 6px 0 ${TILE_EDGE}`,
        transform: `rotate(${rotate}deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          width: Math.round(tileSize * 0.3),
          height: Math.round(tileSize * 0.13),
          borderRadius: 999,
          backgroundColor: "#FFFFFF",
          opacity: 0.24,
          transform: "rotate(-16deg)",
        }}
      />
      {GLYPHS[glyph](tileSize)}
    </div>
  );
}

/**
 * Font mặc định của satori thiếu glyph tiếng Việt — tải subset Be Vietnam Pro
 * (chỉ đúng các ký tự cần) từ Google Fonts lúc build; lỗi mạng → fallback
 * font mặc định (ảnh vẫn render, dấu có thể xấu — không chặn build).
 */
async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const text = encodeURIComponent(WORDMARK + WORDMARK_SUFFIX + TAGLINE);
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600&text=${text}`,
    ).then((r) => r.text());
    // fetch không có UA trình duyệt → Google trả @font-face dạng truetype (satori đọc được)
    const url = css.match(/src:\s*url\((.+?)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const font = await loadFont();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          backgroundColor: BRAND_BG,
          color: "#ffffff",
          fontFamily: font ? "Be Vietnam Pro" : "sans-serif",
        }}
      >
        {/* Bộ 3 gạch gốm — chất liệu thương hiệu, chữ vẫn là vai chính */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <OgTile glyph="message" size={104} rotate={-7} />
          <div style={{ display: "flex", marginLeft: -14, marginBottom: 18 }}>
            <OgTile glyph="contact" size={116} rotate={2} />
          </div>
          <div style={{ display: "flex", marginLeft: -14 }}>
            <OgTile glyph="spark" size={104} rotate={7} />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 148,
            fontWeight: 600,
            letterSpacing: -4,
          }}
        >
          {WORDMARK}
          <span style={{ color: BRAND_TINT, opacity: 0.85 }}>
            {WORDMARK_SUFFIX}
          </span>
        </div>
        <div
          style={{
            fontSize: 44,
            color: BRAND_TINT,
            textAlign: "center",
            maxWidth: 1000,
          }}
        >
          {TAGLINE}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Be Vietnam Pro", data: font, style: "normal", weight: 600 }]
        : undefined,
    },
  );
}
