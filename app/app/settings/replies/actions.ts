"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string | null };

/**
 * CRUD Câu trả lời nhanh (đợt 2 Tiệm mẫu — bảng quick_replies migration #12).
 * RLS đã chặn ghi ngoài owner/admin/manager; server action vẫn tự verify auth
 * + role trước khi chạm DB (defense in depth) và trả key lỗi dịch được.
 */

const replySchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1000),
});

const MANAGE_ROLES = ["owner", "admin", "manager"];

/** Auth + role check dùng chung — trả supabase + tenant_id, hoặc key lỗi. */
async function requireManager(): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role, tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member || !MANAGE_ROLES.includes(member.role)) {
    return { error: "forbidden" };
  }
  return { supabase, tenantId: member.tenant_id as string };
}

function mapDbError(message: string): string {
  // unique (tenant_id, title) — trùng tiêu đề với câu đã có
  if (/duplicate|unique/i.test(message)) return "title_taken";
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

/** Thêm (id=null) hoặc sửa câu trả lời nhanh. */
export async function saveQuickReply(input: {
  id: string | null;
  title: string;
  content: string;
}): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await requireManager();
  if ("error" in ctx) return { error: ctx.error };

  if (parsed.data.id) {
    const { error } = await ctx.supabase
      .from("quick_replies")
      .update({ title: parsed.data.title, content: parsed.data.content })
      .eq("id", parsed.data.id);
    if (error) return { error: mapDbError(error.message) };
  } else {
    // sort_order = max hiện có + 1 — câu mới nằm cuối danh sách
    const { data: last } = await ctx.supabase
      .from("quick_replies")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await ctx.supabase.from("quick_replies").insert({
      tenant_id: ctx.tenantId,
      title: parsed.data.title,
      content: parsed.data.content,
      sort_order: (last?.sort_order ?? 0) + 1,
    });
    if (error) return { error: mapDbError(error.message) };
  }

  revalidatePath("/app/settings/replies");
  return { error: null };
}

export async function deleteQuickReply(id: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await requireManager();
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("quick_replies")
    .delete()
    .eq("id", parsed.data);
  if (error) return { error: "delete_failed" };

  revalidatePath("/app/settings/replies");
  return { error: null };
}

/** Đổi thứ tự bằng nút lên/xuống (không drag-drop — đợt 1 giữ đơn giản). */
export async function moveQuickReply(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await requireManager();
  if ("error" in ctx) return { error: ctx.error };

  // Đọc đúng thứ tự đang hiển thị (cùng câu order với UI/composer) rồi đánh số
  // lại tuần tự sau khi hoán vị — seed cũ có thể trùng sort_order nên chỉ swap
  // giá trị của 2 dòng là không đủ để đổi chỗ.
  const { data: rows, error: listError } = await ctx.supabase
    .from("quick_replies")
    .select("id, sort_order")
    .order("sort_order")
    .order("title");
  if (listError || !rows) return { error: "move_failed" };

  const index = rows.findIndex((r) => r.id === parsed.data);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows.length) {
    return { error: "invalid_input" };
  }

  const order = rows.map((r) => r.id);
  [order[index], order[target]] = [order[target], order[index]];

  for (let i = 0; i < order.length; i++) {
    const row = rows.find((r) => r.id === order[i]);
    if (row && row.sort_order !== i + 1) {
      const { error } = await ctx.supabase
        .from("quick_replies")
        .update({ sort_order: i + 1 })
        .eq("id", order[i]);
      if (error) return { error: "move_failed" };
    }
  }

  revalidatePath("/app/settings/replies");
  return { error: null };
}
