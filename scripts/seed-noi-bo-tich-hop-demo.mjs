#!/usr/bin/env node
/**
 * NẠP CHAT NỘI BỘ + TÍCH HỢP + TIỆN ÍCH cho tiệm mẫu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * Tiệm mẫu đã có khách, đơn, lịch hẹn, nhân sự — nhưng ba mảng "nói chuyện với
 * nhau" và "nối ra ngoài" vẫn TRỐNG TRƠN. Màn hình trống không nói được gì về
 * sản phẩm: người xem thử mở Trao đổi nội bộ thấy "chưa có tin nào" thì không
 * phân biệt được "tính năng chưa làm" với "tiệm này chưa ai nhắn". Ba mảng đó:
 *
 *   • Trao đổi nội bộ (internal_threads / _messages / _mentions)
 *   • Tích hợp (webhook_endpoints / webhook_deliveries / webhook_events / api_keys)
 *   • Tiện ích (attachments / saved_views / notification_prefs)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO CHAT NỘI BỘ GẮN VÀO VIỆC, KHÔNG PHẢI "PHÒNG CHAT"
 * ═══════════════════════════════════════════════════════════════════════════
 * Đã ĐO trên lược đồ thật (20/08), không suy từ tên bảng:
 * `internal_threads` có `unique (tenant_id, entity_type, entity_id)` và
 * `check entity_type in ('order','appointment','contact','stock_doc')`.
 * Nghĩa là sản phẩm này KHÔNG có phòng chat tự do — mỗi cuộc trao đổi dính vào
 * ĐÚNG MỘT việc. Nên "luồng bàn chuyện đổi ca" ở đây phải là luồng gắn vào
 * CÁI LỊCH HẸN bị đổi, "luồng bàn hết hàng" phải gắn vào PHIẾU NHẬP.
 *
 * Hệ quả quan trọng hơn, và nó quyết định AI được nói trong luồng nào:
 * `internal_thread_doc_duoc()` là hàm SECURITY INVOKER — nó hỏi lại đúng policy
 * của orders/appointments/contacts/purchases. Mà các policy đó KHÔNG cho nhân
 * viên thường xem tất cả:
 *
 *   purchases   → chỉ owner/admin/manager. Nhân viên và cả vai Chỉ xem: KHÔNG.
 *   appointments→ owner/admin/manager/viewer, HOẶC chính KTV được xếp ca đó.
 *   contacts    → owner/admin/manager/viewer, HOẶC chính người phụ trách khách.
 *   orders      → owner/admin/manager/viewer, HOẶC chính người tạo đơn.
 *
 * Vì vậy người gửi trong mỗi luồng dưới đây chỉ gồm những người THẬT SỰ đọc
 * được luồng đó. Nếu nạp một tin do KTV massage viết trong luồng phiếu nhập thì
 * dữ liệu mẫu đang mô tả một chuyện mà sản phẩm không cho phép xảy ra — và
 * người đọc màn hình sẽ tin nhầm rằng quyền của mình rộng hơn thực tế.
 * Cùng lý do: chỉ gọi tên (`@`) người đọc được luồng, vì gọi tên là sinh THÔNG
 * BÁO kèm đường dẫn — gọi người không mở được link chỉ tạo ngõ cụt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG TỰ CHÈN PHIẾU GỬI WEBHOOK
 * ═══════════════════════════════════════════════════════════════════════════
 * `webhook_deliveries` là bảng KÉO THEO: sản phẩm tự sinh nó từ `domain_events`
 * bằng `webhook_queue_new()`, và trạng thái gửi do `webhook_claim()` +
 * `webhook_ghi_ket_qua()` ghi. Ba con số trên `webhook_endpoints`
 * (`consecutive_failures`, `last_success_at`, `last_error`) cũng do
 * `webhook_ghi_ket_qua()` cập nhật.
 *
 * Tự chèn tay vào đó là dựng bộ số thứ hai, rồi hai bộ đá nhau (đúng lớp bệnh
 * nặng nhất kho này từng có, việc #18). Nên file này ĐI QUA ĐÚNG BA RPC ẤY:
 * lùi con trỏ phát tin → gọi `webhook_queue_new` → `webhook_claim` →
 * `webhook_ghi_ket_qua`. Số lần thử, mốc gửi, đếm hỏng liên tiếp đều là số
 * THẬT do sản phẩm tự tính, không phải số mình gõ vào.
 *
 * Con trỏ `webhook_fanout_cursor` là của CẢ HỆ THỐNG (một dòng duy nhất), nên
 * cả đoạn đó nằm trong MỘT giao dịch: lùi, phát, rồi TRẢ VỀ ĐÚNG CHỖ CŨ trước
 * khi commit. Nhịp `/api/webhooks/dispatch` chạy song song sẽ chờ ở
 * `select ... for update` vài chục giây rồi chạy tiếp như chưa có gì xảy ra.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO ĐỊA CHỈ WEBHOOK LÀ `hooks.example.com` VÀ KHOÁ API KHÔNG DÙNG ĐƯỢC
 * ═══════════════════════════════════════════════════════════════════════════
 * `example.com` là tên miền dành riêng cho tài liệu (RFC 2606), và nhánh
 * `hooks.example.com` KHÔNG phân giải được. Đó là chủ ý kép: vừa không trỏ vào
 * địa chỉ có thật của ai, vừa khiến `kiemDiaChi()` dừng ngay ở bước tra tên
 * miền — nhịp gửi thật trên máy chủ sẽ KHÔNG phát một gói tin nào ra Internet.
 *
 * Khoá API: `api_keys` chỉ lưu BẢN BĂM (`lib/integrations/api-key.ts`). Ở đây
 * cột `key_hash` được nạp bằng 32 byte ngẫu nhiên — tức là KHÔNG hề tồn tại
 * chuỗi khoá nào mà ai đó đang cầm để gọi API. Cố ý không sinh khoá thật rồi
 * băm: sinh ra là có một lúc khoá đó tồn tại trong bộ nhớ tiến trình.
 * `key_prefix`/`key_suffix` chỉ để màn hình phân biệt hai khoá với nhau.
 * Còn `call_count` / `last_used_at` KHÔNG gõ tay — gọi đúng RPC `api_key_touch`
 * đủ số lần, để con số ấy là số lần ghi thật.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI
 * ═══════════════════════════════════════════════════════════════════════════
 * Mỗi thứ neo vào một khoá cố định:
 *   luồng chat   → (tiệm, loại việc, mã việc) — ràng buộc unique có sẵn
 *   tin nhắn     → (luồng, mốc thời gian) — mốc viết cứng trong file này
 *   webhook      → tên đường báo; cả khối phát tin BỎ QUA nếu đã có phiếu
 *   khoá API     → tên khoá
 *   tệp đính kèm → đường dẫn tệp trong kho
 *   khung nhìn   → (tiệm, người, màn, tên)
 *   cấu hình báo → (tiệm, người)
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` — chốt kiểm ở ngay đầu, dừng hẳn nếu sai.
 *
 * Cần Node ≥ 22.18 (file này nạp thẳng `components/internal-chat/types.ts` để
 * dùng ĐÚNG hàm `detectMentions` của sản phẩm — viết lại hàm đó ở đây là dựng
 * bản thứ hai, rồi có ngày chữ `@Tên` trên màn hình và người nhận thông báo
 * lệch nhau).
 *
 *   node --env-file=.env.local scripts/seed-noi-bo-tich-hop-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { detectMentions } from "../components/internal-chat/types.ts";

const SLUG = process.env.TIEM ?? "demo-spa-huong-sen";

if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL.");
  process.exit(1);
}

const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca, rejectUnauthorized: true },
});

const SB_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ══════════════════════════════════════════════════════════════════════════
// NỘI DUNG CHAT — sáu việc mà một tiệm spa thật sự phải bàn với nhau
// ══════════════════════════════════════════════════════════════════════════
// `ai` là display_name trong `profiles` — phải khớp NGUYÊN VĂN, vì `@Tên` trong
// thân tin được đối chiếu lại bằng chính hàm của sản phẩm.
const CHU = "Chủ tiệm Demo";
const NGOC = "Nguyễn Thị Bích Ngọc";
const NHUNG = "Phạm Thị Hồng Nhung";
const TRUC = "Võ Thị Thanh Trúc";
const THAO = "Bạn Thảo (lễ tân)";

const g = (ngay, gio) => `2026-08-${ngay}T${gio}:00+07:00`;

/**
 * NEO — sáu việc có thật mà các đoạn hội thoại dưới đây đang nói TỚI.
 *
 * Chọn bằng TÊN KHÁCH / TÊN NHÀ CUNG CẤP chứ không phải "cái mới nhất". Lý do
 * đo được 20/08: câu chọn kiểu "lịch hẹn sắp tới gần nhất" trỏ sang việc khác
 * ngay khi đợt nạp bán hàng thêm dữ liệu, và khi đó cuộc trao đổi nhắc tên
 * "chị Thu Hà" lại nằm trong hồ sơ của một khách hoàn toàn khác. Dữ liệu mẫu mà
 * tự nói sai về chính nó thì tệ hơn là không có.
 */
