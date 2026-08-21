"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
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
  MUC_BAO,
  coGoiCaTiem,
  chuanHoaTenKenh,
  type ChatKenhKind,
  type ChatTepHien,
  type ChatTinTimThay,
  type MucBao,
} from "./types";
import { MAX_CO_TEP, MAX_TEP_MOI_TIN } from "./tep-dinh-kem";

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
    .select(
      "id, sender_user_id, body, created_at, edited_at, deleted_at, parent_id, pinned_at",
    )
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
    pinned_at: string | null;
  }[];
  const atLimit = rows.length > MESSAGE_LIMIT;
  const hien = rows.slice(0, MESSAGE_LIMIT);
  const ids = hien.map((r) => r.id);

  // Đếm câu trả lời và gom cảm xúc cho ĐÚNG những tin đang hiện.
  // ⚠️ Hai truy vấn này KHÔNG được làm hỏng cả màn nếu lỗi: thiếu con số "4 câu
  //   trả lời" thì khó chịu, mất cả kênh tin nhắn thì hỏng việc. Nên chúng trả
  //   về rỗng khi lỗi, còn truy vấn CHÍNH ở trên thì vẫn báo `loadFailed`.
  const [traLoiRes, camXucRes, luuRes, tepRes] = ids.length
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
        // RLS của `chat_saved` chỉ trả về dòng CỦA MÌNH — không cần lọc lại
        // theo user ở đây, và lọc lại là dựng bộ quyền thứ hai.
        auth.supabase.from("chat_saved").select("message_id").in("message_id", ids),
        auth.supabase
          .from("chat_attachments")
          .select("id, message_id, duong_dan, ten, loai, co")
          .in("message_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

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

  const daLuuIds = new Set(
    ((luuRes.data ?? []) as { message_id: string }[]).map((r) => r.message_id),
  );

  const tepTheoTin = await kyTepTheoTin(
    auth.supabase,
    (tepRes.data ?? []) as HangTep[],
  );

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
        ghimLuc: r.pinned_at,
        daLuu: daLuuIds.has(r.id),
        tep: tepTheoTin.get(r.id) ?? [],
      };
    })
    .reverse();

  return { error: null, messages, atLimit };
}

const tepSchema = z.object({
  duongDan: z.string().min(3).max(500),
  ten: z.string().min(1).max(200),
  loai: z.string().min(1).max(100),
  co: z.number().int().min(0).max(MAX_CO_TEP),
});

