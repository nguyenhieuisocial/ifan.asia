import type { SupabaseClient } from "@supabase/supabase-js";
import { clientIpFrom } from "@/lib/rate-limit";

/**
 * Nhật ký đăng nhập (chỉ đạo founder 11/08, migration #63) — ghi ai vào tiệm,
 * lúc nào, từ đâu. Vị trí đọc từ header x-vercel-ip-* (Vercel tự gắn vào mọi
 * request, MIỄN PHÍ) — không gọi dịch vụ định vị trả phí nào, đúng luật hạ
 * tầng 0đ/tháng (xem lib/rate-limit.ts). Chạy local/không qua Vercel thì các
 * header này rỗng — cột vị trí NULL, không suy đoán bậy.
 *
 * Ghi lỗi thì NUỐT, không chặn đăng nhập — nhật ký là phụ, đăng nhập là chính.
 */
export async function recordLoginEvent(
  supabase: SupabaseClient,
  params: {
    userId: string;
    tenantId: string | null;
    method: "email" | "staff_phone" | "confirm_link";
    headers: Headers;
  },
): Promise<void> {
  const { userId, tenantId, method, headers } = params;
  try {
    await supabase.from("login_events").insert({
      user_id: userId,
      tenant_id: tenantId,
      method,
      ip: clientIpFrom(headers),
      city: headers.get("x-vercel-ip-city")
        ? decodeURIComponent(headers.get("x-vercel-ip-city") as string)
        : null,
      region: headers.get("x-vercel-ip-country-region"),
      country: headers.get("x-vercel-ip-country"),
      user_agent: headers.get("user-agent"),
    });
  } catch {
    // Nuốt lỗi có chủ đích — xem ghi chú đầu file.
  }
}
