"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Hợp đồng & Gói định kỳ (ADR-0022 V5).
 * QUYỀN:
 *   - service_packages: manage = owner/admin/manager; select = mọi vai.
 *   - contracts: manage = owner/admin/manager; select = mọi vai.
 *   - contract_sessions: mọi vai (nhân viên đổi buổi cho khách).
 *
 * ⚠️ Mọi INSERT ở đây PHẢI tự truyền `tenant_id`: ba bảng của migration V5
 * khai `tenant_id not null` KHÔNG default, và RLS `with check` chỉ chặn ghi
 * SANG tiệm khác chứ không tự điền tiệm đúng. Cùng bẫy đã dính ở
 * `app/app/team/actions.ts` và `app/app/payroll/actions.ts` — đây là lần thứ 3.
 *
 * ⚠️ Vì sao bẫy này im lặng suốt từ ngày đầu: thiếu `tenant_id` thì Postgres
 * xét `with check` TRƯỚC ràng buộc not-null, nên lỗi trả về là **42501
 * "row-level security"** chứ KHÔNG phải 23502 "null value in column" (đo trực
 * tiếp trên CSDL 20/08). Người dùng thấy "Không có quyền" và đi tìm nhầm chỗ.
 * Đọc lỗi kiểu nào cũng không cứu được chuyện này — chỉ có việc LUÔN truyền
 * `tenant_id` (qua `boiCanh()` bên dưới) mới cứu.
 */

type ActionResult = { error: string | null };

/**
 * Lỗi CSDL → khoá `contracts.errors.*`.
 *
 * Hai mã đầu do TRIGGER `contract_sessions_cap` ném ra kèm errcode 23514, nên
 * phải khớp CHUỖI trước khi xét mã lỗi chung — nếu xét mã trước thì chúng rơi
 * hết vào "dữ liệu không hợp lệ" và mất câu giải thích cho người dùng.
 *
 * Tách hai loại vì chúng dẫn người sửa đi hai hướng khác hẳn nhau:
 *   · 42501 — vai không đủ quyền (policy `*_manage` chặn).
 *   · 23502/23503/23514 — dữ liệu sai (thiếu cột bắt buộc, khoá ngoại treo,
 *     ràng buộc check). Bản cũ gộp hết vào "save_failed" nên không ai đọc ra.
 */
function loiGhi(err: { code?: string; message: string }): string {
  if (/contract_cancelled/i.test(err.message)) return "contract_cancelled";
  if (/contract_full/i.test(err.message)) return "contract_full";
  if (err.code === "42501" || /row-level security/i.test(err.message)) return "forbidden";
  if (err.code === "23502" || err.code === "23503" || err.code === "23514") return "invalid_input";
  if (/violates (not-null|check|foreign key) constraint/i.test(err.message)) return "invalid_input";
  return "save_failed";
}

/**
 * Người đăng nhập + tiệm đang mở. Cờ `ok` là thứ TypeScript dựa vào để tách
 * hai nhánh — cùng khuôn `app/app/team/actions.ts` · `app/app/payroll/actions.ts`.
 * RLS `tenants_select` chỉ trả đúng một dòng cho người đăng nhập.
 */
type BoiCanh =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string };
      tenantId: string;
    };

async function boiCanh(): Promise<BoiCanh> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  // `no_tenant` chứ không phải `not_found`: trong màn này `not_found` đã mang
  // nghĩa "không còn hợp đồng đó" (xem `huyHopDong`). Một khoá hai nghĩa thì
  // người dùng đọc phải câu sai.
  if (!tenant) return { ok: false, error: "no_tenant" };
  return { ok: true, supabase, user, tenantId: tenant.id as string };
}

// ==================== GÓI DỊCH VỤ ====================

const goiSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable(),
  sessionsTotal: z.number().int().positive().max(9999),
  validityDays: z.number().int().positive().max(3650).nullable(),
  priceVnd: z.number().int().min(0).max(100_000_000),
});

