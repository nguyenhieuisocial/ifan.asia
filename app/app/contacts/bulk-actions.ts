"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addActivity, addTagToContact, assignContactOwner } from "./actions";

/**
 * Thao tác hàng loạt trên danh sách Khách (V1b bước 5-6, mục 36.8-2).
 * Ba luật ngầm của thẻ design man-chon-nhieu.html:
 *  1. Hàng loạt gọi lại ĐÚNG hàm đơn lẻ — không đi tắt bằng SQL (QĐ-3).
 *  2. Ghi biên nhận (bulk_operations) TRƯỚC khi chạy.
 *  3. Bấm 2 lần / mạng chập không nhân đôi việc — operation_id + unique index
 *     bulk_operations_idempotent (migration #69) là cơ chế chống trùng THẬT.
 */

const MAX_BULK = 500; // trần cứng — khớp check(total <= 500) ở CSDL
const CHUNK = 25; // chạy song song theo lô để không vượt thời gian chờ server action

type BulkResult = {
  error: string | null;
  done: number;
  failed: number;
  failures: { id: string; reason: string }[];
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const EMPTY_FAIL: BulkResult["failures"] = [];

/**
 * Khung dùng chung cho mọi loại thao tác hàng loạt: ghi biên nhận trước, chạy
 * theo lô gọi lại hàm đơn lẻ, đóng biên nhận MỘT LẦN lúc xong (đúng 4 ràng
 * buộc CSDL của bulk_operations — không cộng dồn khi đang 'running').
 */
async function runBulk(
  action: "assign_owner" | "add_tag" | "create_task",
  contactIds: string[],
  paramsForReceipt: Record<string, unknown>,
  operationId: string,
  perContact: (contactId: string) => Promise<{ error: string | null }>,
): Promise<BulkResult> {
  const t = await getTranslations("contacts.errors");
  const idsParsed = z.array(z.uuid()).min(1).max(2000).safeParse(contactIds);
  const opIdParsed = z.string().trim().min(8).max(100).safeParse(operationId);
  if (!idsParsed.success || !opIdParsed.success) {
    return { error: t("invalidData"), done: 0, failed: 0, failures: EMPTY_FAIL };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired"), done: 0, failed: 0, failures: EMPTY_FAIL };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: t("tenantNotFound"), done: 0, failed: 0, failures: EMPTY_FAIL };

  // "500 đầu" — trần đã báo NGAY LÚC CHỌN ở client, đây là chốt lại phía server.
  const targetIds = idsParsed.data.slice(0, MAX_BULK);

  const { data: inserted, error: insertErr } = await supabase
    .from("bulk_operations")
    .insert({
      tenant_id: tenant.id,
      actor_id: user.id,
      action,
      entity_type: "contact",
      target_ids: targetIds,
      params: paramsForReceipt,
      total: targetIds.length,
      operation_id: opIdParsed.data,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // bulk_operations_idempotent chặn — đã chạy rồi (bấm 2 lần/mạng chập),
      // đọc lại đúng kết quả cũ, TUYỆT ĐỐI không chạy lại.
      const { data: existing } = await supabase
        .from("bulk_operations")
        .select("status, done_count, failed_count, failures")
        .eq("tenant_id", tenant.id)
        .eq("operation_id", opIdParsed.data)
        .maybeSingle();
      if (existing && existing.status !== "running") {
        return {
          error: null,
          done: existing.done_count,
          failed: existing.failed_count,
          failures: (existing.failures as BulkResult["failures"] | null) ?? EMPTY_FAIL,
        };
      }
    }
    return { error: t("bulkFailed"), done: 0, failed: 0, failures: EMPTY_FAIL };
  }

  let done = 0;
  const failures: BulkResult["failures"] = [];
  for (let i = 0; i < targetIds.length; i += CHUNK) {
    const chunk = targetIds.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map((id) => perContact(id)));
    results.forEach((res, idx) => {
      if (res.error) failures.push({ id: chunk[idx], reason: res.error });
      else done++;
    });
  }

  await supabase
    .from("bulk_operations")
    .update({
      status: "done",
      done_count: done,
      failed_count: failures.length,
      failures,
      finished_at: new Date().toISOString(),
    })
    .eq("id", inserted.id as string);

  revalidatePath("/app/contacts");
  return { error: null, done, failed: failures.length, failures };
}

/** "Giao cho…" — gọi lại assignContactOwner cho từng khách đã chọn. */
export async function bulkAssignOwner(
  contactIds: string[],
  ownerId: string,
  operationId: string,
): Promise<BulkResult> {
  const ownerParsed = z.uuid().safeParse(ownerId);
  if (!ownerParsed.success) {
    const t = await getTranslations("contacts.errors");
    return { error: t("invalidData"), done: 0, failed: 0, failures: EMPTY_FAIL };
  }
  return runBulk("assign_owner", contactIds, { owner_id: ownerParsed.data }, operationId, (id) =>
    assignContactOwner(id, ownerParsed.data),
  );
}

/** "Gắn nhãn" — gọi lại addTagToContact (upsert theo tên) cho từng khách đã chọn. */
export async function bulkAddTag(
  contactIds: string[],
  tagName: string,
  operationId: string,
): Promise<BulkResult> {
  const nameParsed = z.string().trim().min(1).max(50).safeParse(tagName);
  if (!nameParsed.success) {
    const t = await getTranslations("contacts.errors");
    return { error: t("tagNameRequired"), done: 0, failed: 0, failures: EMPTY_FAIL };
  }
  return runBulk("add_tag", contactIds, { name: nameParsed.data }, operationId, (id) =>
    addTagToContact(id, nameParsed.data),
  );
}

/** "Tạo việc" — gọi lại addActivity(type: "task") cho từng khách, người tạo tự phụ trách. */
export async function bulkCreateTask(
  contactIds: string[],
  input: { content: string; dueAt: string },
  operationId: string,
): Promise<BulkResult> {
  const parsed = z
    .object({ content: z.string().trim().min(1).max(4000), dueAt: z.iso.datetime() })
    .safeParse(input);
  if (!parsed.success) {
    const t = await getTranslations("contacts.errors");
    return { error: t("invalidData"), done: 0, failed: 0, failures: EMPTY_FAIL };
  }
  return runBulk(
    "create_task",
    contactIds,
    { content: parsed.data.content, due_at: parsed.data.dueAt },
    operationId,
    (id) => addActivity(id, { type: "task", content: parsed.data.content, dueAt: parsed.data.dueAt }),
  );
}
