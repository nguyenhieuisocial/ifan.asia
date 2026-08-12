"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { newVisitorToken, sha256Hex, ipHashFor } from "@/lib/channels/livechat";

/**
 * Form thu lead công khai /t/[slug] (ADR-0008 mục 7, task #88).
 *
 * Danh tính khách vãng lai KHÔNG qua localStorage/JS như widget Live Chat (đó
 * là trang của BÊN THỨ BA, phải tự quản lý token ở tầng JS) — đây là trang
 * NHẤT THỂ của iFan nên dùng cookie httpOnly do chính server action này phát:
 * đơn giản hơn, và token không bao giờ lộ ra phía JS trình duyệt. sha256 +
 * ipHashFor tái dùng nguyên hàm của Live Chat (#23) — cùng công thức băm.
 */
const COOKIE_NAME = "ifan_sf_tok";

async function tokenHash(): Promise<string> {
  const jar = await cookies();
  let raw = jar.get(COOKIE_NAME)?.value;
  if (!raw || raw.length !== 64) {
    raw = newVisitorToken();
    jar.set(COOKIE_NAME, raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return sha256Hex(raw);
}

const submitSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  fields: z.record(z.string(), z.string().max(200)).default({}),
});

export type SubmitLeadResult =
  | { error: null; duplicate: boolean }
  | { error: "invalid_input" | "not_found" | "form_disabled" | "invalid_phone" | "rate_limited" | "failed" };

export async function submitStorefrontLead(
  input: z.infer<typeof submitSchema>,
): Promise<SubmitLeadResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const h = await headers();
  const p_token_hash = await tokenHash();
  const p_ip_hash = ipHashFor(h, parsed.data.slug);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storefront_submit_lead", {
    p_slug: parsed.data.slug,
    p_token_hash,
    p_ip_hash,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_fields: parsed.data.fields,
  });

  if (error) {
    for (const key of ["not_found", "form_disabled", "invalid_phone", "invalid_request", "rate_limited"] as const) {
      if (error.message.includes(key)) {
        return { error: key === "invalid_request" ? "invalid_input" : key };
      }
    }
    return { error: "failed" };
  }

  return { error: null, duplicate: Boolean((data as { duplicate?: boolean } | null)?.duplicate) };
}
