#!/usr/bin/env node
/**
 * Cổng canh "BÁO ĐÃ LƯU NHƯNG KHÔNG LƯU ĐƯỢC GÌ".
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CỔNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * `.update()` / `.delete()` của Supabase bị RLS lọc mất dòng thì trả về
 * `error = null` và KHÔNG dòng nào — im lặng Y HỆT lúc thành công. Màn hình
 * báo "Đã lưu" trong khi CSDL không đổi một chữ.
 *
 * Đo trực tiếp trên CSDL thật (20/08, trong giao dịch rollback, đóng vai người
 * dùng theo khuôn `scripts/rls-smoke.mjs`):
 *   · vai `staff` ĐỌC được gói dịch vụ (1 dòng) nhưng `update` gói đó ra
 *     **0 dòng, KHÔNG lỗi**. ĐỐI CHỨNG: cùng câu ấy vai `owner` ra 1 dòng.
 *   · vai `viewer` ĐỌC được gói (1 dòng) nhưng `delete` ra **0 dòng, KHÔNG
 *     lỗi**. ĐỐI CHỨNG: `owner` xoá được 1 dòng.
 * ⇒ Không đếm dòng thì KHÔNG CÓ CÁCH NÀO phân biệt "chặn" với "xong".
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI LÀ CỔNG, KHÔNG PHẢI MỘT ĐỢT RÀ
 * ═══════════════════════════════════════════════════════════════════
 * Kho này đã học đúng bài này rồi mà vẫn tái phát: đợt rà cạnh chéo tiệm #136
 * "làm một lần rồi thôi, không để lại cổng nào canh — nên 10 mảng dựng sau nó
 * bắt đầu lại từ số không". Vá 20 chỗ mà không để cổng thì tháng sau có 20 chỗ
 * mới. Khuôn vá chuẩn nằm ở `app/app/contracts/actions.ts` (`luuTruGoi`,
 * `huyHopDong`) — cổng này bắt mọi chỗ chưa theo khuôn đó.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BA LUẬT
 * ═══════════════════════════════════════════════════════════════════
 *  LUẬT 1 — `.update()` trên client Supabase PHẢI đếm được số dòng đụng tới.
 *  LUẬT 2 — `.delete()` cũng vậy.
 *  LUẬT 3 — `.upsert(…, { ignoreDuplicates: true })` cũng vậy: nó dịch ra
 *    `on conflict do nothing`, mà câu đó đo được là **0 dòng, không lỗi** khi
 *    trùng khoá.
 *
 * "Đếm được số dòng" nghĩa là một trong ba cách:
 *   a) chuỗi lệnh có `.select(...)` VÀ mã sau đó kiểm biến `data` rỗng
 *      (`!data`, `data.length === 0`, `!rows?.length`, `data ? … : …`);
 *   b) chuỗi lệnh kết bằng `.single()` VÀ mã sau đó kiểm `error`
 *      (0 dòng ⇒ PostgREST trả lỗi PGRST116, nên kiểm lỗi là đủ);
 *   c) truyền `{ count: … }` rồi kiểm biến `count`.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO `.upsert()` THƯỜNG *KHÔNG* BỊ BẮT — đã đo, không phải suy đoán
 * ═══════════════════════════════════════════════════════════════════
 * `.upsert()` dịch ra `insert … on conflict do update`. Đo ba tình huống trên
 * CSDL thật (20/08), lần nào cũng **NÉM LỖI 42501**, không lần nào im lặng:
 *   · chưa có hàng, vai chỉ-đọc upsert  → 42501
 *   · đã có hàng, vai chỉ-đọc upsert    → 42501
 *   · bảng `tenants` — nơi `using` HẸP HƠN `with check` (cấu hình dễ sinh im
 *     lặng nhất, cả lược đồ chỉ có 2 chính sách như vậy) → vẫn 42501, trong khi
 *     `update` thẳng lên đúng hàng đó ra 0 dòng im lặng.
 *   ĐỐI CHỨNG: cùng câu upsert ấy vai `owner` chạy ra 1 dòng.
 * ⇒ Bắt `.upsert()` thường là báo oan ~20 chỗ. Chỉ bản `ignoreDuplicates` mới
 *   thuộc lớp bệnh này (luật 3).
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CỔNG NÀY *KHÔNG* CHỨNG MINH ĐƯỢC GÌ — đọc kỹ
 * ═══════════════════════════════════════════════════════════════════
 * Nó soát CHỮ trong mã nguồn, không chạy thử. Nó vẫn XANH khi:
 *  · biến `data` được đụng tới vì lý do khác (ghi log, đếm để hiển thị) chứ
 *    không phải để chặn — cổng chỉ thấy "có sờ tới", không thấy "có chặn";
 *  · lệnh ghi đi qua một lớp bọc tự viết mà cổng không nhận ra hình dạng
 *    `.from(...).update(...)`;
 *  · chỗ kiểm nằm ở HÀM GỌI bên ngoài (khai miễn trừ kèm dòng + file).
 * Nó cũng chỉ đọc `app/**` và `lib/**`.
 *
 * Chạy:  node scripts/soat-ghi-im-lang.mjs
 * Chỉ ĐỌC mã nguồn — không nối CSDL, không mở giao dịch.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// ══════════════════════════════════════════════════════════════════════
// MIỄN TRỪ — chỗ CỐ Ý không đếm dòng
// ══════════════════════════════════════════════════════════════════════
// Miễn trừ là cửa hậu nên phải đắt (cùng khuôn `soat-insert-thieu-tenant.mjs`):
// mỗi dòng cần LÝ DO người không rành kỹ thuật đọc hiểu, và BẰNG CHỨNG ĐÃ ĐO.
// KHÔNG nhận lý do suông kiểu "chỗ này không quan trọng" / "ít người dùng".
//
// Khoá là "<đường dẫn>:<tên hàm>:<update|delete|upsert>:<tên bảng>". Cổng in
// sẵn khoá đúng trong câu báo lỗi — chép thẳng, đừng đoán.
const MIEN_TRU = {
  "app/app/calendar/actions.ts:phatPhieuDanhGia:upsert:satisfaction_surveys": {
    viSao:
      "Đây là phiếu hỏi ý kiến khách, mỗi lịch hẹn chỉ được có MỘT phiếu. Bấm hai lần thì lần sau cố ý không làm gì — 0 dòng ở đây nghĩa là 'đã có phiếu rồi', đúng ý muốn, không phải bị chặn.",
    daDo: "Khoá trùng là `appointment_id`, mà lịch hẹn thuộc đúng một tiệm ⇒ không thể trùng sang tiệm khác. Đo 20/08: RLS cấm ghi thì `insert … on conflict do nothing` NÉM LỖI 42501 (M3a), chỉ đường trùng khoá mới im lặng.",
  },
  "app/app/contacts/actions.ts:addTagToContact:upsert:contact_tags": {
    viSao:
      "Gắn nhãn cho khách. Nhãn đã gắn rồi thì gắn lại cố ý không làm gì — 0 dòng nghĩa là 'đã có nhãn đó', đúng ý muốn.",
    daDo: "Khoá trùng là `(contact_id, tag_id)`; cả khách lẫn nhãn đều thuộc đúng một tiệm ⇒ không trùng chéo tiệm được. RLS cấm ghi vẫn ném 42501 (đo M3a 20/08).",
  },
  "app/app/contacts/import-export-actions.ts:runContactsImport:upsert:contact_tags": {
    viSao: "Cùng việc gắn nhãn như trên, chạy theo lô lúc nhập danh sách khách từ file.",
    daDo: "Khoá trùng `(contact_id, tag_id)` — cùng lý lẽ và cùng phép đo với dòng ngay trên.",
  },
  "app/app/settings/services/actions.ts:seedServicesFromPack:upsert:items": {
    viSao:
      "Nút cài sẵn bộ dịch vụ mẫu theo ngành. Bấm hai lần không được đẻ ra hai bản dịch vụ trùng tên — 0 dòng nghĩa là 'tiệm đã có dịch vụ tên đó', đúng ý muốn.",
    daDo: "Khoá trùng là `(tenant_id, name)` — CÓ mã tiệm trong khoá nên không thể va vào dòng của tiệm khác. RLS cấm ghi vẫn ném 42501 (đo M3a 20/08).",
  },

  // ── Nhóm A: 0 dòng là KẾT QUẢ ĐÚNG, không phải chuyện bị chặn ──────────
  "app/app/notifications/actions.ts:markNotificationRead:update:notifications": {
    viSao:
      "Đánh dấu một thông báo là đã đọc. Câu lệnh cố ý chỉ chạm dòng CHƯA đọc, nên bấm lại một dòng đã đọc thì 0 dòng — đúng ý muốn (không dời mốc thời gian đã đọc).",
    daDo: "Đo 20/08 trên 5 vai: `notifications_select` chỉ cho mỗi người thấy thông báo CỦA CHÍNH MÌNH (4/5 vai đọc ra 0 dòng), và ai đọc được thì cũng ghi được (1 dòng). Không có vai nào 'thấy mà ghi hụt'.",
  },
  "app/app/notifications/actions.ts:markAllNotificationsRead:update:notifications": {
    viSao: "Nút 'Đọc hết' — không còn thông báo chưa đọc nào thì 0 dòng, đúng ý muốn.",
    daDo: "Cùng phép đo với dòng ngay trên: mỗi người chỉ thấy và chỉ sửa được thông báo của chính mình.",
  },
  "app/app/settings/team/actions.ts:clearKpiTarget:delete:kpi_targets": {
    viSao:
      "Tắt một chỉ tiêu tháng = xoá dòng chỉ tiêu. Chỉ tiêu chưa từng đặt thì không có dòng nào để xoá — 0 dòng nghĩa là 'vốn đã tắt sẵn', đúng ý muốn (chú thích của chính hàm đã ghi: bấm lại vô hại).",
    daDo: "Đo 20/08: `kpi_targets_select` không cho nhân viên và vai Chỉ xem đọc (0 dòng), ba vai còn lại đọc được thì xoá được 1 dòng ⇒ không có vai nào 'thấy mà xoá hụt'.",
  },
  "app/app/settings/team/actions.ts:removeMember:update:tenant_members": {
    viSao:
      "Gỡ người khỏi tiệm. Bấm Gỡ lần hai — khi dòng thành viên ĐÃ ở trạng thái 'đã gỡ' — thì 0 dòng, và đó là đường chạy lại CỐ Ý: lần bấm thứ hai tồn tại để cắt nốt liên kết bot còn sót của lần trước hỏng giữa chừng (chú thích ngay dưới câu lệnh đã ghi rõ).",
    daDo: "Đo 20/08: quản lý/nhân viên/chỉ-xem ĐỌC được danh sách thành viên mà sửa ra 0 dòng im lặng — nhưng ba vai đó đã bị chặn ngay đầu hàm (`ctx.role !== owner && !== admin`). Đường lọt duy nhất đã đóng ở tầng trên.",
  },
  "app/app/team/actions.ts:xepCa:delete:shifts": {
    viSao: "Gỡ ca khỏi một ô lịch. Ô vốn đã trống thì 0 dòng — đúng ý muốn.",
    daDo: "Đo 20/08: nhân viên và vai Chỉ xem KHÔNG đọc nổi bảng xếp ca (0 dòng), ba vai còn lại đọc được thì xoá được 1 dòng ⇒ không có vai nào 'thấy mà xoá hụt'.",
  },
  "app/app/recruitment/actions.ts:datLichPhongVan:update:candidates": {
    viSao:
      "Sau khi đặt lịch phỏng vấn thì kéo hồ sơ sang cột 'Đã hẹn phỏng vấn' — nhưng CHỈ kéo từ cột 'Mới nộp'. Hồ sơ đã đi xa hơn thì 0 dòng, đúng ý muốn (không kéo ngược người đang thử việc về).",
    daDo: "Đo 20/08: `candidates_select` không cho nhân viên và vai Chỉ xem đọc hồ sơ ứng viên (0 dòng); ba vai còn lại đọc được thì sửa được 1 dòng. Lệnh ĐẶT LỊCH ngay trên đã đếm dòng và trả `khong_du_quyen`.",
  },
  "app/app/settings/notifications/actions.ts:unlinkZaloBot:delete:staff_channel_links": {
    viSao: "Tự cắt liên kết Zalo của chính mình. Chưa từng ghép nối thì 0 dòng — đúng ý muốn.",
    daDo: "Đo 20/08 trên 5 vai: chỉ CHỦ NHÂN của dòng liên kết đọc được nó (4/5 vai ra 0 dòng), và chủ nhân thì xoá được 1 dòng ⇒ không có đường 'thấy mà xoá hụt'.",
  },

  // ── Nhóm B: lệnh DỌN DẸP sau một bước đã hỏng, hàm đã báo lỗi rồi ─────
  "app/app/events/actions.ts:guiTin:delete:campaign_sends": {
    viSao:
      "Dọn cái đợt gửi rỗng vừa tạo, sau khi bước thêm người nhận đã hỏng. Hàm trả lỗi cho người dùng dù dọn được hay không, nên đếm dòng ở đây không đổi câu nào trên màn hình.",
    daDo: "Dòng bị xoá là dòng CHÍNH NGƯỜI NÀY vừa tạo ở câu lệnh ngay trên — câu đó đã đếm dòng và chặn bằng `khong_du_quyen`. Đọc/ghi `campaign_sends` đi chung một chính sách `campaign_sends_manage`, nên ai tạo được thì xoá được (đo 20/08).",
  },
  "app/app/stock/purchases/actions.ts:taoPhieuNhap:delete:purchases": {
    viSao: "Dọn phiếu nhập nháp vừa tạo, sau khi bước ghi dòng hàng hoặc bước chốt đã hỏng. Hàm trả lỗi cho người dùng trong cả hai nhánh.",
    daDo: "Phiếu bị xoá là phiếu CHÍNH NGƯỜI NÀY vừa tạo bằng lệnh insert ngay trên (insert bị RLS cấm thì NÉM LỖI, không im lặng). `purchases_rw` là một chính sách ALL duy nhất — ai tạo được thì xoá được (đo 20/08: nhân viên và chỉ-xem còn không đọc nổi phiếu nhập).",
  },
  "app/app/stock/stocktake/actions.ts:taoPhienKiemKe:delete:stocktakes": {
    viSao: "Dọn phiên kiểm kê vừa mở, sau khi bước dựng danh sách hàng đã hỏng. Hàm trả lỗi cho người dùng trong cả hai nhánh.",
    daDo: "Cùng lý lẽ và cùng phép đo với phiếu nhập ở trên: `stocktakes_rw` là một chính sách ALL duy nhất, phiên bị xoá là phiên chính người này vừa mở.",
  },
  "app/app/payroll/actions.ts:tinhLaiKyLuong:delete:payslip_lines": {
    viSao:
      "Dọn các dòng lương do MÁY sinh trước khi sinh lại. Phiếu chưa có dòng máy nào (lần tính đầu tiên) thì 0 dòng — đúng ý muốn.",
    daDo: "Đo 20/08: `payslip_lines` chỉ cho owner/admin đọc, và ai đọc được thì xoá được (quản lý/nhân viên/chỉ-xem ra 0 dòng ở CẢ phép đọc). Người tới được đây vừa ghi thành công một phiếu lương ở câu lệnh ngay trên (câu đó dùng `.single()` nên 0 dòng thành lỗi).",
  },
  "app/app/settings/industry/actions.ts:uploadTenantLogo:update:attachments": {
    viSao: "Xoá mềm logo cũ trước khi gắn logo mới. Tiệm chưa từng có logo thì 0 dòng — đúng ý muốn.",
    daDo: "Đo 20/08: vai duy nhất 'thấy tệp mà sửa hụt' là Chỉ xem, mà vai đó đã bị `requireOwnerAdmin` chặn ở đầu hàm. Nếu RLS có chặn thật thì lệnh THÊM logo mới ngay dưới sẽ ném lỗi 42501 chứ không im.",
  },
  "app/app/items/actions.ts:saveItem:delete:item_costs": {
    viSao: "Xoá giá vốn khi người dùng để trống ô đó. Mặt hàng chưa từng nhập giá vốn thì 0 dòng — đúng ý muốn.",
    daDo: "Đo 20/08: vai duy nhất 'thấy giá vốn mà xoá hụt' là Chỉ xem, mà vai đó đã bị `requireManage` chặn ở đầu hàm; nhân viên còn không đọc nổi giá vốn.",
  },
  "app/app/companies/actions.ts:softDeleteCompany:update:contacts": {
    viSao:
      "Gỡ khách ra khỏi công ty vừa bị xoá. Công ty không có khách nào gắn vào thì 0 dòng — đúng ý muốn, và không phân biệt được với bị chặn.",
    daDo: "Đo 20/08 trên 5 vai, ĐÚNG cặp câu lệnh của hàm này: KHÔNG vai nào xoá được công ty mà gỡ khách hụt (owner/admin/manager: 1 và 1 · nhân viên/chỉ-xem: 0 và 0). Lệnh xoá công ty ngay trên đã đếm dòng và chặn bằng `deleteDenied`.",
  },
};

// ══════════════════════════════════════════════════════════════════════
// NỢ ĐÃ ĐO — lỗ THẬT, đã có bằng chứng, nhưng nằm NGOÀI ranh giới đợt này
// ══════════════════════════════════════════════════════════════════════
// KHÁC HẲN miễn trừ: miễn trừ nói "chỗ này không phải lỗ". Ở đây nói "ĐÚNG là
// lỗ, đã đo, và chưa ai vá". Cổng vẫn XANH cho ba dòng này nhưng in chúng ra
// mỗi lượt chạy — im lặng về một lỗ đã biết chính là con bệnh đang chữa.
//
// Luật: mỗi dòng phải có phép đo và phải nói rõ VÌ SAO chưa vá được ở đây.
// Vá xong thì xoá dòng khỏi bảng này; cổng tự báo dòng thừa.
const NO_DA_DO = {
  "app/app/projects/actions.ts:boViecChan:delete:task_blocks": {
    hai: "NẶNG NHẤT trong ba cái. Nhân viên bấm 'Bỏ chặn' cho một việc dự án: màn báo xong, việc vẫn bị chặn, và không có gì báo.",
    daDo: "Đo 20/08 trên 5 vai: nhân viên và vai Chỉ xem ĐỌC được dòng chặn (1 dòng) nhưng xoá ra 0 dòng, KHÔNG lỗi. ĐỐI CHỨNG: owner/admin/quản lý xoá được 1 dòng. Hàm KHÔNG có phép kiểm vai nào ở tầng ứng dụng — chỉ hỏi đã đăng nhập chưa.",
    viSaoChuaVa: "`app/app/projects/**` do một nhánh khác đang giữ (ranh giới việc #193).",
  },
  "app/auth/actions.ts:changeForcedPassword:update:profiles": {
    hai: "Hạ cờ 'phải đổi mật khẩu' sau khi đã đổi xong. Cờ không hạ được thì người dùng bị đá về màn đổi mật khẩu vô tận — vòng lặp kín, không vào được app. Chính chú thích trong hàm cũng đã cảnh báo đúng chuyện này.",
    daDo: "Đo 20/08: `profiles_update` chỉ cho mỗi người sửa hồ sơ của CHÍNH MÌNH (owner/admin/quản lý/chỉ-xem đọc được hồ sơ người khác nhưng sửa ra 0 dòng im lặng). Hàm này sửa đúng hồ sơ của mình nên đường 'sai người' không xảy ra; đường còn lại là hàng hồ sơ không tồn tại — vẫn ra 0 dòng và vẫn im.",
    viSaoChuaVa: "`app/auth/actions.ts` không nằm trong danh sách file được đụng của việc #193.",
  },
  "app/admin/actions.ts:acknowledgeSystemAlert:update:system_alerts": {
    hai: "Đóng một cảnh báo hệ thống trên bảng điều hành. Hàm trả về `void` — không có đường nào báo hỏng, kể cả khi có lỗi thật.",
    daDo: "Câu lệnh lọc thêm `acknowledged_at is null` nên 0 dòng thường chỉ nghĩa là cảnh báo đã được đóng — mức hại thấp. CHƯA CHỨNG MINH ĐƯỢC phần còn lại: cần đóng vai một người quản trị nền tảng thật để đo, mà tài khoản đó chưa dựng được trong bộ đo.",
    viSaoChuaVa: "`app/admin/actions.ts` không nằm trong danh sách file được đụng của việc #193.",
  },
};

// ══════════════════════════════════════════════════════════════════════
// ĐỌC MÃ NGUỒN
// ══════════════════════════════════════════════════════════════════════

/** Gom mọi file .ts/.tsx dưới một cây thư mục. */
function gomFile(goc, acc = []) {
  for (const e of readdirSync(goc, { withFileTypes: true })) {
    const p = path.join(goc, e.name);
    if (e.isDirectory()) gomFile(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/**
 * Bản KHUNG của mã nguồn: xoá ruột chú thích và ruột chuỗi, GIỮ NGUYÊN độ dài
 * và số dòng. Mọi phép đếm ngoặc chạy trên bản khung này.
 *
 * ⚠️ Bắt buộc phải có bước này. Kho có ít nhất 21 chỗ viết `.update(` /
 * `.delete(` TRONG CHÚ THÍCH (chính các khối giải thích lỗi im lặng), và có
 * `.delete()` của `Set` / `URLSearchParams` / hộp cookie. Quét thô là báo oan
 * ngay từ dòng đầu.
 */
function lamKhung(s) {
  let o = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") {
        o += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const e = s.indexOf("*/", i + 2);
      const het = e < 0 ? s.length : e + 2;
      for (let j = i; j < het; j++) o += s[j] === "\n" ? "\n" : " ";
      i = het;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      o += c;
      i++;
      while (i < s.length && s[i] !== c) {
        if (s[i] === "\\") {
          o += "  ";
          i += 2;
          continue;
        }
        o += s[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < s.length) {
        o += c;
        i++;
      }
      continue;
    }
    o += c;
    i++;
  }
  return o;
}

/**
 * Đầu CÂU LỆNH chứa vị trí i — đi NGƯỢC, cân ngoặc.
 *
 * ⚠️ Phải cân ngoặc chứ không được lấy `{` gần nhất: `const { data, error } =
 * await …` có một cặp `{}` NẰM TRONG câu, lấy `{` gần nhất là cắt mất đúng
 * phần khai báo biến — thứ duy nhất cho biết lệnh có đếm dòng hay không.
 */
function dauCau(khung, i) {
  let sau = 0;
  for (let j = i - 1; j >= 0; j--) {
    const ch = khung[j];
    if (ch === "}") {
      // `}` đóng một KHỐI đứng trước ⇒ câu trước đã hết, dừng ở đây. Không
      // dừng thì phép quét nuốt luôn khối `if (…) { … }` ngay trên, rồi đọc
      // nhầm biến của khối ấy làm biến kết quả — đúng lỗi đã báo oan 3 chỗ
      // (inbox 46 · inbox 263 · sla 121) ở bản đầu.
      // Ngoại lệ: `}` của `const { data, error } = …` — nhận ra bằng dấu `=`
      // đứng ngay sau (mà không phải `==` hay `=>`).
      if (sau === 0 && !/^\s*=[^=>]/.test(khung.slice(j + 1, j + 40))) return j + 1;
      sau++;
    } else if (ch === ")" || ch === "]") sau++;
    else if ("([{".includes(ch)) {
      if (sau === 0) return j + 1;
      sau--;
    } else if (ch === ";" && sau === 0) return j + 1;
  }
  return 0;
}

/** Vị trí NGAY SAU dấu `;` kết câu bắt đầu tại i. */
function cuoiCau(khung, i) {
  let sau = 0;
  for (let j = i; j < khung.length; j++) {
    const ch = khung[j];
    if ("([{".includes(ch)) sau++;
    else if (")]}".includes(ch)) sau--;
    else if (ch === ";" && sau <= 0) return j + 1;
  }
  return khung.length;
}

/**
 * Vị trí đóng của KHỐI bao quanh vị trí i.
 *
 * Biến khai bằng `const` chỉ sống trong khối của nó, nên phép kiểm số dòng
 * BẮT BUỘC nằm trong khối này — tìm rộng hơn là tự tạo báo-xanh-giả (bắt nhầm
 * phép kiểm của một lệnh ghi khác).
 */
function ketKhoi(khung, i) {
  let sau = 0;
  let mo = -1;
  for (let j = i - 1; j >= 0; j--) {
    const ch = khung[j];
    if (ch === "}") sau++;
    else if (ch === "{") {
      if (sau === 0) {
        mo = j;
        break;
      }
      sau--;
    }
  }
  if (mo < 0) return khung.length;
  let d = 0;
  for (let j = mo; j < khung.length; j++) {
    if (khung[j] === "{") d++;
    else if (khung[j] === "}" && --d === 0) return j;
  }
  return khung.length;
}

/** `Array.from(x)` / `Buffer.from(x)` KHÔNG phải bảng CSDL. */
const KHONG_PHAI_BANG = new Set(["Array", "Buffer", "Object", "String", "Number", "Uint8Array", "Set", "Map", "Date"]);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Mã sau lệnh ghi CÓ đụng tới biến kết quả theo kiểu "kiểm rỗng" không?
 *
 * Nhận đúng những khuôn đang dùng trong kho: `!data` · `!rows?.length` ·
 * `data.length === 0` · `!doi?.length` · `updated === null` · `bumped ? … : …`
 * · `data && …` · `if (data)`.
 */
function daKiemRong(ten, vung) {
  const N = esc(ten);
  return (
    new RegExp(`!\\s*${N}\\b`).test(vung) ||
    new RegExp(`${N}\\s*\\??\\.\\s*length\\b`).test(vung) ||
    new RegExp(`${N}\\s*(?:===|!==|==|!=)\\s*null\\b`).test(vung) ||
    new RegExp(`${N}\\s*\\?(?![.?])`).test(vung) ||
    new RegExp(`${N}\\s*&&`).test(vung) ||
    new RegExp(`\\bif\\s*\\(\\s*${N}\\s*\\)`).test(vung)
  );
}

/** Mã sau lệnh ghi có kiểm biến lỗi không? */
function daKiemLoi(ten, vung) {
  const N = esc(ten);
  return (
    new RegExp(`\\bif\\s*\\([^)]*\\b${N}\\b`).test(vung) ||
    new RegExp(`!\\s*${N}\\b`).test(vung) ||
    new RegExp(`${N}\\s*(?:\\|\\||&&|\\?(?![.?]))`).test(vung)
  );
}

/**
 * Tên HÀM chứa vị trí i — dùng làm phần giữa của khoá miễn trừ.
 *
 * Khoá theo số dòng thì trôi mỗi lần sửa file; khoá chỉ theo "file + phép +
 * bảng" thì QUÁ RỘNG — `app/app/payroll/actions.ts` có hai lệnh xoá cùng bảng
 * `payslip_lines` mà một cái 0 dòng là bình thường, một cái 0 dòng là lỗi thật.
 * Tên hàm vừa ổn định vừa đọc ra nghĩa.
 */
function tenHam(khung, i) {
  const truoc = khung.slice(0, i);
  // CHỈ nhận từ khoá `function`. Bản đầu nhận thêm `const x = (…)` và đọc nhầm
  // `const sample = (await …)` thành tên hàm — khoá miễn trừ ra sai tên.
  const m = [...truoc.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)].pop();
  return m ? m[1] : "(ngoai-ham)";
}

/** Tách tên biến từ phần khai báo ở đầu câu lệnh. */
function docKhaiBao(dau) {
  // Lấy khai báo CUỐI CÙNG trước lệnh ghi, không phải cái đầu tiên — phòng khi
  // phép cắt câu vẫn ôm theo một câu lệnh đứng trước.
  const rap = [...dau.matchAll(/(?:const|let|var)\s*\{([^{}]*)\}\s*=/g)].pop();
  if (rap) {
    const map = {};
    for (const phan of rap[1].split(",")) {
      const [k, v] = phan.split(":").map((x) => x.trim());
      if (k) map[k] = (v || k).replace(/\s.*$/, "");
    }
    return { kieu: "rap", data: map.data, error: map.error, count: map.count };
  }
  const don = [...dau.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].pop();
  if (don) return { kieu: "don", data: `${don[1]}.data`, error: `${don[1]}.error`, count: `${don[1]}.count` };
  return { kieu: "khong" };
}

// ══════════════════════════════════════════════════════════════════════
// QUÉT
// ══════════════════════════════════════════════════════════════════════
const loi = [];
const bao = (luat, tieuDe, ...dong) => loi.push({ luat, tieuDe, dong });
const daDung = new Set();
const noConLai = [];

const nguon = [...gomFile(path.join(GOC, "app")), ...gomFile(path.join(GOC, "lib"))];
let soLenhGhi = 0; // lệnh ghi CSDL đọc được (mọi phép)
let soCanhGac = 0; // lệnh thuộc diện phải đếm dòng
let soDichVu = 0; // lệnh chạy bằng khoá dịch vụ (RLS không áp dụng)
let soUpsertThuong = 0; // upsert thường — đo được là ném lỗi, không im lặng

for (const f of nguon) {
  const raw = readFileSync(f, "utf8");
  const khung = lamKhung(raw);
  const rel = path.relative(GOC, f).split(path.sep).join("/");

  // Biến nào cầm khoá DỊCH VỤ (service role) — khoá đó bỏ qua RLS nên lệnh ghi
  // của nó không thuộc lớp bệnh này.
  const bienDichVu = new Set(
    [...khung.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createServiceClient\s*\(/g)].map((m) => m[1]),
  );

  const re = /\.(update|delete|upsert)\s*\(/g;
  let m;
  while ((m = re.exec(khung))) {
    const phep = m[1];
    const viTri = m.index;
    const dau = dauCau(khung, viTri);
    const truoc = khung.slice(dau, viTri);

    // Phải có `.from(...)` đứng trước trong CÙNG câu lệnh, nếu không thì đây
    // không phải lệnh CSDL (`Set.delete` · `URLSearchParams.delete` · hộp
    // cookie · `createHash().update()`).
    const mf = [...truoc.matchAll(/([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)\s*\??\.\s*from\s*\(\s*([)"'`A-Za-z_$])/g)].pop();
    if (!mf) continue;
    const duong = mf[1].split(/\s*\??\.\s*/);
    if (KHONG_PHAI_BANG.has(duong[duong.length - 1])) continue;

    const dong = raw.slice(0, viTri).split("\n").length;
    const cuoi = cuoiCau(khung, viTri);
    const cauKhung = khung.slice(dau, cuoi);
    const cauRaw = raw.slice(dau, cuoi);
    // Vị trí phép ghi TÍNH TỪ ĐẦU CÂU. Bắt buộc dùng con số này chứ KHÔNG được
    // `indexOf(".update(")`: kho có hàng chục khối chú thích viết đúng chữ
    // `.update()` ngay TRÊN lệnh thật, nên `indexOf` trên bản raw trỏ vào chú
    // thích và cắt mất phần khai báo biến — chính bản đầu của cổng này đã báo
    // oan 6 chỗ ĐÃ đếm dòng đầy đủ vì lỗi đó.
    const lech = viTri - dau;

    // Tên bảng: tìm `.from(` trên bản KHUNG (vị trí giữ nguyên) rồi đọc chữ ở
    // bản RAW tại đúng chỗ đó.
    const viTriFrom = dau + mf.index;
    const bang = raw.slice(viTriFrom, viTriFrom + 200).match(/\.from\s*\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/)?.[1] ?? "?";
    soLenhGhi++;

    // ── Khoá dịch vụ ⇒ RLS không áp dụng ⇒ không thuộc lớp bệnh này ──
    if (duong.some((d) => bienDichVu.has(d))) {
      soDichVu++;
      continue;
    }

    const sauPhep = cauKhung.slice(lech);
    const boQua = phep === "upsert" && !/ignoreDuplicates\s*:\s*true/.test(cauRaw);
    if (boQua) {
      soUpsertThuong++;
      continue;
    }

    soCanhGac++;
    // Khai báo biến VÀ vùng kiểm đều đọc trên bản KHUNG. Đọc trên bản raw thì
    // một dòng chú thích kiểu "// đếm dòng: !data" cũng đủ làm cổng xanh giả.
    const khai = docKhaiBao(cauKhung.slice(0, lech));
    const vung = khung.slice(cuoi, ketKhoi(khung, dau));
    const coSelect = /\.select\s*\(/.test(sauPhep);
    const tan = /\.single\s*\(\s*\)/.test(sauPhep) ? "single" : /\.maybeSingle\s*\(\s*\)/.test(sauPhep) ? "maybeSingle" : "";
    const khoa = `${rel}:${tenHam(khung, viTri)}:${phep}:${bang}`;
    const luat = phep === "update" ? 1 : phep === "delete" ? 2 : 3;

    // c) đếm bằng `{ count: … }`
    if (khai.count && /count\s*:/.test(cauRaw) && daKiemRong(khai.count, vung)) continue;

    // b) `.single()` — 0 dòng ⇒ PostgREST trả lỗi, nên kiểm lỗi là đủ
    if (tan === "single" && ((khai.error && daKiemLoi(khai.error, vung)) || (khai.data && daKiemRong(khai.data, vung)))) continue;

    // a) có `.select()` + kiểm biến data rỗng
    if (coSelect && khai.data && daKiemRong(khai.data, vung)) continue;

    if (MIEN_TRU[khoa]) {
      daDung.add(khoa);
      continue;
    }
    if (NO_DA_DO[khoa]) {
      daDung.add(khoa);
      noConLai.push(khoa);
      continue;
    }

    const viec = phep === "update" ? "sửa" : phep === "delete" ? "xoá" : "ghi";
    if (!coSelect) {
      bao(
        luat,
        `${rel}:${dong} — .${phep}() vào "${bang}" KHÔNG có .select() ⇒ không có gì để đếm`,
        `Không có \`.select()\` thì Supabase trả về 0 dòng dữ liệu trong MỌI trường hợp — kể cả lúc RLS ${viec} hụt.`,
        "Đo trên CSDL 20/08: người ĐỌC được bản ghi nhưng không đủ quyền ghi thì lệnh ra 0 dòng và error = null.",
        "SỬA — theo khuôn `luuTruGoi` trong app/app/contracts/actions.ts:",
        `  const { data, error } = await supabase.from("${bang}").${phep}(…)…​.select("id");`,
        "  if (error) return { error: loiGhi(error) };",
        '  if (!data || data.length === 0) return { error: "forbidden" };',
        `  hoặc khai "${khoa}" vào MIEN_TRU kèm lý do + bằng chứng đã đo.`,
      );
      continue;
    }
    if (khai.kieu === "khong") {
      bao(
        luat,
        `${rel}:${dong} — .${phep}() vào "${bang}" có .select() nhưng KHÔNG giữ kết quả`,
        "Lệnh không gán vào biến nào ⇒ số dòng trả về rơi thẳng xuống đất.",
        `SỬA: \`const { data, error } = await …\` rồi chặn \`data\` rỗng, hoặc khai "${khoa}" vào MIEN_TRU.`,
      );
      continue;
    }
    bao(
      luat,
      `${rel}:${dong} — .${phep}() vào "${bang}" có .select() nhưng KHÔNG ai đếm dòng`,
      khai.data
        ? `Biến \`${khai.data}\` không hề bị kiểm rỗng ở phần mã sau đó ⇒ 0 dòng và 1 dòng đi chung một đường.`
        : "Không có biến `data` nào được lấy ra ⇒ không có gì để đếm.",
      tan === "maybeSingle"
        ? "`.maybeSingle()` trả `data = null` mà KHÔNG báo lỗi khi 0 dòng — phải tự chặn `null`."
        : "0 dòng KHÔNG sinh lỗi — phải tự chặn mảng rỗng.",
      `SỬA: thêm \`if (!${khai.data ?? "data"}${tan ? "" : "?.length"}) return { error: "forbidden" };\`, hoặc khai "${khoa}" vào MIEN_TRU kèm bằng chứng.`,
    );
  }
}

// ── Dòng thừa: miễn trừ / nợ che một chỗ không còn tồn tại ───────────
for (const [ten, bang] of [
  ["MIEN_TRU", MIEN_TRU],
  ["NO_DA_DO", NO_DA_DO],
]) {
  for (const khoa of Object.keys(bang)) {
    if (!daDung.has(khoa)) {
      bao(
        0,
        `${ten} còn dòng thừa "${khoa}"`,
        "Chỗ này không còn lệnh ghi nào cần tới nó (đã vá, đã đổi bảng, hoặc đã xoá).",
        `SỬA: xoá dòng đó khỏi ${ten} — dòng ruỗng che mất chỗ thật sau này.`,
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// KẾT
// ══════════════════════════════════════════════════════════════════════
/** In khối NỢ — luôn in, kể cả khi cổng xanh. */
function inNo() {
  if (noConLai.length === 0) return;
  console.error(`\n⚠️  ${noConLai.length} LỖ ĐÃ ĐO nhưng CHƯA VÁ (nằm ngoài ranh giới đợt vá):\n`);
  for (const khoa of noConLai) {
    const n = NO_DA_DO[khoa];
    console.error(`  · ${khoa}`);
    console.error(`      Hại       : ${n.hai}`);
    console.error(`      Đã đo     : ${n.daDo}`);
    console.error(`      Chưa vá vì: ${n.viSaoChuaVa}`);
  }
  console.error("  Đây KHÔNG phải miễn trừ. Vá xong thì xoá dòng khỏi NO_DA_DO.\n");
}

if (loi.length === 0) {
  console.log(
    `✅ Không lệnh ghi nào báo xong mà không lưu: ${soCanhGac}/${soLenhGhi} lệnh thuộc diện phải đếm dòng ` +
      `(bỏ ${soUpsertThuong} lệnh .upsert thường — đo được là NÉM LỖI 42501 chứ không im lặng; ` +
      `bỏ ${soDichVu} lệnh chạy bằng khoá dịch vụ — RLS không áp dụng) · ` +
      `${Object.keys(MIEN_TRU).length} miễn trừ có bằng chứng · ${noConLai.length} lỗ đã đo còn nợ.`,
  );
  inNo();
  process.exit(0);
}
inNo();

console.error(`❌ ${loi.length} lệnh ghi có thể "báo đã lưu" mà không lưu được gì:\n`);
for (const { luat, tieuDe, dong } of loi) {
  console.error(`  [LUẬT ${luat}] ${tieuDe}`);
  for (const d of dong) console.error(`      ${d}`);
  console.error("");
}
console.error("Vì sao chặn: RLS lọc mất dòng thì `.update()`/`.delete()` trả error = null và 0 dòng —");
console.error("im lặng y hệt lúc thành công. Màn hình báo \"Đã lưu\" trong khi CSDL không đổi gì.");
process.exit(1);
