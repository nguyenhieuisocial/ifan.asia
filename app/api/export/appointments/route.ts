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

function fmtDateTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const STATUS_LABEL: Record<string, string> = {
  booked: "Đã đặt",
  arrived: "Khách đến",
  done: "Hoàn thành",
  cancelled: "Đã huỷ",
  no_show: "Không đến",
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

  // Get tenant timezone
  const { data: tenant } = await supabase
    .from("tenants")
    .select("timezone")
    .maybeSingle();
  const tz = tenant?.timezone ?? "Asia/Ho_Chi_Minh";

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      "contacts(full_name, phone), items(name), resources(name), profiles!staff_user_id(full_name), start_at, end_at, duration_minutes, price_vnd, status, note",
    )
    .is("deleted_at", null)
    .order("start_at", { ascending: false });

  if (error) return new NextResponse("Server error", { status: 500 });

  const lines: string[] = [
    row(
      "Khách hàng",
      "Số điện thoại",
      "Dịch vụ",
      "Tài nguyên",
      "Nhân viên",
      "Ngày giờ",
      "Thời lượng (phút)",
      "Giá (đ)",
      "Trạng thái",
      "Ghi chú",
    ),
  ];
  for (const a of appts ?? []) {
    const contact = a.contacts as unknown as { full_name: string; phone: string | null } | null;
    const item = a.items as unknown as { name: string } | null;
    const resource = a.resources as unknown as { name: string } | null;
    const staff = a.profiles as unknown as { full_name: string } | null;
    const dtStr = a.start_at ? fmtDateTz(a.start_at, tz) : "";
    lines.push(
      row(
        contact?.full_name ?? "",
        contact?.phone ?? "",
        item?.name ?? "",
        resource?.name ?? "",
        staff?.full_name ?? "",
        dtStr,
        a.duration_minutes ?? "",
        a.price_vnd ?? "",
        STATUS_LABEL[a.status ?? ""] ?? a.status ?? "",
        a.note ?? "",
      ),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lich-hen.csv"`,
    },
  });
}
