import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import { fetchTagsWithCounts } from "../settings/tags/queries";
import { fetchContactsPage, fetchLeadSources } from "./queries";
import { fetchDuplicateCount } from "./duplicates/queries";
import { ContactsShell } from "./contacts-shell";

export const dynamic = "force-dynamic";

/** Server component: load nguồn khách + trang đầu (50 khách mới nhất theo ?q=). */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const initialQ = typeof sp.q === "string" ? sp.q : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  // Nhập Excel và gộp trùng = ghi hàng loạt cho cả tiệm → chỉ quản lý trở lên
  // (server action + RPC đều kiểm lại, đây chỉ là lớp hiển thị)
  const member = await getCurrentMembership(supabase, user.id);
  const canManage = ["owner", "admin", "manager"].includes(member?.role ?? "");
  // Khớp ĐÚNG điều kiện RLS `contacts_insert`/`contacts_update` (`app_role() <>
  // 'viewer'`): mọi vai TRỪ Chỉ xem đều thêm/sửa khách được, kể cả nhân viên
  // (staff chỉ đụng được khách của mình — RLS lo phần đó). Trước đây nút "Thêm
  // mới" và "Chọn nhiều" hiện cho cả vai Chỉ xem: soạn xong mới ăn báo lỗi,
  // đúng lớp ngõ cụt đã vá ở nút "+ Tạo đơn" (việc #163).
  const canWrite = member?.role !== "viewer";

  const [leadSources, tags, initialPage, profilesRes, duplicateCount, pack] = await Promise.all([
    fetchLeadSources(supabase),
    // Danh sách nhãn cho ô lọc "Nhãn" (nốt lại phần bỏ sót ở task #79) — dùng
    // chung hàm đã có ở màn Cài đặt › Nhãn, không cần đếm số khách gắn ở đây.
    fetchTagsWithCounts(supabase),
    fetchContactsPage(
      supabase,
      {
        q: initialQ,
        sourceId: null,
        tier: null,
        inactiveDays: null,
        tagId: null,
        custom: {},
        mineOnly: false,
        userId: user.id,
        sort: "recent",
      },
      null,
    ),
    // Tên hiển thị người phụ trách — RLS profiles chỉ trả đồng nghiệp cùng tenant
    supabase.from("profiles").select("user_id, display_name"),
    // Badge "Trùng lặp": RPC tự trả 0 cho vai không được gộp, không cần rẽ nhánh ở đây
    canManage ? fetchDuplicateCount(supabase) : Promise.resolve(0),
    // Khung nav theo pack (mục 35.1 việc 8): tiêu đề màn đổi theo từ vựng ngành
    getTenantPack(supabase),
  ]);

  // Nguồn CÀI SẴN (Zalo/Facebook/Giới thiệu/Khác) dịch được (migration #36);
  // nguồn chủ tiệm tự thêm không có khóa → giữ nguyên tên họ đặt, cả hai ngôn ngữ.
  const tSeed = await getTranslations("seed");
  const localizedSources = leadSources.map((s) => ({
    ...s,
    name: seedLabel(s.i18n_key, s.name, tSeed),
  }));

  return (
    <ContactsShell
      currentUserId={user.id}
      memberNames={Object.fromEntries(
        (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
      )}
      leadSources={localizedSources}
      tags={tags}
      initialQ={initialQ}
      initialPage={initialPage}
      canImport={canManage}
      canWrite={canWrite}
      duplicateCount={duplicateCount}
      contactLabel={pack.terminology?.contact}
      customFields={pack.custom_fields}
      canAssignOwner={canManage}
      // Cùng tập vai với canManage nhưng KHÁC ý nghĩa (luật RLS contacts_select
      // quyết định ai thấy hết) — tách prop để sau này một bên đổi không kéo bên kia
      ownContactsOnly={!canManage}
    />
  );
}
