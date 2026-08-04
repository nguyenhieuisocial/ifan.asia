import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

/**
 * Ngữ cảnh phát event gửi kèm request.
 *
 * Từ migration #15, event nghiệp vụ do TRIGGER DB phát (cùng transaction với
 * thao tác ghi). Hai trường trong payload catalog không suy ra được từ dữ liệu
 * hàng — nguồn tạo khách (`channel`) và cách nối công ty (`link_method`) — nên
 * server action gửi kèm qua header; trigger đọc lại bằng `wf_event_ctx()`.
 * Không truyền gì → trigger dùng mặc định `crm` / `manual`.
 */
export type EventContext = { channel?: string; linkMethod?: string };

/** Supabase client cho Server Components / Server Actions / Route Handlers. */
export async function createClient(eventContext?: EventContext) {
  const cookieStore = await cookies();
  const eventHeader =
    eventContext?.channel || eventContext?.linkMethod
      ? JSON.stringify({
          ...(eventContext.channel ? { channel: eventContext.channel } : {}),
          ...(eventContext.linkMethod ? { link_method: eventContext.linkMethod } : {}),
        })
      : null;
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      ...(eventHeader ? { global: { headers: { "x-ifan-event-ctx": eventHeader } } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // gọi từ Server Component (read-only) — middleware sẽ refresh session
          }
        },
      },
    },
  );
}
