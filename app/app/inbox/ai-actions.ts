"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  extractContactFromConversation,
  summarizeConversation,
  suggestReplies,
  type AiResult,
  type ExtractedContact,
} from "@/lib/ai/gateway";
import { normalizePhone } from "@/app/app/contacts/types";
import { rateLimit } from "@/lib/rate-limit";

type ActionResult = { error: string | null };

/** Số tin gần nhất đưa vào transcript cho AI. */
const TRANSCRIPT_MESSAGES = 30;

/**
 * Load transcript của hội thoại: xác thực user + RLS xác nhận hội thoại thuộc
 * tenant (select không thấy = không có quyền). Ghi chú nội bộ (sender_type
 * 'system') KHÔNG đưa vào transcript.
 * Rate limit đặt ở đây vì cả 3 action AI đều đi qua: 20 lượt/phút mỗi user
 * (chống spam nút AI đốt quota tenant) — trả "rate_limited" để client toast đúng.
 */
async function loadTranscript(conversationId: string): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      transcript: string;
      contactId: string | null;
    }
  | "rate_limited"
  | null
> {
  const parsed = z.uuid().safeParse(conversationId);
  if (!parsed.success) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { allowed } = await rateLimit(`ai:user:${user.id}`, 20, 60);
  if (!allowed) return "rate_limited";

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!conv) return null;

  const { data: rows } = await supabase
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conv.id)
    .neq("sender_type", "system")
    .order("sent_at", { ascending: false })
    .limit(TRANSCRIPT_MESSAGES);

  const transcript = (rows ?? [])
    .reverse()
    .flatMap((m) => {
      const content = m.content?.trim();
      if (!content) return [];
      return [`${m.direction === "in" ? "Customer" : "Agent"}: ${content}`];
    })
    .join("\n");
  if (!transcript) return null;

  return { supabase, transcript, contactId: conv.contact_id as string | null };
}

/** Tóm tắt AI cho hội thoại — trả AiResult, client tự map reason → toast. */
export async function aiSummarizeConversation(
  conversationId: string,
): Promise<AiResult<string>> {
  const loaded = await loadTranscript(conversationId);
  if (loaded === "rate_limited") return { ok: false, reason: "rate_limited" };
  if (!loaded) return { ok: false, reason: "unknown" };
  return summarizeConversation(loaded.supabase, loaded.transcript);
}

/** Trích xuất thông tin khách; kèm contact_id để client "Áp dụng" được. */
export async function aiExtractContact(conversationId: string): Promise<
  AiResult<{ extracted: ExtractedContact; contactId: string | null }>
> {
  const loaded = await loadTranscript(conversationId);
  if (loaded === "rate_limited") return { ok: false, reason: "rate_limited" };
  if (!loaded) return { ok: false, reason: "unknown" };
  const result = await extractContactFromConversation(
    loaded.supabase,
    loaded.transcript,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: { extracted: result.data, contactId: loaded.contactId },
  };
}

/** Gợi ý 3 câu trả lời cho tin nhắn cuối của khách. */
export async function aiSuggestReplies(
  conversationId: string,
): Promise<AiResult<string[]>> {
  const loaded = await loadTranscript(conversationId);
  if (loaded === "rate_limited") return { ok: false, reason: "rate_limited" };
  if (!loaded) return { ok: false, reason: "unknown" };
  return suggestReplies(loaded.supabase, loaded.transcript);
}

/** SĐT hợp lệ dạng 0xxx → chuẩn E.164 +84xxx (cột dedupe phone_e164). */
function toE164(phone: string): string | null {
  return /^0\d{9,10}$/.test(phone) ? `+84${phone.slice(1)}` : null;
}

// Validate khoan dung theo từng trường trong applyExtractedContact — không cần schema cả cụm
export type ApplyContactFields = {
  fullName?: string;
  phone?: string;
  email?: string;
  address?: string;
};

/**
 * Áp dụng các trường AI trích xuất (đã được người dùng xác nhận) vào contact.
 * Chỉ update cột có thật trong bảng contacts; RLS chặn contact ngoài tenant.
 */
export async function applyExtractedContact(
  contactId: string,
  fields: ApplyContactFields,
): Promise<ActionResult> {
  const idParsed = z.uuid().safeParse(contactId);
  if (!idParsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // Khoan dung theo TỪNG trường: AI bóc sai 1 trường (VD SĐT rác) thì bỏ trường đó,
  // vẫn áp các trường hợp lệ còn lại — không fail cả cụm với lỗi chung chung
  const update: Record<string, string | null> = {};
  const fullName = z.string().trim().min(1).max(120).safeParse(fields.fullName);
  if (fullName.success) update.full_name = fullName.data;
  if (typeof fields.phone === "string") {
    const p = normalizePhone(fields.phone.trim());
    if (/^0\d{9,10}$/.test(p)) {
      update.phone = p;
      update.phone_e164 = toE164(p);
    }
  }
  if (typeof fields.email === "string") {
    const e = fields.email.trim();
    if (e.length <= 254 && z.email().safeParse(e).success) update.email = e;
  }
  if (typeof fields.address === "string") {
    const a = fields.address.trim();
    if (a.length > 0 && a.length <= 500) update.address = a;
  }
  if (Object.keys(update).length === 0) return { error: "invalid_input" };

  const { error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", idParsed.data);
  if (error) return { error: "update_failed" };

  revalidatePath("/app/inbox");
  revalidatePath(`/app/contacts/${idParsed.data}`);
  return { error: null };
}
