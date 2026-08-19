"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import type { StageKind } from "./types";

/**
 * Server actions màn Cơ hội. Quy ước như contacts/actions.ts: error là chuỗi ĐÃ DỊCH
 * theo locale hiện tại, client toast thẳng. Message zod = key trong
 * messages/<locale>.json namespace "deals.errors".
 *
 * Bảo mật: RLS (migration #4) là lưới cuối — deal chỉ đọc/ghi được trong tenant,
 * và staff chỉ chạm được deal mình phụ trách. Action vẫn tự verify auth + vai trò
 * trước khi chạm DB (defense in depth) theo mẫu settings/replies/actions.ts.
 */
type ActionResult = { error: string | null };

/** Vai được phép gán cơ hội cho người khác (khớp policy deals_insert/deals_update). */
const MANAGE_ROLES = ["owner", "admin", "manager"];

const dealInputSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(160, "titleTooLong"),
  contactId: z.uuid("contactRequired"),
  valueVnd: z
    .number()
    .int("valueInvalid")
    .min(0, "valueInvalid")
    .max(999_999_999_999, "valueTooLarge"),
  // <input type="date"> → yyyy-MM-dd
  expectedCloseDate: z.iso.date("dateInvalid").nullable(),
  stageId: z.uuid("stageRequired"),
  ownerId: z.uuid("ownerRequired"),
  // Luật đợt 1: deal mở BẮT BUỘC có việc kế tiếp (DB cũng chặn cứng)
  nextActionDate: z.iso.date("nextActionRequired"),
  nextActionNote: z.string().trim().max(500, "noteTooLong").nullable(),
});

export type DealInput = z.infer<typeof dealInputSchema>;

/**
 * Hạn việc kế tiếp = CUỐI NGÀY đã chọn theo giờ VN.
 * VN cố định UTC+7 (không có DST) nên ghép offset thẳng là chính xác tuyệt đối,
 * không phụ thuộc giờ máy chủ.
 */
function endOfDayVN(date: string): string {
  return `${date}T23:59:00+07:00`;
}

type Member = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenantId: string;
  role: string;
};

/**
 * Auth + membership dùng chung. Trả key lỗi chưa dịch để caller dịch theo namespace.
 *
 * ⚠️ KHÔNG tự viết lại `.from("tenant_members").select("role").eq("user_id", …)`.
 * Bản tự viết quên `status='active'` và quên `expires_at`, nên người VỪA BỊ GỠ
 * khỏi tiệm vẫn thao tác được toàn bộ màn Cơ hội trong lúc thẻ đăng nhập cũ còn
 * sống (~1 giờ) — và `role` mà nó trả ra còn điều khiển `MANAGE_ROLES` (gán cơ
 * hội cho người khác). Đo 20/08: `removeMember` chỉ đổi `status='removed'`, RLS
 * `deals_*` đọc vai từ CLAIM nên không gác, ghi thử vào `deals` thì CSDL cho qua
 * ⇒ chốt này là chốt DUY NHẤT. `getCurrentMembership` lọc đủ cả hai — dùng nó,
 * đừng viết hàm thứ ba.
 *
 * `tenant_id` lấy riêng qua `tenants` (RLS đã khoá đúng tiệm đang mở), cùng khuôn
 * với `requireMember` ở `app/app/contacts/import-export-actions.ts`.
 */
async function requireMember(): Promise<Member | { errorKey: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errorKey: "sessionExpired" };

  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !tenant) return { errorKey: "tenantNotFound" };

  return {
    supabase,
    userId: user.id,
    tenantId: tenant.id as string,
    role: member.role,
  };
}

type StageInfo = { id: string; kind: StageKind; pipeline_id: string };

/** Đọc stage đích (RLS đã giới hạn trong tenant) — null nếu không thấy. */
async function fetchStage(
  supabase: Member["supabase"],
  stageId: string,
): Promise<StageInfo | null> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id, kind, pipeline_id")
    .eq("id", stageId)
    .maybeSingle();
  return (data ?? null) as StageInfo | null;
}

