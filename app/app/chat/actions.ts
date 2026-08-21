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
  MAX_TEN_KENH,
  chuanHoaTenKenh,
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

  // Chỉ tin nằm THẲNG trong kênh (`parent_id is null`). Câu trả lời trong luồng
  // KHÔNG lẫn vào dòng chính — đó là toàn bộ điểm của luồng trả lời: kênh chung
  // giữ được mạch, còn bốn câu qua lại về một việc thì nằm gọn một chỗ.
  const { data, error } = await auth.supabase
    .from("chat_messages")
    .select("id, sender_user_id, body, created_at, edited_at, deleted_at, parent_id")
    .eq("channel_id", parsed.data.channelId)
    .is("parent_id", null)
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
    parent_id: string | null;
  }[];
  const atLimit = rows.length > MESSAGE_LIMIT;
  const hien = rows.slice(0, MESSAGE_LIMIT);
  const ids = hien.map((r) => r.id);

  // Đếm câu trả lời và gom cảm xúc cho ĐÚNG những tin đang hiện.
  // ⚠️ Hai truy vấn này KHÔNG được làm hỏng cả màn nếu lỗi: thiếu con số "4 câu
  //   trả lời" thì khó chịu, mất cả kênh tin nhắn thì hỏng việc. Nên chúng trả
  //   về rỗng khi lỗi, còn truy vấn CHÍNH ở trên thì vẫn báo `loadFailed`.
  const [traLoiRes, camXucRes] = ids.length
    ? await Promise.all([
        auth.supabase
          .from("chat_messages")
          .select("parent_id, created_at")
          .in("parent_id", ids)
          .is("deleted_at", null),
        auth.supabase
          .from("chat_reactions")
          .select("message_id, emoji, user_id")
          .in("message_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  const demTraLoi = new Map<string, { n: number; cuoi: string }>();
  for (const r of (traLoiRes.data ?? []) as { parent_id: string; created_at: string }[]) {
    const cu = demTraLoi.get(r.parent_id);
    demTraLoi.set(r.parent_id, {
      n: (cu?.n ?? 0) + 1,
      cuoi: !cu || r.created_at > cu.cuoi ? r.created_at : cu.cuoi,
    });
  }

  const camXucTheoTin = new Map<string, Map<string, { soNguoi: number; toiDaTha: boolean }>>();
  for (const r of (camXucRes.data ?? []) as {
    message_id: string;
    emoji: string;
    user_id: string;
  }[]) {
    if (!camXucTheoTin.has(r.message_id)) camXucTheoTin.set(r.message_id, new Map());
    const theoEmoji = camXucTheoTin.get(r.message_id)!;
    const cu = theoEmoji.get(r.emoji) ?? { soNguoi: 0, toiDaTha: false };
    theoEmoji.set(r.emoji, {
      soNguoi: cu.soNguoi + 1,
      toiDaTha: cu.toiDaTha || r.user_id === auth.userId,
    });
  }

  const messages: ChatTin[] = hien
    .map((r) => {
      const tl = demTraLoi.get(r.id);
      return {
        id: r.id,
        senderUserId: r.sender_user_id,
        body: r.body,
        createdAt: r.created_at,
        editedAt: r.edited_at,
        deletedAt: r.deleted_at,
        parentId: r.parent_id,
        soTraLoi: tl?.n ?? 0,
        traLoiCuoiLuc: tl?.cuoi ?? null,
        camXuc: [...(camXucTheoTin.get(r.id) ?? new Map())].map(([emoji, v]) => ({
          emoji,
          soNguoi: v.soNguoi,
          toiDaTha: v.toiDaTha,
        })),
      };
    })
    .reverse();

  return { error: null, messages, atLimit };
}

const sendSchema = z.object({
  channelId: z.uuid(),
  body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
  /** Có giá trị ⇒ đây là câu TRẢ LỜI trong luồng của tin đó (#307). */
  parentId: z.uuid().nullish(),
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
  parentId?: string | null;
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
      // Trigger `chat_messages_luong_mot_tang` canh ba luật: tin gốc phải tồn
      // tại, phải cùng kênh, và KHÔNG được là một câu trả lời khác. Tầng web
      // không kiểm lại — một luật hai nơi giữ là hai luật sẽ lệch nhau.
      parent_id: parsed.data.parentId ?? null,
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

/**
 * Tải CÂU TRẢ LỜI của một luồng.
 *
 * Tách khỏi `taiTinKenh` có chủ đích: dòng chính của kênh không kéo theo mọi
 * câu trả lời của mọi luồng — với một kênh chạy vài tháng thì đó là khác nhau
 * giữa hai trăm tin và hai nghìn tin.
 */
export async function taiLuong(input: { parentId: string }): Promise<ChatTinLoad> {
  const parsed = z.object({ parentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput", ...EMPTY_LOAD };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, ...EMPTY_LOAD };

  const { data, error } = await auth.supabase
    .from("chat_messages")
    .select("id, sender_user_id, body, created_at, edited_at, deleted_at, parent_id")
    .eq("parent_id", parsed.data.parentId)
    .order("created_at", { ascending: true })
    .limit(MESSAGE_LIMIT);
  if (error) return { error: "loadFailed", ...EMPTY_LOAD };

  const rows = (data ?? []) as {
    id: string;
    sender_user_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    parent_id: string | null;
  }[];

  const ids = rows.map((r) => r.id);
  const { data: cx } = ids.length
    ? await auth.supabase
        .from("chat_reactions")
        .select("message_id, emoji, user_id")
        .in("message_id", ids)
    : { data: [] };

  const theoTin = new Map<string, Map<string, { soNguoi: number; toiDaTha: boolean }>>();
  for (const r of (cx ?? []) as { message_id: string; emoji: string; user_id: string }[]) {
    if (!theoTin.has(r.message_id)) theoTin.set(r.message_id, new Map());
    const m = theoTin.get(r.message_id)!;
    const cu = m.get(r.emoji) ?? { soNguoi: 0, toiDaTha: false };
    m.set(r.emoji, { soNguoi: cu.soNguoi + 1, toiDaTha: cu.toiDaTha || r.user_id === auth.userId });
  }

  return {
    error: null,
    atLimit: rows.length >= MESSAGE_LIMIT,
    messages: rows.map((r) => ({
      id: r.id,
      senderUserId: r.sender_user_id,
      body: r.body,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      parentId: r.parent_id,
      soTraLoi: 0,
      traLoiCuoiLuc: null,
      camXuc: [...(theoTin.get(r.id) ?? new Map())].map(([emoji, v]) => ({
        emoji,
        soNguoi: v.soNguoi,
        toiDaTha: v.toiDaTha,
      })),
    })),
  };
}

/**
 * Thả hoặc GỠ một cảm xúc. Bấm lần nữa lên đúng cái mình đã thả là gỡ.
 *
 * Không phải chuyện trang trí: 👍 thay cho một câu "đã đọc", ✅ thay cho "em
 * làm rồi" — bớt hẳn tin nhắn rác trong kênh đông người.
 */
export async function thaCamXuc(input: {
  messageId: string;
  emoji: string;
}): Promise<{ error: string | null }> {
  const parsed = z
    .object({ messageId: z.uuid(), emoji: z.string().trim().min(1).max(16) })
    .safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  // Đã thả rồi ⇒ GỠ. Một lời gọi làm cả hai chiều để giao diện chỉ cần một nút.
  const { data: dangCo } = await auth.supabase
    .from("chat_reactions")
    .select("emoji")
    .eq("message_id", parsed.data.messageId)
    .eq("user_id", auth.userId)
    .eq("emoji", parsed.data.emoji)
    .maybeSingle();

  if (dangCo) {
    // `.select()` là BẮT BUỘC: không có nó thì lệnh xoá trả 0 dòng trong MỌI
    // trường hợp — kể cả lúc chính sách quyền lọc mất dòng — và màn hình báo
    // "đã gỡ" trong khi cảm xúc vẫn còn nguyên.
    const { data: daXoa, error } = await auth.supabase
      .from("chat_reactions")
      .delete()
      .eq("message_id", parsed.data.messageId)
      .eq("user_id", auth.userId)
      .eq("emoji", parsed.data.emoji)
      .select("emoji");
    if (error) return { error: mapDbError(error) };
    if (!daXoa || daXoa.length === 0) return { error: "forbidden" };
    return { error: null };
  }

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  const { error } = await auth.supabase.from("chat_reactions").insert({
    tenant_id: tenant.id,
    message_id: parsed.data.messageId,
    user_id: auth.userId,
    emoji: parsed.data.emoji,
  });
  return { error: error ? mapDbError(error) : null };
}

/**
 * Tạo một kênh chủ đề (#le-tan, #ky-thuat-vien).
 *
 * ⚠️ `hanChe` KHÔNG phải "riêng tư": chủ tiệm luôn đọc được (migration #307).
 * Màn hình nói thẳng điều đó cho mọi thành viên của kênh — một cái nhãn hứa
 * nhiều hơn sự thật còn tệ hơn việc không có tính năng.
 *
 * Chỉ chủ/quản trị/quản lý tạo được; chốt thật nằm ở chính sách
 * `chat_channels_insert`, đây chỉ là phép lịch sự với người dùng.
 */
export async function taoKenhChuDe(input: {
  ten: string;
  moTa?: string | null;
  hanChe?: boolean;
}): Promise<{ error: string | null; channelId: string | null }> {
  const parsed = z
    .object({
      ten: z.string().trim().min(1).max(MAX_TEN_KENH),
      moTa: z.string().trim().max(200).nullish(),
      hanChe: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalidInput", channelId: null };

  const ten = chuanHoaTenKenh(parsed.data.ten);
  if (ten.length === 0) return { error: "invalidInput", channelId: null };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, channelId: null };

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound", channelId: null };

  const { data, error } = await auth.supabase
    .from("chat_channels")
    .insert({
      tenant_id: tenant.id,
      kind: "topic",
      name: ten,
      description: parsed.data.moTa ?? null,
      is_restricted: parsed.data.hanChe ?? false,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error) return { error: mapDbError(error), channelId: null };

  // Kênh hạn chế: người tạo phải là thành viên đầu tiên, không thì họ tạo xong
  // và chính mình không vào được.
  if (parsed.data.hanChe) {
    await auth.supabase.from("chat_channel_members").insert({
      tenant_id: tenant.id,
      channel_id: data.id,
      user_id: auth.userId,
    });
  }

  return { error: null, channelId: data.id };
}
