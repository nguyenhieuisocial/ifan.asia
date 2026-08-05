import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/app/providers";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
