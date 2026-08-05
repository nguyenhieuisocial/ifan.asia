"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchAssignedTickets, fetchDisplayNames, fetchMyRequests } from "./queries";
import type { MyRequestRow, TicketRow } from "./types";

type DecideResult = { error: string | null; result?: string };

/**
 * Quyết định một phiếu. TOÀN BỘ kiểm quyền + tính idempotent nằm trong RPC
 * `wf_decide_approval` (migration #29, SECURITY DEFINER): chỉ người CÓ TÊN trong
 * danh sách được giao mới ghi được, bấm 2 lần chỉ ăn 1 lần. Hai bảng phiếu
 * KHÔNG có policy ghi nên không có đường vòng qua API.
 */
export async function decideApproval(
  requestId: string,
  decision: "approved" | "rejected",
  note: string | null,
): Promise<DecideResult> {
  const parsed = z
    .object({
      requestId: z.uuid(),
      decision: z.enum(["approved", "rejected"]),
      note: z.string().max(500).nullable(),
    })
    .safeParse({ requestId, decision, note: note?.trim() || null });
  if (!parsed.success) return { error: "invalid_input" };
  if (parsed.data.decision === "rejected" && !parsed.data.note) {
    return { error: "note_required" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data, error } = await supabase.rpc("wf_decide_approval", {
    p_request: parsed.data.requestId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note,
  });
  if (error) return { error: "failed" };

  const result = data as string;
  if (result === "approved" || result === "next_level" || result === "rejected") {
    revalidatePath("/app/approvals");
    return { error: null, result };
  }
  return { error: result };
}

const offsetSchema = z.number().int().min(0).max(100000);

/**
 * Trang phiếu kế tiếp cho nút "Tải thêm". Đọc thuần, đi qua client đã đăng nhập
 * nên RLS áp nguyên; không revalidate gì cả.
 */
export async function loadMoreAssigned(
  kind: "pending" | "handled",
  offset: number,
): Promise<TicketRow[]> {
  const parsed = z
    .object({ kind: z.enum(["pending", "handled"]), offset: offsetSchema })
    .safeParse({ kind, offset });
  if (!parsed.success) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const names = await fetchDisplayNames(supabase);
  const tOwner = await getTranslations("contacts.owner");
  const nameOf = (id: string | null | undefined) =>
    id ? (names.get(id) ?? tOwner("member", { id: id.slice(0, 8) })) : null;

  return fetchAssignedTickets(
    supabase,
    user.id,
    parsed.data.kind,
    parsed.data.offset,
    nameOf,
  );
}

/** Trang yêu cầu kế tiếp của chính tôi (tab "Yêu cầu của tôi"). */
export async function loadMoreMyRequests(offset: number): Promise<MyRequestRow[]> {
  const parsed = offsetSchema.safeParse(offset);
  if (!parsed.success) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const names = await fetchDisplayNames(supabase);
  const tOwner = await getTranslations("contacts.owner");
  const nameOf = (id: string | null | undefined) =>
    id ? (names.get(id) ?? tOwner("member", { id: id.slice(0, 8) })) : null;

  return fetchMyRequests(supabase, user.id, parsed.data, nameOf);
}

/** Giá trị một ô: đúng những kiểu jsonb mà `wf_validate_form_data()` chấp nhận. */
const valueSchema = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(80)).max(30),
  z.null(),
]);

/**
 * Nộp một biểu mẫu. Kiểm dữ liệu THẬT nằm ở RPC `wf_submit_form` (ô bắt buộc,
 * đúng kiểu, đúng danh sách lựa chọn, không ô lạ) — chỗ này chỉ chặn rác sớm.
 */
export async function submitForm(
  formId: string,
  data: Record<string, unknown>,
): Promise<{ error: string | null; requestId?: string | null }> {
  const parsed = z
    .object({ formId: z.uuid(), data: z.record(z.string().max(40), valueSchema) })
    .safeParse({ formId, data });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: res, error } = await supabase.rpc("wf_submit_form", {
    p_form: parsed.data.formId,
    p_data: parsed.data.data,
  });
  if (error) return { error: "failed" };

  const out = (res ?? {}) as { error?: string; request_id?: string | null };
  if (out.error) return { error: out.error };

  revalidatePath("/app/approvals");
  return { error: null, requestId: out.request_id ?? null };
}
