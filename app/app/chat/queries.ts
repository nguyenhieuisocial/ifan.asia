import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatKenh, ChatMember, MucBao } from "./types";

/**
 * Tra cứu màn Chat nội bộ riêng (migration #298).
 *
 * KHÔNG NUỐT LỖI: ném ra để `page.tsx` bắt và bật `loadFailed`. Trả `[]` rồi im
 * lặng sẽ đọc thành "tiệm chưa ai nhắn gì bao giờ" — hai chuyện khác hẳn nhau.
 *
 * KHÔNG có lớp kiểm quyền nào ở đây: RLS của `chat_channels` là bộ quyền DUY
 * NHẤT (kênh cả tiệm = thành viên đang hoạt động; kênh riêng = đúng hai người).
 * Thêm một lần kiểm ở tầng web là dựng bộ thứ hai, và hai bộ sẽ lệch nhau.
 */

type HangKenh = {
  id: string;
  kind: string;
  dm_a: string | null;
  dm_b: string | null;
  name: string | null;
  description: string | null;
  is_restricted: boolean;
};

type HangDem = {
  channel_id: string;
  so_chua_doc: number;
  tin_cuoi_luc: string | null;
};

export type ChatBundle = {
  kenh: ChatKenh[];
  /** Thành viên còn trong tiệm — dùng cho ô gợi ý @tên VÀ danh sách mở kênh riêng. */
  thanhVien: ChatMember[];
};

/**
 * Danh sách kênh + số chưa đọc + danh bạ thành viên.
 *
 * Số chưa đọc và mốc tin cuối lấy từ RPC `chat_dem_chua_doc` — đếm TRONG CSDL.
 * Kéo tin về rồi đếm ở tầng web thì vừa tốn, vừa sai ngay khi kênh vượt trần
 * 200 tin đang tải.
 */
export async function layKenhVaThanhVien(
  supabase: SupabaseClient,
  currentUserId: string,
): Promise<ChatBundle> {
  const [kenhRes, demRes, profilesRes, membersRes, prefsRes] = await Promise.all([
    supabase.from("chat_channels").select("id, kind, dm_a, dm_b, name, description, is_restricted"),
    supabase.rpc("chat_dem_chua_doc"),
    supabase.from("profiles").select("user_id, display_name"),
    // Chỉ người CÒN trong tiệm mới gọi tên được (policy `chat_mentions_insert`)
    // và mới mở kênh riêng được (policy `chat_channels_insert`) — danh sách ở
    // giao diện phải nói đúng danh sách đó, không lấy mọi profile từng thấy.
    supabase.from("tenant_members").select("user_id").eq("status", "active"),
    // RLS của `chat_channel_prefs` chỉ trả về dòng CỦA MÌNH — không lọc lại
    // theo user ở đây, và lọc lại là dựng bộ quyền thứ hai.
    supabase.from("chat_channel_prefs").select("channel_id, muc"),
  ]);

  if (kenhRes.error) throw kenhRes.error;
  if (demRes.error) throw demRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (membersRes.error) throw membersRes.error;
  // ⚠️ KHÔNG ném khi đọc mức thông báo hỏng: thiếu nó thì mọi kênh về mặc
  //   định "nhận đủ" — khó chịu nhưng an toàn. Ném thì cả màn chat chết vì
  //   một tuỳ chọn phụ.

  const tenTheoId = new Map(
    ((profilesRes.data ?? []) as { user_id: string; display_name: string }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );
  const dangHoatDong = new Set(
    ((membersRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );

  const mucTheoKenh = new Map(
    ((prefsRes.data ?? []) as { channel_id: string; muc: MucBao }[]).map((r) => [
      r.channel_id,
      r.muc,
    ]),
  );

  const demTheoKenh = new Map(
    ((demRes.data ?? []) as HangDem[]).map((r) => [r.channel_id, r]),
  );

  const kenh: ChatKenh[] = ((kenhRes.data ?? []) as HangKenh[]).map((c) => {
    const doiPhuong =
      c.kind === "dm" ? (c.dm_a === currentUserId ? c.dm_b : c.dm_a) : null;
    const dem = demTheoKenh.get(c.id);
    const kind: ChatKenh["kind"] =
      c.kind === "team" ? "team" : c.kind === "topic" ? "topic" : "dm";
    return {
      id: c.id,
      kind,
      doiPhuongUserId: doiPhuong,
      doiPhuongTen: doiPhuong ? (tenTheoId.get(doiPhuong) ?? null) : null,
      soChuaDoc: dem?.so_chua_doc ?? 0,
      tinCuoiLuc: dem?.tin_cuoi_luc ?? null,
      ten: c.name,
      moTa: c.description,
      hanChe: Boolean(c.is_restricted),
      // Không có dòng nào = "all". Mặc định phải là NHẬN ĐỦ: người chưa từng
      // chỉnh mà tự nhiên không nhận tin sẽ tưởng tiệm không ai nhắn gì.
      mucBao: mucTheoKenh.get(c.id) ?? "all",
    };
  });

  const thanhVien: ChatMember[] = [...tenTheoId.entries()]
    .filter(([userId]) => dangHoatDong.has(userId))
    .map(([userId, displayName]) => ({ userId, displayName }));

  return { kenh, thanhVien };
}