/** Người phụ trách: staff luôn tự phụ trách; quản lý gán được cho thành viên khác. */
async function resolveOwner(
  m: Member,
  requestedOwnerId: string,
): Promise<string | null> {
  if (!MANAGE_ROLES.includes(m.role)) return m.userId;
  if (requestedOwnerId === m.userId) return m.userId;
  // `status='active'`: người VỪA BỊ GỠ khỏi tiệm (`removeMember` chỉ đổi
  // status='removed', settings/team/actions.ts) vẫn còn dòng trong
  // `tenant_members` — thiếu bộ lọc này thì quản lý GÁN ĐƯỢC cơ hội cho người
  // đã nghỉ, và cơ hội đó rơi vào tay không ai cầm. Cùng lớp lỗi mà
  // `getCurrentMembership` (lib/auth/membership.ts) đã chốt cho vai NGƯỜI GỌI;
  // đây là vế còn lại — NGƯỜI ĐƯỢC GÁN.
  const { data } = await m.supabase
    .from("tenant_members")
    .select("user_id")
    .eq("user_id", requestedOwnerId)
    .eq("status", "active")
    .maybeSingle();
  return data ? requestedOwnerId : null;
}

function revalidateDeal(contactId?: string | null, dealId?: string | null) {
  revalidatePath("/app/deals");
  if (dealId) revalidatePath(`/app/deals/${dealId}`);
  if (contactId) revalidatePath(`/app/contacts/${contactId}`);
}

export async function createDeal(
  input: DealInput,
): Promise<ActionResult & { id?: string }> {
  const t = await getTranslations("deals.errors");
  const parsed = dealInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const stage = await fetchStage(m.supabase, parsed.data.stageId);
  if (!stage) return { error: t("stageNotFound") };
  // Thắng/Thua đi qua luồng riêng (chốt giá trị cuối / bắt buộc lý do thua)
  if (stage.kind !== "open") return { error: t("stageMustBeOpen") };

  const ownerId = await resolveOwner(m, parsed.data.ownerId);
  if (!ownerId) return { error: t("ownerNotMember") };

  const { data, error } = await m.supabase
    .from("deals")
    .insert({
      tenant_id: m.tenantId,
      pipeline_id: stage.pipeline_id,
      stage_id: stage.id,
      contact_id: parsed.data.contactId,
      owner_id: ownerId,
      title: parsed.data.title,
      value_vnd: parsed.data.valueVnd,
      expected_close_date: parsed.data.expectedCloseDate,
      next_action_at: endOfDayVN(parsed.data.nextActionDate),
      next_action_note: parsed.data.nextActionNote || null,
      created_by: m.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: t("createFailed") };

  revalidateDeal(parsed.data.contactId, data.id as string);
  return { error: null, id: data.id as string };
}

export async function updateDeal(
  dealId: string,
  input: DealInput,
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const idParsed = z.uuid().safeParse(dealId);
  const parsed = dealInputSchema.safeParse(input);
  if (!idParsed.success) return { error: t("dealNotFound") };
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const { data: deal } = await m.supabase
    .from("deals")
    .select("id, status, stage_id, contact_id")
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: t("dealNotFound") };

  const ownerId = await resolveOwner(m, parsed.data.ownerId);
  if (!ownerId) return { error: t("ownerNotMember") };

  // Cơ hội ĐANG MỞ đổi được cột ngay trong form; cơ hội đã thắng/thua giữ nguyên
  // cột (mở lại = kéo thẻ về cột mở, xem moveDealStage) nên form không gửi stage.
  const stagePatch: { stage_id?: string; pipeline_id?: string } = {};
  if (deal.status === "open" && parsed.data.stageId !== deal.stage_id) {
    const stage = await fetchStage(m.supabase, parsed.data.stageId);
    if (!stage) return { error: t("stageNotFound") };
    if (stage.kind !== "open") return { error: t("stageMustBeOpen") };
    stagePatch.stage_id = stage.id;
    stagePatch.pipeline_id = stage.pipeline_id;
  }

  // RLS deals_update lọc thì .update() trả error=null và 0 dòng — im như lúc
  // thành công. Đếm dòng (khuôn rescheduleNextAction) để 0 dòng thành lời báo.
  const { data: updated, error } = await m.supabase
    .from("deals")
    .update({
      ...stagePatch,
      contact_id: parsed.data.contactId,
      owner_id: ownerId,
      title: parsed.data.title,
      value_vnd: parsed.data.valueVnd,
      expected_close_date: parsed.data.expectedCloseDate,
      next_action_at: endOfDayVN(parsed.data.nextActionDate),
      next_action_note: parsed.data.nextActionNote || null,
    })
    .eq("id", idParsed.data)
    .select("id")
    .maybeSingle();
  if (error) return { error: t("updateFailed") };
  if (!updated) return { error: t("noPermission") };

  revalidateDeal(deal.contact_id as string, idParsed.data);
  if (parsed.data.contactId !== deal.contact_id) revalidateDeal(parsed.data.contactId);
  return { error: null };
}

