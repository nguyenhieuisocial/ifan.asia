import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI trực việc — gom ĐÚNG 4 loại sự thật tiệm đã tự khai (ADR-0014 mục 4):
 * giờ mở cửa · dịch vụ & giá & thời lượng · địa chỉ · giới thiệu tiệm.
 *
 * KHÔNG có phép toán "bây giờ tiệm có đang mở không" ở đây — đó là việc của
 * `tenant_open_now()` (migration #105, dùng để CHẶN trước khi gọi AI). File
 * này chỉ tra CÓ GÌ để trả lời "mấy giờ mở cửa thứ Bảy", không so với giờ
 * hiện tại — nên không cần và không được đụng vào timezone (đúng bài học
 * storefront-hours-smoke: mọi phép cộng/trừ giờ THẬT phải qua một cổng duy
 * nhất, không tự chế thêm cổng thứ tư ở đây).
 */

const WEEKDAY_FULL_VN = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

/** "60 phút" / "1 tiếng 30 phút" — đọc tự nhiên hơn số phút trần trong câu AI trả lời. */
function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} tiếng` : `${h} tiếng ${m} phút`;
}

export type AutopilotFacts = {
  /** Văn bản tiếng Việt đưa thẳng vào system prompt — rỗng "" nếu tiệm chưa khai gì. */
  text: string;
  hasAny: boolean;
};

export async function gatherAutopilotFacts(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AutopilotFacts> {
  const [hoursRes, closuresRes, servicesRes, storefrontRes] = await Promise.all([
    supabase
      .from("business_hours")
      .select("weekday, is_closed, open_time, close_time")
      .eq("tenant_id", tenantId)
      .order("weekday"),
    // Chỉ lấy ngày nghỉ SẮP TỚI/ĐANG DIỄN RA (không cần lịch sử) — hôm nay tính
    // theo UTC là đủ cho một cửa sổ 1 ngày rộng rãi, không phải phép so chính
    // xác theo giờ tiệm (đó là việc của tenant_open_now()).
    supabase
      .from("business_closures")
      .select("date_from, date_to, reason, is_full_day, open_time, close_time")
      .eq("tenant_id", tenantId)
      .gte("date_to", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))
      .order("date_from")
      .limit(20),
    supabase
      .from("services")
      .select("name, duration_minutes, price_vnd")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("tenant_storefront")
      .select("address, intro")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const hours = hoursRes.data ?? [];
  const closures = closuresRes.data ?? [];
  const services = servicesRes.data ?? [];
  const storefront = storefrontRes.data;

  const lines: string[] = [];

  if (hours.length > 0) {
    lines.push("GIỜ MỞ CỬA:");
    for (let w = 0; w < 7; w++) {
      const row = hours.find((h) => h.weekday === w);
      if (!row || row.is_closed || !row.open_time || !row.close_time) {
        lines.push(`- ${WEEKDAY_FULL_VN[w]}: nghỉ`);
      } else {
        lines.push(`- ${WEEKDAY_FULL_VN[w]}: ${row.open_time.slice(0, 5)}–${row.close_time.slice(0, 5)}`);
      }
    }
    if (closures.length > 0) {
      lines.push("NGÀY NGHỈ/ĐỔI GIỜ ĐỘT XUẤT (đè lên giờ thường ở trên):");
      for (const c of closures) {
        const range = c.date_from === c.date_to ? c.date_from : `${c.date_from} → ${c.date_to}`;
        const detail = c.is_full_day
          ? "nghỉ cả ngày"
          : `${(c.open_time ?? "").slice(0, 5)}–${(c.close_time ?? "").slice(0, 5)}`;
        lines.push(`- ${range}: ${detail}${c.reason ? ` (${c.reason})` : ""}`);
      }
    }
  }

  if (services.length > 0) {
    lines.push("", "DỊCH VỤ & GIÁ:");
    for (const s of services) {
      lines.push(`- ${s.name}: ${fmtVnd(s.price_vnd)}, ${fmtDuration(s.duration_minutes)}`);
    }
  }

  if (storefront?.address) {
    lines.push("", `ĐỊA CHỈ: ${storefront.address}`);
  }
  if (storefront?.intro) {
    lines.push("", `GIỚI THIỆU TIỆM: ${storefront.intro}`);
  }

  const text = lines.join("\n");
  return { text, hasAny: text.trim() !== "" };
}

/**
 * ADR-0015 — Kho tri thức là nguồn sự thật THỨ 5 (sau 4 nguồn ở trên). Chỉ
 * mục `status='published'` tới được đây — `kb_published_for()` (migration
 * #113) đã tự giới hạn, không lọc lại ở tầng Node để tránh hai nơi cùng canh
 * một luật (luật D1).
 *
 * Mỗi mục gắn kèm `id` trong văn bản để model khai lại đúng mục nào nó DÙNG
 * (ADR mục 7) — `answerAutopilotQuestion` đọc `kb_ids` từ câu trả lời, không
 * đoán bằng cách so khớp chữ.
 */
export type AutopilotKb = {
  text: string;
  ids: string[];
  hasAny: boolean;
};

/**
 * Đọc thẳng bảng qua RLS thay vì gọi RPC `kb_published_for` (đã GỠ, migration
 * #117) — bắt được khi kiểm tay "Xem AI đang đọc gì": RPC đó cấp quyền CHỈ
 * cho service_role, còn màn xem trước gọi bằng client của NGƯỜI ĐANG ĐĂNG
 * NHẬP (authenticated) → bị từ chối, và code cũ NUỐT lỗi thành "không có KB"
 * — khối kho tri thức biến mất khỏi lời nhắc THẬT mà không ai biết vì sao.
 *
 * Chọn cách này vì nó ĐÚNG CHO CẢ HAI người gọi mà không cần phân biệt vai:
 * service_role tự bỏ qua RLS (đúng luật driver Postgres), còn authenticated
 * bị `kb_entries_select` tự khoanh về đúng tiệm của họ — an toàn hai tầng mà
 * không phải viết thêm nhánh "nếu là máy quét thì...".
 */
export async function gatherAutopilotKb(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AutopilotKb> {
  const { data, error } = await supabase
    .from("kb_entries")
    .select("id, question, answer")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !data || data.length === 0) return { text: "", ids: [], hasAny: false };

  const entries = data as { id: string; question: string; answer: string }[];
  const lines = entries.map((e) => `[id: ${e.id}]\nQ: ${e.question}\nA: ${e.answer}`);
  return { text: lines.join("\n\n"), ids: entries.map((e) => e.id), hasAny: true };
}
