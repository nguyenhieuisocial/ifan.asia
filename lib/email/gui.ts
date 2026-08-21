import "server-only";

/**
 * GỬI EMAIL qua Resend.
 *
 * ⚠️ Gọi thẳng đường HTTP, KHÔNG cài thư viện. Một lời gọi `fetch` mười dòng
 *   thì rõ ràng hơn một gói phụ thuộc phải theo dõi phiên bản, và ở đây không
 *   dùng tính năng nào ngoài "gửi một email".
 *
 * ⚠️ Thiếu khoá thì ĐỨNG YÊN và nói ra, KHÔNG ném lỗi. Email là một trong
 *   nhiều đường báo; thiếu cấu hình email mà làm chết cả nhịp gửi thì thông
 *   báo đẩy cũng mất theo.
 *
 * ⚠️ Địa chỉ người gửi phải thuộc tên miền ĐÃ XÁC MINH ở Resend. Chưa xác
 *   minh thì Resend từ chối, và hàm này trả `chuaCauHinh` để màn hình nói
 *   đúng "chưa bật được" thay vì "gửi hỏng".
 */

export type KetQuaEmail = "ok" | "chuaCauHinh" | "hong";

const NGUOI_GUI = process.env.EMAIL_FROM ?? "iFan <thongbao@ifan.asia>";

export async function guiEmail(input: {
  toi: string;
  tieuDe: string;
  chu: string;
  duongDan?: string;
}): Promise<KetQuaEmail> {
  const khoa = process.env.RESEND_API_KEY;
  if (!khoa) return "chuaCauHinh";

  // Bản chữ thuần là bắt buộc: nhiều hộp thư chặn ảnh và kiểu dáng, và một
  // email chỉ có HTML thì ở đó hiện ra trống trơn.
  const chuThuan = input.duongDan
    ? `${input.chu}\n\nXem tại: ${input.duongDan}`
    : input.chu;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${khoa}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: NGUOI_GUI,
        to: [input.toi],
        subject: input.tieuDe,
        text: chuThuan,
        html: dungHtml(input),
      }),
    });
    if (r.ok) return "ok";
    // 401/403 = khoá sai hoặc tên miền chưa xác minh — đó là "chưa cấu hình"
    // chứ không phải "gửi hỏng", và màn hình phải nói khác nhau.
    if (r.status === 401 || r.status === 403) return "chuaCauHinh";
    return "hong";
  } catch {
    return "hong";
  }
}

/** Khung email tối giản. Không ảnh, không phông ngoài — để mọi hộp thư đọc được. */
function dungHtml(input: { tieuDe: string; chu: string; duongDan?: string }): string {
  const an = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const nut = input.duongDan
    ? `<p style="margin:20px 0"><a href="${an(input.duongDan)}" style="background:#C94C18;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Mở trong iFan</a></p>`
    : "";
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1917;max-width:520px">
  <p style="font-size:16px;font-weight:600;margin:0 0 8px">${an(input.tieuDe)}</p>
  <p style="font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${an(input.chu)}</p>
  ${nut}
  <p style="font-size:12px;color:#78716c;margin-top:24px">Bạn nhận thư này vì đã bật thông báo qua email trong iFan. Tắt trong Cài đặt → Thông báo.</p>
</div>`;
}