const NEO = {
  phieuNhap: {
    ve: "phiếu nhập đầu kỳ của Minh Long",
    sql: `select p.id from purchases p
            left join suppliers s on s.id = p.supplier_id
           where p.tenant_id = $1 and s.name ilike '%Minh Long%'
           order by p.created_at, p.id limit 1`,
  },
  khachVip: {
    ve: "khách VIP Nguyễn Thu Hà",
    sql: `select id from contacts where tenant_id = $1 and full_name = 'Nguyễn Thu Hà'
            and deleted_at is null order by created_at, id limit 1`,
  },
  khachLeTan: {
    ve: "khách Nguyễn Khánh Vân (lễ tân phụ trách)",
    sql: `select id from contacts where tenant_id = $1 and full_name = 'Nguyễn Khánh Vân'
            and deleted_at is null order by created_at, id limit 1`,
  },
  lichVip: {
    ve: "lịch triệt lông của chị Thu Hà",
    sql: `select a.id from appointments a join contacts ct on ct.id = a.contact_id
           where a.tenant_id = $1 and ct.full_name = 'Nguyễn Thu Hà'
             and a.status = 'booked' and a.deleted_at is null
           order by a.start_at desc, a.id limit 1`,
  },
  lichVang: {
    ve: "lịch chị Thảo Vy không đến",
    sql: `select a.id from appointments a join contacts ct on ct.id = a.contact_id
           where a.tenant_id = $1 and ct.full_name = 'Vũ Thảo Vy'
             and a.status = 'no_show' and a.deleted_at is null
           order by a.start_at desc, a.id limit 1`,
  },
  donNhap: {
    ve: "đơn nháp của chị Lan Hương",
    sql: `select o.id from orders o join contacts ct on ct.id = o.contact_id
           where o.tenant_id = $1 and ct.full_name = 'Trịnh Lan Hương'
             and o.status = 'draft' and o.deleted_at is null
           order by o.created_at desc, o.id limit 1`,
  },
};

