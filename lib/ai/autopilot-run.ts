import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { livechatAdapter } from "@/lib/channels/livechat";
import { telegramAdapter } from "@/lib/channels/telegram";
import type { ChannelAdapter } from "@/lib/channels/types";
import { gatherAutopilotFacts } from "./autopilot-facts";
import { answerAutopilotQuestion } from "./autopilot-answer";

/**
 * AI trực việc — MỘT đường code chung cho Live Chat + Telegram (ADR-0014 mục
 * 9 việc 4, bất biến 3: "một hành động lõi = một đường code").
 *
 * VÌ SAO LÀ MÁY QUÉT, KHÔNG PHẢI HOOK TRỰC TIẾP TRONG TỪNG WEBHOOK: tin
 * Telegram được XỬ TRONG SQL (`process_telegram_events`, migration #97) —
 * Node không bao giờ thấy nội dung tin nhắn để tự gọi AI ngay tại chỗ, và
 * pg_net đã bị khoá (#36) nên CSDL không tự gọi ra ngoài được. Live Chat thì
 * Node CÓ thấy tin ngay trong request, nhưng dùng CHUNG một hàm quét cho cả
 * hai kênh vẫn đúng luật hơn hai đường tin cậy riêng — thêm kênh thứ ba sau
 * này (nếu có) chỉ cần lọt vào cùng điều kiện SELECT bên dưới, không phải
 * viết thêm một đường tích hợp.
 *
 * NHỊP CHẠY: `waitUntil()` ngay sau khi mỗi webhook ghi xong tin (gần như tức
 * thời), CỘNG THÊM nhịp cron 15 phút của /api/bot/outbox làm lưới an toàn nếu
 * nhịp `waitUntil` trượt — đúng khuôn "đá nhịp ngay + cron dọn" đã dùng cho
 * Telegram nội bộ (#85) và Telegram khách (#97).
 */

const ADAPTERS: Partial<Record<string, ChannelAdapter>> = {
  livechat: livechatAdapter,
  telegram: telegramAdapter,
  // Cố ý KHÔNG có zalo_oa — ADR-0014 mục 9: 6 kênh Zalo đều pending_platform,
  // chưa có kênh nào để trả lời thật (D2: không dựng cho cửa chưa mở).
};

type Candidate = {
  conversationId: string;
  tenantId: string;
  channelId: string;
  channelType: string;
  externalUserId: string | null;
  messageId: string;
  content: string;
};

/** Tối đa mỗi lượt quét — chặn một lượt cào hết tài nguyên nếu hàng đợi phình bất thường. */
const SWEEP_LIMIT = 30;

/**
 * Tìm hội thoại chờ AI trả lời — TOÀN BỘ nằm trong MỘT câu SQL
 * (`ai_autopilot_candidates`, migration #110).
 *
 * VÌ SAO KHÔNG GHÉP Ở TẦNG NODE (bản đầu làm vậy, Opus soát lại 13/08 bắt được
 * HAI lỗi):
 *
 *   1. Câu đọc `messages` KHÔNG có LIMIT, dựa vào trần mặc định của PostgREST.
 *      Một hội thoại nhiều tin có thể đẩy hội thoại khác ra khỏi kết quả ⇒
 *      hội thoại đó bị bỏ qua ÂM THẦM, không lỗi, không log.
 *
 *   2. Lấy 90 hội thoại (cũ nhất trước) rồi mới LỌC KÊNH bằng JS. Hội thoại
 *      kênh chưa hỗ trợ (Zalo `pending_platform` — không ai trả lời bao giờ)
 *      tích tụ dần ở đầu danh sách; đủ 90 cái là AI KHÔNG BAO GIỜ nhìn thấy
 *      hội thoại Live Chat mới. Lọc phải nằm TRONG truy vấn.
 *
 * Danh sách kênh hỗ trợ vẫn lấy từ ADAPTERS (một nguồn sự thật, luật D1) —
 * truyền xuống làm tham số, không chép cứng vào SQL.
 */
async function findCandidates(service: SupabaseClient): Promise<Candidate[]> {
  const { data, error } = await service.rpc("ai_autopilot_candidates", {
    p_channel_types: Object.keys(ADAPTERS),
    p_limit: SWEEP_LIMIT,
  });
  // Nuốt lỗi ở ĐÂY là tự bịt mắt: sweep sẽ báo "scanned 0" y hệt lúc thật sự
  // không có việc gì, và không ai phân biệt được "yên ắng" với "hỏng".
  if (error) {
    console.error("[ai-autopilot] không đọc được danh sách hội thoại:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    conversationId: r.conversation_id as string,
    tenantId: r.tenant_id as string,
    channelId: r.channel_id as string,
    channelType: r.channel_type as string,
    externalUserId: r.external_user_id as string | null,
    messageId: r.message_id as string,
    content: r.content as string,
  }));
}

