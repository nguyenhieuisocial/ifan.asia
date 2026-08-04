"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
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

/**
 * Nguồn của khách gắn với cơ hội — đi kèm deal.created/deal.won để quy kết
 * doanh thu theo nguồn (catalog: source_attribution). Lỗi/không thấy → null.
 */
async function contactSourceId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string | null,
): Promise<string | null> {
  if (!contactId) return null;
  const { data } = await supabase
    .from("contacts")
    .select("source_id")
    .eq("id", contactId)
    .maybeSingle();
  return (data?.source_id as string | null) ?? null;
}

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

/** Auth + membership dùng chung. Trả key lỗi chưa dịch để caller dịch theo namespace. */
async function requireMember(): Promise<Member | { errorKey: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errorKey: "sessionExpired" };

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return { errorKey: "tenantNotFound" };

  return {
    supabase,
    userId: user.id,
    tenantId: member.tenant_id as string,
    role: member.role as string,
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
  const { data } = await m.supabase
    .from("tenant_members")
    .select("user_id")
    .eq("user_id", requestedOwnerId)
    .maybeSingle();
  return data ? requestedOwnerId : null;
}

function revalidateDeal(contactId?: string | null) {
  revalidatePath("/app/deals");
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

  await emitEvent(m.supabase, {
    type: "deal.created",
    aggregateType: "deal",
    aggregateId: data.id as string,
    payload: {
      pipeline_id: stage.pipeline_id,
      stage_id: stage.id,
      value_vnd: parsed.data.valueVnd,
      contact_id: parsed.data.contactId,
      source_id: await contactSourceId(m.supabase, parsed.data.contactId),
      owner_id: ownerId,
    },
  });

  revalidateDeal(parsed.data.contactId);
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

  const { error } = await m.supabase
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
    .eq("id", idParsed.data);
  if (error) return { error: t("updateFailed") };

  if (stagePatch.stage_id) {
    await emitEvent(m.supabase, {
      type: "deal.stage_changed",
      aggregateType: "deal",
      aggregateId: idParsed.data,
      payload: { old_stage_id: deal.stage_id, new_stage_id: stagePatch.stage_id },
    });
  }

  revalidateDeal(deal.contact_id as string);
  if (parsed.data.contactId !== deal.contact_id) revalidateDeal(parsed.data.contactId);
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

  const { error } = await m.supabase
    .from("deals")
    .update({
      stage_id: stage.id,
      pipeline_id: stage.pipeline_id,
      status: "open",
      won_at: null,
      lost_at: null,
      lost_reason_id: null,
    })
    .eq("id", parsed.data.dealId);
  if (error) return { error: t("moveFailed") };

  if (deal.stage_id !== stage.id) {
    await emitEvent(m.supabase, {
      type: "deal.stage_changed",
      aggregateType: "deal",
      aggregateId: parsed.data.dealId,
      payload: { old_stage_id: deal.stage_id, new_stage_id: stage.id },
    });
  }

  revalidateDeal(deal.contact_id as string);
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

  const { error } = await m.supabase
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
    .eq("id", parsed.data.dealId);
  if (error) return { error: t("updateFailed") };

  if (deal.stage_id !== stage.id) {
    await emitEvent(m.supabase, {
      type: "deal.stage_changed",
      aggregateType: "deal",
      aggregateId: parsed.data.dealId,
      payload: { old_stage_id: deal.stage_id, new_stage_id: stage.id },
    });
  }
  await emitEvent(m.supabase, {
    type: "deal.won",
    aggregateType: "deal",
    aggregateId: parsed.data.dealId,
    payload: {
      value_vnd: parsed.data.valueVnd,
      contact_id: deal.contact_id,
      source_id: await contactSourceId(m.supabase, deal.contact_id as string | null),
      owner_id: deal.owner_id,
    },
  });

  revalidateDeal(deal.contact_id as string);
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

  const { error } = await m.supabase
    .from("deals")
    .update({
      stage_id: stage.id,
      pipeline_id: stage.pipeline_id,
      status: "lost",
      lost_at: new Date().toISOString(),
      won_at: null,
      lost_reason_id: parsed.data.lostReasonId,
    })
    .eq("id", parsed.data.dealId);
  if (error) return { error: t("updateFailed") };

  if (deal.stage_id !== stage.id) {
    await emitEvent(m.supabase, {
      type: "deal.stage_changed",
      aggregateType: "deal",
      aggregateId: parsed.data.dealId,
      payload: { old_stage_id: deal.stage_id, new_stage_id: stage.id },
    });
  }
  await emitEvent(m.supabase, {
    type: "deal.lost",
    aggregateType: "deal",
    aggregateId: parsed.data.dealId,
    payload: {
      reason: reason.name,
      lost_reason_id: reason.id,
      contact_id: deal.contact_id,
      value_vnd: deal.value_vnd,
    },
  });

  if (parsed.data.note) {
    // Ghi chú thua vào dòng thời gian; lỗi ở đây không hủy việc đánh mất
    await m.supabase.from("activities").insert({
      tenant_id: m.tenantId,
      type: "note",
      body: parsed.data.note,
      deal_id: parsed.data.dealId,
      contact_id: deal.contact_id,
      owner_id: m.userId,
    });
  }

  revalidateDeal(deal.contact_id as string);
  return { error: null };
}
