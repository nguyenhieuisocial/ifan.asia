import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listItems } from "@/lib/catalog/items";
import { layMucTon } from "@/lib/stock/ledger";
import { NewOrderView } from "./new-order-view";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tạo đơn mới (ADR-0019 mục 8 việc 4: "Cửa vào: từ hồ sơ khách · từ khung
 * chat · từ lịch hẹn"). Một trang DUY NHẤT cho cả 3 cửa vào — chỉ khác nhau
 * ở query string khoá sẵn khách/nguồn, không dựng 3 màn riêng (D1).
 */
export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string; conversationId?: string; appointmentId?: string }>;
}) {
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const lockedContactId = sp.contactId && UUID_RE.test(sp.contactId) ? sp.contactId : null;
  const conversationId = sp.conversationId && UUID_RE.test(sp.conversationId) ? sp.conversationId : null;
  const appointmentId = sp.appointmentId && UUID_RE.test(sp.appointmentId) ? sp.appointmentId : null;

  const [items, lockedContactRes, staffRes, mucTon] = await Promise.all([
    listItems(supabase),
    lockedContactId
      ? supabase.from("contacts").select("id, full_name, phone").eq("id", lockedContactId).maybeSingle()
      : Promise.resolve({ data: null }),
    // #224 — thợ để gán "người làm" cho từng dòng. Qua RPC bookable_staff
    // (SECURITY DEFINER, migration #230) — chỉ người CÒN LÀM của tiệm này, và
    // mọi vai đọc được (RLS employees chặn manager đọc hồ sơ người khác).
    supabase.rpc("bookable_staff"),
    // ⚠️ TỒN KHO ĐỂ HIỆN NGAY CẠNH TÊN HÀNG. Bán thứ không còn trong kho là lỗi
    //   người bán chỉ biết SAU KHI khách đã trả tiền. Lấy một lượt cho cả danh
    //   sách, không hỏi từng món.
    layMucTon(supabase, tenant.id as string).catch(() => []),
  ]);
  // Chỉ hàng hoá mới có tồn; dịch vụ không có, và bịa số 0 cho dịch vụ thì màn
  // sẽ nói "còn 0" cho một thứ không bao giờ hết.
  const tonKho: Record<string, number> = {};
  for (const m of mucTon) tonKho[m.itemId] = m.ton;
  const sellableItems = items.filter((i) => i.status === "active");
  const lockedContact = lockedContactRes.data
    ? { id: lockedContactRes.data.id as string, name: lockedContactRes.data.full_name as string }
    : null;
  const staff = ((staffRes.data as { id: string; full_name: string }[] | null) ?? []).map((s) => ({
    id: s.id,
    name: s.full_name,
  }));

  return (
    <NewOrderView
      items={sellableItems}
      lockedContact={lockedContact}
      conversationId={conversationId}
      appointmentId={appointmentId}
      staff={staff}
      tonKho={tonKho}
    />
  );
}
