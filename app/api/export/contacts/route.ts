import { NextResponse } from "next/server";
import { taiHetTrang } from "@/lib/export/tai-het-trang";
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

  // Phân trang: PostgREST chặn mỗi lượt ở 1.000 dòng. Truy vấn trần trả đúng
  // 1.000 khách rồi thôi — file thiếu người mà không một dòng nào báo.
  type ContactRow = {
    full_name: string | null;
    phone: string | null;
    email: string | null;
    tier: string | null;
    lead_score: number | null;
    lead_sources: { name: string } | null;
    contact_tags: { tags: { name: string } | null }[] | null;
    created_at: string;
  };
  let contacts: ContactRow[] = [];
  let chamTran = false;
  try {
    const kq = await taiHetTrang<ContactRow>((tu, den) =>
      supabase
        .from("contacts")
        .select(
          "full_name, phone, email, tier, lead_score, lead_sources(name), contact_tags(tags(name)), created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(tu, den),
    );
    contacts = kq.rows;
    chamTran = kq.chamTran;
  } catch {
    return new NextResponse("Server error", { status: 500 });
  }

  // Sổ "ai tải dữ liệu gì" (record_audit, action='exported' — migration #60):
  // chủ tiệm cần biết ai đã mang danh bạ kèm SĐT ra khỏi phần mềm, lúc nào, bao
  // nhiêu dòng. entity_id là chính tiệm (sự kiện thuộc về cả tiệm, không phải
  // một khách riêng lẻ).
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
        p_diff: { loai: "contacts", rows: contacts.length, truncated: chamTran },
      });
    }
  } catch {
    // Xem chú thích ngay trên — cố ý bỏ qua, không làm hỏng việc tải file.
  }

  const lines: string[] = [
    csvRow("Họ tên", "Số điện thoại", "Email", "Hạng", "Điểm", "Nguồn", "Nhãn", "Ngày tạo"),
  ];
  for (const c of contacts) {
    const source = c.lead_sources?.name ?? "";
    const tagRows = c.contact_tags ?? [];
    const tags = tagRows.map((t) => t.tags?.name).filter(Boolean).join("; ");
    lines.push(
      csvRow(
        c.full_name ?? "",
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

  // Chạm trần thì NÓI RA ngay trong file — người mở CSV không thấy thông báo web.
  if (chamTran) {
    lines.push(csvRow("(File đã đạt giới hạn xuất — còn khách chưa nằm trong file này)"));
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM for Excel UTF-8
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="khach-hang.csv"`,
    },
  });
}