async function processOne(service: SupabaseClient, c: Candidate): Promise<"sent" | "skipped" | "error"> {
  const { data: decision, error: decideError } = await service.rpc("ai_autopilot_decide", {
    p_conversation_id: c.conversationId,
    p_trigger_message_id: c.messageId,
  });
  if (decideError) {
    console.error("[ai-autopilot] decide lỗi:", decideError.message);
    return "error";
  }
  if (!decision?.allowed) return "skipped";

  const facts = await gatherAutopilotFacts(service, c.tenantId);
  const answer = await answerAutopilotQuestion(service, {
    tenantId: c.tenantId,
    facts,
    question: c.content,
  });

  if (!answer.ok) {
    await service.rpc("ai_reply_log_record", {
      p_conversation_id: c.conversationId,
      p_trigger_message_id: c.messageId,
      p_outcome: "error",
      p_reason: answer.reason,
    });
    return "error";
  }
  if (!answer.data.inScope) {
    await service.rpc("ai_reply_log_record", {
      p_conversation_id: c.conversationId,
      p_trigger_message_id: c.messageId,
      p_outcome: "skipped_out_of_scope",
    });
    return "skipped";
  }

  const adapter = ADAPTERS[c.channelType];
  if (!adapter || !c.externalUserId) {
    await service.rpc("ai_reply_log_record", {
      p_conversation_id: c.conversationId,
      p_trigger_message_id: c.messageId,
      p_outcome: "error",
      p_reason: "not_connected",
    });
    return "error";
  }

  const sendResult = await adapter.send({
    channelId: c.channelId,
    externalUserId: c.externalUserId,
    text: answer.data.answer,
  });
  if (!sendResult.ok) {
    await service.rpc("ai_reply_log_record", {
      p_conversation_id: c.conversationId,
      p_trigger_message_id: c.messageId,
      p_outcome: "error",
      p_reason: sendResult.error,
    });
    return "error";
  }

  // Khuôn ĐÚNG sendReply() (app/app/inbox/actions.ts) — chỉ khác sender_type
  // 'ai' (không phải 'agent') và sender_user_id null (không có người).
  const sentAt = new Date().toISOString();
  const { data: inserted, error: insertError } = await service
    .from("messages")
    .insert({
      tenant_id: c.tenantId,
      conversation_id: c.conversationId,
      direction: "out",
      sender_type: "ai",
      sender_user_id: null,
      content: answer.data.answer,
      external_message_id: sendResult.externalMessageId || null,
      sent_at: sentAt,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error("[ai-autopilot] ghi tin gửi thất bại (đã gửi thật ra kênh):", insertError?.message);
    // Đã gửi thật cho khách — vẫn phải ghi log 'sent' dù ghi bảng messages lỗi,
    // không được để mất dấu vết đã gửi (khác các nhánh trên, ở đây KHÔNG được
    // ghi 'error' vì tin đã ra tới khách rồi).
    await service.rpc("ai_reply_log_record", {
      p_conversation_id: c.conversationId,
      p_trigger_message_id: c.messageId,
      p_outcome: "sent",
    });
    // Vẫn đẩy `last_message_at` dù ghi tin hỏng: nếu không, hội thoại giữ
    // nguyên "chưa trả lời" và lượt quét sau lại nhặt nó lên. Chỗ giành (#110)
    // đã chặn gửi trùng cho ĐÚNG tin đó, nhưng để hội thoại nằm mãi trong
    // hàng đợi là bắt máy quét làm việc thừa mỗi vòng.
    await service.from("conversations").update({ last_message_at: sentAt }).eq("id", c.conversationId);
    return "sent";
  }

  await service.from("conversations").update({ last_message_at: sentAt }).eq("id", c.conversationId);
  await service.rpc("ai_reply_log_record", {
    p_conversation_id: c.conversationId,
    p_trigger_message_id: c.messageId,
    p_outcome: "sent",
    p_sent_message_id: inserted.id,
  });
  return "sent";
}

export async function runAutopilotSweep(): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
}> {
  const service = createServiceClient();
  if (!service) return { scanned: 0, sent: 0, skipped: 0, errors: 0 };

  const candidates = await findCandidates(service);
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  for (const c of candidates) {
    const outcome = await processOne(service, c);
    if (outcome === "sent") sent++;
    else if (outcome === "skipped") skipped++;
    else errors++;
  }
  return { scanned: candidates.length, sent, skipped, errors };
}
