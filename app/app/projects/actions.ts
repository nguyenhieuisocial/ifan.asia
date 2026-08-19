"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions của màn Dự án (thẻ `man-du-an.html`, migration #168).
 *
 * KHÔNG kiểm lại quyền ở đây — RLS `projects_manage` / `activities_insert` /
 * `task_blocks_manage` đã là chốt chặn thật. Việc của tầng này là DỊCH mã lỗi
 * CSDL thành câu người thường đọc được: nút bấm mà không nói được vì sao hỏng
 * thì người dùng chỉ biết bấm lại.
 *
 * ⚠️ `tenant_id` PHẢI tự lấy rồi truyền vào mọi INSERT: cột `not null` không có
 * default, và `with check` của RLS chỉ SO SÁNH chứ không điền hộ.
 */

type ActionResult = { error: string | null };

type DbError = { code?: string; message: string; details?: string | null };

/**
 * Mã lỗi CSDL → khoá i18n `projects.errors.*`.
 *
 * Ba lệnh `raise exception` của migration #168 trả code P0001 với message đúng
 * bằng tên mã (taskBlocked / one_level / cross_tenant); hai ràng buộc
 * check/unique trả 23514/23505 kèm TÊN RÀNG BUỘC trong message.
 */
function mapDbError(err: DbError): string {
  const message = `${err.message} ${err.details ?? ""}`;
  if (message.includes("task_blocked")) return "taskBlocked";
  if (message.includes("task_block_one_level")) return "blockOneLevel";
  if (message.includes("task_block_cross_tenant")) return "saveFailed";
  if (message.includes("task_blocks_khong_tu_chan")) return "blockSelf";
  if (message.includes("task_blocks_khong_trung")) return "blockDuplicate";
  if (/row-level security/i.test(err.message)) return "forbidden";
  if (/violates check constraint/i.test(err.message)) return "invalidInput";
  return "saveFailed";
}

async function requireAuth(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "notAuthenticated" };
  return { ok: true, supabase, userId: user.id };
}

/** Tiệm đang mở — RLS `tenants` chỉ trả đúng một dòng cho người đăng nhập. */
async function currentTenantId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase.from("tenants").select("id").maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function revalidateProject(projectId?: string | null) {
  revalidatePath("/app/projects");
  if (projectId) revalidatePath(`/app/projects/${projectId}`);
  // Việc dự án nằm CHUNG danh sách việc hằng ngày (quyết định 3 của thẻ) —
  // đổi việc ở đây thì màn Công việc và màn Hôm nay cũng phải tươi lại.
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable(),
  budgetVnd: z.number().int().min(0).max(1_000_000_000_000),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function taoDuAn(
  input: z.infer<typeof createSchema>,
): Promise<ActionResult & { projectId?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const tenantId = await currentTenantId(auth.supabase);
  if (!tenantId) return { error: "notFound" };

  const { data, error } = await auth.supabase
    .from("projects")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      description: parsed.data.description,
      budget_vnd: parsed.data.budgetVnd,
      started_on: parsed.data.startedOn,
      created_by: auth.userId,
      // `due_on` CỐ Ý không gửi: trigger `projects_chot_ngay_xong` tính lại từ
      // việc thật, client gửi gì cũng bị ghi đè (migration #168 điểm 3).
    })
    .select("id")
    .single();

  if (error) return { error: mapDbError(error) };
  revalidateProject(data.id as string);
  return { error: null, projectId: data.id as string };
}

const updateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable(),
  budgetVnd: z.number().int().min(0).max(1_000_000_000_000),
  status: z.enum(["active", "done", "cancelled"]),
});

export async function capNhatDuAn(input: z.infer<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      budget_vnd: parsed.data.budgetVnd,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: mapDbError(error) };
  // RLS chặn ghi thì update chạy xong mà KHÔNG có dòng nào đổi — không có lỗi
  // để bắt. Không kiểm chỗ này thì nút "Lưu" báo thành công trong khi không lưu.
  if (!data) return { error: "forbidden" };
  revalidateProject(parsed.data.id);
  return { error: null };
}

