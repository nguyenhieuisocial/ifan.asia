import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { ghiDaDung, traKhoa, type QuyenApi } from "@/lib/integrations/api-key";

/**
 * API đọc dữ liệu bằng KHOÁ API (V6 integrations).
 *
 * ⚠️ VÌ SAO LÀ ROUTE MỚI CHỨ KHÔNG GẮN KHOÁ VÀO 3 CỬA XUẤT EXCEL SẴN CÓ:
 * xác thực bằng khoá thì không có phiên đăng nhập, nên RLS không có gì để lọc
 * theo — bắt buộc dùng service role, và service role BỎ QUA RLS. Nếu rải cách
 * đó vào ba route sẵn có, mỗi route lại phải tự nhớ `.eq("tenant_id", ...)` cho
 * từng truy vấn; quên một chỗ là dữ liệu tiệm này chảy sang tiệm khác. Kho này
 * đã vá đúng lớp lỗi đó nhiều lần.
 *
 * Ở đây MỌI nguồn đi qua đúng MỘT hàm dựng truy vấn, và bộ lọc tiệm nằm trong
 * hàm đó — không có đường nào bỏ qua được.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const NGUON = {
  orders: {
    quyen: "read:orders" as QuyenApi,
    bang: "orders",
    cot: "id, kind, status, contact_id, created_at, updated_at",
    sap: "created_at",
  },
  contacts: {
    quyen: "read:contacts" as QuyenApi,
    bang: "contacts",
    cot: "id, full_name, phone, email, tier, lifecycle, created_at",
    sap: "created_at",
  },
  appointments: {
    quyen: "read:appointments" as QuyenApi,
    bang: "appointments",
    cot: "id, contact_id, item_id, staff_user_id, start_at, end_at, status",
    sap: "start_at",
  },
} as const;

/** Trần một trang. Bên gọi xin nhiều hơn thì kẹp về đây, và NÓI RA trong kết quả. */
const TRAN_TRANG = 200;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ nguon: string }> },
) {
  const { nguon } = await params;
  const cauHinh = NGUON[nguon as keyof typeof NGUON];
  if (!cauHinh) return NextResponse.json({ error: "khong_co_nguon_nay" }, { status: 404 });

  // Chốt chặn theo IP đứng TRƯỚC mọi việc đụng CSDL: cửa công khai, ai cũng gọi
  // được, và thử khoá hàng loạt là cách tấn công đầu tiên người ta nghĩ ra.
  const { allowed } = await rateLimit(`api-v1:ip:${clientIpFrom(req.headers)}`, 120, 60);
  if (!allowed) return NextResponse.json({ error: "qua_nhieu_luot" }, { status: 429 });

  const supabase = createServiceClient();
  const khoa = await traKhoa(supabase, req.headers.get("authorization"), cauHinh.quyen);
  if (!khoa.ok) {
    const ma = khoa.lyDo === "thieu_quyen" ? 403 : khoa.lyDo === "chua_cau_hinh" ? 503 : 401;
    return NextResponse.json({ error: khoa.lyDo }, { status: ma });
  }

  const url = new URL(req.url);
  const xin = Number(url.searchParams.get("limit") ?? TRAN_TRANG);
  const soDong = Number.isFinite(xin) ? Math.min(Math.max(Math.trunc(xin), 1), TRAN_TRANG) : TRAN_TRANG;
  const boQua = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  // ⛔ ĐÂY LÀ CHỖ DUY NHẤT dựng truy vấn, và `.eq("tenant_id", ...)` nằm ngay
  // trong đó. Đừng tách ra thành nhiều nhánh theo nguồn — tách ra là mở đường
  // cho một nhánh quên bộ lọc tiệm.
  const { data, error, count } = await supabase!
    .from(cauHinh.bang)
    .select(cauHinh.cot, { count: "exact" })
    .eq("tenant_id", khoa.tenantId)
    .order(cauHinh.sap, { ascending: false })
    .range(boQua, boQua + soDong - 1);

  if (error) {
    console.error(`[api-v1] đọc ${cauHinh.bang} hỏng:`, error.message);
    return NextResponse.json({ error: "doc_du_lieu_hong" }, { status: 500 });
  }

  // Không chờ: ghi mốc dùng là số liệu vận hành, không được làm chậm lời gọi.
  void ghiDaDung(supabase, khoa.keyId);

  return NextResponse.json(
    {
      data: data ?? [],
      // Nói rõ đang cắt ở đâu và còn bao nhiêu — bên gọi tự phân trang được,
      // không phải đoán xem mình đã lấy hết chưa.
      paging: { limit: soDong, offset: boQua, total: count ?? null, max_limit: TRAN_TRANG },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