export async function taoGoi(input: z.infer<typeof goiSchema>): Promise<ActionResult & { id?: string }> {
  const parsed = goiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { data, error } = await ctx.supabase
    .from("service_packages")
    .insert({
      tenant_id: ctx.tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      sessions_total: parsed.data.sessionsTotal,
      validity_days: parsed.data.validityDays,
      price_vnd: parsed.data.priceVnd,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: loiGhi(error) };
  revalidatePath("/app/contracts");
  return { error: null, id: data.id as string };
}

export async function luuTruGoi(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_packages")
    .update({ status: "archived" })
    .eq("id", id)
    .select("id");

  if (error) return { error: loiGhi(error) };
  // `service_packages_manage` lọc ở `using`: vai staff/viewer bấm Lưu trữ thì
  // UPDATE trả 0 dòng và KHÔNG ném lỗi (đo được trên CSDL). Không đếm dòng thì
  // màn báo "Đã lưu trữ" trong khi gói còn nguyên trên bảng.
  if (!data || data.length === 0) return { error: "forbidden" };
  revalidatePath("/app/contracts");
  return { error: null };
}

// ==================== HỢP ĐỒNG ====================

const hopDongSchema = z.object({
  contactId: z.uuid(),
  packageId: z.uuid(),
  sessionsTotal: z.number().int().positive().max(9999),
  validityDays: z.number().int().positive().max(3650).nullable(),
  pricePaidVnd: z.number().int().min(0).max(100_000_000),
  paymentMethod: z.enum(["cash", "transfer", "qr"]),
  note: z.string().trim().max(500).nullable(),
});

export async function taoHopDong(
  input: z.infer<typeof hopDongSchema>,
): Promise<ActionResult & { id?: string }> {
  const parsed = hopDongSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  // +7 tiếng TRƯỚC khi cắt chuỗi — `toISOString()` luôn trả giờ UTC, nên từ
  // 00:00 đến 06:59 giờ VN ngày UTC vẫn là HÔM QUA. Bán gói 30 ngày lúc 00:30
  // ngày 20/08 mà ghi bắt đầu 19/08 là khách MẤT TRỌN MỘT NGÀY sử dụng (và bán
  // lúc 00:30 mùng 1 thì hợp đồng rơi hẳn sang tháng trước). Cùng khuôn
  // `app/app/team/leave-panel.tsx` · `people-panel.tsx` · `punch-panel.tsx`.
  const startsAt = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const expiresAt = parsed.data.validityDays
    ? new Date(Date.now() + 7 * 3600 * 1000 + parsed.data.validityDays * 86400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  const { data, error } = await ctx.supabase
    .from("contracts")
    .insert({
      tenant_id: ctx.tenantId,
      contact_id: parsed.data.contactId,
      package_id: parsed.data.packageId,
      sessions_total: parsed.data.sessionsTotal,
      starts_at: startsAt,
      expires_at: expiresAt,
      price_paid_vnd: parsed.data.pricePaidVnd,
      payment_method: parsed.data.paymentMethod,
      note: parsed.data.note,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: loiGhi(error) };
  revalidatePath("/app/contracts");
  return { error: null, id: data.id as string };
}

export async function huyHopDong(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "active") // chỉ huỷ khi đang active
    .select("id");

  if (error) return { error: loiGhi(error) };
  // 0 dòng mà KHÔNG có lỗi có hai nguyên nhân khác hẳn nhau: vai không đủ
  // quyền (`contracts_manage` lọc ở `using`) HOẶC hợp đồng đã rời trạng thái
  // active (người khác vừa huỷ / vừa dùng hết buổi). Đọc lại một nhịp để nói
  // đúng hướng — `contracts_select` mở cho MỌI vai nên đọc được là chắc chắn.
  if (!data || data.length === 0) {
    const { data: hopDong } = await supabase
      .from("contracts")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (!hopDong) return { error: "not_found" };
    return { error: hopDong.status === "active" ? "forbidden" : "stale_state" };
  }
  revalidatePath("/app/contracts");
  return { error: null };
}

// ==================== DÙNG BUỔI ====================

const doiBuoiSchema = z.object({
  contractId: z.uuid(),
  note: z.string().trim().max(500).nullable(),
});

export async function doiMotBuoi(input: z.infer<typeof doiBuoiSchema>): Promise<ActionResult> {
  const parsed = doiBuoiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("contract_sessions").insert({
    tenant_id: ctx.tenantId,
    contract_id: parsed.data.contractId,
    note: parsed.data.note,
    recorded_by: ctx.user.id,
  });

  if (error) return { error: loiGhi(error) };
  revalidatePath("/app/contracts");
  return { error: null };
}