/**
 * B17 — Dời hẹn nhanh "việc kế tiếp": chỉ đổi đúng 2 trường (ngày hẹn + ghi chú),
 * KHÔNG đụng các trường khác của form sửa đầy đủ (updateDeal). Gọi từ dialog
 * "Hẹn tiếp" ở chi tiết cơ hội và dòng cơ hội trên màn "Hôm nay".
 */
const rescheduleSchema = z.object({
  nextActionDate: z.iso.date("dateInvalid"),
  nextActionNote: z.string().trim().max(500, "noteTooLong").nullable(),
});

export async function rescheduleNextAction(
  dealId: string,
  input: { nextActionDate: string; nextActionNote: string | null },
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const idParsed = z.uuid().safeParse(dealId);
  const parsed = rescheduleSchema.safeParse(input);
  if (!idParsed.success) return { error: t("dealNotFound") };
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  // RLS deals_update là lưới cuối (tenant + staff chỉ deal mình phụ trách).
  // 0 dòng đổi = deal đã xóa hoặc ngoài quyền → báo "không tìm thấy".
  const { data: updated, error } = await m.supabase
    .from("deals")
    .update({
      next_action_at: endOfDayVN(parsed.data.nextActionDate),
      next_action_note: parsed.data.nextActionNote || null,
    })
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .select("contact_id")
    .maybeSingle();
  if (error) return { error: t("updateFailed") };
  if (!updated) return { error: t("dealNotFound") };

  revalidateDeal(updated.contact_id as string, idParsed.data);
  // Dòng deal trên màn "Hôm nay" xếp theo next_action_at — làm mới luôn
  revalidatePath("/app/today");
  return { error: null };
}

/**
 * Kéo-thả sang cột MỞ (kể cả mở lại cơ hội đã thắng/thua).
 * Cột Thắng/Thua đi qua winDeal/loseDeal vì cần chốt giá trị / bắt buộc lý do.
 * deal_stage_history do trigger DB ghi (migration #4) — action không tự ghi.
 */
export async function moveDealStage(
  dealId: string,
  stageId: string,
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const parsed = z
    .object({ dealId: z.uuid(), stageId: z.uuid() })
    .safeParse({ dealId, stageId });
  if (!parsed.success) return { error: t("invalidData") };

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const stage = await fetchStage(m.supabase, parsed.data.stageId);
  if (!stage) return { error: t("stageNotFound") };
  if (stage.kind !== "open") return { error: t("stageMustBeOpen") };

  const { data: deal } = await m.supabase
    .from("deals")
    .select("id, next_action_at, contact_id, stage_id")
    .eq("id", parsed.data.dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: t("dealNotFound") };
  // Luật "deal mở phải có việc kế tiếp" — DB cũng chặn, báo lỗi hiểu được trước
  if (!deal.next_action_at) return { error: t("nextActionRequired") };

  // 0 dòng = RLS deals_update chặn (vai Chỉ xem, hoặc cơ hội của người khác) —
  // không báo thì thẻ lặng lẽ trượt về cột cũ mà không ai giải thích.
  const { data: moved, error } = await m.supabase
    .from("deals")
    .update({
      stage_id: stage.id,
      pipeline_id: stage.pipeline_id,
      status: "open",
      won_at: null,
      lost_at: null,
      lost_reason_id: null,
    })
    .eq("id", parsed.data.dealId)
    .select("id")
    .maybeSingle();
  if (error) return { error: t("moveFailed") };
  if (!moved) return { error: t("noPermission") };

  revalidateDeal(deal.contact_id as string, parsed.data.dealId);
  return { error: null };
}

