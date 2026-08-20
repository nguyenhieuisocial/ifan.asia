import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getOrderDetail, getOrderHistory } from "@/lib/catalog/orders";
import { listItems } from "@/lib/catalog/items";
import { layLuatTichDiem, layViDiem } from "../../loyalty/queries";
import { OrderDetailView } from "./order-detail-view";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cùng khuôn NotFoundState của hồ sơ khách (app/app/contacts/[id]/page.tsx). */
async function NotFoundState() {
  const t = await getTranslations("orders.notFound");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-6">
        <Receipt className="size-10 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
      <Button asChild variant="outline">
        <Link href="/app/orders">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
    </div>
  );
}

/**
 * Chi tiết đơn (ADR-0019 mục 5+8 việc 4). `canWrite` = vai khác `viewer` —
 * đủ để khớp RLS `orders_update`/`order_lines_write`: staff chỉ NHÌN THẤY
 * đơn của chính mình ở đây (policy `orders_select`), nên nếu họ mở được
 * trang này thì cũng luôn qua được điều kiện `created_by = auth.uid()` của
 * policy ghi — không cần so `createdBy` ở tầng UI nữa (D2: một luật một nơi).
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return <NotFoundState />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, bank_code, bank_account_no, bank_account_name")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const [order, member, items, history, luatDiem, staffRes] = await Promise.all([
    getOrderDetail(supabase, id),
    getCurrentMembership(supabase, user.id),
    listItems(supabase),
    // #224 — lịch sử đơn (ai tạo/xác nhận/hoàn tất/huỷ). Song song, không phụ
    // thuộc getOrderDetail; RLS domain_events tự lọc về đúng tiệm.
    getOrderHistory(supabase, id),
    // DÙNG LẠI truy vấn của màn Ưu đãi & Tích điểm — không viết truy vấn mới:
    // quy đổi điểm ra tiền chỉ được tính ở MỘT nơi (hai nơi cùng nhân là hai
    // nơi ra hai con số, lỗi #18).
    layLuatTichDiem(supabase),
    // #224 — thợ để gán "người làm" khi thêm dòng vào đơn nháp (RPC bookable_staff).
    supabase.rpc("bookable_staff"),
  ]);
  if (!order) return <NotFoundState />;

  // Ví điểm cần contactId nên phải đợi đơn. Tiệm chưa bật tích điểm thì KHÔNG
  // hỏi thêm câu nào — nhưng vẫn truyền `isActive` xuống để màn nói ra lý do
  // thay vì ẩn khối đi không giải thích.
  const viDiem = luatDiem.isActive ? await layViDiem(supabase, order.contactId) : null;

  // Phiếu hoàn: đọc lại HAI dòng quyết toán điểm mà CSDL đã tự ghi lúc chốt
  // phiếu (migration #195). Chỉ hỏi khi đúng là phiếu hoàn — đơn thường không
  // bao giờ có dòng nào loại này, hỏi thêm một câu cho mọi đơn là phí.
  //
  // Không nhét vào `getOrderDetail`: đó là truy vấn dùng chung cho mọi đơn, và
  // sổ điểm không phải một phần của chứng từ đơn hàng.
  let pointsSettled: { refunded: number; clawedBack: number } | null = null;
  if (order.kind === "return") {
    const { data: dongDiem } = await supabase
      .from("loyalty_ledger")
      .select("reason, delta_points")
      .eq("order_id", order.id)
      .in("reason", ["return_refund", "return_clawback"]);
    const refunded = (dongDiem ?? [])
      .filter((d) => d.reason === "return_refund")
      .reduce((s, d) => s + Number(d.delta_points), 0);
    const clawedBack = (dongDiem ?? [])
      .filter((d) => d.reason === "return_clawback")
      .reduce((s, d) => s - Number(d.delta_points), 0);
    // Không có dòng nào ⇒ đơn gốc không dính điểm ⇒ không dựng khối rỗng.
    if (refunded > 0 || clawedBack > 0) pointsSettled = { refunded, clawedBack };
  }

  const canWrite = member?.role !== "viewer";
  const sellableItems = items.filter((i) => i.status === "active");
  const staff = ((staffRes.data as { id: string; full_name: string }[] | null) ?? []).map((s) => ({
    id: s.id,
    name: s.full_name,
  }));
  // ADR-0019 mục 6: 3 cột cùng có hoặc cùng trống (constraint tenants_bank_all_or_none) — chỉ cần kiểm 1 cột.
  const bankInfo = tenant.bank_code
    ? { bin: tenant.bank_code as string, accountNo: tenant.bank_account_no as string, accountName: tenant.bank_account_name as string }
    : null;

  return (
    <OrderDetailView
      order={order}
      history={history}
      canWrite={canWrite}
      items={sellableItems}
      staff={staff}
      bankInfo={bankInfo}
      pointsSettled={pointsSettled}
      loyalty={{
        isActive: luatDiem.isActive,
        redeemPointsUnit: luatDiem.redeemPointsUnit,
        redeemValueVnd: luatDiem.redeemValueVnd,
        diemCon: viDiem?.diemCon ?? 0,
        quyDoiVnd: viDiem?.quyDoiVnd ?? 0,
      }}
    />
  );
}
