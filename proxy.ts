import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

/** Refresh session + chặn /app và /onboarding khi chưa đăng nhập. (Next 16: proxy.ts thay middleware.ts) */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (
    !user &&
    (pathname.startsWith("/app") ||
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/admin"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}

// /admin có mặt ở đây để phiên đăng nhập được làm mới; QUYỀN vào khu super-admin
// do layout /admin quyết định (RPC is_platform_admin → 404 nếu không phải).
export const config = {
  matcher: ["/app/:path*", "/onboarding", "/admin/:path*"],
};
