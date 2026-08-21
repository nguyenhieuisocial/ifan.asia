import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Be_Vietnam_Pro, Geist_Mono, Lora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/app/providers";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { CapNhatBanMoi } from "@/components/pwa/cap-nhat-ban-moi";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

/**
 * Phông chữ chính toàn app.
 *
 * Trước đây là Geist với subsets: ["latin"] — mà bộ latin KHÔNG chứa chữ có dấu
 * tiếng Việt (ế ộ ữ ợ…), nên phần lớn chữ trong sản phẩm rơi về phông mặc định
 * của máy: mỗi máy một kiểu, và không phải phông nào cũng dựng dấu tử tế.
 * Be Vietnam Pro do người Việt thiết kế riêng cho dấu tiếng Việt, và là phông
 * đã chốt trong hệ thống thiết kế iFan.
 *
 * Chỉ nạp 4 độ đậm đang thật sự dùng (400/500/600 dùng khắp nơi, 700 dùng 2 chỗ).
 */
const beVietnam = Be_Vietnam_Pro({
  variable: "--font-brand-sans",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * preload: false — chỉ dùng cho ĐÚNG MỘT ô nhập trong Cài đặt. Preload ở khung
 * gốc bắt mọi màn tải thừa 23 KB; đo được trên Hộp thư. @font-face vẫn còn nên
 * chỗ nào thật sự dùng thì trình duyệt tự tải.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

/**
 * Serif display cho headline landing — bắt buộc subset vietnamese để đủ dấu.
 * preload: false vì landing là trang xem MỘT LẦN, còn Hộp thư/Khách hàng là màn
 * dùng cả ngày và đang phải tải thừa 95 KB. Đánh đổi: headline landing có thể
 * đổi phông một nhịp ở lần vào đầu (display swap nên chữ luôn hiện, không trắng).
 */
const lora = Lora({
  variable: "--font-serif-display",
  subsets: ["vietnamese", "latin"],
  style: ["normal", "italic"],
  preload: false,
});

/**
 * Vỏ app đợt 1 (task #50 PWA):
 * - viewportFit "cover": web-app tràn hết màn trên iPhone tai thỏ; các mép đã
 *   được layout chừa bằng env(safe-area-inset-*) nên nội dung không bị che.
 * - themeColor theo giao diện: thanh trạng thái/URL của trình duyệt trùng màu
 *   nền app thay vì một dải trắng/đen lạc lõng. Giá trị là hex của token
 *   --background trong globals.css (sáng: oklch(1 0 0) = trắng; tối:
 *   oklch(0.16 0.005 55) ≈ #0f0d0b) — để hex vì meta theme-color trên iOS cũ
 *   chưa đọc được oklch.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d0b" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const [t, tLanding, locale] = await Promise.all([
    getTranslations("metadata"),
    getTranslations("landing.metadata"),
    getLocale(),
  ]);
  return {
    metadataBase: new URL(SITE_URL),
    title: t("title"),
    description: t("description"),
    robots: { index: true, follow: true },
    // OG/Twitter dùng title/description của landing (câu chào bán hàng) —
    // link share chủ yếu trỏ về trang chủ; ảnh lấy từ app/opengraph-image.tsx.
    openGraph: {
      type: "website",
      siteName: "iFan.asia",
      url: "/",
      locale: locale === "vi" ? "vi_VN" : "en_US",
      title: tLanding("title"),
      description: tLanding("description"),
    },
    twitter: {
      card: "summary_large_image",
      title: tLanding("title"),
      description: tLanding("description"),
    },
    // PWA (task #50): iOS chưa đọc manifest cho Thêm-vào-màn-hình-chính —
    // cần bộ meta apple-mobile-web-app-* riêng; icon lấy từ app/apple-icon.png.
    appleWebApp: {
      capable: true,
      title: "iFan",
      statusBarStyle: "default",
    },
  };
}

/**
 * MÀN HÌNH CHỜ cho iOS.
 *
 * Android tự dựng màn chờ từ `manifest` (tên + màu nền + biểu tượng). **iOS
 * thì không** — Safari đòi đúng một thẻ `apple-touch-startup-image` khớp CHÍNH
 * XÁC kích thước và tỉ lệ điểm ảnh của máy. Không khớp thì nó bỏ qua và người
 * dùng nhìn một màn TRẮNG khoảng một giây mỗi lần mở app.
 *
 * Ảnh sinh bằng `scripts/tao-man-cho-ios.mjs` — sửa danh sách máy ở đó rồi
 * chạy lại, đừng sửa tay trong `public/splash/`.
 *
 * ⚠️ `pt` là ĐIỂM (dùng trong câu điều kiện `media`), `px` là ĐIỂM ẢNH THẬT
 *   (dùng trong tên tệp). Lẫn hai thứ này là cách chắc chắn để iOS bỏ qua hết
 *   và không ai hiểu vì sao vẫn màn trắng.
 *
 * ⚠️ Chỉ có bản CHIỀU DỌC. Tiệm dùng điện thoại dọc; thiếu bản ngang thì iOS
 *   chỉ bỏ qua và quay về màu nền — không hỏng gì.
 */
const MAN_CHO_IOS = [
  { pt: [430, 932], r: 3, px: [1290, 2796] },
  { pt: [428, 926], r: 3, px: [1284, 2778] },
  { pt: [393, 852], r: 3, px: [1179, 2556] },
  { pt: [390, 844], r: 3, px: [1170, 2532] },
  { pt: [375, 812], r: 3, px: [1125, 2436] },
  { pt: [414, 896], r: 3, px: [1242, 2688] },
  { pt: [414, 896], r: 2, px: [828, 1792] },
  { pt: [375, 667], r: 2, px: [750, 1334] },
  { pt: [320, 568], r: 2, px: [640, 1136] },
  { pt: [768, 1024], r: 2, px: [1536, 2048] },
  { pt: [834, 1194], r: 2, px: [1668, 2388] },
  { pt: [1024, 1366], r: 2, px: [2048, 2732] },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages, h] = await Promise.all([
    getLocale(),
    getMessages(),
    headers(),
  ]);

  /**
   * Vé dùng-một-lần của lượt tải này, do `proxy.ts` phát (xem lib/security/csp.ts).
   *
   * Next tự gắn vé vào script nội tuyến của CHÍNH NÓ, nhưng không biết gì về
   * script của thư viện ngoài. `next-themes` chèn một script chạy TRƯỚC khi vẽ
   * để đọc lựa chọn sáng/tối và gắn class lên <html> — không có vé thì script đó
   * bị chặn, và mọi người mở app sẽ thấy giao diện sáng loé lên rồi mới đổi sang
   * tối. Nó có sẵn tham số `nonce`, chỉ cần truyền xuống.
   */
  const nonce = h.get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      className={`${beVietnam.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {MAN_CHO_IOS.map((m) => (
          <link
            key={m.px.join("x")}
            rel="apple-touch-startup-image"
            media={`(device-width: ${m.pt[0]}px) and (device-height: ${m.pt[1]}px) and (-webkit-device-pixel-ratio: ${m.r}) and (orientation: portrait)`}
            href={`/splash/splash-${m.px[0]}x${m.px[1]}.png`}
          />
        ))}
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers nonce={nonce}>{children}</Providers>
          {/* ⚠️ PHẢI nằm TRONG `NextIntlClientProvider`. Đặt cạnh
              `ServiceWorkerRegister` ở ngoài thì nó không tìm thấy kho câu chữ
              và NÉM LỖI — làm 500 toàn bộ ứng dụng. `ServiceWorkerRegister`
              đứng ngoài được vì nó không dùng câu chữ nào.
              Đã cắn thật 21/08: `npm run build` xanh (đây là lỗi lúc CHẠY,
              không phải lúc dịch) và bản chạy 500 ở mọi trang. */}
          <CapNhatBanMoi />
        </NextIntlClientProvider>
        {/* Đăng ký ở khung gốc (mọi trang, kể cả trước đăng nhập) — cache tài
            nguyên tĩnh sớm nhất có thể, xem public/sw.js. */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
