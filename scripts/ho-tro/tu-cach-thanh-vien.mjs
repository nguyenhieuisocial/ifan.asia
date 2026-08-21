/**
 * GIEO TƯ CÁCH THÀNH VIÊN cho người dùng thử trong các bộ kiểm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — ĐO ĐƯỢC 22/08
 * ═══════════════════════════════════════════════════════════════════
 * Trước bản vá #301, `current_tenant_id()` TIN THẲNG mã tiệm ghi trong phiếu
 * đăng nhập. Bộ kiểm vì thế chỉ cần đặt phiếu là xong — không cần dòng nào
 * trong `tenant_members`. #301 siết lại (đúng): phiếu chỉ được chấp nhận khi
 * người đó THẬT SỰ còn là thành viên đang hoạt động của tiệm đó.
 *
 * Năm bộ kiểm gieo dữ liệu theo lối cũ, và cả năm gãy theo kiểu KHÓ ĐỌC:
 * `current_tenant_id()` trả về rỗng ⇒ mọi hàm ném `no_tenant_context` ⇒ giao
 * dịch hỏng ⇒ mọi câu lệnh sau đó chỉ còn báo `25P02 current transaction is
 * aborted`. Lời báo cuối cùng che mất lời báo đầu tiên, nên nhìn nhật ký CI
 * chỉ thấy một lỗi giao dịch vô nghĩa.
 *
 * ⚠️ ĐÂY LÀ LỖI CỦA BỘ KIỂM, KHÔNG PHẢI CỦA LƯỢC ĐỒ. Người dùng thật không bao
 *   giờ có phiếu mang mã một tiệm mà mình không là thành viên. Bộ kiểm gieo
 *   được cảnh đó chỉ vì nó ghi thẳng bằng quyền `postgres`.
 *
 * ⚠️ Vai vẫn lấy từ PHIẾU, không lấy từ dòng này: `app_role()` ưu tiên
 *   `app_metadata.role`. Nên các bộ kiểm vẫn đổi vai bằng cách đổi phiếu như
 *   cũ — dòng ở đây chỉ để mở cánh cửa "có phải người của tiệm không".
 */

/**
 * Ghi một dòng thành viên đang hoạt động. Gọi bằng quyền `postgres`, TRƯỚC khi
 * đặt phiếu đăng nhập đầu tiên.
 *
 * @param {import("pg").Client} c
 * @param {string} tenantId
 * @param {string} userId
 * @param {string} [vai] vai ghi trong sổ — không ảnh hưởng tới vai lúc chạy.
 */
export async function themThanhVien(c, tenantId, userId, vai = "staff") {
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status)
       values ($1, $2, $3::tenant_role, 'active')
     on conflict do nothing`,
    [tenantId, userId, vai],
  );
}