const LUONG = [
  {
    ma: "kho-nhap-dau-ky",
    loai: "stock_doc",
    neo: "phieuNhap",
    ve: "Hết hàng / nhận thiếu — chỉ chủ tiệm, quản trị và quản lý đọc được",
    tin: [
      { ai: NGOC, luc: g(18, "08:12"), noi: "Phiếu nhập của Minh Long về sáng nay em đã kiểm xong. Có hai chỗ lệch, em ghi vào đây cho khỏi trôi mất trong nhóm Zalo." },
      { ai: NGOC, luc: g(18, "08:13"), noi: "Mặt nạ giấy cấp ẩm phiếu ghi 5 thùng, thực nhận 4 thùng 8 hộp. Thiếu đúng 4 hộp." },
      { ai: NGOC, luc: g(18, "08:14"), noi: "Dầu gội dược liệu thì đủ 3 thùng, không sao." },
      { ai: NHUNG, luc: g(18, "08:26"), noi: "Serum HA hai thùng chị ơi, nhưng tháng này phòng da chạy nhiều liệu trình, em ước hết trước 10/9." },
      { ai: NHUNG, luc: g(18, "08:27"), noi: "Tháng 7 hai thùng dùng được 6 tuần, mà tháng 8 lượng khách gói tăng hơn." },
      { ai: NGOC, luc: g(18, "08:31"), noi: `Vậy để em đặt thêm một thùng nữa trong đợt tới. @${NHUNG} em ước giúp chị con số chắc: một tuần phòng da xài bao nhiêu chai?` },
      { ai: NHUNG, luc: g(18, "08:44"), noi: "Dạ tuần rồi 9 chai. Tuần nào có 2 khách gói 10 buổi thì lên 12 chai." },
      { ai: TRUC, luc: g(18, "09:02"), noi: "Bên massage không dùng serum nhưng dầu nền thì sắp hết, tuần sau em xin thêm." },
      { ai: NGOC, luc: g(18, "09:05"), noi: "Dầu nền không nằm trong phiếu này chị Trúc ơi, chị mở phiếu mới giúp em, để chung đây là rối phiếu." },
      { ai: TRUC, luc: g(18, "09:06"), noi: "Ừ chị hiểu rồi, chị mở phiếu riêng." },
      { ai: CHU, luc: g(18, "10:20"), noi: "Bốn hộp mặt nạ thiếu đã báo cho bên Minh Long chưa?" },
      { ai: NGOC, luc: g(18, "10:24"), noi: "Dạ em gọi rồi. Bạn Hùng bên đó nói kho họ soạn sót, hẹn bù trong đợt giao thứ Sáu, không tính tiền thêm." },
      { ai: CHU, luc: g(18, "10:26"), noi: "Có ghi lại bằng chữ chưa hay chỉ nói miệng?" },
      { ai: NGOC, luc: g(18, "10:31"), noi: "Em có tin nhắn Zalo của bạn ấy, em chụp lại lưu vào hồ sơ nhà cung cấp." },
      { ai: CHU, luc: g(18, "10:33"), noi: "Ừ, cái gì dính tiền thì phải có chữ. Nói miệng, tháng sau quên là mình chịu." },
      { ai: NHUNG, luc: g(18, "14:10"), noi: "Chị Ngọc ơi, giá serum lần này 2.970.000 một chai à? Đợt tháng 6 em nhớ 2.750.000." },
      { ai: NGOC, luc: g(18, "14:15"), noi: "Đúng rồi, họ tăng từ đầu tháng 8. Có báo trước nhưng mình chưa chỉnh giá gói." },
      { ai: NHUNG, luc: g(18, "14:16"), noi: "Vậy gói 10 buổi chăm da đang bán 4.500.000 là mỏng lắm chị." },
      { ai: CHU, luc: g(18, "15:02"), noi: `Để tháng 9 tính lại bảng giá gói. @${NGOC} em làm giúp anh bảng so giá vốn trước sau, lấy số thật đừng ước.` },
      { ai: NGOC, luc: g(18, "15:08"), noi: "Dạ em làm xong trong tuần này gửi anh." },
      { ai: TRUC, luc: g(18, "16:40"), noi: "Nhắc luôn: kho tầng trên nóng quá, mấy hộp mặt nạ để gần cửa sổ bị phồng. Em dời vào trong rồi." },
      { ai: CHU, luc: g(18, "16:44"), noi: "Cái đó quan trọng đó. Mai anh gọi thợ xem lại quạt hút." },
      { ai: NGOC, luc: g(19, "08:05"), noi: "Cập nhật: Minh Long đã bù đủ 4 hộp mặt nạ sáng nay, em nhận và ký rồi. Phần thiếu của phiếu này coi như xong." },
    ],
  },
  {
    ma: "doi-ca-lich-hen-vip",
    loai: "appointment",
    neo: "lichVip",
    ve: "Đổi ca cho lịch hẹn khách VIP",
    tin: [
      { ai: CHU, luc: g(19, "09:15"), noi: "Lịch chị Thu Hà thứ Bảy 22/8 anh đang để tên anh, nhưng hôm đó anh phải đi gặp bên thuế buổi sáng." },
      { ai: CHU, luc: g(19, "09:16"), noi: "Ai nhận giúp anh ca này được không?" },
      { ai: NHUNG, luc: g(19, "09:30"), noi: "Thứ Bảy là buổi 4 trong gói triệt lông của chị ấy. Bên em có bạn Phương Thảo quen tay khách này nhất, mà thứ Bảy sáng bạn ấy kín 5 ca rồi." },
      { ai: TRUC, luc: g(19, "09:41"), noi: "Sáng thứ Bảy bên massage trống hai khung 9h và 10h30, nhưng KTV massage không đứng máy triệt lông được anh ơi." },
      { ai: NGOC, luc: g(19, "09:50"), noi: "Em xem lịch: 22/8 sáng Phương Thảo kín, Thu Hiền nghỉ phép, Ngọc Hà chỉ làm ca chiều." },
      { ai: NGOC, luc: g(19, "09:51"), noi: "Cách gọn nhất là dời chị Thu Hà sang chiều thứ Bảy, 14h. Chiều thì Ngọc Hà và Phương Thảo đều có mặt." },
      { ai: CHU, luc: g(19, "10:02"), noi: "Dời lịch khách VIP thì phải hỏi khách trước, đừng tự dời rồi báo sau." },
      { ai: NGOC, luc: g(19, "10:04"), noi: "Dạ, để em gọi chị Thu Hà hỏi ý. Nếu chị ấy bận chiều thì mình tính cách khác." },
      { ai: NHUNG, luc: g(19, "10:15"), noi: "Nếu chị ấy không đổi được thì em nhận ca 9h sáng, em dời họp phòng da sang chiều." },
      { ai: CHU, luc: g(19, "10:18"), noi: "Chờ chị Thu Hà trả lời đã, đừng dời họp vội." },
      { ai: NGOC, luc: g(19, "11:40"), noi: "Em gọi rồi. Chị Thu Hà đồng ý chiều 14h thứ Bảy, chị ấy nói sáng đưa con đi học thêm nên chiều còn tiện hơn." },
      { ai: NGOC, luc: g(19, "11:41"), noi: "Em đã đổi giờ trên lịch và nhắn xác nhận lại cho chị ấy." },
      { ai: CHU, luc: g(19, "11:45"), noi: `Tốt. @${NGOC} nhớ đổi luôn tên KTV, để tên anh mà anh không có mặt là hôm đó rối cả quầy.` },
      { ai: NGOC, luc: g(19, "11:47"), noi: "Dạ em để tên Phương Thảo, chiều bạn ấy còn hai khung trống." },
      { ai: NHUNG, luc: g(19, "13:05"), noi: "Em dặn Phương Thảo đọc lại ghi chú buổi 3: chị Thu Hà da nhạy, lần trước để mức năng lượng cao bị rát hai ngày." },
      { ai: NHUNG, luc: g(19, "13:06"), noi: "Buổi này hạ một mức, làm chậm hơn, đừng chạy nhanh cho kịp giờ." },
      { ai: TRUC, luc: g(19, "13:20"), noi: "Chuẩn. Khách VIP mà rát thêm lần nữa là mất luôn chứ không phải góp ý nữa." },
      { ai: CHU, luc: g(19, "13:25"), noi: "Ghi cái đó vào hồ sơ khách chứ đừng để trong đây thôi, người sau vào ca không đọc được." },
      { ai: NHUNG, luc: g(19, "13:31"), noi: "Dạ em ghi vào hồ sơ chị Thu Hà rồi ạ." },
      { ai: NGOC, luc: g(20, "08:10"), noi: "Sáng nay em nhắn nhắc chị Thu Hà, chị ấy xác nhận chiều thứ Bảy 14h. Ca này coi như chốt." },
    ],
  },
  {
    ma: "khach-khong-den",
    loai: "appointment",
    // Người phụ trách ca này là lễ tân, nên đây là một trong hai luồng mà một
    // nhân viên thường cũng đọc được — chỗ để chứng minh quyền đọc theo TỪNG DÒNG.
    neo: "lichVang",
    ve: "Khách không đến — có nên thu cọc giữ chỗ",
    tin: [
      { ai: THAO, luc: g(15, "13:05"), noi: "Chị Thảo Vy hẹn 12h hôm nay mà tới giờ chưa thấy. Em gọi hai lần không bắt máy." },
      { ai: THAO, luc: g(15, "13:06"), noi: "Em nhắn Zalo rồi, chưa thấy trả lời." },
      { ai: TRUC, luc: g(15, "13:20"), noi: "Khung đó chị để trống chờ, mất một ca gội." },
      { ai: NGOC, luc: g(15, "13:35"), noi: "Đợi tới 13h30 chưa tới thì đánh dấu không đến, đừng giữ khung nữa. Có khách vãng lai thì xếp vào." },
      { ai: THAO, luc: g(15, "13:52"), noi: "Em đánh dấu không đến rồi ạ." },
      { ai: THAO, luc: g(16, "09:10"), noi: "Sáng nay chị Thảo Vy nhắn lại, chị ấy nói con ốm phải vào viện, quên báo." },
      { ai: NGOC, luc: g(16, "09:15"), noi: "Vậy là có lý do thật, không phải bỏ hẹn cho vui." },
      { ai: CHU, luc: g(16, "09:40"), noi: "Đây là lần thứ mấy của chị này rồi?" },
      { ai: THAO, luc: g(16, "09:52"), noi: "Em xem lại thì đây là lần thứ hai. Lần trước hồi tháng 6 cũng không đến, hôm đó chị ấy có báo trước một tiếng." },
      { ai: CHU, luc: g(16, "09:55"), noi: "Hai lần thì chưa cần làm gì căng. Nhưng mình nên có luật chung, không thì mỗi lần lại ngồi bàn lại từ đầu." },
      { ai: NGOC, luc: g(16, "10:12"), noi: "Em đề xuất: khách không đến hai lần liên tiếp thì lần đặt sau phải cọc 100 nghìn, trừ thẳng vào tiền dịch vụ." },
      { ai: TRUC, luc: g(16, "10:20"), noi: "Cọc thì lễ tân phải giải thích khéo, không là khách tự ái ngay ở quầy." },
      { ai: THAO, luc: g(16, "10:24"), noi: "Em nói được, nhưng cần một câu chuẩn để ai trực cũng nói giống nhau." },
      { ai: NGOC, luc: g(16, "10:30"), noi: "Chị soạn câu đó, đưa vào phần trả lời nhanh cho cả quầy dùng chung." },
      { ai: CHU, luc: g(16, "11:05"), noi: "Đồng ý. Nhưng chị Thảo Vy lần này có lý do chính đáng, đừng áp cọc với chị ấy." },
      { ai: CHU, luc: g(16, "11:06"), noi: `@${THAO} em gọi hỏi thăm con chị ấy rồi mời đặt lại lịch, đừng nhắc chuyện cọc.` },
      { ai: THAO, luc: g(16, "11:20"), noi: "Dạ em gọi chiều nay ạ." },
      { ai: THAO, luc: g(17, "15:40"), noi: "Em gọi rồi, bé đỡ rồi ạ. Chị Thảo Vy đặt lại lịch gội thứ Tư tuần sau, 10h." },
      { ai: NGOC, luc: g(17, "15:48"), noi: "Tốt. Vậy chuyện này khép ở đây, phần luật cọc chị sẽ nói trong buổi họp đầu tháng." },
      { ai: TRUC, luc: g(17, "16:00"), noi: "Nhớ để khung 10h thứ Tư cho bạn Bảo Trân, hôm đó chị bận ca liệu trình." },
    ],
  },
  {
    ma: "khach-phan-nan-rat-da",
    loai: "contact",
    // Khách VIP do chính chủ tiệm phụ trách ⇒ nhân viên thường KHÔNG đọc được
    // hồ sơ này, nên cũng không đọc được cuộc trao đổi về nó.
    neo: "khachVip",
    ve: "Khách phàn nàn rát da sau buổi triệt lông",
    tin: [
      { ai: NGOC, luc: g(12, "17:40"), noi: "Chị Thu Hà vừa gọi lên, giọng không vui. Chị ấy nói sau buổi triệt lông hôm 10/8 vùng làm bị rát và đỏ suốt hai ngày." },
      { ai: NGOC, luc: g(12, "17:41"), noi: "Chị ấy hỏi có phải máy hỏng không." },
      // Tin bị thu hồi — dữ liệu mẫu phải có để màn hình chứng minh được rằng
      // "đã xoá" là xoá MỀM: chữ vẫn nằm trong CSDL làm bằng chứng, màn hình chỉ
      // để lại vệt.
      { ai: NHUNG, luc: g(12, "17:52"), noi: "Chắc tại bạn Phương Thảo làm ẩu chứ máy móc gì.", xoa: g(12, "17:56") },
      { ai: NHUNG, luc: g(12, "17:55"), noi: "Máy không hỏng chị ơi, em vừa kiểm tra sáng nay. Em nghĩ do mức năng lượng." },
      { ai: NHUNG, luc: g(12, "17:57"), noi: "Buổi 10/8 là bạn Phương Thảo làm, để mức 16. Ba buổi trước em làm chỉ để mức 13 tới 14.", sua: g(12, "17:59") },
      { ai: NGOC, luc: g(12, "18:02"), noi: "Sao lại nhảy lên 16?" },
      { ai: NHUNG, luc: g(12, "18:10"), noi: "Em hỏi rồi. Bạn ấy nói khách than lông mọc lại nhanh nên muốn đẩy mức cho hiệu quả hơn. Ý tốt nhưng sai cách." },
      { ai: TRUC, luc: g(12, "18:15"), noi: "Da chị Thu Hà thuộc loại nhạy, hồ sơ có ghi mà." },
      { ai: NHUNG, luc: g(12, "18:20"), noi: "Có ghi ạ, nhưng ghi ở phần cuối hồ sơ, bạn ấy không kéo xuống tới." },
      { ai: CHU, luc: g(12, "19:30"), noi: "Vậy lỗi không phải của riêng bạn Phương Thảo. Chỗ ghi chú quan trọng mà nằm chỗ không ai đọc thì trước sau gì cũng có người sót." },
      { ai: CHU, luc: g(12, "19:32"), noi: "Trước mắt xử lý với khách đã. Mình định làm gì?" },
      { ai: NGOC, luc: g(12, "19:45"), noi: "Em đề xuất: tặng chị ấy một buổi chăm da phục hồi miễn phí, và buổi triệt lông 10/8 không tính vào gói." },
      { ai: NHUNG, luc: g(12, "19:50"), noi: "Em đồng ý phần chăm da phục hồi. Nhưng buổi 10/8 vẫn có tác dụng triệt, trừ luôn thì hơi quá." },
      { ai: CHU, luc: g(12, "20:05"), noi: "Trừ luôn. Khách đau vì mình để sai mức thì buổi đó không tính. Mất một buổi còn hơn mất khách gói 10 buổi." },
      { ai: NGOC, luc: g(12, "20:07"), noi: "Dạ em ghi nhận. Mai em gọi báo chị ấy." },
      { ai: NGOC, luc: g(13, "09:20"), noi: "Em gọi rồi. Chị Thu Hà nói cảm ơn, chị ấy nhận buổi chăm da phục hồi. Giọng đã dịu hẳn." },
      { ai: NGOC, luc: g(13, "09:21"), noi: "Chị ấy hỏi buổi sau ai làm." },
      { ai: NHUNG, luc: g(13, "09:35"), noi: "Nói với chị ấy là em làm buổi 4. Em theo từ đầu nên biết mức nào hợp da chị ấy." },
      { ai: CHU, luc: g(13, "10:10"), noi: `Còn phần gốc: ghi chú da nhạy phải nằm chỗ dễ thấy. @${NGOC} em xem lại cách mình ghi hồ sơ khách.` },
      { ai: NGOC, luc: g(13, "10:22"), noi: "Em đề xuất gắn thẻ Khiếu nại và một thẻ riêng cho khách da nhạy, thẻ hiện ngay đầu hồ sơ." },
      { ai: CHU, luc: g(13, "10:25"), noi: "Làm đi. Và phổ biến trong họp phòng da tuần này, đừng chỉ sửa hồ sơ một khách rồi thôi." },
      { ai: NHUNG, luc: g(13, "10:40"), noi: "Dạ, thứ Năm em họp phòng da, em đưa vào đầu buổi." },
      { ai: NGOC, luc: g(14, "08:15"), noi: "Đã gắn thẻ cho chị Thu Hà và 3 khách da nhạy khác. Buổi phục hồi đặt sáng 21/8." },
      { ai: TRUC, luc: g(14, "08:30"), noi: `Bên massage cũng có mấy khách dị ứng tinh dầu, chị gắn thẻ tương tự nhé @${NGOC}.` },
      { ai: NGOC, luc: g(14, "08:33"), noi: "Chị gắn đi, cùng cách với bên da." },
    ],
  },
  {
    ma: "chuan-bi-khuyen-mai-thang-9",
    loai: "contact",
    // Khách do LỄ TÂN phụ trách ⇒ chính bạn lễ tân đó đọc được, còn KTV khác thì
    // không. Đúng chỗ để chứng minh quyền đọc là theo TỪNG DÒNG, không theo vai.
    neo: "khachLeTan",
    ve: "Chuẩn bị chương trình khuyến mãi tháng 9",
    tin: [
      { ai: THAO, luc: g(18, "10:05"), noi: "Chị Khánh Vân hôm qua tới gội, có hỏi gói chăm da 10 buổi giá bao nhiêu. Em báo 4.500.000." },
      { ai: THAO, luc: g(18, "10:06"), noi: "Chị ấy nói để suy nghĩ, rồi hỏi tháng 9 có khuyến mãi gì không." },
      { ai: NGOC, luc: g(18, "10:20"), noi: "Tháng 9 mình có định làm chương trình gì chưa nhỉ? Tuần này em nghe ba khách hỏi rồi." },
      { ai: CHU, luc: g(18, "11:00"), noi: "Đang tính. Ai có ý gì thì nói ở đây, đừng để tới lúc in tờ rơi mới bàn." },
      { ai: NHUNG, luc: g(18, "11:20"), noi: "Em đề xuất gói 10 buổi tặng 1 buổi phục hồi, không giảm giá." },
      { ai: NHUNG, luc: g(18, "11:21"), noi: "Giảm giá gói thì sang năm khách quen giá thấp, kéo lên lại rất khó." },
      { ai: NGOC, luc: g(18, "11:35"), noi: "Em đồng ý không giảm giá. Nhưng tặng buổi phục hồi thì phòng da gánh thêm giờ, bên chị có kham nổi không?" },
      { ai: NHUNG, luc: g(18, "11:40"), noi: "Một buổi phục hồi 45 phút. Nếu tháng 9 bán được 15 gói thì thêm khoảng 11 giờ, chia cho 4 bạn là ổn." },
      { ai: THAO, luc: g(18, "13:10"), noi: "Khách hay hỏi trả góp hơn là hỏi giảm giá đó chị. Tuần rồi ba người hỏi chia 2 lần." },
      { ai: NGOC, luc: g(18, "13:15"), noi: "Chia 2 lần thì được, nhưng phải ghi rõ lần 2 đóng trước buổi 5. Không thì tới buổi 9 khách vẫn nợ." },
      { ai: CHU, luc: g(18, "14:02"), noi: `Chốt hướng: gói 10 buổi giữ giá, tặng 1 buổi phục hồi, cho chia 2 lần. @${NGOC} em làm bản tính thử doanh thu giúp anh.` },
      { ai: NGOC, luc: g(18, "14:10"), noi: "Dạ, em làm theo ba mức: bán 10 gói, 15 gói và 20 gói." },
      { ai: THAO, luc: g(18, "14:30"), noi: "Vậy giờ em trả lời chị Khánh Vân sao ạ? Chị ấy đang chờ." },
      { ai: CHU, luc: g(18, "14:35"), noi: "Nói thật: tháng 9 có chương trình, đầu tháng mình gọi lại báo cụ thể. Đừng hứa con số khi chưa chốt." },
      { ai: THAO, luc: g(18, "14:40"), noi: "Dạ em nhắn đúng vậy." },
      { ai: NGOC, luc: g(19, "09:05"), noi: "Bản tính thử em gửi anh rồi. Bán 15 gói thì lãi gộp vẫn hơn tháng 8 khoảng 12%, đã trừ buổi tặng." },
      { ai: CHU, luc: g(19, "09:30"), noi: "Ổn. Vậy chạy." },
      { ai: NHUNG, luc: g(19, "09:45"), noi: "Em cần biết trước ngày bắt đầu để xếp lịch phòng da. Đừng để 1/9 mới báo." },
      { ai: NGOC, luc: g(19, "09:50"), noi: "Bắt đầu 1/9, báo cho khách từ 27/8. Em sẽ gửi danh sách khách cần gọi trước cho quầy." },
      { ai: THAO, luc: g(19, "09:55"), noi: "Em ghi tên chị Khánh Vân vào danh sách gọi trước rồi ạ." },
      { ai: CHU, luc: g(19, "10:02"), noi: `@${THAO} khách nào đã hỏi giá mà chưa mua thì gọi trước hết, đừng gọi tràn cả danh sách.` },
    ],
  },
  {
    ma: "don-nhap-treo",
    loai: "order",
    neo: "donNhap",
    ve: "Đơn nháp treo — khách chưa quyết",
    tin: [
      { ai: NGOC, luc: g(17, "17:20"), noi: "Đơn của chị Lan Hương đang để nháp từ chiều. Chị ấy chọn gói chăm da 10 buổi nhưng chưa chốt." },
      { ai: NGOC, luc: g(17, "17:21"), noi: "Chị ấy nói về hỏi ý chồng, hẹn trong tuần trả lời." },
      { ai: NHUNG, luc: g(17, "17:40"), noi: "Chị Lan Hương lâu rồi không tới, hồ sơ ghi lần cuối là tháng 4." },
      { ai: NGOC, luc: g(17, "17:45"), noi: "Đúng, nên lần này chị ấy quay lại là tín hiệu tốt. Đừng để nguội." },
      { ai: CHU, luc: g(17, "18:30"), noi: "Đơn nháp để bao lâu thì mình bỏ?" },
      { ai: NGOC, luc: g(17, "18:35"), noi: "Chưa có luật. Hiện em để tới khi khách trả lời, có đơn nằm cả tháng." },
      { ai: CHU, luc: g(17, "18:40"), noi: "Vậy là số bán hàng của mình có rác. Đơn nháp một tháng thì không phải đơn." },
      { ai: NGOC, luc: g(17, "18:50"), noi: `@${CHU} em đề xuất: nháp quá 14 ngày không ai động thì đóng lại, ghi lý do khách chưa quyết.` },
      { ai: NHUNG, luc: g(17, "19:02"), noi: "Đóng rồi khách quay lại thì mở đơn mới thôi, có mất gì đâu." },
      { ai: CHU, luc: g(17, "19:10"), noi: "Ừ, làm vậy. Nhưng riêng đơn này cứ chờ hết tuần đã." },
      { ai: NGOC, luc: g(18, "10:15"), noi: "Em nhắn chị Lan Hương hỏi thăm, chưa thấy trả lời." },
      { ai: NHUNG, luc: g(18, "10:30"), noi: "Đừng nhắn dồn, khách đang cân nhắc mà nhắn nhiều là chạy mất." },
      { ai: NGOC, luc: g(18, "10:32"), noi: "Em nhắn một lần thôi, không nhắn nữa." },
      { ai: CHU, luc: g(19, "08:40"), noi: "Giá trên đơn nháp giữ tới bao giờ? Nếu tháng 9 đổi bảng giá thì đơn này tính giá nào?" },
      { ai: NGOC, luc: g(19, "08:52"), noi: "Câu này quan trọng. Em nghĩ đơn nháp lập trước ngày đổi giá thì giữ giá cũ 30 ngày." },
      { ai: CHU, luc: g(19, "08:55"), noi: "Ghi rõ trên đơn luôn, đừng để miệng. Khách cầm ảnh chụp báo giá tới cãi thì mình không có gì đối chiếu." },
      { ai: NGOC, luc: g(19, "09:05"), noi: "Dạ em ghi vào ghi chú đơn: giữ giá tới 16/9." },
      { ai: NHUNG, luc: g(19, "09:20"), noi: "Nếu chị ấy chốt thì xếp buổi đầu vào chiều thứ Ba giúp em, sáng em kín." },
      { ai: NGOC, luc: g(19, "09:22"), noi: "Ok chị, em xếp chiều thứ Ba." },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════════
// TÍCH HỢP — ba đường báo ra và hai khoá API
// ══════════════════════════════════════════════════════════════════════════
// `moc` = phát từ sự kiện thứ `moc` tính ngược từ mới nhất (trong đúng các loại
// đã đăng ký). Phát theo TỪNG ĐỢT, mỗi đợt chỉ bật một đường báo, nên số phiếu
// của mỗi đường không lẫn vào nhau.
//
// ⚠️ `QUET_MOI_DOT` là chốt chặn cứng, và nó có lý do THẬT: bảng `domain_events`
// của tiệm mẫu đang được các đợt nạp khác ghi vào liên tục (đo 20/08: 1.433 →
// 19.907 dòng trong vòng vài phút). `webhook_queue_new` quét p_max sự kiện CŨ
// NHẤT sau con trỏ, nên đặt trần ở đây là cách duy nhất bảo đảm một lần lùi con
// trỏ không đẻ ra hàng nghìn phiếu gửi. Lần chạy đầu đã đo đúng cảnh đó: một
// đợt sinh 3.264 phiếu.
const TRAN_MOI_DUONG = 60; // mỗi đường báo; vượt là trả lại đợt đó
const TRAN_PHIEU = 500;    // cả tiệm; vượt là có gì đó sai — dừng, đừng để lại rác

const DUONG_BAO = [
  {
    ten: "Kế toán nội bộ — đồng bộ đơn và thu tiền",
    url: "https://hooks.example.com/ifan/ke-toan",
    loai: ["order.completed", "payment.received"],
    moc: 24,
    ketCuc: "sent", // đường báo khoẻ: mọi phiếu đều gửi được
    cuoi: "active",
  },
  {
    ten: "Bảng theo dõi lịch hẹn (Google Sheet)",
    url: "https://hooks.example.com/ifan/lich-hen",
    loai: ["appointment.booked", "appointment.arrived", "appointment.done"],
    moc: 10,
    ketCuc: "hong-roi-song-lai", // hỏng 2 phiếu rồi gửi lại được
    cuoi: "paused",
  },
  {
    ten: "Zalo OA — chăm sóc sau dịch vụ",
    url: "https://hooks.example.com/ifan/zalo-cham-soc",
    loai: ["order.completed"],
    moc: 12,
    ketCuc: "hong-han", // hỏng hẳn, chủ tiệm tạm dừng
    cuoi: "paused",
  },
];

const KHOA_API = [
  { ten: "Phần mềm kế toán (chỉ đọc đơn)", quyen: ["read:orders"], goi: 37, thuHoi: false },
  { ten: "Khoá cũ của bạn kỹ thuật website", quyen: ["read:orders", "read:contacts"], goi: 12, thuHoi: true },
];

// ══════════════════════════════════════════════════════════════════════════
// TIỆN ÍCH
// ══════════════════════════════════════════════════════════════════════════
// Ảnh 1×1 PNG và một tệp PDF nhỏ nhất còn mở được — tệp THẬT được tải lên kho,
// không phải đường dẫn treo. Dòng đính kèm trỏ vào tệp không tồn tại là đúng
// kiểu "số liệu đá nhau" mà kho này đã trả giá một lần.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF_TOI_GIAN = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
);

/** Khung nhìn đã lưu — câu lọc phải nằm trong vốn từ ĐÓNG của `lib/saved-views.ts`
 *  (phiên bản 2), nếu không chip sẽ hiện "hỏng" ngay trên màn hình. */
const KHUNG_NHIN = [
  { man: "contacts", ten: "Khách VIP cần chăm lại", loc: "tier=vip&inactive_days=45&sort=score", cua: null, thuTu: 2 },
  { man: "contacts", ten: "Khách nguội 90 ngày", loc: "inactive_days=90&sort=recent", cua: null, thuTu: 3 },
  { man: "deals", ten: "Cần xử lý hôm nay", loc: "needs_action=1", cua: null, thuTu: 0 },
  { man: "deals", ten: "Đang hỏi gói liệu trình", loc: "q=g%C3%B3i+li%E1%BB%87u+tr%C3%ACnh", cua: null, thuTu: 1 },
  { man: "contacts", ten: "Khách mới tuần này", loc: "tier=new&sort=recent", cua: NGOC, thuTu: 0 },
  { man: "contacts", ten: "Khách quầy lễ tân theo", loc: "tier=new&inactive_days=14", cua: THAO, thuTu: 0 },
];

/** Cấu hình bản tin qua bot — hình dạng jsonb khớp `saveBotPrefs` và bản đọc
 *  phòng thủ của `bot_digest_run`: enabled / digest_hour / kinds{sla,today,unread}. */
const CAU_HINH_BAO = [
  { ai: CHU, pref: { enabled: true, digest_hour: 7, kinds: { sla: true, today: true, unread: true } } },
  { ai: NGOC, pref: { enabled: true, digest_hour: 7, kinds: { sla: true, today: true, unread: true } } },
  { ai: NHUNG, pref: { enabled: true, digest_hour: 8, kinds: { sla: false, today: true, unread: true } } },
  { ai: TRUC, pref: { enabled: true, digest_hour: 8, kinds: { sla: false, today: true, unread: false } } },
  { ai: THAO, pref: { enabled: true, digest_hour: 6, kinds: { sla: true, today: true, unread: true } } },
  { ai: "Trần Thị Kim Anh", pref: { enabled: true, digest_hour: 6, kinds: { sla: false, today: true, unread: true } } },
  { ai: "Lê Thị Mỹ Duyên", pref: { enabled: false, digest_hour: 9, kinds: { sla: false, today: false, unread: false } } },
  { ai: "Vũ Thị Hoài Thương", pref: { enabled: true, digest_hour: 9, kinds: { sla: true, today: false, unread: true } } },
];

/** Sự kiện NHẬN VỀ từ nhà cung cấp kênh. Tiệm mẫu đang bật Live Chat, còn Zalo
 *  OA mới khai chứ chưa được duyệt (`channels.status = 'pending_platform'`) —
 *  nên dòng Zalo ở đây mang đúng lỗi "kênh chưa kết nối", không giả vờ chạy được. */
const SU_KIEN_NHAN = [
  { nha: "livechat", ma: "lc-demo-20260817-0001", ngay: g(17, "09:12"), xong: true, payload: { kind: "visitor.message", visitor: "kh-8821", text: "Chị ơi gói chăm da 10 buổi bao nhiêu ạ?" } },
  { nha: "livechat", ma: "lc-demo-20260817-0002", ngay: g(17, "09:14"), xong: true, payload: { kind: "visitor.message", visitor: "kh-8821", text: "Cuối tuần này còn chỗ không ạ?" } },
  { nha: "livechat", ma: "lc-demo-20260818-0003", ngay: g(18, "14:41"), xong: true, payload: { kind: "visitor.opened", visitor: "kh-9033", page: "/bang-gia" } },
  { nha: "livechat", ma: "lc-demo-20260819-0004", ngay: g(19, "20:07"), xong: true, payload: { kind: "visitor.message", visitor: "kh-9033", text: "Spa mở tới mấy giờ ạ?" } },
  { nha: "zalo", ma: "zalo-demo-20260819-0001", ngay: g(19, "10:33"), xong: false, loi: "kenh_chua_ket_noi", payload: { event_name: "user_send_text", oa_id: "demo-oa-000" } },
];

// ══════════════════════════════════════════════════════════════════════════
// TIỆN ÍCH CHẠY
// ══════════════════════════════════════════════════════════════════════════
const BANG_DEM = [
  "internal_threads", "internal_messages", "internal_mentions",
  "webhook_endpoints", "webhook_deliveries", "webhook_events",
  "api_keys", "attachments", "saved_views", "notification_prefs",
  "notifications",
];

async function dem(tenantId) {
  const out = {};
  for (const b of BANG_DEM) {
    const r = await c.query(`select count(*)::int n from public.${b} where tenant_id = $1`, [tenantId]);
    out[b] = r.rows[0].n;
  }
  return out;
}

function inBang(truoc, sau) {
  const rong = Math.max(...BANG_DEM.map((b) => b.length));
  for (const b of BANG_DEM) {
    const d = sau[b] - truoc[b];
    console.log(`  ${b.padEnd(rong)}  ${String(truoc[b]).padStart(6)} → ${String(sau[b]).padStart(6)}  ${d > 0 ? "(+" + d + ")" : d < 0 ? "(" + d + ")" : "(không đổi)"}`);
  }
}

const nhan = [];
const ghi = (s) => { console.log(s); };

// ══════════════════════════════════════════════════════════════════════════
await c.connect();
await c.query(`set lock_timeout = '10s'`);

// ── CHỐT KIỂM: chỉ tiệm mẫu ────────────────────────────────────────────────
const t = (await c.query(`select id, slug, name, is_sample from tenants where slug = $1`, [SLUG])).rows[0];
if (!t) {
  console.error(`Không có tiệm nào slug = "${SLUG}".`);
  await c.end();
  process.exit(1);
}
if (t.is_sample !== true) {
  console.error(`DỪNG: tiệm "${SLUG}" KHÔNG phải tiệm mẫu (is_sample = ${t.is_sample}). Script này chỉ ghi vào tiệm mẫu.`);
  await c.end();
  process.exit(1);
}
const TID = t.id;
ghi(`Tiệm mẫu: ${t.name} (${t.slug}) — is_sample = true\n`);

const truoc = await dem(TID);

// ── Danh bạ người trong tiệm ───────────────────────────────────────────────
const nguoiRows = (await c.query(
  `select tm.user_id, tm.role, p.display_name
     from tenant_members tm join profiles p on p.user_id = tm.user_id
    where tm.tenant_id = $1 and tm.status = 'active'`, [TID])).rows;
const NGUOI = new Map(nguoiRows.map((r) => [r.display_name, r.user_id]));
/** Danh sách đưa cho `detectMentions` — ĐÚNG danh sách mà ô gợi ý tên của sản
 *  phẩm dựng ra (người còn hoạt động trong tiệm), không phải mọi profile. */
const THANH_VIEN = nguoiRows.map((r) => ({ userId: r.user_id, displayName: r.display_name }));

const uid = (ten) => {
  const v = NGUOI.get(ten);
  if (!v) throw new Error(`Không tìm thấy người "${ten}" trong tenant_members đang hoạt động.`);
  return v;
};

// ── Sáu việc mà cả chat lẫn tệp đính kèm cùng bám vào ──────────────────────
const VIEC = {};
for (const [k, v] of Object.entries(NEO)) {
  const r = (await c.query(v.sql, [TID])).rows[0];
  if (!r) nhan.push(`Không tìm thấy ${v.ve} — mọi thứ neo vào nó sẽ bị bỏ qua.`);
  VIEC[k] = r?.id ?? null;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. CHAT NỘI BỘ
// ══════════════════════════════════════════════════════════════════════════
ghi("── Trao đổi nội bộ ───────────────────────────────────────────────");
let soTin = 0, soNhac = 0, soLuong = 0;
for (const L of LUONG) {
  // NEO VÀO MỐC TIN ĐẦU TIÊN, không neo vào kết quả câu `tim`.
  //
  // Lý do đo được 20/08, không phải phòng xa: câu `tim` chọn theo kiểu "lịch hẹn
  // sắp tới gần nhất". Tiệm mẫu đang được các đợt nạp khác ghi thêm đơn và lịch
  // hẹn liên tục, nên chạy lần hai câu ấy trỏ sang việc KHÁC và đẻ ra luồng thứ
  // hai — đã xảy ra thật, 6 luồng thành 11. Mốc tin đầu là chữ viết cứng trong
  // file này, nó đứng yên bất kể dữ liệu quanh nó đổi bao nhiêu.
  let thread = (await c.query(
    `select t.id from internal_threads t
       join internal_messages m on m.thread_id = t.id
      where t.tenant_id = $1 and t.entity_type = $2 and m.created_at = $3
      limit 1`, [TID, L.loai, L.tin[0].luc])).rows[0];

  if (!thread) {
    const viecId = VIEC[L.neo];
    if (!viecId) { nhan.push(`Bỏ luồng "${L.ma}": không tìm thấy ${NEO[L.neo].ve}.`); continue; }
    await c.query(
      `insert into internal_threads (tenant_id, entity_type, entity_id, created_by, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, entity_type, entity_id) do nothing`,
      [TID, L.loai, viecId, uid(L.tin[0].ai), L.tin[0].luc]);
    thread = (await c.query(
      `select id from internal_threads where tenant_id = $1 and entity_type = $2 and entity_id = $3`,
      [TID, L.loai, viecId])).rows[0];
  }
  soLuong++;

  let themTin = 0, themNhac = 0;
  for (const m of L.tin) {
    // Neo mỗi tin vào (luồng, mốc thời gian): chạy lần hai không đẻ thêm, mà
    // vẫn thêm được tin mới nếu sau này bổ sung vào file này.
    const r = await c.query(
      `insert into internal_messages (tenant_id, thread_id, sender_user_id, body, created_at, edited_at, deleted_at)
       select $1, $2, $3, $4, $5, $6, $7
        where not exists (select 1 from internal_messages where thread_id = $2 and created_at = $5)
       returning id`,
      [TID, thread.id, uid(m.ai), m.noi, m.luc, m.sua ?? null, m.xoa ?? null]);
    if (r.rows.length === 0) continue;
    themTin++;

    // Ai bị gọi tên: hỏi lại ĐÚNG hàm của sản phẩm, không tự dò chuỗi.
    const biGoi = detectMentions(m.noi, THANH_VIEN).filter((x) => x !== uid(m.ai));
    for (const u of biGoi) {
      const rm = await c.query(
        `insert into internal_mentions (tenant_id, message_id, mentioned_user_id, created_at)
         values ($1, $2, $3, $4) on conflict (message_id, mentioned_user_id) do nothing returning id`,
        [TID, r.rows[0].id, u, m.luc]);
      if (rm.rows.length) themNhac++;
    }
  }
  soTin += themTin; soNhac += themNhac;
  ghi(`  ${L.loai.padEnd(12)} ${L.ve} — thêm ${themTin} tin, ${themNhac} lượt gọi tên`);
}
ghi(`  ⇒ ${soLuong} luồng, thêm ${soTin} tin, ${soNhac} lượt gọi tên (mỗi lượt gọi tên sinh 1 thông báo do trigger của sản phẩm)\n`);

// ══════════════════════════════════════════════════════════════════════════
// 2. TÍCH HỢP — đường báo ra
// ══════════════════════════════════════════════════════════════════════════
ghi("── Đường báo ra (webhook) ────────────────────────────────────────");
const daCoPhieu = (await c.query(`select count(*)::int n from webhook_deliveries where tenant_id = $1`, [TID])).rows[0].n;

// Tạo/nhận lại ba đường báo, neo theo TÊN.
const dbId = new Map();
for (const d of DUONG_BAO) {
  const co = (await c.query(`select id from webhook_endpoints where tenant_id = $1 and name = $2`, [TID, d.ten])).rows[0];
  if (co) { dbId.set(d.ten, co.id); continue; }
  const r = await c.query(
    `insert into webhook_endpoints (tenant_id, name, url, secret, event_types, status, created_by)
     values ($1, $2, $3, $4, $5, 'active', $6) returning id`,
    // `secret` là khoá ký HMAC, bắt buộc phải có giá trị thật để chữ ký có nghĩa.
    // Nó chỉ dùng được bởi bên NHẬN — mà địa chỉ trên không phân giải được nên
    // không có bên nhận nào cả.
    [TID, d.ten, d.url, randomBytes(32).toString("hex"), d.loai, uid(CHU)]);
  dbId.set(d.ten, r.rows[0].id);
}

if (daCoPhieu > 0) {
  ghi(`  Đã có ${daCoPhieu} phiếu gửi từ lần chạy trước ⇒ bỏ qua phần phát tin (giữ nguyên, không nạp chồng).`);
} else {
 // ĐỌC LẶP LẠI ĐƯỢC (repeatable read), không phải mức mặc định.
 //
 // Chọn mốc lùi và phát tin là HAI câu lệnh, nhưng chúng phải nói về cùng một
 // thực tại: "đúng 23 sự kiện khớp loại nằm sau mốc" mà câu đầu đo được thì câu
 // sau phải thấy y vậy. Bảng `domain_events` của tiệm mẫu đang được đợt nạp
 // khác ghi vào liên tục (đo 20/08: 1.433 → gần 20.000 dòng trong ít phút), nên
 // ở mức đọc mặc định mỗi câu nhìn một ảnh chụp khác nhau.
 // Đổi lại: đụng độ ghi sẽ ném 40001 — bắt và làm lại, không nuốt.
 const LAM_LAI = 3;
 for (let lan = 1; ; lan++) {
  await c.query("begin transaction isolation level repeatable read");
  try {
    const conTro = (await c.query(`select last_event_at, last_event_id from webhook_fanout_cursor where only_row for update`)).rows[0];

    // Phát theo từng đợt: mỗi đợt chỉ MỘT đường báo ở trạng thái hoạt động, nên
    // số phiếu của đường đó đúng bằng số sự kiện trong khung mình chọn.
    // Chỉ đụng vào BA đường báo của file này — tiệm mẫu có thể có đường báo do
    // người dùng tự tạo, tắt nhầm của họ là mình vừa làm hỏng thứ không phải của mình.
    const cuaToi = DUONG_BAO.map((x) => dbId.get(x.ten));
    for (const d of DUONG_BAO) {
      // Mỗi đợt một điểm lùi riêng: hỏng thì trả lại đúng đợt đó, không kéo cả
      // khối theo.
      await c.query(`savepoint dot`);
      await c.query(`update webhook_endpoints set status = 'paused' where id = any($1)`, [cuaToi]);
      await c.query(`update webhook_endpoints set status = 'active' where id = $1`, [dbId.get(d.ten)]);

      // Mốc lùi = sự kiện thứ `moc` tính từ mới nhất, trong đúng các loại đã đăng
      // ký. Lùi tới NGAY TRƯỚC nó (id - 1) để chính nó cũng được phát.
      // Thứ tự `created_at desc, id desc` phải TRÙNG KHÍT thứ tự con trỏ của
      // `webhook_queue_new` — lệch một chút là đếm ra số khác.
      const mocRow = (await c.query(
        `select id::text from domain_events
          where tenant_id = $1 and event_type = any($2)
          order by created_at desc, id desc offset $3 limit 1`, [TID, d.loai, d.moc - 1])).rows[0];
      if (!mocRow) {
        await c.query(`rollback to savepoint dot`);
        nhan.push(`Đường báo "${d.ten}": không có sự kiện nào thuộc loại đã đăng ký để phát.`);
        continue;
      }

      // ⚠️ MỐC THỜI GIAN KHÔNG ĐƯỢC ĐI VÒNG QUA JAVASCRIPT.
      //
      // Lỗi thật, mất hai lượt chạy mới tìm ra (20/08): `timestamptz` của
      // Postgres đếm tới PHẦN TRIỆU giây, còn `Date` của JavaScript chỉ tới
      // phần nghìn. Đọc mốc ra JS rồi gửi ngược lại là đã LÀM TRÒN XUỐNG mất
      // phần lẻ — con trỏ lùi thêm gần một phần nghìn giây, và trong tiệm mẫu
      // này một phần nghìn giây chứa hàng nghìn sự kiện (đợt nạp khác ghi hàng
      // loạt). Mốc chọn để ra 24 phiếu, thực tế phát ra 5.010.
      //
      // Nên chỉ mang MÃ DÒNG qua JS; mốc thời gian ở nguyên trong SQL.
      const soQuet = (await c.query(
        `with m as (select created_at, id - 1 as id from domain_events where id = $1::bigint)
         select least(count(*), 60000)::int n
           from domain_events x, m where (x.created_at, x.id) > (m.created_at, m.id)`,
        [mocRow.id])).rows[0].n;

      // `p_max` phải phủ HẾT cửa sổ: hàm quét p_max sự kiện CŨ NHẤT sau con trỏ,
      // mà cửa sổ này đầy sự kiện không liên quan (mã dòng chạy ngược chiều thời
      // gian sau các đợt nạp hàng loạt). Đặt p_max nhỏ là quét trúng toàn thứ
      // không khớp rồi dừng ⇒ 0 phiếu. Số dòng THẬT SỰ khớp vẫn chỉ là `moc`.
      await c.query(
        `update webhook_fanout_cursor set last_event_at = e.created_at, last_event_id = e.id - 1
           from domain_events e where only_row and e.id = $1::bigint`, [mocRow.id]);
      await c.query(`select webhook_queue_new($1)`, [Math.max(soQuet, 1)]);

      // Chốt chặn: cửa sổ có thể phình nếu đợt nạp khác đang commit xen vào giữa
      // hai câu lệnh. Quá trần thì TRẢ LẠI đợt này, không để lại hàng nghìn phiếu rác.
      const raBaoNhieu = (await c.query(
        `select count(*)::int n from webhook_deliveries where endpoint_id = $1`, [dbId.get(d.ten)])).rows[0].n;
      if (raBaoNhieu > TRAN_MOI_DUONG) {
        await c.query(`rollback to savepoint dot`);
        nhan.push(`Đường báo "${d.ten}": phát ra ${raBaoNhieu} phiếu, vượt trần ${TRAN_MOI_DUONG} ⇒ đã trả lại, đường báo này chưa có lịch sử gửi.`);
        continue;
      }
      await c.query(`release savepoint dot`);
    }

    // TRẢ CON TRỎ VỀ ĐÚNG CHỖ CŨ — nó là của cả hệ thống, không phải của tiệm này.
    await c.query(`update webhook_fanout_cursor set last_event_at = $1, last_event_id = $2 where only_row`,
      [conTro.last_event_at, conTro.last_event_id]);

    const tongPhieu = (await c.query(`select count(*)::int n from webhook_deliveries where tenant_id = $1`, [TID])).rows[0].n;
    if (tongPhieu > TRAN_PHIEU) {
      throw new Error(`Phát ra ${tongPhieu} phiếu, vượt trần ${TRAN_PHIEU}. Dừng và trả lại nguyên trạng.`);
    }

    // ── Diễn lại vòng đời gửi bằng ĐÚNG hai RPC của sản phẩm ────────────────
    // Nhận HẾT phiếu đang chờ (nhiều lượt, vì `webhook_claim` có trần mỗi lượt).
    // Phiếu đã nhận mà chưa ghi kết quả thì `claimed_at` khác null nên không bị
    // nhận lại — vòng này tự dừng.
    const daNhan = [];
    for (;;) {
      const r = await c.query(`select * from webhook_claim($1)`, [200]);
      if (r.rows.length === 0) break;
      daNhan.push(...r.rows);
      if (daNhan.length > TRAN_PHIEU) throw new Error("Nhận quá nhiều phiếu — dừng.");
    }

    const theoDuong = new Map(DUONG_BAO.map((d) => [dbId.get(d.ten), d]));
    const chetDan = []; // phiếu sẽ bị thử tới cùng rồi bỏ
    const cho = [];     // phiếu gửi thành công nhưng phải ghi SAU phần hỏng

    for (const v of daNhan) {
      const d = theoDuong.get(v.endpoint_id);
      if (!d) continue;
      if (d.ketCuc === "sent") {
        await c.query(`select webhook_ghi_ket_qua($1, true, null, 25, null)`, [v.delivery_id]);
      } else if (d.ketCuc === "hong-roi-song-lai") {
        // Hai phiếu đầu hỏng hẳn, phần còn lại gửi được ⇒ đường báo hiện đang
        // sống nhưng nhật ký vẫn giữ vết hỏng. Ghi phần HỎNG trước, vì một lần
        // gửi được là `webhook_ghi_ket_qua` đưa đếm hỏng liên tiếp về 0.
        if (chetDan.filter((x) => x.ep === v.endpoint_id).length < 2) {
          chetDan.push({ id: v.delivery_id, ep: v.endpoint_id });
          await c.query(`select webhook_ghi_ket_qua($1, false, $2, 25, now())`, [v.delivery_id, "khong_tra_duoc_ten_mien"]);
        } else {
          cho.push(v.delivery_id);
        }
      } else if (d.ketCuc === "hong-han") {
        if (chetDan.filter((x) => x.ep === v.endpoint_id).length < 2) {
          chetDan.push({ id: v.delivery_id, ep: v.endpoint_id });
          await c.query(`select webhook_ghi_ket_qua($1, false, $2, 25, now())`, [v.delivery_id, "khong_tra_duoc_ten_mien"]);
        } else {
          await c.query(`select webhook_ghi_ket_qua($1, true, null, 25, null)`, [v.delivery_id]);
        }
      }
    }

    // Thử lại tới khi sản phẩm tự bỏ. Số lần thử là số THẬT do `webhook_claim`
    // đếm, không phải số mình gõ vào cột.
    let vong = 0;
    for (;;) {
      const lai = await c.query(`select * from webhook_claim($1)`, [50]);
      if (lai.rows.length === 0) break;
      if (++vong > 40) throw new Error("Vòng thử lại không kết thúc — dừng để khỏi chạy vô hạn.");
      for (const v of lai.rows) {
        const het = v.attempts >= 25;
        await c.query(`select webhook_ghi_ket_qua($1, false, $2, $3, now())`,
          [v.delivery_id, "khong_tra_duoc_ten_mien", het ? 25 : 999]);
      }
    }
    for (const id of cho) await c.query(`select webhook_ghi_ket_qua($1, true, null, 25, null)`, [id]);

    // Trạng thái cuối cùng của từng đường báo (đây là CẤU HÌNH do chủ tiệm đặt,
    // không phải số sản phẩm tự tính).
    for (const d of DUONG_BAO) {
      await c.query(`update webhook_endpoints set status = $2 where id = $1`, [dbId.get(d.ten), d.cuoi]);
    }
    await c.query("commit");
    break;
  } catch (e) {
    await c.query("rollback");
    // 40001 = hai giao dịch giẫm chân nhau. Ảnh chụp cũ không dùng được nữa,
    // làm lại từ đầu với ảnh chụp mới.
    if (e.code === "40001" && lan < LAM_LAI) {
      ghi(`  Đụng độ ghi với việc khác (lần ${lan}) — làm lại.`);
      continue;
    }
    throw e;
  }
 }
}

const bcDuong = (await c.query(
  `select e.name, e.status, e.consecutive_failures, e.last_success_at is not null as tung_gui_duoc,
          count(d.id)::int tong,
          count(*) filter (where d.status = 'sent')::int da_gui,
          count(*) filter (where d.status = 'dead')::int da_bo,
          count(*) filter (where d.status = 'pending')::int dang_cho,
          coalesce(max(d.attempts), 0)::int thu_nhieu_nhat
     from webhook_endpoints e left join webhook_deliveries d on d.endpoint_id = e.id
    where e.tenant_id = $1 group by e.id, e.name, e.status, e.consecutive_failures, e.last_success_at
    order by e.name`, [TID])).rows;
for (const r of bcDuong) {
  ghi(`  ${r.status === "active" ? "đang bật " : "tạm dừng"} ${r.name}`);
  ghi(`      ${r.tong} phiếu — gửi được ${r.da_gui}, đã bỏ ${r.da_bo}, còn chờ ${r.dang_cho}; hỏng liên tiếp ${r.consecutive_failures}; thử nhiều nhất ${r.thu_nhieu_nhat} lần`);
}
ghi("");

// ══════════════════════════════════════════════════════════════════════════
// 3. TÍCH HỢP — sự kiện nhận về + khoá API
// ══════════════════════════════════════════════════════════════════════════
ghi("── Sự kiện nhận về & khoá API ────────────────────────────────────");
let sk = 0;
for (const s of SU_KIEN_NHAN) {
  const r = await c.query(
    `insert into webhook_events (tenant_id, provider, external_event_id, payload, received_at, processed_at, error)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (provider, external_event_id) do nothing returning id`,
    [TID, s.nha, s.ma, JSON.stringify(s.payload), s.ngay, s.xong ? s.ngay : null, s.loi ?? null]);
  if (r.rows.length) sk++;
}
ghi(`  Sự kiện nhận về: thêm ${sk} dòng`);

for (const k of KHOA_API) {
  const co = (await c.query(`select id from api_keys where tenant_id = $1 and name = $2`, [TID, k.ten])).rows[0];
  if (co) continue;
  // 32 byte ngẫu nhiên đặt THẲNG vào cột băm: không có chuỗi khoá nào tồn tại
  // để băm ra giá trị này, nên không ai gọi được API bằng khoá của tiệm mẫu.
  const bam = randomBytes(32).toString("hex");
  const r = await c.query(
    `insert into api_keys (tenant_id, name, key_hash, key_prefix, key_suffix, scopes, status, created_by, created_at)
     values ($1, $2, $3, $4, $5, $6, 'active', $7, $8) returning id`,
    [TID, k.ten, bam, "ifan_sk_" + randomBytes(3).toString("base64url").slice(0, 4),
     randomBytes(2).toString("base64url").slice(0, 3), k.quyen, uid(CHU), g(1, "09:00")]);
  // Số lượt gọi KHÔNG gõ tay — đi qua đúng RPC sản phẩm dùng để ghi mốc dùng.
  for (let i = 0; i < k.goi; i++) await c.query(`select api_key_touch($1)`, [r.rows[0].id]);
  if (k.thuHoi) {
    await c.query(`update api_keys set status = 'revoked', revoked_at = $2 where id = $1`, [r.rows[0].id, g(11, "16:20")]);
  }
}
const bcKhoa = (await c.query(
  `select name, status, scopes, call_count, last_used_at is not null as tung_dung
     from api_keys where tenant_id = $1 order by created_at`, [TID])).rows;
for (const r of bcKhoa) {
  ghi(`  ${r.status === "active" ? "còn dùng " : "đã thu hồi"} ${r.name} — quyền [${r.scopes.join(", ")}], đã gọi ${r.call_count} lượt`);
}
ghi("");

// ══════════════════════════════════════════════════════════════════════════
// 4. TIỆN ÍCH — tệp đính kèm, khung nhìn, cấu hình báo
// ══════════════════════════════════════════════════════════════════════════
ghi("── Tiện ích ──────────────────────────────────────────────────────");

// Tệp đính kèm: CHỈ nạp khi tải được tệp thật lên kho. Dòng đính kèm trỏ vào
// tệp không có là dữ liệu tự mâu thuẫn — thà không có còn hơn.
if (!SB_URL || !SERVICE) {
  nhan.push("Bỏ phần tệp đính kèm: thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nên không tải tệp thật lên kho được.");
  ghi("  Tệp đính kèm: BỎ QUA (thiếu khoá dịch vụ — xem ghi chú cuối)");
} else {
  const kho = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
  // Đính vào ĐÚNG những việc mà chat đang bàn — cùng bộ neo, nên tệp và cuộc
  // trao đổi luôn nói về một khách, không phải hai người khác nhau.
  const TEP = [
    VIEC.khachVip && { loai: "contact", ma: VIEC.khachVip, ten: "anh-vung-da-truoc-buoi-1.png", kieu: "image/png", than: PNG_1X1, boi: NHUNG, luc: g(2, "10:14") },
    VIEC.khachVip && { loai: "contact", ma: VIEC.khachVip, ten: "anh-vung-da-sau-buoi-3.png", kieu: "image/png", than: PNG_1X1, boi: NHUNG, luc: g(10, "11:02") },
    VIEC.khachLeTan && { loai: "contact", ma: VIEC.khachLeTan, ten: "phieu-tu-van-da.pdf", kieu: "application/pdf", than: PDF_TOI_GIAN, boi: THAO, luc: g(17, "09:40") },
    VIEC.donNhap && { loai: "order", ma: VIEC.donNhap, ten: "bao-gia-goi-lieu-trinh.pdf", kieu: "application/pdf", than: PDF_TOI_GIAN, boi: NGOC, luc: g(17, "17:18") },
    VIEC.lichVip && { loai: "appointment", ma: VIEC.lichVip, ten: "anh-vung-can-triet.png", kieu: "image/png", than: PNG_1X1, boi: NHUNG, luc: g(19, "13:10") },
  ].filter(Boolean);

  let themTep = 0, loiTep = 0;
  for (const f of TEP) {
    const duong = `${TID}/${f.loai}s/${f.ma}/${f.ten}`;
    const { error } = await kho.storage.from("tenant-files").upload(duong, f.than, { contentType: f.kieu, upsert: true });
    if (error) { loiTep++; nhan.push(`Không tải được tệp ${f.ten}: ${error.message}`); continue; }
    const r = await c.query(
      `insert into attachments (tenant_id, entity_type, entity_id, path, content_type, size_bytes, uploaded_by, created_at)
       select $1, $2, $3, $4, $5, $6, $7, $8
        where not exists (select 1 from attachments where tenant_id = $1 and path = $4)
       returning id`,
      [TID, f.loai, f.ma, duong, f.kieu, f.than.length, uid(f.boi), f.luc]);
    if (r.rows.length) themTep++;
  }
  ghi(`  Tệp đính kèm: ${TEP.length} tệp thật trong kho, thêm ${themTep} dòng${loiTep ? `, ${loiTep} tệp lỗi` : ""}`);
}

let themKn = 0;
for (const k of KHUNG_NHIN) {
  const nguoi = k.cua ? uid(k.cua) : null;
  const r = await c.query(
    `insert into saved_views (tenant_id, user_id, screen, name, query, vocab_version, position)
     select $1, $2, $3, $4, $5, 2, $6
      where not exists (
        select 1 from saved_views
         where tenant_id = $1 and screen = $3 and name = $4 and deleted_at is null
           and coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
     returning id`,
    [TID, nguoi, k.man, k.ten, k.loc, k.thuTu]);
  if (r.rows.length) themKn++;
}
ghi(`  Khung nhìn đã lưu: thêm ${themKn} bộ lọc`);

let themCh = 0;
for (const p of CAU_HINH_BAO) {
  const r = await c.query(
    `insert into notification_prefs (tenant_id, user_id, pref, updated_at)
     values ($1, $2, $3, $4) on conflict (tenant_id, user_id) do nothing returning user_id`,
    [TID, uid(p.ai), JSON.stringify(p.pref), g(5, "08:00")]);
  if (r.rows.length) themCh++;
}
ghi(`  Cấu hình nhận báo: thêm ${themCh} người\n`);

// ══════════════════════════════════════════════════════════════════════════
// 5. ĐẾM SAU
// ══════════════════════════════════════════════════════════════════════════
const sau = await dem(TID);
ghi("── Số dòng trước → sau ───────────────────────────────────────────");
inBang(truoc, sau);
ghi("");

// ══════════════════════════════════════════════════════════════════════════
// 6. ĐỐI CHỨNG QUYỀN RIÊNG TƯ — mạo danh thật, rồi rollback
// ══════════════════════════════════════════════════════════════════════════
// Không đặt claim `app_metadata` giả: chỉ đặt `sub`, để chính CSDL tự suy ra
// tiệm và vai từ `tenant_members`. Nếu đặt sẵn tenant_id vào claim thì phép thử
// đang tự trả lời câu hỏi của mình.
ghi("── Đối chứng: ai đọc được gì (mạo danh trong giao dịch rollback) ──");

const CAU_HOI = {
  luong_chat: `select count(*)::int n from internal_threads`,
  tin_chat: `select count(*)::int n from internal_messages`,
  goi_ten: `select count(*)::int n from internal_mentions`,
  khoa_api: `select count(*)::int n from api_keys`,
  duong_bao: `select count(*)::int n from webhook_endpoints`,
  phieu_gui: `select count(*)::int n from webhook_deliveries`,
  tep_dinh_kem: `select count(*)::int n from attachments`,
  cau_hinh_bao: `select count(*)::int n from notification_prefs`,
  khung_nhin: `select count(*)::int n from saved_views`,
};

const NGUOI_THU = [
  { ten: CHU, mo: "chủ tiệm", cho: { luong_chat: 6 } },
  { ten: NGOC, mo: "quản trị viên", cho: { luong_chat: 6 } },
  { ten: THAO, mo: "nhân viên lễ tân (phụ trách 1 lịch hẹn + 1 khách trong bộ này)", cho: { luong_chat: 2 } },
  { ten: "Bùi Thị Thu Hiền", mo: "nhân viên KTV, không phụ trách việc nào ở trên", cho: { luong_chat: 0, tin_chat: 0 } },
  { ten: "Khách xem thử", mo: "vai Chỉ xem", cho: { luong_chat: 5 } },
];

await c.query("begin");
let hongDoiChung = 0;
const thayGi = new Map();
try {
  for (const p of NGUOI_THU) {
    const u = uid(p.ten);
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: u, role: "authenticated" })]);
    await c.query(`set local role authenticated`);
    const ctx = (await c.query(`select current_tenant_id()::text tiem, app_role() vai`)).rows[0];
    const kq = {};
    for (const [k, q] of Object.entries(CAU_HOI)) kq[k] = (await c.query(q)).rows[0].n;
    await c.query(`reset role`);
    thayGi.set(p.ten, kq);

    ghi(`  ${p.ten} — ${p.mo} (vai ${ctx.vai}${ctx.tiem === TID ? "" : ", TIỆM KHÁC!"})`);
    ghi(`      luồng ${kq.luong_chat} · tin ${kq.tin_chat} · gọi tên ${kq.goi_ten} · khoá API ${kq.khoa_api} · đường báo ${kq.duong_bao} · phiếu gửi ${kq.phieu_gui} · đính kèm ${kq.tep_dinh_kem} · cấu hình báo ${kq.cau_hinh_bao} · khung nhìn ${kq.khung_nhin}`);
    for (const [k, v] of Object.entries(p.cho ?? {})) {
      if (kq[k] !== v) { ghi(`      ⚠ LỆCH: ${k} = ${kq[k]}, mong đợi ${v}`); hongDoiChung++; }
    }
  }

  // Người NGOÀI tiệm: chủ một tiệm khác, dùng đúng thẻ đăng nhập của họ.
  const ngoai = (await c.query(
    `select tm.user_id, p.display_name, t.slug from tenant_members tm
       join tenants t on t.id = tm.tenant_id
       join profiles p on p.user_id = tm.user_id
      where tm.tenant_id <> $1 and tm.status = 'active' and t.is_sample is not true
        and not exists (select 1 from tenant_members x where x.user_id = tm.user_id and x.tenant_id = $1)
      order by p.display_name limit 1`, [TID])).rows[0];
  if (!ngoai) {
    nhan.push("Không tìm được người ngoài tiệm để thử — phần đối chứng người ngoài bị bỏ.");
  } else {
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: ngoai.user_id, role: "authenticated" })]);
    await c.query(`set local role authenticated`);
    const ctx = (await c.query(`select current_tenant_id()::text tiem, app_role() vai`)).rows[0];
    const kq = {};
    for (const [k, q] of Object.entries(CAU_HOI)) kq[k] = (await c.query(q)).rows[0].n;
    // Hỏi thẳng: có đọc được dòng nào CỦA TIỆM MẪU không.
    const ro = (await c.query(
      `select (select count(*) from internal_messages where tenant_id = $1)
            + (select count(*) from internal_threads where tenant_id = $1)
            + (select count(*) from api_keys where tenant_id = $1)
            + (select count(*) from webhook_endpoints where tenant_id = $1)
            + (select count(*) from attachments where tenant_id = $1) as n`, [TID])).rows[0].n;
    await c.query(`reset role`);
    ghi(`  ${ngoai.display_name} — NGƯỜI NGOÀI (tiệm ${ngoai.slug}, vai ${ctx.vai})`);
    ghi(`      thấy trong tiệm của họ: luồng ${kq.luong_chat} · tin ${kq.tin_chat} · khoá API ${kq.khoa_api} · đính kèm ${kq.tep_dinh_kem}`);
    ghi(`      đọc được của TIỆM MẪU: ${ro} dòng`);
    if (Number(ro) !== 0) { ghi(`      ⚠ RÒ THẬT: người ngoài đọc được dữ liệu tiệm mẫu!`); hongDoiChung++; }
  }
  // ── Một chỗ KHÔNG khớp với nếp của chat nội bộ, và nó không phải do file này ──
  // Chat nội bộ thừa hưởng quyền đọc của TỪNG DÒNG việc (bạn KTV ở trên đọc
  // được 0 luồng vì không phụ trách việc nào). Nhưng `attachments_select` chỉ
  // so `tenant_id`, không hỏi lại quyền của hồ sơ mà tệp đính vào — và policy
  // của kho tệp (`storage.objects` bucket `tenant-files`) cũng chỉ so thư mục
  // đầu là mã tiệm. Nên cùng một người đọc 0 luồng chat lại liệt kê và TẢI VỀ
  // được mọi tệp của tiệm, kể cả ảnh gắn vào hồ sơ khách mà họ không được xem.
  const khtn = thayGi.get("Bùi Thị Thu Hiền");
  if (khtn && khtn.tep_dinh_kem > 0 && khtn.luong_chat === 0) {
    ghi(`  ⚠ ĐÁNG CHÚ Ý (không phải lỗi của lần nạp này): "Bùi Thị Thu Hiền" đọc 0 luồng chat`);
    ghi(`      nhưng vẫn thấy ${khtn.tep_dinh_kem} tệp đính kèm của cả tiệm — attachments/storage`);
    ghi(`      chỉ chặn theo TIỆM, không thừa hưởng quyền của hồ sơ mà tệp đính vào.`);
    nhan.push("Đo được: `attachments` + kho tệp `tenant-files` chỉ chặn theo tiệm, KHÔNG theo từng hồ sơ. Nhân viên không xem được hồ sơ khách vẫn liệt kê và tải được tệp đính vào hồ sơ đó. Chat nội bộ thì chặn đúng theo từng dòng — hai chỗ đang lệch nếp nhau.");
  }
} finally {
  await c.query("rollback");
}
ghi(`  ⇒ ${hongDoiChung === 0 ? "khớp hết, không có chỗ nào đọc quá phần của mình" : hongDoiChung + " chỗ LỆCH — đọc kỹ ở trên"}\n`);

if (nhan.length) {
  ghi("── Ghi chú / chỗ không làm được ──────────────────────────────────");
  for (const n of nhan) ghi(`  • ${n}`);
}

await c.end();
process.exit(hongDoiChung === 0 ? 0 : 2);
