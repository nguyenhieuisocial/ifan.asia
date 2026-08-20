"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  MAX_BODY_LENGTH,
  MESSAGE_LIMIT,
  detectMentions,
  type ChatLoad,
  type ChatMember,
  type ChatMessage,
} from "./types";

/**
 * Chat nội bộ — thẻ `man-chat-noi-bo.html`, migration #169.
 *
 * QUYỀN ĐỌC THỪA HƯỞNG TỪ VIỆC: không có lớp kiểm quyền nào ở đây. Hàm
 * `internal_thread_doc_duoc` (security INVOKER) hỏi lại đúng policy của
 * orders/appointments/contacts/purchases/stocktakes — đó là bộ quyền DUY NHẤT.
 * Thêm một lần kiểm ở tầng web là dựng bộ thứ hai, đúng thứ quyết định 4 cấm.
 *
 * ⚠️ Mọi INSERT phải tự lấy `tenant_id` rồi truyền vào: cột `not null` không có
 * default và `with check` của RLS chỉ so sánh, không điền hộ.
 */

const entitySchema = z.object({
  entityType: z.enum(["order", "appointment", "contact", "stock_doc"]),
  entityId: z.uuid(),
});

type DbError = { code?: string; message: string; details?: string | null };

/** Mã lỗi CSDL → khoá i18n `internalChat.errors.*`. */
function mapDbError(err: DbError): string {
  const message = `${err.message} ${err.details ?? ""}`;
  if (message.includes("internal_message_edit_window_closed")) return "editWindowClosed";
  if (message.includes("internal_message_deleted")) return "deletedMessage";
  if (message.includes("internal_message_undelete_forbidden")) return "undeleteForbidden";
  if (message.includes("internal_message_immutable")) return "immutable";
  if (/row-level security/i.test(err.message)) return "forbidden";
  if (/violates check constraint/i.test(err.message)) return "invalidInput";
  return "saveFailed";
}

async function requireAuth(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notAuthenticated" };
  return { ok: true, supabase, userId: user.id };
}

const EMPTY_LOAD: Omit<ChatLoad, "error"> = {
  messages: [],
  members: [],
  currentUserId: null,
  canWrite: false,
  atLimit: false,
};

/**
 * Tải cuộc trao đổi của MỘT việc.
 *
 * Hỏi `internal_thread_doc_duoc` TRƯỚC rồi mới đọc thread. Vì sao không đọc
 * thẳng: thread chưa tồn tại và thread không được phép đọc đều trả về rỗng —
 * nhập nhằng đúng hai chuyện phải nói khác nhau ("chưa ai trao đổi gì" vs "bạn
 * không xem được hồ sơ này"). Người dùng đọc "chưa có tin nào" rồi tưởng mình
 * đã thấy hết là kiểu lỗi im lặng tệ nhất.
 */
