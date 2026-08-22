import { NextResponse } from "next/server";
import { taiHetTrang } from "@/lib/export/tai-het-trang";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { VAI_XUAT_DON } from "@/lib/catalog/orders";
import { csvRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

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

  // ⚠️ KHÔNG tự viết `.from("tenant_members").select("role").maybeSingle()`.
  // Truy vấn đó KHÔNG lọc user_id, mà RLS cho một thành viên thấy TẤT CẢ thành
  // viên cùng tiệm ⇒ tiệm từ 2 người trở lên thì maybeSingle() trả LỖI, `member`
  // thành null, và màn này chặn luôn CẢ CHỦ TIỆM. Đo trên dữ liệu thật 19/08:
  // đã có một tiệm 3 thành viên, tức lỗi đang xảy ra chứ không phải giả định.
  // Helper còn lọc `status='active'` + hạn phiên hỗ trợ (mục 69, ADR-0006).
  const member = await getCurrentMembership(supabase, user.id);
  // ⚠️ Danh sách vai KHÔNG chép tay tại đây — nút "Xuất CSV" trên màn Đơn hàng
  // (`app/app/orders/page.tsx`) đọc CÙNG hằng số `VAI_XUAT_DON` để quyết định
  // có hiện hay không. Hai bản chép tay là có ngày nút hiện cho đúng người mà
  // cửa này chặn: bấm vào ra trang trắng `Forbidden`, không lối quay lại.
  if (!member || !VAI_XUAT_DON.includes(member.role ?? "")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Phân trang: PostgREST chặn mỗi lượt ở 1.000 dòng, nên truy vấn trần trả về
  // đúng 1.000 đơn rồi thôi — file trông sạch, thiếu phần còn lại, không báo gì.
  // Tiệm mang đi đối soát với kế toán thì lệch tiền.
  type OrderRow = {
    id: string;
    kind: string | null;
    status: string | null;
    note: string | null;
    created_at: string;
    contacts: { full_name: string; phone: string | null } | null;
    order_lines: { line_total_vnd: number }[] | null;
    order_payments: { amount_vnd: number }[] | null;
  };
  let orders: OrderRow[] = [];
  let chamTran = false;
  try {
    const kq = await taiHetTrang<OrderRow>((tu, den) =>
      supabase
        .from("orders")
        .select(
          `id, kind, status, note, created_at,
           contacts(full_name, phone),
           order_lines(line_total_vnd),
           order_payments(amount_vnd)`,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(tu, den),
    );
    orders = kq.rows;
    chamTran = kq.chamTran;
  } catch {
    return new NextResponse("Server error", { status: 500 });
  }

  // Sổ "ai tải dữ liệu gì" (record_audit, action='exported' — migration #60):
  // chủ tiệm cần biết ai đã mang đơn hàng ra khỏi phần mềm, lúc nào, bao nhiêu
  // dòng. entity_id là chính tiệm (sự kiện thuộc về cả tiệm, không phải một
  // đơn riêng lẻ).
  //
  // ⚠️ NGOẠI LỆ DUY NHẤT của route này được nuốt lỗi: ghi sổ trượt không được
  // phép chặn người đang tải một file hợp lệ — họ không có gì để sửa cả. Không
  // cần khai miễn trừ ở scripts/soat-ghi-im-lang.mjs vì cổng đó chỉ soát
  // .update()/.delete()/.upsert(), không soát .rpc().
  try {
    const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
    if (tenant) {
      await supabase.rpc("record_audit_log", {
        p_entity_type: "data_export",
        p_entity_id: tenant.id,
        p_action: "exported",
        p_diff: { loai: "orders", rows: orders.length, truncated: chamTran },
      });
    }
  } catch {
    // Xem chú thích ngay trên — cố ý bỏ qua, không làm hỏng việc tải file.
  }

  const lines: string[] = [
    csvRow(
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
    // `line_total_vnd` là cột SINH của CSDL (#198). Tự nhân lại ở đây thì phiếu
    // hoàn có giảm giá ra số lớn hơn thật đúng hai lần khoản giảm (qty âm,
    // discount_vnd dương).
    const lines_rows = (o.order_lines as unknown as { line_total_vnd: number }[]) ?? [];
    const payments = (o.order_payments as unknown as { amount_vnd: number }[]) ?? [];
    const total = lines_rows.reduce((s, l) => s + Number(l.line_total_vnd), 0);
    const paid = payments.reduce((s, p) => s + p.amount_vnd, 0);
    lines.push(
      csvRow(
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

  // Chạm trần an toàn thì NÓI RA ngay trong file — người mở CSV không thấy được
  // thông báo trên web, nên lời cảnh báo phải nằm trong chính cái họ cầm.
  if (chamTran) {
    lines.push(csvRow("(File đã đạt giới hạn xuất — còn đơn chưa nằm trong file này)"));
  }

  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="don-hang.csv"`,
    },
  });
}
