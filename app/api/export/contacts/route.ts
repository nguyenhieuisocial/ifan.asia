import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

function escCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function row(...cells: unknown[]): string {
  return cells.map(escCsv).join(",");
}

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

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .maybeSingle();
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
    row("Họ tên", "Số điện thoại", "Email", "Hạng", "Điểm", "Nguồn", "Nhãn", "Ngày tạo"),
  ];
  for (const c of contacts ?? []) {
    const source = (c.lead_sources as unknown as { name: string } | null)?.name ?? "";
    const tagRows = (c.contact_tags as unknown as { tags: { name: string } | null }[]) ?? [];
    const tags = tagRows.map((t) => t.tags?.name).filter(Boolean).join("; ");
    lines.push(
      row(
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
