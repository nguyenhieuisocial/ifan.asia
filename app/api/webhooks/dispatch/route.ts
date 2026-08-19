import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { guiMotTin, lanKeTiepSau, NGUONG_BAO, TOI_DA_THU } from "@/lib/integrations/webhook-send";

/**
 * Nhịp gửi webhook ra ngoài (V6 integrations, migration #160-161).
 *
 * pg_net bị khoá (#36 — cửa SSRF) nên CSDL không tự gọi HTTP được; cần một nhịp
 * bên ngoài gọi route này, đúng khuôn /api/bot/outbox đã chạy thật.
 *
 * Mỗi lượt làm ba việc, theo thứ tự:
 *   1. Thả phiếu bị kẹt (worker lượt trước chết giữa chừng) — không có bước này
 *      thì hàng đợi tắc trong im lặng.
 *   2. Quét sự kiện mới thành phiếu gửi.
 *   3. Nhận một nắm phiếu tới hạn và gửi.
 *
 * Thiếu cấu hình → 204 im lặng, không lỗi, không spam log (two-mode như outbox).
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Gửi bao nhiêu phiếu mỗi lượt — đủ để theo kịp, không đủ để hết giờ chạy. */
const MOI_LUOT = 20;

function bangNhau(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function handle(req: Request): Promise<Response> {
  const key = process.env.BOT_INGEST_KEY;
  if (!key) return new Response(null, { status: 204 });

  const { allowed } = await rateLimit(`webhook-dispatch:ip:${clientIpFrom(req.headers)}`, 30, 60);
  if (!allowed) return new Response("too many requests", { status: 429 });

  const theKhoa = req.headers.get("x-bot-key") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cron = process.env.CRON_SECRET;
  const duocPhep = bangNhau(theKhoa, key) || (!!cron && bangNhau(bearer, cron));
  if (!duocPhep) return new Response("forbidden", { status: 403 });

  const supabase = createServiceClient();
  if (!supabase) return new Response(null, { status: 204 });

  const { data: daTha } = await supabase.rpc("webhook_tha_phieu_ket");
  const { data: moi } = await supabase.rpc("webhook_queue_new", { p_max: 500 });
  const { data: viec, error: loiNhan } = await supabase.rpc("webhook_claim", { p_max: MOI_LUOT });
  if (loiNhan) {
    console.error("[webhook] không nhận được việc:", loiNhan.message);
    return Response.json({ error: "claim_failed" }, { status: 500 });
  }

  type Viec = {
    delivery_id: string;
    endpoint_id: string;
    url: string;
    secret: string;
    event_type: string;
    payload: unknown;
    attempts: number;
  };
  const ds = (viec ?? []) as Viec[];

  let gui = 0;
  let hong = 0;
  // Gửi SONG SONG: mỗi bên nhận có tốc độ riêng, xếp hàng tuần tự thì một bên
  // chậm 10 giây làm cả lượt chờ theo. Mỗi tin đã có hạn chờ riêng nên nắm này
  // không bao giờ vượt quá hạn chờ của tin lâu nhất.
  await Promise.all(
    ds.map(async (v) => {
      const kq = await guiMotTin({
        url: v.url,
        secret: v.secret,
        deliveryId: v.delivery_id,
        eventType: v.event_type,
        payload: v.payload,
      });
      if (kq.ok) gui++;
      else hong++;
      const { error } = await supabase.rpc("webhook_ghi_ket_qua", {
        p_delivery_id: v.delivery_id,
        p_thanh_cong: kq.ok,
        p_loi: kq.ok ? null : kq.loi,
        p_toi_da_thu: TOI_DA_THU,
        p_lan_sau: kq.ok ? null : lanKeTiepSau(v.attempts).toISOString(),
      });
      if (error) console.error("[webhook] không ghi được kết quả:", error.message);
    }),
  );

  // LUẬT 3 của thẻ design — hỏng lâu thì BÁO, không âm thầm bỏ. Đường báo chết
  // im lặng là thứ tệ nhất vì mọi người tưởng dữ liệu vẫn chảy.
  const { data: dangHong } = await supabase
    .from("webhook_endpoints")
    .select("id, tenant_id, name, consecutive_failures")
    .gte("consecutive_failures", NGUONG_BAO)
    .eq("status", "active");

  let daBao = 0;
  for (const e of dangHong ?? []) {
    // Báo cho CHỦ TIỆM và quản trị viên — đúng nhóm quản được đường báo (khớp
    // RLS webhook_endpoints_manage). Nhân viên nhận tin này chỉ thêm nhiễu.
    const { data: nguoi } = await supabase
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", e.tenant_id)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);

    for (const n of nguoi ?? []) {
      // `dedupe_key` không có ở bảng này, nên chống lặp bằng cách chỉ báo MỘT
      // lần cho mỗi mốc hỏng: đúng ngưỡng thì báo, các lượt sau đã vượt ngưỡng
      // nên không báo lại — nếu không, mỗi nhịp worker lại đẩy một thông báo.
      if (e.consecutive_failures !== NGUONG_BAO) continue;
      const { error } = await supabase.from("notifications").insert({
        tenant_id: e.tenant_id,
        user_id: n.user_id,
        type: "webhook",
        title: `Đường báo "${e.name}" đang hỏng`,
        title_key: "notifications.webhookDown.title",
        body_key: "notifications.webhookDown.body",
        params: { name: e.name, count: e.consecutive_failures },
        link: "/app/settings/integrations",
      });
      if (error) console.error("[webhook] không báo được đường báo hỏng:", error.message);
      else daBao++;
    }
  }

  return Response.json({
    tha_phieu_ket: daTha ?? 0,
    phieu_moi: moi ?? 0,
    da_gui: gui,
    hong,
    canh_bao: (dangHong ?? []).length,
    da_bao: daBao,
  });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
