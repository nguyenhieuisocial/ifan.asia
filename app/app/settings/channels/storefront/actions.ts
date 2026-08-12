"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

type ActionResult = { error: string | null };

const MANAGE_ROLES = ["owner", "admin", "manager"];
const CONFIG_ROLES = ["owner", "admin"]; // bật/tắt cổng công khai — chỉ chủ tiệm/quản trị (khác giờ mở cửa)

async function requireRole(
  roles: string[],
): Promise<
  | { supabase: Awaited<ReturnType<typeof createClient>>; tenantId: string }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !roles.includes(member.role)) return { error: "forbidden" };
  if (!tenant) return { error: "not_found" };
  return { supabase, tenantId: tenant.id as string };
}

function mapDbError(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
}

function revalidateStorefront() {
  revalidatePath("/app/settings/channels/storefront");
  revalidatePath("/app/settings/channels");
}

const configSchema = z.object({
  storefrontEnabled: z.boolean(),
  leadFormEnabled: z.boolean(),
  intro: z.string().trim().max(160),
  address: z.string().trim().max(200),
  zaloContactUrl: z.string().trim().max(300),
  leadFormFields: z.array(z.string().trim().min(1).max(60)).max(20),
});

/** Bật/tắt mặt tiền + form, giới thiệu/địa chỉ/link Zalo, field "Hỏi thêm" đã bật. */
export async function saveStorefrontConfig(
  input: z.infer<typeof configSchema>,
): Promise<ActionResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireRole(CONFIG_ROLES);
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;
  const { storefrontEnabled, leadFormEnabled, intro, address, zaloContactUrl, leadFormFields } =
    parsed.data;

  const { error } = await supabase.from("tenant_storefront").upsert(
    {
      tenant_id: tenantId,
      storefront_enabled: storefrontEnabled,
      lead_form_enabled: leadFormEnabled,
      intro: intro || null,
      address: address || null,
      zalo_contact_url: zaloContactUrl || null,
      lead_form_fields: leadFormFields,
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { error: mapDbError(error.message) };

  revalidateStorefront();
  return { error: null };
}

const hourRowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    isClosed: z.boolean(),
    openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine((r) => r.isClosed || (r.openTime && r.closeTime && r.closeTime > r.openTime), {
    message: "invalid_range",
  });
const hoursSchema = z.array(hourRowSchema).max(30);

/** Thay CẢ TUẦN một lần (nguyên tử — xem storefront_save_hours, migration #81). */
export async function saveBusinessHours(
  rows: z.infer<typeof hoursSchema>,
): Promise<ActionResult> {
  const parsed = hoursSchema.safeParse(rows);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireRole(MANAGE_ROLES);
  if ("error" in auth) return auth;
  const { supabase } = auth; // storefront_save_hours tự lấy tenant qua current_tenant_id()

  const { error } = await supabase.rpc("storefront_save_hours", {
    p_hours: parsed.data.map((r) => ({
      weekday: r.weekday,
      is_closed: r.isClosed,
      open_time: r.isClosed ? null : r.openTime,
      close_time: r.isClosed ? null : r.closeTime,
    })),
  });
  if (error) return { error: mapDbError(error.message) };

  revalidateStorefront();
  return { error: null };
}

const closureSchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(200),
    isFullDay: z.boolean(),
    openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine((r) => r.dateTo >= r.dateFrom, { message: "invalid_range" })
  .refine((r) => r.isFullDay || (r.openTime && r.closeTime && r.closeTime > r.openTime), {
    message: "invalid_range",
  });

/** Thêm một ngày nghỉ / đổi giờ đột xuất. */
export async function addBusinessClosure(
  input: z.infer<typeof closureSchema>,
): Promise<ActionResult & { id?: string }> {
  const parsed = closureSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireRole(MANAGE_ROLES);
  if ("error" in auth) return auth;
  const { supabase, tenantId } = auth;
  const { dateFrom, dateTo, reason, isFullDay, openTime, closeTime } = parsed.data;

  const { data, error } = await supabase
    .from("business_closures")
    .insert({
      tenant_id: tenantId,
      date_from: dateFrom,
      date_to: dateTo,
      reason,
      is_full_day: isFullDay,
      open_time: isFullDay ? null : openTime,
      close_time: isFullDay ? null : closeTime,
    })
    .select("id")
    .single();
  if (error) return { error: mapDbError(error.message) };

  revalidateStorefront();
  return { error: null, id: data.id as string };
}

/** Xoá một ngày nghỉ. */
export async function deleteBusinessClosure(id: string): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireRole(MANAGE_ROLES);
  if ("error" in auth) return auth;
  const { supabase } = auth;

  const { error } = await supabase.from("business_closures").delete().eq("id", parsed.data);
  if (error) return { error: mapDbError(error.message) };

  revalidateStorefront();
  return { error: null };
}