/** Đánh thắng: chốt giá trị cuối + ghi ngày thắng (spec §4.4). */
export async function winDeal(
  dealId: string,
  stageId: string,
  valueVnd: number,
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const parsed = z
    .object({
      dealId: z.uuid(),
      stageId: z.uuid(),
      valueVnd: z.number().int().min(0).max(999_999_999_999),
    })
    .safeParse({ dealId, stageId, valueVnd });
  if (!parsed.success) return { error: t("valueInvalid") };

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const stage = await fetchStage(m.supabase, parsed.data.stageId);
  if (!stage) return { error: t("stageNotFound") };
  if (stage.kind !== "won") return { error: t("stageNotWon") };

  const { data: deal } = await m.supabase
    .from("deals")
    .select("id, contact_id, stage_id, owner_id")
    .eq("id", parsed.data.dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: t("dealNotFound") };

  const { data: won, error } = await m.supabase
    .from("deals")
    .update({
      stage_id: stage.id,
      pipeline_id: stage.pipeline_id,
      status: "won",
      won_at: new Date().toISOString(),
      lost_at: null,
      lost_reason_id: null,
      value_vnd: parsed.data.valueVnd,
    })
    .eq("id", parsed.data.dealId)
    .select("id")
    .maybeSingle();
  if (error) return { error: t("updateFailed") };
  // 0 dòng = RLS deals_update chặn — không được trả "thành công" rồi để client
  // toast "Đã đánh thắng" trong khi CSDL không đổi gì.
  if (!won) return { error: t("noPermission") };

  revalidateDeal(deal.contact_id as string, parsed.data.dealId);
  return { error: null };
}

/**
 * Bước 2 sau khi chốt thắng (B11): đặt việc hỏi thăm khách vào ngày đã chọn —
 * gắn cả contact_id để việc này hiện trong hồ sơ 360 của khách (như addDealActivity).
 *
 * CHỐNG TRÙNG: client chỉ mở bước 2 khi playbook "win_followup" (migration #50)
 * đang TẮT — playbook bật thì engine tự tạo việc hỏi thăm sau 7 ngày rồi,
 * gọi thêm action này sẽ ra hai việc trùng nhau.
 */
export async function scheduleWinFollowup(
  dealId: string,
  dueDate: string,
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const parsed = z
    .object({ dealId: z.uuid(), dueDate: z.iso.date("dateInvalid") })
    .safeParse({ dealId, dueDate });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const { data: deal } = await m.supabase
    .from("deals")
    .select("id, contact_id, owner_id, title")
    .eq("id", parsed.data.dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: t("dealNotFound") };

  // Giao cho người phụ trách cơ hội (cùng luật 'owner' của playbook). Staff chỉ
  // thắng được deal mình phụ trách nên owner_id luôn qua được RLS activities_insert.
  const tTask = await getTranslations("deals.followupTask");
  const { error } = await m.supabase.from("activities").insert({
    tenant_id: m.tenantId,
    type: "task",
    subject: tTask("subject"),
    body: tTask("body", { deal: deal.title }),
    deal_id: deal.id,
    contact_id: deal.contact_id,
    owner_id: (deal.owner_id as string | null) ?? m.userId,
    due_at: endOfDayVN(parsed.data.dueDate),
  });
  if (error) return { error: t("activityFailed") };

  revalidateDeal(deal.contact_id as string, deal.id as string);
  return { error: null };
}