export async function taiTraoDoiNoiBo(input: {
  entityType: string;
  entityId: string;
}): Promise<ChatLoad> {
  const parsed = entitySchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput", ...EMPTY_LOAD };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, ...EMPTY_LOAD };

  const { data: readable, error: rpcError } = await auth.supabase.rpc(
    "internal_thread_doc_duoc",
    { p_entity_type: parsed.data.entityType, p_entity_id: parsed.data.entityId },
  );
  if (rpcError) return { error: "loadFailed", ...EMPTY_LOAD };
  if (readable !== true) return { error: "noAccess", ...EMPTY_LOAD };

  const [threadRes, profilesRes, membersRes] = await Promise.all([
    auth.supabase
      .from("internal_threads")
      .select("id")
      .eq("entity_type", parsed.data.entityType)
      .eq("entity_id", parsed.data.entityId)
      .maybeSingle(),
    auth.supabase.from("profiles").select("user_id, display_name"),
    // Chỉ người còn trong tiệm mới gọi tên được (policy
    // `internal_mentions_insert`) — ô gợi ý tên phải nói đúng danh sách đó,
    // không lấy mọi profile từng thấy.
    auth.supabase.from("tenant_members").select("user_id").eq("status", "active"),
  ]);

  const activeIds = new Set(
    ((membersRes.data ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  const members: ChatMember[] = ((profilesRes.data ?? []) as {
    user_id: string;
    display_name: string;
  }[])
    .filter((p) => activeIds.has(p.user_id))
    .map((p) => ({ userId: p.user_id, displayName: p.display_name }));

  // `viewer` đọc được nhưng không ghi (policy insert loại viewer). Đọc vai qua
  // `getCurrentMembership` — nơi DUY NHẤT được phép hỏi vai của chính mình
  // (cổng kiểm `scripts/soat-doc-vai.mjs`, lỗi thật 19/08).
  const membership = await getCurrentMembership(auth.supabase, auth.userId);
  const canWrite = membership !== null && membership.role !== "viewer";

  if (!threadRes.data) {
    return { error: null, ...EMPTY_LOAD, members, currentUserId: auth.userId, canWrite };
  }

  const { data: rows, error } = await auth.supabase
    .from("internal_messages")
    .select("id, sender_user_id, body, created_at, edited_at, deleted_at")
    .eq("thread_id", threadRes.data.id)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_LIMIT);
  if (error) return { error: "loadFailed", ...EMPTY_LOAD, members, currentUserId: auth.userId };

  const raw = (rows ?? []) as {
    id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  }[];
  const messages: ChatMessage[] = raw
    .map((row) => ({
      id: row.id,
      senderUserId: row.sender_user_id,
      // Xoá MỀM giữ nguyên `body` trong CSDL (bằng chứng), nhưng màn hình chỉ
      // để lại VỆT — chữ không được rời máy chủ, nếu không thì "đã xoá" chỉ là
      // lời hứa của giao diện.
      body: row.deleted_at ? "" : row.body,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
    }))
    .reverse();

  return {
    error: null,
    messages,
    members,
    currentUserId: auth.userId,
    canWrite,
    atLimit: raw.length >= MESSAGE_LIMIT,
  };
}

const sendSchema = entitySchema.extend({
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
});

/**
 * Gửi một tin. Thread được mở LAZY ngay lần nhắn đầu tiên — không tạo sẵn
 * thread rỗng cho mọi đơn hàng, vì thread rỗng chỉ làm bảng phình mà không nói
 * thêm điều gì.
 */
export async function guiTinNoiBo(input: {
  entityType: string;
  entityId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  const threadId = await moThread(
    auth.supabase,
    tenant.id as string,
    auth.userId,
    parsed.data.entityType,
    parsed.data.entityId,
  );
  if (!threadId.id) return { error: threadId.error ?? "saveFailed" };

  const { data: message, error } = await auth.supabase
    .from("internal_messages")
    .insert({
      tenant_id: tenant.id,
      thread_id: threadId.id,
      sender_user_id: auth.userId,
      body: parsed.data.body,
    })
    .select("id")
    .single();
  if (error) return { error: mapDbError(error) };

  // Gọi tên ⇒ thông báo. Trigger nằm trên BẢNG MENTION (quyết định 3), nên tin
  // thường không báo cho ai — đúng ý thẻ, không phải quên.
  const { data: profiles, error: profErr } = await auth.supabase
    .from("profiles")
    .select("user_id, display_name");
  const { data: activeMembers, error: memErr } = await auth.supabase
    .from("tenant_members")
    .select("user_id")
    .eq("status", "active");
  // Rà 20/08: đọc danh sách người để dò @nhắc-tên — hỏng thì KHÔNG được nuốt.
  // Nuốt thì @nhắc rơi âm thầm mà vẫn báo gửi thành công (người được gọi không
  // hề nhận thông báo). Tin đã ghi ở trên; báo lỗi để người gửi nhắn lại tên.
  if (profErr || memErr) return { error: "mentionFailed" };
  const activeIds = new Set(
    ((activeMembers ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  const members: ChatMember[] = ((profiles ?? []) as {
    user_id: string;
    display_name: string;
  }[])
    .filter((p) => activeIds.has(p.user_id))
    .map((p) => ({ userId: p.user_id, displayName: p.display_name }));

  const mentioned = detectMentions(parsed.data.body, members).filter((id) => id !== auth.userId);
  if (mentioned.length > 0) {
    // Tin ĐÃ ghi rồi: gọi tên hỏng thì không được nuốt lỗi, nhưng cũng không
    // được làm hỏng cả việc gửi — báo riêng để người gửi biết mà nhắn lại tên.
    const { error: mentionError } = await auth.supabase.from("internal_mentions").insert(
      mentioned.map((userId) => ({
        tenant_id: tenant.id,
        message_id: message.id,
        mentioned_user_id: userId,
      })),
    );
    if (mentionError) return { error: "mentionFailed" };
  }

  return { error: null };
}

/**
 * Mở (hoặc tìm lại) thread của một việc. Ràng buộc unique
 * `internal_threads_mot_viec_mot_thread` là chốt chặn thật cho "một việc một
 * chỗ bàn": hai người cùng nhắn câu đầu tiên thì một trong hai ăn 23505 và
 * chúng ta đọc lại dòng của người kia, không tạo thread thứ hai.
 */
async function moThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string,
  entityType: string,
  entityId: string,
): Promise<{ id: string | null; error?: string }> {
  const existing = await supabase
    .from("internal_threads")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (existing.data?.id) return { id: existing.data.id as string };

  const { data, error } = await supabase
    .from("internal_threads")
    .insert({
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (!error) return { id: data.id as string };

  if (error.code === "23505") {
    const retry = await supabase
      .from("internal_threads")
      .select("id")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();
    if (retry.data?.id) return { id: retry.data.id as string };
  }
  return { id: null, error: mapDbError(error) };
}

const editSchema = z.object({
  messageId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
});

/**
 * Sửa tin. Cửa sổ 15 phút do TRIGGER giữ — màn hình chỉ giấu nút cho đỡ bấm
 * hụt. Lỗi `editWindowClosed` vẫn phải dịch được, vì tab mở lâu thì nút cũ còn
 * nằm đó trong lúc cửa sổ đã đóng.
 */
export async function suaTinNoiBo(input: {
  messageId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("internal_messages")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.messageId)
    .select("id")
    .maybeSingle();
  if (error) return { error: mapDbError(error) };
  // Không có dòng nào đổi = policy `internal_messages_update_own` từ chối: tin
  // của người khác. Chủ tiệm cũng vào đây — cố ý (thẻ quyết định 5).
  if (!data) return { error: "notMine" };
  return { error: null };
}

/** Xoá MỀM — để lại vệt. Không có đường xoá cứng, kể cả cho chủ tiệm. */
export async function xoaTinNoiBo(input: {
  messageId: string;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ messageId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("internal_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.messageId)
    .select("id")
    .maybeSingle();
  if (error) return { error: mapDbError(error) };
  if (!data) return { error: "notMine" };
  return { error: null };
}
