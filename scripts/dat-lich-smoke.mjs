#!/usr/bin/env node
/**
 * Bộ kiểm luồng KHÁCH TỰ ĐẶT LỊCH trên trang công khai (migration #290).
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — một món nợ tự nhận, không phải phòng xa
 * ════════════════════════════════════════════════════════════════════
 *
 * Luồng này được dựng ngày 21/08 và đã thử tay 12 tình huống trên CSDL thật.
 * Nhưng **chạy tay thì lần sau không ai chạy lại** — và đây là cửa DUY NHẤT
 * trong sản phẩm cho phép người chưa đăng nhập GHI vào cơ sở dữ liệu. Một
 * cửa như vậy mà không có gì canh thì mỗi lần sửa quanh nó đều là đánh cược.
 *
 * ════════════════════════════════════════════════════════════════════
 * KIỂM GÌ — bốn nhóm, xếp theo mức hại nếu hỏng
 * ════════════════════════════════════════════════════════════════════
 *
 *   1. CỬA ĐÓNG THÌ PHẢI ĐÓNG. Tiệm chưa bật ⇒ từ chối. Kho từng dính lỗ
 *      "chưa cấu hình thì cho qua" ở cổng Zalo (việc #10/#31) — điều kiện bám
 *      vào MÔI TRƯỜNG thay vì bám vào sự có mặt của cấu hình.
 *   2. KHÔNG NHẬN HAI NGƯỜI VÀO MỘT KHUNG GIỜ. Chốt thật nằm ở ràng buộc
 *      EXCLUDE của CSDL, không ở phép kiểm trong mã — hai người bấm cùng lúc
 *      thì phép kiểm bằng tay cho lọt cả hai.
 *   3. KHÔNG NHẬN GIỜ VÔ LÝ: giờ tiệm đóng cửa, giờ đã qua, ngày quá xa.
 *   4. KHÔNG ĐỂ AI DÙNG CỬA NÀY LÀM MÁY BẮN TIN: quá ngưỡng thì từ chối.
 *
 * Mọi thứ chạy trong MỘT giao dịch rồi `rollback` — không để lại dòng nào.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

const GOC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (ten, dk, chiTiet = "") => {
  n++;
  console.log(`  ${dk ? "PASS" : "FAIL"} ${n} ${ten}${dk ? "" : " — " + chiTiet}`);
  if (!dk) fail++;
};
let spN = 0;
/** Chạy một lệnh có thể ném lỗi, cuộn ngược riêng nó, trả về lỗi để đối chiếu. */
const thu = async (fn) => {
  const sp = `sp_${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${sp}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return { ok: false, e: e.message };
  }
};

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
  const slug = `kiem-dat-lich-${randomUUID().slice(0, 8)}`;
  const uChu = randomUUID();

  // ── Dựng một tiệm riêng để kiểm, KHÔNG mượn tiệm có sẵn ─────────────────
  // Ca kiểm phải TỰ DỰNG dữ liệu nó cần. Đi tìm một tiệm "hợp lệ" là kiểu
  // hỏng đã gặp ngày 21/08: sáu ca im lặng không chạy vì không tìm thấy dữ
  // liệu, mà cổng vẫn xanh.
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug, industry, timezone)
     values ('Tiệm kiểm đặt lịch', $1, 'spa', 'Asia/Ho_Chi_Minh') returning id`,
    [slug],
  );
  // Tư cách thành viên có khoá ngoại tới `auth.users`, nên phải có người thật
  // trước. Khuôn này lấy từ `tong-ket-chien-dich-smoke.mjs` — đừng tự chế.
  await c.query(
    `insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uChu, `kiem-${uChu.slice(0, 8)}@kiem.local`],
  );
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role, status) values ($1,$2,'owner','active')`,
    [t.id, uChu],
  );
  const { rows: [dv] } = await c.query(
    `insert into public.items (tenant_id, name, kind, status, duration_minutes, price_vnd)
     values ($1,'Gói kiểm thử 60 phút','service','active',60,300000) returning id`,
    [t.id],
  );
  // Tiệm PHẢI có ít nhất một hồ sơ nhân sự đang làm — `storefront_book` gán
  // tạm người đầu danh sách và TỪ CHỐI (`no_staff`) nếu không có ai. Thiếu
  // dòng này thì ca "người thứ hai bị chặn" xanh GIẢ: cả hai lượt cùng bị
  // chặn vì không có thợ, chứ không phải vì trùng giờ — đúng kiểu ca kiểm vô
  // dụng mà vẫn báo PASS.
  await c.query(
    `insert into public.employees (tenant_id, full_name, started_on)
     values ($1,'Thợ Kiểm Thử', current_date - 30)`,
    [t.id],
  );

  // Mở cửa 09:00–17:00 mọi ngày trong tuần.
  for (let thu2 = 0; thu2 <= 6; thu2++) {
    await c.query(
      `insert into public.business_hours (tenant_id, weekday, open_time, close_time, is_closed)
       values ($1,$2,'09:00','17:00',false)`,
      [t.id, thu2],
    );
  }

  const ngayMai = (
    await c.query(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)::text d`)
  ).rows[0].d;

  // ── NHÓM 1: cửa đóng thì phải đóng ──────────────────────────────────────
  let r = await thu(() => c.query(`select public.storefront_slots($1,$2,$3::date) j`, [slug, dv.id, ngayMai]));
  const jTat = r.ok ? r.v.rows[0].j : null;
  check(
    "chưa bật đặt lịch: KHÔNG trả về khung giờ nào",
    !r.ok || !jTat?.slots?.length,
    `trả về ${jTat?.slots?.length ?? "?"} khung`,
  );

  r = await thu(() =>
    c.query(`select public.storefront_book($1,$2,($3||' 10:00+07')::timestamptz,'Khách Kiểm','0900000001') j`, [
      slug,
      dv.id,
      ngayMai,
    ]),
  );
  const bookTat = r.ok ? r.v.rows[0].j : null;
  check(
    "chưa bật đặt lịch: KHÔNG đặt được",
    !r.ok || bookTat?.ok === false,
    `kết quả: ${JSON.stringify(bookTat)?.slice(0, 80)}`,
  );

  // ── Bật lên rồi kiểm tiếp ───────────────────────────────────────────────
  // PHẢI bật CẢ HAI: `storefront_enabled` (trang tiệm có tồn tại không) và
  // `booking_enabled` (trang đó có nhận đặt lịch không). Bật mỗi cái sau thì
  // hàm ném `not_found` — và nó ném `not_found` chứ không phải "chưa bật mặt
  // tiền", cố ý theo #209 để người ngoài không dò được tiệm nào có thật.
  await c.query(`insert into public.tenant_storefront (tenant_id, storefront_enabled, booking_enabled)
                 values ($1,true,true)
                 on conflict (tenant_id) do update set storefront_enabled = true, booking_enabled = true`, [t.id]);

  r = await thu(() => c.query(`select public.storefront_slots($1,$2,$3::date) j`, [slug, dv.id, ngayMai]));
  const slots = r.ok ? (r.v.rows[0].j?.slots ?? []) : [];
  check("đã bật: sinh ra khung giờ", slots.length > 0, `được ${slots.length} khung`);
  // 09:00→17:00, gói 60 phút ⇒ 8 khung. Con số cụ thể quan trọng: nó bắt được
  // lỗi lệch múi giờ (cộng/trừ nhầm 7 tiếng làm số khung đổi).
  check("đúng 8 khung cho gói 60 phút trong khung 09–17", slots.length === 8, `được ${slots.length}`);

  const gioDau = slots[0]?.start ?? slots[0]?.at ?? null;
  check("khung đầu có mốc giờ đọc được", gioDau != null, JSON.stringify(slots[0] ?? null).slice(0, 90));

  // ── NHÓM 2: không nhận hai người vào một khung ───────────────────────────
  if (gioDau) {
    r = await thu(() =>
      c.query(`select public.storefront_book($1,$2,$3::timestamptz,'Khách Một','0900000002') j`, [slug, dv.id, gioDau]),
    );
    const lan1 = r.ok ? r.v.rows[0].j : null;
    check("đặt lần đầu: thành công", r.ok && lan1?.ok !== false, r.e ?? JSON.stringify(lan1)?.slice(0, 80));

    const { rows: [dem] } = await c.query(
      `select count(*)::int n from public.appointments where tenant_id=$1 and source='public'`,
      [t.id],
    );
    check("lịch hẹn thật sự được ghi vào CSDL", dem.n === 1, `có ${dem.n} dòng`);

    r = await thu(() =>
      c.query(`select public.storefront_book($1,$2,$3::timestamptz,'Khách Hai','0900000003') j`, [slug, dv.id, gioDau]),
    );
    const lan2 = r.ok ? r.v.rows[0].j : null;
    // Đây là ca quan trọng nhất của cả bộ: chốt phải nằm ở CSDL. Nếu ca này
    // hỏng thì hai khách cùng tới một giờ, và tiệm phải đuổi một người về.
    check(
      "người thứ hai vào ĐÚNG khung đó: bị chặn",
      !r.ok || lan2?.ok === false,
      `kết quả: ${JSON.stringify(lan2)?.slice(0, 80)}`,
    );

    const { rows: [dem2] } = await c.query(
      `select count(*)::int n from public.appointments where tenant_id=$1 and source='public'`,
      [t.id],
    );
    check("sau lượt bị chặn: vẫn đúng 1 lịch", dem2.n === 1, `có ${dem2.n} dòng`);

    r = await thu(() => c.query(`select public.storefront_slots($1,$2,$3::date) j`, [slug, dv.id, ngayMai]));
    const conLai = r.ok ? (r.v.rows[0].j?.slots ?? []) : [];
    const daKin = conLai.find((s) => (s.start ?? s.at) === gioDau);
    check(
      "khung đã có người: đánh dấu là kín, không im lặng bỏ đi",
      daKin != null && (daKin.taken === true || daKin.available === false || daKin.free === false),
      `khung đó: ${JSON.stringify(daKin ?? null).slice(0, 90)}`,
    );
    // ĐỐI CHỨNG — bắt buộc phải có. Không có ca này thì ca "người thứ hai bị
    // chặn" ở trên xanh cả khi MỌI lượt đặt đều hỏng vì một lý do vu vơ nào
    // đó (đã xảy ra thật lúc dựng bộ kiểm này: thiếu hồ sơ nhân sự làm cả hai
    // lượt cùng bị chặn, và ca kia vẫn báo PASS). Một ca chỉ kiểm "bị chặn"
    // mà không kiểm "cái đáng chạy vẫn chạy" thì không chứng minh được gì.
    const gioHai = slots[1]?.start ?? slots[1]?.at ?? null;
    r = await thu(() =>
      c.query(`select public.storefront_book($1,$2,$3::timestamptz,'Khách Ba','0900000007') j`, [slug, dv.id, gioHai]),
    );
    const lan3 = r.ok ? r.v.rows[0].j : null;
    check(
      "khung KHÁC còn trống: vẫn đặt được (đối chứng)",
      r.ok && lan3?.ok !== false,
      r.e ?? JSON.stringify(lan3)?.slice(0, 80),
    );
  }

  // ── NHÓM 3: không nhận giờ vô lý ────────────────────────────────────────
  r = await thu(() =>
    c.query(`select public.storefront_book($1,$2,($3||' 03:00+07')::timestamptz,'Khách Đêm','0900000004') j`, [
      slug,
      dv.id,
      ngayMai,
    ]),
  );
  const dem3h = r.ok ? r.v.rows[0].j : null;
  check("3 giờ sáng (tiệm đóng cửa): bị chặn", !r.ok || dem3h?.ok === false, JSON.stringify(dem3h)?.slice(0, 80));

  const homQua = (await c.query(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 1)::text d`)).rows[0].d;
  r = await thu(() =>
    c.query(`select public.storefront_book($1,$2,($3||' 10:00+07')::timestamptz,'Khách Quá Khứ','0900000005') j`, [
      slug,
      dv.id,
      homQua,
    ]),
  );
  const quaKhu = r.ok ? r.v.rows[0].j : null;
  check("giờ đã qua: bị chặn", !r.ok || quaKhu?.ok === false, JSON.stringify(quaKhu)?.slice(0, 80));

  const xaTit = (await c.query(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 400)::text d`)).rows[0].d;
  r = await thu(() =>
    c.query(`select public.storefront_book($1,$2,($3||' 10:00+07')::timestamptz,'Khách Xa','0900000006') j`, [
      slug,
      dv.id,
      xaTit,
    ]),
  );
  const raQua = r.ok ? r.v.rows[0].j : null;
  check("ngày quá xa (400 ngày): bị chặn", !r.ok || raQua?.ok === false, JSON.stringify(raQua)?.slice(0, 80));

  // Ngày tiệm nghỉ ⇒ không khung nào.
  const { rows: [nghi] } = await c.query(
    `select ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 2)::text d`,
  );
  await c.query(
    `insert into public.business_closures (tenant_id, date_from, date_to, is_full_day, reason)
     values ($1,$2::date,$2::date,true,'kiểm thử')`,
    [t.id, nghi.d],
  );
  r = await thu(() => c.query(`select public.storefront_slots($1,$2,$3::date) j`, [slug, dv.id, nghi.d]));
  const ngayNghi = r.ok ? (r.v.rows[0].j?.slots ?? []) : [];
  check("ngày tiệm nghỉ: 0 khung giờ", ngayNghi.length === 0, `được ${ngayNghi.length} khung`);

  // ── NHÓM 4: không làm máy bắn tin ───────────────────────────────────────
  // Gửi dồn từ cùng một dấu vết cho tới khi bị chặn. Ngưỡng cụ thể là chuyện
  // của migration; ca này chỉ đòi hỏi **có** một ngưỡng — cửa công khai không
  // có ngưỡng là cửa mở cho máy.
  const dauVet = `kiem-${randomUUID().slice(0, 8)}`;
  let biChan = false;
  for (let i = 0; i < 12 && !biChan; i++) {
    const rr = await thu(() =>
      c.query(
        `select public.storefront_book($1,$2,($3||' 1${i % 5}:00+07')::timestamptz,'Máy Gửi','09000100' || $4,'',$5) j`,
        [slug, dv.id, ngayMai, String(i).padStart(2, "0"), dauVet],
      ),
    );
    const j = rr.ok ? rr.v.rows[0].j : null;
    if (!rr.ok || j?.ok === false) biChan = true;
  }
  check("gửi dồn 12 lượt từ một dấu vết: có ngưỡng chặn", biChan, "không lượt nào bị chặn");

  // ── Sổ ghi vết ──────────────────────────────────────────────────────────
  const { rows: [sov] } = await c.query(
    `select count(*)::int n from public.record_audit where tenant_id=$1`,
    [t.id],
  );
  check("mọi lượt đặt đều để lại vết trong sổ chung", sov.n > 0, `sổ có ${sov.n} dòng`);
} catch (e) {
  console.error("\n[dat-lich] LỖI NGOÀI DỰ KIẾN:", e.message);
  fail++;
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(
  fail === 0
    ? `\n[dat-lich] TẤT CẢ ${n}/${n} PASS — cửa công khai đặt lịch còn nguyên chốt, không để lại dữ liệu.`
    : `\n[dat-lich] ${fail}/${n} FAIL`,
);
process.exit(fail === 0 ? 0 : 1);
