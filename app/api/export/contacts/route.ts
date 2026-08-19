import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

const TIER_LABEL: Record<string, string> = {
  new: "Mới",
  regular: "Khách thường",
  vip: "VIP",
  dormant: "Đã lâu không tới",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // ⚠️ KHÔNG tự viết `.from("tenant_members").select("role").maybeSingle()`.
  // Truy vấn đó KHÔNG lọc user_id, mà RLS cho một thành viên thấy TẤT CẢ thành
  // viên cùng tiệm ⇒ tiệm từ 2 người trở lên thì maybeSingle() trả LỖI, `member`
  // thành null, và màn này chặn luôn CẢ CHỦ TIỆM. Đo trên dữ liệu thật 19/08:
  // đã có một tiệm 3 thành viên, tức lỗi đang xảy ra chứ không phải giả định.
  // Helper còn lọc `status='active'` + hạn phiên hỗ trợ (mục 69, ADR-0006).
  const member = await getCurrentMembership(supabase, user.id);
  if (!member || !MANAGE_ROLES.includes(member.role ?? "")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select(
      "full_name, phone, email, tier, lead_score, lead_sources(name), contact_tags(tags(name)), created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return new NextResponse("Server error", { status: 500 });

  const lines: string[] = [
    csvRow("Họ tên", "Số điện thoại", "Email", "Hạng", "Điểm", "Nguồn", "Nhãn", "Ngày tạo"),
  ];
  for (const c of contacts ?? []) {
    const source = (c.lead_sources as unknown as { name: string } | null)?.name ?? "";
    const tagRows = (c.contact_tags as unknown as { tags: { name: string } | null }[]) ?? [];
    const tags = tagRows.map((t) => t.tags?.name).filter(Boolean).join("; ");
    lines.push(
      csvRow(
        c.full_name,
        c.phone ?? "",
        c.email ?? "",
        TIER_LABEL[c.tier ?? ""] ?? c.tier ?? "",
        c.lead_score ?? 0,
        source,
        tags,
        c.created_at,
      ),
    );
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM for Excel UTF-8
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="khach-hang.csv"`,
    },
  });
}
