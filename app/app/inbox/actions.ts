"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
  const { data: contact, error: contactError } = await supabase
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
  const channelType = (conv.channels as { type?: string } | null)?.type;
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
 * Gửi tin trả lời khách. Đợt 1 chưa có kênh nào kết nối → luôn trả
 * 'not_connected' (client toast "Chưa kết nối Zalo OA — tính năng gửi sẽ mở
 * khi kết nối kênh"). Đợt sau: insert messages direction 'out' sender_type
 * 'agent' + đẩy queue outbound qua channel adapter.
 */
export async function sendReply(
  conversationId: string,
  text: string,
): Promise<ActionResult> {
  const parsed = z
    .object({ conversationId: z.uuid(), text: z.string().trim().min(1).max(4000) })
    .safeParse({ conversationId, text });
  if (!parsed.success) return { error: "invalid_input" };

  return { error: "not_connected" };
}
