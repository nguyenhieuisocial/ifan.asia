#!/usr/bin/env node
/**
 * Cổng canh CẠNH CHÉO TIỆM — mọi khoá ngoại giữa hai bảng đều có `tenant_id`
 * phải có chốt, hoặc được khai miễn trừ kèm bằng chứng ĐÃ ĐO.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CỔNG NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Lớp bệnh: bảng con chỉ kiểm `tenant_id` của CHÍNH DÒNG NÓ, không kiểm bản ghi
 * CHA có cùng tiệm hay không. Người tiệm A ghi một dòng mang `tenant_id = A`
 * nhưng khoá ngoại trỏ sang bản ghi của tiệm B — RLS thấy `tenant_id` khớp nên
 * cho qua, rồi trigger chạy quyền cao vẫn đụng vào dữ liệu tiệm B.
 *
 * Lớp bệnh này đã phải rà BỐN lần: #131 (1 cạnh) → #136 (12) → #204 (4) → #205
 * (26). Ba đợt đầu đều là rà MỘT LẦN RỒI THÔI, **không để lại cổng nào canh**.
 * Hệ quả đo được ngày 20/08: 10 mảng dựng sau #136 (Kho · Nhập hàng · Hợp đồng ·
 * CSAT · Điểm/Voucher · Webhook · Giảm giá · Nhân sự · Lương/Hoa hồng · Tuyển
 * dụng · Chiến dịch) **bắt đầu lại từ số không và không có gì báo** — 26 cạnh
 * hở, trong đó cạnh nặng nhất làm LỘ LƯƠNG nhân viên sang tiệm khác.
 *
 * Cổng này tồn tại để #205 là đợt rà CUỐI: mảng mới thêm cạnh mới thì ĐỎ NGAY,
 * không đợi ai nhớ ra phải rà lại.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ CỔNG NÀY *KHÔNG* CHỨNG MINH ĐƯỢC GÌ — đọc kỹ phần này
 * ═══════════════════════════════════════════════════════════════════
 * Nó soát **CÓ CHỐT HAY KHÔNG**, KHÔNG soát **chốt có đúng hay không**. Nó vẫn
 * XANH khi:
 *  · Thân trigger có đủ ba dấu hiệu nhận diện nhưng so sai chiều, hoặc `return
 *    new` trước khi kịp kiểm — cổng đọc HÌNH DẠNG, không chạy thử.
 *  · Chốt đúng ở đường INSERT nhưng quên đường UPDATE (đúng lỗ #204 đã bắt được
 *    ở `leave_self_insert`: chốt canh cửa UPDATE mà quên cửa INSERT).
 *  · Khoá ngoại NHIỀU CỘT ngoài dạng `(cột, tenant_id) → cha(id, tenant_id)` —
 *    dạng đó nay được đọc và tính là ĐÃ CHỐT (xem `SQL_KHOA_GHEP`); mọi hình
 *    khoá ghép khác thì cổng vẫn không xét.
 *  · Cạnh trỏ sang bảng KHÔNG có `tenant_id` (bảng dùng chung) — không thuộc
 *    lớp bệnh này, cổng cố ý không xét.
 *
 * Muốn chắc một cạnh kín thì vẫn phải THỬ GHI thật: dựng hai tiệm trong một
 * giao dịch, ghi dòng con của tiệm A trỏ sang bản ghi cha của tiệm B, xem LỌT
 * hay CHẶN. Cổng này bảo đảm đúng MỘT điều, nhưng bảo đảm tự động và mãi mãi:
 * **không cạnh nào lọt vào kho mà không ai từng nhìn tới.**
 *
 * ═══════════════════════════════════════════════════════════════════
 * `coChe` — VÌ SAO MIỄN TRỪ PHẢI KHAI CƠ CHẾ MÁY KIỂM ĐƯỢC
 * ═══════════════════════════════════════════════════════════════════
 * Đo 22/08: cổng in "68 miễn trừ có bằng chứng" trên 126 cạnh — tức **hơn NỬA
 * số cạnh (68/126) đi qua cửa MIỄN TRỪ**. Nhưng hai trường `viSao`/`bangChung`
 * hồi đó **không một dòng mã nào đọc tới**: chỗ duy nhất dùng `MIEN_TRU` là
 * `if (MIEN_TRU[khoa])` (có tên thì bỏ qua) và `Object.keys(...).length` (đếm).
 * Một mục ghi lý do bịa đi qua y hệt một mục có bằng chứng thật — chữ "có bằng
 * chứng" trong dòng tổng kết là do người viết dán vào, không phải cổng đo.
 *
 * Và cửa không ai gác thì đúng là có mục sai thật: `chat_reactions.message_id`
 * khai *"không có policy INSERT cho client"*, trong khi bảng ấy CÓ policy
 * `chat_reactions_insert`. Cạnh vẫn kín, nhưng kín nhờ **một cơ chế khác hẳn
 * cái đang được ghi** — người đọc sau mà tin dòng chữ đó sẽ sửa nhầm chỗ.
 *
 * ⇒ Mỗi mục `MIEN_TRU` nay phải khai thêm `coChe` — tên một cơ chế **tra lại
 *   được bằng câu hỏi chỉ-đọc**, và cổng TRA LẠI NÓ MỖI LƯỢT CHẠY:
 *     · `khong_policy_insert` — RLS bật, và bảng con không còn policy
 *        INSERT/ALL nào cho vai client  → tra `pg_policies`
 *     · `khong_grant`         — `authenticated`/`anon` không được cấp quyền ghi
 *                             → tra `information_schema.role_table_grants`
 *     · `policy_tu_kiem`      — MỌI policy ghi của bảng con đều mang mệnh đề tự
 *        kiểm quan hệ nhắc cả bảng cha lẫn cột khoá ngoại → đọc biểu thức policy
 *     · `khoa_duy_nhat`       — còn ràng buộc/chỉ mục DUY NHẤT trên chính cột đó
 *                             → tra `pg_index`
 *     · `chua_may_kiem_duoc`  — lý do nằm ở TẦNG ỨNG DỤNG (RPC security definer,
 *        Server Action select-trước-dùng-lại). Catalog CSDL không nói được gì về
 *        nó ⇒ cổng KHÔNG kiểm, và cũng KHÔNG được đếm nó vào phần "đã kiểm".
 *   Khai cơ chế mà tra lại thấy KHÔNG còn đúng ⇒ **ĐỎ**, kèm chỗ sai.
 *
 * ⚠️ Lớp này canh **đường INSERT**, đúng như tên bốn cơ chế. Nó KHÔNG nói gì về
 * đường UPDATE (đổi khoá ngoại của một dòng sẵn có sang bản ghi tiệm khác) —
 * cùng chỗ mù đã liệt kê ở phần trên.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ⚠️ "CHƯA CÓ CHỐT" KHÔNG ĐỒNG NGHĨA "CÓ LỖ" — luật quan trọng nhất
 * ═══════════════════════════════════════════════════════════════════
 * Đo ngày 20/08 trên 41 cạnh chưa có chốt: **26 LỌT, 15 CHẶN**. Mười lăm cạnh
 * chặn sẵn không phải nhờ trigger nào — nhờ RLS không có policy INSERT, hoặc
 * policy tự kiểm quan hệ. Rải trigger cho chúng là trả phí ghi vĩnh viễn cho
 * một lỗ không tồn tại, và làm loãng ý nghĩa của chính lớp chốt này.
 *
 * ⇒ Vì thế `MIEN_TRU` bắt buộc kèm **bằng chứng ĐÃ ĐO**, không nhận lý do suông
 *   kiểu "chắc là an toàn". Cạnh nào chưa đo thì ghi thẳng là CHƯA ĐO.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NHẬN DIỆN CHỐT: ĐỌC THÂN HÀM, KHÔNG ĐỌC TÊN
 * ═══════════════════════════════════════════════════════════════════
 * Bản đầu định nhận diện bằng tên `*_tenant_guard`. **Phép đó SAI và đã suýt
 * cho ra hai kết luận sai ngày 20/08**: `task_blocks_mot_tang` (#168) và
 * `campaign_recipient_guard` (#171) đều là chốt chéo tiệm thật, chỉ là không
 * mang tên đó — đếm theo tên thì chúng bị xếp nhầm vào "chưa có chốt", và suýt
 * bị vá chồng thêm một trigger thứ hai cho cùng một luật.
 *
 * Đếm theo tên cũng chính là chỗ #204 lệch số: #204 ghi "24 cạnh đã có chốt"
 * vì đếm theo BẢNG có trigger; đếm theo CỘT thật sự nằm trong `tgattr` thì chỉ
 * có 18. Đọc thân hàm cho ra 50.
 *
 * Ba dấu hiệu phải có ĐỦ trong MỘT hàm trigger của bảng con:
 *   ① một câu lệnh nhắc CẢ bảng cha LẪN `new.<cột>`  (tức có tra bảng cha theo cột đó)
 *   ② thân hàm có phép so với `new.tenant_id`
 *   ③ trigger đó đang gắn thật vào bảng con (đọc `pg_trigger`, không đọc file)
 * Điều ① xét theo TỪNG CÂU (tách theo `;`) chứ không xét cả thân hàm: một hàm
 * dài nhắc bảng cha ở câu này và nhắc cột ở câu khác thì KHÔNG phải chốt của
 * cạnh này — xét cả thân hàm là cách dễ nhất để tự lừa mình.
 *
 * ═══════════════════════════════════════════════════════════════════
 * `--tu-be` — CỔNG CHƯA TỪNG ĐỎ LÀ CỔNG CHƯA BIẾT NÓ CÓ CHẠY KHÔNG
 * ═══════════════════════════════════════════════════════════════════
 * Chế độ này cố ý phá rồi rollback, mỗi phép nhắm MỘT lớp canh khác nhau — vì
 * cả bốn lớp đều có thể hỏng riêng:
 *   bẻ 1 · XOÁ một chốt trigger thật                    → lớp trigger
 *   bẻ 2 · THÊM một bảng mới có cạnh chéo tiệm          → lớp phát hiện cạnh mới
 *   bẻ 3 · PHÁ MỘT MIỄN TRỪ                             → lớp `coChe`
 *   bẻ 4 · HẠ một khoá ngoại ghép về khoá một cột       → lớp khoá ghép
 * Cả bốn phải làm cổng chuyển ĐỎ, và cổng phải tự xanh lại sau rollback.
 *
 * Bẻ 3 có mặt vì bẻ 1–2 chỉ thử lớp TRIGGER, trong khi hơn nửa số cạnh đi qua
 * cửa MIỄN TRỪ. Nó gồm hai nhánh: 3a mở một policy INSERT cho bảng đang khai
 * `khong_policy_insert` (cơ chế đông nhất), 3b xoá policy tự kiểm mà
 * `chat_reactions.message_id` đang dựa vào (cơ chế tinh vi nhất).
 *
 * Lượt chạy 22/08: bẻ 1 → 2 cạnh đỏ (có `payslips.employee_id`) · bẻ 2 → 1 cạnh
 * đỏ (có `zz_canh_gia.contact_id`) · bẻ 3a → 3 miễn trừ khai sai (có
 * `voucher_redemptions.voucher_id`) · bẻ 3b → 1 (có `chat_reactions.message_id`)
 * · bẻ 4 → 1 cạnh đỏ (có `activities.contact_id`) · sau rollback → 0 và 0. ✓
 *
 * ⚠️ Chỗ mù còn lại của bẻ 4, đọc `SQL_CANH` là thấy: cạnh chỉ TỒN TẠI trong
 * bảng đếm khi còn một khoá ngoại nào đó. Xoá hẳn khoá ngoại thì cạnh biến mất
 * chứ không đỏ — cổng canh được việc HẠ CẤP chốt, không canh được việc GỠ BỎ
 * hẳn quan hệ.
 *
 * ⚠️ CỐ Ý KHÔNG cắm `--tu-be` vào CI, dù lượt chạy thường thì có. Nó cần
 * `drop trigger` + `create table` + `create/drop policy`, tức khoá ACCESS
 * EXCLUSIVE trên CSDL mà
 * PostgREST của khách thật đang dùng chung (chỗ yếu đã biết — xem việc theo dõi
 * "tách kho cho việc kiểm"). Đo ngay hôm viết: áp migration #205 phải thử lại
 * 4 lượt vì `lock_timeout` và một lần `deadlock detected`. Cắm vào CI thì mỗi
 * push là một lần tranh khoá ⇒ cổng đỏ vì tranh chấp chứ không vì code sai —
 * mà một cổng đỏ oan sẽ bị người ta tập cho thói quen bỏ qua. Chạy tay sau mỗi
 * lần sửa phần nhận diện chốt là đủ, và ghi kết quả vào đây.
 *
 * Chạy:  node scripts/soat-canh-cheo-tiem.mjs
 *        node scripts/soat-canh-cheo-tiem.mjs --tu-be   # chứng minh cổng bắt được
 * Chỉ ĐỌC CSDL. `--tu-be` có ghi nhưng nằm trong giao dịch và luôn `rollback`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// ══════════════════════════════════════════════════════════════════════
// MIỄN TRỪ — cạnh KHÔNG cần trigger, kèm lý do + BẰNG CHỨNG ĐÃ ĐO
// ══════════════════════════════════════════════════════════════════════
// Khoá là `bảng_con.cột`. Mỗi dòng phải trả lời được hai câu: *cái gì đang
// chặn* và *ai đã đo, ngày nào*. Không có bằng chứng thì không phải miễn trừ,
// chỉ là phỏng đoán mặc áo miễn trừ.
//
// ⚠️ Miễn trừ KHÔNG vĩnh viễn. Cái giữ mấy cạnh này là RLS/policy — thứ đổi
// được bằng một migration một dòng. Đợt nào sửa policy của bảng nằm ở đây thì
// phải ĐO LẠI cạnh đó, đừng tin dòng chữ này.

/** Bằng chứng dùng chung cho 26 cạnh đã đo LỌT rồi vá ở #205 — không nằm ở đây,
 *  chúng có trigger thật. Hằng số này chỉ để nhắc nguồn của đợt đo. */
