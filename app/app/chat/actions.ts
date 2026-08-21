"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  MAX_BODY_LENGTH,
  MESSAGE_LIMIT,
  detectMentions,
  type ChatMember,
  type ChatTin,
  type ChatTinLoad,
} from "./types";

/**
 * Chat nội bộ RIÊNG — migration #298.
 *
 * QUYỀN: RLS là bộ DUY NHẤT. Không kiểm lại tư cách thành viên ở đây — kho từng
 * có 13 file tự chép phép kiểm đó và thiếu sót. Người nghỉ việc mất quyền ngay
 * vì `current_tenant_id()` lọc theo `tenant_members.status`.
 *
 * ⚠️ Mọi INSERT phải tự lấy `tenant_id` rồi truyền vào: cột `not null` không có
 * default, và `with check` của RLS chỉ SO SÁNH chứ không điền hộ.
 */

type DbError = { code?: string; message: string; details?: string | null };

/** Mã lỗi CSDL → khoá i18n `chatRieng.errors.*`. */
function mapDbError(err: DbError): string {
  const message = `${err.message} ${err.details ?? ""}`;
  if (message.includes("chat_message_edit_window_closed")) return "editWindowClosed";
  if (message.includes("chat_message_deleted")) return "deletedMessage";
  if (message.includes("chat_message_undelete_forbidden")) return "undeleteForbidden";
  if (message.includes("chat_message_immutable")) return "immutable";
  if (message.includes("chat_dm_self")) return "dmSelf";
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

const EMPTY_LOAD: Omit<ChatTinLoad, "error"> = { messages: [], atLimit: false };

/**
 * Tải tin của MỘT kênh.
 *
 * Lấy MỚI NHẤT trước rồi đảo lại — trần 200 tin phải cắt phần CŨ, không phải
 * phần mới. Chạm trần thì nói ra bằng một dòng chữ chứ không im lặng cắt bớt.
 */
export async function taiTinKenh(input: { channelId: string }): Promise<ChatTinLoad> {
  const parsed = z.object({ channelId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput", ...EMPTY_LOAD };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, ...EMPTY_LOAD };

  const { data, error } = await auth.supabase
    .from("chat_messages")
    .select("id, sender_user_id, body, created_at, edited_at, deleted_at")
    .eq("channel_id", parsed.data.channelId)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_LIMIT + 1);
  if (error) return { error: "loadFailed", ...EMPTY_LOAD };

  const rows = (data ?? []) as {
    id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  }[];
  const atLimit = rows.length > MESSAGE_LIMIT;
  const messages: ChatTin[] = rows
    .slice(0, MESSAGE_LIMIT)
    .map((r) => ({
      id: r.id,
      senderUserId: r.sender_user_id,
      body: r.body,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
    }))
    .reverse();

  return { error: null, messages, atLimit };
}

const sendSchema = z.object({
  channelId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
});

/**
 * Gửi một tin, rồi khai người bị gọi tên.
 *
 * Thông báo sinh ra từ TRIGGER trên bảng `chat_mentions` (không phải trên việc
 * gửi tin) — nên tin thường KHÔNG báo cho ai, kể cả khi code sau này viết sai.
 */
export async function guiTinChat(input: {
  channelId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  const { data: message, error } = await auth.supabase
    .from("chat_messages")
    .insert({
      tenant_id: tenant.id,
      channel_id: parsed.data.channelId,
      sender_user_id: auth.userId,
      body: parsed.data.body,
    })
    .select("id")
    .single();
  if (error) return { error: mapDbError(error) };

  const { data: profiles, error: profErr } = await auth.supabase
    .from("profiles")
    .select("user_id, display_name");
  const { data: activeMembers, error: memErr } = await auth.supabase
    .from("tenant_members")
    .select("user_id")
    .eq("status", "active");
  // Tin ĐÃ ghi. Hỏng khâu dò tên thì KHÔNG được nuốt: nuốt nghĩa là @nhắc rơi âm
  // thầm trong khi người gửi thấy "đã gửi" — người được gọi không hề nhận thông
  // báo và không ai biết. Báo riêng để người gửi nhắn lại tên.
  if (profErr || memErr) return { error: "mentionFailed" };

  const activeIds = new Set(
    ((activeMembers ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );
  const members: ChatMember[] = ((profiles ?? []) as {
    user_id: string;
    display_name: string;
  }[])
    .filter((p) => activeIds.has(p.user_id))
    .map((p) => ({ userId: p.user_id, displayName: p.display_name }));

  const mentioned = detectMentions(parsed.data.body, members).filter((id) => id !== auth.userId);
  if (mentioned.length > 0) {
    const { error: mentionError } = await auth.supabase.from("chat_mentions").insert(
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
 * Sửa tin của CHÍNH MÌNH trong 15 phút.
 *
 * Không có dòng nào đổi = policy `chat_messages_update_own` từ chối (tin của
 * người khác). Báo `forbidden` chứ không báo "đã lưu" — đây đúng chỗ dễ nuốt lỗi
 * nhất: Supabase trả mảng rỗng chứ không trả lỗi khi RLS chặn UPDATE.
 */
export async function suaTinChat(input: {
  messageId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const parsed = z
    .object({ messageId: z.uuid(), body: z.string().trim().min(1).max(MAX_BODY_LENGTH) })
    .safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("chat_messages")
    .update({ body: parsed.data.body })
    .eq("id", parsed.data.messageId)
    .select("id");
  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: "forbidden" };
  return { error: null };
}

/** Xoá MỀM — để lại vệt. Không có đường xoá cứng cho bất kỳ ai (không có policy DELETE). */
export async function xoaTinChat(input: {
  messageId: string;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ messageId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("chat_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.messageId)
    .select("id");
  if (error) return { error: mapDbError(error) };
  if (!data || data.length === 0) return { error: "forbidden" };
  return { error: null };
}

/**
 * Mở (hoặc tìm lại) kênh riêng với một người.
 *
 * Việc chuẩn hoá cặp và chống trùng nằm TRONG RPC `chat_mo_kenh_rieng` — hai
 * người bấm cùng lúc vẫn ra MỘT kênh. Đừng dựng lại phép đó ở đây.
 */
export async function moKenhRieng(input: {
  userId: string;
}): Promise<{ error: string | null; channelId: string | null }> {
  const parsed = z.object({ userId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput", channelId: null };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, channelId: null };

  // Vai Chỉ xem không mở được kênh (mở kênh là GHI). Chốt thật ở policy
  // `chat_channels_insert`; đây chỉ để báo bằng câu người đọc hiểu thay vì để
  // RLS trả lỗi trống. Đọc vai qua `getCurrentMembership` — nơi DUY NHẤT được
  // phép hỏi vai của chính mình (cổng `scripts/soat-doc-vai.mjs`).
  const membership = await getCurrentMembership(auth.supabase, auth.userId);
  if (membership === null) return { error: "forbidden", channelId: null };
  if (membership.role === "viewer") return { error: "readOnlyRole", channelId: null };

  const { data, error } = await auth.supabase.rpc("chat_mo_kenh_rieng", {
    p_nguoi: parsed.data.userId,
  });
  if (error) return { error: mapDbError(error), channelId: null };
  if (!data) return { error: "saveFailed", channelId: null };
  return { error: null, channelId: data as string };
}

/**
 * Ghi mốc "đã đọc tới đây" — GHI XUỐNG CSDL, không phải chỉ sửa cache.
 *
 * Badge chưa đọc chỉ tắt trong bộ nhớ trình duyệt thì tải lại trang là con số cũ
 * hiện lại y nguyên, và màn chat không bao giờ dọn sạch được.
 */
export async function danhDauDaDoc(input: {
  channelId: string;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ channelId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.rpc("chat_danh_dau_da_doc", {
    p_channel: parsed.data.channelId,
  });
  if (error) return { error: mapDbError(error) };
  return { error: null };
}
