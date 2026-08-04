"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { MergeField } from "./duplicates/types";

/**
 * Gộp khách trùng — mọi việc nặng nằm trong RPC merge_contacts (migration #18):
 * security definer, kiểm vai owner/admin/manager, nguyên tử và LŨY ĐẲNG.
 * Server action ở đây chỉ validate đầu vào và dịch lỗi cho người dùng.
 *
 * Quy ước lỗi giống contacts/actions.ts: error là chuỗi ĐÃ DỊCH, client toast thẳng.
 */
type ActionResult = { error: string | null };

/** Postgres: insufficient_privilege — RPC từ chối vì sai vai. */
const INSUFFICIENT_PRIVILEGE = "42501";

export type MovedCounts = {
  deals: number;
  activities: number;
  conversations: number;
  tags: number;
  identities: number;
};

const side = z.enum(["winner", "loser"]).optional();

// Liệt kê tường minh để zod strip mọi key lạ trước khi gửi xuống DB
const choiceSchema = z.object({
  full_name: side,
  phone: side,
  email: side,
  source_id: side,
  company_id: side,
  owner_id: side,
  tier: side,
});

const pairSchema = z
  .object({ aId: z.uuid(), bId: z.uuid() })
  .refine((v) => v.aId !== v.bId, { message: "invalidPair" });

export async function mergeContactPair(
  winnerId: string,
  loserId: string,
  choices: Partial<Record<MergeField, "winner" | "loser">>,
): Promise<ActionResult & { moved?: MovedCounts }> {
  const t = await getTranslations("contacts.merge.errors");
  const parsedPair = pairSchema.safeParse({ aId: winnerId, bId: loserId });
  const parsedChoices = choiceSchema.safeParse(choices ?? {});
  if (!parsedPair.success || !parsedChoices.success) {
    return { error: t("invalidPair") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("sessionExpired") };

  // Chỉ gửi field người dùng chọn lấy của bản thua — mặc định của RPC là giữ bản chính
  const fields = Object.fromEntries(
    Object.entries(parsedChoices.data).filter(([, v]) => v === "loser"),
  );

  const { data, error } = await supabase.rpc("merge_contacts", {
    p_winner_id: parsedPair.data.aId,
    p_loser_id: parsedPair.data.bId,
    p_fields: fields,
  });
  if (error) {
    if (error.code === INSUFFICIENT_PRIVILEGE) return { error: t("forbidden") };
    return { error: t("mergeFailed") };
  }

  const result = (data ?? {}) as { status?: string; moved?: MovedCounts };

  revalidatePath("/app/contacts");
  revalidatePath("/app/contacts/duplicates");
  revalidatePath(`/app/contacts/${parsedPair.data.aId}`);
  revalidatePath("/app/companies"); // số khách của công ty đổi
  return { error: null, moved: result.moved };
}

/** "Không phải trùng": ghi vĩnh viễn, cặp này không bao giờ hiện lại trong gợi ý. */
export async function dismissContactPair(
  aId: string,
  bId: string,
): Promise<ActionResult> {
  const t = await getTranslations("contacts.merge.errors");
  const parsed = pairSchema.safeParse({ aId, bId });
  if (!parsed.success) return { error: t("invalidPair") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase.rpc("dismiss_duplicate_pair", {
    p_a: parsed.data.aId,
    p_b: parsed.data.bId,
  });
  if (error) {
    if (error.code === INSUFFICIENT_PRIVILEGE) return { error: t("forbidden") };
    return { error: t("dismissFailed") };
  }

  revalidatePath("/app/contacts/duplicates");
  revalidatePath("/app/contacts");
  return { error: null };
}