const DOT_DO = "đo 20/08 (đợt rà #205): dựng 2 tiệm trong 1 giao dịch, đóng vai `authenticated`, ghi dòng con tiệm A trỏ sang bản ghi cha tiệm B, rollback";

const DOT_DO_2208 = "đo 22/08: chạy lại `scripts/do-canh-cheo-tiem.mjs` — dựng 2 tiệm trong 1 giao dịch, đóng vai `authenticated`, ghi dòng con tiệm A trỏ sang bản ghi cha tiệm B, rollback";

/** Dựng các mục miễn trừ của nhóm #136 — cùng lý do, cùng bằng chứng cũ, chỉ
 *  khác `coChe`. Xem hai khối 3a/3b bên dưới để biết vì sao phải tách. */
const canhCu136 = (coChe, cap) => Object.fromEntries(cap.map(([k, cha]) => [k, {
  coChe,
  viSao: `Cạnh có TRƯỚC đợt rà #136 (17/08). Đợt đó xét từng cạnh và kết luận an toàn qua RPC security definer / select-trước-dùng-lại / RLS-GRANT chặn ghi thẳng (51/63 cạnh an toàn). Bảng cha: ${cha}.`,
  bangChung: "#136 xét tay 17/08 — ⚠️ đợt #205 (20/08) KHÔNG đo lại nhóm này, phạm vi #205 là 10 mảng sinh SAU #136. Đây là bằng chứng CŨ, không phải bằng chứng mới.",
}]));

