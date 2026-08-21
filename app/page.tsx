import type { Metadata } from "next";
import { headers } from "next/headers";
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
  // `landing.metadata` chứ KHÔNG phải `landing`. Cả hai khoá dùng ở đây
  // (`title`, `description`) nằm dưới nhánh `metadata`, nên bản trước ném
  // MISSING_MESSAGE **hai lần mỗi lần mở trang chủ**. Máy chủ vẫn trả trang
  // nên không ai thấy gì — chỉ nhật ký đỏ, và không ai đọc nhật ký.
  const t = await getTranslations("landing.metadata");
  return {
    title: t("title"),
    description: t("description"),
    // Trang chủ cũng cần canonical: cùng nội dung tới được qua nhiều đường
    // (có/không `www`, có/không tham số theo dõi) — thiếu canonical là để máy
    // tìm kiếm tự chọn, và nó hay chọn sai.
    alternates: { canonical: "/" },
    openGraph: { type: "website", url: "/", title: t("title"), description: t("description") },
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
  /**
   * ⚠️ THẺ `ld+json` PHẢI MANG NONCE. CSP của kho dùng `nonce-… strict-dynamic`
   *   nên MỌI thẻ `<script>` không có vé đều bị trình duyệt CHẶN — kể cả loại
   *   `application/ld+json`. Đo trên bản thật 21/08: 17/18 thẻ script có vé,
   *   đúng thẻ dữ liệu-cho-máy-tìm-kiếm thì không. Googlebot chạy bằng Chrome
   *   và CÓ áp CSP, nên phần dữ liệu có cấu trúc coi như không tồn tại. Thiếu
   *   vé không làm trang hỏng, nên chuyện này nằm im rất lâu mà không ai thấy.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // `landing.metadata` chứ KHÔNG phải `landing` — cùng nhánh mà layout dùng cho
  // thẻ mô tả trang. Bản đầu viết `landing` và ném MISSING_MESSAGE mỗi lần mở
  // trang chủ; máy chủ vẫn trả trang nên không ai thấy, chỉ nhật ký đỏ.
  const t = await getTranslations("landing.metadata");

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
        nonce={nonce}
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
      <main id="noi-dung-chinh" className="flex-1">
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
