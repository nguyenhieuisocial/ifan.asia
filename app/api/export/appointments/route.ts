import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

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
    csvRow(
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
      csvRow(
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