const sendSchema = z.object({
  channelId: z.uuid(),
  // ⚠️ Có tệp thì lời nhắn được PHÉP RỖNG. Bắt gõ chữ mới gửi được ảnh là bắt
  //   người ta gõ "đây" hoặc "ảnh nè" — chữ rác, và một bước thừa.
  body: z.string().trim().max(MAX_BODY_LENGTH),
  tep: z.array(tepSchema).max(MAX_TEP_MOI_TIN).optional(),
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
  tep?: { duongDan: string; ten: string; loai: string; co: number }[];
}): Promise<{ error: string | null }> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  // Rỗng cả chữ lẫn tệp thì không có gì để gửi.
  if (parsed.data.body.length === 0 && (parsed.data.tep ?? []).length === 0) {
    return { error: "invalidInput" };
  }

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

  /**
   * Ghi các tệp đính kèm.
   *
   * ⚠️ Tin ĐÃ ghi rồi. Ghi tệp hỏng thì KHÔNG được nuốt: người gửi thấy "đã
   *   gửi" trong khi tin hiện ra không có ảnh nào, và họ sẽ gửi lại — hai tin,
   *   vẫn không ảnh. Báo riêng để họ biết chuyện gì xảy ra.
   *
   * ⚠️ Kiểm ĐƯỜNG DẪN phải nằm trong thư mục của TIỆM NÀY. Chính sách của kho
   *   đã chặn việc GHI ra ngoài, nhưng bảng này thì chưa — không kiểm thì một
   *   người có thể trỏ bản ghi vào tệp của tiệm khác và màn hình sẽ đi xin một
   *   đường dẫn có chữ ký cho tệp đó.
   */
  const dsTep = parsed.data.tep ?? [];
  if (dsTep.length > 0) {
    const tienTo = `${tenant.id}/`;
    if (dsTep.some((x) => !x.duongDan.startsWith(tienTo))) {
      return { error: "invalidInput" };
    }
    const { error: loiTep } = await auth.supabase.from("chat_attachments").insert(
      dsTep.map((x) => ({
        tenant_id: tenant.id,
        message_id: message.id,
        duong_dan: x.duongDan,
        ten: x.ten,
        loai: x.loai,
        co: x.co,
      })),
    );
    if (loiTep) return { error: "attachFailed" };
  }

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

  /**
   * GỌI CẢ TIỆM — `@cả-tiệm` gọi mọi người đang làm.
   *
   * ⚠️ Chốt vai NGAY Ở ĐÂY, không chỉ giấu nút ở giao diện: giấu nút chỉ ngăn
   *   người không biết, còn ai gõ thẳng chữ vào ô soạn thì vẫn réo được cả
   *   tiệm. Vai không đủ thì lời gọi đó bị BỎ QUA — tin vẫn gửi bình thường,
   *   chỉ là không réo ai.
   */
  const vai = (await getCurrentMembership(auth.supabase, auth.userId))?.role ?? "";
  const duocGoiCaTiem = ["owner", "admin", "manager"].includes(vai);

  const mentioned =
    coGoiCaTiem(parsed.data.body) && duocGoiCaTiem
      ? members.map((m) => m.userId).filter((id) => id !== auth.userId)
      : detectMentions(parsed.data.body, members).filter((id) => id !== auth.userId);
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
      // Câu trả lời trong luồng KHÔNG ghim và KHÔNG để-đọc-sau được: ghim là
      // việc của cả kênh, mà một câu nằm sâu trong luồng thì ghim lên đầu kênh
      // chỉ gây khó hiểu. Ghim tin GỐC của luồng là đủ.
      ghimLuc: null,
      daLuu: false,
      // Câu trả lời trong luồng chưa cho đính kèm — xem ghi chú ngay trên.
      tep: [],
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

/**
 * GHIM hoặc GỠ GHIM một tin — cho CẢ KÊNH.
 *
 * Đi qua hàm `chat_ghim_tin` chứ không qua UPDATE thẳng: policy sửa tin chỉ cho
 * sửa TIN CỦA CHÍNH MÌNH trong 15 phút, mà ghim tin của người khác là chuyện
 * bình thường. Nới policy kia ra cho ghim đi lọt sẽ mở luôn đường sửa NỘI DUNG
 * tin người khác — xem chú thích trong migration #309.
 */
