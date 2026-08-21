import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SITE_URL } from "@/lib/config";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { OneDayFlow } from "@/components/landing/one-day-flow";
import { DifferentiatorsAndFree } from "@/components/landing/differentiators-and-free";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/footer";
import { LandingFx } from "@/components/landing/landing-fx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * Landing big iFan — dựng lại theo ADR-0011 mục 5 (13/08, đợt V2.5): phạm vi
 * đã nhảy từ 6 mảng lên 20 mảng, và founder bác toàn bộ bảng giá 4 gói cũ.
 * Khung khóa theo 4 thẻ design landing-{hero,mot-ngay,khac-biet-va-mien-phi,
 * mobile}. Anchor giữ #features (khối một-ngày) · #pricing (khối miễn phí)
 * · #faq — header/footer đang trỏ tới. Cấm đưa số module lên tiêu đề (mục
 * 5: "'Top' không phải nhiều tính năng nhất") — tầm vóc hiện qua độ phủ một
 * ngày, không qua đếm mảng.
 */
export default async function Home() {
  const t = await getTranslations("landing");

  return (
    <>
      {/* DỮ LIỆU CÓ CẤU TRÚC cho trang chủ. Trước bản này KHÔNG trang nào của
          web khai gì cho máy tìm kiếm hiểu — không ADR nào từ chối, chỉ là
          vắng mặt. Khai `SoftwareApplication` là cách nói đúng bản chất: đây
          là phần mềm chạy trên web cho doanh nghiệp nhỏ.

          ⛔ KHÔNG khai giá ở đây. Trang Bảng giá còn đang ở trạng thái
          tiền-mở-bán và chưa công bố số nào — khai một con giá trong dữ liệu
          máy đọc trong khi trang người đọc không có giá là tự mâu thuẫn, và
          là loại mâu thuẫn máy tìm kiếm phạt. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "iFan.asia",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: t("description"),
            url: SITE_URL,
            inLanguage: ["vi", "en"],
          }),
        }}
      />
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <OneDayFlow />
        <DifferentiatorsAndFree />
        <Faq />
      </main>
      <LandingFooter />
      {/* Vi tương tác cần JS (lấp lánh huy hiệu 1 lần, số đếm chạy) — không
          render gì, không ẩn gì; tắt chuyển động là trang tĩnh nguyên vẹn */}
      <LandingFx />
    </>
  );
}
