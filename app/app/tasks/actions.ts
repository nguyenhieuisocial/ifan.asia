"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

type ActionResult = { error: string | null };

/** Vai gán được việc cho NGƯỜI KHÁC — cùng danh sách với RLS `activities_update`. */
const MANAGE_ROLES = ["owner", "admin", "manager"];

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

/**
 * Người chịu trách nhiệm được phép ghi vào việc, hoặc `null` nếu không được.
 *
 * Hai vế, đúng khuôn `resolveOwner` của cơ hội (`deals/actions.ts`):
 *  · Vai KHÔNG quản lý thì luôn tự chịu — trả về chính người gọi. Nhân viên
 *    gửi thẳng id đồng nghiệp (sửa tay lời gọi) cũng chỉ thành lệnh ghi lại
 *    đúng người cũ, không lọt. Lưới đỡ cuối vẫn là RLS (đo được: ném 42501).
 *  · `status='active'`: người VỪA BỊ GỠ khỏi tiệm (`removeMember` chỉ đổi
 *    status='removed') vẫn còn dòng trong `tenant_members`. Thiếu bộ lọc này
 *    thì quản lý giao được việc cho người đã nghỉ — và vì nhân viên chỉ đọc
 *    được việc của chính mình, việc đó biến mất khỏi mọi màn hình trong tiệm.
 *    Kiểm bằng chính client của người gọi nên RLS đã khoanh sẵn đúng tiệm:
 *    người ngoài tiệm không có dòng nào trả về ⇒ bị chặn ở đây.
 */
async function resolveOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId: string,
  requestedOwnerId: string,
): Promise<string | null> {
  if (requestedOwnerId === currentUserId) return currentUserId;

  const member = await getCurrentMembership(supabase, currentUserId);
  if (!member || !MANAGE_ROLES.includes(member.role)) return currentUserId;

  const { data } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("user_id", requestedOwnerId)
    .eq("status", "active")
    .maybeSingle();
  return data ? requestedOwnerId : null;
}

/** Việc hiện ở 3 màn khác nhau — sửa/xoá xong phải làm mới cả 3, không chỉ bảng việc. */
type TaskLinks = { contact_id: string | null; deal_id: string | null; project_id: string | null };
function revalidateTaskLinks(row: TaskLinks) {
  revalidatePath("/app/tasks");
  if (row.contact_id) revalidatePath(`/app/contacts/${row.contact_id}`);
  if (row.deal_id) revalidatePath(`/app/deals/${row.deal_id}`);
  if (row.project_id) revalidatePath(`/app/projects/${row.project_id}`);
}

/**
 * BẢN VÁ — chỉ nhận những ô người dùng THẬT SỰ đã đổi, không nhận cả bốn ô.
 *
 * Bản trước nhận đủ `subject`+`body`+`dueAt` rồi ghi thẳng cả ba, lấy từ ảnh
 * chụp lúc MỞ cửa sổ. Đo trên CSDL thật (20/08, trong giao dịch rollback, hai
 * phiên mạo danh hai quản lý khác nhau):
 *   · 09:00 A mở cửa sổ · 09:05 B sửa GHI CHÚ và lưu xong · 09:10 A lưu (chỉ
 *     định sửa tiêu đề) ⇒ ghi chú của B **BỊ ĐẨY NGƯỢC** về bản 09:00. A tưởng
 *     mình chỉ sửa một chữ, không ai được báo.
 *   · Cùng kịch bản nhưng B **chuyển việc sang người khác**: việc **lặng lẽ
 *     quay về người cũ**. Đây là lý do phải vá TRƯỚC khi thêm ô người chịu
 *     trách nhiệm — cùng một con bệnh, nhưng hậu quả nhảy từ "mất một dòng ghi
 *     chú" lên "giao nhầm người, và người kia không biết".
 *   · ĐỐI CHỨNG cùng lần đo: gửi ĐÚNG ô đã đổi ⇒ thay đổi của B còn nguyên,
 *     thay đổi của A vẫn vào.
 *
 * Ô nào không có mặt trong `input` thì KHÔNG nằm trong lệnh ghi — cột đó giữ
 * nguyên giá trị mới nhất của máy chủ, không bị một ảnh chụp cũ đè lên.
 */