/** Đánh mất: BẮT BUỘC lý do thua (spec §8 tiêu chí 8) + ghi chú tùy chọn vào timeline. */
export async function loseDeal(
  dealId: string,
  stageId: string,
  lostReasonId: string,
  note?: string,
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const parsed = z
    .object({
      dealId: z.uuid(),
      stageId: z.uuid(),
      lostReasonId: z.uuid("lostReasonRequired"),
      note: z.string().trim().max(500, "noteTooLong").optional(),
    })
    .safeParse({ dealId, stageId, lostReasonId, note });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "lostReasonRequired") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const stage = await fetchStage(m.supabase, parsed.data.stageId);
  if (!stage) return { error: t("stageNotFound") };
  if (stage.kind !== "lost") return { error: t("stageNotLost") };

  // Lý do thua phải thuộc tenant (RLS lost_reasons_select đã giới hạn)
  const { data: reason } = await m.supabase
    .from("lost_reasons")
    .select("id, name")
    .eq("id", parsed.data.lostReasonId)
    .maybeSingle();
  if (!reason) return { error: t("lostReasonRequired") };

  const { data: deal } = await m.supabase
    .from("deals")
    .select("id, contact_id, stage_id, value_vnd")
    .eq("id", parsed.data.dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: t("dealNotFound") };

  const { data: lost, error } = await m.supabase
    .from("deals")
    .update({
      stage_id: stage.id,
      pipeline_id: stage.pipeline_id,
      status: "lost",
      lost_at: new Date().toISOString(),
      won_at: null,
      lost_reason_id: parsed.data.lostReasonId,
    })
    .eq("id", parsed.data.dealId)
    .select("id")
    .maybeSingle();
  if (error) return { error: t("updateFailed") };
  // 0 dòng = RLS deals_update chặn. Phải dừng TRƯỚC khi ghi ghi chú thua, nếu
  // không dòng thời gian có lý do thua của một cơ hội chưa hề bị đánh mất.
  if (!lost) return { error: t("noPermission") };

  if (parsed.data.note) {
    // Ghi chú thua vào dòng thời gian; lỗi ở đây không hủy việc đánh mất
    await m.supabase.from("activities").insert({
      tenant_id: m.tenantId,
      type: "note",
      body: parsed.data.note,
      deal_id: parsed.data.dealId,
      contact_id: deal.contact_id,
      owner_id: m.userId,
      done_at: new Date().toISOString(), // ghi chú là nhật ký đã xảy ra, không phải việc chờ (B10)
    });
  }

  revalidateDeal(deal.contact_id as string, parsed.data.dealId);
  return { error: null };
}

/**
 * Ghi nhanh ghi chú / cuộc gọi / việc cần làm GẮN VỚI CƠ HỘI.
 * Gắn luôn contact_id của cơ hội để việc này cũng hiện trong hồ sơ 360 của khách
 * — một lịch sử duy nhất, không tách hai nơi.
 */
const dealActivitySchema = z
  .object({
    type: z.enum(["note", "call", "task"]),
    content: z.string().trim().min(1, "activityEmpty").max(2000, "activityTooLong"),
    dueAt: z.string().optional(),
  })
  .refine((v) => v.type !== "task" || !!v.dueAt, { message: "taskDueRequired" });

export async function addDealActivity(
  dealId: string,
  input: { type: "note" | "call" | "task"; content: string; dueAt?: string },
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const idParsed = z.uuid().safeParse(dealId);
  const parsed = dealActivitySchema.safeParse(input);
  if (!idParsed.success) return { error: t("dealNotFound") };
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "invalidData") };
  }

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const { data: deal } = await m.supabase
    .from("deals")
    .select("id, contact_id")
    .eq("id", idParsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!deal) return { error: t("dealNotFound") };

  const { error } = await m.supabase.from("activities").insert({
    tenant_id: m.tenantId,
    type: parsed.data.type,
    body: parsed.data.content,
    deal_id: deal.id,
    contact_id: deal.contact_id,
    owner_id: m.userId, // RLS staff: người ghi tự phụ trách
    due_at: parsed.data.dueAt ?? null,
    // note/call là nhật ký đã xảy ra → đóng ngay lúc ghi, không treo thành việc chờ (B10)
    done_at:
      parsed.data.type === "note" || parsed.data.type === "call"
        ? new Date().toISOString()
        : null,
  });
  if (error) return { error: t("activityFailed") };

  revalidateDeal(deal.contact_id as string, deal.id as string);
  return { error: null };
}

/** Tick/bỏ tick một việc trong dòng thời gian của cơ hội. */
export async function toggleDealActivityDone(
  activityId: string,
  done: boolean,
): Promise<ActionResult> {
  const t = await getTranslations("deals.errors");
  const parsed = z
    .object({ activityId: z.uuid(), done: z.boolean() })
    .safeParse({ activityId, done });
  if (!parsed.success) return { error: t("invalidData") };

  const m = await requireMember();
  if ("errorKey" in m) return { error: t(m.errorKey) };

  const { data: updated, error } = await m.supabase
    .from("activities")
    .update({ done_at: parsed.data.done ? new Date().toISOString() : null })
    .eq("id", parsed.data.activityId)
    .select("deal_id, contact_id")
    .maybeSingle();
  if (error || !updated) return { error: t("toggleFailed") };

  revalidateDeal(updated.contact_id as string | null, updated.deal_id as string | null);
  return { error: null };
}