const MIEN_TRU = {
  // ── Đợt đo 22/08: 8 cạnh cổng báo đỏ, đo lại thì 8/8 ĐỀU CHẶN SẴN ─────────
  //
  // ⚠️ Nhắc lại luật đã in ở đầu file, vì đây đúng là chỗ dễ quên nó nhất:
  //   "cổng báo chưa có chốt" KHÔNG đồng nghĩa "có lỗ". Không đo mà vá thì
  //   thêm 8 trigger cho 8 chỗ vốn đã kín — và mỗi trigger thừa là một thứ
  //   phải nuôi, một chỗ có thể sai về sau.
  //
  // ⚠️ `cash_entries.supplier_payment_id` suýt nằm lại ở "CHƯA ĐO" MÃI MÃI.
  //   Bộ điền giá trị tự động đặt `chung_tu = "{}"` cho mọi cột jsonb, còn
  //   CHECK của bảng đòi một MẢNG — nên lệnh ghi hỏng ở 23514 TRƯỚC KHI chạm
  //   tới câu hỏi chéo tiệm, và phép đo báo "hỏng vì lý do khác". Chỗ mù đó
  //   trông y hệt chỗ an toàn. Đã sửa bộ đo (`EP_GIA_TRI`) rồi mới kết luận.
  "attendance_proxy_punches.punch_id": {
    coChe: "khong_policy_insert",
    viSao: "Bảng chấm công hộ không có policy INSERT cho client — đường ghi thật đi qua hàm chấm công hộ (security definer) tự tra tiệm.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "bank_transactions.order_id": {
    coChe: "khong_policy_insert",
    viSao: "Sổ nhận tiền ngân hàng do webhook SePay ghi bằng khoá riêng, không có policy INSERT cho client.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "bank_transactions.order_payment_id": {
    coChe: "khong_policy_insert",
    viSao: "Cùng bảng, cùng lý do.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "cash_entries.supplier_payment_id": {
    coChe: "khoa_duy_nhat",
    viSao:
      "Kín theo kiểu KHÁC RLS: cột này có khoá DUY NHẤT, và trigger `supplier_payments_emit_cash` sinh dòng sổ quỹ NGAY khi lượt trả nhà cung cấp ra đời, còn xoá dòng tiền thì bị chặn — nên ô ấy có chủ từ giây đầu và không bao giờ trống lại. Tiệm A không chen vào lượt trả của tiệm B được.",
    bangChung: `CHẶN — 23505 khoá duy nhất trên chính cột khoá ngoại (${DOT_DO_2208}; phải sửa bộ đo trước mới đo được — xem ghi chú trên)`,
  },
  // ⚠️ SỬA 22/08 — mục này TỪNG KHAI SAI CƠ CHẾ, và sai suốt vì không ai gác.
  //   Chữ cũ: "không có policy INSERT cho client, đi qua hàm riêng". Đọc lại
  //   `pg_policies` thì bảng CÓ policy `chat_reactions_insert` cho vai client.
  //   Cạnh vẫn kín — nhưng kín bằng CƠ CHẾ KHÁC HẲN: chính policy ấy mang mệnh
  //   đề `exists (select 1 from chat_messages m where m.id = chat_reactions.message_id)`,
  //   mà `chat_messages` có RLS bật ⇒ tin nhắn của tiệm khác VÔ HÌNH với phép
  //   `exists` này, y hệt cách `internal_messages.thread_id` được giữ.
  //   Bằng chứng đo 22/08 (CHẶN — 42501) vẫn đúng; chỉ LỜI GIẢI THÍCH là sai.
  //   Hệ quả của việc để nguyên: ai đọc dòng cũ sẽ tưởng bảng này đóng đường
  //   ghi thẳng, rồi vô tư mở một policy INSERT — mà đó mới là chỗ giữ cạnh.
  "chat_reactions.message_id": {
    coChe: "policy_tu_kiem",
    viSao: "Policy `chat_reactions_insert` đòi `exists (select 1 from chat_messages m where m.id = message_id)`, mà `chat_messages` có RLS ⇒ tin nhắn của tiệm khác vô hình với phép `exists` này.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "data_erasure_requests.contact_id": {
    coChe: "khong_policy_insert",
    viSao: "Yêu cầu xoá dữ liệu chỉ sinh từ hàm riêng — bảng không mở policy INSERT.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "loyalty_ledger.referred_contact_id": {
    coChe: "khong_policy_insert",
    viSao: "Sổ điểm chỉ ghi bằng hàm tích điểm/đổi điểm (security definer); client ghi thẳng bị RLS từ chối.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO_2208})`,
  },
  "storefront_lead_holds.contact_id": {
    coChe: "khong_grant",
    viSao: "Bảng giữ chỗ khách từ trang mặt tiền không cấp quyền cho vai `authenticated` chút nào.",
    bangChung: `CHẶN — 42501 permission denied for table storefront_lead_holds (${DOT_DO_2208})`,
  },
  // ── Nhóm 1: RLS KHÔNG có policy INSERT ⇒ client ghi thẳng là bị từ chối ──
  // Đường ghi thật đi qua hàm `security definer` tự tra tiệm. Đã đo từng cạnh,
  // không suy từ việc "bảng này chắc chỉ ghi qua RPC".
  "voucher_redemptions.voucher_id": {
    coChe: "khong_policy_insert",
    viSao: "Bảng đổi voucher không có policy INSERT nào — mọi lượt ghi thẳng đều bị RLS từ chối; đường thật đi qua hàm đổi voucher (security definer) tự tra tiệm.",
    bangChung: `CHẶN — 42501 new row violates row-level security policy (${DOT_DO})`,
  },
  "voucher_redemptions.contact_id": {
    coChe: "khong_policy_insert",
    viSao: "Cùng bảng, cùng lý do: không có policy INSERT.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "voucher_redemptions.order_id": {
    coChe: "khong_policy_insert",
    viSao: "Cùng bảng, cùng lý do: không có policy INSERT.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "loyalty_ledger.contact_id": {
    coChe: "khong_policy_insert",
    viSao: "Sổ điểm là APPEND-ONLY qua hàm tích/tiêu điểm; không có policy INSERT cho client.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "loyalty_ledger.order_id": {
    coChe: "khong_policy_insert",
    viSao: "Cùng bảng, cùng lý do: sổ điểm không nhận ghi thẳng.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "discount_approvals.order_id": {
    coChe: "khong_policy_insert",
    viSao: "Phiếu duyệt giảm giá chỉ sinh qua hàm xin/duyệt (migration #165 đã đóng đường ghi thẳng để trần theo vai không thành nút bấm trang trí).",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "discount_approvals.order_line_id": {
    coChe: "khong_policy_insert",
    viSao: "Cùng bảng, cùng lý do.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "webhook_deliveries.endpoint_id": {
    coChe: "khong_policy_insert",
    viSao: "Phiếu gửi webhook do việc chạy nền sinh ra, client không có policy INSERT.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },

  // ── Nhóm 2: policy TỰ kiểm quan hệ ⇒ trigger sẽ là lớp thứ hai thừa ──
  "attendance_punches.employee_id": {
    coChe: "policy_tu_kiem",
    viSao: "Policy `attendance_self_insert` đòi `employee_id in (select id from employees where user_id = auth.uid())` — nhân viên tiệm khác không thuộc `auth.uid()` nên không lọt.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  "leave_requests.employee_id": {
    coChe: "policy_tu_kiem",
    viSao: "Policy `leave_self_insert` đòi đúng như trên. Đây chính là PHẢN VÍ DỤ mà #204 ghi lại: không có trigger nào mà vẫn chặn.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO}; #204 cũng đo ra kết quả này ngày 20/08)`,
  },
  "internal_messages.thread_id": {
    coChe: "policy_tu_kiem",
    viSao: "Policy `internal_messages_insert` đòi `exists (select 1 from internal_threads t where t.id = thread_id)`, mà `internal_threads` có RLS ⇒ luồng của tiệm khác VÔ HÌNH với phép `exists` này.",
    bangChung: `CHẶN — 42501 row-level security policy (${DOT_DO})`,
  },
  // ⚠️ `internal_mentions.message_id` ĐÃ RỜI khỏi danh sách này (21/08): cạnh đó
  //   nay có chốt thật `internal_mentions_bao`, nên giữ dòng miễn trừ là NÓI SAI
  //   về code — người đọc sẽ tưởng chỗ này chỉ dựa vào policy.

  // ── Nhóm 3: cạnh CÓ TRƯỚC đợt rà #136 (17/08) ──
  // #136 xét từng cạnh một và kết luận an toàn qua ba đường: RPC `security
  // definer` tự tra tiệm · Server Action select-trước-dùng-lại · RLS/GRANT đã
  // chặn ghi thẳng. Đợt #205 **KHÔNG đo lại nhóm này** — phạm vi #205 là 10 mảng
  // sinh SAU #136. Ghi thẳng ra để không ai đọc nhầm thành "đã đo lại và sạch".
  //
  // Nhóm này TÁCH LÀM HAI khi thêm lớp `coChe` (22/08), vì lý do gốc của #136 là
  // một phép HOẶC ba nhánh — mà chỉ MỘT nhánh (RLS/GRANT) là thứ catalog CSDL
  // trả lời được. Gộp cả nhóm vào một chữ chung là cách chắc chắn để không bao
  // giờ kiểm được gì. Phép tách ấy trả ngay: nhánh RLS tra lại thì đúng cả,
  // nhánh máy-không-tra-được đem đo thật thì lòi ra lỗ (xem khối 3b).

  // 3a — tra `pg_policies` ngày 22/08: RLS bật và KHÔNG còn policy INSERT/ALL
  // nào cho vai client. Không client nào ghi được DÒNG NÀO vào bảng, nên càng
  // không ghi được dòng trỏ chéo tiệm. Đây là nhánh RLS của lý do #136, và từ
  // nay cổng tra lại mỗi lượt — mở policy INSERT cho bảng nào ở đây là ĐỎ.
  ...canhCu136("khong_policy_insert", [
    ["ai_reply_log.conversation_id", "conversations"], ["ai_reply_log.message_id", "messages"],
    ["ai_reply_log.trigger_message_id", "messages"],
    ["conversation_handoffs.conversation_id", "conversations"],
    ["deal_stage_history.deal_id", "deals"], ["deal_stage_history.from_stage_id", "pipeline_stages"],
    ["deal_stage_history.to_stage_id", "pipeline_stages"],
    ["livechat_visitors.channel_id", "channels"], ["livechat_visitors.contact_id", "contacts"],
    ["livechat_visitors.conversation_id", "conversations"],
    ["order_line_costs.order_line_id", "order_lines"],
    ["qr_scans.qr_code_id", "qr_codes"],
    ["sla_events.policy_id", "sla_policies"],
    ["storefront_lead_submissions.contact_id", "contacts"],
    ["subscription_invoices.subscription_id", "subscriptions"],
    ["subscription_lifecycle_log.subscription_id", "subscriptions"],
    ["subscription_payments.invoice_id", "subscription_invoices"],
    ["support_sessions.help_request_id", "help_requests"],
    ["wf_approval_assignees.request_id", "wf_approval_requests"],
    ["wf_approval_requests.run_id", "workflow_runs"],
    ["wf_approval_requests.submission_id", "wf_form_submissions"],
    ["workflow_runs.event_id", "domain_events"], ["workflow_runs.workflow_id", "workflows"],
  ]),

  // 3b — bảng CÓ mở đường ghi cho client. Cái #136 dựa vào là tầng ỨNG DỤNG:
  // RPC `security definer` tự tra tiệm, hoặc Server Action select-trước-rồi-
  // dùng-lại-id. Catalog CSDL KHÔNG nói được gì về hai thứ đó ⇒ khai thẳng
  // `chua_may_kiem_duoc`, và cổng đếm chúng RIÊNG, không nhập vào phần đã kiểm.
  //
  // ⚠️ Đây là phần yếu nhất của cổng, đừng đọc thành "đã an toàn". Muốn dời cạnh
  // nào khỏi đây thì phải ĐO bằng `scripts/do-canh-cheo-tiem.mjs`, rồi khai cơ
  // chế máy tra được.
  //
  // ⚠️ Khối này TỪNG có 26 cạnh. Ngày 22/08 nó rụng còn MỘT, và lý do đáng ghi
  // lại: 25 cạnh kia được ĐO THẬT bằng lệnh ghi (`do-canh-cheo-tiem.mjs`, có
  // rollback) thay vì đọc lại lượt xét tay #136 — phép đo tìm ra lỗ chéo tiệm
  // thật, tức phần "an toàn nhờ tầng ứng dụng" của #136 KHÔNG đứng vững. Vá
  // bằng #359 (khoá ngoại ghép) + #360 (trigger).
  //
  // Tra lại trong CSDL ngày 22/08 để chắc chúng có chốt thật chứ không chỉ có
  // migration: 18 cạnh mang ràng buộc `<bảng>_<cột>_cung_tiem`, 7 cạnh mang
  // trigger `<bảng>_cheo_tiem_guard`. Có chốt rồi thì không còn là miễn trừ —
  // để lại dòng miễn trừ sẽ bị chính phép `thuaMienTru` bắt.
  //
  // Bài học của khối này, ghi cho lần sau: một dòng lý do KHÔNG AI KIỂM ĐƯỢC có
  // thể che một lỗ thật suốt từ 17/08 tới 22/08. Không phải vì ai cẩu thả — mà
  // vì không có gì buộc phải đọc lại nó.
  //
  // Cạnh còn lại dưới đây vẫn chưa có gì máy tra được, và bộ đo chưa dựng nổi
  // lệnh ghi hợp lệ cho nó. CHƯA ĐO ĐƯỢC LÀ CHỖ MÙ, KHÔNG PHẢI CHỖ AN TOÀN —
  // đọc lịch sử ngay trên đây thì biết chỗ mù kiểu này che được lỗ thật cỡ nào.
  ...canhCu136("chua_may_kiem_duoc", [
    ["cash_entries.order_payment_id", "order_payments"],
  ]),
};

// ══════════════════════════════════════════════════════════════════════

const napEnv = () => {
  if (process.env.SUPABASE_DB_URL) return;
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* CI đã có env sẵn */ }
};
napEnv();
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (biến môi trường hoặc .env.local).");
  process.exit(1);
}