export async function ghimTin(input: {
  messageId: string;
  ghim: boolean;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ messageId: z.uuid(), ghim: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.rpc("chat_ghim_tin", {
    p_message_id: parsed.data.messageId,
    p_ghim: parsed.data.ghim,
  });
  if (error) {
    if (error.message.includes("vai_chi_xem")) return { error: "forbidden" };
    if (error.message.includes("khong_tim_thay")) return { error: "notFound" };
    return { error: "saveFailed" };
  }
  return { error: null };
}

/**
 * ĐỂ ĐỌC SAU — riêng một người.
 *
 * Khác hẳn ghim: ghim là cho cả kênh, cái này chỉ mình thấy (RLS `chat_saved`
 * chặn cả chủ tiệm). Nhân viên đang bận với khách thì đánh dấu, tối xem lại.
 */
export async function luuTin(input: {
  messageId: string;
  luu: boolean;
}): Promise<{ error: string | null }> {
  const parsed = z.object({ messageId: z.uuid(), luu: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  if (!parsed.data.luu) {
    // ⚠️ `.select()` BẮT BUỘC ở lệnh xoá: không có nó thì Supabase trả về
    //   thành công kể cả khi RLS chặn sạch, và giao diện sẽ bỏ dấu trong khi
    //   dòng vẫn nằm nguyên trong cơ sở dữ liệu. Đúng bẫy đã dính ở `thaCamXuc`.
    const { error, data } = await auth.supabase
      .from("chat_saved")
      .delete()
      .eq("message_id", parsed.data.messageId)
      .select("message_id");
    if (error) return { error: "saveFailed" };
    if (!data || data.length === 0) return { error: "notFound" };
    return { error: null };
  }

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  const { error } = await auth.supabase.from("chat_saved").insert({
    tenant_id: tenant.id,
    message_id: parsed.data.messageId,
    user_id: auth.userId,
  });
  // Bấm hai lần thì lần hai không phải lỗi — coi như đã lưu rồi.
  if (error && !error.message.includes("duplicate")) return { error: "saveFailed" };
  return { error: null };
}

/** Mức thông báo của MÌNH cho MỘT kênh. Không có dòng nào = `all`. */
export async function datMucBao(input: {
  channelId: string;
  muc: MucBao;
}): Promise<{ error: string | null }> {
  const parsed = z
    .object({ channelId: z.uuid(), muc: z.enum(MUC_BAO) })
    .safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data: tenant } = await auth.supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "notFound" };

  const { error } = await auth.supabase.from("chat_channel_prefs").upsert(
    {
      tenant_id: tenant.id,
      channel_id: parsed.data.channelId,
      user_id: auth.userId,
      muc: parsed.data.muc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id,user_id" },
  );
  if (error) return { error: "saveFailed" };
  return { error: null };
}

/** Kiểu trả về chung cho ba hộp gom tin: tìm kiếm · nhắc tới tôi · để đọc sau. */
export type ChatHopTin = { error: string | null; tins: ChatTinTimThay[] };


/** Dựng tên kênh cho một danh sách tin vắt qua nhiều kênh. */
async function gomTenKenh(
  supabase: SupabaseClient,
  rows: { channel_id: string }[],
): Promise<Map<string, { ten: string | null; kind: ChatKenhKind; doiPhuong: string | null }>> {
  const ra = new Map<string, { ten: string | null; kind: ChatKenhKind; doiPhuong: string | null }>();
  const ids = [...new Set(rows.map((r) => r.channel_id))];
  if (ids.length === 0) return ra;

  const { data } = await supabase
    .from("chat_channels")
    .select("id, kind, name, dm_a, dm_b")
    .in("id", ids);
  for (const c of (data ?? []) as {
    id: string;
    kind: string;
    name: string | null;
    dm_a: string | null;
    dm_b: string | null;
  }[]) {
    ra.set(c.id, {
      ten: c.name,
      kind: c.kind === "team" ? "team" : c.kind === "topic" ? "topic" : "dm",
      doiPhuong: c.dm_a ?? c.dm_b,
    });
  }
  return ra;
}

type HangTin = {
  id: string;
  channel_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

function dungHopTin(
  rows: HangTin[],
  kenhTheoId: Map<string, { ten: string | null; kind: ChatKenhKind; doiPhuong: string | null }>,
): ChatTinTimThay[] {
  return rows.map((r) => {
    const k = kenhTheoId.get(r.channel_id);
    return {
      id: r.id,
      channelId: r.channel_id,
      senderUserId: r.sender_user_id,
      body: r.body,
      createdAt: r.created_at,
      tenKenh: k?.ten ?? null,
      kenhKind: k?.kind ?? "team",
      doiPhuongUserId: k?.doiPhuong ?? null,
    };
  });
}

/**
 * TÌM TRONG TIN NHẮN — trên mọi kênh mình đọc được.
 *
 * Không cần lọc kênh ở đây: RLS của `chat_messages` đã chỉ trả về tin thuộc
 * kênh mình thấy. Lọc lại ở tầng web là dựng bộ quyền thứ hai, và hai bộ sẽ
 * lệch nhau.
 *
 * ⚠️ Thoát ký tự đặc biệt của LIKE trước khi ghép: gõ "50%" mà không thoát thì
 *   ra TOÀN BỘ tin nhắn của tiệm, và người dùng sẽ tưởng đó là kết quả thật.
 */
export async function timTinChat(input: { q: string }): Promise<ChatHopTin> {
  const parsed = z.object({ q: z.string().trim().min(2).max(80) }).safeParse(input);
  if (!parsed.success) return { error: "invalidInput", tins: [] };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, tins: [] };

  const mau = `%${parsed.data.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await auth.supabase
    .from("chat_messages")
    .select("id, channel_id, sender_user_id, body, created_at")
    .is("deleted_at", null)
    .ilike("body", mau)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { error: "loadFailed", tins: [] };

  const rows = (data ?? []) as HangTin[];
  return { error: null, tins: dungHopTin(rows, await gomTenKenh(auth.supabase, rows)) };
}

/**
 * NHẮC TỚI TÔI — một chỗ gom hết mọi lần bị gọi tên.
 *
 * Bảng `chat_mentions` đã có từ #298 nhưng chưa màn nào bày ra. Đây là chỗ
 * người ta mở đầu tiên mỗi sáng: "có ai gọi mình không".
 */
export async function taiNhacToi(): Promise<ChatHopTin> {
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, tins: [] };

  const { data, error } = await auth.supabase
    .from("chat_mentions")
    .select("message_id, created_at, chat_messages!inner(id, channel_id, sender_user_id, body, created_at, deleted_at)")
    .eq("mentioned_user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { error: "loadFailed", tins: [] };

  const rows = ((data ?? []) as unknown as { chat_messages: HangTin & { deleted_at: string | null } }[])
    .map((r) => r.chat_messages)
    // Tin đã xoá thì lời gọi tên cũng hết nghĩa — không bày một dòng trống ra
    // rồi để người ta bấm vào chỗ không có gì.
    .filter((m) => m && !m.deleted_at);
  return { error: null, tins: dungHopTin(rows, await gomTenKenh(auth.supabase, rows)) };
}

/** ĐỂ ĐỌC SAU — danh sách riêng của mình (RLS chặn cả chủ tiệm). */
export async function taiDeDocSau(): Promise<ChatHopTin> {
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error, tins: [] };

  const { data, error } = await auth.supabase
    .from("chat_saved")
    .select("created_at, chat_messages!inner(id, channel_id, sender_user_id, body, created_at, deleted_at)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { error: "loadFailed", tins: [] };

  const rows = ((data ?? []) as unknown as { chat_messages: HangTin & { deleted_at: string | null } }[])
    .map((r) => r.chat_messages)
    .filter((m) => m && !m.deleted_at);
  return { error: null, tins: dungHopTin(rows, await gomTenKenh(auth.supabase, rows)) };
}


type HangTep = {
  id: string;
  message_id: string;
  duong_dan: string;
  ten: string;
  loai: string;
  co: number | string;
};

/**
 * Ký đường dẫn cho các tệp đính kèm.
 *
 * Kho `tenant-files` là kho RIÊNG — không có đường dẫn công khai. Mỗi lần hiện
 * phải xin một đường dẫn có chữ ký, hạn 1 giờ (đủ cho một phiên xem, và hết
 * hạn thì một đường dẫn lỡ bị chia sẻ ra ngoài cũng thành vô dụng).
 *
 * ⚠️ Ký HỎNG thì trả `duongDan: null` chứ KHÔNG bỏ tệp khỏi danh sách. Bỏ đi
 *   nghĩa là màn hình nói "tin này không có ảnh" trong khi nó CÓ — người gửi
 *   thấy ảnh của mình biến mất và không ai hiểu vì sao.
 */
async function kyTepTheoTin(
  supabase: SupabaseClient,
  hang: HangTep[],
): Promise<Map<string, ChatTepHien[]>> {
  const ra = new Map<string, ChatTepHien[]>();
  if (hang.length === 0) return ra;

  const { data: daKy } = await supabase.storage
    .from("tenant-files")
    .createSignedUrls(
      hang.map((x) => x.duong_dan),
      3600,
    );
  const kyTheoDuongDan = new Map(
    ((daKy ?? []) as { path: string | null; signedUrl: string | null }[]).map((x) => [
      x.path ?? "",
      x.signedUrl,
    ]),
  );

  for (const x of hang) {
    const ds = ra.get(x.message_id) ?? [];
    ds.push({
      id: x.id,
      ten: x.ten,
      loai: x.loai,
      co: Number(x.co),
      duongDan: kyTheoDuongDan.get(x.duong_dan) ?? null,
    });
    ra.set(x.message_id, ds);
  }
  return ra;
}
