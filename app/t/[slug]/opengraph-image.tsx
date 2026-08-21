import { ImageResponse } from "next/og";
import { loadStorefront } from "./storefront-data";

/**
 * ẢNH XEM TRƯỚC RIÊNG CHO TỪNG TIỆM.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN — ĐO ĐƯỢC NGÀY 21/08
 * ═══════════════════════════════════════════════════════════════════
 * `/t/[slug]` là MẶT TIỀN của tiệm — đúng cái link chủ tiệm dán vào Zalo,
 * Facebook, tin nhắn gửi khách. Trước bản này thư mục không có file ảnh riêng,
 * nên Next lấy ảnh gốc ở `app/opengraph-image.tsx`: MỌI tiệm chia sẻ ra đều
 * hiện CÙNG một ảnh và cùng dòng chữ của trang chủ iFan. Khách nhận link không
 * nhận ra là tiệm nào — link trông như quảng cáo của một phần mềm lạ.
 *
 * ⚠️ CHỮ NẰM TRONG ẢNH nên KHÔNG đi qua `messages/*.json`. Đây là ngoại lệ i18n
 *   có chủ đích, giống `app/opengraph-image.tsx`: ảnh dựng sẵn một lần cho mỗi
 *   tiệm, không đổi theo ngôn ngữ người xem link.
 *
 * ⚠️ TÊN TIỆM PHẢI CẮT AN TOÀN. Tên dài tràn ra ngoài khung là ảnh vỡ, mà ảnh
 *   vỡ thì không ai báo — nó chỉ nằm im trong mọi tin nhắn đã gửi đi.
 *
 * ⚠️ Tiệm TẮT mặt tiền vẫn phải ra một ảnh (ảnh chung), KHÔNG được ném lỗi:
 *   ném lỗi ở đây làm Zalo/Facebook không lấy được ảnh nào cả.
 */

export const alt = "Mặt tiền tiệm trên iFan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NEN = "#c94c18";
const KEM = "#ffeee8";
const VIEN = "#A03A10";

/** Cắt theo số ký tự, thêm dấu ba chấm — tên dài tràn khung là ảnh vỡ. */
function catNgan(s: string, tran: number): string {
  const t = s.trim();
  return t.length <= tran ? t : t.slice(0, tran - 1).trimEnd() + "…";
}

export default async function Anh({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await loadStorefront(slug);
  const ten = r.kind === "ok" && r.data.enabled && r.data.name ? r.data.name : "iFan.asia";
  const phu =
    r.kind === "ok" && r.data.enabled
      ? (r.data.intro?.trim() || r.data.address?.trim() || "Đặt lịch nhanh, nhắn tin trực tiếp")
      : "Quản trị doanh nghiệp của bạn";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NEN,
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              borderRadius: 999,
              border: `2px solid ${VIEN}`,
              background: "rgba(0,0,0,0.12)",
              color: KEM,
              fontSize: 26,
              padding: "8px 22px",
              letterSpacing: 1,
            }}
          >
            MẶT TIỀN TIỆM
          </div>
          <div
            style={{
              display: "flex",
              color: "#fff",
              fontSize: ten.length > 26 ? 76 : 96,
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {catNgan(ten, 44)}
          </div>
          <div style={{ display: "flex", color: KEM, fontSize: 34, lineHeight: 1.35 }}>
            {catNgan(phu, 92)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 46,
              height: 46,
              borderRadius: 12,
              background: KEM,
              color: NEN,
              fontSize: 28,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            iF
          </div>
          <div style={{ display: "flex", color: KEM, fontSize: 30 }}>iFan.asia</div>
        </div>
      </div>
    ),
    size,
  );
}
