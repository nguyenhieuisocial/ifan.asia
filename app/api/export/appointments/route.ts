import { NextResponse } from "next/server";
import { taiHetTrang } from "@/lib/export/tai-het-trang";
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

  // KHÔNG embed `profiles!staff_user_id(...)`. `appointments.staff_user_id` có
  // khoá ngoại trỏ `auth.users`, KHÔNG có khoá ngoại trực tiếp tới `profiles`,
  // mà PostgREST chỉ suy được phép nối qua khoá ngoại TRỰC TIẾP. Câu cũ trả về
  // HTTP 400 (PGRST200) ⇒ nút Xuất Excel của màn Lịch hỏng HOÀN TOÀN, người
  // dùng chỉ thấy "Server error". Câu cũ còn sai cả tên cột (`profiles` có
  // `display_name`, không có `full_name`), nhưng sửa mỗi tên cột không cứu
  // được — đã đo bằng cách gọi thật: vẫn 400.
  //
  // Chữa theo đúng khuôn `app/app/calendar/queries.ts`: tách hai truy vấn.
  // `contacts` / `items` / `resources` thì embed được vì có khoá ngoại thẳng.
  // Phân trang: PostgREST chặn mỗi lượt ở 1.000 dòng — tiệm chạy vài tháng là
  // file lịch hẹn thiếu phần cũ mà không báo gì.
  type ApptRow = {
    contacts: { full_name: string; phone: string | null } | null;
    items: { name: string } | null;
    resources: { name: string } | null;
    staff_user_id: string | null;
    start_at: string;
    end_at: string;
    price_vnd: number | null;
    status: string | null;
    note: string | null;
  };
  let appts: ApptRow[] = [];
  let chamTran = false;
  try {
    const kq = await taiHetTrang<ApptRow>((tu, den) =>
      supabase
        .from("appointments")
        .select(
      // `duration_minutes` là cột của bảng DỊCH VỤ (`items`), KHÔNG phải của
      // `appointments` — bảng này chỉ có `start_at` / `end_at`. Xin nó ở đây
      // làm cả câu trả 400 (42703 "column does not exist") ⇒ nút Xuất Excel
      // hỏng 100%, lần nào bấm cũng ra "Server error". Thời lượng THẬT của một
      // lịch hẹn là khoảng cách hai mốc giờ, không phải thời lượng chuẩn của
      // dịch vụ — khách xin làm nhanh hay kéo dài thì hai số đó lệch nhau.
          "contacts(full_name, phone), items(name), resources(name), staff_user_id, start_at, end_at, price_vnd, status, note",
        )
        .is("deleted_at", null)
        .order("start_at", { ascending: false })
        .order("id", { ascending: false })
        .range(tu, den),
    );
    appts = kq.rows;
    chamTran = kq.chamTran;
  } catch {
    return new NextResponse("Server error", { status: 500 });
  }

  // RLS tự giới hạn về đúng đồng nghiệp cùng tiệm — không cần `.in(ids)`.
  const { data: hoSo } = await supabase.from("profiles").select("user_id, display_name");
  const tenTheoUser = new Map(
    ((hoSo ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [
      p.user_id,
      p.display_name,
    ]),
  );

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
    const tenNhanVien = tenTheoUser.get(a.staff_user_id as string)?.trim() ?? "";
    const dtStr = a.start_at ? fmtDateTz(a.start_at, tz) : "";
    // Thời lượng tính từ hai mốc giờ của chính lịch hẹn này (xem chú thích ở
    // câu truy vấn). Thiếu mốc thì để trống, không đoán bằng số của dịch vụ.
    const soPhut =
      a.start_at && a.end_at
        ? Math.round(
            (new Date(a.end_at as string).getTime() - new Date(a.start_at as string).getTime()) /
              60000,
          )
        : "";
    lines.push(
      csvRow(
        contact?.full_name ?? "",
        contact?.phone ?? "",
        item?.name ?? "",
        resource?.name ?? "",
        tenNhanVien,
        dtStr,
        soPhut,
        a.price_vnd ?? "",
        STATUS_LABEL[a.status ?? ""] ?? a.status ?? "",
        a.note ?? "",
      ),
    );
  }

  // Chạm trần thì NÓI RA ngay trong file — người mở CSV không thấy thông báo web.
  if (chamTran) {
    lines.push(csvRow("(File đã đạt giới hạn xuất — còn lịch hẹn chưa nằm trong file này)"));
  }

  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lich-hen.csv"`,
    },
  });
}
