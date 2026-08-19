"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  LOAI_HANH_DONG,
  MOC_HAN,
  PHEP_SO,
  TRAN_DIEU_KIEN,
  TRAN_HANH_DONG,
  VAI_DUYET,
  dungDieuKien,
  dungHanhDong,
} from "./catalog";

type ActionResult = { error: string | null };

/**
 * Bật/tắt một quy trình. RLS `workflows_manage` (migration #15) là lưới cuối:
 * chỉ owner/admin của đúng tenant ghi được; action vẫn tự kiểm vai trò trước
 * (defense in depth, theo mẫu settings/replies/actions.ts).
 */
export async function setWorkflowActive(
  workflowId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const parsed = z
    .object({ workflowId: z.uuid(), isActive: z.boolean() })
    .safeParse({ workflowId, isActive });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const member = await getCurrentMembership(supabase, user.id);
  if (member?.role !== "owner" && member?.role !== "admin") {
    return { error: "forbidden" };
  }

  const { data: daDoi, error } = await supabase
    .from("workflows")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.workflowId)
    .select("id");
  if (error) return { error: "failed" };
  // `workflows_select` mở cho mọi vai, `workflows_manage` chỉ cho owner/admin —
  // đo 20/08: quản lý/nhân viên/chỉ-xem ĐỌC được quy trình (1 dòng) mà bật/tắt
  // ra 0 dòng, KHÔNG lỗi. Phép kiểm vai ngay trên là bản sao luật CSDL; phép
  // đếm dòng này là thứ bắt được lúc hai bản lệch nhau.
  if (!daDoi?.length) return { error: "forbidden" };

  revalidatePath("/app/settings/workflows");
  return { error: null };
}

// ============================================================
// TRÌNH DỰNG QUY TRÌNH RIÊNG
// ============================================================

const dongDieuKienSchema = z.object({
  field: z.string().min(1),
  op: z.enum(PHEP_SO),
  value: z.string().max(200),
});

const dongHanhDongSchema = z.object({
  type: z.enum(LOAI_HANH_DONG),
  subject: z.string().max(200).optional(),
  dueIn: z.enum(MOC_HAN).optional(),
  assignTo: z.string().max(64).optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(1000).optional(),
  to: z.string().max(64).optional(),
  approverRole: z.enum(VAI_DUYET).optional(),
});

const quyTrinhSchema = z.object({
  name: z.string().trim().min(1, "thieu_ten").max(100, "ten_qua_dai"),
  description: z.string().trim().max(500).nullable(),
  triggerEvent: z.string().min(1, "thieu_su_kien"),
  conditions: z.array(dongDieuKienSchema).max(TRAN_DIEU_KIEN, "qua_nhieu_dieu_kien"),
  actions: z
    .array(dongHanhDongSchema)
    .min(1, "thieu_hanh_dong")
    .max(TRAN_HANH_DONG, "qua_nhieu_hanh_dong"),
});

export type QuyTrinhInput = z.infer<typeof quyTrinhSchema>;

/**
 * `key` là khoá ổn định của quy trình, người dùng không nhập. Slug bỏ dấu để
 * đọc được trong log/CSDL, cộng hậu tố ngẫu nhiên vì chỉ mục duy nhất
 * `(tenant_id, key)` không cho hai quy trình trùng tên — và vì hậu tố cũng là
 * thứ ngăn một quy trình tự tạo vô tình mang đúng khoá của playbook cài sẵn
 * (`lead_intake`, `followup_357`…), thứ mà `wf_seed_playbooks` dùng để nhận diện.
 */
function sinhKhoa(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `${slug === "" ? "wf" : slug}_${randomUUID().slice(0, 8)}`;
}

function loiGhi(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  if (/duplicate key/i.test(message)) return "trung_khoa";
  return "save_failed";
}

type Chuan =
  | { ok: false; error: string }
  | { ok: true; supabase: SupabaseClient; user: { id: string } };

/** Chuẩn bị chung cho cả 3 thao tác: đăng nhập + kiểm vai. */
async function chuanBi(): Promise<Chuan> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };

  const member = await getCurrentMembership(supabase, user.id);
  if (member?.role !== "owner" && member?.role !== "admin") {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, supabase, user };
}