const addTaskSchema = z.object({
  projectId: z.uuid(),
  subject: z.string().trim().min(1).max(200),
  ownerId: z.uuid(),
  /** Hạn theo NGÀY (yyyy-MM-dd) — chốt vào 18h giờ VN, cùng quy ước /app/tasks. */
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

/** 18h giờ VN của một ngày VN — cùng quy ước "cuối giờ làm" của bảng việc. */
function endOfWorkdayVN(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 18 - 7, 0, 0)).toISOString();
}

/**
 * Thêm việc cho dự án — ghi thẳng vào `activities` (KHÔNG có bảng việc thứ hai).
 * Nhờ vậy việc này hiện luôn ở màn Công việc / Hôm nay của người chịu trách
 * nhiệm, đúng quyết định 3 của thẻ.
 */
export async function themViecDuAn(input: z.infer<typeof addTaskSchema>): Promise<ActionResult> {
  const parsed = addTaskSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const tenantId = await currentTenantId(auth.supabase);
  if (!tenantId) return { error: "notFound" };

  const { error } = await auth.supabase.from("activities").insert({
    tenant_id: tenantId,
    type: "task",
    subject: parsed.data.subject,
    owner_id: parsed.data.ownerId,
    project_id: parsed.data.projectId,
    due_at: parsed.data.dueOn ? endOfWorkdayVN(parsed.data.dueOn) : null,
  });

  if (error) return { error: mapDbError(error) };
  revalidateProject(parsed.data.projectId);
  return { error: null };
}

const taskStateSchema = z.object({
  taskId: z.uuid(),
  state: z.enum(["todo", "doing", "done"]),
});

/**
 * Đổi trạng thái việc bằng ba mốc thời gian có sẵn (không có cột status).
 *
 * Chuyển sang "đang làm" là chỗ trigger `activities_chan_bat_dau` có thể từ
 * chối với mã `task_blocked` — lỗi đó PHẢI đến tận mắt người bấm, kèm tên việc
 * đang chặn (màn hình tự tra từ danh sách đã tải).
 */
export async function doiTrangThaiViec(
  input: z.infer<typeof taskStateSchema>,
): Promise<ActionResult> {
  const parsed = taskStateSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const now = new Date().toISOString();
  const patch =
    parsed.data.state === "done"
      ? { done_at: now }
      : parsed.data.state === "doing"
        ? { started_at: now, done_at: null }
        : { started_at: null, done_at: null };

  const { data, error } = await auth.supabase
    .from("activities")
    .update(patch)
    .eq("id", parsed.data.taskId)
    .eq("type", "task")
    .select("project_id")
    .maybeSingle();

  if (error) return { error: mapDbError(error) };
  if (!data) return { error: "forbidden" };
  revalidateProject(data.project_id as string | null);
  return { error: null };
}

const blockSchema = z.object({
  projectId: z.uuid(),
  blockerId: z.uuid(),
  blockedId: z.uuid(),
});

/**
 * Khai "việc A chặn việc B". MỘT TẦNG là luật CSDL (trigger
 * `task_blocks_mot_tang`), ở đây chỉ dịch lời từ chối sang tiếng người.
 */
export async function khaiViecChan(input: z.infer<typeof blockSchema>): Promise<ActionResult> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };
  if (parsed.data.blockerId === parsed.data.blockedId) return { error: "blockSelf" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const tenantId = await currentTenantId(auth.supabase);
  if (!tenantId) return { error: "notFound" };

  const { error } = await auth.supabase.from("task_blocks").insert({
    tenant_id: tenantId,
    blocker_id: parsed.data.blockerId,
    blocked_id: parsed.data.blockedId,
    created_by: auth.userId,
  });

  if (error) return { error: mapDbError(error) };
  revalidateProject(parsed.data.projectId);
  return { error: null };
}

const unblockSchema = z.object({ projectId: z.uuid(), blockId: z.uuid() });

export async function boViecChan(input: z.infer<typeof unblockSchema>): Promise<ActionResult> {
  const parsed = unblockSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.from("task_blocks").delete().eq("id", parsed.data.blockId);

  if (error) return { error: mapDbError(error) };
  revalidateProject(parsed.data.projectId);
  return { error: null };
}
