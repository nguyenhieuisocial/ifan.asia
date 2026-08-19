import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import RecruitmentView from "./recruitment-view";
import { layBangTuyenDung } from "./queries";
import type { RecruitmentData } from "./types";

export const dynamic = "force-dynamic";

/**
 * Ai VÀO được màn Tuyển dụng.
 *
 * `staff` có mặt trong danh sách là CÓ CHỦ ĐÍCH, không phải sơ suất: RLS
 * `candidates_select` mở một nhánh riêng cho người ĐƯỢC XẾP PHỎNG VẤN, kể cả khi
 * vai họ là nhân viên (migration #170). Chặn họ ở đây là bịt lại đúng nhánh đó
 * và luồng phỏng vấn gãy ngay tại chỗ nó bắt đầu — nhân viên được giao phỏng vấn
 * sẽ không mở nổi hồ sơ người mình sắp gặp.
 *
 * Họ chỉ thấy hồ sơ mình phỏng vấn (RLS lọc), và danh sách tin tuyển của họ sẽ
 * rỗng — đúng luật, không phải lỗi.
 *
 * `viewer` KHÔNG vào: hồ sơ ứng viên là dữ liệu cá nhân của người NGOÀI tiệm.
 */
const VIEW_ROLES = ["owner", "admin", "manager", "staff"];
/** Sửa tin tuyển / hồ sơ / lịch phỏng vấn — khớp RLS `*_manage` của migration #170. */
const MANAGE_ROLES = ["owner", "admin", "manager"];

export async function generateMetadata() {
  const t = await getTranslations("recruitment");
  return { title: t("title") };
}

export default async function RecruitmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";
  if (!VIEW_ROLES.includes(role)) redirect("/app");

  let loadFailed = false;
  let data: RecruitmentData = { jobs: [], candidates: [], members: [], expired: [] };
  try {
    data = await layBangTuyenDung(supabase, { userId: user.id, role });
  } catch {
    // Tải hỏng thì NÓI RA. Bảng rỗng nghĩa là "chưa ai nộp hồ sơ" — để lỗi mạng
    // đội lốt thông điệp đó là đẩy chủ tiệm đi đăng lại tin tuyển vô ích.
    loadFailed = true;
  }

  return (
    <RecruitmentView
      jobs={data.jobs}
      candidates={data.candidates}
      members={data.members}
      expired={data.expired}
      canManage={MANAGE_ROLES.includes(role)}
      loadFailed={loadFailed}
    />
  );
}
