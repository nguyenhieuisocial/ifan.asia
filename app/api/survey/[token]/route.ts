import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

/**
 * Cửa CÔNG KHAI (khách không đăng nhập) → phải có chốt chặn, cùng luật với
 * Live Chat và webhook. Token 144 bit không dò nổi, nhưng cửa vẫn phải chặn
 * kẻ nã hàng loạt: mỗi IP 20 lượt / 10 phút là quá đủ cho người thật (một
 * người chỉ gửi ĐÚNG MỘT phiếu).
 */
const LIMIT = 20;
const WINDOW_SECONDS = 600;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const ip = clientIpFrom(req.headers);
  const { allowed } = await rateLimit(`survey:ip:${ip}`, LIMIT, WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const supabase = await createClient();

  // Gọi RPC SECURITY DEFINER — không cần auth, bảo mật qua token
  const { data, error } = await supabase.rpc("submit_survey", {
    p_token: token,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment ?? null,
  });

  if (error) {
    console.error("[survey] submit_survey lỗi:", error.message);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (data !== "ok") {
    return NextResponse.json({ error: data }, { status: 409 });
  }

  return NextResponse.json({ result: "ok" });
}
