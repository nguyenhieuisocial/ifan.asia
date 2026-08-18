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

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã xác nhận",
  completed: "Hoàn thành",
  cancelled: "Đã huỷ",
};

const KIND_LABEL: Record<string, string> = {
  order: "Đơn hàng",
  return: "Phiếu hoàn",
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

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `id, kind, status, note, created_at,
       contacts(full_name, phone),
       order_lines(qty, unit_price_vnd, discount_vnd),
       order_payments(amount_vnd)`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return new NextResponse("Server error", { status: 500 });

  const lines: string[] = [
    row(
      "Loại",
      "Khách hàng",
      "Số điện thoại",
      "Tổng tiền",
      "Đã trả",
      "Còn lại",
      "Trạng thái",
      "Ghi chú",
      "Ngày tạo",
    ),
  ];
  for (const o of orders ?? []) {
    const contact = o.contacts as unknown as { full_name: string; phone: string | null } | null;
    const lines_rows = (o.order_lines as unknown as { qty: number; unit_price_vnd: number; discount_vnd: number }[]) ?? [];
    const payments = (o.order_payments as unknown as { amount_vnd: number }[]) ?? [];
    const total = lines_rows.reduce((s, l) => s + l.qty * l.unit_price_vnd - l.discount_vnd, 0);
    const paid = payments.reduce((s, p) => s + p.amount_vnd, 0);
    lines.push(
      row(
        KIND_LABEL[o.kind ?? ""] ?? o.kind ?? "",
        contact?.full_name ?? "",
        contact?.phone ?? "",
        total,
        paid,
        total - paid,
        STATUS_LABEL[o.status ?? ""] ?? o.status ?? "",
        o.note ?? "",
        o.created_at,
      ),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="don-hang.csv"`,
    },
  });
}
