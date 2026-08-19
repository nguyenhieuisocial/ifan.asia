import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { INDUSTRIES, type Industry } from "@/lib/industries";
import { getTenantLogoUrl } from "./actions";
import { IndustryView, type PackContent } from "./industry-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Ngành & giao diện (migration #60/#61, Quy hoạch mục 15/35 V1a).
 * Mọi member XEM được pack đang dùng; chỉ owner/admin đổi (RPC
 * apply_industry_pack tự kiểm quyền — đây là lớp lịch sự UI, không phải
 * lưới bảo vệ, khớp bất biến 1 trong docs/SO-DO-HE-THONG.md).
 */
export default async function IndustrySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [member, { data: tenant }, { data: packs }, logoUrl] = await Promise.all([
    getCurrentMembership(supabase, user?.id ?? ""),
    supabase.from("tenants").select("name, slug, industry").maybeSingle(),
    supabase
      .from("industry_packs")
      .select("key, content")
      .in("key", INDUSTRIES),
    getTenantLogoUrl(supabase),
  ]);

  // Từ vựng ĐANG CÓ HIỆU LỰC = pack ngành đè bởi phần tiệm tự sửa. Đọc qua
  // `tenant_pack_view()` để chỉ có MỘT nguồn sự thật (hợp đồng D1), không tự
  // trộn lại ở tầng web — trộn hai nơi là hai nơi lệch nhau.
  const { data: packView } = await supabase.rpc("tenant_pack_view");
  const hieuLuc = ((packView ?? {}) as { terminology?: Record<string, string> })
    .terminology ?? {};

  const canManage = member?.role === "owner" || member?.role === "admin";
  const currentKey = (tenant?.industry ?? null) as Industry | null;
  const packMap: Partial<Record<Industry, PackContent>> = {};
  for (const p of packs ?? []) {
    packMap[p.key as Industry] = p.content as PackContent;
  }

  return (
    <IndustryView
      canManage={canManage}
      tenantName={(tenant?.name as string | undefined) ?? ""}
      tenantSlug={(tenant?.slug as string | undefined) ?? ""}
      currentKey={currentKey}
      packs={packMap}
      logoUrl={logoUrl}
      tuVung={{
        contact: hieuLuc.contact ?? "",
        deal: hieuLuc.deal ?? "",
        dealWon: hieuLuc.deal_won ?? "",
      }}
    />
  );
}
