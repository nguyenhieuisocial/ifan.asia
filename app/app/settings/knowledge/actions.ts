"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { gatherAutopilotFacts, gatherAutopilotKb } from "@/lib/ai/autopilot-facts";
import { buildAutopilotSystemPrompt } from "@/lib/ai/autopilot-answer";
import {
  KB_ANSWER_MAX,
  KB_CUSTOM_INSTRUCTION_MAX,
  KB_QUESTION_MAX,
  getCustomInstruction,
  listKbEntries,
  type KbEntry,
} from "@/lib/ai/kb";

/**
 * Cài đặt → Kho tri thức (ADR-0015 việc 3).
 *
 * HAI TẦNG QUYỀN KHÁC NHAU trên CÙNG một màn — đọc kỹ trước khi sửa:
 *  - Mục kho tri thức (soạn/sửa): mọi vai TRỪ Chỉ xem — đúng RLS
 *    `kb_entries_insert`/`kb_entries_update` (điều kiện app_role() <> 'viewer').
 *    Đăng/gỡ đăng/xoá: chỉ
 *    owner/admin — ép THẬT ở trigger `kb_entries_guard()` (migration #113-115),
 *    ở đây chỉ kiểm lại làm phép lịch sự UI (thông báo lỗi rõ hơn "RLS denied").
 *  - Lời dặn riêng (đọc/ghi): chỉ owner/admin/manager — khớp RLS
 *    `ai_autopilot_manage` (migration #105), staff không đọc được giá trị.
 */

type ActionResult = { error: string | null };

const PUBLISH_ROLES = ["owner", "admin"];
const MANAGE_ROLES = ["owner", "admin", "manager"];

async function requireMember(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; role: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  const member = await getCurrentMembership(supabase, user.id);
  if (!member) return { error: "forbidden" };
  return { supabase, role: member.role };
}

function revalidateKb() {
  revalidatePath("/app/settings/knowledge");
}

/** Đổi 'row-level security'/exception CSDL thành khoá lỗi màn hiểu được — không lộ chi tiết SQL ra người dùng. */
function toKbError(message: string): string {
  if (/kb_publish_forbidden/.test(message)) return "publish_forbidden";
  if (/kb_delete_forbidden/.test(message)) return "delete_forbidden";
  if (/kb_limit_entries/.test(message)) return "limit_entries";
  if (/kb_limit_chars/.test(message)) return "limit_chars";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

const entrySchema = z.object({
  question: z.string().trim().min(3).max(KB_QUESTION_MAX),
  answer: z.string().trim().min(3).max(KB_ANSWER_MAX),
});

export async function saveKbEntry(
  input: { id?: string } & z.infer<typeof entrySchema>,
): Promise<ActionResult & { entries?: KbEntry[] }> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireMember();
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  if (input.id) {
    // RLS kb_entries_update chặn vai Chỉ xem, và .update() bị lọc thì trả
    // error=null + 0 dòng — im hệt lúc lưu được. Đếm dòng để 0 dòng thành lời
    // báo, thay vì toast "Đã lưu" trên một câu trả lời không hề đổi.
    const { data: updated, error } = await supabase
      .from("kb_entries")
      .update({ question: parsed.data.question, answer: parsed.data.answer })
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    if (error) return { error: toKbError(error.message) };
    if (!updated) return { error: "forbidden" };
  } else {
    const { error } = await supabase.from("kb_entries").insert({
      tenant_id: tenant.id as string,
      question: parsed.data.question,
      answer: parsed.data.answer,
    });
    if (error) return { error: toKbError(error.message) };
  }

  revalidateKb();
  return { error: null, entries: await listKbEntries(supabase) };
}

