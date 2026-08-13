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
