#!/usr/bin/env node
/**
 * RLS smoke test chạy TRỰC TIẾP trên Postgres (không cần service key):
 * mô phỏng JWT claims bằng set_config, toàn bộ trong 1 transaction ROLLBACK — không để lại dữ liệu.
 * Cần env SUPABASE_DB_URL.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Thiếu SUPABASE_DB_URL");
  process.exit(1);
}
// TLS verify-full với CA Supabase đã ghim (supabase/supabase-ca.crt)
const caPath = new URL("../supabase/supabase-ca.crt", import.meta.url);
const c = new pg.Client({
  connectionString: url,
  ssl: { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true },
});
await c.connect();

// ── Chốt tự cứu: KHÔNG để lại giao dịch treo nếu tiến trình bị cắt ─────────
//
// TÌM RA NGUYÊN NHÂN GỐC (21/08) của lỗi "cổng chập chờn 55P03" đã đeo bám từ
// việc #176 và tái phát nhiều lần: **không phải do migration**. Cả bộ kiểm chạy
// trong MỘT giao dịch rồi rollback ở cuối; khi lần chạy trước bị cắt giữa chừng
// (hết giờ chờ, Ctrl-C, cửa sổ đóng), kết nối đi qua trình gom kết nối nên phía
// máy chủ KHÔNG nhận ra client đã chết — phiên nằm lại ở trạng thái "đang mở
// giao dịch", giữ nguyên khoá trên `app_config`. Lần chạy SAU đụng đúng khoá đó
// và đỏ, trong khi mã hoàn toàn đúng.
//
// Đã đo tận nơi: một phiên treo 6 phút, câu lệnh cuối là của chính bộ kiểm này,
// đang giữ hai khoá trên `app_config`.
//
// Bản vá: bảo Postgres tự cắt phiên nếu nó nằm im trong giao dịch quá 90 giây.
// 90s rộng hơn nhiều so với bước chậm nhất của bộ kiểm, nên không cắt nhầm lần
// chạy đang khoẻ; nhưng lần chạy CHẾT thì tự dọn sau đúng 90 giây thay vì nằm
// đó tới khi có người phát hiện. Chốt nằm ở TẦNG MÁY CHỦ nên vẫn hiệu lực kể cả
// khi tiến trình node bị giết ngay lập tức, không kịp chạy dòng dọn dẹp nào.
//
// ⚠️ ĐO LẠI CHIỀU 21/08: DÒNG DƯỚI ĐÂY KHÔNG ĐỦ. Giữ lại vì nó vẫn dọn được ca
// phiên chết hẳn, nhưng ĐỪNG tin là đã xong việc #176. Chốt này tính giờ theo
// `state_change`, mà qua trình gom kết nối (Supavisor) mốc ấy liên tục được làm
// mới — đồng hồ không bao giờ chạy hết. Đo được một phiên bỏ dở giữ khoá
// `orders` suốt 194 giây trong khi đồng hồ chốt vẫn đứng ở 0, làm hỏng tám lần
// áp migration liên tiếp.
//
// Nguồn thật của phiên treo, tìm bằng cách soi tiến trình trên MÁY: máy chủ
// chạy thử trên máy lập trình nối thẳng vào cơ sở dữ liệu THẬT. Chỗ dọn thật
// nằm ở `scripts/ap-migration.mjs` (dọn phiên chờ-client quá 60 giây ngay trước
// khi xin khoá); gốc rễ của gốc rễ là việc #175, chờ founder quyết.
await c.query(`set idle_in_transaction_session_timeout = '90s'`);

// ── DỌN PHIÊN BỎ DỞ CỦA LẦN CHẠY TRƯỚC (việc #176, đợt chữa thứ ba) ─────────
//
// Cuối file này CÓ `finally { rollback; end }` đàng hoàng. Nhưng nó chỉ chạy
// khi tiến trình được kết thúc tử tế. Bộ kiểm mất năm tới chín phút; hễ ai bọc
// nó trong một cái đồng hồ đếm ngược (`timeout 560 node …` — chính là cách nó
// hay được chạy) và bộ kiểm chạy lâu hơn dự tính, thì tiến trình bị GIẾT giữa
// chừng và khối `finally` không chạy dòng nào.
//
// Qua trình gom kết nối, phía máy chủ không nhận ra client đã chết: phiên nằm
// lại ở trạng thái "đang mở giao dịch" và giữ nguyên khoá. Lần chạy SAU đụng
// đúng khoá đó rồi đỏ — mã hoàn toàn đúng. Đo được: một phiên giữ hàng
// `platform_bot_chat_id` của `private.app_config` suốt 432 giây, làm hỏng ba
// lần chạy liên tiếp; câu lệnh cuối của nó là `rollback to savepoint sp_user_94`
// — tức chính bộ kiểm này.
//
// Nên dọn ở ĐÂY, đầu mỗi lần chạy: chỉ cắt phiên ĐANG CHỜ CLIENT (không chạy
// câu nào) và đã mở giao dịch quá 60 giây. Một lần chạy đang khoẻ không bao giờ
// nằm ở trạng thái đó lâu như vậy — các câu lệnh của nó nối đuôi nhau, khoảng
// nghỉ tính bằng mili giây.
//
// Đây là đợt chữa THỨ BA cho cùng một việc. Hai đợt trước đều chữa đúng một
// phần và đều tưởng là xong; giữ lại cả ba lớp vì mỗi lớp bịt một đường chết
// khác nhau, và ghi rõ ở đây để người sau không gỡ nhầm lớp nào.
{
  const don = await c.query(`
    select pg_terminate_backend(pid), pid
      from pg_stat_activity
     where state = 'idle in transaction'
       and xact_start < now() - interval '60 seconds'
       and pid <> pg_backend_pid()
       and backend_type = 'client backend'`);
  if (don.rowCount > 0) {
    console.log(`[rls-smoke] Đã dọn ${don.rowCount} phiên bỏ dở của lần chạy trước (việc #176).`);
  }
}

// Khám phá MỌI bảng tenant-scoped (RLS bật + có cột tenant_id) — quét generic ở cuối suite,
// bảng mới thêm trong migration tương lai tự động được phủ.
const { rows: tenantTabs } = await c.query(`
  select c.relname as t
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
  where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  order by 1`);
const genericTables = tenantTabs.map((r) => r.t);

let failed = 0;
let nCheck = 0;
const STATIC_CHECKS = 393; // số check viết tay bên dưới — cập nhật khi thêm/bớt check tĩnh (289 sau việc #177, +20 nghiệm thu D3 sổ kho V4 theo ADR-0021 mục 9: nhập/bán/hoàn ra đúng số · dịch vụ không có tồn · chốt hai lần không trừ đôi · huỷ đơn trả hàng về · view khớp sổ · bán quá tồn cho qua · sổ bất biến · đơn nháp không đụng tồn · 3 vai × 3 quyền) (+8 chuông nền tảng ADR-0007, task #84; +16 cổng khách công khai ADR-0008, task #87; +4 storefront_save_hours nguyên tử, task #88; +4 xoá tiệm không bị nhật ký chặn, migration #82; +36 V2 Lịch hẹn nền ADR-0009 mục 8, migration #83; +8 màn Cài đặt Dịch vụ & Tài nguyên ADR-0009 mục 7 việc 3; +12 AI trực việc ADR-0014 mục 10, migration #105-109 — task #126; +11 Kho tri thức ADR-0015 mục 9 (ca 1/3/4/5a/5b/9-12 — ca 2/6/7/8 cần Anthropic thật, xác nhận bằng tay), migration #113-117 — task #131; +7 chủ dự án ≠ chủ tiệm (leo thang quyền: chủ tiệm bất kỳ chiếm được quyền chủ dự án trên bot), migration #119 — task #133; +12 Zalo Bot hỏi đáp (ADR-0016, TRA CỨU không dùng AI), migration #120 — task #128; giá trị 251 đã LỆCH 2 so với thực tế trước đợt này — sửa luôn về đúng số đo được (253) trước khi +13 V3 Đơn hàng/Thu tiền ADR-0019 mục 9, migration #127-129 — task #144; +14 csatQc V6 — quyền đọc/ghi 3 vai · một lịch một phiếu · RPC khách gửi đánh giá, migration #155-156 — task #178; +5 staff_account_add_member chỉ nhận nhân viên của CHÍNH tiệm — 3 hướng chặn (nhân viên tiệm khác / người ngoài / uuid bịa) + hồ sơ người lạ vẫn vô hình + ĐỐI CHỨNG luồng tạo nhân viên còn chạy, migration #199; +13 V5 Hợp đồng & Gói định kỳ — mảng RA BẢN THẬT MÀ CHƯA CHẠY ĐƯỢC NGÀY NÀO (0/0/0 dòng sau nhiều tuần) trong khi cổng này VẪN XANH, vì nó không có ca nào cho mảng đó: 3 bước bán gói · bẫy tenant_id kèm ghim mã lỗi 42501 · 3 chốt trigger đầy/huỷ/hết-hạn · 3 vai × lưu trữ gói · ghi chéo tiệm, migration #204 — việc #193; +1 canh CẢ LỚP cột ngày mặc định phải theo giờ VN, migration #213; +14 nghiệm thu #224/#225 — cửa hẹp nguoi_lam_tiem (owner/manager đọc tên KHÔNG lộ lương · person_key có-TK=user_id / vãng-lai=employee_id · chặn vai staff · cách ly tiệm) + nap_mat/face_da_nap (đã-nạp-chưa · ảnh sai tiệm=invalid_input) + cham_cong_giup (chấm giúp trả punch_id · LUÔN gắn cờ · ghi người bấm · người ngoài=forbidden), migration #234-238; +13 nghiệm thu #226 lead chờ duyệt — lượt thứ 6 cùng IP KHÔNG bị đuổi mà vào hàng chờ · PII ở bảng riêng không policy · staff bị chặn · đọc thẳng = 0 dòng · owner đọc qua RPC · duyệt Nhận hoá thân thành contact + xoá PII · duyệt lần hai bị chặn · cách ly tiệm, migration #240; +6 nghiệm thu #230 nghỉ việc là mất quyền — khoá ngay khi tới ngày · sổ ghi đúng ai làm · cắt quyền THẬT (đọc 0 khách) · xoá ngày nghỉ không tự mở lại · ngày nghỉ tương lai chưa khoá · CHỦ TIỆM không bao giờ bị khoá, migration #280-281; +2 nghiệm thu #233 đơn phải bắt đầu từ nháp — chặn cả ba trạng thái tạo thẳng, và ĐƯỜNG CŨ VẪN THÔNG, migration #282; +4 nghiệm thu #234 tiệm trả tiền gói cước — sai khoá bị chặn · trả thiếu KHÔNG nâng gói · trả đủ thì hoá đơn thành đã trả và gói đổi thật · chuyển lại lần hai không cộng đôi, migration #286; +6 nghiệm thu #227 khách đòi xoá dữ liệu — nhân viên không mở được yêu cầu · một khách một yêu cầu chờ · XOÁ NGƯỜI (hội thoại/tên/sđt) · GIỮ SỐ (đơn hàng + tiền không suy suyển) · tắt đồng ý nhận tin · tóm tắt nói cả hai vế, migration #287-288)
const mm = STATIC_CHECKS + genericTables.length * 2;
const check = (name, cond, detail = "") => {
  nCheck++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${nCheck}/${mm} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failed++;
};

const stamp = String(Date.now() % 1e7);
const uA = randomUUID(), uB = randomUUID(), uC = randomUUID();

try {
  await c.query("begin");
  // Điều tra việc #176: DB này có traffic PostgREST THẬT chạy song song (không
  // phải CSDL rảnh riêng cho test). Một ALTER TABLE (migration) đang xếp hàng
  // chờ ACCESS EXCLUSIVE thì MỌI truy vấn sau, kể cả SELECT không đụng độ gì
  // với người giữ khoá gốc, cũng bị Postgres bắt xếp hàng theo SAU nó (luật
  // công bằng FIFO) — đã tái hiện được bằng tay. Không có lock_timeout thì
  // script treo lặng lẽ tới hết statement_timeout (đo được 2 phút) rồi mới báo
  // lỗi mơ hồ. Đặt lock_timeout ngắn để lỗi (nếu có) ra NHANH và RÕ (code
  // 55P03 lock_not_available) thay vì treo rồi chết mơ hồ.
  await c.query("set local lock_timeout = '10s'");

  // ---- seed bằng quyền postgres (bypass RLS như backend thật) ----
  await c.query(
    `insert into auth.users (id, aud, role, email) values
     ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),($5,'authenticated','authenticated',$6)`,
    [uA, `smoke-a-${stamp}@t.local`, uB, `smoke-b-${stamp}@t.local`, uC, `smoke-c-${stamp}@t.local`],
  );
  const { rows: [tA] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Smoke A', $1, true) returning id`, [`smoke-a-${stamp}`]);
  const { rows: [tB] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Smoke B', $1, true) returning id`, [`smoke-b-${stamp}`]);
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($3,$4,'owner')`,
    [tA.id, uA, tB.id, uB]);
  await c.query(
    `insert into public.domain_events (tenant_id, event_type, aggregate_type, aggregate_id) values ($1,'smoke.seed','tenant',$2)`,
    [tB.id, String(tB.id)]);

  // helper: chạy fn dưới danh nghĩa user (role authenticated + JWT claims giả lập)
  //
  // Tên savepoint phải DUY NHẤT mỗi lần gọi — Postgres cho phép nhiều savepoint
  // trùng tên (không báo lỗi), và `ROLLBACK TO SAVEPOINT <tên trùng>` LUÔN nhắm
  // vào bản GẦN NHẤT còn tồn tại, bất kể đang ở scope nào. Một tên "sp_user" cố
  // định từng làm asUser() LỒNG NHAU (như ca4/ca10-12 Kho tri thức) rollback SAI
  // savepoint: finally của khối NGOÀI vô tình nhắm lại savepoint của khối TRONG
  // (đã rollback rồi nhưng Postgres không "xoá" nó), nên dòng ghi ở khối NGOÀI
  // (trước khi khối TRONG mở) không hề bị dọn — RÒ RỈ DỮ LIỆU âm thầm sang ca
  // sau. Bắt được vì ca 5a Kho tri thức đếm ĐÚNG 200 dòng nên lộ ra 1 dòng dư
  // từ ca4; các nơi lồng khác (dòng ~193/202, ~1296/1327) không có phép đếm
  // chính xác nên bug này có thể đã âm thầm tồn tại từ trước mà không lộ.
  let spSeq = 0;
  async function asUser(userId, claims, fn) {
    const sp = `sp_user_${++spSeq}`;
    await c.query(`savepoint ${sp}`);
    // ⚠️ THÊM 21/08 cùng migration #301. Trước đó helper này chỉ đặt phiếu đăng
    // nhập giả mà KHÔNG tạo tư cách thành viên — một chỗ mô phỏng THIẾU so với
    // đời thật, vì người dùng thật luôn có dòng trong `tenant_members`.
    //
    // Chỗ thiếu ấy vô hại cho tới khi `current_tenant_id()` được vá để hỏi lại
    // tư cách thay vì tin phiếu. Lúc đó 9 ca đỏ cùng lúc với `no_tenant_context`
    // — và nếu đọc vội thì trông y hệt "bản vá làm hỏng sản phẩm", trong khi
    // thật ra là "bộ kiểm mô phỏng sai đời thật". Suýt lùi một bản vá đúng.
    //
    // `do nothing` chứ không `do update`: ca nào CỐ Ý dựng sẵn tư cách đã bị gỡ
    // (kiểm luật nghỉ việc) thì phải giữ nguyên, không được đánh thức dậy.
    if (claims?.tenant_id) {
      // Vai trong tư cách thành viên phải là một trong 5 giá trị hợp lệ. Có ca
      // CỐ Ý truyền vai rác (kể cả tiếng Việt) để kiểm rằng chốt vai không nhận
      // bừa — với những ca đó, ghi 'staff' vào bảng là đủ, vì `app_role()` vẫn
      // đọc vai từ phiếu đăng nhập chứ không từ đây.
      const VAI = ["owner", "admin", "manager", "staff", "viewer"];
      const vai = VAI.includes(claims.role) ? claims.role : "staff";
      // Bọc savepoint riêng và NUỐT lỗi: có ca cố ý dựng một người KHÔNG hề tồn
      // tại để kiểm "người ngoài tiệm bị chặn" — với họ thì khoá ngoại tới bảng
      // người dùng sẽ nổ, và đó là chuyện đúng. Không nuốt thì cả giao dịch chết
      // và mọi ca sau đều đỏ theo, che mất kết quả thật.
      await c.query(`savepoint sp_tm_${spSeq}`);
      try {
        await c.query(
          `insert into public.tenant_members (tenant_id, user_id, role, status)
           values ($1, $2, $3::public.tenant_role, 'active')
           on conflict (tenant_id, user_id) do nothing`,
          [claims.tenant_id, userId, vai],
        );
        await c.query(`release savepoint sp_tm_${spSeq}`);
      } catch {
        await c.query(`rollback to savepoint sp_tm_${spSeq}`);
      }
    }
    await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
      [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: claims })]);
    try { return await fn(); } finally { await c.query(`rollback to savepoint ${sp}`); }
  }

  console.log("[rls-smoke] Kiểm tra cách ly tenant:");
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const t = await c.query(`select id from public.tenants`);
    check("A chỉ thấy đúng 1 tenant của mình", t.rowCount === 1 && t.rows[0].id === tA.id, JSON.stringify(t.rows));
    const cross = await c.query(`select id from public.tenants where id = $1`, [tB.id]);
    check("A đọc tenant B = 0 dòng", cross.rowCount === 0);
    const m = await c.query(`select user_id from public.tenant_members where tenant_id = $1`, [tB.id]);
    check("A đọc members tenant B = 0 dòng", m.rowCount === 0);
    const u = await c.query(`update public.tenants set name='hacked' where id=$1`, [tB.id]);
    check("A sửa tenant B = 0 dòng", u.rowCount === 0);
    const e = await c.query(`select id from public.domain_events where tenant_id=$1`, [tB.id]);
    check("A đọc events tenant B = 0 dòng", e.rowCount === 0);
    let insErr = null;
    await c.query("savepoint sp_ins");
    try { await c.query(`insert into public.domain_events (tenant_id,event_type,aggregate_type,aggregate_id) values ($1,'hack','x','1')`, [tA.id]); }
    catch (err) { insErr = err; }
    await c.query("rollback to savepoint sp_ins");
    check("Client không insert thẳng domain_events", !!insErr, "insert thành công — SAI");
    const upd = await c.query(`update public.domain_events set event_type='tampered' where tenant_id=$1`, [tA.id]);
    check("Client update domain_events = 0 dòng", upd.rowCount === 0);
  });

  console.log("[rls-smoke] Kiểm tra profiles (không có tenant_id — quét generic không phủ):");
  // uA/uB đã có profile nhờ trigger on_auth_user_created khi seed auth.users ở trên
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const own = await c.query(`select display_name from public.profiles where user_id = $1`, [uA]);
    check("A đọc được profile của chính mình", own.rowCount === 1, "trigger on_auth_user_created chưa tạo profile");
    const other = await c.query(`select display_name from public.profiles where user_id = $1`, [uB]);
    check("A đọc profile user KHÔNG chung tenant = 0 dòng", other.rowCount === 0, JSON.stringify(other.rows));
  });

  console.log("[rls-smoke] Kiểm tra fallback KHÔNG có claim (hook chưa bật):");
  await asUser(uA, {}, async () => {
    const t = await c.query(`select id from public.tenants`);
    check("A (không claim) vẫn thấy đúng tenant của mình qua membership", t.rowCount === 1 && t.rows[0].id === tA.id, JSON.stringify(t.rows));
    const cross = await c.query(`select id from public.tenants where id = $1`, [tB.id]);
    check("A (không claim) đọc tenant B = 0 dòng", cross.rowCount === 0);
  });

  console.log("[rls-smoke] Kiểm tra một tài khoản nhiều tiệm (ADR-0005, migration #66):");
  // uA sở hữu tA; gắn thêm uA vào tB với vai admin để mô phỏng "nhiều tiệm".
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'admin')`,
    [tB.id, uA],
  );
  await asUser(uA, {}, async () => {
    // Không có claim -> nhánh fallback của current_tenant_id() phải đọc
    // profiles.active_tenant_id trước, rồi mới rơi về tiệm cũ nhất.
    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`update public.profiles set active_tenant_id=$1 where user_id=$2`, [tB.id, uA]);
    await c.query(`select set_config('role','authenticated', true)`);
    const cur = await c.query(`select public.current_tenant_id() as id, public.app_role() as role`);
    check(
      "current_tenant_id() ưu tiên active_tenant_id (B) thay vì tiệm cũ nhất (A)",
      cur.rows[0].id === tB.id && cur.rows[0].role === "admin",
      JSON.stringify(cur.rows[0]),
    );

    // active_tenant_id trỏ vào tiệm CÓ THẬT nhưng A không phải thành viên -> phải tự rơi về tiệm hợp lệ, không kẹt.
    await c.query(`select set_config('role','postgres', true)`);
    const { rows: [foreignTenant] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Foreign', $1, true) returning id`, [`smoke-foreign-${stamp}`]);
    await c.query(`update public.profiles set active_tenant_id=$1 where user_id=$2`, [foreignTenant.id, uA]);
    await c.query(`select set_config('role','authenticated', true)`);
    const curBad = await c.query(`select public.current_tenant_id() as id`);
    check(
      "active_tenant_id trỏ tiệm không hợp lệ -> tự rơi về tiệm hợp lệ (không null, không lỗi)",
      curBad.rows[0].id === tA.id || curBad.rows[0].id === tB.id,
      JSON.stringify(curBad.rows[0]),
    );

    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`update public.profiles set active_tenant_id=$1 where user_id=$2`, [tA.id, uA]);
    await c.query(`select set_config('role','authenticated', true)`);
  });

  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const { rows: mine } = await c.query(`select tenant_id, role, is_active from public.my_tenants()`);
    check("my_tenants() thấy đủ 2 tiệm của A", mine.length === 2, JSON.stringify(mine));
    const active = mine.find((r) => r.is_active);
    check("my_tenants() đánh dấu ĐÚNG 1 tiệm active, khớp current_tenant_id()", active?.tenant_id === tA.id);

    const { rows: swOk } = await c.query(`select public.switch_tenant($1)`, [tB.id]);
    check("switch_tenant sang tiệm mình là thành viên — không lỗi", swOk !== undefined);
    await c.query(`select set_config('role','postgres', true)`);
    const prof = await c.query(`select active_tenant_id from public.profiles where user_id=$1`, [uA]);
    check("switch_tenant cập nhật profiles.active_tenant_id", prof.rows[0].active_tenant_id === tB.id);
    await c.query(`select set_config('role','authenticated', true)`);

    let swErr = null;
    await c.query("savepoint sp_switch_bad");
    try { await c.query(`select public.switch_tenant($1)`, [randomUUID()]); }
    catch (err) { swErr = err; }
    await c.query("rollback to savepoint sp_switch_bad");
    check("switch_tenant sang tiệm KHÔNG phải thành viên — bị chặn", !!swErr && /not_a_member/.test(swErr.message), swErr?.message);
  });

  // B không liên quan gì tới tiệm A/B của uA — gọi my_tenants() không được thấy tiệm của A.
  await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
    const { rows: mineB } = await c.query(`select tenant_id from public.my_tenants()`);
    check(
      "B gọi my_tenants() KHÔNG thấy tiệm A của uA (không rò rỉ chéo user)",
      mineB.length === 1 && mineB[0].tenant_id === tB.id,
      JSON.stringify(mineB),
    );
  });

  console.log("[rls-smoke] Kiểm tra can_create_tenant() chỉ đếm tiệm mình LÀM CHỦ (migration #66):");
  // `can_create_tenant()` (migration #66) CHỈ đếm tiệm `is_sample=false` — đúng
  // ý: vào tiệm mẫu không được tính vào hạn mức thật. Nhưng tB (fixture của cả
  // file) tự nó là `is_sample=true` (đổi khi vá bug chuông báo giả — mọi tiệm
  // smoke đều gắn is_sample=true để không bắn cảnh báo thật) — nên B "làm chủ
  // tB" KHÔNG đụng hạn mức. Dựng thêm MỘT tiệm is_sample=false riêng cho đúng
  // ca này, để test lại đúng hành vi "đã làm chủ 1 tiệm THẬT thì hết hạn mức".
  const { rows: [tBReal] } = await c.query(
    `insert into public.tenants (name, slug, is_sample) values ('Smoke B Real', $1, false) returning id`,
    [`smoke-b-real-${stamp}`]);
  await c.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner')`, [tBReal.id, uB]);
  await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
    // uC vào tB với vai staff — KHÔNG phải chủ tiệm nào, vẫn phải "còn mở được tiệm".
    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'staff')`, [tB.id, uC]);
  });
  await asUser(uC, { tenant_id: tB.id, role: "staff" }, async () => {
    const { rows: [r] } = await c.query(`select public.can_create_tenant() as ok`);
    check("Nhân viên (staff, không phải owner tiệm nào) VẪN được tính là còn mở được tiệm", r.ok === true, JSON.stringify(r));
  });
  await asUser(uB, { tenant_id: tBReal.id, role: "owner" }, async () => {
    const { rows: [r] } = await c.query(`select public.can_create_tenant() as ok`);
    check("Chủ tiệm B (đã làm chủ 1 tiệm THẬT, hạn mức mặc định 1) hết hạn mức", r.ok === false, JSON.stringify(r));
  });

  console.log("[rls-smoke] Kiểm tra tiệm mẫu không còn chặn người ĐÃ có tiệm thật (migration #66):");
  const { rows: [sample] } = await c.query(
    `select id, industry from public.tenants where is_sample=true and industry is not null limit 1`);
  if (sample) {
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const { rows: [r] } = await c.query(`select public.enter_sample_tenant($1) as id`, [sample.industry]);
      check("A (đã có tiệm thật) vẫn vào được tiệm mẫu — KHÔNG còn lỗi already_has_tenant", r.id === sample.id, JSON.stringify(r));
      await c.query(`select set_config('role','postgres', true)`);
      const prof = await c.query(`select active_tenant_id from public.profiles where user_id=$1`, [uA]);
      check("enter_sample_tenant đặt tiệm mẫu vừa vào làm active_tenant_id", prof.rows[0].active_tenant_id === sample.id);
      await c.query(`select set_config('role','authenticated', true)`);
      await c.query(`select public.exit_sample_tenant()`);
      await c.query(`select set_config('role','postgres', true)`);
      const prof2 = await c.query(`select active_tenant_id from public.profiles where user_id=$1`, [uA]);
      check("exit_sample_tenant xoá active_tenant_id (về null, không kẹt trong tiệm mẫu đã rời)", prof2.rows[0].active_tenant_id === null);
      await c.query(`select set_config('role','authenticated', true)`);
    });
  } else {
    check("Có sẵn ít nhất 1 tiệm mẫu để kiểm enter_sample_tenant", false, "không tìm thấy tiệm mẫu nào có industry — bỏ qua nhóm này");
  }

  console.log("[rls-smoke] Kiểm tra đăng nhập bằng SĐT không cần mã tiệm (migration #68):");
  {
    // CHỐT CHẶN QUAN TRỌNG NHẤT của nhóm này: hàm tra "SĐT làm ở tiệm nào" mà
    // mở cho anon/authenticated thì thành công cụ dò chỗ làm của người khác.
    const { rows: [acl] } = await c.query(`
      select has_function_privilege('anon','public.staff_login_shops(text)','execute') as anon,
             has_function_privilege('authenticated','public.staff_login_shops(text)','execute') as auth_,
             has_function_privilege('service_role','public.staff_login_shops(text)','execute') as svc`);
    check("staff_login_shops: khách vãng lai KHÔNG gọi được", acl.anon === false, JSON.stringify(acl));
    check("staff_login_shops: người đã đăng nhập KHÔNG gọi được", acl.auth_ === false, JSON.stringify(acl));
    check("staff_login_shops: tầng máy chủ vẫn gọi được", acl.svc === true, JSON.stringify(acl));

    await c.query(`select set_config('role','postgres', true)`);
    // staff_login_shops() CHỦ Ý lọc is_sample=false ("tiệm mẫu không ai làm
    // nhân viên ở đó") — mà tA là tiệm mẫu (is_sample=true, gắn từ lúc vá bug
    // chuông báo giả, mọi tiệm smoke đều vậy — xem chú thích dòng ~199). Dùng
    // tA cho ca này luôn ra rỗng dù hàm hoàn toàn đúng — lỗi Ở BÀI TEST, không
    // phải sản phẩm (bắt được lúc nghiệm thu D3 việc #144, theo dõi ở #151).
    // Dựng riêng 1 tiệm THẬT (is_sample=false), cùng khuôn với tBReal ở trên.
    const { rows: [tPhoneReal] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke SDT', $1, false) returning id`,
      [`smoke-sdt-${stamp}`]);
    const phone = `09${String(stamp).slice(-8)}`;
    await c.query(`update public.profiles set phone=$1 where user_id=$2`, [phone, uC]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status)
       values ($1,$2,'staff','active')
       on conflict (tenant_id, user_id) do update set status='active'`,
      [tPhoneReal.id, uC],
    );
    const shops = await c.query(`select * from public.staff_login_shops($1)`, [phone]);
    check("SĐT tra ra đúng tiệm đang làm",
      shops.rowCount === 1 && shops.rows[0].tenant_slug === `smoke-sdt-${stamp}`,
      JSON.stringify(shops.rows));

    const messy = await c.query(`select * from public.staff_login_shops($1)`,
      [`${phone.slice(0, 3)} ${phone.slice(3, 6)}-${phone.slice(6)}`]);
    check("Gõ SĐT có khoảng trắng/gạch vẫn tra đúng", messy.rowCount === 1, JSON.stringify(messy.rows));

    await c.query(`update public.tenant_members set status='removed' where tenant_id=$1 and user_id=$2`, [tPhoneReal.id, uC]);
    const gone = await c.query(`select * from public.staff_login_shops($1)`, [phone]);
    check("Bị gỡ khỏi tiệm -> KHÔNG còn đăng nhập được bằng SĐT", gone.rowCount === 0, JSON.stringify(gone.rows));

    const unknown = await c.query(`select * from public.staff_login_shops($1)`, ["0900000000"]);
    check("SĐT lạ -> rỗng, không lộ gì", unknown.rowCount === 0, JSON.stringify(unknown.rows));

    // dọn dấu vết + TRẢ role về postgres — các nhóm sau seed bằng quyền postgres
    await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tA.id, uC]);
    await c.query(`update public.profiles set phone=null where user_id=$1`, [uC]);
    await c.query(`select set_config('role','postgres', true)`);
  }

  console.log("[rls-smoke] Kiểm tra RPC create_tenant (user mới, chưa có tenant):");
  await asUser(uC, {}, async () => {
    const { rows: [r] } = await c.query(`select public.create_tenant('Smoke C', $1) as id`, [`smoke-c-${stamp}`]);
    check("create_tenant trả về id", !!r.id);
    // định danh definer: kiểm tra bằng quyền hiện tại (đang là C, đã có claims? chưa — claims cũ) → kiểm tra qua postgres sau savepoint không được vì rollback.
    const mem = await c.query(
      `select 1 from public.tenant_members where tenant_id=$1 and user_id=$2 and role='owner'`, [r.id, uC]);
    // asUser C không có tenant claim → RLS chặn select... dùng hàm definer? Kiểm tra gián tiếp: đọc lại bằng savepoint nội bộ đổi role về postgres
    await c.query(`select set_config('role','postgres', true)`);
    const mem2 = await c.query(
      `select 1 from public.tenant_members where tenant_id=$1 and user_id=$2 and role='owner'`, [r.id, uC]);
    check("create_tenant tạo membership owner", mem2.rowCount === 1, JSON.stringify(mem.rows));
    const ev = await c.query(
      `select 1 from public.domain_events where tenant_id=$1 and event_type='tenant.created'`, [r.id]);
    check("create_tenant phát event tenant.created", ev.rowCount === 1);
  });

  console.log("[rls-smoke] Kiểm tra GĐ1 CRM + Inbox:");
  // seed CRM/Inbox bằng quyền postgres (mô phỏng service role):
  // kênh + hội thoại + tin nhắn cho cả A và B, contact cho B
  const { rows: [chA] } = await c.query(
    `insert into public.channels (tenant_id, type, external_id, display_name) values ($1,'zalo_oa',$2,'OA Smoke A') returning id`,
    [tA.id, `oa-a-${stamp}`]);
  const { rows: [chB] } = await c.query(
    `insert into public.channels (tenant_id, type, external_id, display_name) values ($1,'zalo_oa',$2,'OA Smoke B') returning id`,
    [tB.id, `oa-b-${stamp}`]);
  await c.query(`insert into public.contacts (tenant_id, full_name) values ($1,'Khách Smoke B')`, [tB.id]);
  const { rows: [cvA] } = await c.query(
    `insert into public.conversations (tenant_id, channel_id, external_user_id) values ($1,$2,$3) returning id`,
    [tA.id, chA.id, `zl-a-${stamp}`]);
  const { rows: [cvB] } = await c.query(
    `insert into public.conversations (tenant_id, channel_id, external_user_id) values ($1,$2,$3) returning id`,
    [tB.id, chB.id, `zl-b-${stamp}`]);
  const { rows: [msgA] } = await c.query(
    `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content) values ($1,$2,'in','user','xin chào A') returning id`,
    [tA.id, cvA.id]);
  await c.query(
    `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content) values ($1,$2,'in','user','xin chào B')`,
    [tB.id, cvB.id]);

  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const cb = await c.query(`select id from public.contacts where tenant_id=$1`, [tB.id]);
    check("A đọc contacts tenant B = 0 dòng", cb.rowCount === 0);
    const mb = await c.query(`select id from public.messages where tenant_id=$1`, [tB.id]);
    check("A đọc messages tenant B = 0 dòng", mb.rowCount === 0);
    const mu = await c.query(`update public.messages set content='tampered' where id=$1`, [msgA.id]);
    check("A update message tenant A = 0 dòng (append-only)", mu.rowCount === 0);
    const ins = await c.query(
      `insert into public.contacts (tenant_id, full_name, owner_id) values ($1,'Khách mới A',$2) returning id`,
      [tA.id, uA]);
    check("A tạo contact cho tenant mình = 1 dòng", ins.rowCount === 1);

    // Trigger nhật ký bản ghi (24q, migration #67) — bắt bằng trigger, không
    // rải record_audit_log() ở từng hàm TS.
    await c.query(`select set_config('role','postgres', true)`);
    const audit1 = await c.query(
      `select action from public.record_audit where entity_type='contact' and entity_id=$1 order by id`,
      [ins.rows[0].id]);
    check("Tạo contact tự ghi 1 dòng action='created'", audit1.rows.length === 1 && audit1.rows[0].action === "created", JSON.stringify(audit1.rows));
    await c.query(`select set_config('role','authenticated', true)`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uA, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "owner" } })]);
    await c.query(`update public.contacts set last_interaction_at=now() where id=$1`, [ins.rows[0].id]);
    await c.query(`update public.contacts set full_name='Khách mới A (sửa)' where id=$1`, [ins.rows[0].id]);
    await c.query(`select set_config('role','postgres', true)`);
    const audit2 = await c.query(
      `select action, diff from public.record_audit where entity_type='contact' and entity_id=$1 order by id`,
      [ins.rows[0].id]);
    check(
      "Đổi last_interaction_at (cột ồn) không thêm log, đổi full_name mới thêm -> tổng đúng 2 dòng",
      audit2.rows.length === 2 && audit2.rows[1].action === "updated",
      JSON.stringify(audit2.rows.map((r) => r.action)),
    );
    check(
      "diff của lần sửa CHỈ có full_name, không lẫn last_interaction_at",
      audit2.rows[1]?.diff && Object.keys(audit2.rows[1].diff).join(",") === "full_name",
      JSON.stringify(audit2.rows[1]?.diff),
    );
    await c.query(`select set_config('role','authenticated', true)`);
    const hist = await c.query(`select * from public.contact_audit_history($1, 10)`, [ins.rows[0].id]);
    check("contact_audit_history() (owner) trả đủ 2 dòng", hist.rows.length === 2, JSON.stringify(hist.rows.length));
    await c.query(`select set_config('role','postgres', true)`);
  });

  // Vai viewer gọi contact_audit_history() -> RLS record_audit_select chỉ
  // owner/admin, phải ra 0 dòng dù RPC chạy được (không lộ qua đường phụ).
  await asUser(uB, { tenant_id: tB.id, role: "viewer" }, async () => {
    const contactB = await c.query(`select id from public.contacts where tenant_id=$1 limit 1`, [tB.id]);
    if (contactB.rowCount) {
      const histViewer = await c.query(`select * from public.contact_audit_history($1, 10)`, [contactB.rows[0].id]);
      check("Vai viewer gọi contact_audit_history() -> 0 dòng", histViewer.rows.length === 0, JSON.stringify(histViewer.rows));
    }
  });

  // Tenant mới qua create_tenant phải có sẵn pipeline + lead_sources mặc định
  await asUser(uC, {}, async () => {
    const { rows: [r] } = await c.query(`select public.create_tenant('Smoke Seed', $1) as id`, [`smoke-seed-${stamp}`]);
    await c.query(`select set_config('role','postgres', true)`); // kiểm seed bằng quyền postgres (pattern sẵn có)
    const p = await c.query(`select id from public.pipelines where tenant_id=$1 and is_default`, [r.id]);
    check("Tenant mới có 1 pipeline mặc định", p.rowCount === 1);
    // migration #13: 6 stage — 4 mở + đúng 1 'won' + 1 'lost' (spec CRM §5)
    const s = await c.query(`select kind from public.pipeline_stages where tenant_id=$1`, [r.id]);
    check("Pipeline mặc định có 6 stage", s.rowCount === 6, `được ${s.rowCount}`);
    const kinds = s.rows.map((x) => x.kind);
    check(
      "Pipeline mặc định có đúng 1 cột Thắng + 1 cột Thua",
      kinds.filter((k) => k === "won").length === 1 && kinds.filter((k) => k === "lost").length === 1,
      kinds.join(","),
    );
    const ls = await c.query(`select 1 from public.lead_sources where tenant_id=$1`, [r.id]);
    // 5 từ #87 (V1.5, ADR-0008): +"Form/Landing" bên cạnh Zalo/Facebook/Giới thiệu/Khác.
    check("Tenant mới có 5 lead_sources mặc định", ls.rowCount === 5, `được ${ls.rowCount}`);
    const lr = await c.query(`select 1 from public.lost_reasons where tenant_id=$1`, [r.id]);
    check("Tenant mới có 5 lý do thua mặc định", lr.rowCount === 5, `được ${lr.rowCount}`);
  });

  // ==========================================================================
  // Migration #40 — MỌI hàm security definer phải ghim `pg_temp` cuối search_path
  // ==========================================================================
  // Không ghim thì Postgres tìm schema tạm TRƯỚC, mở đường đánh tráo bảng cho
  // hàm chạy bằng quyền `postgres`. Kiểm ở đây để migration sau lỡ tạo hàm
  // definer mà quên ghim thì cổng CI bắt được ngay.
  console.log("[rls-smoke] Kiểm tra search_path của hàm security definer:");
  {
    const { rows: sp } = await c.query(`
      select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.prosecdef
         and not exists (
           select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
            where substring(cfg from '^search_path=(.*)$')
                  ~ '(^|[,[:space:]"])pg_temp([,[:space:]"]|$)')
       order by 1`);
    check("Mọi hàm security definer đã ghim pg_temp cuối search_path", sp.length === 0,
      `còn thiếu: ${sp.map((r) => r.sig).join(", ")}`);
  }

  // ==========================================================================
  // Migration #41-A — Thông tin GÓI CƯỚC chỉ dành cho chủ tiệm + quản trị viên
  // ==========================================================================
  console.log("[rls-smoke] Kiểm tra chốt vai cho thông tin gói cước:");
  {
    // Tiệm + 4 vai RIÊNG cho phần này (không dùng lại uA/tA để không làm nhiễu
    // các kiểm tra phía sau: uA phải chỉ thuộc đúng một tiệm).
    const uOwn = randomUUID(), uAdm = randomUUID(), uMgr = randomUUID(), uStf = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6),($7,'authenticated','authenticated',$8)`,
      [uOwn, `smoke41-own-${stamp}@t.local`, uAdm, `smoke41-adm-${stamp}@t.local`,
       uMgr, `smoke41-mgr-${stamp}@t.local`, uStf, `smoke41-stf-${stamp}@t.local`]);
    const { rows: [tR] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Roles', $1, true) returning id`,
      [`smoke-roles-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status) values
       ($1,$2,'owner','active'),($1,$3,'admin','active'),
       ($1,$4,'manager','active'),($1,$5,'staff','active')`,
      [tR.id, uOwn, uAdm, uMgr, uStf]);

    const RPCS = [
      ["billing_overview", `select public.billing_overview()`],
      ["tenant_seats", `select public.tenant_seats()`],
      ["quote_plan_change", `select public.quote_plan_change('pro','month')`],
    ];
    const callRpc = async (sql) => {
      let err = null;
      await c.query("savepoint sp_role");
      try { await c.query(sql); } catch (e) { err = e.message; }
      await c.query("rollback to savepoint sp_role");
      return err;
    };
    for (const [uid, label, allowed] of [
      [uOwn, "chủ tiệm", true], [uAdm, "quản trị viên", true],
      [uMgr, "quản lý", false], [uStf, "nhân viên", false],
    ]) {
      await asUser(uid, { tenant_id: tR.id, role: label }, async () => {
        for (const [name, sql] of RPCS) {
          const err = await callRpc(sql);
          if (allowed) check(`${label} gọi ${name}() đọc được`, err === null, err ?? "");
          else check(`${label} gọi ${name}() bị từ chối`, err !== null && /forbidden/.test(err),
            err === null ? "ĐỌC ĐƯỢC — rò rỉ thông tin gói cước!" : err);
        }
      });
    }
    // Claim JWT bịa không mở được cửa: vai đọc từ tenant_members theo auth.uid()
    await asUser(uStf, { tenant_id: tR.id, role: "owner" }, async () => {
      let err = null;
      await c.query("savepoint sp_forge");
      try { await c.query(`select public.billing_overview()`); } catch (e) { err = e.message; }
      await c.query("rollback to savepoint sp_forge");
      check("Nhân viên bịa claim role='owner' vẫn bị từ chối", err !== null && /forbidden/.test(err),
        err === null ? "LỌT — đang tin claim JWT là SAI" : err);
    });
  }

  // ==========================================================================
  // Migration #41-B — Một tài khoản mặc định chỉ mở được MỘT tiệm
  // ==========================================================================
  console.log("[rls-smoke] Kiểm tra hạn mức số tiệm mỗi tài khoản:");
  {
    const uLim = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
      [uLim, `smoke41-lim-${stamp}@t.local`]);
    const tryCreate = async (slug) => {
      let err = null;
      await c.query("savepoint sp_ct");
      try { await c.query(`select public.create_tenant('Smoke Lim', $1)`, [slug]); }
      catch (e) { err = e.message; }
      if (err) await c.query("rollback to savepoint sp_ct");
      else await c.query("release savepoint sp_ct");
      return err;
    };
    // TẤT CẢ trong MỘT khối asUser: `asUser` rollback về savepoint khi thoát,
    // tách hai khối sẽ xoá mất mấy tiệm vừa tạo và phép kiểm trần thành vô nghĩa.
    await asUser(uLim, {}, async () => {
      check("Tài khoản mới mở được tiệm đầu tiên", (await tryCreate(`smoke-l1-${stamp}`)) === null);
      const e2 = await tryCreate(`smoke-l2-${stamp}`);
      check("Cùng tài khoản gọi thẳng create_tenant lần 2 bị chặn",
        e2 !== null && /tenant_limit_reached/.test(e2),
        e2 === null ? "TẠO ĐƯỢC — chốt hạn mức không có tác dụng!" : e2);
      check("can_create_tenant() báo đã hết suất",
        (await c.query(`select public.can_create_tenant() as v`)).rows[0].v === false);
      // người dùng không tự nâng hạn mức cho mình được (RLS bật, không policy)
      let wErr = null;
      await c.query("savepoint sp_lim");
      try { await c.query(`insert into public.tenant_creation_limits (user_id, max_tenants) values ($1, 99)`, [uLim]); }
      catch (e) { wErr = e.message; }
      await c.query("rollback to savepoint sp_lim");
      check("Người dùng không tự nâng hạn mức số tiệm cho mình", wErr !== null,
        "GHI ĐƯỢC vào tenant_creation_limits — thủng!");
      const rd = await c.query(`select * from public.tenant_creation_limits`);
      check("Người dùng không đọc được bảng hạn mức", rd.rowCount === 0, `đọc được ${rd.rowCount} dòng`);

      // founder nâng hạn mức lên 3 (mô phỏng service role qua SQL editor), rồi
      // trả lại quyền authenticated để đo tiếp bằng đúng con mắt người dùng
      await c.query(`select set_config('role','postgres', true)`);
      await c.query(
        `insert into public.tenant_creation_limits (user_id, max_tenants, note)
         values ($1, 3, 'smoke: chuỗi nhiều chi nhánh')
         on conflict (user_id) do update set max_tenants = excluded.max_tenants`, [uLim]);
      await c.query(`select set_config('role','authenticated', true)`);

      check("Sau khi nâng lên 3: mở được tiệm thứ hai", (await tryCreate(`smoke-l3-${stamp}`)) === null);
      check("Sau khi nâng lên 3: mở được tiệm thứ ba", (await tryCreate(`smoke-l4-${stamp}`)) === null);
      const e5 = await tryCreate(`smoke-l5-${stamp}`);
      check("Vượt trần mới thì vẫn chặn", e5 !== null && /tenant_limit_reached/.test(e5),
        e5 === null ? "TẠO ĐƯỢC — trần mới không có tác dụng" : e5);
    });
  }

  // ==========================================================================
  // Phạm vi nhân viên thường: HỘI THOẠI dùng chung — TIỀN thì không
  // ==========================================================================
  // Chốt bằng test hai hợp đồng KHÁC NHAU đang cùng tồn tại, để lần sau không ai
  // vô tình đổi bên này theo bên kia:
  //  · conversations = RLS tenant-scope, CHỦ Ý (spec Inbox §4.2 cho mọi vai trò
  //    tab "Chưa gán / Tất cả"; §5 chốt policy chỉ theo tenant; §8 tiêu chí 3 chỉ
  //    đòi cách ly TENANT, không đòi cách ly người dùng) → hộp thư dùng chung,
  //    không ai bỏ sót khách. Siết theo assignee sẽ làm hỏng việc nhặt hội thoại
  //    chưa gán ⇒ test này FAIL để báo động.
  //  · deals/contacts + dashboard_sales = "Pattern B" (spec Báo cáo §5 và §8 tiêu
  //    chí 5: staff không đọc được số của đồng nghiệp) → nới ra sẽ FAIL.
  console.log("[rls-smoke] Kiểm tra phạm vi nhân viên thường (hội thoại dùng chung / tiền riêng):");
  const uS1 = randomUUID(), uS2 = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
     ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
    [uS1, `smoke-s1-${stamp}@t.local`, uS2, `smoke-s2-${stamp}@t.local`]);
  await c.query(
    `insert into public.tenant_members (tenant_id,user_id,role) values ($1,$2,'staff'),($1,$3,'staff')`,
    [tA.id, uS1, uS2]);

  // Tiền: mỗi nhân viên 1 deal thắng (1tr vs 9tr) trên khách của chính mình
  const { rows: [plA] } = await c.query(
    `insert into public.pipelines (tenant_id,name,is_default) values ($1,'PL Smoke',false) returning id`, [tA.id]);
  const { rows: [stA] } = await c.query(
    `insert into public.pipeline_stages (tenant_id,pipeline_id,name,kind,position)
     values ($1,$2,'Mới','open',1) returning id`, [tA.id, plA.id]);
  const mkDeal = async (uid, ctName, amount) => {
    const { rows: [ct] } = await c.query(
      `insert into public.contacts (tenant_id,full_name,owner_id) values ($1,$2,$3) returning id`,
      [tA.id, ctName, uid]);
    await c.query(
      `insert into public.deals (tenant_id,pipeline_id,stage_id,contact_id,owner_id,title,value_vnd,status,won_at)
       values ($1,$2,$3,$4,$5,$6,$7,'won',now())`,
      [tA.id, plA.id, stA.id, ct.id, uid, `Deal ${ctName}`, amount]);
    return ct.id;
  };
  const ctS1 = await mkDeal(uS1, `Khách NV1 ${stamp}`, 1_000_000);
  const ctS2 = await mkDeal(uS2, `Khách NV2 ${stamp}`, 9_000_000);

  // Doanh thu THẬT giờ tính từ ĐƠN HÀNG (ADR-0027 §8 / migration #226), KHÔNG
  // còn từ cơ hội. Deal ở trên GIỮ để kiểm cách-ly cơ hội (phễu, deals_won);
  // thêm mỗi nhân viên 1 ĐƠN hoàn tất trên khách của mình để kiểm cách-ly TIỀN:
  // NV1 1tr, NV2 9tr. RLS orders lọc theo created_by ⇒ NV chỉ thấy đơn mình lập,
  // và quy-kết doanh thu-nhân-viên lùi về created_by khi dòng không có người thực hiện.
  const { rows: [itmSmoke] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
     values ($1,'product','SP Smoke','cái',0,'active') returning id`, [tA.id]);
  const mkOrder = async (uid, ctId, amount) => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status, created_by)
       values ($1,'order',$2,'draft',$3) returning id`, [tA.id, ctId, uid]);
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
       values ($1,$2,$3,1,$4,0)`, [tA.id, o.id, itmSmoke.id, amount]);
    // Máy trạng thái #207: draft→confirmed→completed (không nhảy cóc).
    await c.query(`update public.orders set status='confirmed' where id=$1`, [o.id]);
    await c.query(`update public.orders set status='completed' where id=$1`, [o.id]);
  };
  await mkOrder(uS1, ctS1, 1_000_000);
  await mkOrder(uS2, ctS2, 9_000_000);

  // Hội thoại: gán NV1 · gán NV2 · CHƯA GÁN — đều 'open' và tin cuối là của khách
  const mkConv = async (assignee, key) => {
    const { rows: [cv] } = await c.query(
      `insert into public.conversations (tenant_id,channel_id,external_user_id,status,assignee_user_id,
         last_user_message_at,last_message_at)
       values ($1,$2,$3,'open',$4,now(),now()) returning id`,
      [tA.id, chA.id, `zl-scope-${key}-${stamp}`, assignee]);
    return cv.id;
  };
  const cvMine = await mkConv(uS1, "mine");
  const cvMate = await mkConv(uS2, "mate");
  const cvFree = await mkConv(null, "free");

  const STAFF1 = { tenant_id: tA.id, role: "staff" };
  const wFrom = new Date(Date.now() - 86_400_000).toISOString();
  const wTo = new Date(Date.now() + 86_400_000).toISOString();
  const wPrevFrom = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const wPrevTo = new Date(Date.now() - 2 * 86_400_000).toISOString();

  await asUser(uS1, STAFF1, async () => {
    // (1) hộp thư dùng chung — CHỦ Ý, không được siết
    const cv = await c.query(`select id from public.conversations where tenant_id=$1`, [tA.id]);
    const ids = cv.rows.map((r) => r.id);
    check("Nhân viên thấy hội thoại CHƯA GÁN (nhặt việc được)", ids.includes(cvFree),
      "hộp thư dùng chung bị siết — nhân viên hết nhặt được việc");
    check("Nhân viên thấy hội thoại của ĐỒNG NGHIỆP (trực thay được)", ids.includes(cvMate),
      "hộp thư dùng chung bị siết — không trực thay nhau được");
    const ov = (await c.query(`select public.dashboard_overview() as j`)).rows[0].j;
    check("dashboard_overview(): 'Hội thoại đang mở' là số CẢ TIỆM (≥3)",
      Number(ov.open_conversations) >= 3, `được ${ov.open_conversations}`);
    check("dashboard_overview(): 'Chưa trả lời' là số CẢ TIỆM (≥3)",
      Number(ov.unanswered) >= 3, `được ${ov.unanswered}`);

    // (2) tiền vẫn riêng — không được nới
    const s = (await c.query(`select public.dashboard_sales($1,$2,$3,$4) as j`,
      [wFrom, wTo, wPrevFrom, wPrevTo])).rows[0].j;
    check("Nhân viên chỉ thấy doanh thu CỦA MÌNH (1.000.000đ)",
      Number(s.revenue.current) === 1_000_000, `được ${s.revenue.current} — lộ tiền đồng nghiệp!`);
    check("Bảng hiệu suất của nhân viên chỉ có 1 dòng = chính mình",
      s.staff.length === 1, `được ${s.staff.length} dòng — lộ số đồng nghiệp!`);
    const dl = await c.query(`select id from public.deals where tenant_id=$1`, [tA.id]);
    check("Nhân viên đọc deal của đồng nghiệp = 0 dòng", dl.rowCount === 1, `thấy ${dl.rowCount} deal`);
    const ctv = await c.query(
      `select id from public.contacts where tenant_id=$1 and full_name like $2`, [tA.id, `Khách NV%${stamp}`]);
    check("Nhân viên đọc khách của đồng nghiệp = 0 dòng", ctv.rowCount === 1, `thấy ${ctv.rowCount} khách`);

    // (3) cách ly tenant vẫn nguyên với vai trò staff
    const xb = await c.query(`select id from public.conversations where tenant_id=$1`, [tB.id]);
    check("Nhân viên tiệm A đọc hội thoại tiệm B = 0 dòng", xb.rowCount === 0);

    // (4) hộp thư PHẢI còn dùng được — siết mà hỏng hộp thư là thất bại
    const om = await c.query(`select id from public.conversations where id=$1`, [cvMine]);
    check("Nhân viên MỞ được hội thoại được giao", om.rowCount === 1);
    const rep = await c.query(
      `insert into public.messages (tenant_id,conversation_id,direction,sender_type,sender_user_id,content)
       values ($1,$2,'out','agent',$3,'Dạ em trả lời ạ') returning id`, [tA.id, cvMine, uS1]);
    check("Nhân viên TRẢ LỜI được hội thoại được giao", rep.rowCount === 1);
    const cls = await c.query(`update public.conversations set status='closed' where id=$1`, [cvMine]);
    check("Nhân viên ĐÓNG được hội thoại được giao", cls.rowCount === 1);
    const pick = await c.query(
      `update public.conversations set assignee_user_id=$1 where id=$2`, [uS1, cvFree]);
    check("Nhân viên NHẶT được hội thoại chưa ai nhận", pick.rowCount === 1);
  });

  // Chủ tiệm vẫn thấy ĐỦ — siết nhầm phía quản lý cũng phải báo động
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const s = (await c.query(`select public.dashboard_sales($1,$2,$3,$4) as j`,
      [wFrom, wTo, wPrevFrom, wPrevTo])).rows[0].j;
    check("Chủ tiệm thấy tổng doanh thu cả tiệm (10.000.000đ)",
      Number(s.revenue.current) === 10_000_000, `được ${s.revenue.current}`);
    check("Chủ tiệm thấy đủ 2 nhân viên trong bảng hiệu suất",
      s.staff.length === 2, `được ${s.staff.length}`);
  });

  // ---- Vai viewer — "Chỉ xem, không sửa được gì" (team.roleHints.viewer)
  // — đọc TOÀN TIỆM (không chỉ bản ghi tự sở hữu), ghi/sửa/xoá 0 chỗ nào lọt.
  // Ca thật đã bắt được lỗi ở đây: viewer tự gán mình làm owner_id vẫn
  // ghi được (migration #65 vá) — savepoint từng lệnh vì kỳ vọng LỖI.
  console.log("[rls-smoke] Kiểm tra vai viewer (đọc toàn tiệm, ghi 0 chỗ lọt — tiệm mẫu 15b dùng vai này):");
  const uV = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uV, `smoke-viewer-${stamp}@t.local`]);
  await c.query(`insert into public.tenant_members (tenant_id,user_id,role) values ($1,$2,'viewer')`, [tA.id, uV]);
  const VIEWER = { tenant_id: tA.id, role: "viewer" };

  await asUser(uV, VIEWER, async () => {
    const dl = await c.query(`select id from public.deals where tenant_id=$1`, [tA.id]);
    check("Viewer ĐỌC được deal của người khác (không chỉ tự sở hữu)", dl.rowCount >= 2, `thấy ${dl.rowCount} deal`);
    const ctv = await c.query(
      `select id from public.contacts where tenant_id=$1 and full_name like $2`, [tA.id, `Khách NV%${stamp}`]);
    check("Viewer ĐỌC được contact của người khác", ctv.rowCount >= 2, `thấy ${ctv.rowCount} contact`);
    const cmp = await c.query(`select id from public.companies where tenant_id=$1`, [tA.id]);
    check("Viewer ĐỌC được companies (không lỗi)", cmp.rowCount >= 0);

    let insErr = null;
    await c.query("savepoint sp_v1");
    try { await c.query(`insert into public.contacts (tenant_id,full_name) values ($1,'Viewer chèn lén')`, [tA.id]); }
    catch (err) { insErr = err; }
    await c.query("rollback to savepoint sp_v1");
    check("Viewer KHÔNG ghi được contacts", !!insErr, insErr ? "đúng như kỳ vọng" : "LỖI — ghi lọt!");

    const upd = await c.query(`update public.contacts set full_name='sửa lén' where id=$1`, [ctv.rows[0]?.id]);
    check("Viewer KHÔNG sửa được contacts (0 dòng đổi)", upd.rowCount === 0, `đổi ${upd.rowCount} dòng`);

    let compErr = null;
    await c.query("savepoint sp_v2");
    try { await c.query(`insert into public.companies (tenant_id,name) values ($1,'Cty chèn lén')`, [tA.id]); }
    catch (err) { compErr = err; }
    await c.query("rollback to savepoint sp_v2");
    check("Viewer KHÔNG ghi được companies", !!compErr, compErr ? "đúng như kỳ vọng" : "LỖI — ghi lọt!");

    // Ca gắt nhất đã từng lọt: viewer tự gán MÌNH làm owner_id activities.
    let actErr = null;
    await c.query("savepoint sp_v3");
    try {
      await c.query(
        `insert into public.activities (tenant_id,type,contact_id,owner_id) values ($1,'note',$2,$3)`,
        [tA.id, ctv.rows[0]?.id, uV]);
    } catch (err) { actErr = err; }
    await c.query("rollback to savepoint sp_v3");
    check("Viewer tự gán mình làm owner_id vẫn KHÔNG ghi được activities", !!actErr,
      actErr ? "đúng như kỳ vọng" : "LỖI — ghi lọt (chính lỗ đã vá ở migration #65)!");

    const xb = await c.query(`select id from public.deals where tenant_id=$1`, [tB.id]);
    check("Viewer tiệm A đọc deal tiệm B = 0 dòng (cách ly tenant vẫn nguyên)", xb.rowCount === 0);
  });

  console.log("[rls-smoke] Kiểm tra pipeline webhook Zalo:");
  // đang ở role postgres (ngoài asUser) → đọc được private.app_config và gọi được cả 2 RPC
  const { rows: [zCfg] } = await c.query(
    `select value from private.app_config where key = 'zalo_ingest_key'`);
  check("app_config có sẵn zalo_ingest_key", !!zCfg?.value, "migration #5 chưa sinh khóa");

  let zKeyErr = null;
  await c.query("savepoint sp_zkey");
  try { await c.query(`select public.ingest_zalo_event('sai-khoa', 'evt-x', '{}'::jsonb)`); }
  catch (err) { zKeyErr = err; }
  await c.query("rollback to savepoint sp_zkey");
  check("ingest_zalo_event từ chối key sai", !!zKeyErr && /invalid_ingest_key/.test(zKeyErr.message), zKeyErr?.message ?? "không lỗi");

  const zEventId = `zalo-evt-${stamp}`;
  const zPayload = JSON.stringify({
    app_id: "smoke-app",
    oa_id: `oa-a-${stamp}`,           // OA của tenant A (channels đã seed ở trên)
    event_name: "user_send_text",
    timestamp: String(Date.now()),
    sender: { id: `zl-a-${stamp}` },  // trùng external_user_id của cvA → test nhánh upsert
    recipient: { id: `oa-a-${stamp}` },
    message: { msg_id: `zmsg-${stamp}`, text: "xin chào từ webhook" },
  });
  const { rows: [zIng] } = await c.query(
    `select public.ingest_zalo_event($1, $2, $3::jsonb) as id`, [zCfg.value, zEventId, zPayload]);
  check("ingest_zalo_event key đúng trả về id", zIng.id !== null, JSON.stringify(zIng));
  const { rows: [zDup] } = await c.query(
    `select public.ingest_zalo_event($1, $2, $3::jsonb) as id`, [zCfg.value, zEventId, zPayload]);
  check("gọi lần 2 cùng external_event_id trả null (idempotent)", zDup.id === null, JSON.stringify(zDup));

  const { rows: [zProc] } = await c.query(`select public.process_zalo_events() as n`);
  check("process_zalo_events xử lý ≥ 1 message", Number(zProc.n) >= 1, `được ${zProc.n}`);

  const zMsg = await c.query(
    `select content from public.messages
      where tenant_id = $1 and direction = 'in' and external_message_id = $2`,
    [tA.id, `zmsg-${stamp}`]);
  check("tin 'in' mới của tenant A vào messages đúng nội dung",
    zMsg.rowCount === 1 && zMsg.rows[0].content === "xin chào từ webhook", JSON.stringify(zMsg.rows));

  const zEvt = await c.query(
    `select 1 from public.webhook_events
      where provider = 'zalo' and external_event_id = $1
        and tenant_id = $2 and processed_at is not null`,
    [zEventId, tA.id]);
  check("webhook_events đã gắn tenant_id + processed_at", zEvt.rowCount === 1);

  console.log("[rls-smoke] Kiểm tra kết nối kênh Zalo (migration #10 — secret trong Vault):");
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    const { rows: [zc] } = await c.query(
      `select public.connect_zalo_channel($1, 'smoke-access-token', 'smoke-refresh-token', 'OA Vault Smoke') as id`,
      [`9${stamp}001`]);
    check("connect_zalo_channel (owner) trả về channel id", !!zc.id, JSON.stringify(zc));

    // secret phải nằm trong Vault (kiểm bằng quyền postgres — savepoint asUser sẽ rollback hết)
    await c.query(`select set_config('role','postgres', true)`);
    const vs = await c.query(
      `select count(*)::int as n from vault.secrets where name in ($1, $2)`,
      [`zalo:${zc.id}:access`, `zalo:${zc.id}:refresh`]);
    check("2 secret token nằm trong Vault theo channel id", vs.rows[0].n === 2, `được ${vs.rows[0].n}`);
    const ch = await c.query(`select status, secret_ref from public.channels where id = $1`, [zc.id]);
    check("channel active + secret_ref chỉ là tham chiếu (không chứa token)",
      ch.rowCount === 1 && ch.rows[0].status === "active"
        && !/smoke-(access|refresh)-token/.test(ch.rows[0].secret_ref ?? ""),
      JSON.stringify(ch.rows));

    // authenticated KHÔNG gọi được get_zalo_channel_secrets (EXECUTE đã revoke)
    await c.query(`select set_config('role','authenticated', true)`);
    let secErr = null;
    await c.query("savepoint sp_zc_sec");
    try { await c.query(`select * from public.get_zalo_channel_secrets($1)`, [zc.id]); }
    catch (err) { secErr = err; }
    await c.query("rollback to savepoint sp_zc_sec");
    check("authenticated bị chặn get_zalo_channel_secrets",
      !!secErr && /permission denied/i.test(secErr.message), secErr?.message ?? "đọc ĐƯỢC — lộ secret!");

    // worker (service role — mô phỏng bằng postgres) đọc đúng token từ Vault
    await c.query(`select set_config('role','postgres', true)`);
    const st = await c.query(`select * from public.get_zalo_channel_secrets($1)`, [zc.id]);
    check("worker đọc được đúng cặp token từ Vault",
      st.rowCount === 1 && st.rows[0].access_token === "smoke-access-token"
        && st.rows[0].refresh_token === "smoke-refresh-token",
      JSON.stringify(st.rows?.map((r) => ({ a: !!r.access_token, r: !!r.refresh_token }))));

    // tenant B kết nối trùng OA đã thuộc tenant A → bị chặn (chống OA hijack)
    await c.query(
      `select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)`,
      [JSON.stringify({ sub: uB, role: "authenticated", app_metadata: { tenant_id: tB.id, role: "owner" } })]);
    let dupErr = null;
    await c.query("savepoint sp_zc_dup");
    try { await c.query(`select public.connect_zalo_channel($1, 'x-access', 'x-refresh', 'OA Cướp')`, [`9${stamp}001`]); }
    catch (err) { dupErr = err; }
    await c.query("rollback to savepoint sp_zc_dup");
    check("tenant B kết nối trùng OA bị chặn 'oa_already_connected'",
      !!dupErr && /oa_already_connected/.test(dupErr.message), dupErr?.message ?? "không lỗi — OA hijack!");

    // staff không được kết nối kênh (thao tác settings — chỉ owner/admin)
    //
    // ⚠️ Dùng `uA` (người CÓ tư cách thành viên ở tiệm A) với vai `staff` trong
    // phiếu, chứ KHÔNG dùng `uC` — `uC` là nhân viên của tiệm B. Trước migration
    // #301, `current_tenant_id()` tin thẳng mã tiệm trong phiếu nên ca này chạy
    // được dù mô phỏng một chuyện KHÔNG THỂ xảy ra thật: phiếu đăng nhập chỉ
    // mang mã tiệm mà người đó là thành viên. Sau #301 nó ném `no_tenant_context`
    // — đúng, nhưng che mất thứ ca này muốn kiểm là **chốt vai**.
    //
    // Vai vẫn đọc từ phiếu (`app_role()`), nên đặt `role: "staff"` cho `uA` là
    // mô phỏng đúng một nhân viên thật của tiệm A.
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uA, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "staff" } })]);
    let staffErr = null;
    await c.query("savepoint sp_zc_staff");
    try { await c.query(`select public.connect_zalo_channel($1, 'x-access', 'x-refresh', 'OA Staff')`, [`9${stamp}002`]); }
    catch (err) { staffErr = err; }
    await c.query("rollback to savepoint sp_zc_staff");
    check("staff bị chặn connect_zalo_channel 'forbidden'",
      !!staffErr && /forbidden/.test(staffErr.message), staffErr?.message ?? "không lỗi");

    // owner ngắt kết nối → secret xóa khỏi Vault, external_id nhả ra, status='disconnected'
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uA, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "owner" } })]);
    await c.query(`select public.disconnect_zalo_channel($1)`, [zc.id]);
    await c.query(`select set_config('role','postgres', true)`);
    const vd = await c.query(
      `select count(*)::int as n from vault.secrets where name like 'zalo:' || $1 || ':%'`, [zc.id]);
    const chd = await c.query(
      `select status, external_id, secret_ref from public.channels where id = $1`, [zc.id]);
    check("disconnect xóa secret Vault + nhả external_id + status='disconnected'",
      vd.rows[0].n === 0 && chd.rows[0].status === "disconnected"
        && chd.rows[0].external_id === null && chd.rows[0].secret_ref === null,
      JSON.stringify({ vault: vd.rows[0].n, ch: chd.rows }));
  });

  console.log("[rls-smoke] Kiểm tra trigger bảo vệ:");
  let slugErr = null;
  await c.query("savepoint sp_slug");
  try { await c.query(`insert into public.tenants (name, slug) values ('Hack','app')`); }
  catch (err) { slugErr = err; }
  await c.query("rollback to savepoint sp_slug");
  check("Slug reserved ('app') bị chặn", !!slugErr && /slug_reserved/.test(slugErr.message), slugErr?.message ?? "không lỗi");

  let ownerErr = null;
  await c.query("savepoint sp_owner");
  try { await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tA.id, uA]); }
  catch (err) { ownerErr = err; }
  await c.query("rollback to savepoint sp_owner");
  check("Owner cuối cùng không xóa được", !!ownerErr && /last_owner/.test(ownerErr.message), ownerErr?.message ?? "không lỗi");

  const hook = await c.query(`select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='custom_access_token_hook'`);
  check("Hàm custom_access_token_hook tồn tại", hook.rowCount === 1);

  // -------------------------------------------------------------------------
  // Leo thang quyền admin → owner (migration #38).
  // Món nợ đã từng xảy ra: policy members_manage/invitations_manage cho vai
  // 'admin' toàn quyền ALL trên tenant_members + invitations, nên admin tự đổi
  // vai mình thành 'owner' bằng MỘT lệnh PostgREST — rồi gọi được
  // change_plan/cancel_subscription (những hàm cố ý chỉ dành cho chủ tiệm).
  // Hai đường đã chứng minh khai thác được trên DB thật trước khi vá:
  //   Đ1: update tenant_members set role='owner' where user_id=<chính mình>
  //   Đ2: insert invitations(role='owner', email=<của mình>) + accept_invitation
  // -------------------------------------------------------------------------
  console.log("[rls-smoke] Chống leo thang quyền admin → owner (migration #38):");
  {
    const uAdm = randomUUID();
    const uOwn2 = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
      [uAdm, `smoke-adm-${stamp}@t.local`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
       values ($1,$2,'admin','active',now())`, [tA.id, uAdm]);

    await asUser(uAdm, { tenant_id: tA.id, role: "admin" }, async () => {
      let e1 = null;
      await c.query("savepoint sp_esc1");
      try { await c.query(`update public.tenant_members set role='owner' where user_id=$1`, [uAdm]); }
      catch (err) { e1 = err; }
      await c.query("rollback to savepoint sp_esc1");
      check("admin KHÔNG tự nâng mình lên owner (tenant_members)",
        !!e1 && /only_owner_can_change_owner_role/.test(e1.message),
        e1?.message ?? "không lỗi — admin leo lên owner được!");

      let e2 = null;
      await c.query("savepoint sp_esc2");
      try {
        await c.query(
          `insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
           values ($1,$2,'owner',$3,$4)`,
          [tA.id, `smoke-adm-${stamp}@t.local`, "a".repeat(64), uAdm]);
      } catch (err) { e2 = err; }
      await c.query("rollback to savepoint sp_esc2");
      check("admin KHÔNG tạo được lời mời vai owner",
        !!e2 && /only_owner_can_invite_owner/.test(e2.message),
        e2?.message ?? "không lỗi — còn đường vòng qua lời mời!");

      // Hạ vai chủ tiệm: thêm chủ thứ hai trước, để trigger "chủ cuối cùng"
      // (#2) không nổ trước và che mất chốt mới đang cần chứng minh.
      let e3 = null;
      await c.query("savepoint sp_esc3");
      try {
        await c.query(`select set_config('role','postgres', true)`);
        await c.query(
          `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
          [uOwn2, `smoke-own2-${stamp}@t.local`]);
        await c.query(
          `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
           values ($1,$2,'owner','active',now())`, [tA.id, uOwn2]);
        await c.query(`select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)`,
          [JSON.stringify({ sub: uAdm, role: "authenticated", app_metadata: { tenant_id: tA.id, role: "admin" } })]);
        await c.query(`update public.tenant_members set role='staff' where user_id=$1`, [uA]);
      } catch (err) { e3 = err; }
      await c.query("rollback to savepoint sp_esc3");
      check("admin KHÔNG hạ vai chủ tiệm xuống (dù tiệm còn chủ khác)",
        !!e3 && /only_owner_can_change_owner_role/.test(e3.message),
        e3?.message ?? "không lỗi — admin phế được chủ tiệm!");
    });

    // Không siết quá tay: CHỦ TIỆM vẫn trao được vai chủ cho người khác.
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      await c.query("savepoint sp_esc4");
      let ok = false, e4 = null;
      try {
        const r = await c.query(`update public.tenant_members set role='owner' where user_id=$1`, [uAdm]);
        ok = r.rowCount === 1;
      } catch (err) { e4 = err; }
      await c.query("rollback to savepoint sp_esc4");
      check("CHỦ TIỆM vẫn trao được vai owner cho người khác", ok,
        e4?.message ?? "0 dòng — chốt mới siết quá tay");

      await c.query("savepoint sp_esc5");
      let okInv = false, e5 = null;
      try {
        const r = await c.query(
          `insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
           values ($1,$2,'admin',$3,$4)`,
          [tA.id, `smoke-inv-${stamp}@t.local`, "b".repeat(64), uA]);
        okInv = r.rowCount === 1;
      } catch (err) { e5 = err; }
      await c.query("rollback to savepoint sp_esc5");
      check("Lời mời vai thường (admin) vẫn tạo được bình thường", okInv,
        e5?.message ?? "0 dòng");
    });
  }

  // -------------------------------------------------------------------------
  // staff_account_add_member: chỉ nhận tài khoản nhân viên do CHÍNH tiệm này
  // tạo (migration #199). Lỗ đã ĐO ĐƯỢC trước khi vá: hàm #62 kiểm tiệm + kiểm
  // vai người GỌI nhưng không kiểm `p_user_id` là ai → chủ tiệm A gõ thẳng RPC
  // với uuid người lạ là thêm được vào tiệm mình, rồi đọc luôn tên hiển thị VÀ
  // SỐ ĐIỆN THOẠI của họ trong `profiles`. Trần ghế vẫn giữ nên không mất tiền
  // — mất là quyền riêng tư của người dùng nền tảng.
  // Dấu vết dùng để phân biệt: email tổng hợp `p<sđt>.<mã-tiệm>@staff.ifan.local`
  // (#62) — mã tiệm nằm sẵn trong `auth.users`, người gọi RPC không sửa được.
  // BẮT BUỘC có ĐỐI CHỨNG ở cuối: nếu chỉ kiểm "bị chặn" thì một bản vá khoá
  // chết cả hàm cũng PASS mà không ai biết luồng tạo nhân viên đã gãy.
  // -------------------------------------------------------------------------
  console.log("[rls-smoke] staff_account_add_member chỉ nhận nhân viên của chính tiệm (migration #199):");
  {
    // Tiệm THỨ BA, không dính dáng gì tới A: uA đã là admin của tB từ fixture
    // "một tài khoản nhiều tiệm" ở trên, nên nhân viên tiệm B KHÔNG còn là
    // "người lạ" với A — dùng B ở đây là tự làm hỏng phép đo.
    const slugLa = `smoke-la-${stamp}`;
    const { rows: [tLa] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Lạ', $1, true) returning id`, [slugLa]);
    const uLa = randomUUID();    // nhân viên tiệm lạ — email tổng hợp mang mã tiệm lạ
    const uNgoai = randomUUID(); // người ngoài hoàn toàn — email thật
    const uMoiA = randomUUID();  // tài khoản tiệm A vừa tạo — email tổng hợp mã tiệm A
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),
       ($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6)`,
      [uLa, `p0912345678.${slugLa}@staff.ifan.local`,
       uNgoai, `smoke-ngoai-${stamp}@gmail.com`,
       uMoiA, `p0987654321.smoke-a-${stamp}@staff.ifan.local`]);
    await c.query(
      `insert into public.profiles (user_id, display_name, phone) values ($1,'Nhân viên tiệm lạ','0912345678')
       on conflict (user_id) do update set display_name = excluded.display_name, phone = excluded.phone`,
      [uLa]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status, joined_at)
       values ($1,$2,'staff','active',now())`, [tLa.id, uLa]);

    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      let hoNguoiLa = null;
      let iSam = 0;
      for (const [ten, uid] of [
        ["nhân viên tiệm lạ", uLa],
        ["người ngoài (email thật)", uNgoai],
        ["uuid không tồn tại", randomUUID()],
      ]) {
        iSam++;
        let err = null;
        await c.query(`savepoint sp_sam_${iSam}`);
        // Savepoint LỒNG quanh riêng lời gọi RPC: lỗi do RPC ném ra làm hỏng
        // cả giao dịch, đọc tiếp bất cứ gì cũng chỉ ra 25P02. Nhả riêng nó ra
        // thì giao dịch lành lại, mà dòng tenant_members (nếu chốt bị tháo và
        // RPC KHÔNG lỗi) vẫn còn nguyên để đo tiếp.
        await c.query(`savepoint sp_sam_try_${iSam}`);
        try { await c.query(`select public.staff_account_add_member($1,'staff')`, [uid]); }
        catch (e) { err = e; await c.query(`rollback to savepoint sp_sam_try_${iSam}`); }
        // Hệ quả THẬT của lỗ là "thêm được ⇒ đọc được hồ sơ", nên phải đo khi
        // dòng thành viên (nếu có) CÒN SỐNG. Đo sau khi đã nhả hết savepoint
        // thì phép đo xanh kể cả lúc chốt bị tháo — lại thành cổng luôn PASS.
        if (uid === uLa) {
          hoNguoiLa = await c.query(
            `select display_name, phone from public.profiles where user_id = $1`, [uLa]);
        }
        await c.query(`rollback to savepoint sp_sam_${iSam}`);
        check(`Chủ tiệm A KHÔNG thêm được ${ten} vào tiệm mình`,
          !!err && /not_own_staff_account/.test(err.message),
          err?.message ?? "không lỗi — thêm được người lạ vào tiệm!");
      }
      check("Hồ sơ (tên + SĐT) của nhân viên tiệm lạ vẫn vô hình với chủ tiệm A",
        hoNguoiLa.rowCount === 0, JSON.stringify(hoNguoiLa.rows));

      // ĐỐI CHỨNG — luồng tạo tài khoản nhân viên bình thường phải CÒN CHẠY.
      await c.query("savepoint sp_sam_ok");
      let vai = null, errOk = null;
      try {
        await c.query(`select public.staff_account_add_member($1,'manager')`, [uMoiA]);
        const { rows } = await c.query(
          `select role::text as r, status from public.tenant_members where user_id=$1 and tenant_id=$2`,
          [uMoiA, tA.id]);
        vai = rows[0] ?? null;
      } catch (e) { errOk = e; }
      await c.query("rollback to savepoint sp_sam_ok");
      check("ĐỐI CHỨNG: tài khoản nhân viên do chính tiệm A tạo VẪN thêm được, đúng vai",
        vai?.r === "manager" && vai?.status === "active",
        errOk?.message ?? JSON.stringify(vai) + " — bản vá khoá chết cả luồng tạo nhân viên");
    });
  }

  console.log("[rls-smoke] Guard increment_usage (migration #7 — chặn amount/metric bẩn):");
  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    let amtErr = null;
    await c.query("savepoint sp_amt");
    try { await c.query(`select public.increment_usage('ai_calls', -5)`); } catch (err) { amtErr = err; }
    await c.query("rollback to savepoint sp_amt");
    check("increment_usage(-5) bị chặn 'invalid_amount'", !!amtErr && /invalid_amount/.test(amtErr.message),
      amtErr?.message ?? "không lỗi — user reset được quota!");
    let metErr = null;
    await c.query("savepoint sp_met");
    try { await c.query(`select public.increment_usage('Metric Bẩn!', 1)`); } catch (err) { metErr = err; }
    await c.query("rollback to savepoint sp_met");
    check("increment_usage(metric bẩn) bị chặn 'invalid_metric'", !!metErr && /invalid_metric/.test(metErr.message),
      metErr?.message ?? "không lỗi");
    const { rows: [usg] } = await c.query(`select public.increment_usage('ai_calls', 1) as used`);
    check("increment_usage(1) hợp lệ trả về số", Number(usg.used) >= 1, JSON.stringify(usg));
  });

  console.log("[rls-smoke] Phiên hỗ trợ chỉ-đọc (ADR-0006 mục 7, task #81):");
  {
    const uAdmin = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
      [uAdmin, `smoke-admin-${stamp}@t.local`],
    );
    await c.query(`insert into public.platform_admins (user_id, role) values ($1, 'support')`, [uAdmin]);

    // asUser() (helper chung phía trên) LUÔN rollback-to-savepoint sau khi chạy
    // — đúng ý cho "thử một lượt rồi bỏ", nhưng phiên hỗ trợ cần các dòng
    // support_sessions/tenant_members SỐNG QUA nhiều bước kiểm liên tiếp.
    // Dùng helper riêng: đặt claim, chạy, KHÔNG rollback — chỉ trả role về
    // 'postgres' để câu tiếp theo (viết bằng quyền postgres) không dính claim cũ.
    async function runAs(userId, claims, sql, params = []) {
      await c.query(
        `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
        [JSON.stringify({ sub: userId, role: "authenticated", app_metadata: claims })],
      );
      try {
        return await c.query(sql, params);
      } finally {
        await c.query(`select set_config('role', 'postgres', true)`);
      }
    }

    const s1 = await runAs(uAdmin, {},
      `select public.open_support_session($1, 'Kiểm rls-smoke — không sửa gì thật', 60) as id`, [tB.id]);
    const sessionId = s1.rows[0]?.id;
    check("Ca 1a — mở phiên hợp lệ", !!sessionId);

    // Ca 1: trong phiên hỗ trợ, thử GHI vào 6 bảng lõi — fail hết 6/6.
    // UPDATE bị RLS USING chặn thì CHẠY XONG nhưng rowCount=0 (không throw) —
    // khác INSERT (throw ngay) — phải soát rowCount, không chỉ bắt try/catch
    // (bẫy đã tự dính lúc viết kịch bản kiểm tay, sửa ở đây luôn).
    const coreWrites = [
      ["contacts", `insert into public.contacts (tenant_id, full_name) values ($1,'QA hack')`],
      ["deals", `insert into public.deals (tenant_id, title, contact_id, value_vnd) values ($1,'QA hack', gen_random_uuid(), 0)`],
      ["tags", `insert into public.tags (tenant_id, name) values ($1,'qa-hack')`],
      ["tenants (update)", `update public.tenants set name = 'HACKED' where id = $1`],
      ["activities", `insert into public.activities (tenant_id, contact_id, type, owner_id) values ($1, gen_random_uuid(), 'note', $2)`],
      ["saved_views", `insert into public.saved_views (tenant_id, screen, name, query, vocab_version) values ($1,'contacts','qa-hack','q=x',2)`],
    ];
    let blocked6 = 0;
    await asUser(uAdmin, { tenant_id: tB.id, role: "viewer" }, async () => {
      for (const [, sql] of coreWrites) {
        await c.query("savepoint sp_core_write");
        try {
          const r = await c.query(sql, [tB.id, uAdmin]);
          if (/^update/i.test(sql) && r.rowCount === 0) blocked6++; // USING chặn im lặng — vẫn là bị chặn
        } catch { blocked6++; }
        await c.query("rollback to savepoint sp_core_write");
      }
    });
    check("Ca 1b — quản trị trong phiên hỗ trợ ghi 6 bảng lõi FAIL hết 6/6", blocked6 === 6, `chặn được ${blocked6}/6`);

    // Ca 2: lùi expires_at về quá khứ → hook không còn cấp claim tenant này.
    await c.query(`update public.support_sessions set expires_at = now() - interval '1 hour' where id = $1`, [sessionId]);
    await c.query(`update public.tenant_members set expires_at = now() - interval '1 hour' where tenant_id = $1 and user_id = $2`, [tB.id, uAdmin]);
    const { rows: [hookExp] } = await c.query(
      `select public.custom_access_token_hook($1) as ev`, [JSON.stringify({ user_id: uAdmin, claims: {} })]);
    const claimExp = hookExp.ev.claims?.app_metadata;
    check("Ca 2 — hết hạn thì hook KHÔNG cấp claim tiệm đó", !claimExp || claimExp.tenant_id !== tB.id, JSON.stringify(claimExp));
    // đặt lại cho ca sau
    await c.query(`update public.support_sessions set expires_at = now() + interval '30 minutes', ended_at = null, ended_by = null where id = $1`, [sessionId]);
    await c.query(`update public.tenant_members set expires_at = now() + interval '30 minutes', status = 'active' where tenant_id = $1 and user_id = $2`, [tB.id, uAdmin]);

    // Ca 3+4: ép tiệm B "đầy ghế" (subscription suspended → plan_limit=0) — vẫn mở được, số ghế không đổi.
    const { rows: seatsBefore } = await c.query(`select public.tenant_seats_used($1) as n`, [tB.id]);
    const { rowCount: hadSub } = await c.query(`select 1 from public.subscriptions where tenant_id = $1`, [tB.id]);
    if (hadSub) await c.query(`update public.subscriptions set status = 'suspended' where tenant_id = $1`, [tB.id]);
    else await c.query(`insert into public.subscriptions (tenant_id, plan_code, status, billing_cycle) values ($1,'pro','suspended','month')`, [tB.id]);
    let sessionId2;
    let openErr = null;
    try {
      const s2 = await runAs(uAdmin, {},
        `select public.open_support_session($1, 'Kiểm rls-smoke lần 2 — tiệm đầy ghế', 60) as id`, [tB.id]);
      sessionId2 = s2.rows[0]?.id;
    } catch (err) { openErr = err; }
    check("Ca 3 — mở phiên được dù tiệm đầy ghế (không dính seat_limit_reached)", !!sessionId2, openErr?.message ?? "");
    const { rows: seatsAfter } = await c.query(`select public.tenant_seats_used($1) as n`, [tB.id]);
    check("Ca 4 — số ghế trước/sau khi mở phiên KHÔNG đổi", seatsBefore[0].n === seatsAfter[0].n,
      `trước=${seatsBefore[0].n} sau=${seatsAfter[0].n}`);
    if (hadSub) await c.query(`update public.subscriptions set status = 'trialing' where tenant_id = $1`, [tB.id]);
    else await c.query(`delete from public.subscriptions where tenant_id = $1`, [tB.id]);

    // Ca 5: hàng tenant_members CŨ (expires_at NULL, không phải hỗ trợ) — hook không đổi hành vi.
    //
    // ⚠️ Chỉ rõ tiệm đang mở trước khi hỏi. `uB` là thành viên của nhiều tiệm
    // trong bộ kiểm này, và hàm sinh phiếu chọn theo thứ tự: tiệm đang mở
    // trước, rồi mới tới thứ tự tạo. Không chỉ rõ thì ca này phụ thuộc vào
    // việc ca NÀO chạy trước đã thêm `uB` vào tiệm nào — một ca kiểm mà kết
    // quả đổi theo thứ tự chạy thì không kiểm được gì.
    await c.query(`update public.profiles set active_tenant_id = $1 where user_id = $2`, [tB.id, uB]);
    const { rows: [hookOld] } = await c.query(
      `select public.custom_access_token_hook($1) as ev`, [JSON.stringify({ user_id: uB, claims: {} })]);
    const claimOld = hookOld.ev.claims?.app_metadata;
    check("Ca 5 — thành viên thường (expires_at NULL) không đổi hành vi", claimOld?.tenant_id === tB.id, JSON.stringify(claimOld));

    // Ca 6: mọi dòng support_sessions có reason + có dòng record_audit tương ứng.
    const { rows: [noReason] } = await c.query(
      `select count(*)::int as n from public.support_sessions where id = any($1) and (reason is null or char_length(trim(reason)) < 10)`,
      [[sessionId, sessionId2].filter(Boolean)]);
    check("Ca 6a — không dòng support_sessions nào thiếu reason", noReason.n === 0);
    const { rows: [auditN] } = await c.query(
      `select count(*)::int as n from public.record_audit where entity_type = 'support_session' and entity_id = any($1) and action = 'opened'`,
      [[sessionId, sessionId2].filter(Boolean)]);
    check("Ca 6b — mỗi lần mở đều có dòng record_audit", auditN.n === [sessionId, sessionId2].filter(Boolean).length);

    // Ca phụ: chủ tiệm bấm "Dừng ngay" — end_support_session cho phép owner/admin CỦA TIỆM ĐÓ đóng, không phải admin nền tảng.
    let tenantEndErr = null;
    try {
      await runAs(uB, { tenant_id: tB.id, role: "owner" }, `select public.end_support_session($1)`, [sessionId2]);
    } catch (err) { tenantEndErr = err; }
    const { rows: [closedRow] } = await c.query(`select ended_at, ended_by from public.support_sessions where id = $1`, [sessionId2]);
    check("Ca phụ — chủ tiệm bấm Dừng ngay đóng được phiên (ended_by='tenant')",
      !tenantEndErr && closedRow?.ended_at != null && closedRow?.ended_by === "tenant", tenantEndErr?.message ?? "");
    const { rows: [memberAfter] } = await c.query(
      `select status from public.tenant_members where tenant_id = $1 and user_id = $2`, [tB.id, uAdmin]);
    check("Ca phụ — tenant_members thu hồi ngay (status='removed') sau khi đóng", memberAfter?.status === "removed");

    // Ca phụ: lý do < 10 ký tự bị chặn ở tầng CSDL, không phải ở ô nhập — dùng
    // asUser() (không phải runAs): đây là lượt THỬ, phải tự dọn dù thành công hay lỗi.
    let shortErr = null;
    await asUser(uAdmin, {}, async () => {
      try { await c.query(`select public.open_support_session($1, 'ngắn quá', 60)`, [tB.id]); }
      catch (err) { shortErr = err; }
    });
    check("Ca phụ — lý do <10 ký tự bị chặn (reason_required)", !!shortErr && /reason_required/.test(shortErr.message),
      shortErr?.message ?? "không lỗi");
  }

  console.log("[rls-smoke] #224/#225 người làm + chấm giúp + nhận mặt:");
  {
    // Seed bằng quyền postgres (như backend, bỏ qua RLS). LƯU Ý: uA đã là admin
    // của tB từ dòng ~141 nên KHÔNG dùng uA làm "người ngoài" cho ca forbidden —
    // người ngoài THẬT là một uuid chưa thuộc tiệm nào (xem ca cuối block).
    await c.query(`select set_config('role','postgres', true)`);
    const { rows: [empAcct] } = await c.query(
      `insert into public.employees (tenant_id, full_name, user_id, base_salary_vnd)
       values ($1, 'Thợ Có Tài Khoản', $2, 8000000) returning id`, [tB.id, uC]);
    const { rows: [empWalk] } = await c.query(
      `insert into public.employees (tenant_id, full_name, user_id, base_salary_vnd)
       values ($1, 'Thợ Vãng Lai', null, 6000000) returning id`, [tB.id]);
    // uC = thợ CÓ tài khoản của tB (thành viên staff).
    await c.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'staff')`, [tB.id, uC]);

    // ── #224 nguoi_lam_tiem(): cửa đọc-tên, KHÔNG lộ lương ─────────────────────
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      const res = await c.query(`select * from public.nguoi_lam_tiem()`);
      check("nguoi_lam_tiem: owner B đọc được ≥1 nhân viên của tiệm mình", res.rowCount >= 1, `${res.rowCount} dòng`);
      const cols = res.fields.map((f) => f.name).sort();
      check("nguoi_lam_tiem: đúng {employee_id,person_key,full_name} — KHÔNG có cột lương",
        JSON.stringify(cols) === JSON.stringify(["employee_id", "full_name", "person_key"]), JSON.stringify(cols));
      const rAcct = res.rows.find((r) => r.employee_id === empAcct.id);
      const rWalk = res.rows.find((r) => r.employee_id === empWalk.id);
      check("nguoi_lam_tiem: person_key thợ-có-TK = user_id (uC)", rAcct?.person_key === uC, JSON.stringify(rAcct));
      check("nguoi_lam_tiem: person_key thợ-vãng-lai = employee_id", rWalk?.person_key === empWalk.id, JSON.stringify(rWalk));
    });
    await asUser(uB, { tenant_id: tB.id, role: "manager" }, async () => {
      const res = await c.query(`select * from public.nguoi_lam_tiem()`);
      check("nguoi_lam_tiem: manager B cũng đọc được (vai nằm trong cửa)", res.rowCount >= 1, `${res.rowCount} dòng`);
    });
    await asUser(uC, { tenant_id: tB.id, role: "staff" }, async () => {
      const res = await c.query(`select * from public.nguoi_lam_tiem()`);
      check("nguoi_lam_tiem: staff B = 0 dòng (chặn vai)", res.rowCount === 0, `${res.rowCount} dòng`);
    });
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const res = await c.query(`select * from public.nguoi_lam_tiem()`);
      check("nguoi_lam_tiem: owner A (tiệm A) KHÔNG thấy nhân viên B (cách ly tiệm)", res.rowCount === 0, `${res.rowCount} dòng`);
    });

    // ── #225 lát 2: nạp mặt + đã-nạp-chưa (embedding không rời máy chủ) ─────────
    const desc = Array.from({ length: 128 }, () => 0);
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      const before = await c.query(`select public.face_da_nap($1::uuid) as v`, [empAcct.id]);
      check("face_da_nap: FALSE trước khi nạp", before.rows[0].v === false, JSON.stringify(before.rows[0]));

      let pathErr = null;
      await c.query(`savepoint sp_napmat_badpath`);
      try {
        await c.query(`select public.nap_mat($1::uuid, $2::double precision[], $3)`,
          [empAcct.id, desc, tA.id + "/faces/x.jpg"]);
      } catch (err) { pathErr = err; }
      await c.query(`rollback to savepoint sp_napmat_badpath`);
      check("nap_mat: ảnh SAI tiệm (không thuộc tB) bị chặn (invalid_input)",
        !!pathErr && /invalid_input/.test(pathErr.message), pathErr?.message ?? "không lỗi");

      await c.query(`select public.nap_mat($1::uuid, $2::double precision[], $3)`,
        [empAcct.id, desc, tB.id + "/faces/ok.jpg"]);
      const after = await c.query(`select public.face_da_nap($1::uuid) as v`, [empAcct.id]);
      check("face_da_nap: TRUE sau khi nạp mặt", after.rows[0].v === true, JSON.stringify(after.rows[0]));
    });

    // ── #225 lát 1: cham_cong_giup — chấm giúp + LUÔN gắn cờ + ghi người bấm ────
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      const { rows: [p] } = await c.query(
        `select public.cham_cong_giup($1::uuid,'in',$2,'image/jpeg',10.7,106.6) as punch_id`,
        [empWalk.id, tB.id + "/attendance/x.jpg"]);
      check("cham_cong_giup: thành viên B chấm giúp → trả về punch_id", !!p.punch_id, JSON.stringify(p));
      const punch = await c.query(`select out_of_range from public.attendance_punches where id=$1`, [p.punch_id]);
      check("cham_cong_giup: punch LUÔN gắn cờ (out_of_range=true)", punch.rows[0]?.out_of_range === true, JSON.stringify(punch.rows));
      const proxy = await c.query(
        `select helper_user_id from public.attendance_proxy_punches where punch_id=$1`, [p.punch_id]);
      check("cham_cong_giup: có 1 dòng attendance_proxy_punches ghi người bấm (uB)",
        proxy.rowCount === 1 && proxy.rows[0].helper_user_id === uB, JSON.stringify(proxy.rows));
    });

    // Người NGOÀI tiệm (uuid chưa thuộc tB) → forbidden. KHÔNG dùng uA: uA đã là
    // thành viên admin của tB (dòng ~141) nên sẽ chấm ĐƯỢC, không phải người ngoài.
    const uOut = randomUUID();
    let outErr = null;
    try {
      await asUser(uOut, { tenant_id: tB.id, role: "owner" }, async () => {
        await c.query(`select public.cham_cong_giup($1::uuid,'in',$2,'image/jpeg',10.7,106.6)`,
          [empWalk.id, tB.id + "/attendance/y.jpg"]);
      });
    } catch (err) { outErr = err; }
    check("cham_cong_giup: người NGOÀI tiệm bị chặn (forbidden)",
      !!outErr && /forbidden/.test(outErr.message), outErr?.message ?? "không lỗi");

    // Dọn seed của block (toàn suite vẫn rollback ở cuối) — tránh rò sang ca sau:
    // vd dòng ~1801 chèn (tB,uC,'viewer') on conflict, và vòng generic seed employees.
    // (punch/proxy/employee_face đã tự rollback theo savepoint của mỗi asUser.)
    await c.query(`select set_config('role','postgres', true)`);
    await c.query(`delete from public.employee_face where employee_id = any($1::uuid[])`, [[empAcct.id, empWalk.id]]);
    await c.query(`delete from public.employees where id = any($1::uuid[])`, [[empAcct.id, empWalk.id]]);
    await c.query(`delete from public.tenant_members where tenant_id=$1 and user_id=$2`, [tB.id, uC]);
  }

  console.log("[rls-smoke] Chuông nền tảng (ADR-0007 mục 9, task #84):");
  {
    // Cô lập với trạng thái ghép nối THẬT của môi trường (founder đã/chưa
    // ghép nối bot chuông) — lưu lại để khôi phục đúng thứ tự ca; toàn bộ
    // script rollback ở cuối nên đây chỉ để log không gây hiểu nhầm giữa chừng.
    const { rows: [savedChat] } = await c.query(
      `select value from private.app_config where key = 'platform_bot_chat_id'`);

    // Ca 6 — CHƯA ghép nối ĐƯỜNG NÀO: platform_notify() im lặng bỏ qua.
    //
    // Ca này viết từ hồi Zalo là kênh DUY NHẤT nên chỉ xoá `platform_bot_chat_id`
    // là đủ. Migration #102 CỐ Ý đổi luật ("còn bất kỳ đường nào nhận được thì
    // vẫn ghi") và thêm Telegram làm đường thứ hai — từ đó ca này đo thiếu một
    // nửa điều kiện, và nó bắt đầu FAIL thật khi founder nối Telegram. Lộ ra
    // 13/08 lúc vá migration #119.
    //
    // Sửa cho khớp luật đang chạy: phải cắt CẢ HAI đường mới gọi là "chưa ghép
    // nối". Bọc savepoint để không kéo theo việc xoá liên kết sang khối sau.
    await c.query("savepoint sp_no_channel");
    await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    await c.query(
      `delete from public.user_telegram_links l
        where exists (select 1 from public.platform_admins pa where pa.user_id = l.user_id)`);
    const { rows: [hrNotPaired] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, 'không ai thấy tin này', false) returning id`, [tB.id, uB]);
    const { rows: [cntNotPaired] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key = $1`,
      [`help:${hrNotPaired.id}`]);
    check("Ca 6 — chưa ghép nối đường nào (Zalo lẫn Telegram): không sinh dòng, không lỗi",
      cntNotPaired.n === 0, `thấy ${cntNotPaired.n} dòng`);
    await c.query("rollback to savepoint sp_no_channel");

    // Ghép nối giả lập cho các ca còn lại.
    await c.query(
      `insert into private.app_config (key, value) values ('platform_bot_chat_id', 'smoke-chat-id')
         on conflict (key) do update set value = excluded.value`);

    // Ca 3 + Ca 5 — help_request mới → đúng 1 dòng platform_outbox, nội dung
    // CHỈ là tín hiệu (tên tiệm + dẫn mở /admin), KHÔNG chứa nguyên văn message
    // (ADR-0007 mục 5 — giữ nguyên vẹn nhật ký admin_audit_logs).
    const { rows: [tenantB] } = await c.query(`select name from public.tenants where id = $1`, [tB.id]);
    const secretMsg = `bí mật không được lộ ${stamp}`;
    const { rows: [hr] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, $3, true) returning id`, [tB.id, uB, secretMsg]);
    const { rows: outboxRows } = await c.query(
      `select body from public.platform_outbox where dedupe_key = $1`, [`help:${hr.id}`]);
    check("Ca 3 — insert help_requests sinh đúng 1 dòng platform_outbox", outboxRows.length === 1,
      `thấy ${outboxRows.length} dòng`);
    check("Ca 5 — nội dung tin KHÔNG chứa nguyên văn help_requests.message",
      outboxRows.length === 1 && !outboxRows[0].body.includes(secretMsg), outboxRows[0]?.body ?? "");
    check("Ca 5b — nội dung tin có tên tiệm + dẫn mở /admin",
      outboxRows.length === 1 && outboxRows[0].body.includes(tenantB.name) && outboxRows[0].body.includes("/admin"),
      outboxRows[0]?.body ?? "");

    // Ca 4 — vé chống trùng theo job+ngày: help_requests tự nhiên không lặp
    // (mỗi yêu cầu một id riêng, dedupe_key 'help:<id>' unique theo schema) —
    // ca thật sự có nguy cơ lặp là cùng MỘT job cron hỏng nhiều lần trong
    // ngày (system_alerts UPSERT vào cùng 1 dòng mở). Insert (lần hỏng đầu)
    // rồi update (lần hỏng tiếp) cùng job_id → vẫn phải ra đúng 1 dòng.
    const fakeJobId = 999000 + Number(stamp.slice(-3));
    await c.query(
      `insert into public.system_alerts (job_id, job_name, first_failed_at, last_failed_at, fail_count, detail)
         values ($1, 'smoke-job', now(), now(), 1, 'lần 1')`, [fakeJobId]);
    await c.query(
      `update public.system_alerts set fail_count = fail_count + 1, last_failed_at = now(), detail = 'lần 2'
         where job_id = $1 and acknowledged_at is null`, [fakeJobId]);
    const { rows: [alertCount] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key like $1`,
      [`alert:${fakeJobId}:%`]);
    check("Ca 4 — job hỏng 2 lần trong ngày vẫn 1 dòng (vé chống trùng)", alertCount.n === 1,
      `thấy ${alertCount.n} dòng`);

    // Ca 1 — authenticated (kể cả chủ tiệm) đọc platform_outbox: 0 dòng thấy
    // được, dù bị RLS chặn im lặng hay bị từ chối thẳng ở tầng quyền (table
    // này REVOKE ALL khỏi authenticated — đúng quy ước platform_admins).
    let selBlocked = false;
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      try {
        const r = await c.query(`select id from public.platform_outbox`);
        selBlocked = r.rowCount === 0;
      } catch { selBlocked = true; }
    });
    check("Ca 1 — authenticated đọc platform_outbox = 0 dòng (RLS/khước từ)", selBlocked);

    // Ca 2 — platform_notify() chỉ dành cho trigger nội bộ gọi, client gọi thẳng phải bị từ chối.
    let internalBlocked = false;
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      try { await c.query(`select public.platform_notify('help_request', 'x', 'y')`); }
      catch (err) { internalBlocked = /permission denied/.test(err.message); }
    });
    check("Ca 2 — authenticated gọi thẳng platform_notify() bị từ chối", internalBlocked);

    // Ca 7 — worker gọi sai khóa (bot_ingest_key) phải bị chặn ngay, không claim gì.
    // LƯU Ý (bẫy tự dính lúc viết): raise exception trong Postgres đầu độc cả
    // transaction, không chỉ statement đó — bắt bằng try/catch ở tầng Node là
    // CHƯA ĐỦ, phải rollback to savepoint thì các câu lệnh SAU mới chạy tiếp
    // được (thiếu bước này làm bước khôi phục platform_bot_chat_id ngay dưới
    // chết theo với "current transaction is aborted" — bắt được nhờ chạy thật).
    let claimErr = null;
    await c.query("savepoint sp_claim_bad_key");
    try { await c.query(`select public.platform_claim_outbox('sai-khoa-chac-chan', 5)`); }
    catch (err) { claimErr = err; }
    await c.query("rollback to savepoint sp_claim_bad_key");
    check("Ca 7 — platform_claim_outbox sai p_key bị chặn (invalid_key)",
      !!claimErr && /invalid_key/.test(claimErr.message), claimErr?.message ?? "không lỗi");

    // Khôi phục trạng thái ghép nối thật (transaction rollback ở cuối script
    // cũng tự lo việc này — làm tường minh để log giữa chừng không gây hiểu nhầm).
    if (savedChat) {
      await c.query(
        `insert into private.app_config (key, value) values ('platform_bot_chat_id', $1)
           on conflict (key) do update set value = excluded.value`, [savedChat.value]);
    } else {
      await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    }
  }

  console.log("[rls-smoke] Chủ dự án ≠ chủ tiệm (migration #119, task #133):");
  {
    // Lỗ leo thang quyền bắt được 13/08: ba hàm dưới đây từng hỏi "có phải
    // chủ/quản trị của MỘT TIỆM NÀO ĐÓ không?" thay vì "có phải CHỦ DỰ ÁN
    // không?". Vì đăng ký iFan là tự phục vụ và `create_tenant()` tự đặt người
    // gọi làm owner, ai cũng tự cấp cho mình vai "chủ tiệm" được ⇒ nối Telegram
    // là chiếm quyền chủ dự án trên bot (kèm cờ sửa file thẳng trên máy
    // founder). Bảy ca dưới đây khoá cả ba hàm lại theo `platform_admins`.
    const { rows: [ingest] } = await c.query(
      `select value from private.app_config where key = 'bot_ingest_key'`);
    const botKey = ingest?.value ?? null;

    // uShop = chủ tiệm THẬT nhưng KHÔNG phải chủ dự án — đóng vai "khách hàng
    // tự đăng ký". uBoss = chủ dự án (có tên trong platform_admins).
    const uShop = randomUUID(), uBoss = randomUUID();
    const tgShop = `smoke-tg-shop-${stamp}`, tgBoss = `smoke-tg-boss-${stamp}`;
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uShop, `smoke-shop-${stamp}@t.local`, uBoss, `smoke-boss-${stamp}@t.local`]);
    const { rows: [tShop] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Tiệm Khách', $1, true) returning id`,
      [`smoke-shop-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner')`,
      [tShop.id, uShop]);
    // Chủ tiệm nối Telegram SAU CÙNG — cố ý, để chứng minh "nối gần nhất"
    // KHÔNG thắng được "có phải chủ dự án".
    await c.query(
      `insert into public.user_telegram_links (user_id, telegram_user_id) values ($1,$2)`,
      [uShop, tgShop]);

    if (!botKey) {
      check("KHÓA CHUNG: bot_ingest_key phải có để kiểm 3 hàm bot", false,
        "private.app_config['bot_ingest_key'] trống — 7 ca dưới không chạy được");
    } else {
      // Ca 1 — chủ tiệm nối Telegram: bot phải thấy là NGƯỜI THƯỜNG.
      const { rows: [whoShop] } = await c.query(
        `select public.tg_who_is($1,$2) as w`, [botKey, tgShop]);
      check("CDA ca1: chủ tiệm nối Telegram → is_founder = false (không phải chủ dự án)",
        whoShop.w?.linked === true && whoShop.w?.is_founder === false, JSON.stringify(whoShop.w));

      // Ca 2 — chống hồi quy: trường `is_staff` đã GỠ HẲN. Nó từng là cổng
      // quyền sai ở cả 3 nơi dùng; giữ lại là để nguyên cái bẫy cho lần sau.
      check("CDA ca2: tg_who_is KHÔNG còn trả trường is_staff (đã gỡ, chống dùng nhầm lại)",
        whoShop.w !== null && !("is_staff" in whoShop.w), JSON.stringify(whoShop.w));

      // Ca 3 — chuông nền tảng KHÔNG được chọn chủ tiệm, dù họ nối mới nhất.
      const { rows: [tgt1] } = await c.query(
        `select public.tg_platform_target($1) as t`, [botKey]);
      check("CDA ca3: tg_platform_target KHÔNG trả Telegram của chủ tiệm (dù nối mới nhất)",
        tgt1.t !== tgShop, `trả về ${tgt1.t}`);

      // Ca 4 — cho uBoss vào platform_admins rồi nối Telegram ⇒ phải thành
      // người nhận chuông (nối sau uShop nên cũng là mới nhất).
      await c.query(`insert into public.platform_admins (user_id) values ($1)`, [uBoss]);
      await c.query(
        `insert into public.user_telegram_links (user_id, telegram_user_id) values ($1,$2)`,
        [uBoss, tgBoss]);
      const { rows: [whoBoss] } = await c.query(
        `select public.tg_who_is($1,$2) as w`, [botKey, tgBoss]);
      check("CDA ca4: chủ dự án nối Telegram → is_founder = true",
        whoBoss.w?.is_founder === true, JSON.stringify(whoBoss.w));

      const { rows: [tgt2] } = await c.query(
        `select public.tg_platform_target($1) as t`, [botKey]);
      check("CDA ca5: tg_platform_target trả đúng Telegram của chủ dự án",
        tgt2.t === tgBoss, `trả về ${tgt2.t}`);
    }

    // Ca 6 — CHƯA ghép Zalo và CHỈ có chủ tiệm nối Telegram ⇒ không ai nhận
    // được ⇒ platform_notify phải đứng yên. Bản #102 đếm cả link của chủ tiệm
    // nên tưởng "đã có đường nhận", sinh dòng vào hàng đợi không ai đọc.
    await c.query("savepoint sp_cda_ca6");
    await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    await c.query(`delete from public.user_telegram_links where telegram_user_id <> $1`, [tgShop]);
    const { rows: [hrShopOnly] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, 'chỉ chủ tiệm nối telegram', false) returning id`, [tB.id, uB]);
    const { rows: [cntShopOnly] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key = $1`,
      [`help:${hrShopOnly.id}`]);
    check("CDA ca6: chỉ chủ tiệm nối Telegram (chưa ghép Zalo) → KHÔNG sinh dòng chuông",
      cntShopOnly.n === 0, `thấy ${cntShopOnly.n} dòng`);
    await c.query("rollback to savepoint sp_cda_ca6");

    // Ca 7 — đối chứng: chủ dự án đã nối Telegram thì vẫn phải sinh dòng
    // (giữ đúng ý định #102 — còn đường nào nhận được thì đừng đứng yên).
    await c.query("savepoint sp_cda_ca7");
    await c.query(`delete from private.app_config where key = 'platform_bot_chat_id'`);
    await c.query(`delete from public.user_telegram_links where telegram_user_id <> $1`, [tgBoss]);
    const { rows: [hrBoss] } = await c.query(
      `insert into public.help_requests (tenant_id, created_by, message, allow_screen_view)
         values ($1, $2, 'chủ dự án đã nối telegram', false) returning id`, [tB.id, uB]);
    const { rows: [cntBoss] } = await c.query(
      `select count(*)::int as n from public.platform_outbox where dedupe_key = $1`,
      [`help:${hrBoss.id}`]);
    check("CDA ca7 (đối chứng): chủ dự án đã nối Telegram → VẪN sinh dòng chuông",
      cntBoss.n === 1, `thấy ${cntBoss.n} dòng`);
    await c.query("rollback to savepoint sp_cda_ca7");
  }

  console.log("[rls-smoke] Zalo Bot hỏi đáp (ADR-0016, task #128):");
  {
    const uZA = randomUUID(), uZB = randomUUID(), uZRem = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6)`,
      [uZA, `smoke-za-${stamp}@t.local`, uZB, `smoke-zb-${stamp}@t.local`,
       uZRem, `smoke-zrem-${stamp}@t.local`]);
    const { rows: [tZalo] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Zalo', $1, true) returning id`,
      [`smoke-zalo-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role, status) values
       ($1,$2,'staff','active'),($1,$3,'staff','active'),($1,$4,'staff','removed')`,
      [tZalo.id, uZA, uZB, uZRem]);
    const { rows: [ch] } = await c.query(
      `insert into public.notification_channels (tenant_id, kind) values ($1,'zalo_bot') returning id`,
      [tZalo.id]);
    await c.query(
      `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values
       ($1,$2,'chat-a'),($1,$3,'chat-b'),($1,$4,'chat-removed')`,
      [tZalo.id, uZA, uZB, uZRem]);

    // Dữ liệu để "việc"/"lịch"/"khách" có gì mà trả lời.
    const { rows: [contactA] } = await c.query(
      `insert into public.contacts (tenant_id, full_name, phone) values ($1,'Nguyễn Văn Khách', '0900000000') returning id`,
      [tZalo.id]);
    await c.query(
      `insert into public.activities (tenant_id, type, subject, contact_id, owner_id, due_at) values
       ($1,'task','Gọi lại khách', $2, $3, now() - interval '1 hour')`,
      [tZalo.id, contactA.id, uZA]);
    // Thứ theo GIỜ VIỆT NAM, không phải giờ quốc tế: CSDL tính `extract(dow …
    // at time zone <múi giờ tiệm>)`, mặc định Asia/Ho_Chi_Minh (UTC+7). Từ 17:00
    // UTC trở đi (tức 0h–7h sáng giờ VN) hai mốc này LỆCH NHAU MỘT NGÀY.
    // Hiện chưa ca nào đọc tới giá trị này nên chưa hỏng gì — chỉnh để nó không
    // thành bẫy cho ca kiểm sau. Cùng loại với `campaign_sends.send_at`: một cổng
    // đỏ theo đồng hồ dạy người ta bỏ qua báo đỏ.
    const dow = new Date(Date.now() + 7 * 3600e3).getUTCDay();
    await c.query(
      `insert into public.business_hours (tenant_id, weekday, open_time, close_time) values ($1,$2,'00:00','23:59')`,
      [tZalo.id, dow]);
    await c.query(
      `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at) values
       ($1,$2,$3, now() + interval '1 hour', now() + interval '2 hour')`,
      [tZalo.id, contactA.id, uZA]);

    const { rows: [ingest] } = await c.query(
      `select value from private.app_config where key = 'bot_ingest_key'`);
    const botKey = ingest?.value ?? null;

    if (!botKey) {
      check("ZALO KHOÁ CHUNG: bot_ingest_key phải có để kiểm bot_answer", false,
        "private.app_config['bot_ingest_key'] trống — 10 ca dưới không chạy được");
    } else {
      const ask = async (chatId, text) =>
        (await c.query(`select public.bot_answer($1,$2,$3,$4) as r`, [botKey, ch.id, chatId, text])).rows[0].r;

      // Ca 1 — "việc" trả đúng số quá hạn của CHÍNH uZA (1 việc quá hạn vừa tạo).
      const r1 = await ask("chat-a", "hôm nay tôi có việc gì?");
      check("Zalo ca1: hỏi 'việc' → trả đúng quá hạn của chính mình",
        typeof r1.reply === "string" && r1.reply.includes("Quá hạn: 1"), JSON.stringify(r1));

      // Ca 2 — việc của uZB (đồng nghiệp, KHÔNG có việc quá hạn nào) không lẫn vào uZA.
      const r2 = await ask("chat-b", "việc");
      check("Zalo ca2: việc của ĐỒNG NGHIỆP không lọt vào câu trả lời (uZB có 0 việc quá hạn)",
        typeof r2.reply === "string" && r2.reply.includes("Quá hạn: 0"), JSON.stringify(r2));

      // Ca 3 — chat lạ chưa từng liên kết → chỉ đường lấy mã, không lộ gì.
      const r3 = await ask("chat-la-hoac-chua-tung-noi", "việc");
      check("Zalo ca3: chat chưa liên kết → chỉ đường lấy mã, không lộ dữ liệu",
        typeof r3.reply === "string" && r3.reply.includes("/link") && !r3.reply.includes("Quá hạn"),
        JSON.stringify(r3));

      // Ca 4 — người ĐÃ BỊ GỠ khỏi tiệm (hàng liên kết còn sót) → bị từ chối,
      // KHÔNG trả dữ liệu — đúng bài học migration #119 tối nay.
      const r4 = await ask("chat-removed", "việc");
      check("Zalo ca4: người đã bị gỡ khỏi tiệm (còn hàng liên kết) → bị từ chối, không trả dữ liệu",
        typeof r4.reply === "string" && !r4.reply.includes("Quá hạn") && !r4.reply.includes("Lịch"),
        JSON.stringify(r4));

      // Ca 5 — hỏi bằng chat đã nối TIỆM KHÁC (tenant khác), gửi tới bot tiệm
      // này → tuyệt đối không trộn dữ liệu hai tiệm.
      const { rows: [tOther] } = await c.query(
        `insert into public.tenants (name, slug, is_sample) values ('Smoke Zalo Khác', $1, true) returning id`,
        [`smoke-zalo-2-${stamp}`]);
      const uOther = randomUUID();
      await c.query(
        `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
        [uOther, `smoke-zother-${stamp}@t.local`]);
      await c.query(
        `insert into public.tenant_members (tenant_id, user_id, role, status) values ($1,$2,'staff','active')`,
        [tOther.id, uOther]);
      await c.query(
        `insert into public.staff_channel_links (tenant_id, user_id, external_chat_id) values ($1,$2,'chat-other-tenant')`,
        [tOther.id, uOther]);
      const r5 = await ask("chat-other-tenant", "việc"); // hỏi bot TIỆM NÀY (ch.id) bằng chat của TIỆM KIA
      check("Zalo ca5: chat đã nối tiệm KHÁC, hỏi bot tiệm này → không trộn dữ liệu (rơi về chưa liên kết)",
        typeof r5.reply === "string" && r5.reply.includes("/link") && !r5.reply.includes("Quá hạn"),
        JSON.stringify(r5));

      // Ca 6 — "khách <tên>" phải theo ĐÚNG quyền đọc khách trong app
      // (policy contacts_select #65): vai staff CHỈ thấy khách mình phụ trách.
      //
      // Bản đầu của ca này chỉ hỏi "có tìm ra khách không" nên đóng dấu XANH
      // cho đúng hành vi SAI (bot rộng hơn app) — vá ở migration #121. Giờ
      // hỏi đúng câu: AI ĐƯỢC PHÉP thấy.
      await c.query(
        `insert into public.contacts (tenant_id, full_name, phone, owner_id)
           values ($1,'Trần Thị Người Khác','0911111111',$2)`,
        [tZalo.id, uZB]);
      const r6a = await ask("chat-a", "khách Trần Thị Người Khác");
      check("Zalo ca6a: staff KHÔNG thấy khách của đồng nghiệp (khớp policy contacts_select)",
        typeof r6a.reply === "string" && !r6a.reply.includes("0911111111"), JSON.stringify(r6a));

      // Đối chứng 1 — chính chủ phụ trách thì PHẢI thấy.
      const r6b = await ask("chat-b", "khách Trần Thị Người Khác");
      check("Zalo ca6b (đối chứng): staff THẤY khách do chính mình phụ trách",
        typeof r6b.reply === "string" && r6b.reply.includes("0911111111"), JSON.stringify(r6b));

      // Đối chứng 2 — quản lý xem được cả tiệm, y như trong app.
      await c.query(
        `update public.tenant_members set role='manager' where tenant_id=$1 and user_id=$2`,
        [tZalo.id, uZA]);
      const r6c = await ask("chat-a", "khách Trần Thị Người Khác");
      check("Zalo ca6c (đối chứng): quản lý xem được khách cả tiệm, đúng như trong app",
        typeof r6c.reply === "string" && r6c.reply.includes("0911111111"), JSON.stringify(r6c));
      await c.query(
        `update public.tenant_members set role='staff' where tenant_id=$1 and user_id=$2`,
        [tZalo.id, uZA]);

      // Ca 6d — ký tự đại diện của ILIKE không được biến "khách %" thành
      // "khớp tất cả" (contactA không có người phụ trách, uZA vai staff).
      const r6d = await ask("chat-a", "khách %");
      check("Zalo ca6d: 'khách %' KHÔNG khớp bừa cả danh sách (đã thoát ký tự đại diện)",
        typeof r6d.reply === "string" && r6d.reply.includes("Không thấy"), JSON.stringify(r6d));

      // Ca 7 — câu ngoài 3 ý → nói làm được gì, KHÔNG đoán, không gọi AI.
      const r7 = await ask("chat-a", "thời tiết hôm nay thế nào");
      check("Zalo ca7: câu ngoài phạm vi → trả câu 'làm được gì', không đoán bừa",
        typeof r7.reply === "string" && r7.reply.includes("việc") && r7.reply.includes("lịch") && r7.reply.includes("khách"),
        JSON.stringify(r7));

      // Ca 8 — quá 20 câu/ngày: mồi sẵn ĐÚNG 20 dòng 'answer' hôm nay cho uZA,
      // lượt thứ 21 phải là ĐÚNG MỘT câu báo hết lượt, lượt thứ 22 im lặng
      // hoàn toàn. Xoá trước các dòng ca1/ca7 đã lỡ ghi cho uZA/"chat-a" —
      // thiếu bước này thì nền không phải 20 sạch (bắt được nhờ chạy thật).
      await c.query("savepoint sp_zalo_ca8");
      await c.query(
        `delete from public.bot_outbox where tenant_id = $1 and user_id = $2 and kind = 'answer'`,
        [tZalo.id, uZA]);
      await c.query(
        `insert into public.bot_outbox (tenant_id, user_id, external_chat_id, kind, dedupe_key, body, status, sent_at)
           select $1, $2, 'chat-a', 'answer', 'seed:' || gen_random_uuid(), 'mồi', 'sent', now()
             from generate_series(1,20)`,
        [tZalo.id, uZA]);
      const r8a = await ask("chat-a", "việc");
      check("Zalo ca8a: đúng lượt thứ 21 trong ngày → MỘT câu báo hết lượt",
        typeof r8a.reply === "string" && r8a.reply.includes("20") && r8a.reply.toLowerCase().includes("lượt"),
        JSON.stringify(r8a));
      const r8b = await ask("chat-a", "việc");
      check("Zalo ca8b: lượt thứ 22 trong ngày → im lặng hoàn toàn (reply=null)",
        r8b.reply === null, JSON.stringify(r8b));
      await c.query("rollback to savepoint sp_zalo_ca8");

      // Ca 9 — tiệm chạm trần 3.000 tin/tháng → dừng trả lời (im lặng phía
      // người hỏi) NHƯNG rung chuông thật, không chết ngầm.
      await c.query("savepoint sp_zalo_ca9");
      const vMonth = new Date();
      const monthKeyVN = `${vMonth.getUTCFullYear()}-${String(vMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
      await c.query(
        `insert into public.channel_quota (tenant_id, month, sent_count) values ($1,$2,3000)
           on conflict (tenant_id, month) do update set sent_count = 3000`,
        [tZalo.id, monthKeyVN]);
      const r9 = await ask("chat-b", "việc");
      const { rows: [alert9] } = await c.query(
        `select detail from public.system_alerts where job_name = 'zalo-bot-digest' and acknowledged_at is null
           and detail like '%' || $1 || '%'`, [tZalo.id]);
      check("Zalo ca9: tiệm chạm trần tháng → im lặng phía người hỏi",
        r9.reply === null, JSON.stringify(r9));
      check("Zalo ca9b: tiệm chạm trần tháng → RUNG CHUÔNG thật (system_alerts), không chết ngầm",
        !!alert9, JSON.stringify(alert9));
      await c.query("rollback to savepoint sp_zalo_ca9");

      // Ca 10 — authenticated gọi thẳng bot_answer() KHÔNG qua p_key hợp lệ phải bị chặn.
      let ca10Err = null;
      await asUser(uZA, { tenant_id: tZalo.id, role: "staff" }, async () => {
        try { await c.query(`select public.bot_answer('sai-khoa', $1, 'chat-a', 'việc')`, [ch.id]); }
        catch (e) { ca10Err = e; }
      });
      check("Zalo ca10: gọi bot_answer() sai p_key → bị chặn (invalid_key)",
        !!ca10Err && /invalid_key/.test(ca10Err.message), ca10Err?.message ?? "CHẠY ĐƯỢC — chốt hở!");
    }
  }

  console.log("[rls-smoke] Cổng khách công khai V1.5 (ADR-0008 mục 8, task #87):");
  {
    // Tiệm B: bật mặt tiền + form, giờ mở cửa cả ngày hôm nay (chỉ để storefront_view
    // có dữ liệu trả — is_open không tính ở SQL, xem chú thích đầu migration #80).
    // Tiệm A: KHÔNG có dòng tenant_storefront -> mặc định tắt, dùng làm ca "form chưa bật".
    await c.query(
      `insert into public.tenant_storefront (tenant_id, storefront_enabled, lead_form_enabled)
         values ($1, true, true)`, [tB.id]);
    // Thứ theo GIỜ VIỆT NAM, không phải giờ quốc tế: CSDL tính `extract(dow …
    // at time zone <múi giờ tiệm>)`, mặc định Asia/Ho_Chi_Minh (UTC+7). Từ 17:00
    // UTC trở đi (tức 0h–7h sáng giờ VN) hai mốc này LỆCH NHAU MỘT NGÀY.
    // Hiện chưa ca nào đọc tới giá trị này nên chưa hỏng gì — chỉnh để nó không
    // thành bẫy cho ca kiểm sau. Cùng loại với `campaign_sends.send_at`: một cổng
    // đỏ theo đồng hồ dạy người ta bỏ qua báo đỏ.
    const dow = new Date(Date.now() + 7 * 3600e3).getUTCDay();
    await c.query(
      `insert into public.business_hours (tenant_id, weekday, open_time, close_time)
         values ($1, $2, '00:00', '23:59')`, [tB.id, dow]);
    const { rows: [tARow] } = await c.query(`select slug from public.tenants where id=$1`, [tA.id]);
    const { rows: [tBRow] } = await c.query(`select slug from public.tenants where id=$1`, [tB.id]);

    // Ca 1 — anon đọc THẲNG bảng cấu hình form/giờ mở cửa = 0 dòng. RPC là cửa
    // duy nhất (đúng nguyên tắc livechat #23) — chấp nhận cả 2 dạng: RLS trả 0
    // dòng, hoặc revoke chặn thẳng bằng lỗi quyền (2 cách đều = "không đọc được").
    await c.query("savepoint sp_anon_read");
    await c.query(`select set_config('role','anon', true), set_config('request.jwt.claims','{}', true)`);
    let sfBlocked = false, bhBlocked = false;
    try { const r = await c.query(`select tenant_id from public.tenant_storefront where tenant_id=$1`, [tB.id]); sfBlocked = r.rowCount === 0; }
    catch { sfBlocked = true; }
    try { const r = await c.query(`select id from public.business_hours where tenant_id=$1`, [tB.id]); bhBlocked = r.rowCount === 0; }
    catch { bhBlocked = true; }
    await c.query("rollback to savepoint sp_anon_read");
    check("Ca 1 — anon đọc thẳng tenant_storefront = 0 dòng (RLS/khước từ)", sfBlocked);
    check("Ca 1b — anon đọc thẳng business_hours = 0 dòng (RLS/khước từ)", bhBlocked);

    // storefront_view: slug hợp lệ + đã bật -> trả dữ liệu; slug lạ -> not_found
    // đồng nhất (không dò được tiệm nào tồn tại qua thông báo lỗi, ADR mục 5).
    const view = await c.query(`select public.storefront_view($1) as v`, [tBRow.slug]);
    check("storefront_view trả enabled=true khi tiệm đã bật mặt tiền", view.rows[0].v.enabled === true, JSON.stringify(view.rows[0].v));
    let notFoundErr = null;
    await c.query("savepoint sp_sf_notfound");
    try { await c.query(`select public.storefront_view($1)`, [`khong-ton-tai-${stamp}`]); }
    catch (err) { notFoundErr = err; }
    await c.query("rollback to savepoint sp_sf_notfound");
    check("storefront_view slug không tồn tại -> not_found", !!notFoundErr && /not_found/.test(notFoundErr.message), notFoundErr?.message ?? "không lỗi");

    // Ca 2 — không có tham số tenant_id nào ở storefront_submit_lead (chỉ p_slug)
    // nên "gửi form với tenant_id tiệm khác" KHÔNG CÓ ĐƯỜNG THỰC HIỆN — chốt bằng
    // kết quả: gửi qua slug A luôn rơi vào nhánh của A (form tắt), không lọt sang B.
    // Ca 4 — tiệm CHƯA bật form (tiệm A) -> "từ chối lịch sự" = form_disabled, không tạo lead.
    let disabledErr = null;
    await c.query("savepoint sp_disabled");
    try {
      await c.query(
        `select public.storefront_submit_lead($1,$2,$3,'Khách Test','0912345678','{}'::jsonb)`,
        [tARow.slug, `tok-${stamp}-disabled`, `ip-${stamp}-disabled`]);
    } catch (err) { disabledErr = err; }
    await c.query("rollback to savepoint sp_disabled");
    check("Ca 2+4 — tiệm chưa bật form -> form_disabled, không tạo lead, không lọt sang tiệm khác",
      !!disabledErr && /form_disabled/.test(disabledErr.message), disabledErr?.message ?? "không lỗi");

    // Input cơ bản: tên rỗng / SĐT sai khuôn phải bị chặn ở CSDL, không chỉ ở client.
    let emptyNameErr = null;
    await c.query("savepoint sp_empty_name");
    try { await c.query(`select public.storefront_submit_lead($1,$2,$3,'','0912345678','{}'::jsonb)`, [tBRow.slug, `tok-${stamp}-empty`, `ip-${stamp}-empty`]); }
    catch (err) { emptyNameErr = err; }
    await c.query("rollback to savepoint sp_empty_name");
    check("Tên rỗng -> invalid_request", !!emptyNameErr && /invalid_request/.test(emptyNameErr.message), emptyNameErr?.message ?? "không lỗi");
    let badPhoneErr = null;
    await c.query("savepoint sp_bad_phone");
    try { await c.query(`select public.storefront_submit_lead($1,$2,$3,'Khách Test','090 123','{}'::jsonb)`, [tBRow.slug, `tok-${stamp}-badphone`, `ip-${stamp}-badphone`]); }
    catch (err) { badPhoneErr = err; }
    await c.query("rollback to savepoint sp_bad_phone");
    check("SĐT sai khuôn -> invalid_phone", !!badPhoneErr && /invalid_phone/.test(badPhoneErr.message), badPhoneErr?.message ?? "không lỗi");

    // Ca 3 — chống lụt theo (tiệm, IP): 5 lượt/giờ đầu OK, lượt 6 phải rate_limited.
    const floodIp = `ip-flood-${stamp}`;
    let floodOk = true;
    for (let i = 0; i < 5; i++) {
      try {
        await c.query(
          `select public.storefront_submit_lead($1,$2,$3,$4,$5,'{}'::jsonb)`,
          [tBRow.slug, `tok-flood-${stamp}-${i}`, floodIp, `Khách Flood ${i}`, `09${String(20000000 + i)}`]);
      } catch { floodOk = false; }
    }
    check("Ca 3 — 5 lượt/giờ đầu tiên cùng IP đều thành công", floodOk);
    // Ca 3b — LUẬT ĐÃ ĐỔI Ở #240: lượt thứ 6 KHÔNG còn bị ném 'rate_limited'
    // (đuổi khách thật sau CGNAT) mà rơi vào HÀNG CHỜ DUYỆT. Ca này trước đây
    // kỳ vọng bị từ chối; giữ nguyên nó là canh một hành vi đã cố ý bỏ đi. Nay
    // đo đúng luật mới: không ném lỗi, trả held=true. Chốt 60/giờ/TIỆM vẫn từ
    // chối cứng — đo ở khối #226 bên dưới không được, vì đẩy 60 lượt vào một
    // giao dịch là quá chậm; chốt đó đã được kiểm bằng tay khi áp migration.
    let flood6Err = null;
    let flood6Res = null;
    await c.query("savepoint sp_flood6");
    try {
      const { rows: [r6] } = await c.query(
        `select public.storefront_submit_lead($1,$2,$3,'Khách Flood 6','0999999999','{}'::jsonb) as r`,
        [tBRow.slug, `tok-flood-${stamp}-6`, floodIp]);
      flood6Res = r6.r;
    } catch (err) { flood6Err = err; }
    await c.query("rollback to savepoint sp_flood6");
    check("Ca 3b — lượt thứ 6 cùng (tiệm, IP) KHÔNG bị đuổi nữa, vào hàng chờ duyệt (#240)",
      !flood6Err && flood6Res?.held === true,
      flood6Err ? flood6Err.message : JSON.stringify(flood6Res));

    // Ca 5 — trùng SĐT khách cũ: gộp vào khách cũ, KHÔNG tạo bản ghi trùng,
    // sinh việc "khách cũ quay lại" — vô hình với khách (kết quả trả về giống hệt).
    const dupPhone = "0938887766";
    const r1 = await c.query(
      `select public.storefront_submit_lead($1,$2,$3,'Khách Cũ',$4,'{}'::jsonb) as v`,
      [tBRow.slug, `tok-dup-${stamp}-1`, `ip-dup1-${stamp}`, dupPhone]);
    check("Ca 5a — lần gửi đầu tạo contact mới (matched_existing=false)", r1.rows[0].v.matched_existing === false, JSON.stringify(r1.rows[0].v));
    const { rows: [c1] } = await c.query(
      `select id from public.contacts where tenant_id=$1 and phone_e164='+84938887766'`, [tB.id]);
    check("Ca 5b — có đúng 1 contact với SĐT đó sau lần đầu", !!c1);
    const r2 = await c.query(
      `select public.storefront_submit_lead($1,$2,$3,'Khách Cũ Quay Lại',$4,'{}'::jsonb) as v`,
      [tBRow.slug, `tok-dup-${stamp}-2`, `ip-dup2-${stamp}`, dupPhone]);
    check("Ca 5c — gửi lại cùng SĐT (thiết bị khác) -> matched_existing=true", r2.rows[0].v.matched_existing === true, JSON.stringify(r2.rows[0].v));
    const { rows: [dupCount] } = await c.query(
      `select count(*)::int as n from public.contacts where tenant_id=$1 and phone_e164='+84938887766'`, [tB.id]);
    check("Ca 5d — vẫn đúng 1 contact, không sinh bản trùng", dupCount.n === 1, `thấy ${dupCount.n}`);
    const { rows: taskRows } = await c.query(
      `select id from public.activities where tenant_id=$1 and contact_id=$2 and subject ilike '%quay lại%'`,
      [tB.id, c1.id]);
    check("Ca 5e — sinh việc 'khách cũ quay lại' cho người phụ trách", taskRows.length === 1, `thấy ${taskRows.length}`);

    // Bộ trường "Hỏi thêm" theo pack ngành: chỉ trả/lưu field ĐÃ BẬT, field lạ
    // hoặc chưa bật bị lọc bỏ — client vãng lai không nhét được key tuỳ ý vào
    // contacts.custom (mục 7: "bộ trường ĐÓNG theo pack ngành").
    //
    // is_sample=false ĐI KÈM industry='spa': partial unique index
    // tenants_one_sample_per_industry (migration #64) chỉ cho MỘT tiệm
    // is_sample=true mỗi ngành — tiệm demo-spa-huong-sen thật đã chiếm ngành
    // 'spa' rồi, giữ nguyên is_sample=true ở đây sẽ đụng constraint ngay cả
    // trong transaction sẽ rollback (unique index không hoãn kiểm). Test này
    // chỉ cần industry đúng để đọc field theo pack — is_sample không liên
    // quan (task #149, bắt được khi chạy thật lúc nghiệm thu V3).
    await c.query(`update public.tenants set industry='spa', is_sample=false where id=$1`, [tB.id]);
    await c.query(`update public.tenant_storefront set lead_form_fields='["service_interest"]'::jsonb where tenant_id=$1`, [tB.id]);
    const viewSpa = await c.query(`select public.storefront_view($1) as v`, [tBRow.slug]);
    const fields = viewSpa.rows[0].v.lead_form_fields;
    check("Catalog — storefront_view chỉ trả field ĐÃ BẬT (service_interest)",
      Array.isArray(fields) && fields.length === 1 && fields[0].key === "service_interest", JSON.stringify(fields));
    await c.query(
      `select public.storefront_submit_lead($1,$2,$3,'Khách Field','0977001122',$4::jsonb)`,
      [tBRow.slug, `tok-field-${stamp}`, `ip-field-${stamp}`,
       JSON.stringify({ service_interest: "Chăm sóc da", preferred_time: "Sáng (8:00–12:00)" })]);
    const { rows: [contactField] } = await c.query(
      `select custom from public.contacts where tenant_id=$1 and phone_e164='+84977001122'`, [tB.id]);
    check("Catalog — chỉ lưu field đã bật (service_interest), bỏ field chưa bật (preferred_time)",
      contactField.custom.service_interest === "Chăm sóc da" && contactField.custom.preferred_time === undefined,
      JSON.stringify(contactField.custom));

    // ── #226 LEAD CHỜ DUYỆT thay vì bị TỪ CHỐI (migration #240) ──────────────
    // Trước #240: quá 5 lượt/giờ mỗi (tiệm, IP) là NÉM 'rate_limited' — ở VN
    // nhiều thuê bao chung một IP nhà mạng nên khách THẬT thứ 6 bị đuổi. Nay
    // rơi vào hàng chờ duyệt. Ba thứ phải đo: (a) không còn đuổi, (b) PII không
    // rò sang bảng cho-mọi-thành-viên-đọc, (c) chỉ vai duyệt được đọc/quyết.
    {
      await c.query("savepoint sp_lead_hold");
      const ipFlood = `ip-hold-${stamp}`;
      let heldLeadId = null;
      for (let i = 0; i < 5; i++) {
        await c.query(
          `insert into public.storefront_lead_submissions(tenant_id, ip_hash, contact_id, matched_existing)
             values ($1, $2, null, false)`, [tB.id, ipFlood]);
      }
      const { rows: [held] } = await c.query(
        `select public.storefront_submit_lead($1,null,$2,'Khách Bị Giữ','0966554433','{}'::jsonb) as r`,
        [tBRow.slug, ipFlood]);
      check("#226 — lượt thứ 6 cùng IP KHÔNG bị đuổi, rơi vào hàng chờ (held=true)",
        held.r?.held === true, JSON.stringify(held.r));
      check("#226 — khách bị giữ KHÔNG thành contact ngay",
        (await c.query(`select 1 from public.contacts where tenant_id=$1 and phone_e164='+84966554433'`,
          [tB.id])).rowCount === 0, "vẫn tạo contact");

      // PII nằm ở bảng riêng, dòng ghi vào storefront_lead_submissions phải RỖNG
      // người (contact_id null) — bảng đó MỌI thành viên tiệm đọc được.
      const { rows: [holdRow] } = await c.query(
        `select payload, status from public.storefront_lead_holds where tenant_id=$1 order by created_at desc limit 1`,
        [tB.id]);
      check("#226 — tên/SĐT nằm trong storefront_lead_holds (bảng chỉ RPC đọc)",
        holdRow?.payload?.e164 === "+84966554433" && holdRow.status === "held", JSON.stringify(holdRow?.payload));

      // Vai staff KHÔNG được đọc/quyết (PII người chưa thành khách).
      await asUser(uC, { tenant_id: tB.id, role: "staff" }, async () => {
        let e = null;
        try { await c.query(`select * from public.held_leads_list()`); } catch (err) { e = err; }
        check("#226 — vai staff KHÔNG đọc được danh sách lead chờ (forbidden)",
          !!e && /forbidden/.test(e.message), e?.message ?? "không lỗi");
      });
      // Bảng lead giữ: revoke all khỏi authenticated + KHÔNG policy nào → đọc
      // thẳng bị chặn ngay ở tầng quyền (42501), chưa tới lượt RLS. Chặn cứng
      // hơn "trả 0 dòng", nên ca chấp nhận CẢ HAI kết cục: lỗi quyền hoặc rỗng.
      await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
        let directErr = null;
        let directRows = -1;
        await c.query("savepoint sp_lead_direct");
        try {
          directRows = (await c.query(`select * from public.storefront_lead_holds`)).rowCount;
        } catch (err) { directErr = err; }
        await c.query("rollback to savepoint sp_lead_direct");
        check("#226 — đọc THẲNG bảng lead giữ bị chặn (không grant, không policy — chỉ qua RPC)",
          (!!directErr && directErr.code === "42501") || directRows === 0,
          directErr ? `${directErr.code} ${directErr.message}` : `${directRows} dòng`);

        const list = await c.query(`select * from public.held_leads_list()`);
        check("#226 — owner đọc được qua RPC (≥1 lead chờ)", list.rowCount >= 1, `${list.rowCount} dòng`);
        const mine = list.rows.find((r) => r.phone === "0966554433");
        check("#226 — RPC trả đúng tên + số để gọi",
          mine?.full_name === "Khách Bị Giữ", JSON.stringify(mine));

        heldLeadId = mine.id;
      });

      // Duyệt NHẬN — KHÔNG bọc trong asUser: helper đó rollback mọi thay đổi khi
      // thoát, mà ở đây phải soi HẬU QUẢ của cú duyệt (contact đã tạo · PII đã
      // xoá). Tự dựng phiên owner rồi hạ về quyền hệ thống để đọc bảng chỉ-RPC.
      await c.query(
        `select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
        [JSON.stringify({ sub: uB, role: "authenticated", app_metadata: { tenant_id: tB.id, role: "owner" } })]);
      const { rows: [ok] } = await c.query(`select public.held_lead_approve($1) as cid`, [heldLeadId]);
      check("#226 — duyệt Nhận trả về contact_id", !!ok.cid, JSON.stringify(ok));
      check("#226 — sau khi nhận, khách CÓ trong danh bạ tiệm",
        (await c.query(`select 1 from public.contacts where tenant_id=$1 and phone_e164='+84966554433'`,
          [tB.id])).rowCount === 1, "không thấy contact");
      const left = await c.query(`select * from public.held_leads_list()`);
      check("#226 — lead đã nhận biến khỏi danh sách chờ",
        left.rows.every((r) => r.id !== heldLeadId), `${left.rowCount} dòng còn chờ`);

      // Bấm lần hai KHÔNG nhận đôi (hai người duyệt cùng lúc).
      let twice = null;
      await c.query("savepoint sp_lead_twice");
      try { await c.query(`select public.held_lead_approve($1)`, [heldLeadId]); } catch (err) { twice = err; }
      await c.query("rollback to savepoint sp_lead_twice");
      check("#226 — duyệt lần hai bị chặn (already_decided)",
        !!twice && /already_decided/.test(twice.message), twice?.message ?? "không lỗi");

      // Cách ly tiệm: owner tiệm A KHÔNG thấy lead của tiệm B.
      await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
        const l = await c.query(`select * from public.held_leads_list()`);
        check("#226 — owner tiệm A không thấy lead chờ của tiệm B (cách ly tiệm)",
          l.rows.every((r) => r.phone !== "0966554433"), `${l.rowCount} dòng`);
      });

      // PII phải bị XOÁ khỏi hàng chờ sau khi đã hoá thân thành khách — giữ lại
      // là lưu trùng tên/SĐT ở hai nơi, nơi thứ hai không ai soát. Đo bằng quyền
      // hệ thống vì bảng này không cấp quyền đọc cho vai ứng dụng nào.
      await c.query(`select set_config('role','postgres', true)`);
      const { rows: [afterSys] } = await c.query(
        `select status, payload, contact_id from public.storefront_lead_holds where id = $1`,
        [heldLeadId]);
      check("#226 — sau khi nhận: status=approved · PII đã xoá · nối đúng contact vừa tạo",
        afterSys?.status === "approved"
          && Object.keys(afterSys.payload ?? {}).length === 0
          && afterSys.contact_id === ok.cid,
        JSON.stringify(afterSys));

      await c.query("rollback to savepoint sp_lead_hold");
      await c.query(`select set_config('role','postgres', true)`);
    }

    // ── #230 NGHỈ VIỆC LÀ MẤT QUYỀN (migration #280-281) ────────────────────
    // Trước bản này, ghi ngày nghỉ lên hồ sơ nhân sự KHÔNG đụng tư cách thành
    // viên: người đã nghỉ vẫn đăng nhập và vẫn đọc được khách của tiệm cũ. Đo
    // 21/08: 0 người đang dính, nhưng 89 hồ sơ đã nối tài khoản — con số 0 ấy
    // chỉ là "chưa ai nghỉ", không phải chốt chặn.
    //
    // Sáu ca, gồm cả hai chiều KHÔNG được phép xảy ra (đóng nhầm chủ tiệm,
    // đóng sớm khi ngày nghỉ còn ở tương lai) — một chốt cắt quyền mà chỉ kiểm
    // chiều "có cắt không" thì rất dễ thành cái cắt nhầm cả tiệm.
    {
      await c.query(`select set_config('role','postgres', true)`);
      await c.query("savepoint sp_nghi_viec");

      const { rows: [nv] } = await c.query(
        `select e.id, e.tenant_id, e.user_id from public.employees e
         join public.tenant_members m on m.tenant_id=e.tenant_id and m.user_id=e.user_id
         where e.user_id is not null and m.status='active' and m.role <> 'owner' limit 1`);
      if (nv) {
        await c.query(`update public.employees set ended_on = current_date - 1 where id=$1`, [nv.id]);
        const { rows: [sau] } = await c.query(
          `select status from public.tenant_members where tenant_id=$1 and user_id=$2`,
          [nv.tenant_id, nv.user_id]);
        check("#230 — ghi ngày nghỉ đã qua ⇒ tư cách bị khoá ngay",
          sau?.status === "removed", `thấy ${sau?.status}`);

        const { rows: [so] } = await c.query(
          `select action, diff from public.record_audit
           where entity_type='tenant_member' and entity_id=$1 order by at desc limit 1`, [nv.user_id]);
        check("#230 — sổ ghi đúng lý do và đúng AI làm (người ghi hồ sơ, không phải lượt quét đêm)",
          so?.action === "ended" && so?.diff?.ly_do === "nghi_viec"
            && so?.diff?.boi === "nguoi_ghi_ho_so",
          JSON.stringify(so?.diff));

        // Khoá tư cách phải cắt được quyền THẬT, không phải chỉ ẩn nút.
        await asUser(nv.user_id, { tenant_id: nv.tenant_id, role: "staff" }, async () => {
          const { rows: [kh] } = await c.query(`select count(*)::int n from public.contacts`);
          check("#230 — người đã bị khoá đọc được 0 khách (cắt quyền thật, không phải ẩn nút)",
            kh.n === 0, `thấy ${kh.n}`);
        });

        // Chiều ngược: xoá ngày nghỉ KHÔNG được tự mở lại quyền. Đóng nhầm thì
        // mời lại là xong; mở nhầm thì dữ liệu khách nằm trong tay người ngoài.
        await c.query(`update public.employees set ended_on = null where id=$1`, [nv.id]);
        const { rows: [vanKhoa] } = await c.query(
          `select status from public.tenant_members where tenant_id=$1 and user_id=$2`,
          [nv.tenant_id, nv.user_id]);
        check("#230 — xoá ngày nghỉ KHÔNG tự mở lại quyền (chỉ đóng tự động, mở phải có người)",
          vanKhoa?.status === "removed", `thấy ${vanKhoa?.status}`);
      }

      // Ngày nghỉ còn ở TƯƠNG LAI thì chưa được khoá — khoá sớm là đuổi người
      // đang còn làm việc.
      const { rows: [mai] } = await c.query(
        `select e.id, e.tenant_id, e.user_id from public.employees e
         join public.tenant_members m on m.tenant_id=e.tenant_id and m.user_id=e.user_id
         where e.user_id is not null and m.status='active' and m.role <> 'owner' limit 1`);
      if (mai) {
        await c.query(`update public.employees set ended_on = current_date + 30 where id=$1`, [mai.id]);
        const { rows: [conActive] } = await c.query(
          `select status from public.tenant_members where tenant_id=$1 and user_id=$2`,
          [mai.tenant_id, mai.user_id]);
        check("#230 — ngày nghỉ 30 ngày NỮA thì chưa khoá",
          conActive?.status === "active", `thấy ${conActive?.status}`);
      }

      // Chủ tiệm là người duy nhất mở khoá được. Khoá nhầm họ thì tiệm mất chủ
      // và không ai cứu được từ trong phần mềm.
      const { rows: [chu] } = await c.query(
        `select e.id, e.tenant_id, e.user_id from public.employees e
         join public.tenant_members m on m.tenant_id=e.tenant_id and m.user_id=e.user_id
         where m.role='owner' and m.status='active' and e.user_id is not null limit 1`);
      if (chu) {
        await c.query(`update public.employees set ended_on = current_date - 1 where id=$1`, [chu.id]);
        const { rows: [vanChu] } = await c.query(
          `select status from public.tenant_members where tenant_id=$1 and user_id=$2`,
          [chu.tenant_id, chu.user_id]);
        check("#230 — CHỦ TIỆM ghi ngày nghỉ vẫn KHÔNG bị khoá",
          vanChu?.status === "active", `thấy ${vanChu?.status}`);
      } else {
        check("#230 — CHỦ TIỆM ghi ngày nghỉ vẫn KHÔNG bị khoá", true,
          "bỏ qua: không chủ tiệm nào có hồ sơ nhân sự nối tài khoản");
      }

      await c.query("rollback to savepoint sp_nghi_viec");
      await c.query(`select set_config('role','postgres', true)`);
    }

    // ── #233 ĐƠN PHẢI BẮT ĐẦU TỪ NHÁP (migration #282) ──────────────────────
    // Hoa hồng, trừ kho và điểm tích luỹ đều gắn vào lệnh ĐỔI trạng thái. Một
    // đơn tạo THẲNG ở trạng thái hoàn tất bỏ qua cả ba mà vẫn vào doanh thu —
    // đo được trên dữ liệu thật 21/08: chèn lọt, và 0 dòng hoa hồng.
    //
    // Ca thứ hai (đường cũ vẫn thông) quan trọng ngang ca thứ nhất: một chốt
    // chặn mới mà chặn nhầm luồng tạo đơn hằng ngày thì tai hại hơn cái lỗ nó
    // vá.
    {
      await c.query(`select set_config('role','postgres', true)`);
      await c.query("savepoint sp_don_nhap");

      const { rows: [ct2] } = await c.query(
        `select id from public.contacts where tenant_id=$1 and deleted_at is null limit 1`, [tA.id]);
      const { rows: [ow2] } = await c.query(
        `select user_id from public.tenant_members where tenant_id=$1 and role='owner' limit 1`, [tA.id]);

      let chan = 0;
      for (const st of ["completed", "confirmed", "cancelled"]) {
        await c.query("savepoint sp_don_st");
        try {
          await c.query(
            `insert into public.orders (tenant_id, contact_id, status, kind, created_by)
             values ($1,$2,$3,'order',$4)`, [tA.id, ct2.id, st, ow2.user_id]);
        } catch { chan += 1; }
        await c.query("rollback to savepoint sp_don_st");
      }
      check("#233 — tạo đơn THẲNG ở hoàn tất/xác nhận/đã huỷ đều bị chặn (cả ba)",
        chan === 3, `chặn ${chan}/3`);

      const { rows: [donMoi] } = await c.query(
        `insert into public.orders (tenant_id, contact_id, kind, created_by)
         values ($1,$2,'order',$3) returning id, status`, [tA.id, ct2.id, ow2.user_id]);
      await c.query(`update public.orders set status='confirmed' where id=$1`, [donMoi.id]);
      const { rows: [sauDoi] } = await c.query(
        `select status from public.orders where id=$1`, [donMoi.id]);
      check("#233 — ĐƯỜNG CŨ VẪN THÔNG: tạo nháp rồi đổi trạng thái chạy bình thường",
        donMoi.status === "draft" && sauDoi.status === "confirmed",
        `tạo=${donMoi.status} · sau đổi=${sauDoi.status}`);

      await c.query("rollback to savepoint sp_don_nhap");
      await c.query(`select set_config('role','postgres', true)`);
    }

    // ── #234 TIỆM TRẢ TIỀN GÓI CƯỚC (migration #286) ────────────────────────
    // Đường tiền đã có đủ từ #27 nhưng KHÔNG cửa nào gọi nó — hoá đơn treo mãi
    // và phải có người của iFan vào tận cơ sở dữ liệu gọi hàm bằng tay.
    //
    // Bốn ca, trong đó ba ca là những chuyện KHÔNG ĐƯỢC PHÉP xảy ra: sai khoá
    // mà vẫn ghi · trả thiếu mà vẫn nâng gói · trả lại lần hai mà cộng đôi.
    // Một cổng tiền chỉ kiểm "đường thuận" là cổng chưa được kiểm.
    {
      await c.query(`select set_config('role','postgres', true)`);
      await c.query("savepoint sp_goi_cuoc");

      await c.query(
        `insert into private.app_config (key, value) values ('sepay_platform_ingest_key', $1)
         on conflict (key) do update set value = excluded.value`, ["KHOA_KIEM_THU"]);

      let saiKhoa = null;
      await c.query("savepoint sp_sai_khoa");
      try {
        await c.query(`select public.platform_sepay_ingest('SAI_KHOA', '{}'::jsonb)`);
      } catch (err) { saiKhoa = err; }
      await c.query("rollback to savepoint sp_sai_khoa");
      check("#234 — sai khoá nền tảng bị chặn (không có nhánh cho-qua)",
        !!saiKhoa && /invalid_key/.test(saiKhoa.message), saiKhoa?.message ?? "không lỗi");

      // Hoá đơn THẬT, đi đúng đường chủ tiệm vẫn bấm.
      const { rows: [chuA] } = await c.query(
        `select user_id from public.tenant_members
          where tenant_id=$1 and role='owner' and status='active' limit 1`, [tA.id]);
      // ⚠️ KHÔNG dùng `asUser()` ở đây: nó bọc trong một savepoint và HUỶ mọi
      // thứ khi thoát, nên hoá đơn vừa tạo sẽ biến mất trước khi ca kiểm kịp
      // dùng. Đã dính đúng bẫy này một lần ở khối #226 — đặt danh tính bằng
      // tay để hoá đơn sống tới cuối khối.
      await c.query(
        `select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)`,
        [JSON.stringify({ sub: chuA.user_id, role: "authenticated",
                          app_metadata: { tenant_id: tA.id, role: "owner" } })]);
      const { rows: [doiGoi] } = await c.query(`select public.change_plan('pro','month') k`);
      await c.query(
        `select set_config('request.jwt.claims', NULL, true), set_config('role','postgres', true)`);
      const soHD = doiGoi.k?.invoice ?? null;
      const phaiTra = Number(doiGoi.k?.amount_due ?? 0);

      if (soHD && phaiTra > 0) {
        const { rows: [thieu] } = await c.query(
          `select public.platform_sepay_ingest('KHOA_KIEM_THU', $1::jsonb) k`,
          [JSON.stringify({ id: "kt-thieu", transferType: "in",
                            transferAmount: phaiTra - 1000, content: "ck " + soHD })]);
        check("#234 — trả THIẾU thì KHÔNG nâng gói, và nói ra là thiếu",
          thieu.k?.status === "underpaid", JSON.stringify(thieu.k));

        const { rows: [du] } = await c.query(
          `select public.platform_sepay_ingest('KHOA_KIEM_THU', $1::jsonb) k`,
          [JSON.stringify({ id: "kt-du", transferType: "in",
                            transferAmount: phaiTra, content: "thanh toan " + soHD.replace(/-/g, "") })]);
        const { rows: [hd] } = await c.query(
          `select status from public.subscription_invoices where number = $1`, [soHD]);
        check("#234 — trả ĐỦ ⇒ hoá đơn thành đã trả và gói đổi thật (số hoá đơn viết liền vẫn bóc được)",
          du.k?.status === "applied" && hd?.status === "paid",
          `${du.k?.status} · hoá đơn ${hd?.status}`);

        const { rows: [lan2] } = await c.query(
          `select public.platform_sepay_ingest('KHOA_KIEM_THU', $1::jsonb) k`,
          [JSON.stringify({ id: "kt-lan2", transferType: "in",
                            transferAmount: phaiTra, content: "ck lai " + soHD })]);
        check("#234 — chuyển lại lần hai KHÔNG cộng đôi (đã trả rồi thì thôi)",
          lan2.k?.status === "already_paid", JSON.stringify(lan2.k));
      } else {
        check("#234 — trả THIẾU thì KHÔNG nâng gói, và nói ra là thiếu", true,
          "bỏ qua: tiệm A đang ở gói này rồi nên không sinh hoá đơn");
        check("#234 — trả ĐỦ ⇒ hoá đơn thành đã trả và gói đổi thật (số hoá đơn viết liền vẫn bóc được)",
          true, "bỏ qua: không có hoá đơn để thử");
        check("#234 — chuyển lại lần hai KHÔNG cộng đôi (đã trả rồi thì thôi)", true,
          "bỏ qua: không có hoá đơn để thử");
      }

      await c.query("rollback to savepoint sp_goi_cuoc");
      await c.query(`select set_config('role','postgres', true)`);
    }

    // ── #227 KHÁCH ĐÒI XOÁ DỮ LIỆU CÁ NHÂN (migration #287-288) ─────────────
    // Nguyên tắc thẻ design đặt tên: XOÁ NGƯỜI, GIỮ SỐ. Ca quan trọng nhất
    // không phải "có xoá được không" mà là "có GIỮ được không" — xoá luôn đơn
    // hàng là sổ sách thủng lỗ và doanh thu năm ngoái tự giảm.
    {
      await c.query(`select set_config('role','postgres', true)`);
      await c.query("savepoint sp_xoa_pdpl");

      // Dựng một khách thử NGAY TRONG giao dịch này thay vì đi tìm khách có
      // sẵn: bộ kiểm phải chạy được trên bất kỳ dữ liệu nào, và lần trước đúng
      // là nó ĐÃ im lặng bỏ qua cả khối vì tiệm kiểm không có khách nào kèm
      // hội thoại. Sáu ca không chạy mà cổng vẫn xanh là kiểu hỏng tệ nhất.
      const { rows: [chuPdpl] } = await c.query(
        `select user_id from public.tenant_members
          where tenant_id=$1 and role='owner' and status='active' limit 1`, [tA.id]);
      const { rows: [khach] } = await c.query(
        `insert into public.contacts (tenant_id, full_name, phone, email)
         values ($1, 'Khách kiểm thử xoá', '0900000287', 'kiemthu287@example.com')
         returning id`, [tA.id]);
      const { rows: [hoiThoai] } = await c.query(
        `insert into public.conversations (tenant_id, channel_id, contact_id, external_user_id)
         select $1, ch.id, $2, 'kt-287' from public.channels ch
          where ch.tenant_id = $1 limit 1
         returning id`, [tA.id, khach.id]);
      if (hoiThoai) {
        await c.query(
          `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
           values ($1,$2,'in','user','nội dung riêng tư cần xoá', now())`, [tA.id, hoiThoai.id]);
      }
      const { rows: [donKt] } = await c.query(
        `insert into public.orders (tenant_id, contact_id, kind, created_by)
         values ($1,$2,'order',$3) returning id`, [tA.id, khach.id, chuPdpl.user_id]);
      // Đơn phải CÓ HÀNG rồi mới thu được tiền — chốt `payment_exceeds_order_total`
      // chặn đúng ở đây, và nó chặn đúng: thu tiền vào một đơn tổng 0đ là ghi
      // khống. Thêm một dòng hàng thật để ca kiểm đi qua đường người dùng đi.
      const { rows: [mon] } = await c.query(
        `select id from public.items where tenant_id=$1 limit 1`, [tA.id]);
      if (mon) {
        await c.query(
          `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,123000)`, [tA.id, donKt.id, mon.id]);
        await c.query(
          `insert into public.order_payments (tenant_id, order_id, method, amount_vnd)
           values ($1,$2,'cash',123000)`, [tA.id, donKt.id]);
      }

      if (khach && chuPdpl) {
        const { rows: [truoc] } = await c.query(
          `select (select count(*)::int from public.orders where contact_id=$1) don,
                  (select coalesce(sum(op.amount_vnd),0)::bigint from public.order_payments op
                     join public.orders od on od.id=op.order_id where od.contact_id=$1) tien`,
          [khach.id]);

        // Vai staff KHÔNG được mở một đường xoá không hoàn tác.
        const { rows: [nvPdpl] } = await c.query(
          `select user_id from public.tenant_members
            where tenant_id=$1 and role='staff' and status='active' limit 1`, [tA.id]);
        if (nvPdpl) {
          let chan = null;
          await asUser(nvPdpl.user_id, { tenant_id: tA.id, role: "staff" }, async () => {
            try { await c.query(`select public.erasure_request_create($1)`, [khach.id]); }
            catch (err) { chan = err; }
          });
          check("#227 — vai nhân viên KHÔNG mở được yêu cầu xoá (đường không hoàn tác)",
            !!chan && /forbidden/.test(chan.message), chan?.message ?? "không lỗi");
        }

        // Đặt danh tính bằng tay: `asUser` rollback khi thoát, mà yêu cầu phải
        // sống tới bước thi hành (cùng bẫy đã dính ở #226 và #234).
        await c.query(
          `select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)`,
          [JSON.stringify({ sub: chuPdpl.user_id, role: "authenticated",
                            app_metadata: { tenant_id: tA.id, role: "owner" } })]);
        const { rows: [ycPdpl] } = await c.query(
          `select public.erasure_request_create($1, 'kiểm thử') id`, [khach.id]);

        let trung = null;
        await c.query("savepoint sp_pdpl_trung");
        try { await c.query(`select public.erasure_request_create($1)`, [khach.id]); }
        catch (err) { trung = err; }
        await c.query("rollback to savepoint sp_pdpl_trung");
        check("#227 — một khách chỉ có MỘT yêu cầu đang chờ (hai người cùng bấm thi hành là hỏng)",
          !!trung, trung?.message ?? "không lỗi");

        const { rows: [ketQua] } = await c.query(
          `select public.erasure_request_apply($1) k`, [ycPdpl.id]);
        await c.query(
          `select set_config('request.jwt.claims', NULL, true), set_config('role','postgres', true)`);

        const { rows: [sau] } = await c.query(
          `select (select count(*)::int from public.messages m
                     join public.conversations cv on cv.id = m.conversation_id
                    where cv.contact_id=$1 and coalesce(m.content,'') <> '') tin,
                  (select count(*)::int from public.orders where contact_id=$1) don,
                  (select coalesce(sum(op.amount_vnd),0)::bigint from public.order_payments op
                     join public.orders od on od.id=op.order_id where od.contact_id=$1) tien,
                  (select full_name from public.contacts where id=$1) ten,
                  (select phone from public.contacts where id=$1) sdt,
                  (select marketing_consent from public.contacts where id=$1) nhan_tin`,
          [khach.id]);

        check("#227 — XOÁ NGƯỜI: hết nội dung hội thoại, hết tên thật, hết số điện thoại",
          sau.tin === 0 && /^Khách đã xoá #/.test(sau.ten ?? "") && sau.sdt === null,
          `${sau.tin} tin còn nội dung · tên "${sau.ten}" · sđt ${sau.sdt}`);

        check("#227 — GIỮ SỐ: đơn hàng và tiền đã thu KHÔNG suy suyển (sổ sách không thủng lỗ)",
          Number(sau.don) === Number(truoc.don) && String(sau.tien) === String(truoc.tien),
          `đơn ${truoc.don}→${sau.don} · tiền ${truoc.tien}→${sau.tien}`);

        check("#227 — xoá rồi thì tắt luôn đồng ý nhận tin (gửi tiếp là vi phạm lần hai)",
          sau.nhan_tin === "withdrawn", `thấy ${sau.nhan_tin}`);

        check("#227 — tóm tắt lưu lại nói được CẢ HAI vế (xoá gì · giữ gì), không chứa thông tin cá nhân",
          Number(ketQua.k?.giu_don_hang) === Number(truoc.don)
            && typeof ketQua.k?.xoa_tin_nhan === "number",
          JSON.stringify(ketQua.k));
      }

      await c.query("rollback to savepoint sp_xoa_pdpl");
      await c.query(`select set_config('role','postgres', true)`);
    }

    // storefront_save_hours (migration #81): thay CẢ TUẦN một lần, phải NGUYÊN TỬ
    // — hàng sai ở lần lưu sau KHÔNG được phép xoá mất bộ giờ hợp lệ đang có.
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      await c.query(`select public.storefront_save_hours($1::jsonb)`, [
        JSON.stringify([
          { weekday: 1, is_closed: false, open_time: "08:00", close_time: "12:00" },
          { weekday: 2, is_closed: true },
        ]),
      ]);
      const { rows } = await c.query(
        `select weekday from public.business_hours where tenant_id=$1 order by weekday`, [tB.id]);
      check("storefront_save_hours — lưu hợp lệ ra đúng số dòng", rows.length === 2, `thấy ${rows.length}`);

      let badErr = null;
      await c.query("savepoint sp_hours_bad");
      try {
        await c.query(`select public.storefront_save_hours($1::jsonb)`, [
          JSON.stringify([{ weekday: 9, is_closed: false, open_time: "08:00", close_time: "12:00" }]),
        ]);
      } catch (err) { badErr = err; }
      await c.query("rollback to savepoint sp_hours_bad");
      check("storefront_save_hours — hàng weekday=9 sai bị chặn", !!badErr, badErr?.message ?? "không lỗi");

      const { rows: after } = await c.query(
        `select weekday from public.business_hours where tenant_id=$1 order by weekday`, [tB.id]);
      check("storefront_save_hours — NGUYÊN TỬ: giờ cũ còn nguyên sau lần lưu lỗi", after.length === 2, `thấy ${after.length}`);
    });

    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'viewer') on conflict do nothing`,
      [tB.id, uC]);
    let viewerErr = null;
    try {
      await asUser(uC, { tenant_id: tB.id, role: "viewer" }, async () => {
        await c.query(`select public.storefront_save_hours('[]'::jsonb)`);
      });
    } catch (err) { viewerErr = err; }
    check("storefront_save_hours — vai viewer bị chặn (forbidden)",
      !!viewerErr && /forbidden/.test(viewerErr.message), viewerErr?.message ?? "không lỗi");
  }

  console.log("[rls-smoke] Xoá tiệm không bị nhật ký bản ghi chặn (migration #82):");
  {
    // Lỗi gốc: xoá tenant -> cascade xoá contacts -> contacts_audit_trigger ghi
    // record_audit với tenant_id của tiệm VỪA biến mất -> vi phạm khoá ngoại
    // record_audit_tenant_id_fkey, cả lệnh xoá tiệm thất bại.
    const { rows: [tD] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke Del', $1, true) returning id`,
      [`smoke-del-${stamp}`]);
    await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1, 'Khách Xoá Tiệm')`, [tD.id]);

    let delErr = null, delRows = -1;
    await c.query("savepoint sp_tenant_del");
    try {
      const r = await c.query(`delete from public.tenants where id = $1`, [tD.id]);
      delRows = r.rowCount;
    } catch (err) {
      delErr = err;
      // raise/lỗi trong Postgres đầu độc CẢ transaction — không rollback thì mọi
      // lệnh sau đều "current transaction is aborted".
      await c.query("rollback to savepoint sp_tenant_del");
    }
    check("Xoá tiệm ĐANG CÓ khách thành công (rowCount 1)", !delErr && delRows === 1,
      delErr?.message ?? `rowCount=${delRows}`);
    const leftContacts = await c.query(
      `select count(*)::int as n from public.contacts where tenant_id = $1`, [tD.id]);
    check("Xoá tiệm rồi thì không còn khách nào của tiệm đó", leftContacts.rows[0].n === 0,
      `còn ${leftContacts.rows[0].n} khách`);
    const leftAudit = await c.query(
      `select count(*)::int as n from public.record_audit where tenant_id = $1`, [tD.id]);
    check("Xoá tiệm rồi thì nhật ký của tiệm đó cũng sạch (nhật ký chết theo tiệm)",
      leftAudit.rows[0].n === 0, `còn ${leftAudit.rows[0].n} dòng nhật ký`);

    // Đối chứng — KHÔNG được vô tình tắt mất nhật ký: xoá 1 khách bình thường
    // khi tiệm CÒN SỐNG thì vẫn phải sinh dòng record_audit action='deleted'.
    await c.query("savepoint sp_normal_del");
    const { rows: [cN] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1, 'Khách Xoá Thường') returning id`,
      [tB.id]);
    await c.query(`delete from public.contacts where id = $1`, [cN.id]);
    const normalAudit = await c.query(
      `select count(*)::int as n from public.record_audit
        where tenant_id = $1 and entity_type = 'contact' and entity_id = $2 and action = 'deleted'`,
      [tB.id, cN.id]);
    check("Đối chứng — xoá khách khi tiệm CÒN SỐNG vẫn ghi nhật ký 'deleted'",
      normalAudit.rows[0].n === 1, `thấy ${normalAudit.rows[0].n} dòng`);
    await c.query("rollback to savepoint sp_normal_del");
  }

  console.log("[rls-smoke] V2 Lịch hẹn — nền (ADR-0009 mục 8, migration #83):");
  {
    // ---- Seed bằng quyền postgres (như backend thật) ----
    // Dùng LẠI uS1/uS2 (2 thợ vai 'staff' của tiệm A đã tạo ở khối "phạm vi
    // nhân viên thường") — không tạo thêm tài khoản để khỏi đụng trần ghế.
    const { rows: [ctA] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách Lịch A') returning id`, [tA.id]);
    const { rows: [ctB] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách Lịch B') returning id`, [tB.id]);
    // ADR-0019 mục 3 (migration #125): services → items, thêm cột kind bắt buộc.
    const { rows: [svcA] } = await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd)
         values ($1,'service','Gội đầu',45,150000) returning id`, [tA.id]);
    const { rows: [resA] } = await c.query(
      `insert into public.resources (tenant_id, name, kind) values ($1,'Giường 1','bed') returning id`, [tA.id]);
    const { rows: [resA2] } = await c.query(
      `insert into public.resources (tenant_id, name, kind) values ($1,'Giường 2','bed') returning id`, [tA.id]);

    // Mốc thời gian TUYỆT ĐỐI (UTC) cho phần chống trùng — chống trùng không
    // phụ thuộc múi giờ; phần giờ mở cửa (ca 6) mới dùng giờ địa phương tiệm.
    const day = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
    const T = (h, m = 0) =>
      `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+00`;

    async function book(o) {
      const { rows: [r] } = await c.query(
        `insert into public.appointments
           (tenant_id, contact_id, staff_user_id, resource_id, item_id,
            start_at, end_at, status, price_vnd, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,coalesce($8,'booked'),150000,$9) returning id`,
        [o.tenant ?? tA.id, o.contact ?? ctA.id, o.staff, o.resource ?? null,
         o.service ?? svcA.id, o.start, o.end, o.status ?? null, uA]);
      return r.id;
    }
    // Thử đặt: trả {id} nếu CSDL nhận, {err} nếu CSDL từ chối — và luôn dọn
    // sạch nhánh thử (savepoint) để ca sau không bị dữ liệu thừa làm nhiễu.
    async function tryBook(o, keep = false) {
      await c.query("savepoint sp_book");
      try {
        const id = await book(o);
        if (!keep) await c.query("rollback to savepoint sp_book");
        return { id };
      } catch (err) {
        await c.query("rollback to savepoint sp_book");
        return { err };
      }
    }

    // ---- Ca 1: hai lịch trùng giờ CÙNG THỢ ----
    await book({ staff: uS1, start: T(10), end: T(11) });
    const ov1 = await tryBook({ staff: uS1, start: T(10, 30), end: T(11, 30) });
    check("Ca 1 — trùng giờ CÙNG THỢ bị CSDL từ chối (23P01), không phải giao diện chặn",
      !!ov1.err && ov1.err.code === "23P01",
      ov1.err ? `mã lỗi ${ov1.err.code}` : "insert THÀNH CÔNG — chống trùng thủng");
    // Đối chứng khoảng nửa mở '[)': xếp sát lưng nhau KHÔNG phải là trùng.
    const back2back = await tryBook({ staff: uS1, start: T(11), end: T(12) }, true);
    check("Ca 1b — ca sát lưng 11:00–12:00 ngay sau 10:00–11:00 vẫn đặt được",
      !!back2back.id, back2back.err?.message ?? "");

    // ---- Ca 2: hai lịch trùng giờ CÙNG TÀI NGUYÊN ----
    await book({ staff: uS1, resource: resA.id, start: T(14), end: T(15) });
    const ov2 = await tryBook({ staff: uS2, resource: resA.id, start: T(14, 30), end: T(15, 30) });
    check("Ca 2 — trùng giờ CÙNG TÀI NGUYÊN (khác thợ) bị CSDL từ chối",
      !!ov2.err && ov2.err.code === "23P01",
      ov2.err ? `mã lỗi ${ov2.err.code}` : "insert THÀNH CÔNG — chống trùng thủng");
    const ov2b = await tryBook({ staff: uS2, resource: resA2.id, start: T(14, 30), end: T(15, 30) }, true);
    check("Ca 2b — đối chứng: cùng giờ nhưng KHÁC giường, khác thợ → cho qua",
      !!ov2b.id, ov2b.err?.message ?? "");
    // Ca không chiếm tài nguyên (resource_id NULL) không được chặn lẫn nhau.
    await book({ staff: uS1, start: T(20), end: T(21) });
    const ov2c = await tryBook({ staff: uS2, start: T(20), end: T(21) }, true);
    check("Ca 2c — hai ca KHÔNG gắn tài nguyên, khác thợ, trùng giờ → cho qua",
      !!ov2c.id, ov2c.err?.message ?? "");

    // ---- Ca 3: huỷ / không đến / xoá mềm PHẢI NHẢ CHỖ ----
    const a3 = await book({ staff: uS1, start: T(16), end: T(17) });
    await c.query(
      `update public.appointments set status='cancelled', cancel_reason='Khách bận' where id=$1`, [a3]);
    const re3 = await tryBook({ staff: uS1, start: T(16), end: T(17) }, true);
    check("Ca 3 — lịch đã 'cancelled' KHÔNG chặn lịch mới vào đúng khung giờ đó",
      !!re3.id, re3.err?.message ?? "");
    const a4 = await book({ staff: uS2, start: T(18), end: T(19) });
    await c.query(`update public.appointments set status='no_show' where id=$1`, [a4]);
    const re4 = await tryBook({ staff: uS2, start: T(18), end: T(19) }, true);
    check("Ca 3b — lịch đã 'no_show' KHÔNG chặn lịch mới vào đúng khung giờ đó",
      !!re4.id, re4.err?.message ?? "");
    const a5 = await book({ staff: uS2, resource: resA.id, start: T(21), end: T(22) });
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a5]);
    const re5 = await tryBook({ staff: uS2, resource: resA.id, start: T(21), end: T(22) }, true);
    check("Ca 3c — lịch đã xoá mềm cũng nhả chỗ (cả thợ lẫn giường)",
      !!re5.id, re5.err?.message ?? "");

    // ---- Ca 4: cách ly tiệm ----
    const { rows: [apB] } = await c.query(
      `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at)
         values ($1,$2,$3,$4,$5) returning id`, [tB.id, ctB.id, uB, T(10), T(11)]);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const sel = await c.query(`select id from public.appointments where tenant_id=$1`, [tB.id]);
      check("Ca 4 — tiệm A đọc lịch tiệm B = 0 dòng", sel.rowCount === 0, JSON.stringify(sel.rows));
      const upd = await c.query(`update public.appointments set note='hacked' where id=$1`, [apB.id]);
      check("Ca 4b — tiệm A sửa lịch tiệm B = 0 dòng", upd.rowCount === 0);
    });

    // ---- Ca 5: staff chỉ đụng được ca của chính mình (Pattern B) ----
    await asUser(uS1, { tenant_id: tA.id, role: "staff" }, async () => {
      const own = await c.query(
        `select id from public.appointments where tenant_id=$1 and staff_user_id=$2`, [tA.id, uS1]);
      check("Ca 5 — staff ĐỌC được lịch của chính mình", own.rowCount > 0, `thấy ${own.rowCount}`);
      const other = await c.query(
        `select id from public.appointments where tenant_id=$1 and staff_user_id=$2`, [tA.id, uS2]);
      check("Ca 5b — staff KHÔNG đọc được lịch của thợ khác = 0 dòng", other.rowCount === 0,
        `thấy ${other.rowCount}`);
      const updOther = await c.query(
        `update public.appointments set note='sua trom' where tenant_id=$1 and staff_user_id=$2`,
        [tA.id, uS2]);
      check("Ca 5c — staff sửa lịch KHÔNG phải của mình = 0 dòng (bị chặn)",
        updOther.rowCount === 0, `sửa được ${updOther.rowCount} dòng`);
      const updOwn = await c.query(
        `update public.appointments set note='ghi chu cua toi' where tenant_id=$1 and staff_user_id=$2`,
        [tA.id, uS1]);
      check("Ca 5d — đối chứng: staff sửa được lịch của CHÍNH MÌNH", updOwn.rowCount > 0);
    });
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const upd = await c.query(
        `update public.appointments set note='chu tiem sua' where tenant_id=$1 and staff_user_id=$2`,
        [tA.id, uS2]);
      check("Ca 5e — đối chứng: chủ tiệm sửa được lịch của mọi thợ", upd.rowCount > 0);
    });

    // ---- Ca 6: ngoài giờ mở cửa / ngày nghỉ phải CẢNH BÁO RÕ ----
    // Giờ tiệm lưu kiểu `time` không offset ⇒ phải quy về GIỜ ĐỊA PHƯƠNG tiệm
    // (tenants.timezone, mặc định Asia/Ho_Chi_Minh) rồi mới so — bài học 12/08
    // của scripts/storefront-hours-smoke.mjs (bộ ca chạy giờ quốc tế xanh giả).
    const vnDay = (off) => {
      const vn = new Date(Date.now() + off * 86400e3 + 7 * 3600e3);
      return { iso: vn.toISOString().slice(0, 10), dow: vn.getUTCDay() };
    };
    let offW = 1; while ([0, 6].includes(vnDay(offW).dow)) offW++;   // ngày trong tuần
    let offE = 1; while (![0, 6].includes(vnDay(offE).dow)) offE++;  // cuối tuần
    const wd = vnDay(offW), we = vnDay(offE);
    const LT = (iso, h, m = 0) =>
      `${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`;

    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const w0 = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 9), LT(wd.iso, 10)]);
      check("Ca 6 — tiệm CHƯA khai giờ mở cửa → cờ 'hours_not_set', không dựng cảnh báo giả",
        w0.rows[0].v.ok === true && w0.rows[0].v.reason === "hours_not_set",
        JSON.stringify(w0.rows[0].v));
    });

    // T2–T6 mở 08:00–12:00 và 13:00–18:00 (nghỉ trưa — NHIỀU dòng/thứ); T7/CN nghỉ.
    for (let w = 1; w <= 5; w++) {
      await c.query(
        `insert into public.business_hours (tenant_id, weekday, open_time, close_time)
           values ($1,$2,'08:00','12:00'),($1,$2,'13:00','18:00')`, [tA.id, w]);
    }
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const inH = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 9), LT(wd.iso, 10)]);
      check("Ca 6b — đặt TRONG giờ mở cửa → không cảnh báo", inH.rows[0].v.ok === true,
        JSON.stringify(inH.rows[0].v));
      const outH = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 19), LT(wd.iso, 20)]);
      check("Ca 6c — đặt NGOÀI giờ mở cửa → cảnh báo rõ 'outside_hours'",
        outH.rows[0].v.ok === false && outH.rows[0].v.reason === "outside_hours",
        JSON.stringify(outH.rows[0].v));
      const lunch = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 12, 15), LT(wd.iso, 12, 45)]);
      check("Ca 6d — đặt rơi vào giờ nghỉ trưa → cảnh báo rõ (nhiều khung/thứ)",
        lunch.rows[0].v.ok === false && lunch.rows[0].v.reason === "outside_hours",
        JSON.stringify(lunch.rows[0].v));
      const closedDay = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(we.iso, 9), LT(we.iso, 10)]);
      check("Ca 6e — đặt vào NGÀY tiệm nghỉ theo thứ → cảnh báo rõ 'day_closed'",
        closedDay.rows[0].v.ok === false && closedDay.rows[0].v.reason === "day_closed",
        JSON.stringify(closedDay.rows[0].v));
      const midnight = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 23, 30), LT(vnDay(offW + 1).iso, 0, 30)]);
      check("Ca 6f — ca vắt qua nửa đêm → nói thẳng 'crosses_midnight', không trả bừa",
        midnight.rows[0].v.ok === false && midnight.rows[0].v.reason === "crosses_midnight",
        JSON.stringify(midnight.rows[0].v));
    });
    // Ngày nghỉ đột xuất ĐÈ lên giờ lặp theo thứ.
    await c.query(
      `insert into public.business_closures (tenant_id, date_from, date_to, reason)
         values ($1,$2,$2,'Nghỉ Tết')`, [tA.id, wd.iso]);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const cl = await c.query(`select public.appointment_hours_warning($1,$2) as v`,
        [LT(wd.iso, 9), LT(wd.iso, 10)]);
      check("Ca 6g — đặt trúng NGÀY NGHỈ đột xuất → cảnh báo rõ kèm lý do nghỉ",
        cl.rows[0].v.ok === false && cl.rows[0].v.reason === "closure"
          && cl.rows[0].v.closure_reason === "Nghỉ Tết", JSON.stringify(cl.rows[0].v));
    });

    // ---- Ca 7: xoá mềm → Thùng rác 30 ngày (bất biến 11), không xoá cứng ----
    const a7 = await book({ staff: uS1, start: T(6), end: T(7) });
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a7]);
    const still = await c.query(`select id from public.appointments where id=$1`, [a7]);
    check("Ca 7 — xoá mềm: hàng VẪN CÒN trong bảng (không xoá cứng)", still.rowCount === 1);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      const tl = await c.query(`select entity_type, entity_id from public.trash_list(200)`);
      check("Ca 7b — lịch xoá mềm hiện trong Thùng rác dùng chung",
        tl.rows.some((r) => r.entity_type === "appointment" && r.entity_id === a7),
        JSON.stringify(tl.rows.map((r) => r.entity_type)));
      await c.query(`select public.trash_restore('appointment', $1)`, [a7]);
      const back = await c.query(`select deleted_at from public.appointments where id=$1`, [a7]);
      check("Ca 7c — trash_restore đưa lịch ra khỏi Thùng rác",
        back.rowCount === 1 && back.rows[0].deleted_at === null, JSON.stringify(back.rows));
    });
    const a8 = await book({ staff: uS2, start: T(6), end: T(7) });
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a8]);
    await c.query(`update public.appointments set deleted_at = now() - interval '31 days' where id=$1`, [a7]);
    await c.query(`select public.trash_purge_expired()`);
    const gone = await c.query(`select id from public.appointments where id=$1`, [a7]);
    check("Ca 7d — job đêm dọn THẬT lịch đã nằm thùng rác quá 30 ngày", gone.rowCount === 0);
    const kept = await c.query(`select id from public.appointments where id=$1`, [a8]);
    check("Ca 7e — đối chứng: lịch vừa xoá mềm CÒN NGUYÊN trong 30 ngày", kept.rowCount === 1);

    // ---- Sự kiện appointment.* (bất biến 12 + luật D1) ----
    const a9 = await book({ staff: uS1, start: T(3), end: T(4) });
    const evTypes = async (id) => (await c.query(
      `select event_type from public.domain_events
        where aggregate_type='appointment' and aggregate_id=$1`, [id]))
      .rows.map((r) => r.event_type).sort();
    check("Sự kiện — tạo lịch phát ĐÚNG 1 event 'appointment.booked'",
      JSON.stringify(await evTypes(a9)) === JSON.stringify(["appointment.booked"]),
      JSON.stringify(await evTypes(a9)));
    await c.query(`update public.appointments set status='arrived' where id=$1`, [a9]);
    await c.query(`update public.appointments set status='done' where id=$1`, [a9]);
    check("Sự kiện — đổi trạng thái arrived/done phát đúng 2 event, không phát gộp",
      JSON.stringify(await evTypes(a9)) ===
        JSON.stringify(["appointment.arrived", "appointment.booked", "appointment.done"]),
      JSON.stringify(await evTypes(a9)));
    await c.query(`update public.appointments set deleted_at = now() where id=$1`, [a9]);
    check("Sự kiện — xoá mềm KHÔNG phát event (đúng quy ước sẵn có của kho)",
      (await evTypes(a9)).length === 3, JSON.stringify(await evTypes(a9)));
    const a10 = await book({ staff: uS1, start: T(4), end: T(5) });
    await c.query(
      `update public.appointments set status='cancelled', cancel_reason='Khách bận' where id=$1`, [a10]);
    const evC = await c.query(
      `select payload from public.domain_events
        where aggregate_type='appointment' and aggregate_id=$1 and event_type='appointment.cancelled'`,
      [a10]);
    check("Sự kiện — huỷ phát 'appointment.cancelled' kèm lý do huỷ",
      evC.rowCount === 1 && evC.rows[0].payload.cancel_reason === "Khách bận",
      JSON.stringify(evC.rows.map((r) => r.payload)));

    // ---- Seed dịch vụ mẫu theo pack ngành ----
    // is_sample=false TRƯỚC khi apply_industry_pack('spa') đặt industry — partial
    // unique index tenants_one_sample_per_industry (migration #64) chỉ cho MỘT
    // tiệm is_sample=true mỗi ngành, tiệm demo-spa-huong-sen thật đã chiếm 'spa'
    // rồi (task #149, bắt được khi chạy thật lúc nghiệm thu V3). tA đã qua hết
    // các ca cần is_sample=true (đếm hạn mức tiệm) ở TRÊN rồi nên đổi ở đây an toàn.
    await c.query(`update public.tenants set is_sample=false where id=$1`, [tA.id]);
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      await c.query(`select public.apply_industry_pack('spa')`);
      const s = await c.query(
        `select name, duration_minutes, price_vnd from public.items where tenant_id=$1 and kind='service'`, [tA.id]);
      check("Seed — apply_industry_pack('spa') seed dịch vụ mẫu vào items (kind='service')",
        s.rows.some((r) => r.name === "Massage trị liệu" && r.duration_minutes === 90),
        JSON.stringify(s.rows.map((r) => r.name)));
    });
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      await c.query(`select public.apply_industry_pack('shop')`);
      const s = await c.query(`select name from public.items where tenant_id=$1 and kind='service'`, [tB.id]);
      check("Seed — pack 'shop' CỐ Ý không có dịch vụ mẫu (không có module booking)",
        s.rowCount === 0, JSON.stringify(s.rows.map((r) => r.name)));
    });

    // ---- RLS items(kind=service)/resources: mọi thành viên ĐỌC, owner/admin/manager GHI ----
    await asUser(uS1, { tenant_id: tA.id, role: "staff" }, async () => {
      const r = await c.query(`select id from public.items where tenant_id=$1 and kind='service'`, [tA.id]);
      check("items(kind=service) — mọi thành viên (kể cả staff) ĐỌC được bảng dịch vụ", r.rowCount > 0);
      let svcErr = null;
      await c.query("savepoint sp_svc_w");
      try {
        await c.query(
          `insert into public.items (tenant_id, kind, name, duration_minutes) values ($1,'service','Thợ tự thêm',30)`,
          [tA.id]);
      } catch (err) { svcErr = err; }
      await c.query("rollback to savepoint sp_svc_w");
      check("items(kind=service) — staff GHI bị chặn (chỉ owner/admin/manager)", !!svcErr,
        "insert THÀNH CÔNG — sai khuôn lead_sources");
      let resErr = null;
      await c.query("savepoint sp_res_w");
      try {
        await c.query(
          `insert into public.resources (tenant_id, name, kind) values ($1,'Giường lậu','bed')`, [tA.id]);
      } catch (err) { resErr = err; }
      await c.query("rollback to savepoint sp_res_w");
      check("resources — staff GHI bị chặn (chỉ owner/admin/manager)", !!resErr,
        "insert THÀNH CÔNG — sai khuôn lead_sources");
    });

    // Ca CHIỀU NGƯỢC LẠI — trước đợt vá task #99 (ADR-0009 mục 7b) chỉ có ca
    // "staff bị chặn" ở trên, chưa từng CHỨNG MINH manager THỰC SỰ ghi được dù
    // comment ghi vậy — đây là RLS thật (hàng rào), khác app/app/settings/access.ts
    // (chỉ là phép lịch sự UI) nên phải tự kiểm riêng, không suy từ code app.
    await asUser(uS1, { tenant_id: tA.id, role: "manager" }, async () => {
      let svcErr = null;
      let svcId = null;
      await c.query("savepoint sp_svc_mgr");
      try {
        const r = await c.query(
          `insert into public.items (tenant_id, kind, name, duration_minutes) values ($1,'service','Quản lý thêm',45) returning id`,
          [tA.id]);
        svcId = r.rows[0].id;
      } catch (err) { svcErr = err; }
      check("items(kind=service) — manager GHI được (khớp app/app/settings/services/actions.ts đã mở 13/08)",
        !svcErr && !!svcId, svcErr?.message ?? "không rõ nguyên nhân");
      await c.query("rollback to savepoint sp_svc_mgr");

      let resErr = null;
      let resId = null;
      await c.query("savepoint sp_res_mgr");
      try {
        const r = await c.query(
          `insert into public.resources (tenant_id, name, kind) values ($1,'Giường quản lý thêm','bed') returning id`,
          [tA.id]);
        resId = r.rows[0].id;
      } catch (err) { resErr = err; }
      check("resources — manager GHI được (khớp app/app/settings/services/actions.ts đã mở 13/08)",
        !resErr && !!resId, resErr?.message ?? "không rõ nguyên nhân");
      await c.query("rollback to savepoint sp_res_mgr");
    });

    // ---- Màn Cài đặt → Dịch vụ & Tài nguyên (ADR-0009 mục 7 việc 3) ----
    // 8 ca dưới đây khoá đúng những chỗ MÀN TIN là CSDL sẽ đỡ giúp: nút "nạp
    // dịch vụ mẫu" bị bấm hai lần, ô nhập thời lượng, tên trùng, ô chọn loại
    // chỗ làm, và lời hứa in trên màn "ngừng bán thì lịch cũ giữ nguyên".
    //
    // Fixture: `apply_industry_pack('spa')` ở khối trên chạy TRONG asUser nên đã
    // bị rollback cùng savepoint — đặt lại ngành bằng quyền postgres để nút nạp
    // mẫu có pack thật để đọc.
    //
    // is_sample=false ĐI KÈM industry='spa' — cùng lý do đã ghi ở dòng ~1608:
    // partial unique index tenants_one_sample_per_industry (migration #64) chỉ
    // cho MỘT tiệm is_sample=true mỗi ngành, tiệm demo-spa-huong-sen thật đã
    // chiếm 'spa' rồi (task #149).
    await c.query(`update public.tenants set industry='spa', is_sample=false where id=$1`, [tA.id]);

    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      // ĐÚNG câu lệnh nút "Nạp dịch vụ mẫu theo ngành" chạy (seedServicesFromPack
      // trong app/app/settings/services/actions.ts): đọc mảnh `services` của pack
      // ĐANG DÙNG qua tenant_pack_view() rồi ON CONFLICT (tenant_id,name) DO NOTHING.
      // KHÔNG gọi apply_industry_pack() — hàm đó áp lại cả pack (tags, câu trả lời
      // nhanh, bộ lọc mẫu, audit), không phải việc của một nút tên "nạp dịch vụ mẫu".
      const seedFromPack = () =>
        c.query(
          `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd, sort_order, status)
             select $1, 'service', s->>'name', (s->>'duration_minutes')::int,
                    coalesce((s->>'price_vnd')::bigint, 0), coalesce((s->>'sort_order')::int, 0), 'active'
               from jsonb_array_elements(public.tenant_pack_view() -> 'services') s
             on conflict (tenant_id, name) do nothing`,
          [tA.id]);
      const countSvc = async () =>
        (await c.query(`select count(*)::int n from public.items where tenant_id=$1 and kind='service'`, [tA.id]))
          .rows[0].n;

      const n0 = await countSvc();
      await seedFromPack();
      const n1 = await countSvc();
      await seedFromPack();
      const n2 = await countSvc();
      check("Nạp mẫu — lần 1 có thêm dịch vụ, bấm LẦN HAI không tạo bản trùng",
        n1 > n0 && n2 === n1, `trước ${n0} → lần 1: ${n1} → lần 2: ${n2}`);

      // Chủ tiệm sửa giá xong lỡ bấm nạp mẫu lần nữa: giá đã sửa PHẢI còn nguyên.
      await c.query(
        `update public.items set price_vnd=999000 where tenant_id=$1 and name='Massage trị liệu'`,
        [tA.id]);
      await seedFromPack();
      const kept = await c.query(
        `select price_vnd from public.items where tenant_id=$1 and name='Massage trị liệu'`,
        [tA.id]);
      check("Nạp mẫu — KHÔNG đè giá/thời lượng tiệm đã tự sửa",
        Number(kept.rows[0]?.price_vnd) === 999000, JSON.stringify(kept.rows));

      // Ô nhập trên màn chỉ là phép lịch sự; chốt cuối nằm ở CSDL (bất biến 1).
      let durErr = null;
      await c.query("savepoint sp_svc_dur");
      try {
        await c.query(
          `insert into public.items (tenant_id,kind,name,duration_minutes) values ($1,'service','Ca 0 phút',0)`,
          [tA.id]);
      } catch (err) { durErr = err; }
      await c.query("rollback to savepoint sp_svc_dur");
      check("items(kind=service) — thời lượng 0 phút bị CSDL từ chối", !!durErr,
        "insert THÀNH CÔNG — ca 0 phút lọt qua cả hai EXCLUDE, chống trùng thủng một lỗ câm");

      let dupErr = null;
      await c.query("savepoint sp_svc_dup");
      try {
        await c.query(
          `insert into public.items (tenant_id,kind,name,duration_minutes) values ($1,'service','Gội đầu',30)`,
          [tA.id]);
      } catch (err) { dupErr = err; }
      await c.query("rollback to savepoint sp_svc_dup");
      check("items(kind=service) — trùng TÊN trong cùng tiệm bị chặn (màn dịch 23505 thành câu 'trùng tên')",
        !!dupErr && dupErr.code === "23505", dupErr ? `mã ${dupErr.code}` : "insert THÀNH CÔNG");

      let kindErr = null;
      await c.query("savepoint sp_res_kind");
      try {
        await c.query(
          `insert into public.resources (tenant_id,name,kind) values ($1,'Bể sục','jacuzzi')`,
          [tA.id]);
      } catch (err) { kindErr = err; }
      await c.query("rollback to savepoint sp_res_kind");
      check("resources — loại ngoài 5 loại đã khai bị chặn (ô chọn không phải hàng rào)",
        !!kindErr, "insert THÀNH CÔNG");

      // Lời hứa in ngay trên màn: "Tắt Đang bán = không hiện khi đặt lịch nữa,
      // LỊCH CŨ GIỮ NGUYÊN". `items` (di trú từ `services`, migration #125)
      // cố ý KHÔNG có deleted_at (ADR-0009 mục 4 + ADR-0019 mục 3) — nếu màn
      // đi đường xoá thay vì đổi status thì ca cũ mất tên dịch vụ.
      await c.query(`update public.items set status='discontinued' where id=$1`, [svcA.id]);
      const oldAppt = await c.query(
        `select s.name, s.duration_minutes from public.appointments a
           join public.items s on s.id = a.item_id
          where a.item_id = $1 limit 1`, [svcA.id]);
      check("items — 'Ngừng bán' KHÔNG làm mất dịch vụ khỏi lịch cũ",
        oldAppt.rowCount === 1 && oldAppt.rows[0].name === "Gội đầu",
        JSON.stringify(oldAppt.rows));
    });

    // Vai "Chỉ xem" đọc được bảng giá nhưng không sửa được gì — màn đã ẩn lối
    // vào (access.ts), nhưng lối vào bị ẩn KHÔNG phải là quyền bị chặn.
    await asUser(uV, VIEWER, async () => {
      let vInsErr = null;
      await c.query("savepoint sp_v_svc");
      try {
        await c.query(
          `insert into public.items (tenant_id,kind,name,duration_minutes) values ($1,'service','Viewer tự thêm',30)`,
          [tA.id]);
      } catch (err) { vInsErr = err; }
      await c.query("rollback to savepoint sp_v_svc");
      check("items(kind=service) — vai viewer THÊM dịch vụ bị chặn", !!vInsErr, "insert THÀNH CÔNG");

      const vUpd = await c.query(
        `update public.items set price_vnd=1 where tenant_id=$1 and kind='service'`, [tA.id]);
      check("items(kind=service) — vai viewer SỬA giá = 0 dòng", vUpd.rowCount === 0,
        `sửa được ${vUpd.rowCount} dòng`);
    });
  }

  console.log("[rls-smoke] V3 Đơn hàng + Thu tiền — nghiệm thu D3 (ADR-0019 mục 9, migration #127):");
  {
    // Tiệm riêng — tách khỏi tA/tB để không giao thoa với dữ liệu items/orders
    // các khối trên đã seed. Cách ly tenant CƠ BẢN (đơn tiệm A đọc/sửa đơn tiệm
    // B, ca 1 của ADR mục 9) đã được PHỦ MIỄN PHÍ bởi vòng quét generic cuối
    // file (item_costs/item_variants/items/order_line_costs/order_lines/
    // order_payments/orders/cash_entries đều có tenant_id + RLS) — các ca dưới
    // đây chỉ kiểm LUẬT NGHIỆP VỤ mà vòng generic không chạm tới.
    const uV3O = randomUUID(), uV3S = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uV3O, `smoke-v3-o-${stamp}@t.local`, uV3S, `smoke-v3-s-${stamp}@t.local`]);
    const { rows: [tV3] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke V3', $1, true) returning id`, [`smoke-v3-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($1,$3,'staff')`,
      [tV3.id, uV3O, uV3S]);
    const { rows: [ctV3] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách V3 thử') returning id`, [tV3.id]);
    const { rows: [svcV3] } = await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd, status)
         values ($1,'service','DV thử V3',30,100000,'active') returning id`, [tV3.id]);
    const { rows: [prodV3] } = await c.query(
      `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
         values ($1,'product','SP thử V3','cái',50000,'active') returning id`, [tV3.id]);
    await c.query(`insert into public.item_costs (item_id, tenant_id, cost_vnd) values ($1,$2,30000)`, [prodV3.id, tV3.id]);

    async function newOrder(kind = "order", parentId = null) {
      const { rows: [o] } = await c.query(
        `insert into public.orders (tenant_id, kind, parent_order_id, contact_id, created_by)
           values ($1,$2,$3,$4,$5) returning id`,
        [tV3.id, kind, parentId, ctV3.id, uV3O]);
      return o.id;
    }

    // ---- Ca — đơn tiệm V3 gắn mặt hàng của tiệm A (KHÁC tiệm) ----
    // order_lines.item_id chỉ là FK phẳng tới items(id) — không tự nhiên ràng
    // buộc "cùng tenant với đơn". Đo THẬT xem CSDL có tự chặn hay không, không
    // đoán từ tên cột (bài học D3: đo trước khi tin).
    const { rows: [foreignItem] } = await c.query(
      `select id from public.items where tenant_id=$1 and kind='service' limit 1`, [tA.id]);
    const oCross = await newOrder();
    let crossErr = null;
    await c.query("savepoint sp_v3_cross");
    try {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,100000)`, [tV3.id, oCross, foreignItem.id]);
    } catch (err) { crossErr = err; }
    await c.query("rollback to savepoint sp_v3_cross");
    check("V3 ca2 — đơn tiệm V3 gắn mặt hàng của tiệm A (khác tiệm) bị CSDL từ chối",
      !!crossErr, crossErr ? crossErr.message : "insert THÀNH CÔNG — rò rỉ ghi chéo tenant qua order_lines.item_id!");

    // ---- Ca — vai staff đọc giá vốn (item_costs) / order_line_costs bị chặn ở CSDL ----
    await asUser(uV3S, { tenant_id: tV3.id, role: "staff" }, async () => {
      const r1 = await c.query(`select cost_vnd from public.item_costs where item_id=$1`, [prodV3.id]);
      check("V3 ca3a — staff đọc item_costs (giá vốn) = 0 dòng", r1.rowCount === 0, `thấy ${r1.rowCount} dòng`);
    });

    // ---- Ca — sửa dòng hàng của đơn đã completed bị CSDL từ chối ----
    const oDone = await newOrder();
    const { rows: [lineDone] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
         values ($1,$2,$3,2,100000) returning id`, [tV3.id, oDone, svcV3.id]);
    await c.query(`update public.orders set status='confirmed' where id=$1`, [oDone]);
    await c.query(`update public.orders set status='completed' where id=$1`, [oDone]);
    let lockErr1 = null, lockErr2 = null;
    await c.query("savepoint sp_v3_lock1");
    try { await c.query(`update public.order_lines set qty=99 where id=$1`, [lineDone.id]); }
    catch (err) { lockErr1 = err; }
    await c.query("rollback to savepoint sp_v3_lock1");
    check("V3 ca4a — SỬA dòng hàng của đơn đã completed bị CSDL từ chối", !!lockErr1,
      lockErr1 ? lockErr1.message : "sửa THÀNH CÔNG — order_lines_lock_guard không có tác dụng!");
    await c.query("savepoint sp_v3_lock2");
    try {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,50000)`, [tV3.id, oDone, svcV3.id]);
    } catch (err) { lockErr2 = err; }
    await c.query("rollback to savepoint sp_v3_lock2");
    check("V3 ca4b — THÊM dòng hàng mới vào đơn đã completed bị CSDL từ chối", !!lockErr2,
      lockErr2 ? lockErr2.message : "thêm THÀNH CÔNG — order_lines_lock_guard không chặn insert!");

    // ---- Ca — hoàn hàng: sinh phiếu MỚI, đơn gốc không đổi một chữ ----
    const beforeLine = (await c.query(`select qty, unit_price_vnd, discount_vnd from public.order_lines where id=$1`, [lineDone.id])).rows[0];
    const returnOrderId = await newOrder("return", oDone);
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,-1,100000,0)`, [tV3.id, returnOrderId, svcV3.id]);
    const afterLine = (await c.query(`select qty, unit_price_vnd, discount_vnd from public.order_lines where id=$1`, [lineDone.id])).rows[0];
    check("V3 ca5a — tạo phiếu hoàn KHÔNG đổi một chữ dòng hàng đơn gốc",
      JSON.stringify(beforeLine) === JSON.stringify(afterLine), `trước=${JSON.stringify(beforeLine)} sau=${JSON.stringify(afterLine)}`);
    const retRow = await c.query(`select kind, parent_order_id, status from public.orders where id=$1`, [returnOrderId]);
    check("V3 ca5b — phiếu hoàn là ĐƠN MỚI kind=return, trỏ đúng đơn gốc",
      retRow.rows[0]?.kind === "return" && retRow.rows[0]?.parent_order_id === oDone, JSON.stringify(retRow.rows[0]));
    let signErr = null;
    await c.query("savepoint sp_v3_sign");
    try {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
           values ($1,$2,$3,1,100000)`, [tV3.id, returnOrderId, svcV3.id]);
    } catch (err) { signErr = err; }
    await c.query("rollback to savepoint sp_v3_sign");
    check("V3 ca5c — dòng hàng của phiếu hoàn qty DƯƠNG bị CSDL từ chối (order_lines_sign_guard)",
      !!signErr, signErr ? signErr.message : "insert THÀNH CÔNG — sign_guard không chặn!");

    // ---- Ca — thu tiền: chặn thu vượt tổng đơn + chặn trùng provider_ref + sổ quỹ đúng 1 phiếu/lần thu ----
    const oPay = await newOrder();
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd)
         values ($1,$2,$3,2,100000)`, [tV3.id, oPay, svcV3.id]); // tổng = 200.000
    const { rows: [pay1] } = await c.query(
      `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, provider, provider_ref, received_by)
         values ($1,$2,'cash',150000,'manual',$3,$4) returning id`,
      [tV3.id, oPay, `v3-ref-${stamp}-1`, uV3O]);
    let overpayErr = null;
    await c.query("savepoint sp_v3_overpay");
    try {
      await c.query(
        `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, received_by)
           values ($1,$2,'cash',100000,$3)`, [tV3.id, oPay, uV3O]); // 150k + 100k = 250k > 200k tổng đơn
    } catch (err) { overpayErr = err; }
    await c.query("rollback to savepoint sp_v3_overpay");
    check("V3 ca6 — thu vượt tổng tiền đơn bị CSDL từ chối (order_payments_guard)",
      !!overpayErr && /payment_exceeds_order_total/.test(overpayErr.message), overpayErr ? overpayErr.message : "thu vượt THÀNH CÔNG!");

    let dupRefErr = null;
    await c.query("savepoint sp_v3_dupref");
    try {
      await c.query(
        `insert into public.order_payments (tenant_id, order_id, method, amount_vnd, provider, provider_ref, received_by)
           values ($1,$2,'bank_transfer',50000,'manual',$3,$4)`,
        [tV3.id, oPay, `v3-ref-${stamp}-1`, uV3O]); // (provider, provider_ref) trùng pay1, tổng vẫn trong hạn (150k+50k=200k)
    } catch (err) { dupRefErr = err; }
    await c.query("rollback to savepoint sp_v3_dupref");
    check("V3 ca7 — ghi 2 lần cùng (provider, provider_ref) bị chặn (unique — khuôn subscription_payments)",
      !!dupRefErr, dupRefErr ? dupRefErr.message : "ghi trùng THÀNH CÔNG!");

    const cashRows = await c.query(`select id, amount_vnd, direction from public.cash_entries where order_payment_id=$1`, [pay1.id]);
    check("V3 ca10 — thu tiền tự sinh ĐÚNG MỘT phiếu quỹ (không nhân đôi)",
      cashRows.rowCount === 1 && cashRows.rows[0].direction === "in" && Number(cashRows.rows[0].amount_vnd) === 150000,
      JSON.stringify(cashRows.rows));

    // ---- Ca — lịch hẹn trỏ vào item kind=product bị CSDL từ chối ----
    let apptKindErr = null;
    await c.query("savepoint sp_v3_apptkind");
    try {
      await c.query(
        `insert into public.appointments (tenant_id, contact_id, staff_user_id, item_id, start_at, end_at, source)
           values ($1,$2,$3,$4,now()+interval '1 day',now()+interval '1 day 1 hour','calendar')`,
        [tV3.id, ctV3.id, uV3O, prodV3.id]);
    } catch (err) { apptKindErr = err; }
    await c.query("rollback to savepoint sp_v3_apptkind");
    check("V3 ca8 — lịch hẹn trỏ vào item kind=product bị CSDL từ chối (appointments_item_kind_guard)",
      !!apptKindErr, apptKindErr ? apptKindErr.message : "đặt lịch vào hàng hoá THÀNH CÔNG!");

    // ---- Ca — xoá đơn vào Thùng rác 30 ngày, không xoá cứng ----
    await c.query(`update public.orders set deleted_at=now() where id=$1`, [oPay]);
    await asUser(uV3O, { tenant_id: tV3.id, role: "owner" }, async () => {
      const trash = await c.query(`select * from public.trash_list(100)`);
      const inTrash = trash.rows.some((r) => r.entity_type === "order" && r.entity_id === oPay);
      check("V3 ca9a — xoá đơn: KHÔNG xoá cứng, hiện trong Thùng rác", inTrash, JSON.stringify(trash.rows.filter((r) => r.entity_type === "order")));
      await c.query(`select public.trash_restore('order', $1)`, [oPay]);
      // Kiểm NGAY trong cùng asUser — asUser() rollback-to-savepoint ở finally
      // sẽ xoá luôn hiệu lực của trash_restore nếu kiểm ở NGOÀI (bài học từ
      // chính comment ở đầu asUser() — đừng lặp lại lỗi rollback-nhầm-savepoint
      // dưới dạng khác: đọc SAU khi savepoint đã lùi lại).
      const restored = await c.query(`select deleted_at from public.orders where id=$1`, [oPay]);
      check("V3 ca9b — trash_restore đưa đơn ra khỏi Thùng rác (deleted_at về null)",
        restored.rows[0]?.deleted_at === null, JSON.stringify(restored.rows[0]));
    });
  }

  console.log("[rls-smoke] AI trực việc (ADR-0014 mục 10, migration #105-109):");
  {
    // ---- Dựng riêng MỘT tiệm + owner + staff — không dùng chung tA/tB để
    // 5 ca (mỗi ca đổi ai_autopilot/ai_reply_log) không giao thoa nhau.
    const uAiOwner = randomUUID(), uAiStaff = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uAiOwner, `smoke-ai-o-${stamp}@t.local`, uAiStaff, `smoke-ai-s-${stamp}@t.local`],
    );
    const { rows: [tAi] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke AI', $1, true) returning id`, [`smoke-ai-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($1,$3,'staff')`,
      [tAi.id, uAiOwner, uAiStaff]);
    // embed_key CỐ Ý bỏ trống — cột đó chỉ `livechat_setup()` được ghi (trigger
    // channels_guard_embed_key, migration liveChat), và ai_autopilot_decide()
    // không đọc gì từ channels — chỉ cần đúng FK cho conversations.channel_id.
    const { rows: [chAi] } = await c.query(
      `insert into public.channels (tenant_id, type, status) values ($1,'livechat','active') returning id`,
      [tAi.id]);
    const { rows: [convAi] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_smoke',now()) returning id`,
      [tAi.id, chAi.id]);
    // Một tin khách MỚI mỗi lần gọi decide() — chỉ mục DUY NHẤT trên
    // trigger_message_id (migration #108) cấm quyết định lại cùng một tin.
    async function inboundMsg(text = "Câu hỏi thử") {
      const { rows: [m] } = await c.query(
        `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
           values ($1,$2,'in','user',$3,now()) returning id`,
        [tAi.id, convAi.id, text]);
      return m.id;
    }
    const decide = async (msgId) =>
      (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [convAi.id, msgId])).rows[0].d;
    const logOf = async (msgId) =>
      (await c.query(`select outcome, reason from public.ai_reply_log where trigger_message_id=$1`, [msgId]))
        .rows[0];

    // Ca 1 (ADR mục 10): chưa khai dịch vụ LẪN giờ mở cửa — enabled=true BẬT
    // TAY thẳng trong CSDL (không qua màn Cài đặt) vẫn phải bị chặn — đây là
    // đúng ca "kể cả khi cột enabled bị bật tay" trong hồ sơ.
    await c.query(
      `insert into public.ai_autopilot (tenant_id, enabled, scope) values ($1,true,'always')`, [tAi.id]);
    const m1 = await inboundMsg();
    const d1 = await decide(m1);
    check("AI ca1: chưa khai nguồn (dù enabled bật tay) → từ chối",
      d1.allowed === false && d1.reason === "no_source", JSON.stringify(d1));
    const l1 = await logOf(m1);
    check("AI ca1: ghi log skipped_no_source", l1?.outcome === "skipped_no_source", JSON.stringify(l1));

    // Ca 2: công tắc tắt — kiểm TRƯỚC has_source trong decide() nên không cần
    // khai dịch vụ cho ca này.
    await c.query(`update public.ai_autopilot set enabled=false where tenant_id=$1`, [tAi.id]);
    const m2 = await inboundMsg();
    const d2 = await decide(m2);
    check("AI ca2: công tắc tắt → từ chối", d2.allowed === false && d2.reason === "off", JSON.stringify(d2));
    const l2 = await logOf(m2);
    check("AI ca2: ghi log skipped_off", l2?.outcome === "skipped_off", JSON.stringify(l2));

    // Từ đây khai 1 dịch vụ thật + bật công tắc — mở khoá has_source cho ca 3/4.
    await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd)
         values ($1,'service','Dịch vụ thử',30,100000)`, [tAi.id]);
    await c.query(
      `update public.ai_autopilot set enabled=true, scope='always', daily_cap=500 where tenant_id=$1`,
      [tAi.id]);

    // Ca 3: đã gửi đủ N lượt (mặc định 3) TRONG CÙNG hội thoại — chèn thẳng 3
    // dòng 'sent' giả (trigger_message_id NULL, cột nullable — chỉ mục DUY
    // NHẤT bỏ qua NULL nên không đụng nhau) để không phải tốn 1 lượt gọi AI
    // thật cho mỗi lượt giả.
    await c.query(
      `insert into public.ai_reply_log (tenant_id, conversation_id, outcome)
         select $1,$2,'sent' from generate_series(1,3)`,
      [tAi.id, convAi.id]);
    const m3 = await inboundMsg();
    const d3 = await decide(m3);
    check("AI ca3: đủ 3 lượt trong hội thoại → từ chối",
      d3.allowed === false && d3.reason === "turn_cap", JSON.stringify(d3));
    const l3 = await logOf(m3);
    check("AI ca3: ghi log skipped_turn_cap", l3?.outcome === "skipped_turn_cap", JSON.stringify(l3));
    // Hội thoại KHÔNG được AI trả lời → vẫn is_unanswered (về tay người, ADR mục 5).
    const convStill = await c.query(
      `select is_unanswered from public.conversations where id=$1`, [convAi.id]);
    check("AI ca3: hội thoại vẫn is_unanswered (chưa ai trả lời thật)",
      convStill.rows[0]?.is_unanswered === true, JSON.stringify(convStill.rows[0]));

    // Ca 4: vượt trần NGÀY của cả tiệm — thử ở HỘI THOẠI KHÁC (cô lập khỏi
    // turn_cap của ca 3 — daily_cap phải tự đứng được, không nhờ turn_cap che).
    // Đặt daily_cap = ĐÚNG số 'sent' hôm nay CỘNG 1 — không hardcode 1: ca 3 ở
    // trên đã tự chèn 3 dòng 'sent' để test turn_cap, những dòng đó CŨNG tính
    // vào trần ngày (daily_cap đếm theo TENANT, không theo hội thoại) nên
    // hardcode 1 sẽ sai — bắt được đúng lỗi này khi chạy thử lần đầu.
    const { rows: [sentToday] } = await c.query(
      `select count(*)::int as n from public.ai_reply_log
        where tenant_id=$1 and outcome='sent'
          and created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'`,
      [tAi.id]);
    await c.query(`update public.ai_autopilot set daily_cap=$2 where tenant_id=$1`,
      [tAi.id, sentToday.n + 1]);
    const { rows: [convAi2] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_smoke_2',now()) returning id`,
      [tAi.id, chAi.id]);
    const m4a = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','tin 1',now()) returning id`, [tAi.id, convAi2.id]);
    const d4a = await (async () =>
      (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [convAi2.id, m4a.rows[0].id])).rows[0].d)();
    check("AI ca4 (chuẩn bị): còn 1 suất trong ngày vẫn cho qua (chưa chạm trần)",
      d4a.allowed === true, JSON.stringify(d4a));
    // 1 lượt 'sent' thật vừa ghi ở trên (do decide() KHÔNG tự ghi 'sent' —
    // app mới ghi sau khi gọi AI thành công) — mô phỏng đúng luồng thật.
    await c.query(
      `select public.ai_reply_log_record($1,$2,'sent',null,null)`, [convAi2.id, m4a.rows[0].id]);
    const { rows: [convAi3] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_smoke_3',now()) returning id`,
      [tAi.id, chAi.id]);
    const m4b = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','tin 2',now()) returning id`, [tAi.id, convAi3.id]);
    const d4b = await (async () =>
      (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [convAi3.id, m4b.rows[0].id])).rows[0].d)();
    check(`AI ca4: vượt trần ngày (daily_cap=${sentToday.n + 1}, vừa dùng hết) → từ chối`,
      d4b.allowed === false && d4b.reason === "daily_cap", JSON.stringify(d4b));

    // Ca 6: staff KHÔNG được sửa cài đặt AI — chặn ở RLS (ai_autopilot_manage,
    // migration #105), không chỉ ẩn nút trên màn.
    await asUser(uAiStaff, { tenant_id: tAi.id, role: "staff" }, async () => {
      const upd = await c.query(
        `update public.ai_autopilot set enabled=false where tenant_id=$1`, [tAi.id]);
      check("AI ca6: staff sửa cài đặt AI = 0 dòng", upd.rowCount === 0, `sửa được ${upd.rowCount} dòng`);
      const sel = await c.query(`select 1 from public.ai_autopilot where tenant_id=$1`, [tAi.id]);
      check("AI ca6: staff KHÔNG đọc được cài đặt AI (chỉ owner/admin/manager)",
        sel.rowCount === 0, `đọc được ${sel.rowCount} dòng`);
    });

    // Grant service_role-only — authenticated không được gọi thẳng (chỉ máy
    // quét chạy bằng service role mới gọi được, khớp migration #108).
    await asUser(uAiOwner, { tenant_id: tAi.id, role: "owner" }, async () => {
      let permErr = null;
      try { await c.query(`select public.ai_autopilot_decide($1,$2)`, [convAi.id, randomUUID()]); }
      catch (err) { permErr = err; }
      check("AI: vai authenticated (kể cả owner) KHÔNG gọi thẳng được ai_autopilot_decide",
        !!permErr && /permission denied/.test(permErr.message), permErr?.message ?? "gọi được — rò rỉ grant!");
    });

    // Ca 5 (tiệm A đọc nhật ký AI tiệm B → 0 dòng) — PHỦ SẴN bởi quét generic
    // bên dưới: ai_autopilot/ai_reply_log đều có tenant_id + RLS bật nên nằm
    // trong genericTables tự động, không cần viết tay riêng.
    //
    // Ca 7 (thiếu khoá AI → không sập) và ca 8 (câu hỏi ngoài phạm vi → không
    // gửi) là hành vi Ở TẦNG NODE (lib/ai/gateway.ts, autopilot-answer.ts) —
    // script này thuần Postgres, không gọi Anthropic được. Đã xác nhận bằng
    // BẤM TAY THẬT qua Live Chat demo (không rollback, nhật ký 05 Nhật ký/
    // 2026-08-13.md mục 7): hỏi "gói trẻ hóa da" (dịch vụ không tồn tại) —
    // AI không bịa giá, nói đúng sự thật rồi gợi ý dịch vụ có thật gần nhất.
  }

  console.log("[rls-smoke] Kho tri thức (ADR-0015 mục 9, migration #113-117):");
  {
    // Tiệm riêng, KHÔNG dùng chung tA/tB — 8 ca dưới đây đều đổi kb_entries/
    // ai_autopilot, tách khỏi nhau qua asUser() (mỗi lần tự rollback về
    // savepoint) nên không cần dọn tay giữa các ca.
    const uKbOwner = randomUUID(), uKbStaff = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4)`,
      [uKbOwner, `smoke-kb-o-${stamp}@t.local`, uKbStaff, `smoke-kb-s-${stamp}@t.local`],
    );
    const { rows: [tKb] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke KB', $1, true) returning id`, [`smoke-kb-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'),($1,$3,'staff')`,
      [tKb.id, uKbOwner, uKbStaff]);

    // Khuôn ĐÚNG câu truy vấn thật của gatherAutopilotKb() (lib/ai/autopilot-facts.ts,
    // vá migration #117) — "chỉ published" không phải chuyện của RLS mà của
    // chính điều kiện WHERE, nên kiểm lại đúng câu đó chứ không kiểm khác đi.
    const publishedOf = async (tenantId) =>
      (await c.query(
        `select id, question, answer from public.kb_entries
           where tenant_id=$1 and status='published' order by updated_at desc limit 200`,
        [tenantId])).rows;

    // Ca 1: chưa có mục nào đã đăng (kể cả khi có bản NHÁP) → như trước ADR
    // này, gatherAutopilotKb() phải thấy "không có gì" (hasAny=false).
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      await c.query(
        `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Câu hỏi nháp','Câu trả lời nháp')`,
        [tKb.id]);
      const pub = await publishedOf(tKb.id);
      check("KB ca1: có nháp nhưng CHƯA có mục đăng → published rỗng", pub.length === 0, JSON.stringify(pub));
    });

    // Ca 3: mục NHÁP không lọt vào tập "đã đăng" dù đứng cạnh mục đã đăng.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      await c.query(
        `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Hỏi nháp 2','Trả lời nháp 2')`,
        [tKb.id]);
      const { rows: [p] } = await c.query(
        `insert into public.kb_entries (tenant_id, question, answer, status)
           values ($1,'Có chỗ để xe không?','Có bãi đỗ xe máy miễn phí.','published') returning id`,
        [tKb.id]);
      const pub = await publishedOf(tKb.id);
      check("KB ca3: published chỉ chứa mục ĐÃ ĐĂNG, không lẫn nháp",
        pub.length === 1 && pub[0].id === p.id, JSON.stringify(pub));
    });

    // Ca 4: nhân viên bấm Đăng (draft → published) → CSDL chặn, không phải
    // chỉ ẩn nút. Test NGAY TRÊN mục nháp vừa tạo — cần nằm ngoài savepoint
    // của ca 3 (đã rollback) nên tạo lại một mục nháp mới ở đây.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      const { rows: [d] } = await c.query(
        `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Hỏi nháp 3','Trả lời nháp 3') returning id`,
        [tKb.id]);
      await asUser(uKbStaff, { tenant_id: tKb.id, role: "staff" }, async () => {
        let err = null;
        try { await c.query(`update public.kb_entries set status='published' where id=$1`, [d.id]); }
        catch (e) { err = e; }
        check("KB ca4: nhân viên bấm Đăng → CSDL chặn kb_publish_forbidden",
          !!err && /kb_publish_forbidden/.test(err.message), err?.message ?? "ĐĂNG ĐƯỢC — chốt hở!");
      });
    });

    // Ca 5a: nhồi quá 200 mục → CSDL báo lỗi rõ, KHÔNG cắt bớt âm thầm.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      await c.query(
        `insert into public.kb_entries (tenant_id, question, answer)
           select $1, 'Câu hỏi số ' || g, 'Trả lời số ' || g from generate_series(1,200) g`,
        [tKb.id]);
      const { rows: [cnt] } = await c.query(`select count(*)::int as n from public.kb_entries where tenant_id=$1`, [tKb.id]);
      check("KB ca5a (chuẩn bị): đã nhồi đúng 200 mục", cnt.n === 200, `thực có ${cnt.n}`);
      let err = null;
      try {
        await c.query(
          `insert into public.kb_entries (tenant_id, question, answer) values ($1,'Mục thứ 201','Vượt trần')`,
          [tKb.id]);
      } catch (e) { err = e; }
      check("KB ca5a: mục thứ 201 → CSDL chặn kb_limit_entries",
        !!err && /kb_limit_entries/.test(err.message), err?.message ?? "CHÈN ĐƯỢC — trần hở!");
    });

    // Ca 5b: chưa chạm trần SỐ MỤC nhưng vượt trần 60.000 KÝ TỰ. Mỗi mục tối
    // đa 200+2000=2.200 ký tự → 28 mục (61.600 ký tự) đã vượt trần ký tự
    // trong khi mới dùng 28/200 mục — chứng minh hai trần độc lập nhau.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      const q = "H".repeat(200), a = "T".repeat(2000);
      for (let i = 0; i < 27; i++) {
        await c.query(`insert into public.kb_entries (tenant_id, question, answer) values ($1,$2,$3)`, [tKb.id, q, a]);
      }
      const { rows: [sum27] } = await c.query(
        `select coalesce(sum(length(question)+length(answer)),0)::int as n from public.kb_entries where tenant_id=$1`,
        [tKb.id]);
      check("KB ca5b (chuẩn bị): 27 mục = 59.400 ký tự, CHƯA chạm trần", sum27.n === 59_400, `thực có ${sum27.n}`);
      let err = null;
      try {
        await c.query(`insert into public.kb_entries (tenant_id, question, answer) values ($1,$2,$3)`, [tKb.id, q, a]);
      } catch (e) { err = e; }
      check("KB ca5b: mục thứ 28 (61.600 ký tự) → CSDL chặn kb_limit_chars, CHƯA chạm trần 200 mục",
        !!err && /kb_limit_chars/.test(err.message), err?.message ?? "CHÈN ĐƯỢC — trần ký tự hở!");
    });

    // Ca 9: trần lượt/ngày của AI trực việc đã chạm → decide() từ chối TRƯỚC
    // khi tầng Node kịp gọi gatherAutopilotKb() — dù kho tri thức đầy đủ thì
    // cũng không có cơ hội được đọc. Khớp đúng thứ tự thật trong
    // lib/ai/autopilot-run.ts (`if (!decision?.allowed) return "skipped"`
    // đứng TRƯỚC lệnh gather) — test lại decide() với daily_cap=0 là đủ,
    // không cần dựng lại toàn bộ luồng Node ở đây.
    //
    // KHÔNG bọc asUser(): ai_autopilot_decide() VÀ ai_reply_log_record() đều
    // chỉ cấp quyền cho service_role (đúng ADR-0014 — chỉ máy quét AI thật gọi
    // được, xác nhận lại ở check "AI: vai authenticated... KHÔNG gọi thẳng
    // được" phía trên) — dưới role authenticated cả hai đều bị 'permission
    // denied'. Khớp đúng khuôn khối "AI trực việc" phía trên: mọi setup ở đó
    // cũng chạy bằng quyền kết nối mặc định (vượt RLS), không asUser().
    await c.query(
      `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd) values ($1,'service','DV thử',30,100000)`,
      [tKb.id]);
    await c.query(
      `insert into public.ai_autopilot (tenant_id, enabled, scope, daily_cap) values ($1,true,'always',1)`,
      [tKb.id]);
    const { rows: [ch] } = await c.query(
      `insert into public.channels (tenant_id, type, status) values ($1,'livechat','active') returning id`, [tKb.id]);
    const { rows: [conv] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id, last_user_message_at)
         values ($1,$2,'lc_kb',now()) returning id`, [tKb.id, ch.id]);
    // Đã dùng hết 1/1 suất hôm nay bằng một dòng 'sent' giả — qua ĐÚNG RPC
    // ai_reply_log_record() (khớp khuôn ca 4 của khối AI trực việc phía trên).
    const { rows: [triggerMsg] } = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','tin trước',now()) returning id`, [tKb.id, conv.id]);
    await c.query(`select public.ai_reply_log_record($1,$2,'sent',null,null)`, [conv.id, triggerMsg.id]);
    const { rows: [msg] } = await c.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender_type, content, sent_at)
         values ($1,$2,'in','user','Có chỗ gửi xe không?',now()) returning id`, [tKb.id, conv.id]);
    const d = (await c.query(`select public.ai_autopilot_decide($1,$2) as d`, [conv.id, msg.id])).rows[0].d;
    check("KB ca9: trần ngày đã chạm → từ chối TRƯỚC khi kịp đọc kho tri thức",
      d.allowed === false && d.reason === "daily_cap", JSON.stringify(d));

    // Ca 10-12: MỘT mục đã đăng, thử ba thao tác — xoá, gỡ đăng (đều phải
    // CHẶN với nhân viên), sửa nội dung (phải CHO PHÉP). Bug thật từng lọt ở
    // đây (migration #115): bản đầu chỉ canh chiều ĐĂNG, bỏ sót xoá/gỡ đăng.
    await asUser(uKbOwner, { tenant_id: tKb.id, role: "owner" }, async () => {
      const { rows: [pub] } = await c.query(
        `insert into public.kb_entries (tenant_id, question, answer, status)
           values ($1,'Giờ mở cửa Chủ Nhật?','Chủ Nhật tiệm mở 9h-18h.','published') returning id`,
        [tKb.id]);
      await asUser(uKbStaff, { tenant_id: tKb.id, role: "staff" }, async () => {
        // Ca 10: xoá — MỖI thao tác kỳ vọng lỗi phải tự có savepoint riêng:
        // một câu lệnh lỗi làm cả (savepoint) transaction "aborted", câu lệnh
        // KẾ TIẾP dù đúng cũng bị Postgres từ chối thẳng nếu không rollback
        // về trước đó trước (đúng khuôn sp_v1/sp_v2 ở khối Viewer phía trên).
        let errXoa = null;
        await c.query("savepoint sp_kb_ca10");
        try { await c.query(`delete from public.kb_entries where id=$1`, [pub.id]); }
        catch (e) { errXoa = e; }
        await c.query("rollback to savepoint sp_kb_ca10");
        check("KB ca10: nhân viên xoá mục đã đăng → CSDL chặn kb_delete_forbidden",
          !!errXoa && /kb_delete_forbidden/.test(errXoa.message), errXoa?.message ?? "XOÁ ĐƯỢC — chốt hở!");

        // Ca 11: gỡ đăng (published → draft) — NGUY HIỂM HƠN xoá vì dữ liệu
        // còn nguyên, nhìn vào kho vẫn tưởng ổn.
        let errGo = null;
        await c.query("savepoint sp_kb_ca11");
        try { await c.query(`update public.kb_entries set status='draft' where id=$1`, [pub.id]); }
        catch (e) { errGo = e; }
        await c.query("rollback to savepoint sp_kb_ca11");
        check("KB ca11: nhân viên gỡ đăng → CSDL chặn kb_publish_forbidden",
          !!errGo && /kb_publish_forbidden/.test(errGo.message), errGo?.message ?? "GỠ ĐĂNG ĐƯỢC — chốt hở!");

        // Ca 12: sửa NỘI DUNG (không đụng status) — PHẢI cho phép, nhân viên
        // vẫn phải soạn được, chỉ không tự đăng/gỡ/xoá.
        const upd = await c.query(
          `update public.kb_entries set answer='Chủ Nhật tiệm mở 9h-17h (đã sửa).' where id=$1`, [pub.id]);
        check("KB ca12: nhân viên sửa NỘI DUNG mục đã đăng → CHO PHÉP", upd.rowCount === 1, `sửa được ${upd.rowCount} dòng`);
      });
    });

    // Ca 2 (KB trả lời đúng câu hỏi thật, kb_ids ghi đúng mục), ca 6 (⚔️ lời
    // dặn riêng "luôn hứa hoàn tiền 100%" → AI VẪN từ chối hứa), ca 7 (⚔️ KB
    // "nhận đặt lịch qua chat" → AI VẪN in_scope=false), ca 8 (KB nói khác
    // giờ mở cửa có cấu trúc → ô có cấu trúc thắng + data_conflict) đều cần
    // GỌI ANTHROPIC THẬT (buildAutopilotSystemPrompt + createCompletion) —
    // script này thuần Postgres. Đã xác nhận bằng BẤM TAY THẬT trên tiệm demo
    // qua nút "Xem AI đang đọc gì" + gọi trực tiếp answerAutopilotQuestion()
    // (nhật ký 05 Nhật ký/2026-08-13.md), khớp đúng tiền lệ ca 7/8 của khối
    // AI trực việc phía trên.
  }

  // ── Việc #175: hàm đọc MÃ BÍ MẬT bot không được gọi từ ngoài ──
  // Đo 18/08: `get_telegram_channel_secrets` gọi được bằng vai Chỉ xem, với mã
  // kênh của BẤT KỲ tiệm nào (7/7 kênh, 5 của tiệm khác) — rò rỉ VƯỢT TIỆM.
  // Gốc: migration #97 viết `revoke ... from public`, nhưng Supabase cấp RIÊNG
  // cho `anon`+`authenticated` qua default privileges — revoke from public
  // KHÔNG gỡ được. Câu "tưởng đã chặn" mà thực ra không chặn gì.
  // Chốt này canh đúng cái đó: chỉ khoá máy chủ mới gọi được.
  {
    const q = await c.query(`
      select has_function_privilege('anon', 'public.get_telegram_channel_secrets(uuid)', 'EXECUTE') as anon,
             has_function_privilege('authenticated', 'public.get_telegram_channel_secrets(uuid)', 'EXECUTE') as dangnhap,
             has_function_privilege('service_role', 'public.get_telegram_channel_secrets(uuid)', 'EXECUTE') as maychu`);
    const { anon, dangnhap, maychu } = q.rows[0];
    check("#175 — hàm đọc mã bí mật bot: khách vãng lai KHÔNG gọi được", anon === false, "anon gọi ĐƯỢC");
    check("#175 — hàm đọc mã bí mật bot: người đăng nhập KHÔNG gọi được", dangnhap === false, "gọi ĐƯỢC");
    check("#175 — hàm đọc mã bí mật bot: khoá máy chủ VẪN gọi được (bot không gãy)",
      maychu === true, "service_role mất quyền — adapter Telegram sẽ hỏng");
  }

  // ── Việc #177: disconnect_telegram_channel() XÓA bí mật của TIỆM KHÁC ──
  // Đo 18/08: hàm có kiểm quyền (phải owner) và UPDATE lọc đúng tenant, nhưng
  // DELETE khỏi vault.secrets dùng thẳng p_channel_id KHÔNG lọc tenant — owner
  // tiệm A gọi với mã kênh tiệm B là XÓA ĐƯỢC bí mật Telegram của tiệm B (đo
  // tận tay bằng dữ liệu giả: bí mật B mất hẳn, channels.status của B KHÔNG
  // đổi — chủ tiệm B không có cách nào biết bot của mình vừa bị rút ruột).
  // Vá: thêm exists-check đúng tenant TRƯỚC khi đụng vault (giống khuôn
  // disconnect_zalo_channel() vốn đã làm đúng). Chốt dưới đây canh đúng vị
  // trí exists-check đó — không đọc thẳng vault (vai 'authenticated' vốn
  // không có quyền đọc schema vault, đã đo ở #175), chỉ cần biết hàm có NÉM
  // LỖI trước khi chạm vault hay không là đủ suy ra DELETE có chạy hay không.
  {
    const { rows: [chB] } = await c.query(
      `insert into public.channels (tenant_id, type, status, config, external_id)
       values ($1,'telegram','active','{}'::jsonb,$2) returning id`,
      [tB.id, `sp-tele-B-${stamp}`]);

    let loiA = null;
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      try { await c.query(`select public.disconnect_telegram_channel($1)`, [chB.id]); }
      catch (e) { loiA = e.message; }
    });
    check("#177 — owner tiệm A KHÔNG ngắt được kênh Telegram của tiệm B",
      loiA === "channel_not_found", `mong 'channel_not_found', được: ${loiA}`);
    const { rows: [chSauA] } = await c.query(`select status from public.channels where id=$1`, [chB.id]);
    check("#177 — kênh Telegram tiệm B KHÔNG đổi trạng thái khi tiệm A cố ngắt (chưa chạm tới UPDATE/DELETE)",
      chSauA.status === "active", `status = ${chSauA.status}`);

    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      let loiB = null;
      try { await c.query(`select public.disconnect_telegram_channel($1)`, [chB.id]); }
      catch (e) { loiB = e.message; }
      const { rows: [chSauB] } = await c.query(`select status from public.channels where id=$1`, [chB.id]);
      check("#177 — owner tiệm B tự ngắt kênh CỦA MÌNH vẫn chạy được (không vá nhầm chặn cả người chủ thật)",
        loiB === null && chSauB.status === "disconnected", `lỗi=${loiB} status=${chSauB.status}`);
    });
  }

  // ── V4 (ADR-0021 mục 9): NGHIỆM THU SỔ KHO ────────────────────────────────
  // Luật đo của đợt này: MỌI ca phải GIEO dữ liệu rồi so với MỐC BIẾT TRƯỚC.
  // Cấm đọc "0 dòng" rồi kết luận "bị chặn" — ngày 18/08 đã dính đúng bẫy đó
  // bốn lần ("không thấy gì" không phân biệt được "bị chặn" với "vốn không có").
  {
    const { rows: [itA] } = await c.query(
      `insert into public.items (tenant_id, name, kind, price_vnd, status, unit)
       values ($1,$2,'product',100000,'active','chai') returning id`, [tA.id, `Hàng kho ${stamp}`]);
    const { rows: [dvA] } = await c.query(
      `insert into public.items (tenant_id, name, kind, price_vnd, status, duration_minutes)
       values ($1,$2,'service',150000,'active',30) returning id`, [tA.id, `Dịch vụ kho ${stamp}`]);
    const { rows: [khA] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,$2) returning id`, [tA.id, `Khách kho ${stamp}`]);

    const ton = async () => Number((await c.query(
      `select coalesce(sum(qty_on_hand),0) q from public.stock_levels where item_id=$1`, [itA.id])).rows[0].q);

    // Ca 1 — nhập/bán/hoàn ra đúng số. Mốc biết trước: 10 → 7 → 8.
    await c.query(`insert into public.stock_moves (tenant_id,item_id,qty,reason) values ($1,$2,10,'nhap')`,
      [tA.id, itA.id]);
    check("V4 ca1a — nhập 10 → tồn = 10", (await ton()) === 10, `được ${await ton()}`);

    const banDon = async (soLuong, loai) => {
      const { rows: [o] } = await c.query(
        `insert into public.orders (tenant_id, contact_id, kind, status) values ($1,$2,$3,'draft') returning id`,
        [tA.id, khA.id, loai]);
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd) values ($1,$2,$3,$4,100000)`,
        [tA.id, o.id, itA.id, soLuong]);
      // Dòng dịch vụ đi kèm — KHÔNG được sinh dòng kho (dịch vụ không có tồn).
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd) values ($1,$2,$3,$4,150000)`,
        [tA.id, o.id, dvA.id, loai === "return" ? -1 : 1]);
      // Máy trạng thái #207: draft→confirmed→completed, cấm nhảy cóc.
      await c.query(`update public.orders set status='confirmed' where id=$1`, [o.id]);
      await c.query(`update public.orders set status='completed' where id=$1`, [o.id]);
      return o.id;
    };

    const donBan = await banDon(3, "order");
    check("V4 ca1b — chốt đơn bán 3 → tồn = 7", (await ton()) === 7, `được ${await ton()}`);
    await banDon(-1, "return");
    check("V4 ca1c — chốt phiếu hoàn 1 → tồn = 8", (await ton()) === 8, `được ${await ton()}`);

    const dongDichVu = (await c.query(
      `select count(*)::int n from public.stock_moves where item_id=$1`, [dvA.id])).rows[0].n;
    check("V4 ca2 — DỊCH VỤ không sinh dòng kho nào (chỉ hàng hoá vật lý mới có tồn)",
      dongDichVu === 0, `có ${dongDichVu} dòng`);

    // Ca 3 — chốt lại lần nữa KHÔNG trừ gấp đôi (chống bấm đúp / chạy lại việc nền).
    // Máy trạng thái #207 cấm lùi `completed → confirmed`, và cấm ĐÚNG: lùi rồi
    // chốt lại chính là đường trừ kho hai lần mà phép kiểm này sinh ra để canh.
    // Ý định không đổi — diễn bằng đường hợp lệ: ghi lại đúng trạng thái đang có
    // (đường retry mạng / bấm đúp), thay vì đi vòng qua một bước lùi bị cấm.
    await c.query(`update public.orders set status='completed' where id=$1`, [donBan]);
    check("V4 ca3 — chốt lại đơn cũ → tồn VẪN 8, không trừ kho hai lần",
      (await ton()) === 8, `được ${await ton()}`);

    // Ca 4 — huỷ đơn ĐÃ chốt thì trả hàng về kho.
    await c.query(`update public.orders set status='cancelled' where id=$1`, [donBan]);
    check("V4 ca4 — huỷ đơn đã chốt → hàng về kho, tồn = 11", (await ton()) === 11, `được ${await ton()}`);

    // Ca 5 — tồn view khớp TỔNG SỔ (view không thể lệch, nhưng phải đo mới biết).
    const tongSo = Number((await c.query(
      `select coalesce(sum(qty),0) q from public.stock_moves where item_id=$1`, [itA.id])).rows[0].q);
    check("V4 ca5 — tồn (view) == tổng sổ (bảng gốc)", (await ton()) === tongSo, `view=${await ton()} sổ=${tongSo}`);

    // Ca 6 — BÁN QUÁ TỒN: cho qua, tồn xuống ÂM (ADR mục 5: cảnh báo, không chặn).
    await banDon(20, "order");
    check("V4 ca6 — bán quá tồn KHÔNG bị chặn, tồn xuống âm (−9)", (await ton()) === -9, `được ${await ton()}`);

    // Ca 7 — SỔ BẤT BIẾN: sửa/xoá dòng đều bị chặn ở CSDL.
    const thuChanKho = async (nhan, cau) => {
      await c.query("savepoint sp_kho");
      let loi = null;
      try { await c.query(cau, [itA.id]); } catch (e) { loi = e.message; }
      await c.query("rollback to savepoint sp_kho");
      check(nhan, (loi || "").includes("stock_moves_immutable"), `lỗi=${loi}`);
    };
    await thuChanKho("V4 ca7a — SỬA dòng sổ kho bị chặn ở CSDL",
      `update public.stock_moves set qty=999 where item_id=$1`);
    await thuChanKho("V4 ca7b — XOÁ dòng sổ kho bị chặn ở CSDL",
      `delete from public.stock_moves where item_id=$1`);

    // Ca 8 — đơn NHÁP không đụng tới tồn (bỏ dở giữa chừng là chuyện thường ngày).
    const tonTruocNhap = await ton();
    const { rows: [oNhap] } = await c.query(
      `insert into public.orders (tenant_id, contact_id, kind, status) values ($1,$2,'order','draft') returning id`,
      [tA.id, khA.id]);
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd) values ($1,$2,$3,5,100000)`,
      [tA.id, oNhap.id, itA.id]);
    check("V4 ca8 — đơn NHÁP không đụng tới tồn", (await ton()) === tonTruocNhap,
      `trước ${tonTruocNhap} sau ${await ton()}`);

    // Ca 9 — QUYỀN. Số lượng tồn: mọi vai xem được (nhân viên phải biết còn bao
    // nhiêu). Nhà cung cấp: chỉ quản lý trở lên. Ghi tay vào sổ: chỉ quản lý trở lên.
    await c.query(`insert into public.suppliers (tenant_id, name) values ($1,$2)`,
      [tA.id, `NCC thử ${stamp}`]);
    for (const vai of ["viewer", "staff", "manager"]) {
      await asUser(uA, { tenant_id: tA.id, role: vai }, async () => {
        const xemTon = (await c.query(
          `select count(*)::int n from public.stock_levels where item_id=$1`, [itA.id])).rows[0].n;
        check(`V4 ca9 [${vai}] — XEM được tồn kho (nhân viên phải biết còn bao nhiêu)`,
          xemTon === 1, `thấy ${xemTon} dòng`);

        const xemNcc = (await c.query(
          `select count(*)::int n from public.suppliers where tenant_id=$1`, [tA.id])).rows[0].n;
        const duocXemNcc = vai === "manager";
        check(`V4 ca9 [${vai}] — nhà cung cấp: ${duocXemNcc ? "XEM được" : "KHÔNG xem được"}`,
          (xemNcc > 0) === duocXemNcc, `thấy ${xemNcc} dòng`);

        await c.query("savepoint sp_ghi");
        let loiGhi = null;
        try {
          await c.query(`insert into public.stock_moves (tenant_id,item_id,qty,reason) values ($1,$2,1,'nhap')`,
            [tA.id, itA.id]);
        } catch (e) { loiGhi = e.message; }
        await c.query("rollback to savepoint sp_ghi");
        const duocGhi = vai === "manager";
        check(`V4 ca9 [${vai}] — ghi tay vào sổ kho: ${duocGhi ? "ĐƯỢC" : "bị chặn"}`,
          (loiGhi === null) === duocGhi, `lỗi=${loiGhi}`);
      });
    }
  }

  // ── Việc #174: nhân viên KHÔNG được ĐỌC chi phí + mục tiêu của người khác ──
  // Nửa còn lại của #173 (đó soát chiều GHI, đây soát chiều ĐỌC). Màn báo cáo
  // chi phí và mục tiêu chỉ cho quản lý trở lên, nhưng RLS để mọi vai đọc.
  // `kpi_targets` không khoá thẳng được: thẻ tiến độ trên màn Hôm nay hiện cho
  // MỌI vai — trước đây nó lọc "của mình" Ở TRÌNH DUYỆT nên mục tiêu đồng
  // nghiệp vẫn về tới máy nhân viên. Nay: quản lý xem hết, ai khác chỉ dòng
  // của mình. Ca dưới đòi ĐỦ BA chiều.
  {
    const { rows: [src] } = await c.query(
      `insert into public.lead_sources (tenant_id, name) values ($1,$2) returning id`,
      [tA.id, `Nguồn thử #174 ${stamp}`]);
    await c.query(
      `insert into public.source_costs (tenant_id, source_id, month, amount)
       values ($1,$2,date_trunc('month',now())::date,5000000) on conflict do nothing`, [tA.id, src.id]);
    await c.query(
      `insert into public.kpi_targets (tenant_id, user_id, month, metric, target)
       values ($1,$2,date_trunc('month',now())::date,'revenue_won',11000000) on conflict do nothing`, [tA.id, uC]);
    await c.query(
      `insert into public.kpi_targets (tenant_id, user_id, month, metric, target)
       values ($1,$2,date_trunc('month',now())::date,'revenue_won',22000000) on conflict do nothing`, [tA.id, uA]);
    const doVai = async (role) => {
      const r = {};
      await asUser(uC, { tenant_id: tA.id, role }, async () => {
        r.chiPhi = (await c.query(`select count(*)::int n from public.source_costs where tenant_id=$1`, [tA.id])).rows[0].n;
        r.cuaMinh = (await c.query(
          `select count(*)::int n from public.kpi_targets where tenant_id=$1 and user_id=$2`, [tA.id, uC])).rows[0].n;
        r.cuaNguoiKhac = (await c.query(
          `select count(*)::int n from public.kpi_targets where tenant_id=$1 and user_id=$2`, [tA.id, uA])).rows[0].n;
      });
      return r;
    };
    const nv = await doVai("staff"), ql = await doVai("manager");
    check("#174 — nhân viên KHÔNG đọc được chi phí marketing", nv.chiPhi === 0, `đọc ${nv.chiPhi} dòng`);
    check("#174 — nhân viên KHÔNG đọc được mục tiêu của đồng nghiệp",
      nv.cuaNguoiKhac === 0, `đọc ${nv.cuaNguoiKhac} dòng`);
    check("#174 — nhân viên VẪN đọc được mục tiêu CỦA MÌNH (thẻ màn Hôm nay không gãy)",
      nv.cuaMinh === 1, `đọc ${nv.cuaMinh} dòng`);
    check("#174 — quản lý VẪN đọc đủ chi phí + mục tiêu cả đội (không chặn nhầm)",
      ql.chiPhi === 1 && ql.cuaNguoiKhac === 1, `chi phí=${ql.chiPhi}, mục tiêu người khác=${ql.cuaNguoiKhac}`);
  }

  // ── Việc #173: 4 bảng nữa vai Chỉ xem còn ghi được ──
  // Tìm bằng cách quét TOÀN BỘ policy ghi trên bảng có tenant_id, lọc ra cái
  // không xét vai VÀ không khoá theo dòng-của-mình. Nặng nhất là `kb_entries`:
  // Kho tri thức là nguồn AI đọc để trả lời khách THẬT.
  // `deal_stage_history` thì xoá HẲN policy phía người dùng (append-only, chỉ
  // trigger security-definer được ghi) — nên KHÔNG AI ghi trực tiếp được, kể
  // cả chủ tiệm; ca dưới đòi đúng điều đó.
  {
    const { rows: [kbA] } = await c.query(
      `insert into public.kb_entries (tenant_id, question, answer)
       values ($1,'Giờ mở cửa thế nào?','Tiệm mở 8h tới 20h mỗi ngày.') returning id`, [tA.id]);
    const thuVai = async (role) => {
      const r = {};
      await asUser(uC, { tenant_id: tA.id, role }, async () => {
        const chay = async (sql, p) => {
          await c.query("savepoint sp173");
          try { const x = await c.query(sql, p); await c.query("rollback to savepoint sp173"); return x.rowCount > 0; }
          catch { await c.query("rollback to savepoint sp173"); return false; }
        };
        r.kbSua = await chay(`update public.kb_entries set answer='Đã đổi nội dung.' where id=$1`, [kbA.id]);
        r.docKb = await chay(`select 1 from public.kb_entries where id=$1`, [kbA.id]);
        r.identXoa = await chay(`delete from public.contact_identities where tenant_id=$1`, [tA.id]);
        r.lichSu = await chay(
          `insert into public.deal_stage_history (tenant_id, deal_id, to_stage_id, changed_by)
           select $1, d.id, d.stage_id, $2 from public.deals d where d.tenant_id=$1 limit 1`, [tA.id, uC]);
      });
      return r;
    };
    const xem = await thuVai("viewer"), nv = await thuVai("staff");
    check("#173 — vai Chỉ xem KHÔNG sửa được Kho tri thức (nguồn AI trả lời khách)",
      xem.kbSua === false, "sửa ĐƯỢC — người lạ nhét được kiến thức sai vào miệng AI!");
    check("#173 — vai Chỉ xem VẪN đọc được Kho tri thức", xem.docKb === true, "đọc bị chặn theo");
    check("#173 — vai Chỉ xem KHÔNG xoá được liên kết danh tính khách",
      xem.identXoa === false, "xoá ĐƯỢC");
    check("#173 — nhân viên VẪN sửa được Kho tri thức (không chặn nhầm)",
      nv.kbSua === true, "nhân viên bị chặn nhầm");
    check("#173 — KHÔNG AI ghi thẳng vào lịch sử bước (append-only, chỉ trigger)",
      xem.lichSu === false && nv.lichSu === false, `viewer=${xem.lichSu}, staff=${nv.lichSu}`);
  }

  // ── Việc #172: vai Chỉ xem KHÔNG được gắn/gỡ nhãn cho khách ──
  // Phát hiện khi làm sâu thẻ Hồ sơ khách 18/08: `contact_tags_all` (migration
  // #4) chỉ xét cùng tiệm, không xét vai — cùng lớp #170. Đọc (lọc theo nhãn)
  // PHẢI vẫn hoạt động cho vai Chỉ xem (tiệm mẫu) — chỉ chặn ghi.
  //
  // Tự tạo khách + nhãn RIÊNG cho ca này (không dò dữ liệu mẫu có sẵn — lần
  // đầu viết ca này đã im lặng bỏ qua vì mọi cặp khách/nhãn mẫu đều đã gắn
  // hết, "TẤT CẢ PASS" nhưng thực ra ca #172 chưa từng chạy).
  {
    const { rows: [cTagDoc] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách thử #172 (đọc)') returning id`, [tA.id]);
    const { rows: [cTagGhi] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách thử #172 (ghi)') returning id`, [tA.id]);
    const { rows: [tag172] } = await c.query(
      `insert into public.tags (tenant_id, name) values ($1,$2) returning id`, [tA.id, `Nhãn thử #172 ${stamp}`]);
    // Gắn sẵn 1 dòng (khách "đọc") bằng quyền postgres — để phép kiểm "đọc
    // được" dưới có gì THẬT để xác nhận thấy, không chỉ đo "không văng lỗi"
    // (SELECT bị RLS lọc mất hàng thì không ném lỗi, chỉ lặng lẽ trả về ít
    // hơn — phải so với một con số biết trước mới bắt được kiểu hồi quy đó).
    // Khách "ghi" để riêng, CHƯA gắn nhãn — tránh lỗi trùng khoá khi thử ghi.
    await c.query(`insert into public.contact_tags (tenant_id, contact_id, tag_id) values ($1,$2,$3)`,
      [tA.id, cTagDoc.id, tag172.id]);
    {
      const cid = cTagGhi.id, tid = tag172.id;
      let guiDuoc = false;
      await asUser(uC, { tenant_id: tA.id, role: "viewer" }, async () => {
        await c.query("savepoint sp_tag");
        try {
          await c.query(`insert into public.contact_tags (tenant_id, contact_id, tag_id) values ($1,$2,$3)`, [tA.id, cid, tid]);
          guiDuoc = true;
        } catch { /* mong đợi: bị chặn */ }
        await c.query("rollback to savepoint sp_tag");
      });
      check("#172 — vai Chỉ xem KHÔNG gắn được nhãn cho khách", guiDuoc === false, "gắn ĐƯỢC!");
      let thayDongDaGan = false;
      await asUser(uC, { tenant_id: tA.id, role: "viewer" }, async () => {
        const r = await c.query(
          `select 1 from public.contact_tags where contact_id = $1 and tag_id = $2`, [cTagDoc.id, tag172.id]);
        thayDongDaGan = r.rowCount === 1;
      });
      check("#172 — vai Chỉ xem VẪN đọc được nhãn (lọc danh sách khách không bị khoá theo)",
        thayDongDaGan, "không thấy dòng đã gắn sẵn — đọc bị chặn theo vai!");
    }
  }

  // ── Việc #170: vai Chỉ xem KHÔNG được gửi tin nhắn cho khách ──
  // Màn Đội ngũ hứa "Chỉ xem, không sửa được gì", và nút "Xem demo nhanh" trên
  // trang đăng nhập CÔNG KHAI đưa người lạ vào bằng đúng vai này. Trước 18/08
  // luật `messages_insert` chỉ xét cùng tiệm, KHÔNG xét vai → vai Chỉ xem gửi
  // được tin thật. Đợt siết #163 khoá 4 bảng nhưng bỏ sót 2 bảng của Hộp thư.
  // Kiểm CẢ HAI chiều: Chỉ xem phải bị chặn, nhân viên phải VẪN trả lời được.
  {
    const { rows: [cv] } = await c.query(
      `insert into public.conversations (tenant_id, channel_id, external_user_id)
       values ($1,$2,$3) returning id`, [tA.id, chA.id, `zl-viewer-${stamp}`]);
    const thu = async (role) => {
      let guiDuoc = false, soDong = 0;
      await asUser(uC, { tenant_id: tA.id, role }, async () => {
        await c.query("savepoint sp_msg");
        try {
          await c.query(`insert into public.messages (tenant_id, conversation_id, direction, sender_type, content)
                         values ($1,$2,'out','agent','thử')`, [tA.id, cv.id]);
          guiDuoc = true;
        } catch { await c.query("rollback to savepoint sp_msg"); }
        const r = await c.query(`update public.conversations set status='open' where id = $1`, [cv.id]);
        soDong = r.rowCount;
      });
      return { guiDuoc, soDong };
    };
    const xem = await thu("viewer"), nv = await thu("staff");
    check("#170 — vai Chỉ xem KHÔNG gửi được tin nhắn cho khách",
      xem.guiDuoc === false, "gửi ĐƯỢC — vai Chỉ xem nhắn được cho khách thật!");
    check("#170 — vai Chỉ xem KHÔNG đổi được trạng thái hội thoại",
      xem.soDong === 0, `đổi ${xem.soDong} dòng`);
    check("#170 — nhân viên VẪN trả lời khách được (không chặn nhầm)",
      nv.guiDuoc === true && nv.soDong === 1, `gửi=${nv.guiDuoc}, đổi=${nv.soDong} dòng`);
  }

  // ── CÁI BẪY: lệnh SỬA bị RLS chặn thì KHÔNG ném lỗi, chỉ trả 0 dòng ──
  // Ca này không kiểm quyền — nó ĐÓNG ĐINH cơ chế, để ai đọc output cổng cũng
  // thấy. Server action nào chỉ kiểm `error` sau khi `.update()` sẽ báo "đã
  // lưu" cho người không đủ quyền (bắt thật ở màn Cài đặt › Nhãn, 18/08). Cách
  // đúng: `.select()` rồi ĐẾM DÒNG. Khác hẳn lệnh THÊM MỚI — chèn sai quyền
  // thì ném lỗi thật, nên nhiều người tưởng sửa cũng vậy.
  {
    const { rows: [tag] } = await c.query(
      `insert into public.tags (tenant_id, name) values ($1,$2) returning id`,
      [tA.id, `Nhãn bẫy ${stamp}`]);
    let nemLoi = false, soDong = -1;
    await asUser(uC, { tenant_id: tA.id, role: "staff" }, async () => {
      await c.query("savepoint sp_bay");
      try {
        const r = await c.query(`update public.tags set name = 'BỊ ĐỔI LÉN' where id = $1`, [tag.id]);
        soDong = r.rowCount;
      } catch { nemLoi = true; }
      await c.query("rollback to savepoint sp_bay");
    });
    check("CÁI BẪY — nhân viên sửa nhãn: RLS chặn nhưng KHÔNG ném lỗi, chỉ 0 dòng "
      + "(=> server action PHẢI đếm dòng, kiểm `error` là chưa đủ)",
      nemLoi === false && soDong === 0, `ném lỗi=${nemLoi}, số dòng=${soDong}`);
  }

  // ── Việc #167: phân trang không được LÀM RƠI dòng khi trùng mốc thời gian ──
  // Postgres now() trả mốc BẮT ĐẦU GIAO DỊCH → nhập Excel 200 khách một lượt
  // thì cả 200 cùng created_at. Con trỏ chỉ dựa created_at đòi trang sau phải
  // "cũ hơn hẳn" nên bỏ trắng phần còn lại của nhóm. Đo 18/08 trên CSDL thật:
  // 1 người dùng có 121 thông báo, lật hết trang chỉ thấy 74. Bản vá thêm id
  // làm mốc phụ (lib/keyset-cursor.ts). Phép kiểm dưới đây dựng lại đúng cảnh
  // đó và đòi CẢ HAI chiều: lối cũ PHẢI rơi (nếu không, phép kiểm vô nghĩa),
  // lối mới PHẢI đủ.
  {
    const N = 7, TRANG = 3;
    const mocChung = "2026-01-01T00:00:00Z";
    for (let i = 0; i < N; i++) {
      await c.query(
        `insert into public.contacts (tenant_id, full_name, created_at) values ($1,$2,$3)`,
        [tA.id, `Nhập Excel ${i}`, mocChung]);
    }
    const lat = async (themMocPhu) => {
      const thay = new Set();
      let cur = null;
      for (let vong = 0; vong < 20; vong++) {
        const p = [tA.id, mocChung];
        let dk = "";
        if (cur) {
          if (themMocPhu) { p.push(cur.id); dk = ` and (created_at < $2 or (created_at = $2 and id < $3))`; }
          else dk = ` and created_at < $2`;
        }
        const thuTu = themMocPhu ? "created_at desc, id desc" : "created_at desc";
        const r = await c.query(
          `select id, created_at from public.contacts
           where tenant_id = $1 and created_at = $2::timestamptz${cur ? dk : ""}
           order by ${thuTu} limit ${TRANG}`,
          cur ? p : p.slice(0, 2));
        if (!r.rows.length) break;
        r.rows.forEach((x) => thay.add(x.id));
        if (r.rows.length < TRANG) break;
        cur = r.rows[r.rows.length - 1];
      }
      return thay.size;
    };
    const cu = await lat(false), moi = await lat(true);
    check("#167 ca1 — con trỏ CHỈ mốc thời gian LÀM RƠI dòng (chứng minh phép kiểm có răng)",
      cu < N, `lối cũ thấy ${cu}/${N} — không rơi thì phép kiểm này vô nghĩa`);
    check("#167 ca2 — con trỏ có mốc phụ id lấy ĐỦ mọi dòng trùng mốc",
      moi === N, `thấy ${moi}/${N} — vẫn còn rơi`);
  }

  // ── csatQc (V6, migration #155-156): phiếu hỏi khách hài lòng ──
  // Bảng này chứa BÌNH LUẬN THẬT của khách. Ba điều phải đúng:
  //   1. vai Chỉ xem KHÔNG đọc được (cùng lớp #170/#172/#173 — màn chặn thì RLS
  //      cũng phải chặn, nếu không API vẫn moi ra được).
  //   2. nhân viên GHI được phiếu (họ là người bấm "Hoàn thành") nhưng KHÔNG đọc.
  //   3. một lịch hẹn chỉ đẻ MỘT phiếu, và khách chỉ trả lời được MỘT lần.
  {
    const { rows: [ctCsat] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách thử CSAT') returning id`, [tA.id]);
    const { rows: [apCsat] } = await c.query(
      `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at, status)
         values ($1,$2,$3, timestamptz '2099-02-01 03:00Z', timestamptz '2099-02-01 04:00Z', 'done') returning id`,
      [tA.id, ctCsat.id, uA]);

    // (2) nhân viên GHI được
    let nvGhiDuoc = false;
    await asUser(uA, { tenant_id: tA.id, role: "staff" }, async () => {
      await c.query("savepoint sp_csat1");
      try {
        await c.query(`insert into public.satisfaction_surveys (tenant_id, appointment_id) values ($1,$2)`,
          [tA.id, apCsat.id]);
        nvGhiDuoc = true;
      } catch { /* mong đợi: ghi được */ }
      await c.query("rollback to savepoint sp_csat1");
    });
    check("csat — nhân viên PHÁT được phiếu khi bấm Hoàn thành", nvGhiDuoc === true, "nhân viên bị chặn ghi");

    // vai Chỉ xem KHÔNG ghi được
    let xemGhiDuoc = false;
    await asUser(uC, { tenant_id: tA.id, role: "viewer" }, async () => {
      await c.query("savepoint sp_csat2");
      try {
        await c.query(`insert into public.satisfaction_surveys (tenant_id, appointment_id) values ($1,$2)`,
          [tA.id, apCsat.id]);
        xemGhiDuoc = true;
      } catch { /* mong đợi: bị chặn */ }
      await c.query("rollback to savepoint sp_csat2");
    });
    check("csat — vai Chỉ xem KHÔNG phát được phiếu", xemGhiDuoc === false, "phát ĐƯỢC!");

    // Phiếu thật (quyền postgres) để đo phần ĐỌC — không đo bằng "không văng lỗi"
    // mà so với một con số biết trước: có đúng 1 dòng.
    const { rows: [pCsat] } = await c.query(
      `insert into public.satisfaction_surveys (tenant_id, appointment_id) values ($1,$2) returning id, token`,
      [tA.id, apCsat.id]);

    // (1) vai Chỉ xem + nhân viên KHÔNG đọc được; quản lý ĐỌC được
    const dem = async (role, uid) => {
      let n = -1;
      await asUser(uid, { tenant_id: tA.id, role }, async () => {
        const r = await c.query(`select 1 from public.satisfaction_surveys where id = $1`, [pCsat.id]);
        n = r.rowCount;
      });
      return n;
    };
    check("csat — vai Chỉ xem KHÔNG đọc được bình luận khách", (await dem("viewer", uC)) === 0, "đọc ĐƯỢC!");
    check("csat — nhân viên KHÔNG đọc được bình luận khách", (await dem("staff", uA)) === 0, "đọc ĐƯỢC!");
    check("csat — quản lý ĐỌC được (không chặn nhầm)", (await dem("manager", uA)) === 1, "quản lý bị chặn");

    // (3) một lịch một phiếu
    let phieuThu2 = false;
    await c.query("savepoint sp_csat3");
    try {
      await c.query(`insert into public.satisfaction_surveys (tenant_id, appointment_id) values ($1,$2)`,
        [tA.id, apCsat.id]);
      phieuThu2 = true;
    } catch { /* mong đợi: unique index chặn */ }
    await c.query("rollback to savepoint sp_csat3");
    check("csat — một lịch hẹn chỉ đẻ MỘT phiếu (bấm Hoàn thành 2 lần không sinh link thừa)",
      phieuThu2 === false, "sinh được phiếu thứ hai");

    // Khách gửi đánh giá qua RPC công khai
    const rpc = async (tok, rating, cmt = null) =>
      (await c.query(`select public.submit_survey($1, $2::smallint, $3) r`, [tok, rating, cmt])).rows[0].r;
    check("csat — token sai bị từ chối", (await rpc("token-bia-dat", 5)) === "not_found_or_done");
    check("csat — sao ngoài 1..5 bị từ chối", (await rpc(pCsat.token, 9)) === "invalid_rating");
    check("csat — không chấm sao bị từ chối (không vỡ thành lỗi 500)",
      (await rpc(pCsat.token, null)) === "invalid_rating");
    check("csat — khách gửi đánh giá hợp lệ được ghi nhận", (await rpc(pCsat.token, 5, "  Rất tốt  ")) === "ok");
    {
      const { rows: [sau] } = await c.query(
        `select rating, comment, submitted_at from public.satisfaction_surveys where id = $1`, [pCsat.id]);
      check("csat — điểm + bình luận lưu đúng (đã cắt khoảng trắng thừa)",
        sau.rating === 5 && sau.comment === "Rất tốt" && sau.submitted_at !== null,
        `rating=${sau.rating} comment=${JSON.stringify(sau.comment)}`);
    }
    check("csat — gửi lại lần hai bị chặn (không sửa được đánh giá đã nhận)",
      (await rpc(pCsat.token, 1, "đổi ý")) === "not_found_or_done", "gửi lại ĐƯỢC");

    // Trang công khai đọc được thông tin phiếu theo token
    {
      const { rows: [info] } = await c.query(`select public.get_survey_info($1) j`, [pCsat.token]);
      check("csat — trang khách mở link thấy tên tiệm + biết đã trả lời",
        info.j !== null && typeof info.j.shop_name === "string" && info.j.already_submitted === true,
        JSON.stringify(info.j));
    }
    check("csat — token sai thì trang khách ra 404 (hàm trả rỗng, không lộ gì)",
      (await c.query(`select public.get_survey_info('token-bia-dat') j`)).rows[0].j === null);
  }

  console.log(`[rls-smoke] Quét generic ${genericTables.length} bảng tenant-scoped (A không đọc/ghi được dữ liệu B):`);
  // Metadata cột (quyền postgres): cột bắt buộc (not null, không default, không identity/generated),
  // FK, và giá trị hợp lệ từ check constraint dạng ANY(ARRAY[...]).
  const { rows: reqCols } = await c.query(`
    select table_name t, column_name col, udt_name typ
    from information_schema.columns
    where table_schema = 'public' and table_name = any($1)
      and is_nullable = 'NO' and column_default is null
      and is_identity = 'NO' and is_generated = 'NEVER'
    order by table_name, ordinal_position`, [genericTables]);
  const { rows: fkRows } = await c.query(`
    select tc.table_name t, kcu.column_name col, ccu.table_name ft, ccu.column_name fc
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
      and tc.table_name = any($1) and ccu.table_schema = 'public'`, [genericTables]);
  const { rows: chkRows } = await c.query(`
    select rel.relname t, pg_get_constraintdef(con.oid) def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where con.contype = 'c' and nsp.nspname = 'public' and rel.relname = any($1)`, [genericTables]);

  const required = {};
  genericTables.forEach((t) => (required[t] = []));
  reqCols.forEach((r) => required[r.t].push({ col: r.col, typ: r.typ }));
  const fkOf = {};
  fkRows.forEach((r) => (fkOf[`${r.t}.${r.col}`] = { ft: r.ft, fc: r.fc }));
  const enumOf = {};
  chkRows.forEach((r) => {
    const em = r.def.match(/\((\w+)\s*=\s*ANY\s*\(ARRAY\[\s*'([^']*)'/);
    if (em && enumOf[`${r.t}.${em[1]}`] === undefined) enumOf[`${r.t}.${em[1]}`] = em[2];
  });
  // Việc thứ hai của tiệm B, chỉ để `task_blocks` có hai đầu khác nhau.
  // Gán sau (cùng chỗ mồi `items`) — `val` chạy trễ nên đọc được giá trị lúc đó.
  let actPhuB = null;
  // Cột nullable nhưng bắt buộc theo check constraint nghiệp vụ — bổ sung thủ công
  const extras = {
    activities: { contact_id: { ref: "contacts" } },          // check: contact_id OR deal_id not null
    deals: { next_action_at: { val: () => new Date() } },     // check: status='open' → next_action_at not null
    // check: breach_after_minutes > warn_after_minutes (byType trả 1 cho cả hai → vi phạm)
    sla_policies: {
      warn_after_minutes: { val: () => 30 },
      breach_after_minutes: { val: () => 120 },
    },
    // check 1 giá trị ('zalo_bot') → pg render "kind = 'zalo_bot'" không có ANY(ARRAY[...])
    notification_channels: { kind: { val: () => "zalo_bot" } },
    // is_closed mặc định false (không nằm trong reqCols) nhưng check constraint
    // đòi open_time/close_time not null khi not is_closed — reqCols không thấy
    // 2 cột này (nullable, không default) nên phải ép tay, nếu không insertGeneric
    // để null → vi phạm business_hours_time_check, seed B thất bại (#87).
    business_hours: { open_time: { val: () => "08:00" }, close_time: { val: () => "18:00" } },
    // check regex '^\d{6}$' — sinh đúng mã 6 số
    link_codes: { code: { val: () => String(Math.floor(Math.random() * 900000) + 100000) } },
    // check month = ngày 1 của tháng (#52)
    source_costs: { month: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } } },
    // check month ngày 1 + metric thuộc bộ 3 (#59)
    kpi_targets: {
      month: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
      metric: { val: () => "revenue_won" },
    },
    // check: total = coalesce(array_length(target_ids,1),0) — byType() không có
    // nhánh cho kiểu mảng (_uuid), rơi về chuỗi ngẫu nhiên → "malformed array
    // literal". Mảng rỗng khớp total=0 (migration #69, biên nhận hàng loạt).
    // entity_type chỉ 1 giá trị hợp lệ ('contact') — cùng lý do notification_
    // channels.kind ở trên: pg render "= 'contact'" không có ANY(ARRAY[...]).
    bulk_operations: {
      target_ids: { val: () => [] },
      total: { val: () => 0 },
      entity_type: { val: () => "contact" },
    },
    // check: end_at > start_at — byType() trả cùng một new Date() cho cả hai
    // cột kiểu timestamptz nên khoảng ca rỗng, vi phạm appointments_time_check.
    // Mốc 2099 nằm ngoài mọi ca thật của bộ kiểm; hai lần insert (seed cho B,
    // và lần A thử ghi chéo tiệm) mang staff_user_id khác nhau và resource_id
    // NULL nên KHÔNG chạm hai ràng buộc EXCLUDE — lần A thất bại phải là do
    // RLS, không được thất bại nhầm vì chống trùng (migration #83).
    appointments: {
      start_at: { val: () => new Date(Date.UTC(2099, 0, 1)) },
      end_at: { val: () => new Date(Date.UTC(2099, 0, 1) + 3600e3) },
    },
    // check items_kind_fields_check (migration #125, ADR-0019 mục 3): kind='service'
    // đòi duration_minutes NOT NULL + unit NULL. `kind` không lọt vào reqCols (có
    // default 'service') nhưng enumOf tự nhặt được 'service' từ check kind=ANY(...)
    // — chỉ thiếu duration_minutes (nullable, không default) nên phải ép tay,
    // nếu không insertGeneric để NULL → vi phạm constraint, seed B thất bại và kéo
    // theo item_costs/item_variants/order_lines (đều FK vào items) thất bại dây
    // chuyền (bắt được lúc nghiệm thu D3 V3, task #144).
    items: { duration_minutes: { val: () => 30 } },
    // check `vouchers_gia_tri_khop_kind` (migration #157): kind='percent' ĐÒI
    // percent_off không rỗng. enumOf tự nhặt được 'percent' từ check của cột
    // kind, nhưng percent_off nullable nên insertGeneric để null → vi phạm.
    vouchers: { percent_off: { val: () => 15 } },
    // ⏰ ĐỎ THEO GIỜ TRONG NGÀY — bắt được 19/08 lúc 21:05:
    // trigger của #171 chặn gửi chiến dịch ngoài khung 8h–21h GIỜ TIỆM, và
    // `byType()` sinh `send_at = now()`. Nghĩa là hai ca này ĐỎ **mỗi đêm từ
    // 21:00 tới 08:00** — 11 tiếng mỗi ngày — vì lý do không liên quan gì tới
    // code. `campaign_send_recipients` gãy dây chuyền theo vì FK vào đây.
    // Một cổng kiểm đỏ theo đồng hồ dạy người ta bỏ qua báo đỏ, đúng thứ nguy
    // hiểm nhất trong kho này. Ghim một mốc CỐ ĐỊNH nằm giữa khung giờ.
    // 05:00 UTC = 12:00 giờ Việt Nam; mốc 2099 nằm ngoài mọi ca thật của bộ
    // kiểm. Giả định đã ghi ra: tiệm dùng múi giờ mặc định (UTC+7) — tiệm nào
    // đặt múi giờ lệch quá xa vẫn có thể rơi ra ngoài khung.
    campaign_sends: { send_at: { val: () => new Date(Date.UTC(2099, 0, 1, 5)) } },
    // check `loyalty_ledger_lo_hop_le` (migration #157): dòng CỘNG phải có hạn
    // và phần còn lại. byType cho delta_points = 1 (>0), còn expires_at nullable
    // và remaining có default 0 nên cả hai đều ngoài reqCols → phải ép tay.
    loyalty_ledger: {
      expires_at: { val: () => new Date(Date.UTC(2099, 0, 1)) },
      remaining: { val: () => 1 },
    },
    // check `attendance_ngoai_vung_phai_co_ly_do` (migration #166): cờ ngoài vùng
    // do TRIGGER tự đặt từ `distance_m`, và distance_m NULL bị coi là ngoài vùng
    // (không đo được vị trí ⇒ không xác nhận được là đang ở tiệm). Ép cả khoảng
    // cách trong bán kính lẫn lý do — lý do luôn hợp lệ nên seed không phụ thuộc
    // vào ngưỡng bán kính có đổi về sau hay không.
    attendance_punches: {
      distance_m: { val: () => 50 },
      reason: { val: () => "seed rls-smoke" },
    },
    // #225 (migration #235): employee_face.descriptor là double precision[] có
    // check `array_length = 128`. byType() không có nhánh mảng ⇒ rơi về chuỗi
    // ngẫu nhiên ⇒ "malformed array literal" khi seed, khiến bHas=0 và ca
    // "A đọc rows tenant B = 0" FAIL (đòi B có dòng thật). Ép đúng 128 số.
    // (attendance_proxy_punches KHÔNG cần ép: punch_id chase FK qua
    // attendance_punches, helper_user_id khớp mẫu *_user_id, phần còn lại
    // nullable/mặc định.)
    employee_face: {
      descriptor: { val: () => Array.from({ length: 128 }, () => 0) },
    },
    // FK `requested_by` → auth.users NOT NULL. byType() sinh uuid ngẫu nhiên nên
    // không có người thật nào ứng với nó. `ref` chỉ đi tới bảng trong public nên
    // dùng thẳng uB — người của tiệm B, đúng chủ thể đang được seed.
    discount_approvals: { requested_by: { val: () => uB } },
    // check `timesheets_period_check` (migration #166): kỳ là NGÀY 1 của tháng,
    // cùng khuôn `source_costs.month` / `kpi_targets.month` ở trên.
    timesheets: {
      period: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
    },
    payroll_periods: {
      period: { val: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
    },
    // check `webhook_endpoints_co_su_kien` (migration #160): phải khai ít nhất
    // một loại sự kiện. Cột kiểu mảng (_text) — byType() không có nhánh mảng nên
    // rơi về chuỗi ngẫu nhiên ⇒ "malformed array literal", cùng bẫy đã dính ở
    // `bulk_operations.target_ids`.
    // check `url ~ '^https://'` (migration #160): rnd() sinh chuỗi trơ.
    webhook_endpoints: {
      event_types: { val: () => ["contact.created"] },
      url: { val: () => "https://smoke.invalid/hook" },
    },
    // check `payslip_lines_co_goc` (migration #167): mọi dòng tiền phải có gốc.
    // Đường 'manual' là đường duy nhất không cần gốc máy, đổi lại BẮT BUỘC có
    // nhãn giải thích và người ghi — chọn nó vì không phải dựng thêm bảng nguồn.
    payslip_lines: {
      source_type: { val: () => "manual" },
      label: { val: () => "seed rls-smoke" },
      created_by: { val: () => uB },
    },
    // check `task_blocks_khong_tu_chan` (migration #168): việc không tự chặn
    // chính nó. refCache giữ ĐÚNG MỘT dòng cho mỗi bảng, nên `blocker_id` và
    // `blocked_id` cùng chase tới `activities` sẽ nhận CÙNG một việc. Phải có
    // một việc thứ hai — mồi sẵn ngay dưới, cùng cách đã dùng cho `items`.
    task_blocks: { blocked_id: { val: () => actPhuB.id } },
    // Trigger của `campaign_send_recipients` (migration #171) chặn người CHƯA
    // ĐỒNG Ý nhận tin. Không sửa được bằng cột của chính bảng đó — phải sửa ở
    // người được trỏ tới. Đặt đồng ý ngay trên `contacts` để mọi FK chase tới
    // đó đều lấy một người hợp lệ. Không làm yếu phép kiểm cách ly: bộ này đo
    // "tiệm A có đọc/ghi được dữ liệu tiệm B không", đồng ý nhận tin không
    // đụng tới câu hỏi đó.
    contacts: {
      marketing_consent: { val: () => "granted" },
      marketing_consent_at: { val: () => new Date() },
    },
  };
  const rnd = () => "smk" + Math.random().toString(36).slice(2, 10);
  const byType = (typ) => {
    if (typ === "uuid") return randomUUID();
    if (/^(int|numeric|float)/.test(typ)) return 1;
    if (typ === "bool") return false;
    if (/json/.test(typ)) return "{}";
    if (/^(timestamp|date)/.test(typ)) return new Date();
    return rnd(); // text, citext, varchar…
  };

  const refCache = new Map(); // bảng -> 1 row của tenant B (đã tồn tại hoặc vừa seed)
  // item_variants CHỈ gắn được vào item kind=product (trigger item_variants_kind_guard,
  // migration #125) — nhưng ensureRef('items') mặc định nhặt DÒNG ĐẦU TIÊN có sẵn của
  // tenant B, toàn kind=service (seed từ apply_industry_pack('spa') ở trên), khiến
  // item_variants seed thất bại. Mồi sẵn CACHE bằng MỘT item kind=product THẬT trước
  // khi vòng lặp generic bắt đầu — mọi FK chase tới 'items' dùng ĐÚNG dòng này, không
  // đụng tới các item kind=service đã seed (bắt được lúc nghiệm thu D3 V3, task #144).
  const { rows: [productItemB] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','Sản phẩm mồi generic','cái',0,'active') returning *`,
    [tB.id]);
  refCache.set("items", productItemB);
  const { rows: [actPhu] } = await c.query(
    `insert into public.activities (tenant_id, type, subject, owner_id, contact_id)
       values ($1,'task','Việc mồi generic (đầu bị chặn)',$2,
               (select id from public.contacts where tenant_id = $1 limit 1)) returning *`,
    [tB.id, uB]);
  actPhuB = actPhu;
  // `campaign_send_recipients` có trigger chặn người CHƯA ĐỒNG Ý nhận tin
  // (migration #171). ensureRef nhặt DÒNG ĐẦU của bảng, mà khách seed từ gói
  // ngành đều ở mặc định an toàn 'unknown' ⇒ seed hỏng. Mồi sẵn MỘT khách đã
  // đồng ý, cùng cách đã dùng cho `items`. Không nới lỏng phép kiểm: bộ này đo
  // "tiệm A có với sang dữ liệu tiệm B không", đồng ý nhận tin nằm ngoài câu đó.
  const { rows: [contactDongY] } = await c.query(
    `insert into public.contacts (tenant_id, full_name, marketing_consent, marketing_consent_at)
       values ($1,'Khách mồi generic (đã đồng ý)','granted', now()) returning *`,
    [tB.id]);
  refCache.set("contacts", contactDongY);
  async function ensureRef(table, depth) {
    if (refCache.has(table)) return refCache.get(table);
    if (depth > 5) throw new Error("chuỗi FK quá sâu: " + table);
    const ex = await c.query(`select * from public.${table} where tenant_id = $1 limit 1`, [tB.id]);
    if (ex.rowCount) { refCache.set(table, ex.rows[0]); return ex.rows[0]; }
    const row = await insertGeneric(table, tB.id, uB, depth + 1);
    refCache.set(table, row);
    return row;
  }
  async function insertGeneric(table, tenantId, userId, depth = 0) {
    const spec = new Map(required[table].map((r) => [r.col, r.typ]));
    for (const col of Object.keys(extras[table] ?? {})) if (!spec.has(col)) spec.set(col, null);
    if (!spec.has("tenant_id")) spec.set("tenant_id", "uuid"); // vd webhook_events: tenant_id nullable
    const cols = [], vals = [];
    for (const [col, typ] of spec) {
      let v;
      const ex = extras[table]?.[col];
      if (col === "tenant_id") v = tenantId;
      else if (ex?.val) v = ex.val();
      else if (ex?.ref) v = (await ensureRef(ex.ref, depth + 1)).id;
      else if (fkOf[`${table}.${col}`]) { const f = fkOf[`${table}.${col}`]; v = (await ensureRef(f.ft, depth + 1))[f.fc]; }
      else if (enumOf[`${table}.${col}`] !== undefined) v = enumOf[`${table}.${col}`];
      else if (/(^|_)(user_id|owner_id|actor_id|actor_user_id|assigned_to|created_by|invited_by)$/.test(col)) v = userId;
      else v = byType(typ ?? "text");
      cols.push(col); vals.push(v);
    }
    const ph = cols.map((_, i) => "$" + (i + 1)).join(",");
    const { rows: [row] } = await c.query(
      `insert into public.${table} (${cols.join(",")}) values (${ph}) returning *`, vals);
    return row;
  }

  // Seed 1 dòng tenant B mỗi bảng bằng quyền postgres (như backend thật); lỗi seed KHÔNG bỏ qua im lặng
  const seedErr = {};
  for (const t of genericTables) {
    const before = new Set(refCache.keys());
    await c.query("savepoint sp_seed_g");
    try { await ensureRef(t, 0); }
    catch (err) {
      seedErr[t] = err.message;
      await c.query("rollback to savepoint sp_seed_g");
      for (const k of refCache.keys()) if (!before.has(k)) refCache.delete(k);
    }
  }
  const bHas = {};
  for (const t of genericTables) {
    const r = await c.query(`select count(*)::int as n from public.${t} where tenant_id = $1`, [tB.id]);
    bHas[t] = r.rows[0].n;
  }

  console.log("[rls-smoke] Ngày mặc định phải theo giờ Việt Nam (migration #213):");
  {
    // Máy chủ CSDL chạy UTC. `CURRENT_DATE` vì thế trả về HÔM QUA suốt khung
    // 00:00–06:59 giờ VN — 7 tiếng trong 24 tiếng. Đo lúc viết ca này:
    // current_date = 2026-08-19 trong khi ngày ở VN đã là 2026-08-20.
    //
    // Ca này canh CẢ LỚP, không canh từng cột: nó tự quét mọi cột kiểu `date`
    // có mặc định, nên cột NÀO THÊM SAU cũng tự động được phủ. Đây là điểm khác
    // giữa "vá 5 chỗ" và "để lại cổng" — bài học lặp đi lặp lại của kho này:
    // đợt rà nào làm một lần rồi thôi thì mảng dựng sau nó bắt đầu lại từ số 0.
    const { rows: cotNgay } = await c.query(`
      select c.table_name || '.' || c.column_name as cot, c.column_default as md
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public'
        and c.data_type = 'date'
        and c.column_default is not null
        and c.column_default !~* 'ho_chi_minh'
      order by 1`);
    check(
      "Không cột ngày nào lấy mặc định theo giờ quốc tế",
      cotNgay.length === 0,
      `còn ${cotNgay.length} cột: ${cotNgay.map((r) => `${r.cot} = ${r.md}`).join(" · ")}` +
        " — dùng ((now() at time zone 'Asia/Ho_Chi_Minh'))::date");
  }

  console.log("[rls-smoke] V5 Hợp đồng & Gói định kỳ (ADR-0022, migration #204 + việc #193):");
  {
    // VÌ SAO KHỐI NÀY TỒN TẠI, ghi ra vì nó là bài học đắt nhất về cổng kiểm:
    // mảng Hợp đồng ra bản thật từ lâu nhưng **chưa chạy được một ngày nào** —
    // mã ghi quên truyền `tenant_id` nên CSDL từ chối MỌI lần ghi. Bằng chứng
    // độc lập đo 20/08: `service_packages` 0 dòng · `contracts` 0 dòng ·
    // `contract_sessions` 0 dòng trên toàn hệ thống, sau nhiều tuần chạy.
    //
    // Suốt thời gian đó `rls-smoke` XANH — vì nó **không có một phép nào** cho
    // mảng này. Cổng chỉ canh được thứ nó biết là phải tồn tại; một mảng không
    // ai viết ca cho thì cổng không phân biệt được "chạy tốt" với "chết hẳn".
    // Đúng hình dạng đã ghi ở việc #174 (cổng thẻ design xanh trong khi 4 màn
    // mới không có thẻ). Nên 13 ca dưới đây là để mảng này không im lặng chết
    // lần thứ hai.
    //
    // Người dùng khi đó nhận câu "bạn không có quyền" — SAI HƯỚNG HOÀN TOÀN, và
    // đó không phải lỗi diễn đạt mà là hệ quả của thứ tự Postgres xét ràng
    // buộc: `with check` của RLS chạy TRƯỚC not-null, nên thiếu `tenant_id` nổi
    // lên thành **42501 "row-level security"** chứ không phải 23502. Ca B2 dưới
    // đây ghim đúng mã lỗi đó lại — nếu ngày nào Postgres/PostgREST đổi thứ tự
    // này thì ca sẽ đỏ và người đọc biết ngay chú thích trong
    // `app/app/contracts/actions.ts` cần viết lại.
    const uHdO = randomUUID(), uHdS = randomUUID(), uHdV = randomUUID(), uHdX = randomUUID();
    await c.query(
      `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6),($7,'authenticated','authenticated',$8)`,
      [uHdO, `hd-o-${stamp}@t.local`, uHdS, `hd-s-${stamp}@t.local`,
       uHdV, `hd-v-${stamp}@t.local`, uHdX, `hd-x-${stamp}@t.local`]);
    const { rows: [tHd] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke HĐ', $1, true) returning id`,
      [`smoke-hd-${stamp}`]);
    const { rows: [tHdLa] } = await c.query(
      `insert into public.tenants (name, slug, is_sample) values ('Smoke HĐ tiệm lạ', $1, true) returning id`,
      [`smoke-hd-la-${stamp}`]);
    await c.query(
      `insert into public.tenant_members (tenant_id, user_id, role) values
       ($1,$2,'owner'),($1,$3,'staff'),($1,$4,'viewer'),($5,$6,'owner')`,
      [tHd.id, uHdO, uHdS, uHdV, tHdLa.id, uHdX]);
    const { rows: [kHd] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Khách hợp đồng') returning id`, [tHd.id]);

    const HD_OWNER = { tenant_id: tHd.id, role: "owner" };
    const HD_STAFF = { tenant_id: tHd.id, role: "staff" };
    const HD_VIEWER = { tenant_id: tHd.id, role: "viewer" };

    // Bọc một câu ghi để lấy được LỖI thay vì làm sập cả giao dịch. Mỗi lần một
    // savepoint tên riêng — cùng lý do đã ghi ở asUser(): tên trùng thì
    // `rollback to savepoint` nhắm vào bản gần nhất, không phải bản mình muốn.
    let hdSeq = 0;
    async function thuGhi(sql, params) {
      const sp = `sp_hd_${++hdSeq}`;
      await c.query(`savepoint ${sp}`);
      try {
        const r = await c.query(sql, params);
        await c.query(`release savepoint ${sp}`);
        return { ok: true, rows: r.rows, rowCount: r.rowCount };
      } catch (err) {
        await c.query(`rollback to savepoint ${sp}`);
        return { ok: false, code: err.code, msg: err.message };
      }
    }

    // ── A. Đường bình thường: ba bước bán một gói buổi ──
    let goiId = null, hdId = null;
    await asUser(uHdO, HD_OWNER, async () => {
      const r = await thuGhi(
        `insert into public.service_packages
           (tenant_id, name, sessions_total, validity_days, price_vnd, created_by)
         values ($1,'Gói 10 buổi',10,30,5000000,$2) returning id`, [tHd.id, uHdO]);
      check("HĐ A1 chủ tiệm tạo GÓI dịch vụ", r.ok, `${r.code} ${r.msg}`);
      if (r.ok) goiId = r.rows[0].id;
    });
    // asUser() rollback về savepoint của nó nên dòng vừa ghi biến mất. Ghi lại
    // bằng quyền postgres (như backend thật) để các ca sau có dữ liệu chung.
    if (goiId) {
      await c.query(
        `insert into public.service_packages
           (id, tenant_id, name, sessions_total, validity_days, price_vnd, created_by)
         values ($1,$2,'Gói 10 buổi',10,30,5000000,$3)`, [goiId, tHd.id, uHdO]);
    }

    await asUser(uHdO, HD_OWNER, async () => {
      const r = await thuGhi(
        `insert into public.contracts
           (tenant_id, contact_id, package_id, sessions_total, starts_at, expires_at,
            price_paid_vnd, payment_method, created_by)
         values ($1,$2,$3,10,current_date,current_date+30,5000000,'cash',$4) returning id`,
        [tHd.id, kHd.id, goiId, uHdO]);
      check("HĐ A2 chủ tiệm tạo HỢP ĐỒNG", r.ok, `${r.code} ${r.msg}`);
      if (r.ok) hdId = r.rows[0].id;
    });
    if (hdId) {
      await c.query(
        `insert into public.contracts
           (id, tenant_id, contact_id, package_id, sessions_total, starts_at, expires_at,
            price_paid_vnd, payment_method, created_by)
         values ($1,$2,$3,$4,10,current_date,current_date+30,5000000,'cash',$5)`,
        [hdId, tHd.id, kHd.id, goiId, uHdO]);
    }

    // Nhân viên thường PHẢI đổi được buổi cho khách — đây là thao tác hằng ngày
    // của lễ tân, không phải việc của chủ tiệm. `contract_sessions` mở cho mọi
    // vai đúng vì lý do đó.
    await asUser(uHdS, HD_STAFF, async () => {
      const r = await thuGhi(
        `insert into public.contract_sessions (tenant_id, contract_id, note, recorded_by)
         values ($1,$2,'buổi 1',$3)`, [tHd.id, hdId, uHdS]);
      check("HĐ A3 NHÂN VIÊN ghi một buổi cho khách", r.ok, `${r.code} ${r.msg}`);
      const { rows } = await c.query(`select sessions_used from public.contracts where id=$1`, [hdId]);
      check("HĐ A4 số buổi đã dùng lên 1", Number(rows[0]?.sessions_used) === 1,
        `sessions_used=${rows[0]?.sessions_used}`);
    });

    // ── B. Cái bẫy tenant_id, đã dính ba lần trong kho này ──
    await asUser(uHdO, HD_OWNER, async () => {
      const r = await thuGhi(
        `insert into public.service_packages (name, sessions_total, price_vnd, created_by)
         values ('Thiếu tenant',5,100000,$1)`, [uHdO]);
      check("HĐ B1 thiếu tenant_id thì BỊ CHẶN", !r.ok, "lọt — SAI");
      check("HĐ B2 và mã lỗi là 42501, KHÔNG phải 23502", r.code === "42501", `mã thật: ${r.code}`);
    });

    // ── C. Ba chốt trigger. `contract_expired` là chốt mới của migration #204 ──
    await c.query(`update public.contracts set sessions_used=10 where id=$1`, [hdId]);
    await asUser(uHdS, HD_STAFF, async () => {
      const r = await thuGhi(
        `insert into public.contract_sessions (tenant_id, contract_id, recorded_by) values ($1,$2,$3)`,
        [tHd.id, hdId, uHdS]);
      check("HĐ C1 dùng hết buổi thì CHẶN (contract_full)",
        !r.ok && /contract_full/i.test(r.msg || ""), `${r.code} ${r.msg}`);
    });
    await c.query(`update public.contracts set sessions_used=0, status='cancelled' where id=$1`, [hdId]);
    await asUser(uHdS, HD_STAFF, async () => {
      const r = await thuGhi(
        `insert into public.contract_sessions (tenant_id, contract_id, recorded_by) values ($1,$2,$3)`,
        [tHd.id, hdId, uHdS]);
      check("HĐ C2 hợp đồng ĐÃ HUỶ thì CHẶN (contract_cancelled)",
        !r.ok && /contract_cancelled/i.test(r.msg || ""), `${r.code} ${r.msg}`);
    });
    await c.query(`update public.contracts set status='active', expires_at=current_date-1 where id=$1`, [hdId]);
    await asUser(uHdS, HD_STAFF, async () => {
      const r = await thuGhi(
        `insert into public.contract_sessions (tenant_id, contract_id, recorded_by) values ($1,$2,$3)`,
        [tHd.id, hdId, uHdS]);
      check("HĐ C3 hợp đồng HẾT HẠN thì CHẶN (contract_expired)",
        !r.ok && /contract_expired/i.test(r.msg || ""), `${r.code} ${r.msg}`);
    });
    await c.query(`update public.contracts set expires_at=current_date+30 where id=$1`, [hdId]);

    // ── D. 0 dòng lặng lẽ = màn báo "Đã lưu trữ" trong khi gói còn nguyên ──
    // Ba ca này là ĐỐI CHỨNG cho nhau: nếu chỉ đo hai vai bị chặn mà không đo
    // vai được phép, một policy siết quá tay sẽ vẫn xanh.
    for (const [uid, cl, ten, duocSua] of [
      [uHdO, HD_OWNER, "chủ tiệm", true],
      [uHdS, HD_STAFF, "nhân viên", false],
      [uHdV, HD_VIEWER, "chỉ xem", false],
    ]) {
      await asUser(uid, cl, async () => {
        const u = await c.query(
          `update public.service_packages set status='archived' where id=$1 returning id`, [goiId]);
        check(`HĐ D ${ten} lưu trữ gói ${duocSua ? "ĐƯỢC" : "= 0 dòng"}`,
          duocSua ? u.rowCount === 1 : u.rowCount === 0, `rowCount=${u.rowCount}`);
      });
    }

    // ── E. Chéo tiệm. Hai chiều ĐỌC đã được quét generic phủ (cả ba bảng đều có
    // tenant_id + RLS bật); chiều GHI thì generic chỉ thử insert "trơn", không
    // thử insert TRỎ VÀO hợp đồng của tiệm khác — nên ca này viết tay.
    await asUser(uHdX, { tenant_id: tHdLa.id, role: "owner" }, async () => {
      const r = await thuGhi(
        `insert into public.contract_sessions (tenant_id, contract_id, recorded_by) values ($1,$2,$3)`,
        [tHdLa.id, hdId, uHdX]);
      check("HĐ E tiệm LẠ ghi buổi vào hợp đồng tiệm này BỊ CHẶN", !r.ok, "LỌT — rò rỉ ghi chéo tiệm");
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // TỆP ĐÍNH KÈM phải bám theo quyền của HỒ SƠ nó treo vào (migration #217)
  // ══════════════════════════════════════════════════════════════════
  // Quét generic KHÔNG phủ được ca này: `attachments` có `tenant_id` + RLS bật
  // nên generic thấy "chéo tiệm sạch" và cho qua. Lỗ nằm ở tầng khác — GIỮA CÁC
  // VAI TRONG CÙNG MỘT TIỆM. Đo được 20/08 trên dữ liệu thật: một nhân viên
  // không được giao phụ trách gì đọc 0/776 khách nhưng vẫn liệt kê và tải được
  // 5/5 tệp của tiệm, gồm ảnh trong hồ sơ khách họ không mở nổi.
  //
  // Hai ca ĐỐI CHỨNG (thấy tệp khách MÌNH phụ trách, và vẫn thấy logo tiệm) là
  // phần quan trọng nhất: siết quá tay thì màn đính kèm chết mà cổng vẫn xanh —
  // "chặn hết" luôn qua được một bộ kiểm chỉ đo chiều cấm.
  {
    const { rows: [kMinh] } = await c.query(
      `insert into public.contacts (tenant_id, full_name, owner_id) values ($1,$2,$3) returning id`,
      [tA.id, `Khách của NV1 ${stamp}`, uS1]);
    const { rows: [kNguoiKhac] } = await c.query(
      `insert into public.contacts (tenant_id, full_name, owner_id) values ($1,$2,$3) returning id`,
      [tA.id, `Khách của NV2 ${stamp}`, uS2]);
    await c.query(
      `insert into public.attachments (tenant_id, entity_type, entity_id, path) values
         ($1,'contact',$2,$4), ($1,'contact',$3,$5), ($1,'tenant',$1,$6)`,
      [tA.id, kMinh.id, kNguoiKhac.id,
       `smoke/${stamp}/cua-nv1.jpg`, `smoke/${stamp}/cua-nv2.jpg`, `smoke/${stamp}/logo-tiem.png`]);

    const demTep = async (dieuKien, tham = []) =>
      (await c.query(`select count(*)::int n from public.attachments where ${dieuKien}`, tham)).rows[0].n;

    await asUser(uS1, { tenant_id: tA.id, role: "staff" }, async () => {
      check("Tệp A — ĐỐI CHỨNG: nhân viên THẤY tệp của khách MÌNH phụ trách",
        (await demTep(`entity_type='contact' and entity_id=$1`, [kMinh.id])) === 1);
      check("Tệp B — nhân viên KHÔNG thấy tệp của khách người khác phụ trách",
        (await demTep(`entity_type='contact' and entity_id=$1`, [kNguoiKhac.id])) === 0,
        "LỌT — rò tệp sang người không được xem hồ sơ gốc");
      check("Tệp C — ĐỐI CHỨNG: nhân viên VẪN thấy tệp của chung tiệm (logo)",
        (await demTep(`entity_type='tenant' and tenant_id=$1`, [tA.id])) === 1,
        "siết quá tay — logo tiệm biến mất khỏi màn Cài đặt");
    });
    await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
      check("Tệp D — ĐỐI CHỨNG: chủ tiệm thấy CẢ HAI tệp khách",
        (await demTep(`entity_type='contact' and entity_id in ($1,$2)`, [kMinh.id, kNguoiKhac.id])) === 2);
    });
    await asUser(uC, { tenant_id: tA.id, role: "viewer" }, async () => {
      check("Tệp E — ĐỐI CHỨNG: vai Chỉ xem (đọc được cả tiệm) vẫn thấy cả hai",
        (await demTep(`entity_type='contact' and entity_id in ($1,$2)`, [kMinh.id, kNguoiKhac.id])) === 2);
    });
    await asUser(uB, { tenant_id: tB.id, role: "owner" }, async () => {
      check("Tệp F — tiệm KHÁC đọc tệp của tiệm này = 0 dòng",
        (await demTep(`tenant_id=$1`, [tA.id])) === 0, "rò chéo tiệm");
    });
  }

  await asUser(uA, { tenant_id: tA.id, role: "owner" }, async () => {
    for (const t of genericTables) {
      // (a) A không select được rows của B — chỉ có nghĩa khi B thực sự có dữ liệu (seed phải OK)
      //
      // Có một lớp bảng CHẶT HƠN RLS: `revoke all ... from authenticated` + không
      // policy nào, mọi đường vào đi qua RPC definer (vd storefront_lead_holds
      // #240 — giữ tên/SĐT người CHƯA thành khách). Bảng đó ném 42501 ngay ở
      // tầng quyền, chưa tới lượt RLS. Trước bản sửa này, một bảng như vậy làm
      // CẢ SUITE chết giữa chừng với "permission denied" — tức là siết bảo mật
      // chặt hơn lại làm hỏng cổng kiểm, đúng kiểu bẫy khiến người ta nới lỏng
      // ra cho "chạy được". Nay 42501 tính là ĐẠT: không đọc được thì càng tốt.
      let sel = null;
      let selErr = null;
      await c.query("savepoint sp_gen_sel");
      try {
        sel = await c.query(`select count(*)::int as n from public.${t} where tenant_id = $1`, [tB.id]);
      } catch (err) { selErr = err; }
      if (selErr) await c.query("rollback to savepoint sp_gen_sel");
      if (selErr?.code === "42501") {
        check(`${t}: A đọc rows tenant B = 0 (bảng thu hồi quyền — chỉ vào qua RPC)`, true);
      } else {
        check(`${t}: A đọc rows tenant B = 0`, !selErr && bHas[t] > 0 && sel.rows[0].n === 0,
          selErr ? `${selErr.code} ${selErr.message}`
            : seedErr[t] ? `seed B thất bại: ${seedErr[t]}`
            : `B có ${bHas[t]} dòng, A thấy ${sel.rows[0].n}`);
      }
      // (b) A không insert được row mang tenant_id của B (RLS with-check hoặc không có insert policy)
      let gErr = null;
      await c.query("savepoint sp_gen_ins");
      try { await insertGeneric(t, tB.id, uC); } catch (err) { gErr = err; }
      await c.query("rollback to savepoint sp_gen_ins");
      check(`${t}: A insert với tenant_id B bị chặn`, !!gErr, "insert THÀNH CÔNG — rò rỉ ghi chéo tenant!");
    }
  });
} catch (e) {
  // Việc #176: trước đây chỉ in e.message — có lần script chết giữa chừng mà
  // không rõ lỗi Postgres thật là gì, phải điều tra lại từ đầu. In thêm
  // code/detail/hint/where (pg trả kèm lỗi thật, vd code 55P03 = đang bị kẹt
  // khoá) để lần sau chẩn đoán ngay được, không phải đoán mò.
  console.error("[rls-smoke] LỖI:", e.message);
  if (e.code) console.error("  code:", e.code);
  if (e.detail) console.error("  detail:", e.detail);
  if (e.hint) console.error("  hint:", e.hint);
  if (e.where) console.error("  where:", e.where);
  failed++;
} finally {
  try { await c.query("rollback"); } catch {}
  await c.end();
}

if (failed) { console.error(`[rls-smoke] ${failed} kiểm tra FAIL`); process.exit(1); }
// Số ca CHẠY THẬT phải khớp số ca KHAI BÁO. Không có phép so này thì thêm/bớt ca
// mà quên cập nhật STATIC_CHECKS chỉ hiện ra dưới dạng "PASS 497/496" — một con số
// lệch giữa 500 dòng, không ai nhìn. Nguy hiểm hơn là chiều ngược lại: một khối ca
// bị `return`/`throw` sớm thì tổng HỤT, mọi ca sau đó không chạy, mà dòng cuối vẫn
// in "TẤT CẢ PASS" (đúng nỗi lo đã ghi ở ca #172). Bắt được 19/08 khi thêm ca csat.
if (nCheck !== mm) {
  console.error(`[rls-smoke] LỆCH SỐ CA: chạy ${nCheck}, khai báo ${mm}. ` +
    `Sửa STATIC_CHECKS (đang ${STATIC_CHECKS}) thành ${STATIC_CHECKS + (nCheck - mm)}, ` +
    `hoặc tìm khối ca thoát sớm nếu số chạy ÍT hơn.`);
  process.exit(1);
}
console.log("[rls-smoke] TẤT CẢ PASS — cách ly tenant hoạt động trên DB thật, không để lại dữ liệu.");