async function setKbStatus(id: string, status: "published" | "draft"): Promise<ActionResult & { entries?: KbEntry[] }> {
  const auth = await requireMember();
  if ("error" in auth) return auth;
  const { supabase, role } = auth;
  // Kiểm TRƯỚC để trả lỗi rõ — trigger chặn thật, nhưng "publish_forbidden"
  // dễ hiểu hơn phải chờ round-trip lỗi từ CSDL rồi mới đoán ra.
  if (!PUBLISH_ROLES.includes(role)) return { error: "publish_forbidden" };

  const { data: daDoi, error } = await supabase
    .from("kb_entries")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return { error: toKbError(error.message) };
  // 0 dòng không sinh lỗi. Vai Chỉ xem — vai duy nhất mà phép đo 20/08 thấy ĐỌC
  // được câu hỏi đáp mà sửa ra 0 dòng im lặng — đã bị `PUBLISH_ROLES` chặn ở
  // trên, nên nghĩa còn lại là câu đó đã bị xoá. Không đếm thì nút Đăng/Rút
  // hiện xanh trên một câu không còn tồn tại.
  if (!daDoi?.length) return { error: "not_found" };

  revalidateKb();
  return { error: null, entries: await listKbEntries(supabase) };
}

// "use server" đòi MỖI export phải tự là hàm async — const trỏ tới hàm async
// khác (như bản trước) không được nhận diện, Next.js báo lỗi dựng bản.
export async function publishKbEntry(id: string) {
  return setKbStatus(id, "published");
}
export async function unpublishKbEntry(id: string) {
  return setKbStatus(id, "draft");
}

export async function deleteKbEntry(id: string): Promise<ActionResult & { entries?: KbEntry[] }> {
  const auth = await requireMember();
  if ("error" in auth) return auth;
  const { supabase, role } = auth;
  if (!PUBLISH_ROLES.includes(role)) return { error: "delete_forbidden" };

  const { data: daXoa, error } = await supabase.from("kb_entries").delete().eq("id", id).select("id");
  if (error) return { error: toKbError(error.message) };
  // Cùng lý lẽ với `setKbStatus`. Riêng phép xoá, đo 20/08 cho thấy các vai
  // thấp bị một trigger CSDL ném lỗi rõ ràng (không im lặng), nên 0 dòng ở đây
  // chỉ còn một nghĩa: câu đã bị xoá trước đó.
  if (!daXoa?.length) return { error: "not_found" };

  revalidateKb();
  return { error: null, entries: await listKbEntries(supabase) };
}

const customInstructionSchema = z.string().max(KB_CUSTOM_INSTRUCTION_MAX);

export async function saveCustomInstruction(
  raw: string,
): Promise<ActionResult & { customInstruction?: string | null }> {
  const trimmed = raw.trim();
  const parsed = customInstructionSchema.safeParse(trimmed);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireMember();
  if ("error" in auth) return auth;
  const { supabase, role } = auth;
  if (!MANAGE_ROLES.includes(role)) return { error: "forbidden" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  // upsert CHỈ 2 cột — ON CONFLICT chỉ SET đúng 2 cột này, các cột khác của
  // ai_autopilot (enabled, scope, cap...) giữ nguyên giá trị đã có, hoặc lấy
  // default của bảng nếu đây là hàng ĐẦU TIÊN của tiệm (chưa từng mở AI trực
  // việc). Không được dùng .update() đơn thuần — hàng có thể chưa tồn tại.
  const { error } = await supabase.from("ai_autopilot").upsert({
    tenant_id: tenant.id as string,
    custom_instruction: trimmed || null,
  });
  if (error) return { error: toKbError(error.message) };

  revalidateKb();
  return { error: null, customInstruction: trimmed || null };
}

/**
 * "Xem AI đang đọc gì" — dựng ĐÚNG lời nhắc thật bằng
 * `buildAutopilotSystemPrompt()`, KHÔNG tự viết lại. Không gọi Anthropic
 * (không tốn lượt AI của tiệm) — chỉ ghép văn bản để xem trước.
 */
export async function previewAutopilotPrompt(): Promise<
  ActionResult & { prompt?: string }
> {
  const auth = await requireMember();
  if ("error" in auth) return auth;
  const { supabase, role } = auth;
  if (!MANAGE_ROLES.includes(role)) return { error: "forbidden" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };
  const tenantId = tenant.id as string;

  const [facts, kb, customInstruction] = await Promise.all([
    gatherAutopilotFacts(supabase, tenantId),
    gatherAutopilotKb(supabase, tenantId),
    getCustomInstruction(supabase),
  ]);

  return { error: null, prompt: buildAutopilotSystemPrompt({ facts, kb, customInstruction }) };
}
