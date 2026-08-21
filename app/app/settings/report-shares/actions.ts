"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { fetchKpiProgress, isMonthKey, KPI_METRICS } from "@/lib/kpi";
import {
  LOST_SHARE_PERIODS,
  SHARE_DAY_OPTIONS,
  SHARE_REPORT_KEYS,
  shareUrl,
  type KpiSharePayload,
  type LostSharePayload,
} from "@/lib/report-share";
// MỘT ĐƯỜNG CODE ĐẾM (luật D1): bản chụp lấy số bằng ĐÚNG hàm mà màn báo cáo
// trong app đang dùng — `fetchLostReasons` gọi RPC `lost_reasons_report()`,
// `fetchKpiProgress` gọi `kpi_progress()`. Cả hai là SECURITY INVOKER nên chúng
// chạy dưới RLS của chính chủ tiệm đang bấm. Viết một câu đếm thứ hai ở đây là
// dựng nơi thứ hai để lệch — và lệch ở đây nghĩa là con số ra ngoài internet
// khác con số trong app.
import { fetchLostReasons } from "@/app/app/reports/lost-reasons/types";

/**
 * Chia sẻ báo cáo bằng đường dẫn có hạn (migration #295).
 * Thẻ design: design-system/man-chia-se-bao-cao.html.
 *
 * ⚠️ BẢN CHỤP ĐƯỢC GẠN Ở ĐÂY, KHÔNG PHẢI Ở TRÌNH DUYỆT. Client chỉ gửi lên
 * "báo cáo nào, kỳ nào, mấy ngày, mật khẩu gì" — toàn bộ CON SỐ do server đọc
 * lấy. Nếu để client gửi số lên thì cửa tạo biến thành cửa đăng nội dung tuỳ ý
 * ra internet dưới tên tiệm.
 *
 * Hai hàm gạn dưới đây là chỗ DUY NHẤT quyết định cột nào rời khỏi tiệm. Chúng
 * liệt kê từng trường một, CỐ Ý không dùng spread: spread là cách một cột mới
 * thêm vào báo cáo tự động đi ra internet mà không ai xét.
 */

type ActionResult = { error: string | null };
type CreateResult = { error: null; url: string } | { error: string };

const MANAGE_ROLES = ["owner", "admin"];

const createSchema = z
  .object({
    reportKey: z.enum(SHARE_REPORT_KEYS),
    periodKey: z.string().trim().min(1).max(32),
    // Chỉ nhận đúng 4 giá trị ô chọn đưa ra. Trần 90 ngày còn được ép LẦN NỮA
    // ở CSDL (`report_shares_tran_90_ngay`) — chốt thật nằm dưới đó.
    days: z
      .number()
      .int()
      .refine((d) => (SHARE_DAY_OPTIONS as readonly number[]).includes(d), { message: "bad_days" }),
    // `.trim()` ở CẢ HAI đầu (hàm CSDL cũng btrim trước khi băm) — lệch một
    // đầu là mật khẩu đặt được mà không mở được, và thủ phạm là một dấu cách
    // vô hình thì không ai đoán ra. Chuỗi rỗng = không đặt mật khẩu.
    password: z.string().trim().max(72).default(""),
  })
  .refine(
    (v) =>
      v.reportKey === "kpi"
        ? isMonthKey(v.periodKey)
        : (LOST_SHARE_PERIODS as readonly string[]).includes(v.periodKey),
    { message: "bad_period" },
  );

async function requireOwnerAdmin(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>> } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // Vai đọc qua getCurrentMembership: truy vấn tự viết thiếu `status` và hạn
  // phiên hỗ trợ ⇒ người vừa bị gỡ khỏi tiệm vẫn phát được đường dẫn ra ngoài
  // suốt lúc thẻ đăng nhập cũ còn sống (~1 giờ). Khuôn `settings/qr/actions.ts`.
  const member = await getCurrentMembership(supabase, user.id);
  if (!member || !MANAGE_ROLES.includes(member.role)) return { error: "forbidden" };
  return { supabase };
}

/** Lỗi từ hàm CSDL → khoá dịch được. Mã lạ KHÔNG được biến thành "ổn". */
function mapDbError(message: string): string {
  for (const key of [
    "forbidden",
    "no_tenant_context",
    "bad_report",
    "bad_days",
    "bad_payload",
    "payload_too_big",
    "bad_password",
    "not_revocable",
  ] as const) {
    if (message.includes(key)) return key;
  }
  return "save_failed";
}

// ══════════════════════════════════════════════════════════════════════════
// GẠN SỐ — mỗi báo cáo một hàm, liệt kê từng trường
// ══════════════════════════════════════════════════════════════════════════

