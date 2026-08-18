"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Hợp đồng & Gói định kỳ (ADR-0022 V5).
 * QUYỀN:
 *   - service_packages: manage = owner/admin/manager; select = mọi vai.
 *   - contracts: manage = owner/admin/manager; select = mọi vai.
 *   - contract_sessions: mọi vai (nhân viên đổi buổi cho khách).
 */

type ActionResult = { error: string | null };

function loiGhi(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  if (/contract_cancelled/i.test(message)) return "contract_cancelled";
  if (/contract_full/i.test(message)) return "contract_full";
  return "save_failed";
}

// ==================== GÓI DỊCH VỤ ====================

const goiSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable(),
  sessionsTotal: z.number().int().positive().max(9999),
  validityDays: z.number().int().positive().max(3650).nullable(),
  priceVnd: z.number().int().min(0).max(100_000_000),
});

export async function taoGoi(input: z.infer<typeof goiSchema>): Promise<ActionResult & { id?: string }> {
  const parsed = goiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data, error } = await supabase
    .from("service_packages")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      sessions_total: parsed.data.sessionsTotal,
      validity_days: parsed.data.validityDays,
      price_vnd: parsed.data.priceVnd,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: loiGhi(error.message) };
  revalidatePath("/app/contracts");
  return { error: null, id: data.id as string };
}

export async function luuTruGoi(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_packages")
    .update({ status: "archived" })
    .eq("id", id);

  if (error) return { error: loiGhi(error.message) };
  revalidatePath("/app/contracts");
  return { error: null };
}

// ==================== HỢP ĐỒNG ====================

const hopDongSchema = z.object({
  contactId: z.uuid(),
  packageId: z.uuid(),
  sessionsTotal: z.number().int().positive().max(9999),
  validityDays: z.number().int().positive().max(3650).nullable(),
  pricePaidVnd: z.number().int().min(0).max(100_000_000),
  paymentMethod: z.enum(["cash", "transfer", "qr"]),
  note: z.string().trim().max(500).nullable(),
});

export async function taoHopDong(
  input: z.infer<typeof hopDongSchema>,
): Promise<ActionResult & { id?: string }> {
  const parsed = hopDongSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const startsAt = new Date().toISOString().slice(0, 10);
  const expiresAt = parsed.data.validityDays
    ? new Date(Date.now() + parsed.data.validityDays * 86400_000).toISOString().slice(0, 10)
    : null;

  const { data, error } = await supabase
    .from("contracts")
    .insert({
      contact_id: parsed.data.contactId,
      package_id: parsed.data.packageId,
      sessions_total: parsed.data.sessionsTotal,
      starts_at: startsAt,
      expires_at: expiresAt,
      price_paid_vnd: parsed.data.pricePaidVnd,
      payment_method: parsed.data.paymentMethod,
      note: parsed.data.note,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: loiGhi(error.message) };
  revalidatePath("/app/contracts");
  return { error: null, id: data.id as string };
}

export async function huyHopDong(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "active"); // chỉ huỷ khi đang active

  if (error) return { error: loiGhi(error.message) };
  revalidatePath("/app/contracts");
  return { error: null };
}

// ==================== DÙNG BUỔI ====================

const doiBuoiSchema = z.object({
  contractId: z.uuid(),
  note: z.string().trim().max(500).nullable(),
});

export async function doiMotBuoi(input: z.infer<typeof doiBuoiSchema>): Promise<ActionResult> {
  const parsed = doiBuoiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { error } = await supabase.from("contract_sessions").insert({
    contract_id: parsed.data.contractId,
    note: parsed.data.note,
    recorded_by: user.id,
  });

  if (error) return { error: loiGhi(error.message) };
  revalidatePath("/app/contracts");
  return { error: null };
}
