import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { openShare } from "./open";
import { ShareClient } from "./share-client";

/**
 * `/bc/[token]` — người NGOÀI tiệm mở một bản chụp báo cáo (migration #295).
 * Thẻ design: design-system/man-chia-se-bao-cao.html.
 *
 * HỌ ĐỊA CHỈ THỨ BA, khai ở #295. ADR-0008 mục 4 chốt hai họ và cấm gộp:
 *   · `/t/[slug]`   mặt tiền tiệm — CHO Google đánh chỉ mục, đó là điểm bán.
 *   · `/k/[token]`  cửa riêng MỘT khách — buộc vào `contact_id`.
 * Bản chụp báo cáo mang SỐ TỔNG của tiệm, không mang dữ liệu của khách nào, nên
 * không buộc được vào `contact_id`. Nó theo ĐÚNG kỷ luật của `/k/` (noindex, mã
 * băm, hạn cứng, thu hồi được) nhưng là một họ riêng.
 *
 * KHÔNG dùng cache: hạn, thu hồi và bộ đếm chống dò phải được hỏi lại mỗi lượt.
 * Một trang bị nhớ đệm nghĩa là một đường dẫn đã thu hồi vẫn hiện số.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reportShare.public");
  return {
    // Tiêu đề TRUNG TÍNH — không tên tiệm, không tên báo cáo. Tiêu đề nằm trên
    // thanh tab, trong lịch sử trình duyệt và trong ảnh xem trước khi ai đó
    // chuyển tiếp đường dẫn; không có gì của tiệm được nằm ở đó.
    title: t("metaTitle"),
    // Mã nằm TRÊN địa chỉ trang. `noindex/nofollow` giữ nó khỏi máy tìm kiếm,
    // `no-referrer` giữ nó khỏi bất kỳ trang nào người xem bấm sang.
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
  };
}

export default async function ReportSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params; // Next 16: params phải await
  // Mở thử KHÔNG kèm mật khẩu. Bản có mật khẩu trả về 'need_password' và tuyệt
  // đối không kèm theo tên tiệm hay tên báo cáo — chưa mở khoá thì chưa lộ gì.
  const initial = await openShare(token, null);
  return <ShareClient token={token} initial={initial} />;
}
