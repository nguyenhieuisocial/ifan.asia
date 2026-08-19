"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string | null };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Ngày/tháng/năm theo giờ VN (UTC+7, không lùi/tiến giờ) của một thời điểm. */
function vnDateParts(base: Date): { y: number; m: number; d: number } {
  const shifted = new Date(base.getTime() + 7 * 3_600_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

/** Thời điểm UTC ứng với `hour:00` giờ VN của một ngày VN cho trước — trừ thẳng 7 tiếng. */
function vnInstant(y: number, m: number, d: number, hour: number): Date {
  return new Date(Date.UTC(y, m, d, hour - 7, 0, 0));
}

/** "Hôm nay" khi kéo vào cột Hôm nay = cuối giờ làm hôm nay (18h) giờ VN. */
function todayEndVN(): Date {
  const { y, m, d } = vnDateParts(new Date());
  return vnInstant(y, m, d, 18);
}

/** "Sắp tới" khi kéo vào cột Sắp tới = sáng mai (9h) giờ VN — dời hẳn sang ngày kế. */
function tomorrowMorningVN(): Date {
  const { y, m, d } = vnDateParts(new Date());
  return vnInstant(y, m, d + 1, 9); // Date.UTC tự tràn ngày hợp lệ
}

export type TaskTarget = "today" | "upcoming" | "done";

/**
 * Kéo-thả đổi cột = đổi due_at (dời hạn) + done_at (đánh dấu xong/mở lại) tuỳ
 * đích thả. Không có đích "overdue" — không ai cố tình dời việc thành trễ hạn
 * (tasks-board.tsx không gắn onDrop cho cột đó).
 */
export async function moveTask(taskId: string, target: TaskTarget): Promise<ActionResult> {
  const t = await getTranslations("tasksBoard.errors");
  const idParsed = z.uuid().safeParse(taskId);
  if (!idParsed.success) return { error: t("invalidTask") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  // Rời "Đã xong" sang Hôm nay/Sắp tới thì mở lại (done_at=null) LUÔN kèm hạn
  // mới; kéo vào Đã xong thì chỉ đóng dấu xong, giữ nguyên due_at cũ.
  const update =
    target === "done"
      ? { done_at: new Date().toISOString() }
      : {
          due_at: (target === "today" ? todayEndVN() : tomorrowMorningVN()).toISOString(),
          done_at: null,
        };

  const { data: updated, error } = await supabase
    .from("activities")
    .update(update)
    .eq("id", idParsed.data)
    .eq("type", "task")
    .select("contact_id, deal_id")
    .maybeSingle();
  if (error || !updated) return { error: t("updateFailed") };

  revalidatePath("/app/tasks");
  if (updated.contact_id) revalidatePath(`/app/contacts/${updated.contact_id}`);
  if (updated.deal_id) revalidatePath(`/app/deals/${updated.deal_id}`);
  return { error: null };
}

/** Việc hiện ở 3 màn khác nhau — sửa/xoá xong phải làm mới cả 3, không chỉ bảng việc. */
type TaskLinks = { contact_id: string | null; deal_id: string | null; project_id: string | null };
function revalidateTaskLinks(row: TaskLinks) {
  revalidatePath("/app/tasks");
  if (row.contact_id) revalidatePath(`/app/contacts/${row.contact_id}`);
  if (row.deal_id) revalidatePath(`/app/deals/${row.deal_id}`);
  if (row.project_id) revalidatePath(`/app/projects/${row.project_id}`);
}

const taskEditSchema = z
  .object({
    /** TIÊU ĐỀ việc — cùng trần 200 ký tự với ô tạo việc ở màn Dự án. */
    subject: z.string().trim().max(200, "subjectTooLong"),
    /** NỘI DUNG/ghi chú — cột KHÁC, không phải bản sao của tiêu đề. */
    body: z.string().trim().max(4000, "bodyTooLong"),
    /** ISO; null = bỏ hạn. Cùng quy ước với ô đặt hạn lúc tạo việc (contacts/[id]/timeline.tsx). */
    dueAt: z.iso.datetime().nullable(),
  })
  // Được để trống MỘT ô, không được trống cả hai — việc không còn chữ nào thì
  // không ai đọc được nó nữa.
  .refine((v) => v.subject !== "" || v.body !== "", { message: "emptyTask" });

export type TaskEditInput = z.input<typeof taskEditSchema>;

/**
 * Sửa nội dung + hạn của một việc.
 *
 * Quyền KHÔNG viết lại ở đây: RLS `activities_update` (migration #65) đã canh
 * đủ — cùng tiệm, vai ≠ `viewer`, và (quản lý trở lên HOẶC việc của chính
 * mình). Viết lại luật ấy bằng TypeScript là dựng bản luật thứ hai để rồi hai
 * bản lệch nhau.
 *
 * NHƯNG phải tự đếm dòng: khi RLS lọc hết, `.update()` của Supabase trả về
 * `error = null` và KHÔNG dòng nào — im lặng y hệt lúc thành công. Không đếm
 * thì nhân viên sửa việc của người khác sẽ thấy báo "đã lưu" trong khi CSDL
 * không đổi gì. `.select()` để lấy đúng số dòng thật sự đụng được; 0 dòng =
 * không có quyền (hoặc việc vừa bị người khác xoá) → phải nói ra.
 *
 * `subject` và `body` là HAI THỨ KHÁC NHAU, không phải hai bản của cùng một
 * chữ: `subject` là tiêu đề việc, `body` là nội dung/ghi chú. Đo trên CSDL
 * thật: 47/48 việc có CẢ HAI và cả 47 đều khác nhau (việc dự án
 * `projects/actions.ts`, việc chăm sóc cơ hội `deals/actions.ts` đều ghi cả
 * hai). Nên hàm này nhận và ghi ĐỦ HAI CỘT. Bản đầu của việc này chỉ nhận
 * `body` rồi đặt `subject = null` — mở việc dự án ra sửa một chữ là mất trắng
 * ghi chú, không có thùng rác. Đừng lặp lại.
 */
export async function updateTask(taskId: string, input: TaskEditInput): Promise<ActionResult> {
  const t = await getTranslations("tasksBoard.errors");
  const idParsed = z.uuid().safeParse(taskId);
  if (!idParsed.success) return { error: t("invalidTask") };
  const parsed = taskEditSchema.safeParse(input);
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "invalidTask") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: rows, error } = await supabase
    .from("activities")
    .update({
      subject: parsed.data.subject || null,
      body: parsed.data.body || null,
      due_at: parsed.data.dueAt,
    })
    .eq("id", idParsed.data)
    .eq("type", "task")
    .select("contact_id, deal_id, project_id");
  if (error) return { error: t("updateFailed") };
  if (!rows?.length) return { error: t("notAllowed") };

  revalidateTaskLinks(rows[0]);
  return { error: null };
}

/**
 * Xoá hẳn một việc. Cùng luật đếm dòng như `updateTask` — `.delete()` bị RLS
 * lọc hết cũng không báo lỗi, nên 0 dòng phải thành lời báo "không có quyền"
 * chứ không phải một tiếng "đã xoá" trong khi việc vẫn nằm nguyên đó.
 */
export async function deleteTask(taskId: string): Promise<ActionResult> {
  const t = await getTranslations("tasksBoard.errors");
  const idParsed = z.uuid().safeParse(taskId);
  if (!idParsed.success) return { error: t("invalidTask") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { data: rows, error } = await supabase
    .from("activities")
    .delete()
    .eq("id", idParsed.data)
    .eq("type", "task")
    .select("contact_id, deal_id, project_id");
  if (error) return { error: t("deleteFailed") };
  if (!rows?.length) return { error: t("notAllowed") };

  revalidateTaskLinks(rows[0]);
  return { error: null };
}
