import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { CsatView } from "./csat-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Đánh giá khách hàng",
};

const MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Trần danh sách. Có trần thì phải NÓI RA ngoài màn hình — bài học #21/#29:
 * trần ngầm làm số liệu sai trong im lặng ở tiệm đông khách. `CsatView` nhận
 * `limit` để in dòng "đang xem N gần nhất" khi chạm trần.
 */
const LIMIT = 200;

export default async function CsatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Dùng helper chung, KHÔNG tự viết truy vấn tenant_members: bản đầu gọi
  // `.select("role").maybeSingle()` không lọc user_id → tiệm có từ 2 thành viên
  // trở lên là maybeSingle() trả lỗi ⇒ CHỦ TIỆM cũng bị đá về /app. Helper còn
  // lọc `status='active'` + hạn phiên hỗ trợ (mục 69, ADR-0006).
  const member = await getCurrentMembership(supabase, user.id);
  if (!member || !MANAGE_ROLES.includes(member.role ?? "")) redirect("/app");

  const { data: surveys } = await supabase
    .from("satisfaction_surveys")
    .select(
      "id, token, rating, comment, submitted_at, created_at, appointments(start_at, contacts(full_name, phone), items(name))",
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  return (
    <CsatView
      surveys={(surveys ?? []) as unknown as Parameters<typeof CsatView>[0]["surveys"]}
      limit={LIMIT}
    />
  );
}
