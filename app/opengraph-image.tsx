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
