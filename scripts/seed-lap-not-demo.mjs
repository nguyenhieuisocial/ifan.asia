#!/usr/bin/env node
/**
 * LẤP NỐT CÁC BẢNG CÒN TRỐNG CỦA TIỆM MẪU — VÀ CHỪA LẠI NHỮNG BẢNG PHẢI TRỐNG.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * Đo ngày 20/08: tiệm `demo-spa-huong-sen` đã có 106/122 bảng có dữ liệu —
 * 776 khách, 4.008 lịch hẹn, 3.193 đơn, 21 nhân sự, voucher, tích điểm, chiến
 * dịch, hợp đồng liệu trình, kiểm kho, chat nội bộ, webhook. Còn 16 bảng trống.
 *
 * "Trống" KHÔNG tự nó là lỗi. Có bảng trống vì tính năng chưa demo được (thiệt
 * hại thật: người xem thử tưởng sản phẩm chưa làm), có bảng trống vì ĐÚNG RA
 * PHẢI TRỐNG (nạp vào là bịa ra một chuyện chưa từng xảy ra). Nạp bừa cho đủ
 * số là làm HỎNG dữ liệu mẫu, không phải làm đầy nó.
 *
 * Nên file này bắt đầu bằng một bảng phán đoán, không bằng một danh sách insert.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHÁN ĐOÁN TỪNG BẢNG (16/16) — đã tra `pg_proc`, `pg_trigger`, `pg_policies`,
 * `information_schema.columns`, `pg_constraint` và mã app trước khi kết luận.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NHÓM A · ĐÚNG RA PHẢI TRỐNG (7 bảng — KHÔNG nạp) ───────────────────────
 *
 * 1) `admin_audit_logs` — nhật ký TẦNG NỀN TẢNG, không thuộc tiệm nào.
 *    Đo: bảng đang có 21 dòng, TẤT CẢ đều `tenant_id = null`, người ghi là tài
 *    khoản quản trị nền tảng, và chỉ các RPC `admin_*` ghi vào (xem
 *    `admin_platform_overview`, `admin_tenant_health`, `admin_record_payment`).
 *    Nó ghi lại việc NHÂN VIÊN IFAN đã xem gì — không phải việc của Spa Hương
 *    Sen. Nạp vào = bịa ra một hành vi của người iFan chưa từng làm.
 *
 * 2) `bot_outbox` — HÀNG ĐỢI GỬI, dùng xong là hết.
 *    `bot_claim_outbox()` nhận việc, `bot_complete_outbox()` đóng việc và xoá
 *    dần. Trạng thái đứng yên duy nhất của hàng đợi khoẻ mạnh là RỖNG. Ngoài
 *    ra mọi dòng đều phải trỏ tới một `notification_channels` — mà bảng đó
 *    thuộc nhóm CẤM ở dưới.
 *
 * 3) `link_codes` — mã ghép máy dùng một lần, có `expires_at`.
 *    `bot_create_link_code()` sinh, `bot_link_via_code()` tiêu huỷ ngay khi
 *    dùng. Một mã còn nằm đó nghĩa là "đang chờ ai đó bấm trong vài phút tới".
 *    Đó là trạng thái tạm, không phải dữ liệu mẫu. Cũng cần channel như trên.
 *
 * 4) `support_sessions` — CỬA SỔ NHÂN VIÊN IFAN VÀO XEM DỮ LIỆU TIỆM.
 *    Lược đồ nói rõ: `admin_user_id`, `reason`, `expires_at`, `ended_by`, và có
 *    `support_sessions_sweep_expired()` tự quét dọn. Nạp một dòng ở đây =
 *    dựng một bằng chứng SAI rằng người iFan đã mở dữ liệu của tiệm này vì lý
 *    do X vào lúc Y. Đây là loại dữ liệu tuyệt đối không được bịa: nó là bản
 *    ghi trách nhiệm, không phải minh hoạ.
 *
 * 5) `subscription_invoices` — tiệm đang DÙNG THỬ.
 *    Đo `subscriptions`: `status = 'trialing'`, `trial_ends_at = 03/09/2026`.
 *    Chưa hết thử thì chưa có hoá đơn nào được phát. Đúng.
 *
 * 6) `subscription_payments` — không có hoá đơn thì không có lần trả nào.
 *    `record_subscription_payment()` bắt buộc đi từ một `invoice_number` có
 *    thật. Hệ quả của (5).
 *
 * 7) `subscription_lifecycle_log` — ĐÂY LÀ CÁI NGUY HIỂM NHẤT, và lý do "chưa
 *    phát sinh" còn CHƯA ĐỦ MẠNH. Bảng này KHÔNG phải nhật ký để đọc: nó là
 *    CHỐT CHỐNG GỬI TRÙNG của `billing_log_once(tenant, sub, kind, cycle_key)`.
 *    CHECK cho phép: trial_ending_3d / trial_ending_1d / trial_ended / past_due
 *    / suspended / activated / plan_changed / canceled.
 *    Hôm nay 20/08, thử việc hết 03/09 → mốc "còn 3 ngày" rơi vào 31/08.
 *    Nếu bây giờ mình ghi sẵn `trial_ending_3d`, thì đến 31/08 nhịp tính tiền
 *    nhìn thấy "đã báo rồi" và IM LẶNG — tiệm mẫu sẽ KHÔNG BAO GIỜ nhận được
 *    lời nhắc thật. Nạp vào đây không phải là làm đẹp dữ liệu, mà là TẮT một
 *    tính năng đang chạy.
 *
 * ── NHÓM B · CẤM NẠP (3 bảng) ──────────────────────────────────────────────
 *
 * 8)  `notification_channels` — muốn có dòng ở đây phải có MÃ ĐĂNG NHẬP BOT
 *     (token Telegram/Zalo) thật, cất trong kho bí mật. Dựng token giả để lấp
 *     bảng là gieo một bí mật rác vào hệ thống. Không làm.
 * 9)  `staff_channel_links` — dòng ở đây là "nhân viên A đã ghép máy với chat
 *     B". Không có channel thì cái ghép nối trỏ vào hư không. Không làm.
 * 10) `channel_quota` — SỐ SẢN PHẨM TỰ CỘNG, không phải số gõ tay.
 *     `bot_complete_outbox()` mới là chỗ tăng `sent_count` mỗi lần gửi thành
 *     công. Gõ tay vào đây là dựng bộ số thứ hai đá nhau với bộ số thật —
 *     đúng lớp bệnh nặng nhất kho này từng có (việc #18). Không làm.
 *
 * ── NHÓM C · ĐÁNG NẠP (6 bảng — file này làm) ──────────────────────────────
 *
 * 11) `storefront_lead_submissions` · qua RPC `storefront_submit_lead()`
 * 12) `invitations`                 · chèn thẳng (ĐÚNG đường của app)
 * 13) `merge_logs`                  · qua RPC `merge_contacts()`
 * 14) `contact_merge_dismissals`    · qua RPC `dismiss_duplicate_pair()`
 * 15) `tenant_pack_overrides`       · upsert (ĐÚNG đường của app)
 * 16) `quick_reply_usages`          · qua RPC `quick_reply_mark_used()`
 *
 * ⚠️ Cái thứ 16 KHÔNG nằm trong phân loại được giao — nó bị bỏ sót. Phán đoán
 * của file này: ĐÁNG NẠP. Lý do: `app/app/settings/replies/page.tsx` gọi
 * `quick_reply_used_counts(30 ngày)` và in "dùng n lần trong 30 ngày" cạnh
 * từng câu, để chủ tiệm biết câu nào đáng giữ. Bảng trống ⇒ cả 6 câu đều hiện
 * 0 ⇒ đúng cái cột mà tính năng sinh ra để phục vụ lại là cột chết.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI ĐI QUA RPC, KHÔNG CHÈN THẲNG
 * ═══════════════════════════════════════════════════════════════════════════
 * `merge_logs` chỉ có MỘT chỗ ghi: `merge_contacts()`. Hàm đó không chỉ ghi
 * nhật ký — nó chuyển deal/việc/hội thoại/định danh/thẻ sang hồ sơ giữ lại,
 * cộng doanh thu, CHẤM LẠI điểm khách, xoá mềm hồ sơ thua, dọn các cặp gợi ý
 * liên quan, rồi `wf_emit('contact.merged')`. Chèn thẳng một dòng `merge_logs`
 * sẽ tạo ra một "lần gộp" mà hai hồ sơ vẫn còn nguyên hai bên — nhật ký nói
 * một đằng, dữ liệu nói một nẻo.
 *
 * `storefront_lead_submissions` cũng vậy: `storefront_submit_lead()` là nơi
 * tạo/khớp hồ sơ khách, gắn nguồn từ mã QR, giao việc cho chủ tiệm, và ba tầng
 * chống lụt. Chèn thẳng = có nhật ký nhận khách mà KHÔNG có khách.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÁCH ĐỂ LẠI THÔNG TIN CHỈ TRẢI TRONG ~2 NGÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * Đã đo `tenant_storefront.created_at` = 18/08/2026 — TRANG MẶT TIỀN CỦA TIỆM
 * NÀY MỚI BẬT ĐƯỢC HAI HÔM. Rải khách để lại thông tin về trước ngày đó là
 * dựng một chuyện không thể xảy ra: form chưa tồn tại thì không ai điền được.
 * Nên mọi lượt gửi nằm gọn giữa "lúc bật form" và "một tiếng rưỡi trước".
 * Câu chuyện đọc ra được từ dữ liệu: *mới bật trang, hai hôm đã có 9 khách*.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO GỘP HAI HỒ SƠ NÀY MÀ BỎ QUA MƯỜI BẢY CẶP KIA
 * ═══════════════════════════════════════════════════════════════════════════
 * Tiệm đang có 19 cặp nghi trùng, TẤT CẢ đều là kiểu khớp yếu nhất: trùng TÊN
 * đã bỏ dấu + cùng nguồn (`contact_duplicate_base` chấm 70/100). Trùng SĐT: 0
 * cặp. Trùng email: 0 cặp. Mà trùng tên ở Việt Nam là chuyện thường — "Hồ
 * Thanh Tâm" hai người là hai người thật, gộp lại là XOÁ MẤT MỘT KHÁCH.
 *
 * Nên file này chỉ gộp hai cặp mà bên thua là HỒ SƠ RỖNG đúng nghĩa: 0 đồng
 * doanh thu, 0 lịch hẹn, 0 đơn — tức bản ghi lỡ tạo rồi bỏ đó, đúng thứ mà
 * lễ tân gộp trong đời thật. Bốn cặp còn lại được BỎ QUA (`dismiss`) vì cả hai
 * bên đều có SĐT riêng, lịch hẹn riêng, đơn riêng — hai người khác nhau, và
 * "đừng hỏi lại nữa" mới là câu trả lời đúng. Mười ba cặp còn lại giữ nguyên
 * trên màn để người xem thử vẫn thấy màn Trùng lặp có việc để làm.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẠY LẠI KHÔNG NHÂN ĐÔI — NEO Ở ĐÂU
 * ═══════════════════════════════════════════════════════════════════════════
 *   • lượt gửi form  → `token_hash` cố định, có rồi thì bỏ qua
 *   • lời mời        → (tiệm, email, status='pending') — đúng chốt của app
 *   • gộp hồ sơ      → `merge_contacts` tự trả 'noop' khi cặp đã gộp
 *   • bỏ qua cặp     → khoá chính (tiệm, a, b) + `on conflict do nothing`
 *   • từ vựng riêng  → khoá chính là `tenant_id`, upsert
 *   • lượt dùng câu  → bảng không có khoá tự nhiên ⇒ neo bằng "tiệm này đã có
 *                      dòng nào chưa"; có rồi thì bỏ qua CẢ KHỐI
 *
 * ⚠️ CHỈ ghi vào tiệm `is_sample = true` — chốt kiểm ngay đầu, sai thì dừng hẳn.
 *
 * Chạy:
 *   node --env-file=.env.local scripts/seed-lap-not-demo.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

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

const bam = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const ghi = (s) => console.log(s);

// 16 bảng đang trống, theo đúng thứ tự phán đoán ở đầu file.
const BANG_16 = [
  // nhóm A — đúng ra phải trống
  "admin_audit_logs", "bot_outbox", "link_codes", "support_sessions",
  "subscription_invoices", "subscription_payments", "subscription_lifecycle_log",
  // nhóm B — cấm nạp
  "notification_channels", "staff_channel_links", "channel_quota",
  // nhóm C — nạp
  "storefront_lead_submissions", "invitations", "merge_logs",
  "contact_merge_dismissals", "tenant_pack_overrides", "quick_reply_usages",
];
// Đã đo: cả 16 bảng đều CÓ cột `tenant_id` ⇒ đếm được theo tiệm, không phải đếm cả hệ thống.

// Bảng KÉO THEO — không nạp trực tiếp dòng nào, dùng để chứng minh phần tăng
// thêm là do SẢN PHẨM tự sinh trong lúc chạy RPC, không phải do mình chèn.
const BANG_KEO_THEO = [
  "contacts", "activities", "record_audit", "domain_events", "webhook_deliveries",
];

// ══════════════════════════════════════════════════════════════════════════
// NỘI DUNG — chín lượt khách để lại thông tin từ trang mặt tiền
// ══════════════════════════════════════════════════════════════════════════
// `sdt` của ba lượt cuối là SĐT khách ĐÃ CÓ trong tiệm ⇒ RPC sẽ khớp vào hồ sơ
// cũ (`matched_existing = true`) thay vì đẻ hồ sơ trùng. Đó là nhánh quan
// trọng nhất của tính năng và cũng là nhánh không ai nhìn thấy khi bảng trống.
//
// `qr` là mã QR THẬT của tiệm (`qr_codes`, đang bật) — khách quét tờ rơi/mã ở
// quầy rồi điền form. RPC lấy `source_id` từ mã đó, nên hồ sơ mới sẽ mang
// nguồn "Tại tiệm" thay vì "Form/Landing". Chỉ áp cho khách MỚI: hàm cố ý
// không đụng nguồn của khách cũ.
const KHACH = [
  { ten: "Nguyễn Thị Mỹ Duyên", sdt: "0918447203", qr: null,
    tra: { service_interest: "Chăm sóc da", preferred_time: "Chiều (14:00–18:00)", referral_source: "Facebook" } },
  { ten: "Trần Ngọc Bảo Hân", sdt: "0977512864", qr: "quaylet4n1",
    tra: { service_interest: "Gói liệu trình", preferred_time: "Tối (18:00–21:00)", referral_source: "Bạn bè giới thiệu" } },
  { ten: "Lê Thị Kim Ngân", sdt: "0903318572", qr: null,
    // Khách bỏ trống "biết tiệm qua đâu" — form thật luôn có người bỏ trống,
    // và RPC bỏ qua field rỗng chứ không ghi chuỗi trắng vào hồ sơ.
    tra: { service_interest: "Triệt lông", preferred_time: "Sáng (8:00–12:00)" } },
  { ten: "Phạm Hoàng Anh Thư", sdt: "0868245119", qr: null,
    tra: { service_interest: "Massage trị liệu", preferred_time: "Trưa (12:00–14:00)", referral_source: "Google" } },
  { ten: "Võ Thị Thu Sương", sdt: "0932604877", qr: "toroicc8vn",
    tra: { service_interest: "Chăm sóc da", preferred_time: "Chiều (14:00–18:00)", referral_source: "Đi ngang qua" } },
  { ten: "Đặng Minh Quân", sdt: "0389117420", qr: null,
    tra: { service_interest: "Massage trị liệu", preferred_time: "Tối (18:00–21:00)", referral_source: "TikTok" } },
  // ── ba lượt dưới là KHÁCH CŨ gửi lại form (khớp theo SĐT) ────────────────
  { ten: "Lê Gia Tuyền", sdt: "0931329997", qr: null,
    tra: { service_interest: "Gói liệu trình", preferred_time: "Sáng (8:00–12:00)", referral_source: "Bạn bè giới thiệu" } },
  { ten: "Đặng Hữu Phúc", sdt: "0932280277", qr: null,
    tra: { service_interest: "Massage trị liệu", preferred_time: "Tối (18:00–21:00)" } },
  { ten: "Huỳnh Mỹ Trang", sdt: "0944188756", qr: "quaylet4n1",
    tra: { service_interest: "Chăm sóc da", preferred_time: "Chiều (14:00–18:00)", referral_source: "Facebook" } },
];

// Ba lời mời còn treo. Tên miền `.local` do RFC 6762 giữ riêng cho mạng nội bộ
// — thư gửi tới đó KHÔNG BAO GIỜ ra được Internet, nên không có nguy cơ một
// người thật nhận được lời mời vào tiệm demo. Cùng lối đặt tên với các tài
// khoản nhân viên sẵn có của tiệm này (`…@staff.ifan.local`).
const LOI_MOI = [
  { email: "tran.my.linh@demo.ifan.local", vai: "staff", nguoiMoi: "Chủ tiệm Demo", truocMayNgay: 5,
    viec: "KTV mới phỏng vấn xong, hẹn đầu tuần sau vào làm" },
  { email: "nguyen.thu.hang@demo.ifan.local", vai: "staff", nguoiMoi: "Nguyễn Thị Bích Ngọc", truocMayNgay: 3,
    viec: "Lễ tân ca tối, đang chờ nhận lời mời" },
  { email: "ke.toan.thu.van@demo.ifan.local", vai: "viewer", nguoiMoi: "Chủ tiệm Demo", truocMayNgay: 1,
    viec: "Kế toán ngoài — chỉ cần xem báo cáo, không sửa gì" },
];

// Hai cặp GỘP.
// ⚠️ Neo bằng UUID chứ KHÔNG bằng SĐT — đây là chỗ duy nhất trong file phải
// làm vậy, và lý do là chuyện chạy lần hai: cặp "Mai Bảo My" lấy SĐT của bản
// bỏ (`phone: 'loser'`), nên NGAY SAU lần chạy đầu, số 0843515641 không còn
// thuộc về hồ sơ nào đang sống. Tra theo SĐT ở lần chạy thứ hai sẽ ra 0 dòng
// và script tự dừng vì tưởng dữ liệu hỏng. UUID thì không đổi.
// Bù lại phần an toàn đã mất: mỗi UUID được đối chiếu TÊN + SĐT mong đợi
// trước khi gộp, sai một cái là dừng.
const GOP = [
  { ten: "Hoàng Tuyết Trinh",
    giu: { id: "73b877df-bf54-585e-87fe-b3f69d613d9e", sdt: "0324291703" },
    bo:  { id: "9bca1479-f6e8-54cf-b596-7271b1cf1b55", sdt: "0386619889" },
    layCua: {},
    viec: "Bản bỏ tạo 04/08 rồi để đó — 0 lịch hẹn, 0 đơn, 0 đồng. Giữ nguyên mọi thứ của bản chính." },
  { ten: "Mai Bảo My",
    giu: { id: "b5de6ef1-6699-5586-bb9c-82fdcba021f1", sdt: "0843515641" },
    bo:  { id: "7861d78c-2355-5e11-ae2a-0157a2fda91c", sdt: "0916643646" },
    layCua: { phone: "loser" },
    viec: "Khách đổi số: bản bỏ tạo 19/08 mang SỐ MỚI, bản giữ tạo 07/08 mang lịch sử. Giữ lịch sử, lấy số mới." },
];

// Bốn cặp BỎ QUA: cả hai bên đều có SĐT riêng + lịch hẹn riêng + đơn riêng.
const BO_QUA = [
  { ten: "Hồ Thanh Tâm",     a: "0902074383", b: "0824830195" },
  { ten: "Nguyễn Tuyết Như", a: "0365653771", b: "0962486171" },
  { ten: "Mai Hồng Anh",     a: "0963816563", b: "0845036089" },
  { ten: "Phan Minh Anh",    a: "0331638838", b: "0811971436" },
];

// Từ vựng riêng của tiệm. Pack `spa` mặc định: khách / lịch-liệu trình / đã làm
// dịch vụ. Hương Sen bán theo gói nên gọi khác đi.
// ⚠️ `tenant_pack_view()` trộn bằng `||` — đè ở TẦNG TRÊN CÙNG, không trộn sâu.
// Nên phải ghi ĐỦ BA TỪ, thiếu một từ là màn hình mất nhãn (đúng cảnh báo đã
// ghi sẵn trong `app/app/settings/industry/actions.ts`).
const TU_VUNG = { contact: "khách hàng", deal: "gói liệu trình", deal_won: "đã chốt gói" };

// Lượt dùng câu trả lời nhanh. Trọng số theo đời thật của một tiệm spa: câu
// chào khách mới bấm nhiều nhất, câu nhắc buổi tiếp theo trong gói ít nhất.
// `nguoi` là display_name — tra sang user_id lúc chạy.
const LUOT_DUNG = [
  { cau: "Chào khách mới",                  luot: 11, nguoi: ["Bạn Thảo (lễ tân)", "Nguyễn Thị Bích Ngọc"] },
  { cau: "Báo lịch trống",                  luot: 8,  nguoi: ["Bạn Thảo (lễ tân)", "Trần Thị Kim Anh"] },
  { cau: "Nhắc lịch hẹn",                   luot: 7,  nguoi: ["Bạn Thảo (lễ tân)"] },
  { cau: "Báo giá dịch vụ",                 luot: 5,  nguoi: ["Nguyễn Thị Bích Ngọc", "Bạn Thảo (lễ tân)"] },
  { cau: "Hỏi thăm sau buổi làm",           luot: 3,  nguoi: ["Trần Thị Kim Anh"] },
  { cau: "Nhắc buổi tiếp theo trong gói",   luot: 2,  nguoi: ["Nguyễn Thị Bích Ngọc"] },
];

// ══════════════════════════════════════════════════════════════════════════
await c.connect();
await c.query(`set lock_timeout = '10s'`);

// ── CHỐT KIỂM: chỉ tiệm mẫu ────────────────────────────────────────────────
const t = (await c.query(
  `select id, slug, name, is_sample from tenants where slug = $1`, [SLUG])).rows[0];
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

// ── Người trong tiệm ───────────────────────────────────────────────────────
const nguoi = new Map(
  (await c.query(
    `select tm.user_id, tm.role, p.display_name
       from tenant_members tm join profiles p on p.user_id = tm.user_id
      where tm.tenant_id = $1 and tm.status = 'active'`, [TID])).rows
    .map((r) => [r.display_name, r]));
const ai = (ten) => {
  const r = nguoi.get(ten);
  if (!r) throw new Error(`Không tìm thấy người "${ten}" trong tiệm — dữ liệu nhân sự đã đổi, dừng lại thay vì đoán.`);
  return r.user_id;
};

// ── Đếm ────────────────────────────────────────────────────────────────────
async function dem(danhSach) {
  const r = {};
  for (const b of danhSach) {
    try {
      r[b] = (await c.query(`select count(*)::int n from public.${b} where tenant_id = $1`, [TID])).rows[0].n;
    } catch {
      r[b] = null; // bảng không còn / không có tenant_id — báo là "không đo được", không đoán 0
    }
  }
  return r;
}
function inBang(tieuDe, truoc, sau) {
  ghi(tieuDe);
  for (const k of Object.keys(truoc)) {
    const a = truoc[k], b = sau[k];
    const d = a === null || b === null ? "?" : b - a;
    const dau = d === "?" ? "  ?" : d > 0 ? `+${d}` : `${d}`;
    ghi(`   ${k.padEnd(30)} ${String(a ?? "?").padStart(6)} → ${String(b ?? "?").padStart(6)}   ${dau}`);
  }
  ghi("");
}

// ── Đóng vai ───────────────────────────────────────────────────────────────
// `set_config(..., true)` là SET LOCAL — bắt buộc nằm trong transaction, ngoài
// transaction Postgres chỉ cảnh báo rồi bỏ qua (và mình sẽ ghi bằng quyền
// postgres mà tưởng là đang ghi bằng quyền người dùng).
async function trongGiaoDich(fn) {
  await c.query("begin");
  try {
    const r = await fn();
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
async function vai(userId) {
  await c.query(
    `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
    [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: { tenant_id: TID } })]);
}
async function vaiKhachVangLai() {
  // Trang mặt tiền là trang CÔNG KHAI — người điền form không đăng nhập.
  await c.query(`select set_config('request.jwt.claims', '{}', true), set_config('role', 'anon', true)`);
}
async function thoiVai() {
  await c.query(`select set_config('role', 'postgres', true), set_config('request.jwt.claims', '{}', true)`);
}

// ── Tra hồ sơ khách theo SĐT (một và chỉ một) ──────────────────────────────
async function hoSoTheoSdt(sdt, tenMongDoi) {
  const rows = (await c.query(
    `select id, full_name, phone, created_at, total_revenue
       from contacts
      where tenant_id = $1 and phone = $2 and deleted_at is null and merged_into_id is null`,
    [TID, sdt])).rows;
  if (rows.length !== 1) {
    throw new Error(`SĐT ${sdt} khớp ${rows.length} hồ sơ (cần đúng 1) — dữ liệu khách đã đổi, dừng lại.`);
  }
  if (tenMongDoi && rows[0].full_name !== tenMongDoi) {
    throw new Error(`SĐT ${sdt} là của "${rows[0].full_name}", không phải "${tenMongDoi}" — dừng lại.`);
  }
  return rows[0];
}

// Tra hồ sơ theo UUID — KHÔNG lọc xoá mềm/đã gộp, vì đây chính là thứ cần đọc
// để biết lần chạy trước đã gộp hay chưa.
async function hoSoTheoId(id, tenMongDoi) {
  const r = (await c.query(
    `select id, full_name, phone, total_revenue, deleted_at, merged_into_id
       from contacts where id = $1 and tenant_id = $2`, [id, TID])).rows[0];
  if (!r) throw new Error(`Không có hồ sơ ${id} trong tiệm này — dừng lại.`);
  if (tenMongDoi && r.full_name !== tenMongDoi) {
    throw new Error(`Hồ sơ ${id} tên là "${r.full_name}", không phải "${tenMongDoi}" — dừng lại.`);
  }
  return r;
}

const truoc16 = await dem(BANG_16);
const truocKeo = await dem(BANG_KEO_THEO);
const viecDaLam = [];

// ══════════════════════════════════════════════════════════════════════════
// 11 · storefront_lead_submissions — chín lượt khách để lại thông tin
// ══════════════════════════════════════════════════════════════════════════
{
  const sf = (await c.query(
    `select storefront_enabled, lead_form_enabled, lead_form_fields, created_at
       from tenant_storefront where tenant_id = $1`, [TID])).rows[0];
  if (!sf || !sf.storefront_enabled || !sf.lead_form_enabled) {
    ghi("storefront_lead_submissions: BỎ QUA — tiệm đang TẮT trang mặt tiền hoặc tắt form nhận khách.");
    ghi("  (Không tự bật hộ: bật trang công khai của một tiệm là quyết định của tiệm, không phải của script nạp dữ liệu.)\n");
  } else {
    // ── Giờ gửi: LƯỚI GIỜ BAN NGÀY, neo vào lúc form được bật ──────────────
    // Hai ràng buộc, cái nào cũng bỏ được là ra dữ liệu sai:
    //
    //  (1) Không lượt nào sớm hơn lúc form được bật — form chưa có thì không
    //      ai điền được.
    //  (2) Không lượt nào rơi vào 0h–6h sáng. Bản nháp đầu rải đều theo giờ
    //      đồng hồ và đẩy 4/9 lượt vào đêm khuya, kéo theo 4 việc "gọi lại
    //      khách" hẹn lúc 2 giờ sáng. Khách spa không điền form giờ đó, và
    //      danh sách việc trông như máy sinh ra.
    //
    // Lưới neo vào `tenant_storefront.created_at` (bất biến) chứ KHÔNG vào
    // `now()`, nên chạy lại bao nhiêu lần cũng ra đúng những mốc đó — chạy lần
    // hai không xê dịch dữ liệu.
    const batDau = new Date(new Date(sf.created_at).getTime() + 90 * 60_000);
    const ketThuc = new Date(Date.now() - 90 * 60_000);
    if (ketThuc <= batDau) throw new Error("Cửa sổ thời gian của trang mặt tiền quá hẹp — không rải được lượt gửi.");

    const VN_LECH = 7 * 3_600_000;                       // giờ VN = UTC+7, không có giờ mùa hè
    const GIO = [8.67, 10.25, 11.83, 13.42, 15, 16.58, 18.17, 19.75, 21.33]; // 8h40 → 21h20
    const oNgay = (ms) => Math.floor((ms + VN_LECH) / 86_400_000) * 86_400_000 - VN_LECH; // 0h VN
    const mocGui = [];
    for (let d = 0; d < 30 && mocGui.length < KHACH.length; d += 1) {
      const nuaDem = oNgay(batDau.getTime()) + d * 86_400_000;
      for (const h of GIO) {
        const ms = nuaDem + h * 3_600_000;
        if (ms > batDau.getTime() && ms <= ketThuc.getTime() && mocGui.length < KHACH.length) {
          mocGui.push(new Date(ms));
        }
      }
    }
    if (mocGui.length < KHACH.length) {
      ghi(`  ⚠️ Trang mặt tiền mới bật ${((Date.now() - new Date(sf.created_at)) / 3_600_000).toFixed(1)} giờ — chỉ đủ chỗ cho ${mocGui.length}/${KHACH.length} lượt trong khung giờ ban ngày. Nạp ${mocGui.length} lượt.`);
    }

    // Dời mốc thời gian của ĐÚNG những hàng sản phẩm vừa sinh. Không chèn hàng
    // nào ở đây — `now()` trong RPC là giờ chạy script, mà chuyện này xảy ra
    // rải trong mấy hôm qua. Chạy lại thì gọi lại đúng hàm này với đúng mốc
    // của lưới, nên dữ liệu HỘI TỤ về một trạng thái chứ không trôi đi.
    // `mocTruoc` = `last_interaction_at` của hồ sơ ĐỌC TRƯỚC khi gọi RPC, và
    // chỉ có ở lần tạo. Cần nó vì RPC đã dí mốc đó về `now()` rồi: với KHÁCH
    // CŨ, `greatest(mốc_hiện_tại, luc)` sẽ luôn ra `now()` — tức giữ nguyên
    // đúng cái vết mà mình cần xoá. Còn ở lần chạy sau thì không cần: mốc
    // trong CSDL lúc đó đã là mốc thật.
    async function chuanMoc(tokenHash, luc, vuaTao, mocTruoc) {
      const s = (await c.query(
        `select contact_id, matched_existing, created_at from storefront_lead_submissions
          where tenant_id = $1 and token_hash = $2`, [TID, tokenHash])).rows[0];
      if (!s?.contact_id) return;
      const mocDangLuu = s.created_at; // mốc đang lưu — có thể là mốc của lưới cũ
      await c.query(
        `update storefront_lead_submissions set created_at = $3
          where tenant_id = $1 and token_hash = $2 and created_at <> $3`, [TID, tokenHash, luc]);

      // Việc do RPC giao cho chủ tiệm — lùi cả hạn lẫn ngày tạo.
      // (`activities_touch_contact` chỉ chạy khi INSERT, nên sửa việc không kéo
      //  `last_interaction_at` của khách về hiện tại.)
      await c.query(
        `update activities set due_at = $2, created_at = $2
          where tenant_id = $1 and contact_id = $3
            and subject in ('Khách mới để lại thông tin qua form mặt tiền',
                            'Khách cũ quay lại qua form mặt tiền')
            and due_at is distinct from $2::timestamptz`, [TID, luc, s.contact_id]);

      if (!s.matched_existing) {
        // Hồ sơ SINH RA từ chính lượt gửi này — ngày tạo phải là lúc gửi.
        await c.query(`update contacts set created_at = $2 where id = $1 and created_at <> $2`,
          [s.contact_id, luc]);
      }

      if (!vuaTao) {
        // Chạy lại. Hồ sơ SINH RA từ form mà mốc tương tác vẫn đúng bằng mốc
        // lượt gửi cũ ⇒ chưa có gì khác đụng vào ⇒ dời theo lưới mới (kể cả
        // dời SỚM lại). Ngược lại thì chỉ DÂNG LÊN, không kéo lùi hồ sơ đã có
        // tương tác thật muộn hơn.
        if (!s.matched_existing) {
          await c.query(
            `update contacts set last_interaction_at = $2::timestamptz
              where id = $1 and last_interaction_at <= $3::timestamptz`,
            [s.contact_id, luc, mocDangLuu]);
        }
        await c.query(
          `update contacts set last_interaction_at = $2::timestamptz
            where id = $1 and last_interaction_at < $2::timestamptz`, [s.contact_id, luc]);
      } else if (!s.matched_existing) {
        await c.query(`update contacts set last_interaction_at = $2 where id = $1`, [s.contact_id, luc]);
      } else {
        // Khách CŨ vừa gửi form: trả mốc về giá trị thật trước lời gọi, rồi
        // mới so với lúc gửi. Khách đã có tương tác muộn hơn thì giữ nguyên.
        await c.query(
          `update contacts set last_interaction_at = greatest($2::timestamptz, $3::timestamptz)
            where id = $1`, [s.contact_id, mocTruoc ?? luc, luc]);
      }
    }

    let them = 0, boQua = 0, khachCu = 0;
    for (let i = 0; i < mocGui.length; i += 1) {
      const k = KHACH[i];
      const tokenHash = bam(`ifan-demo-lap-not:lead:${TID}:${k.sdt}`);
      // Băm IP theo đúng công thức của sản phẩm: sha256(`${ip}:${slug}`).
      // Dải 203.0.113.0/24 là TEST-NET-3 (RFC 5737) — dành riêng cho tài liệu,
      // không phải địa chỉ của ai. Mỗi khách một IP, tối đa 2 khách chung một
      // IP, nên chốt chống lụt 5 lượt/giờ/IP không bị chạm.
      const ipHash = bam(`203.0.113.${10 + i * 7}:${SLUG}`);

      const luc = mocGui[i];
      const daCo = (await c.query(
        `select 1 from storefront_lead_submissions where tenant_id = $1 and token_hash = $2`,
        [TID, tokenHash])).rowCount;
      if (daCo) {
        boQua += 1;
        // Không chèn gì thêm, chỉ chuẩn lại mốc về đúng ô lưới của lượt này.
        await trongGiaoDich(() => chuanMoc(tokenHash, luc, false));
        continue;
      }

      await trongGiaoDich(async () => {
        // Đọc mốc tương tác TRƯỚC lời gọi — sau lời gọi là đã bị dí về `now()`.
        const mocTruoc = (await c.query(
          `select last_interaction_at m from contacts
            where tenant_id = $1 and phone = $2 and deleted_at is null and merged_into_id is null
            order by created_at limit 1`, [TID, k.sdt])).rows[0]?.m ?? null;

        await vaiKhachVangLai();
        const kq = (await c.query(
          `select storefront_submit_lead($1, $2, $3, $4, $5, $6::jsonb, $7) as r`,
          [SLUG, tokenHash, ipHash, k.ten, k.sdt, JSON.stringify(k.tra), k.qr])).rows[0].r;
        await thoiVai();

        if (kq.duplicate) { boQua += 1; return; }
        if (kq.matched_existing) khachCu += 1;
        await chuanMoc(tokenHash, luc, true, mocTruoc);
        them += 1;
      });
    }
    viecDaLam.push(`storefront_lead_submissions: thêm ${them} lượt (trong đó ${khachCu} khớp khách cũ), bỏ qua ${boQua} lượt đã có`);
    ghi(`✓ storefront_lead_submissions — thêm ${them}, bỏ qua ${boQua} (đã có), khớp khách cũ ${khachCu}\n`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 12 · invitations — ba lời mời còn treo
// ══════════════════════════════════════════════════════════════════════════
// Chèn thẳng vào bảng LÀ đường của sản phẩm: `inviteMember()` trong
// `app/app/settings/team/actions.ts` cũng `.from("invitations").insert(...)`.
// Hai trigger `invitations_role_guard` + `invitations_seat_limit` vẫn chạy đủ.
// Token sinh NGẪU NHIÊN đúng như app (32 byte), không sinh từ chuỗi cố định:
// token là chìa vào tiệm, chìa đoán được là chìa hỏng — kể cả tiệm demo.
{
  let them = 0, boQua = 0;
  for (const m of LOI_MOI) {
    const daCo = (await c.query(
      `select 1 from invitations where tenant_id = $1 and email = $2 and status = 'pending'`,
      [TID, m.email])).rowCount;
    if (daCo) { boQua += 1; continue; }

    const nguoiMoiId = ai(m.nguoiMoi);
    const tao = new Date(Date.now() - m.truocMayNgay * 86_400_000);
    const het = new Date(tao.getTime() + 7 * 86_400_000); // đúng mặc định của cột

    await trongGiaoDich(async () => {
      await vai(nguoiMoiId);
      await c.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, status, created_at, expires_at)
         values ($1, $2, $3::tenant_role, $4, $5, 'pending', $6, $7)`,
        [TID, m.email, m.vai, bam(randomBytes(32).toString("hex")), nguoiMoiId, tao, het]);
      await thoiVai();
    });
    them += 1;
  }
  const ghe = (await c.query(`select tenant_seats_used($1) n`, [TID])).rows[0].n;
  viecDaLam.push(`invitations: thêm ${them} lời mời còn treo, bỏ qua ${boQua} (đã có)`);
  ghi(`✓ invitations — thêm ${them}, bỏ qua ${boQua}; chỗ ngồi đang dùng (người + lời mời treo) = ${ghe}\n`);
}

// ══════════════════════════════════════════════════════════════════════════
// 13 · merge_logs — hai lần gộp hồ sơ trùng, đi qua `merge_contacts()`
// ══════════════════════════════════════════════════════════════════════════
{
  let gop = 0, daGop = 0;
  for (const g of GOP) {
    const [giu, bo] = await Promise.all([hoSoTheoId(g.giu.id, g.ten), hoSoTheoId(g.bo.id, g.ten)]);

    // Đã gộp từ lần chạy trước → không gọi lại, không đếm nhầm thành việc mới.
    if (bo.merged_into_id === giu.id) { daGop += 1; continue; }
    if (bo.merged_into_id || giu.merged_into_id || bo.deleted_at || giu.deleted_at) {
      throw new Error(`DỪNG: cặp "${g.ten}" đã bị gộp/xoá theo hướng khác — không đụng vào.`);
    }
    // SĐT phải đúng như lúc đo. Nếu lệch nghĩa là ai đó đã sửa hồ sơ, và cặp
    // này không còn là cặp mình đã thẩm định.
    if (giu.phone !== g.giu.sdt || bo.phone !== g.bo.sdt) {
      throw new Error(`DỪNG: SĐT của cặp "${g.ten}" đã đổi (${giu.phone}/${bo.phone}, cần ${g.giu.sdt}/${g.bo.sdt}).`);
    }

    // Chốt an toàn: bên BỎ phải THẬT SỰ rỗng. Gộp nhầm hai người trùng tên là
    // xoá mất một khách — thà dừng còn hơn.
    const n = (await c.query(
      `select (select count(*) from orders where contact_id = $1)::int don,
              (select count(*) from appointments where contact_id = $1)::int lich,
              (select count(*) from deals where contact_id = $1)::int co_hoi`, [bo.id])).rows[0];
    if (n.don > 0 || n.lich > 0 || Number(bo.total_revenue) > 0) {
      throw new Error(`DỪNG: hồ sơ bỏ (${g.ten} ${bo.phone}) đã có ${n.don} đơn / ${n.lich} lịch / ${bo.total_revenue}đ — không còn là hồ sơ rỗng, không gộp.`);
    }

    await trongGiaoDich(async () => {
      await vai(ai("Chủ tiệm Demo"));
      const kq = (await c.query(
        `select merge_contacts($1, $2, $3::jsonb) as r`,
        [giu.id, bo.id, JSON.stringify(g.layCua)])).rows[0].r;
      await thoiVai();
      if (kq.status === "noop") daGop += 1; else gop += 1;
    });
  }
  viecDaLam.push(`merge_logs: gộp ${gop} cặp mới, ${daGop} cặp đã gộp từ lần chạy trước`);
  ghi(`✓ merge_logs — gộp mới ${gop}, đã gộp sẵn ${daGop}\n`);
}

// ══════════════════════════════════════════════════════════════════════════
// 14 · contact_merge_dismissals — bốn cặp "hai người khác nhau, đừng hỏi nữa"
// ══════════════════════════════════════════════════════════════════════════
{
  let them = 0;
  const truoc = (await c.query(
    `select count(*)::int n from contact_merge_dismissals where tenant_id = $1`, [TID])).rows[0].n;
  for (const p of BO_QUA) {
    const a = await hoSoTheoSdt(p.a, p.ten);
    const b = await hoSoTheoSdt(p.b, p.ten);
    await trongGiaoDich(async () => {
      // Người quản lý là người ngồi soát danh sách trùng, nên để đúng tên
      // người đó trong `dismissed_by` thay vì dồn hết cho chủ tiệm.
      await vai(ai("Phạm Thị Hồng Nhung"));
      await c.query(`select dismiss_duplicate_pair($1, $2)`, [a.id, b.id]);
      await thoiVai();
    });
  }
  const sau = (await c.query(
    `select count(*)::int n from contact_merge_dismissals where tenant_id = $1`, [TID])).rows[0].n;
  them = sau - truoc;
  // Còn bao nhiêu cặp trên màn Trùng lặp sau khi gộp + bỏ qua.
  let conLai = null;
  await trongGiaoDich(async () => {
    await vai(ai("Phạm Thị Hồng Nhung"));
    conLai = (await c.query(`select count(*)::int n from contact_duplicate_base(500)`)).rows[0].n;
    await thoiVai();
  });
  viecDaLam.push(`contact_merge_dismissals: thêm ${them} cặp bỏ qua (${BO_QUA.length - them} cặp đã bỏ qua từ trước)`);
  ghi(`✓ contact_merge_dismissals — thêm ${them}; màn Trùng lặp còn ${conLai} cặp chờ xử lý\n`);
}

// ══════════════════════════════════════════════════════════════════════════
// 15 · tenant_pack_overrides — từ vựng riêng của tiệm
// ══════════════════════════════════════════════════════════════════════════
{
  await trongGiaoDich(async () => {
    await vai(ai("Chủ tiệm Demo"));
    const cu = (await c.query(`select overrides from tenant_pack_overrides where tenant_id = $1`, [TID])).rows[0];
    const moi = { ...(cu?.overrides ?? {}), terminology: TU_VUNG };
    await c.query(
      `insert into tenant_pack_overrides (tenant_id, overrides) values ($1, $2::jsonb)
       on conflict (tenant_id) do update set overrides = excluded.overrides, updated_at = now()`,
      [TID, JSON.stringify(moi)]);
    // Đọc lại BẰNG ĐÚNG HÀM CỦA SẢN PHẨM để chắc là từ vựng thật sự đè được,
    // chứ không phải "đã ghi vào bảng" rồi tin là xong.
    const xem = (await c.query(`select tenant_pack_view() -> 'terminology' as t`)).rows[0].t;
    await thoiVai();
    viecDaLam.push(`tenant_pack_overrides: 1 dòng — tenant_pack_view() nay trả ${JSON.stringify(xem)}`);
    ghi(`✓ tenant_pack_overrides — tenant_pack_view() trả về: ${JSON.stringify(xem)}\n`);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// 16 · quick_reply_usages — lượt bấm câu trả lời nhanh trong Hộp thư
// ══════════════════════════════════════════════════════════════════════════
{
  const dangCo = (await c.query(
    `select count(*)::int n from quick_reply_usages where tenant_id = $1`, [TID])).rows[0].n;
  if (dangCo > 0) {
    viecDaLam.push(`quick_reply_usages: bỏ qua — tiệm đã có ${dangCo} lượt`);
    ghi(`↷ quick_reply_usages — bỏ qua, tiệm đã có ${dangCo} lượt (bảng không có khoá tự nhiên nên neo bằng "đã có hay chưa")\n`);
  } else {
    const cauMap = new Map((await c.query(
      `select id, title from quick_replies where tenant_id = $1`, [TID])).rows.map((r) => [r.title, r.id]));
    // Rải trong 14 ngày gần nhất — tiệm mới mở ngày 04/08, và màn Cài đặt chỉ
    // đếm trong cửa sổ 30 ngày (USAGE_DAYS ở settings/replies/page.tsx).
    const NGAY = 14;
    let them = 0, thieu = 0;
    for (const l of LUOT_DUNG) {
      const replyId = cauMap.get(l.cau);
      if (!replyId) { thieu += 1; continue; }
      for (let i = 0; i < l.luot; i += 1) {
        const ten = l.nguoi[i % l.nguoi.length];
        // Giờ hành chính, rải đều lùi dần; phút lệch để không dòng nào trùng giây.
        const luc = new Date(Date.now()
          - Math.round((i + 0.5) * (NGAY * 86_400_000) / l.luot)
          + ((i * 37) % 300) * 60_000);
        await trongGiaoDich(async () => {
          await vai(ai(ten));
          await c.query(`select quick_reply_mark_used($1)`, [replyId]);
          await thoiVai();
          // Hàm đặt `used_at = now()`. Lùi lại đúng dòng vừa sinh — trong cùng
          // giao dịch, dòng id lớn nhất của TIỆM NÀY chính là nó.
          await c.query(
            `update quick_reply_usages set used_at = $2
              where id = (select max(id) from quick_reply_usages where tenant_id = $1)`,
            [TID, luc]);
        });
        them += 1;
      }
    }
    if (thieu) ghi(`  ⚠️ ${thieu} câu trả lời nhanh không còn trong tiệm — bỏ qua phần lượt dùng của chúng.`);
    // Đọc lại bằng đúng hàm màn Cài đặt dùng.
    let dem30 = null;
    await trongGiaoDich(async () => {
      await vai(ai("Chủ tiệm Demo"));
      dem30 = (await c.query(
        `select quick_reply_used_counts(now() - interval '30 days') as r`)).rows[0].r;
      await thoiVai();
    });
    const tong = Object.values(dem30 ?? {}).reduce((a, b) => a + b, 0);
    viecDaLam.push(`quick_reply_usages: thêm ${them} lượt; quick_reply_used_counts(30 ngày) đếm được ${tong}`);
    ghi(`✓ quick_reply_usages — thêm ${them} lượt; hàm của màn Cài đặt đếm được ${tong} lượt trong 30 ngày\n`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// KẾT
// ══════════════════════════════════════════════════════════════════════════
const sau16 = await dem(BANG_16);
const sauKeo = await dem(BANG_KEO_THEO);

ghi("═".repeat(78));
inBang("16 BẢNG TỪNG TRỐNG (đếm trong phạm vi tiệm mẫu):", truoc16, sau16);
inBang("KÉO THEO — sản phẩm tự sinh, file này không chèn dòng nào vào đây:", truocKeo, sauKeo);

ghi("Đã làm:");
for (const v of viecDaLam) ghi(`  • ${v}`);
ghi("\nCố ý KHÔNG nạp:");
ghi("  • admin_audit_logs · bot_outbox · link_codes · support_sessions");
ghi("    subscription_invoices · subscription_payments · subscription_lifecycle_log");
ghi("      → đúng ra phải trống (nhật ký tầng nền tảng / hàng đợi tạm / tiệm đang dùng thử).");
ghi("  • notification_channels · staff_channel_links · channel_quota");
ghi("      → cấm nạp (cần mã đăng nhập bot thật; channel_quota là số sản phẩm tự cộng).");

await c.end();