// TLS verify-full với CA Supabase đã ghim — giống mọi script khác của kho.
const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();
// Bắt buộc theo `soat-ky-luat-bo-kiem.mjs`: mọi bộ đụng CSDL phải đặt hạn chờ khoá.
await c.query("set lock_timeout = '10s'");

const SQL_CANH = `
with co_tenant as (
  select table_name from information_schema.columns
   where table_schema = 'public' and column_name = 'tenant_id'
)
select tcon.relname as bang_con, att.attname as cot, tref.relname as bang_cha
  from pg_constraint con
  join pg_class tcon on tcon.oid = con.conrelid
  join pg_class tref on tref.oid = con.confrelid
  join pg_namespace n on n.oid = tcon.relnamespace
  join unnest(con.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
 where con.contype = 'f' and n.nspname = 'public'
   and array_length(con.conkey, 1) = 1
   and tcon.relname in (select table_name from co_tenant)
   and tref.relname in (select table_name from co_tenant)
   and att.attname <> 'tenant_id'
 order by tcon.relname, att.attname`;

// CHỐT DẠNG KHOÁ NGOẠI GHÉP `(cột, tenant_id) → cha(id, tenant_id)` (#359).
//
// Vì sao phải có câu này: `SQL_CANH` cố ý chỉ đếm khoá ngoại MỘT CỘT, nên cạnh
// nào được vá bằng khoá ghép **biến mất khỏi bảng đếm** thay vì hiện ra là đã
// chốt. Đo 22/08 lúc #359 vừa áp: tổng cạnh tụt 126 → 108 và cổng vẫn in
// "0 ĐỎ" — dạng chốt MẠNH NHẤT trong kho lại là dạng duy nhất cổng không kể
// công. Đếm tụt lặng lẽ là kiểu sai nguy hiểm: nhìn vào chỉ thấy "ít việc hơn".
//
// Và nó đã giấu mất nhiều hơn một đợt: đếm ngày 22/08 ra 27 cạnh dạng này, đặt
// bởi #320 + #321 (9 cạnh, 21/08) và #359 (18 cạnh, 22/08). Tức 9 cạnh nằm
// ngoài sổ suốt từ 21/08 mà không ai thấy. Bật câu này lên thì tổng đi 108 →
// 135 — con số 126 quen thuộc trước nay vốn đã thiếu 9 cạnh.
//
// Ghép cặp theo VỊ TRÍ (`k.ord = f.ord`), không chỉ theo tập cột: phải đúng
// `cột → cha.id` và `tenant_id → cha.tenant_id` mới là chốt. Hai cột đúng mà
// nối chéo nhau thì ràng buộc nói một chuyện khác hẳn.
const SQL_KHOA_GHEP = `
with cap as (
  select con.oid, tcon.relname as bang_con, tref.relname as bang_cha,
         ac.attname as cot_con, af.attname as cot_cha
    from pg_constraint con
    join pg_class tcon on tcon.oid = con.conrelid
    join pg_class tref on tref.oid = con.confrelid
    join pg_namespace n on n.oid = tcon.relnamespace
    join unnest(con.conkey) with ordinality as k(attnum, ord) on true
    join unnest(con.confkey) with ordinality as f(attnum, ord) on f.ord = k.ord
    join pg_attribute ac on ac.attrelid = con.conrelid and ac.attnum = k.attnum
    join pg_attribute af on af.attrelid = con.confrelid and af.attnum = f.attnum
   where con.contype = 'f' and n.nspname = 'public' and array_length(con.conkey, 1) = 2
)
select bang_con, bang_cha, cot_con as cot
  from cap
 where cot_con <> 'tenant_id' and cot_cha = 'id'
   and oid in (select oid from cap where cot_con = 'tenant_id' and cot_cha = 'tenant_id')`;