const taskEditSchema = z.object({
  /** TIÊU ĐỀ việc — cùng trần 200 ký tự với ô tạo việc ở màn Dự án. */
  subject: z.string().trim().max(200, "subjectTooLong").optional(),
  /** NỘI DUNG/ghi chú — cột KHÁC, không phải bản sao của tiêu đề. */
  body: z.string().trim().max(4000, "bodyTooLong").optional(),
  /** ISO; null = bỏ hạn. Cùng quy ước với ô đặt hạn lúc tạo việc (contacts/[id]/timeline.tsx). */
  dueAt: z.iso.datetime().nullable().optional(),
  /** Người chịu trách nhiệm mới. Cột `owner_id` đã có sẵn — KHÔNG thêm cột thứ hai. */
  ownerId: z.uuid().optional(),
});

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
 *
 * ĐỔI NGƯỜI CHỊU TRÁCH NHIỆM đi qua đúng hàm này, và phải canh THÊM hai chỗ mà
 * phép đếm dòng ở trên KHÔNG bắt được:
 *
 * 1. Lệnh ghi có thể NÉM LỖI thay vì trả 0 dòng. RLS canh hai vế: dòng CŨ (có
 *    được đụng việc này không) và dòng MỚI (sau khi sửa còn thuộc về mình
 *    không). Vế đầu lọc mất dòng ⇒ 0 dòng im lặng — phép đếm bắt được. Vế sau
 *    thì Postgres NÉM `42501`, nhánh đếm dòng không bao giờ chạy tới. Đo được
 *    đúng ca này: nhân viên tự chuyển việc của mình sang đồng nghiệp ⇒ 42501
 *    "new row violates row-level security policy", trong khi nhân viên sửa
 *    việc của NGƯỜI KHÁC ⇒ 0 dòng, không lỗi. Hai kiểu từ chối khác nhau,
 *    cùng phải ra một câu báo dễ hiểu.
 *
 * 2. CSDL KHÔNG có lưới đỡ cho người được giao. Cột `owner_id` không có ràng
 *    buộc nào nối tới danh sách người trong tiệm — đo được: quản lý giao việc
 *    cho một tài khoản HOÀN TOÀN NGOÀI TIỆM vẫn ghi được 1 dòng, không lỗi.
 *    Việc đó rơi vào tay không ai cầm và biến mất khỏi màn hình mọi nhân viên.
 *    Nên chốt chặn phải nằm ở đây (`resolveOwner`), đúng khuôn đang chạy cho
 *    cơ hội (`deals/actions.ts`).
 */
export async function updateTask(taskId: string, input: TaskEditInput): Promise<ActionResult> {
  const t = await getTranslations("tasksBoard.errors");
  const idParsed = z.uuid().safeParse(taskId);
  if (!idParsed.success) return { error: t("invalidTask") };
  const parsed = taskEditSchema.safeParse(input);
  if (!parsed.success) return { error: t(parsed.error.issues[0]?.message ?? "invalidTask") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  // Đọc bản MỚI NHẤT của việc trước khi ghi. Cần cho đúng một luật: "được để
  // trống MỘT ô, không được trống cả hai" — luật đó nói về TRẠNG THÁI CUỐI của
  // hàng, mà lệnh ghi từng phần chỉ mang theo ô đã đổi. Không đọc thì xoá
  // trắng tiêu đề của một việc chỉ-có-tiêu-đề sẽ lọt. RLS lọc mất ⇒ 0 dòng,
  // tức là không có quyền hoặc việc vừa bị xoá.
  const { data: hienTai } = await supabase
    .from("activities")
    .select("subject, body, owner_id")
    .eq("id", idParsed.data)
    .eq("type", "task")
    .maybeSingle();
  if (!hienTai) return { error: t("notAllowed") };

  const subjectCuoi = parsed.data.subject ?? hienTai.subject ?? "";
  const bodyCuoi = parsed.data.body ?? hienTai.body ?? "";
  if (subjectCuoi.trim() === "" && bodyCuoi.trim() === "") return { error: t("emptyTask") };

  const patch: {
    subject?: string | null;
    body?: string | null;
    due_at?: string | null;
    owner_id?: string;
  } = {};
  if (parsed.data.subject !== undefined) patch.subject = parsed.data.subject || null;
  if (parsed.data.body !== undefined) patch.body = parsed.data.body || null;
  if (parsed.data.dueAt !== undefined) patch.due_at = parsed.data.dueAt;

  if (parsed.data.ownerId !== undefined) {
    const ownerId = await resolveOwner(supabase, user.id, parsed.data.ownerId);
    if (!ownerId) return { error: t("ownerNotMember") };
    // Chỉ đưa vào lệnh ghi khi THẬT SỰ khác người đang giữ — vai không được
    // gán cho người khác thì `resolveOwner` trả về chính họ, và ghi lại đúng
    // giá trị cũ chỉ tổ làm hàng "đổi" một cách vô nghĩa (bật trigger, bắn
    // thông báo giả). So với giá trị mới nhất của máy chủ, không so với ảnh
    // chụp lúc mở cửa sổ.
    if (ownerId !== hienTai.owner_id) patch.owner_id = ownerId;
  }

  // Không ô nào đổi (mở ra rồi bấm Lưu luôn) — không gửi lệnh ghi nào cả.
  // `update` rỗng của PostgREST là lỗi, và dù có chạy được thì vẫn bật
  // `updated_at` cho một thao tác không đổi gì.
  if (Object.keys(patch).length === 0) return { error: null };

  const { data: rows, error } = await supabase
    .from("activities")
    .update(patch)
    .eq("id", idParsed.data)
    .eq("type", "task")
    .select("contact_id, deal_id, project_id");
  // 42501 = vế "dòng mới" của RLS chặn (xem chú thích 1 ở trên). Đây là chặn vì
  // QUYỀN, không phải trục trặc — phải nói đúng câu quyền, không phải "thử lại
  // sau" (thử lại bao nhiêu lần cũng thế).
  if (error) return { error: error.code === "42501" ? t("notAllowed") : t("updateFailed") };
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