export async function taoQuyTrinh(input: QuyTrinhInput): Promise<ActionResult> {
  const parsed = quyTrinhSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  const dk = dungDieuKien(d.triggerEvent, d.conditions);
  if (!dk.ok) return { error: dk.error };
  const hd = dungHanhDong(d.triggerEvent, d.actions);
  if (!hd.ok) return { error: hd.error };

  const ctx = await chuanBi();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, user } = ctx;

  // `workflows.tenant_id` là NOT NULL và không có default — RLS `with check`
  // chỉ chặn SAI tiệm chứ không tự điền tiệm ĐÚNG (cùng bẫy đã dính ở màn Ưu đãi).
  const { data: tenantRow } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenantRow) return { error: "no_tenant" };

  const { error } = await supabase.from("workflows").insert({
    tenant_id: tenantRow.id,
    key: sinhKhoa(d.name),
    name: d.name,
    description: d.description,
    trigger_event: d.triggerEvent,
    conditions: dk.value,
    actions: hd.value,
    // Quy trình mới sinh ra ở trạng thái TẮT: người dựng đọc lại câu tóm tắt,
    // thấy đúng rồi mới bật. Bật sẵn nghĩa là một luật vừa gõ xong đã chạm vào
    // dữ liệu thật trước khi ai kịp đọc lại nó.
    is_active: false,
    is_system: false,
    created_by: user.id,
  });
  if (error) return { error: loiGhi(error.message) };

  revalidatePath("/app/settings/workflows");
  return { error: null };
}

export async function suaQuyTrinh(
  workflowId: string,
  input: QuyTrinhInput,
): Promise<ActionResult> {
  if (!z.uuid().safeParse(workflowId).success) return { error: "invalid_input" };
  const parsed = quyTrinhSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  const dk = dungDieuKien(d.triggerEvent, d.conditions);
  if (!dk.ok) return { error: dk.error };
  const hd = dungHanhDong(d.triggerEvent, d.actions);
  if (!hd.ok) return { error: hd.error };

  const ctx = await chuanBi();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  // Playbook cài sẵn CHỈ được bật/tắt. Hai lớp cùng lúc, cố ý:
  //  - đọc trước để nói được LÝ DO đúng ("đây là quy trình cài sẵn") thay vì
  //    một câu "không lưu được" chung chung;
  //  - `.eq("is_system", false)` ngay trong câu UPDATE để giữa hai lượt gọi
  //    không ai chen được vào. Ẩn nút Sửa ở giao diện KHÔNG phải một lớp chặn.
  const { data: hien } = await supabase
    .from("workflows")
    .select("id, is_system")
    .eq("id", workflowId)
    .maybeSingle();
  if (!hien) return { error: "khong_thay" };
  if (hien.is_system) return { error: "he_thong" };

  const { data, error } = await supabase
    .from("workflows")
    .update({
      name: d.name,
      description: d.description,
      trigger_event: d.triggerEvent,
      conditions: dk.value,
      actions: hd.value,
    })
    .eq("id", workflowId)
    .eq("is_system", false)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  // RLS chặn thì UPDATE không báo lỗi, chỉ chạm 0 dòng — không tự nhận ra thì
  // màn hình báo "đã lưu" trong khi chẳng lưu gì.
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/settings/workflows");
  return { error: null };
}

/**
 * Xoá một quy trình tự tạo. `workflow_runs.workflow_id` có `on delete cascade`
 * nên LỊCH SỬ CHẠY của nó mất theo — giao diện phải nói rõ điều đó trước khi hỏi
 * xác nhận, đây không phải thao tác lùi lại được.
 */
export async function xoaQuyTrinh(workflowId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(workflowId).success) return { error: "invalid_input" };

  const ctx = await chuanBi();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  const { data: hien } = await supabase
    .from("workflows")
    .select("id, is_system")
    .eq("id", workflowId)
    .maybeSingle();
  if (!hien) return { error: "khong_thay" };
  if (hien.is_system) return { error: "he_thong" };

  const { data, error } = await supabase
    .from("workflows")
    .delete()
    .eq("id", workflowId)
    .eq("is_system", false)
    .select("id");
  if (error) return { error: loiGhi(error.message) };
  if (!data || data.length === 0) return { error: "forbidden" };

  revalidatePath("/app/settings/workflows");
  return { error: null };
}
