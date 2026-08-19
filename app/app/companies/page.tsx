import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth/membership";
import { createClient } from "@/lib/supabase/server";
import { CompaniesShell } from "./companies-shell";
import { fetchCompaniesPage } from "./queries";

export const dynamic = "force-dynamic";

/** Server component: trang đầu danh sách công ty (50 công ty mới nhất theo ?q=). */
export default async function CompaniesPage({
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

  const [initialPage, member] = await Promise.all([
    fetchCompaniesPage(supabase, initialQ, null),
    getCurrentMembership(supabase, user.id),
  ]);
  // Màn này trước đây KHÔNG kiểm vai một dòng nào: vai Chỉ xem vẫn thấy nút
  // "Thêm mới", soạn xong cả form mới ăn báo lỗi — đúng lớp ngõ cụt đã vá ở màn
  // Khách hàng và hồ sơ công ty. Khớp ĐÚNG `companies_insert` phần vai
  // (`app_role() <> 'viewer'`). Ẩn nút KHÔNG phải chốt chặn: chốt thật là RLS +
  // bước đếm dòng trong actions.ts.
  const canWrite = member?.role !== "viewer";

  return (
    <CompaniesShell initialQ={initialQ} initialPage={initialPage} canWrite={canWrite} />
  );
}
