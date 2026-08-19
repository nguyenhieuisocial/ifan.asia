"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

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

  // Vai phải đọc qua getCurrentMembership: truy vấn tự viết ở đây thiếu
  // `status`/hạn phiên hỗ trợ ⇒ người vừa bị gỡ khỏi tiệm (`status='removed'`,
  // removeMember chỉ đổi cờ chứ KHÔNG xoá dòng) vẫn sửa/xoá được câu trả lời nhanh
  // suốt lúc thẻ đăng nhập cũ còn sống (~1 giờ). RLS bảng này đọc `app_role()` từ CLAIM nên
  // không tự biết chuyện gỡ — tầng web là chốt DUY NHẤT.
  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !MANAGE_ROLES.includes(member.role) || !tenant) {
    return { error: "forbidden" };
  }
  return { supabase, tenantId: tenant.id as string };
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
    const { data: daGhi, error } = await ctx.supabase
      .from("quick_replies")
      .update({ title: parsed.data.title, content: parsed.data.content })
      .eq("id", parsed.data.id)
      .select("id");
    if (error) return { error: mapDbError(error.message) };
    // `quick_replies_select` mở cho mọi vai, `quick_replies_manage` chỉ cho
    // owner/admin/manager — đo 20/08: nhân viên và vai Chỉ xem ĐỌC được câu trả
    // lời nhanh (1 dòng) mà sửa ra 0 dòng, KHÔNG lỗi. Cổng vai ở trên là bản
    // sao luật CSDL; phép đếm này là thứ bắt được lúc hai bản lệch.
    if (!daGhi?.length) return { error: "forbidden" };
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

  const { data: daXoa, error } = await ctx.supabase
    .from("quick_replies")
    .delete()
    .eq("id", parsed.data)
    .select("id");
  if (error) return { error: "delete_failed" };
  // Cùng lý do với `saveQuickReply` — 0 dòng là im lặng, không phải lỗi.
  if (!daXoa?.length) return { error: "delete_failed" };

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
      const { data: daDoi, error } = await ctx.supabase
        .from("quick_replies")
        .update({ sort_order: i + 1 })
        .eq("id", order[i])
        .select("id");
      if (error) return { error: "move_failed" };
      // Vòng lặp này đánh số lại CẢ danh sách. Một lệnh hụt trong im lặng là
      // thứ tự dở dang: vài câu mang số mới, vài câu giữ số cũ — người dùng
      // thấy danh sách nhảy lung tung mà không có gì báo.
      if (!daDoi?.length) return { error: "move_failed" };
    }
  }

  revalidatePath("/app/settings/replies");
  return { error: null };
}