const SQL_TRIGGER = `
select t.relname as bang, tg.tgname, p.prosrc
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_proc p on p.oid = tg.tgfoid
  join pg_namespace n on n.oid = t.relnamespace
 where not tg.tgisinternal and n.nspname = 'public'`;

// ── Ba câu dưới đây phục vụ lớp kiểm `coChe` (xem đầu file) ──────────────
// Chỉ lấy policy của VAI CLIENT. `service_role` là đường máy chủ, vốn được tin
// và vốn đi vòng qua RLS — tính nó vào là tự làm cổng đỏ oan.
const SQL_POLICY_GHI = `
select tablename as bang, policyname as ten, cmd, permissive,
       coalesce(with_check, qual, '') as bieu_thuc
  from pg_policies
 where schemaname = 'public' and cmd in ('INSERT', 'ALL')
   and roles && array['public', 'authenticated', 'anon']::name[]`;

const SQL_RLS = `
select c.relname as bang, c.relrowsecurity as bat
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'`;

const SQL_GRANT_GHI = `
select table_name as bang, grantee as vai
  from information_schema.role_table_grants
 where table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')
   and grantee in ('authenticated', 'anon', 'PUBLIC')
 group by 1, 2`;

// `indnkeyatts = 1` chứ không phải `indnatts`: cột INCLUDE không tham gia tính
// duy nhất. Điều kiện lọc của chỉ mục MỘT PHẦN được trả về để sàng ở tầng JS —
// xem chỗ dựng `duyNhat` để biết vì sao không loại thẳng chỉ mục một phần.
const SQL_DUY_NHAT = `
select t.relname as bang, a.attname as cot, pg_get_expr(i.indpred, i.indrelid) as dieu_kien
  from pg_index i
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0]
 where n.nspname = 'public' and i.indisunique and i.indisvalid and i.indnkeyatts = 1`;

