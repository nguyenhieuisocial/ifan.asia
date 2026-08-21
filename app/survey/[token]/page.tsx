import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SurveyForm } from "./survey-form";
import { mauCua } from "@/lib/thuong-hieu";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Đánh giá dịch vụ",
  // Link chứa token dùng-một-lần: KHÔNG để máy tìm kiếm lập chỉ mục, nếu không
  // phiếu của khách thật có thể lộ ra ngoài Google (cùng cách trang livechat-demo).
  robots: { index: false, follow: false },
};

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // RPC `get_survey_info` là SECURITY DEFINER nên đọc được dù khách chưa đăng nhập.
  // ⚠️ KHÔNG gắn `.single()`: hàm trả về MỘT giá trị jsonb (không phải bảng), nên
  // `.single()` bắt PostgREST trả đúng-một-DÒNG và token sai (hàm trả null) thành
  // lỗi 406 thay vì trang 404 — khách gặp màn lỗi kỹ thuật.
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_survey_info", { p_token: token });

  if (!data) notFound();

  const survey = data as {
    shop_name: string | null;
    item_name: string | null;
    already_submitted: boolean;
    rating: number | null;
    /** Mã màu thương hiệu tiệm (#334/#335) — null nghĩa là dùng màu iFan. */
    mau: string | null;
  };

  return (
    <SurveyForm
      token={token}
      shopName={survey.shop_name ?? ""}
      itemName={survey.item_name ?? ""}
      alreadySubmitted={survey.already_submitted}
      existingRating={survey.rating}
      mauNen={mauCua(survey.mau).dam}
    />
  );
}
