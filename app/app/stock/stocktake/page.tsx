import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { layPhienHienTai, layCacPhienCu, type StocktakeInfo, type PhienCu } from "./queries";
import { StocktakeView } from "./stocktake-view";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Màn Kiểm kê (ADR-0021 V4).
 *
 * QUYỀN — CHẶN CẢ CỬA: màn này truy cập stocktakes/stocktake_lines, hai bảng
 * chỉ mở cho owner/admin/manager theo RLS `stocktakes_rw`/`stocktake_lines_rw`.
 * Vai khác truy vấn ra 0 dòng. Màn phải nói thẳng "không có quyền" — để màn
 * trống hoặc im lặng ra danh sách rỗng sẽ đọc thành "chưa có phiên nào bao giờ".
 *
 * loadFailed: bật nếu tra cứu hỏng (không phải "chưa có phiên") — không nuốt
 * lỗi, không trả về [] và im lặng (bài học việc #169).
 */
export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string | string[] }>;
}) {
  // ?d=<mã phiếu> — thông báo gọi tên dẫn thẳng tới đúng phiếu kiểm kê
  // (migration #294). Chỉ nhận đúng khuôn uuid: tham số rác thì bỏ qua, không
  // để nó chảy xuống thành thuộc tính DOM hay bộ lọc nửa vời.
  const sp = await searchParams;
  const raw = typeof sp.d === "string" ? sp.d : null;
  const moTraoDoiId =
    raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");
  if (!canManage) {
    return (
      <StocktakeView
        canManage={false}
        loadFailed={false}
        phienHienTai={null}
        phienCu={[]}
      />
    );
  }

  let phienHienTai: StocktakeInfo | null = null;
  let phienCu: PhienCu[] = [];
  let loadFailed = false;

  try {
    const [ketQuaHienTai, ketQuaCu] = await Promise.all([
      layPhienHienTai(supabase),
      layCacPhienCu(supabase),
    ]);
    phienHienTai = ketQuaHienTai.phien;
    phienCu = ketQuaCu.phien;
  } catch {
    loadFailed = true;
  }

  return (
    <StocktakeView
      canManage
      loadFailed={loadFailed}
      phienHienTai={phienHienTai}
      phienCu={phienCu}
      moTraoDoiId={moTraoDoiId}
    />
  );
}