async function docCsdl() {
  // Hỏi LẦN LƯỢT, không `Promise.all`: một `pg.Client` chỉ chạy được một câu tại
  // một thời điểm. Bắn 6 câu cùng lúc thì kết quả trộn vào nhau — lượt thử đầu
  // ra 108 cạnh/65 chốt thay vì 126/58, tức cổng đọc sai cả bảng cạnh lẫn bảng
  // trigger mà vẫn in ra một con số trông rất bình thường.
  const hoi = async (q) => (await c.query(q)).rows;
  const motCot = await hoi(SQL_CANH);
  const ghep = await hoi(SQL_KHOA_GHEP);
  const tg = await hoi(SQL_TRIGGER);
  const pol = await hoi(SQL_POLICY_GHI);
  const rls = await hoi(SQL_RLS);
  const gr = await hoi(SQL_GRANT_GHI);
  const uq = await hoi(SQL_DUY_NHAT);
  const gom = (rows, khoa) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r[khoa])) m.set(r[khoa], []);
      m.get(r[khoa]).push(r);
    }
    return m;
  };
  // Cạnh khoá ghép được NHẬP VÀO bảng đếm chứ không để ngoài, để tổng số cạnh
  // phản ánh đúng số quan hệ chéo tiệm đang tồn tại. Gộp theo khoá để một cạnh
  // vừa có khoá một cột vừa có khoá ghép không bị đếm hai lần.
  const theoKhoa = new Map();
  for (const e of motCot) theoKhoa.set(`${e.bang_con}.${e.cot}`, e);
  const khoaGhep = new Set();
  for (const e of ghep) {
    const k = `${e.bang_con}.${e.cot}`;
    khoaGhep.add(k);
    if (!theoKhoa.has(k)) theoKhoa.set(k, e);
  }
  return {
    canh: [...theoKhoa.values()].sort((a, b) =>
      `${a.bang_con}.${a.cot}`.localeCompare(`${b.bang_con}.${b.cot}`)),
    khoaGhep,
    theoBang: Object.fromEntries(gom(tg, "bang")),
    policyGhi: gom(pol, "bang"),
    grantGhi: gom(gr, "bang"),
    rls: new Map(rls.map((r) => [r.bang, r.bat])),
    // Chỉ mục một phần thường KHÔNG chặn được gì — nhưng có đúng một dạng thì
    // chặn: lọc `<chính cột đó> is not null`. Đó là khuôn quen của cột khoá
    // ngoại cho phép rỗng, và lượt ghi chéo tiệm bao giờ cũng điền giá trị nên
    // luôn rơi vào phần được canh. Loại thẳng mọi chỉ mục một phần thì
    // `cash_entries_mot_dong_moi_luot_tra` bị bỏ sót và cổng ĐỎ OAN — đã dính
    // đúng lỗi này ở lượt viết đầu 22/08.
    duyNhat: new Set(uq
      .filter((r) => r.dieu_kien === null ||
        new RegExp(`^\\(?\\s*${r.cot}\\s+is\\s+not\\s+null\\s*\\)?$`, "i").test(r.dieu_kien.trim()))
      .map((r) => `${r.bang}.${r.cot}`)),
  };
}

/** Trigger nào của bảng con đang chốt cạnh này — xem phần "đọc thân hàm" ở đầu file. */
function aiDangChot(e, theoBang) {
  return (theoBang[e.bang_con] ?? []).filter((t) => {
    const s = t.prosrc.toLowerCase();
    if (!/(is\s+distinct\s+from|<>|=)\s*new\.tenant_id/.test(s)) return false;
    return s.split(";").some((cau) =>
      new RegExp(`\\b(public\\.)?${e.bang_cha}\\b`).test(cau) && cau.includes(`new.${e.cot}`));
  }).map((t) => t.tgname);
}

// ══════════════════════════════════════════════════════════════════════
// KIỂM `coChe` — tra lại cái mà mục miễn trừ KHAI là đang giữ cạnh
// ══════════════════════════════════════════════════════════════════════

/** Tách một biểu thức policy thành các mệnh đề `and` ở TẦNG NGOÀI CÙNG.
 *  Xét cả biểu thức là cách dễ nhất để tự lừa mình — cùng cái bẫy đã ghi ở phần
 *  đọc thân hàm trigger: bảng cha nhắc ở mệnh đề này, cột khoá ngoại nhắc ở
 *  mệnh đề khác, thì hai thứ đó KHÔNG ràng vào nhau và không chặn được gì. */
function tachMenhDeAnd(s) {
  let t = s.trim();
  for (;;) { // bóc lớp ngoặc bao ngoài cùng, nếu nó thật sự bao trọn biểu thức
    if (!(t.startsWith("(") && t.endsWith(")"))) break;
    let d = 0, tron = true;
    for (let i = 0; i < t.length; i++) {
      d += t[i] === "(" ? 1 : t[i] === ")" ? -1 : 0;
      if (d === 0 && i < t.length - 1) { tron = false; break; }
    }
    if (!tron) break;
    t = t.slice(1, -1).trim();
  }
  const hoa = t.toUpperCase(), ra = [];
  let d = 0, cur = "";
  for (let i = 0; i < t.length; i++) {
    if (d === 0 && hoa.startsWith(" AND ", i)) { ra.push(cur); cur = ""; i += 4; continue; }
    d += t[i] === "(" ? 1 : t[i] === ")" ? -1 : 0;
    cur += t[i];
  }
  return [...ra, cur];
}

/** Policy này có mệnh đề tra bảng cha THEO ĐÚNG cột khoá ngoại không. */
const coMenhDeTuKiem = (bieuThuc, bangCha, cot) =>
  tachMenhDeAnd(bieuThuc).some((m) =>
    /\bselect\b/i.test(m) &&
    new RegExp(`\\b(public\\.)?${bangCha}\\b`, "i").test(m) &&
    new RegExp(`\\b${cot}\\b`, "i").test(m));

/** Mỗi hàm trả về `null` nếu cơ chế VẪN đúng, hoặc câu nói rõ nó sai ở đâu. */
const KIEM_CO_CHE = {
  khong_policy_insert(e, db) {
    if (db.rls.get(e.bang_con) !== true)
      return `RLS đang TẮT trên \`${e.bang_con}\` — "không có policy" lúc này nghĩa là AI CŨNG GHI ĐƯỢC, ngược hẳn ý định`;
    const p = db.policyGhi.get(e.bang_con);
    if (p?.length)
      return `\`${e.bang_con}\` NAY CÓ policy ghi cho vai client: ${p.map((x) => `${x.ten} (${x.cmd})`).join(", ")} — đường ghi thẳng đã mở lại`;
    return null;
  },
  khong_grant(e, db) {
    const g = db.grantGhi.get(e.bang_con);
    if (g?.length)
      return `vai ${[...new Set(g.map((x) => x.vai))].join("/")} NAY được cấp quyền ghi trên \`${e.bang_con}\``;
    return null;
  },
  policy_tu_kiem(e, db) {
    if (db.rls.get(e.bang_con) !== true)
      return `RLS đang TẮT trên \`${e.bang_con}\` — policy không còn được áp dụng`;
    // Phép `exists` chỉ chặn được nhờ RLS của BẢNG CHA làm dòng tiệm khác vô
    // hình. Tắt RLS bảng cha là mở cạnh, dù policy bảng con không đổi một chữ.
    if (db.rls.get(e.bang_cha) !== true)
      return `RLS đang TẮT trên bảng cha \`${e.bang_cha}\` — mệnh đề tự kiểm nhìn thấy cả dòng của tiệm khác`;
    const ps = db.policyGhi.get(e.bang_con) ?? [];
    if (!ps.some((p) => coMenhDeTuKiem(p.bieu_thuc, e.bang_cha, e.cot)))
      return `không policy ghi nào của \`${e.bang_con}\` còn mệnh đề tra \`${e.bang_cha}\` theo \`${e.cot}\``;
    // Policy PERMISSIVE ghép với nhau bằng HOẶC: chỉ cần một cái không tự kiểm
    // là lọt qua nó. Vì thế đòi MỌI policy permissive đều mang mệnh đề ấy.
    const ho = ps.filter((p) => p.permissive === "PERMISSIVE" && !coMenhDeTuKiem(p.bieu_thuc, e.bang_cha, e.cot));
    if (ho.length)
      return `policy ${ho.map((p) => p.ten).join(", ")} của \`${e.bang_con}\` KHÔNG tự kiểm — policy permissive ghép bằng HOẶC nên chỉ cần một cái hở là cạnh hở`;
    return null;
  },
  khoa_duy_nhat: (e, db) => db.duyNhat.has(`${e.bang_con}.${e.cot}`) ? null
    : `không còn ràng buộc/chỉ mục DUY NHẤT toàn phần trên \`${e.bang_con}.${e.cot}\``,
  // Cố ý không kiểm: lý do nằm ở tầng ứng dụng, catalog CSDL không thấy được.
  // Đếm riêng ở phần tổng kết để con số "đã kiểm" không nuốt mất nhóm này.
  chua_may_kiem_duoc: () => null,
};

