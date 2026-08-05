import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

/**
 * Webhook nhận sự kiện Zalo OA — mẫu ACK-trước-xử-lý-sau (spec 02 Omnichannel Inbox):
 * verify chữ ký → ingest_zalo_event (ghi webhook_events + enqueue pgmq) → trả 200 NGAY
 * (<2s theo ràng buộc Zalo) → waitUntil kích trigger_zalo_processing sau khi đã trả lời.
 * Không service key: mọi đặc quyền đi qua RPC security definer, xác thực bằng ZALO_INGEST_KEY
 * (khóa sinh trong DB — private.app_config, key 'zalo_ingest_key').
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

type ZaloWebhookPayload = {
  app_id?: string;
  oa_id?: string;
  event_name?: string;
  timestamp?: string | number;
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: { msg_id?: string; text?: string };
};

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Zalo verify webhook URL khi đăng ký: trả 200; echo query 'challenge' nếu có. */
export function GET(req: Request): Response {
  const challenge = new URL(req.url).searchParams.get("challenge");
  return new Response(challenge ?? "OK", { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Rate limit thô theo IP TRƯỚC mọi việc tính chữ ký (đỡ đốt CPU khi bị flood).
    // 300/phút đủ rộng cho traffic Zalo thật; 429 để Zalo retry — không mất sự kiện.
    const { allowed } = await rateLimit(
      `zalo-webhook:ip:${clientIpFrom(req.headers)}`,
      300,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    // Đọc raw body TRƯỚC khi parse — chữ ký tính trên chuỗi gốc
    const raw = await req.text();

    let payload: ZaloWebhookPayload = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as ZaloWebhookPayload;
      }
    } catch {
      console.error("[zalo-webhook] body không phải JSON — vẫn ACK 200");
    }

    const appId = process.env.ZALO_APP_ID;
    const appSecret = process.env.ZALO_APP_SECRET;
    if (appId && appSecret) {
      // Công thức chữ ký webhook Zalo OA (developers.zalo.me — Giới thiệu Webhook):
      //   X-ZEvent-Signature: mac=SHA256(appId + data + timeStamp + OASecretKey)
      // data = raw request body; timeStamp = trường 'timestamp' trong payload.
      const signature = (req.headers.get("x-zevent-signature") ?? "")
        .replace(/^mac=/i, "")
        .toLowerCase();
      const timestamp = payload.timestamp === undefined ? "" : String(payload.timestamp);
      const expected = sha256Hex(`${appId}${raw}${timestamp}${appSecret}`);
      // So sánh timing-safe (guard độ dài trước — timingSafeEqual yêu cầu buffer bằng nhau)
      const signatureBuf = Buffer.from(signature, "utf8");
      const expectedBuf = Buffer.from(expected, "utf8");
      if (
        signatureBuf.length !== expectedBuf.length ||
        !timingSafeEqual(signatureBuf, expectedBuf)
      ) {
        console.error("[zalo-webhook] sai chữ ký X-ZEvent-Signature — trả 401");
        return new Response("invalid signature", { status: 401 });
      }
    } else if (process.env.ZALO_WEBHOOK_ALLOW_UNSIGNED === "1") {
      // Lối thoát DUY NHẤT cho máy dev, phải bật TƯỜNG MINH bằng env riêng.
      console.warn(
        "[zalo-webhook] DEV MODE: bỏ qua verify chữ ký vì ZALO_WEBHOOK_ALLOW_UNSIGNED=1",
      );
    } else {
      // Fail closed ở MỌI môi trường có triển khai (production VÀ preview).
      //
      // Trước đây điều kiện là `VERCEL_ENV === "production"`, nên trên bản
      // preview — cũng là URL công khai trên internet — thiếu ZALO_APP_* là bỏ
      // qua verify hoàn toàn. Mà preview lại nối vào ĐÚNG CSDL THẬT (lib/config
      // có giá trị dự phòng) và ZALO_INGEST_KEY là biến duy nhất đã đặt trên
      // Vercel (mặc định áp cho cả preview). Ba mắt xích đó ghép lại: bất kỳ ai
      // POST một JSON tùy ý vào URL preview là ghi được hội thoại/tin nhắn/khách
      // hàng GIẢ vào dữ liệu production.
      // Nay điều kiện bám vào SỰ CÓ MẶT CỦA BÍ MẬT, không bám môi trường.
      console.error(
        "[zalo-webhook] thiếu ZALO_APP_ID/ZALO_APP_SECRET — từ chối request (fail closed). " +
          "Cấu hình env trên Vercel rồi redeploy; máy dev đặt ZALO_WEBHOOK_ALLOW_UNSIGNED=1.",
      );
      return new Response("unauthorized", { status: 401 });
    }

    const ingestKey = process.env.ZALO_INGEST_KEY;
    if (!ingestKey) {
      console.error(
        "[zalo-webhook] thiếu env ZALO_INGEST_KEY — không thể nạp sự kiện. " +
          "Lấy khóa trong DB: select value from private.app_config where key = 'zalo_ingest_key'",
      );
      return new Response("server misconfigured", { status: 500 });
    }

    // Idempotency key: ưu tiên msg_id của Zalo, fallback hash raw body (event không phải tin nhắn)
    const externalEventId = payload.message?.msg_id ?? sha256Hex(raw);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.rpc("ingest_zalo_event", {
      p_ingest_key: ingestKey,
      p_external_event_id: externalEventId,
      p_payload: payload,
    });
    if (error) {
      // Vẫn ACK 200 để Zalo không disable webhook; sự kiện lỗi xử lý qua log/cron
      console.error("[zalo-webhook] ingest_zalo_event lỗi:", error.message);
      return new Response("OK", { status: 200 });
    }

    // ACK xong mới kích xử lý — không chặn response (Zalo yêu cầu 200 < 2s, retry 12h)
    waitUntil(
      (async () => {
        const { error: procError } = await supabase.rpc("trigger_zalo_processing", {
          p_ingest_key: ingestKey,
        });
        if (procError) {
          console.error("[zalo-webhook] trigger_zalo_processing lỗi:", procError.message);
        }
      })(),
    );

    return new Response("OK", { status: 200 });
  } catch (err) {
    // Tuyệt đối không throw ra ngoài: mọi lỗi bất ngờ → log + 200 (cron sẽ vớt nếu đã ingest)
    console.error("[zalo-webhook] lỗi không mong đợi:", err);
    return new Response("OK", { status: 200 });
  }
}