async function buildLostReasonsPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodKey: string,
): Promise<LostSharePayload> {
  const [rows, reasonsRes] = await Promise.all([
    fetchLostReasons(supabase, periodKey as (typeof LOST_SHARE_PERIODS)[number]),
    supabase.from("lost_reasons").select("id, name, i18n_key"),
  ]);

  // Lý do CÀI SẴN đi ra bằng KHOÁ DỊCH, không bằng chữ tiếng Việt đã dịch sẵn:
  // đường dẫn sống tới 90 ngày và người xem có thể đọc bằng ngôn ngữ khác chủ
  // tiệm. Lý do tiệm TỰ ĐẶT thì không có khoá — đi ra bằng đúng tên của nó.
  const seed = new Map(
    (reasonsRes.data ?? []).map((r) => [
      r.id as string,
      { key: (r.i18n_key as string | null) ?? null, name: r.name as string },
    ]),
  );

  const out = rows.map((r) => {
    const s = r.reason_id ? seed.get(r.reason_id) : undefined;
    return {
      key: s?.key ?? null,
      name: s?.name ?? r.reason_name ?? "",
      cnt: Number(r.cnt) || 0,
      prevCnt: Number(r.prev_cnt) || 0,
    };
  });

  return {
    v: 1,
    rows: out,
    total: out.reduce((s, r) => s + r.cnt, 0),
    prevTotal: out.reduce((s, r) => s + r.prevCnt, 0),
  };
}

async function buildKpiPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  monthKey: string,
): Promise<KpiSharePayload> {
  const progress = await fetchKpiProgress(supabase, monthKey);

  // Tên người hiện tại, CHỐT LẠI lúc chụp. Người rời tiệm sau đó vẫn hiện đúng
  // tên đã chụp — bản chụp là ảnh của một thời điểm, không phải cửa sổ nhìn vào
  // danh sách nhân sự hôm nay.
  const ids = [...new Set(progress.targets.map((t) => t.user_id).filter((id): id is string => !!id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ids)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]));

  return {
    v: 1,
    monthKey: progress.month,
    daysInMonth: progress.days_in_month,
    daysElapsed: progress.days_elapsed,
    // ⚠️ KHÔNG có `user_id` ở đây, và đó là cố ý: người xem cần TÊN để đọc bảng,
    // không cần mã định danh — mà một uuid lọt ra ngoài là một đầu mối dò tiếp.
    rows: progress.targets
      .filter((t) => (KPI_METRICS as readonly string[]).includes(t.metric))
      .map((t) => ({
        who: t.user_id ? (nameOf.get(t.user_id) ?? "—") : null,
        metric: t.metric,
        target: Number(t.target) || 0,
        actual: Number(t.actual) || 0,
        pace: Number(t.pace) || 0,
      })),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// CỬA TẠO
// ══════════════════════════════════════════════════════════════════════════

export async function createReportShare(input: {
  reportKey: string;
  periodKey: string;
  days: number;
  password: string;
}): Promise<CreateResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const { reportKey, periodKey, days, password } = parsed.data;

  const auth = await requireOwnerAdmin();
  if ("error" in auth) return { error: auth.error };
  const { supabase } = auth;

  // Số đọc TRƯỚC, dưới RLS của chính người đang bấm. Đọc hỏng thì DỪNG — không
  // bao giờ phát ra một đường dẫn rỗng rồi để người ngoài mở ra thấy bảng trắng
  // và tưởng tiệm không có số.
  let payload: LostSharePayload | KpiSharePayload;
  try {
    payload =
      reportKey === "kpi"
        ? await buildKpiPayload(supabase, periodKey)
        : await buildLostReasonsPayload(supabase, periodKey);
  } catch (e) {
    console.error("[report-share] không đọc được số để chụp:", e);
    return { error: "report_unavailable" };
  }

  const { data, error } = await supabase.rpc("report_share_create", {
    p_report_key: reportKey,
    p_period_key: periodKey,
    p_payload: payload,
    p_days: days,
    p_password: password === "" ? null : password,
  });
  if (error) return { error: mapDbError(error.message) };

  const token = (data as { token?: string } | null)?.token;
  // Hàm CSDL luôn trả mã khi không ném lỗi. Thiếu mã nghĩa là hình dữ liệu đã
  // đổi mà chỗ này chưa biết — báo hỏng, không trả một đường dẫn cụt.
  if (!token) return { error: "save_failed" };

  revalidatePath("/app/settings/report-shares");
  return { error: null, url: shareUrl(token) };
}

// ══════════════════════════════════════════════════════════════════════════
// THU HỒI
// ══════════════════════════════════════════════════════════════════════════

export async function revokeReportShare(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };

  const auth = await requireOwnerAdmin();
  if ("error" in auth) return { error: auth.error };

  // Hàm CSDL tự ném 'not_revocable' khi không đụng dòng nào (đường dẫn của tiệm
  // khác, hoặc đã thu hồi rồi) — nên ở đây KHÔNG cần đếm dòng, và cũng không
  // được coi "không lỗi" là "đã thu hồi" nếu hàm đó đổi cách báo.
  const { error } = await auth.supabase.rpc("report_share_revoke", { p_id: id });
  if (error) return { error: mapDbError(error.message) };

  revalidatePath("/app/settings/report-shares");
  return { error: null };
}