/** Trả về danh sách cạnh ĐỎ. Không in gì — để `--tu-be` gọi lại được im lặng. */
function soat(db) {
  const { canh, theoBang } = db;
  const do_ = [], thuaMienTru = [], coCheSai = [];
  const dungToi = new Set(), chuaMayKiem = new Set();
  let coGhep = 0;
  for (const e of canh) {
    const khoa = `${e.bang_con}.${e.cot}`;
    // Khoá ngoại ghép xét TRƯỚC trigger: nó chặn ngay trong ràng buộc, không
    // câu lệnh nào lách được, kể cả câu lệnh viết sau này. Trigger còn có thể bị
    // `alter table ... disable trigger`; ràng buộc thì không.
    if (db.khoaGhep.has(khoa)) {
      coGhep++;
      if (MIEN_TRU[khoa]) thuaMienTru.push({ khoa, chot: [`khoá ngoại ghép (${e.cot}, tenant_id) → ${e.bang_cha}(id, tenant_id)`] });
      continue;
    }
    const chot = aiDangChot(e, theoBang);
    if (chot.length > 0) {
      if (MIEN_TRU[khoa]) thuaMienTru.push({ khoa, chot });
      continue;
    }
    const mt = MIEN_TRU[khoa];
    if (!mt) { do_.push({ ...e, khoa }); continue; }
    dungToi.add(khoa);
    const kiem = KIEM_CO_CHE[mt.coChe];
    if (!kiem) {
      coCheSai.push({ khoa, coChe: mt.coChe ?? "(bỏ trống)", vi: `không phải một trong ${Object.keys(KIEM_CO_CHE).join(" · ")}` });
      continue;
    }
    if (mt.coChe === "chua_may_kiem_duoc") { chuaMayKiem.add(khoa); continue; }
    const vi = kiem(e, db);
    if (vi) coCheSai.push({ khoa, coChe: mt.coChe, vi });
  }
  const mienTruMoCoi = Object.keys(MIEN_TRU).filter(
    (k) => !dungToi.has(k) && !thuaMienTru.some((x) => x.khoa === k));
  return {
    do_, thuaMienTru, mienTruMoCoi, coCheSai, coGhep,
    tong: canh.length,
    coChot: canh.length - do_.length - dungToi.size - coGhep,
    daKiem: dungToi.size - chuaMayKiem.size - coCheSai.length,
    chuaMayKiem: chuaMayKiem.size,
  };
}

