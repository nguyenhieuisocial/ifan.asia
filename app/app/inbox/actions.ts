"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { zaloAdapter } from "@/lib/channels/zalo";
import { livechatAdapter } from "@/lib/channels/livechat";
import { normalizePhone } from "@/app/app/contacts/types";

type ActionResult = { error: string | null };

export async function assignConversation(
  conversationId: string,
  userId: string | null,
): Promise<ActionResult> {
  const parsed = z
    .object({ conversationId: z.uuid(), userId: z.uuid().nullable() })
    .safeParse({ conversationId, userId });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  // Người được gán phải là thành viên tenant (RLS trên tenant_members tự giới hạn tenant hiện tại)
  if (parsed.data.userId) {
    const { data: member } = await supabase
      .from("tenant_members")
      .select("user_id")
      .eq("user_id", parsed.data.userId)
      .maybeSingle();
    if (!member) return { error: "invalid_input" };
  }
  const { error } = await supabase
    .from("conversations")
    .update({ assignee_user_id: parsed.data.userId })
    .eq("id", parsed.data.conversationId);
  if (error) return { error: "update_failed" };

  revalidatePath("/app/inbox");
  return { error: null };
}

export async function setConversationStatus(
  conversationId: string,
  status: "open" | "pending" | "closed",
): Promise<ActionResult> {
  const parsed = z
    .object({
      conversationId: z.uuid(),
      status: z.enum(["open", "pending", "closed"]),
    })
    .safeParse({ conversationId, status });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.conversationId);
  if (error) return { error: "update_failed" };

  revalidatePath("/app/inbox");
  return { error: null };
}

/** Ghi chú nội bộ: lưu messages direction 'out' + sender_type 'system' — khách KHÔNG thấy, không gửi ra kênh. */
export async function addInternalNote(
  conversationId: string,
  text: string,
): Promise<ActionResult> {
  const parsed = z
    .object({ conversationId: z.uuid(), text: z.string().trim().min(1).max(4000) })
    .safeParse({ conversationId, text });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, tenant_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conv) return { error: "not_found" };

  const { error } = await supabase.from("messages").insert({
    tenant_id: conv.tenant_id,
    conversation_id: conv.id,
    direction: "out",
    sender_type: "system",
    sender_user_id: user.id,
    content: parsed.data.text,
  });
  if (error) return { error: "insert_failed" };

  revalidatePath("/app/inbox");
  return { error: null };
}

/** Tạo contact + contact_identities (map định danh kênh) + gắn vào hội thoại. */
export async function createAndLinkContact(
  conversationId: string,
  input: { name: string; phone: string | null },
): Promise<ActionResult> {
  const parsed = z
    .object({
      conversationId: z.uuid(),
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(20).nullable(),
    })
    .safeParse({ conversationId, ...input });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, tenant_id, contact_id, external_user_id, channels(type)")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conv) return { error: "not_found" };
  if (conv.contact_id) return { error: "already_linked" };

  // Chuẩn hóa SĐT như luồng CRM (chống lọt lưới trùng lặp qua phone_e164)
  const rawPhone = parsed.data.phone ? normalizePhone(parsed.data.phone) : "";
  const validPhone = /^0\d{9,10}$/.test(rawPhone) ? rawPhone : null;
  // catalog: contact.created phát bởi cả Inbox — trigger DB (migration #15) lấy
  // `channel` từ ngữ cảnh gửi kèm để payload ghi đúng loại kênh hội thoại.
  const channelType = (conv.channels as { type?: string } | null)?.type;
  const writer = await createClient({ channel: channelType ?? "inbox" });
  const { data: contact, error: contactError } = await writer
    .from("contacts")
    .insert({
      tenant_id: conv.tenant_id,
      full_name: parsed.data.name,
      phone: validPhone,
      phone_e164: validPhone ? `+84${validPhone.slice(1)}` : null,
      owner_id: user.id, // staff RLS: người tạo tự phụ trách
      created_by: user.id,
    })
    .select("id")
    .single();
  if (contactError || !contact) return { error: "create_failed" };

  // Map định danh kênh → contact (upsert idempotent theo unique tenant+channel+external)
  if (conv.external_user_id && channelType) {
    const { error: identityError } = await supabase.from("contact_identities").upsert(
      {
        tenant_id: conv.tenant_id,
        contact_id: contact.id,
        channel_type: channelType,
        external_id: conv.external_user_id,
      },
      { onConflict: "tenant_id,channel_type,external_id" },
    );
    if (identityError) return { error: "link_identity_failed" };
  }

  const { error: linkError } = await supabase
    .from("conversations")
    .update({ contact_id: contact.id })
    .eq("id", conv.id);
  if (linkError) return { error: "link_failed" };

  revalidatePath("/app/inbox");
  return { error: null };
}

/**
 * Gửi tin trả lời khách qua channel adapter (Zalo OA + Live Chat).
 * Kênh chưa kết nối/đã ngắt → 'not_connected' (hành vi đợt 1 giữ nguyên).
 * Kênh 'token_expired' vẫn thử gửi: adapter tự refresh token, thành công thì
 * kênh tự hồi 'active'. Lỗi trả về đúng reason của adapter
 * (window_closed/token_expired/rate_limited/api_error) để client map toast.
 * Live Chat không có API ngoài: adapter không gọi đi đâu cả, tin ghi vào
 * messages là xong — widget của khách nhận qua livechat_poll.
 */
const REPLY_ADAPTERS = {
  zalo_oa: zaloAdapter,
  livechat: livechatAdapter,
} as const;
export async function sendReply(
  conversationId: string,
  text: string,
): Promise<ActionResult> {
  const parsed = z
    .object({ conversationId: z.uuid(), text: z.string().trim().min(1).max(4000) })
    .safeParse({ conversationId, text });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, tenant_id, external_user_id, channels(id, type, status)")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conv) return { error: "not_found" };

  // Embed nhiều-về-một: supabase-js không có generated types nên tự khẳng định shape
  const channel = conv.channels as unknown as {
    id: string;
    type: string;
    status: string;
  } | null;
  const adapter =
    channel && channel.type in REPLY_ADAPTERS
      ? REPLY_ADAPTERS[channel.type as keyof typeof REPLY_ADAPTERS]
      : null;
  if (
    !channel ||
    !adapter ||
    channel.status === "disconnected" ||
    !conv.external_user_id
  ) {
    return { error: "not_connected" };
  }

  const result = await adapter.send({
    channelId: channel.id,
    externalUserId: conv.external_user_id,
    text: parsed.data.text,
  });
  if (!result.ok) return { error: result.error };

  // Tin ĐÃ tới Zalo — ghi bản outbound + bump hội thoại. Nếu ghi DB lỗi thì
  // trả insert_failed để client báo; webhook oa_send_text (đợt sau) sẽ đối
  // soát các tin thiếu.
  const sentAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("messages").insert({
    tenant_id: conv.tenant_id,
    conversation_id: conv.id,
    direction: "out",
    sender_type: "agent",
    sender_user_id: user.id,
    content: parsed.data.text,
    external_message_id: result.externalMessageId || null,
    sent_at: sentAt,
  });
  if (insertError) return { error: "insert_failed" };

  await supabase
    .from("conversations")
    .update({ last_message_at: sentAt })
    .eq("id", conv.id);

  revalidatePath("/app/inbox");
  return { error: null };
}
