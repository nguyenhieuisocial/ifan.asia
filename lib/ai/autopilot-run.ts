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

async function findCandidates(service: SupabaseClient): Promise<Candidate[]> {
  // Lọc tenant đã BẬT công tắc trước — bảng ai_autopilot nhỏ, đọc trước để
  // câu truy vấn conversations không phải quét tenant chưa từng bật.
  const { data: onTenants } = await service
    .from("ai_autopilot")
    .select("tenant_id")
    .eq("enabled", true);
  const enabledTenantIds = (onTenants ?? []).map((r) => r.tenant_id as string);
  if (enabledTenantIds.length === 0) return [];

  // Lọc loại/trạng thái kênh Ở TẦNG JS, không qua `.eq("channels.col", …)` —
  // PostgREST lọc cột của bảng NHÚNG qua embed filter có cú pháp riêng, dễ
  // âm thầm không khớp gì (đã bắt được: filter kiểu này từng trả về 0 dòng
  // dù dữ liệu khớp thật — kiểm bằng cách gọi sweep thật, không suy đoán).
  const { data: convs } = await service
    .from("conversations")
    .select("id, tenant_id, external_user_id, channels(id, type, status)")
    .eq("is_unanswered", true)
    .in("tenant_id", enabledTenantIds)
    .order("last_user_message_at", { ascending: true })
    .limit(SWEEP_LIMIT * 3); // dư ra để bù phần bị loại ở bước lọc JS bên dưới

  const eligible = (convs ?? []).filter((c) => {
    const ch = c.channels as unknown as { type: string; status: string } | null;
    return ch && ch.type in ADAPTERS && ch.status !== "disconnected";
  }).slice(0, SWEEP_LIMIT);
  if (eligible.length === 0) return [];

  const convIds = eligible.map((c) => c.id as string);
  const { data: msgs } = await service
    .from("messages")
    .select("id, conversation_id, content, created_at")
    .in("conversation_id", convIds)
    .eq("direction", "in")
    .order("created_at", { ascending: false });
  if (!msgs) return [];

  // Giữ ĐÚNG tin mới nhất mỗi hội thoại — messages đã sắp desc nên gặp trước là mới nhất.
  const latestByConv = new Map<string, { id: string; content: string | null }>();
  for (const m of msgs) {
    if (!latestByConv.has(m.conversation_id as string)) {
      latestByConv.set(m.conversation_id as string, { id: m.id as string, content: m.content as string | null });
    }
  }

  const out: Candidate[] = [];
  for (const c of eligible) {
    const latest = latestByConv.get(c.id as string);
    if (!latest || !latest.content?.trim()) continue;
    const channel = c.channels as unknown as { id: string; type: string; status: string };
    out.push({
      conversationId: c.id as string,
      tenantId: c.tenant_id as string,
      channelId: channel.id,
      channelType: channel.type,
      externalUserId: c.external_user_id as string | null,
      messageId: latest.id,
      content: latest.content,
    });
  }
  return out;
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