// ══════════════════════════════════════════════════════════════════════
// TỰ BẺ — chứng minh cổng bắt được. Cổng chưa từng đỏ là cổng chưa biết
// nó có chạy không.
// ══════════════════════════════════════════════════════════════════════
if (process.argv.includes("--tu-be")) {
  console.log("[tu-be] Cố ý phá chốt trong MỘT giao dịch rồi rollback — cổng phải chuyển ĐỎ.\n");
  const truoc = soat(await docCsdl());
  console.log(`  Trước khi phá: ${truoc.do_.length} cạnh đỏ · ${truoc.coCheSai.length} miễn trừ khai sai cơ chế.`);
  // Đòi CẢ HAI con số bằng 0: bẻ 3 báo động bằng `coCheSai`, nên nếu nó đã khác
  // 0 từ đầu thì không phân biệt được cái mình vừa phá với cái vốn đã hỏng.
  if (truoc.do_.length !== 0 || truoc.coCheSai.length !== 0) {
    console.error("  ✗ Cổng đang ĐỎ SẴN — phép tự bẻ không nói lên điều gì. Sửa cho xanh trước đã.");
    await c.end();
    process.exit(1);
  }

  await c.query("begin");
  await c.query("set local lock_timeout = '10s'");
  let ma = 0;
  try {
    // Bẻ 1 — XOÁ một chốt thật (cạnh nặng nhất đợt #205: phiếu lương).
    await c.query("savepoint be1");
    await c.query("drop trigger payslips_tenant_guard on public.payslips");
    const sau1 = soat(await docCsdl());
    const bat1 = sau1.do_.some((d) => d.khoa === "payslips.employee_id");
    console.log(`  Bẻ 1 · xoá trigger payslips_tenant_guard  → ${sau1.do_.length} cạnh đỏ` +
      `${bat1 ? " ✓ có payslips.employee_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat1) ma = 1;
    await c.query("rollback to savepoint be1");

    // Bẻ 2 — THÊM một cạnh giả (bảng mới, chưa ai khai miễn trừ). Đây đúng là
    // hình dạng của một mảng mới dựng: bảng con có tenant_id, trỏ sang bảng cha
    // có tenant_id, không ai nhớ thêm chốt.
    await c.query("savepoint be2");
    await c.query(`create table public.zz_canh_gia (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references public.tenants(id),
      contact_id uuid not null references public.contacts(id))`);
    const sau2 = soat(await docCsdl());
    const bat2 = sau2.do_.some((d) => d.khoa === "zz_canh_gia.contact_id");
    console.log(`  Bẻ 2 · thêm bảng mới có cạnh chéo tiệm    → ${sau2.do_.length} cạnh đỏ` +
      `${bat2 ? " ✓ có zz_canh_gia.contact_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat2) ma = 1;
    await c.query("rollback to savepoint be2");

    // Bẻ 3 — PHÁ MỘT MIỄN TRỪ. Hai phép trên chỉ chạm lớp trigger; hơn nửa số
    // cạnh lại đi qua cửa miễn trừ, nên cửa ấy cũng phải có phép thử của nó.
    // 3a nhắm cơ chế đông nhất (`khong_policy_insert`), 3b nhắm cơ chế tinh vi
    // nhất (`policy_tu_kiem`) — hai cái này cộng lại gánh gần hết danh sách, và
    // một lớp kiểm chưa từng đỏ thì chưa biết nó có chạy hay không.
    await c.query("savepoint be3a");
    await c.query(`create policy zz_be_gia on public.voucher_redemptions
                     for insert to authenticated with check (true)`);
    const sau3a = soat(await docCsdl());
    const bat3a = sau3a.coCheSai.some((s) => s.khoa === "voucher_redemptions.voucher_id");
    console.log(`  Bẻ 3a · mở policy INSERT cho voucher_redemptions → ${sau3a.coCheSai.length} miễn trừ khai sai` +
      `${bat3a ? " ✓ có voucher_redemptions.voucher_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat3a) ma = 1;
    await c.query("rollback to savepoint be3a");

    await c.query("savepoint be3b");
    await c.query("drop policy chat_reactions_insert on public.chat_reactions");
    const sau3b = soat(await docCsdl());
    const bat3b = sau3b.coCheSai.some((s) => s.khoa === "chat_reactions.message_id");
    console.log(`  Bẻ 3b · xoá policy tự kiểm chat_reactions_insert → ${sau3b.coCheSai.length} miễn trừ khai sai` +
      `${bat3b ? " ✓ có chat_reactions.message_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat3b) ma = 1;
    await c.query("rollback to savepoint be3b");

    // Bẻ 4 — HẠ CẤP một khoá ngoại ghép về khoá một cột. Đây là hình dạng thật
    // của việc lỡ tay huỷ #359: quan hệ vẫn còn, chỉ mất vế `tenant_id`. Cạnh
    // phải hiện lại trong bảng đếm và chuyển ĐỎ, vì lúc đó nó không còn chốt
    // nào và cũng không ai khai miễn trừ cho nó.
    await c.query("savepoint be4");
    await c.query("alter table public.activities drop constraint activities_contact_id_cung_tiem");
    await c.query(`alter table public.activities
                     add constraint zz_be_gia_fkey foreign key (contact_id) references public.contacts(id)`);
    const sau4 = soat(await docCsdl());
    const bat4 = sau4.do_.some((d) => d.khoa === "activities.contact_id");
    console.log(`  Bẻ 4 · hạ khoá ghép activities.contact_id về 1 cột → ${sau4.do_.length} cạnh đỏ` +
      `${bat4 ? " ✓ có activities.contact_id" : " ✗ KHÔNG bắt được"}`);
    if (!bat4) ma = 1;
    await c.query("rollback to savepoint be4");

    const lai = soat(await docCsdl());
    console.log(`  Sau khi rollback: ${lai.do_.length} cạnh đỏ · ${lai.coCheSai.length} miễn trừ khai sai (cả hai phải về 0)`);
    if (lai.do_.length !== 0 || lai.coCheSai.length !== 0) ma = 1;
  } finally {
    await c.query("rollback");
    await c.end();
  }
  console.log(ma === 0
    ? "\n[tu-be] ✓ Cổng CHUYỂN ĐỎ khi bị phá, và tự xanh lại sau rollback."
    : "\n[tu-be] ✗ Cổng KHÔNG bắt được — nó không canh được gì.");
  process.exit(ma);
}

// ══════════════════════════════════════════════════════════════════════
// Lượt chạy thường
// ══════════════════════════════════════════════════════════════════════
const kq = soat(await docCsdl());
await c.end();

let ma = 0;
console.log(`[soat-canh-cheo-tiem] ${kq.tong} cạnh khoá ngoại giữa hai bảng đều có tenant_id`);
console.log(`  ${kq.coGhep} chặn bằng khoá ngoại ghép · ${kq.coChot} có chốt (đọc thân hàm trigger)` +
  ` · ${kq.daKiem} miễn trừ CƠ CHẾ TRA LẠI CÒN ĐÚNG` +
  ` · ${kq.chuaMayKiem} miễn trừ máy chưa kiểm được (lý do ở tầng ứng dụng) · ${kq.do_.length} ĐỎ`);

if (kq.do_.length > 0) {
  ma = 1;
  console.error("\n✗ CẠNH CHÉO TIỆM KHÔNG CÓ CHỐT, cũng không được khai miễn trừ:");
  for (const d of kq.do_) {
    console.error(`\n  ${d.bang_con}.${d.cot}  →  ${d.bang_cha}`);
    console.error(`    Người tiệm A ghi được dòng ${d.bang_con} mang tenant_id = A nhưng ${d.cot}`);
    console.error(`    trỏ sang bản ghi ${d.bang_cha} của tiệm B. RLS thấy tenant_id khớp nên cho qua.`);
    console.error(`    SỬA — làm ĐÚNG THỨ TỰ, đừng đảo:`);
    console.error(`      ① ĐO TRƯỚC: dựng 2 tiệm trong 1 giao dịch, đóng vai authenticated, thử ghi,`);
    console.error(`         rollback. "Chưa có chốt" KHÔNG đồng nghĩa "có lỗ" — 15/41 cạnh đo ngày`);
    console.error(`         20/08 đã chặn sẵn nhờ RLS/policy.`);
    console.error(`      ② CHẶN thì khai vào MIEN_TRU của ${path.basename(fileURLToPath(import.meta.url))}`);
    console.error(`         kèm lý do + bằng chứng đo được (cái gì chặn, ngày nào).`);
    console.error(`      ③ LỌT thì thêm trigger ${d.bang_con}_tenant_guard theo khuôn có sẵn —`);
    console.error(`         đọc supabase/migrations/20260820000205_*.sql rồi chép, đừng nghĩ khuôn mới.`);
  }
}

if (kq.coCheSai.length > 0) {
  ma = 1;
  console.error("\n✗ MIỄN TRỪ KHAI CƠ CHẾ KHÔNG CÒN ĐÚNG — dòng `coChe` nói một đằng, CSDL một nẻo:");
  for (const s of kq.coCheSai) console.error(`\n  ${s.khoa}  (khai \`${s.coChe}\`)\n    ${s.vi}`);
  console.error("\n  SỬA — đừng đổi `coChe` cho vừa, đó là nới tiêu chí cho đủ xanh:");
  console.error("    ① ĐO LẠI cạnh bằng `node scripts/do-canh-cheo-tiem.mjs`.");
  console.error("    ② CHẶN thì cập nhật `viSao` + `bangChung` + `coChe` cho khớp cơ chế THẬT.");
  console.error("    ③ LỌT thì bỏ mục miễn trừ và thêm chốt — cạnh đang hở thật.");
}

if (kq.thuaMienTru.length > 0) {
  ma = 1;
  console.error("\n✗ KHAI MIỄN TRỪ THỪA — cạnh này ĐÃ có chốt thật, dòng miễn trừ nói sai về code:");
  for (const t of kq.thuaMienTru) console.error(`    ${t.khoa} — đang được chốt bởi: ${t.chot.join(", ")}`);
  console.error("  SỬA: xoá các khoá đó khỏi MIEN_TRU.");
}

if (kq.mienTruMoCoi.length > 0) {
  ma = 1;
  console.error("\n✗ KHAI MIỄN TRỪ MỒ CÔI — không còn cạnh nào mang tên này (bảng/cột đã đổi hoặc đã xoá):");
  for (const k of kq.mienTruMoCoi) console.error(`    ${k}`);
  console.error("  SỬA: xoá các khoá đó khỏi MIEN_TRU — giữ lại là để cổng canh một thứ không tồn tại.");
}

// Câu chốt nói đúng cái vừa kiểm, không nói hơn: `chua_may_kiem_duoc` được gọi
// tên ra đây chứ không nấp sau chữ "có bằng chứng" — đó chính là cái sai mà lớp
// `coChe` sinh ra để chữa.
console.log(ma !== 0 ? ""
  : `\n✓ Mọi cạnh chéo tiệm đều có chốt, hoặc có miễn trừ mà cơ chế vừa tra lại còn đúng.` +
    (kq.chuaMayKiem > 0 ? `\n  (trừ ${kq.chuaMayKiem} cạnh khai \`chua_may_kiem_duoc\` — cổng KHÔNG kiểm được, đừng đọc thành đã an toàn)` : ""));
process.exit(ma);
