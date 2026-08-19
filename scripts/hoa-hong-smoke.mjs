#!/usr/bin/env node
/**
 * Cổng chống tái phát cho HOA HỒNG SINH TỰ ĐỘNG (migration #180).
 *
 * Đây là chỗ trả tiền cho người: một lỗ ở đây là trả hai lần, trả cho người
 * không làm, hoặc trả rồi khách hoàn hàng mà không trừ lại.
 *
 * Sáu luật phải đứng vững, bộ này kiểm cả sáu:
 *   1. Chốt đơn HAI LẦN không nhân đôi tiền (chỉ mục duy nhất của #167).
 *   2. Tỉ lệ đúng theo LOẠI VIỆC — dịch vụ 8% · hàng hoá 5% · gói 3%.
 *   3. Phiếu hoàn TRỪ LẠI, và trừ về đúng người đã được hưởng (không phải
 *      người ngồi quầy hôm khách trả hàng).
 *   4. Không tra ra người làm thì KHÔNG sinh khoản — không rơi vào ai mặc định.
 *   5. Nhân viên đọc ĐÚNG phần của mình; quản lý đọc cả đội; tiệm khác không đọc.
 *   6. `commission_sinh_ky` chặn `staff`, và chạy lại không sinh thêm.
 *   7. ĐƠN CÓ GIẢM GIÁ hoàn hết hàng ⇒ hoa hồng về ĐÚNG 0, không âm.
 *      (Lỗ thật, vá ở #198: dòng phiếu hoàn có `qty` ÂM nhưng `discount_vnd`
 *      vẫn DƯƠNG, nên công thức chép tay `qty*đơn_giá − giảm_giá` ra số lớn
 *      hơn giá trị thật đúng HAI LẦN khoản giảm ⇒ nhân viên bị trừ quá tay và
 *      chủ tiệm đọc sai số tiền đã hoàn cho khách. Đo trước khi vá: hoàn
 *      2×1.000.000 giảm 400.000 ra −2.400.000 thay vì −1.600.000, hoa hồng
 *      −120.000 thay vì −80.000.)
 *
 * Chạy trong MỘT transaction rồi ROLLBACK — không để lại dữ liệu trên CSDL thật.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
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
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
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
const asUser = async (uid, claims, fn) => {
  await c.query(
    `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: claims })],
  );
  try {
    return await fn();
  } finally {
    await c.query(`select set_config('role','postgres',true)`);
  }
};

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
  const st = Date.now();
  const uTho = randomUUID(); // thợ làm dịch vụ
  const uThuNgan = randomUUID(); // người lập đơn / bán thêm
  const uNgoai = randomUUID(); // có tài khoản nhưng KHÔNG có hồ sơ nhân sự
  const uChu = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),
       ($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6),
       ($7,'authenticated','authenticated',$8)`,
    [
      uTho, `tho-${st}@t.local`,
      uThuNgan, `tn-${st}@t.local`,
      uNgoai, `ngoai-${st}@t.local`,
      uChu, `chu-${st}@t.local`,
    ],
  );

  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem hoa hong', $1) returning id`,
    ["hoa-hong-" + st],
  );
  const { rows: [t2] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem khac', $1) returning id`,
    ["hoa-hong-khac-" + st],
  );

  // ── Ca 1: tiệm mới TỰ CÓ bảng tỉ lệ (trigger seed) ──
  const { rows: rate } = await c.query(
    `select job_type, percent from public.commission_rates where tenant_id = $1 order by job_type`,
    [t.id],
  );
  check(
    "Tiệm mới tự có đủ 3 tỉ lệ mặc định của thẻ (8/5/3)",
    rate.length === 3 &&
      Number(rate.find((r) => r.job_type === "service").percent) === 8 &&
      Number(rate.find((r) => r.job_type === "product").percent) === 5 &&
      Number(rate.find((r) => r.job_type === "package").percent) === 3,
    JSON.stringify(rate),
  );

  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values
       ($1,$2,'staff'), ($1,$3,'staff'), ($1,$4,'owner')`,
    [t.id, uTho, uThuNgan, uChu],
  );
  const { rows: [eTho] } = await c.query(
    `insert into public.employees (tenant_id, user_id, full_name) values ($1,$2,'Tho lam') returning id`,
    [t.id, uTho],
  );
  const { rows: [eThuNgan] } = await c.query(
    `insert into public.employees (tenant_id, user_id, full_name) values ($1,$2,'Thu ngan') returning id`,
    [t.id, uThuNgan],
  );

  const { rows: [dv] } = await c.query(
    // `items_kind_fields_check` (#125): service PHẢI có duration_minutes và PHẢI trống unit.
    `insert into public.items (tenant_id, kind, name, duration_minutes, price_vnd, status)
       values ($1,'service','Goi dau',60,1000000,'active') returning id`,
    [t.id],
  );
  const { rows: [hh] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','Dau goi','chai',200000,'active') returning id`,
    [t.id],
  );
  const { rows: [kh] } = await c.query(
    `insert into public.contacts (tenant_id, full_name) values ($1,'Khach A') returning id`,
    [t.id],
  );

  // Ca làm của THỢ — đường tra người hưởng bậc (b) của migration #180.
  const { rows: [ca] } = await c.query(
    `insert into public.appointments (tenant_id, contact_id, staff_user_id, start_at, end_at, price_vnd)
       values ($1,$2,$3, now(), now() + interval '1 hour', 1000000) returning id`,
    [t.id, kh.id, uTho],
  );

  /** Đơn thường: 1 dòng dịch vụ gắn ca của thợ + 1 dòng hàng hoá (không gắn ca). */
  const moDon = async () => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status, created_by)
         values ($1,'order',$2,'draft',$3) returning id`,
      [t.id, kh.id, uThuNgan],
    );
    const { rows: [ldv] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, appointment_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,$4,1,1000000,0) returning id`,
      [t.id, o.id, dv.id, ca.id],
    );
    const { rows: [lhh] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,2,200000,0) returning id`,
      [t.id, o.id, hh.id],
    );
    return { orderId: o.id, ldv: ldv.id, lhh: lhh.id };
  };

  const don1 = await moDon();
  // Máy trạng thái (#207) bắt đi đúng đường draft→confirmed→completed;
  // bản cũ nhảy cóc từ nháp thẳng sang xong.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [don1.orderId]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [don1.orderId]);

  const dem = async (empId, orderId) => {
    const { rows } = await c.query(
      `select count(*)::int as n, coalesce(sum(amount_vnd),0)::bigint as tong
         from public.commission_entries where employee_id = $1 and order_id = $2`,
      [empId, orderId],
    );
    return { n: rows[0].n, tong: Number(rows[0].tong) };
  };

  // ── Ca 2: dịch vụ 8% về THỢ (qua ca làm), hàng hoá 5% về NGƯỜI LẬP ĐƠN ──
  const hhTho = await dem(eTho.id, don1.orderId);
  const hhTN = await dem(eThuNgan.id, don1.orderId);
  check(
    "Dòng dịch vụ 1.000.000 × 8% = 80.000 về THỢ làm ca (không về người lập đơn)",
    hhTho.n === 1 && hhTho.tong === 80000,
    JSON.stringify(hhTho),
  );
  check(
    "Dòng hàng hoá 400.000 × 5% = 20.000 về người lập đơn",
    hhTN.n === 1 && hhTN.tong === 20000,
    JSON.stringify(hhTN),
  );

  // ── Ca 3: chốt đơn HAI LẦN không nhân đôi tiền ──
  //
  // Bản cũ mô phỏng bằng cách LÙI `completed → confirmed` rồi chốt lại. Từ
  // migration #207, máy trạng thái ở CSDL CẤM mọi bước lùi — nên câu đó không
  // chạy được nữa, và đó là chốt ĐÚNG: lùi đơn đã xong rồi chốt lại chính là
  // đường sinh hoa hồng lần hai mà bộ kiểm này sinh ra để canh.
  //
  // Ý ĐỊNH của phép kiểm không đổi: "ghi `completed` thêm một lần nữa thì
  // hoa hồng có nhân đôi không". Nay diễn bằng đường HỢP LỆ — ghi lại đúng
  // trạng thái đang có (đường retry mạng, bấm nút hai lần) thay vì đi vòng
  // qua một bước lùi bị cấm.
  await c.query(`update public.orders set status = 'completed' where id = $1`, [don1.orderId]);
  const lai = await dem(eTho.id, don1.orderId);
  check(
    "Chốt lại lần 2 KHÔNG nhân đôi hoa hồng",
    lai.n === 1 && lai.tong === 80000,
    JSON.stringify(lai),
  );

  // Và gọi thẳng hàm sinh lần nữa cũng vậy (đường retry mạng / bấm nhầm nút).
  const { rows: [sinhLai] } = await c.query(
    `select public.commission_sinh_cho_don($1) as n`,
    [don1.orderId],
  );
  check("Gọi lại hàm sinh cho cùng đơn ⇒ 0 khoản mới", Number(sinhLai.n) === 0, `n=${sinhLai.n}`);

  // ── Ca 4: PHIẾU HOÀN trừ lại, và trừ về ĐÚNG NGƯỜI đã hưởng ──
  // Phiếu hoàn do CHỦ TIỆM xử (created_by khác đơn gốc) — tiền phải trừ vào
  // người của đơn GỐC, không phải người xử hoàn.
  const { rows: [ho] } = await c.query(
    `insert into public.orders (tenant_id, kind, parent_order_id, contact_id, status, created_by)
       values ($1,'return',$2,$3,'draft',$4) returning id`,
    [t.id, don1.orderId, kh.id, uChu],
  );
  await c.query(
    `insert into public.order_lines (tenant_id, order_id, item_id, appointment_id, qty, unit_price_vnd, discount_vnd)
       values ($1,$2,$3,$4,-1,1000000,0)`,
    [t.id, ho.id, dv.id, ca.id],
  );
  await c.query(
    `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
       values ($1,$2,$3,-2,200000,0)`,
    [t.id, ho.id, hh.id],
  );
  // Máy trạng thái (#207) bắt đi đúng đường draft→confirmed→completed;
  // bản cũ nhảy cóc từ nháp thẳng sang xong.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [ho.id]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [ho.id]);

  const hoanTho = await dem(eTho.id, ho.id);
  const hoanTN = await dem(eThuNgan.id, ho.id);
  const { rows: [hoanChu] } = await c.query(
    `select count(*)::int as n from public.commission_entries ce
       join public.employees e on e.id = ce.employee_id
      where ce.order_id = $1 and e.user_id = $2`,
    [ho.id, uChu],
  );
  check(
    "Phiếu hoàn TRỪ lại 80.000 của thợ (dấu âm)",
    hoanTho.n === 1 && hoanTho.tong === -80000,
    JSON.stringify(hoanTho),
  );
  check(
    "Phiếu hoàn TRỪ lại 20.000 của người bán, KHÔNG trừ người xử hoàn",
    hoanTN.n === 1 && hoanTN.tong === -20000 && hoanChu.n === 0,
    JSON.stringify({ hoanTN, chu: hoanChu.n }),
  );

  // ── Ca 4b: ĐƠN CÓ GIẢM GIÁ — hoàn hết hàng thì hoa hồng phải về ĐÚNG 0 ──
  // Luật 7 đầu file. Ca 4 ở trên chạy với giảm giá = 0 nên KHÔNG bắt được lỗ
  // này: sai số đúng bằng hai lần khoản giảm, mà khoản giảm bằng 0 thì sai số
  // cũng bằng 0. Ca này bắt buộc phải có giảm giá khác 0.
  const GIA = 1000000, SL = 2, GIAM = 400000;
  const DUNG = SL * GIA - GIAM; // 1.600.000 — giá trị THẬT của phần hàng này
  const { rows: [oGiam] } = await c.query(
    `insert into public.orders (tenant_id, kind, contact_id, status, created_by)
       values ($1,'order',$2,'draft',$3) returning id`,
    [t.id, kh.id, uThuNgan],
  );
  const { rows: [lGiam] } = await c.query(
    `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
       values ($1,$2,$3,$4,$5,$6) returning line_total_vnd`,
    [t.id, oGiam.id, hh.id, SL, GIA, GIAM],
  );
  // Máy trạng thái (#207) bắt đi đúng đường draft→confirmed→completed;
  // bản cũ nhảy cóc từ nháp thẳng sang xong.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [oGiam.id]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [oGiam.id]);

  // Phiếu hoàn TOÀN BỘ — chép giảm giá y như `createReturn` làm (tỷ lệ 1/1).
  const { rows: [hoGiam] } = await c.query(
    `insert into public.orders (tenant_id, kind, parent_order_id, contact_id, status, created_by)
       values ($1,'return',$2,$3,'draft',$4) returning id`,
    [t.id, oGiam.id, kh.id, uChu],
  );
  const { rows: [lHoan] } = await c.query(
    `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
       values ($1,$2,$3,$4,$5,$6) returning line_total_vnd`,
    [t.id, hoGiam.id, hh.id, -SL, GIA, GIAM],
  );
  // Máy trạng thái (#207) bắt đi đúng đường draft→confirmed→completed;
  // bản cũ nhảy cóc từ nháp thẳng sang xong.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [hoGiam.id]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [hoGiam.id]);

  check(
    "Dòng đơn bán có giảm giá: giá trị dòng = 1.600.000 (số cũ không đổi)",
    Number(lGiam.line_total_vnd) === DUNG,
    `line_total_vnd=${lGiam.line_total_vnd}`,
  );
  check(
    "Dòng PHIẾU HOÀN có giảm giá: −1.600.000 chứ KHÔNG phải −2.400.000",
    Number(lHoan.line_total_vnd) === -DUNG,
    `line_total_vnd=${lHoan.line_total_vnd} (sai kiểu cũ: ${-SL * GIA - GIAM})`,
  );

  // Tổng tiền phiếu hoàn — ĐÚNG con số chủ tiệm đọc trên màn hình đơn hàng và
  // trong file Excel xuất ra (cả hai đều đọc cột này từ #198).
  const { rows: [tongHoan] } = await c.query(
    `select coalesce(sum(line_total_vnd),0)::bigint as tong from public.order_lines where order_id = $1`,
    [hoGiam.id],
  );
  check(
    "Tổng tiền phiếu hoàn hiện trên màn hình = −1.600.000 (đúng số đã hoàn cho khách)",
    Number(tongHoan.tong) === -DUNG,
    `tong=${tongHoan.tong}`,
  );

  const hhBan = await dem(eThuNgan.id, oGiam.id);
  const hhTra = await dem(eThuNgan.id, hoGiam.id);
  check(
    "Hoa hồng đơn bán có giảm giá = 1.600.000 × 5% = 80.000",
    hhBan.n === 1 && hhBan.tong === Math.round((DUNG * 5) / 100),
    JSON.stringify(hhBan),
  );
  check(
    "Hoa hồng phiếu hoàn TRỪ đúng −80.000, không phải −120.000 (trừ quá tay)",
    hhTra.n === 1 && hhTra.tong === -Math.round((DUNG * 5) / 100),
    JSON.stringify(hhTra),
  );
  check(
    "Hoàn HẾT hàng ⇒ tổng hoa hồng về ĐÚNG 0, nhân viên không mất đồng nào",
    hhBan.tong + hhTra.tong === 0,
    `ban=${hhBan.tong} tra=${hhTra.tong} tong=${hhBan.tong + hhTra.tong}`,
  );

  // Luật của cột sinh, phát biểu thẳng: đổi dấu số lượng thì đổi dấu giá trị,
  // ĐÚNG BẰNG NHAU. Kiểm bằng DÒNG THẬT ghi vào bảng (không tự tính lại biểu
  // thức trong câu kiểm — làm thế là kiểm chính mình) và trên nhiều mức giảm
  // giá, để không lọt ca "đúng tình cờ ở một con số".
  const { rows: [oSym] } = await c.query(
    `insert into public.orders (tenant_id, kind, contact_id, status, created_by)
       values ($1,'order',$2,'draft',$3) returning id`,
    [t.id, kh.id, uThuNgan],
  );
  const { rows: [hoSym] } = await c.query(
    `insert into public.orders (tenant_id, kind, parent_order_id, contact_id, status, created_by)
       values ($1,'return',$2,$3,'draft',$4) returning id`,
    [t.id, oSym.id, kh.id, uThuNgan],
  );
  const MUC_GIAM = [0, 1, 400000, 2999999];
  const lech = [];
  for (const giam of MUC_GIAM) {
    const { rows: [ban] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,3,1000000,$4) returning line_total_vnd`,
      [t.id, oSym.id, hh.id, giam],
    );
    const { rows: [hoan] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,-3,1000000,$4) returning line_total_vnd`,
      [t.id, hoSym.id, hh.id, giam],
    );
    if (Number(ban.line_total_vnd) !== -Number(hoan.line_total_vnd)) {
      lech.push({ giam, ban: ban.line_total_vnd, hoan: hoan.line_total_vnd });
    }
  }
  check(
    "Đổi dấu số lượng ⇒ đổi dấu giá trị, đúng bằng nhau ở mọi mức giảm giá",
    lech.length === 0,
    JSON.stringify(lech),
  );

  // ── Ca 5: KHÔNG tra ra người làm ⇒ KHÔNG sinh khoản ──
  // Đơn do `uNgoai` lập — có tài khoản nhưng không có hồ sơ nhân sự nào.
  const { rows: [oNgoai] } = await c.query(
    `insert into public.orders (tenant_id, kind, contact_id, status, created_by)
       values ($1,'order',$2,'draft',$3) returning id`,
    [t.id, kh.id, uNgoai],
  );
  await c.query(
    `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
       values ($1,$2,$3,1,500000,0)`,
    [t.id, oNgoai.id, hh.id],
  );
  // Máy trạng thái (#207) bắt đi đúng đường draft→confirmed→completed;
  // bản cũ nhảy cóc từ nháp thẳng sang xong.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [oNgoai.id]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [oNgoai.id]);
  const { rows: [khongAi] } = await c.query(
    `select count(*)::int as n from public.commission_entries where order_id = $1`,
    [oNgoai.id],
  );
  check(
    "Không tra ra hồ sơ nhân sự ⇒ KHÔNG sinh khoản nào (không rơi vào ai mặc định)",
    khongAi.n === 0,
    `n=${khongAi.n}`,
  );

  // ── Ca 6: tỉ lệ 0% ⇒ không ghi dòng nào (CHECK amount_vnd <> 0 của #167) ──
  await c.query(
    `update public.commission_rates set percent = 0 where tenant_id = $1 and job_type = 'product'`,
    [t.id],
  );
  const don0 = await moDon();
  // Máy trạng thái (#207) bắt đi đúng đường draft→confirmed→completed;
  // bản cũ nhảy cóc từ nháp thẳng sang xong.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [don0.orderId]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [don0.orderId]);
  const zero = await dem(eThuNgan.id, don0.orderId);
  check("Tỉ lệ 0% ⇒ không sinh khoản, không vỡ giao dịch chốt đơn", zero.n === 0, JSON.stringify(zero));
  await c.query(
    `update public.commission_rates set percent = 5 where tenant_id = $1 and job_type = 'product'`,
    [t.id],
  );

  // ── Ca 7: BÁN GÓI 3% + huỷ gói thì trừ lại, huỷ hai lần không trừ hai lần ──
  const { rows: [goi] } = await c.query(
    `insert into public.service_packages (tenant_id, name, sessions_total, price_vnd)
       values ($1,'Goi 10 buoi',10,10000000) returning id`,
    [t.id],
  );
  const { rows: [hd] } = await c.query(
    `insert into public.contracts (tenant_id, contact_id, package_id, sessions_total, price_paid_vnd, created_by)
       values ($1,$2,$3,10,10000000,$4) returning id`,
    [t.id, kh.id, goi.id, uThuNgan],
  );
  const demGoi = async () => {
    const { rows } = await c.query(
      `select count(*)::int as n, coalesce(sum(amount_vnd),0)::bigint as tong
         from public.commission_entries where contract_id = $1`,
      [hd.id],
    );
    return { n: rows[0].n, tong: Number(rows[0].tong) };
  };
  const goiCong = await demGoi();
  check(
    "Bán gói 10.000.000 × 3% = 300.000 (không phải 8% — quyết định 2 của thẻ)",
    goiCong.n === 1 && goiCong.tong === 300000,
    JSON.stringify(goiCong),
  );

  await c.query(`update public.contracts set status = 'cancelled' where id = $1`, [hd.id]);
  const goiHuy = await demGoi();
  check(
    "Huỷ gói ⇒ trừ lại đúng 300.000 (tổng còn 0)",
    goiHuy.n === 2 && goiHuy.tong === 0,
    JSON.stringify(goiHuy),
  );
  await c.query(`update public.contracts set status = 'active' where id = $1`, [hd.id]);
  await c.query(`update public.contracts set status = 'cancelled' where id = $1`, [hd.id]);
  const goiHuy2 = await demGoi();
  check(
    "Huỷ → mở → huỷ lần nữa KHÔNG trừ hai lần",
    goiHuy2.n === 2 && goiHuy2.tong === 0,
    JSON.stringify(goiHuy2),
  );

  // ── Ca 8: QUYỀN ĐỌC (thẻ: bảng "Ai xem được gì") ──
  const doc = async (uid, role, tenantId) =>
    asUser(uid, { tenant_id: tenantId, role }, async () => {
      const { rows } = await c.query(`select count(*)::int as n from public.commission_entries`);
      return rows[0].n;
    });
  const { rows: [tongTiem] } = await c.query(
    `select count(*)::int as n from public.commission_entries where tenant_id = $1`,
    [t.id],
  );
  const { rows: [cuaTho] } = await c.query(
    `select count(*)::int as n from public.commission_entries where employee_id = $1`,
    [eTho.id],
  );
  const nvDoc = await doc(uTho, "staff", t.id);
  const qlDoc = await doc(uChu, "manager", t.id);
  const chuDoc = await doc(uChu, "owner", t.id);
  const nguoiTiemKhac = await doc(uChu, "owner", t2.id);
  check(
    "Nhân viên đọc ĐÚNG phần của mình, không thấy của người khác",
    nvDoc === cuaTho.n && nvDoc < tongTiem.n,
    `nv=${nvDoc} cuaTho=${cuaTho.n} tong=${tongTiem.n}`,
  );
  check("Quản lý đọc cả đội", qlDoc === tongTiem.n, `ql=${qlDoc} tong=${tongTiem.n}`);
  check("Chủ tiệm đọc cả đội", chuDoc === tongTiem.n, `chu=${chuDoc} tong=${tongTiem.n}`);
  check("Tiệm khác đọc 0 dòng", nguoiTiemKhac === 0, `n=${nguoiTiemKhac}`);

  // ── Ca 9: ĐẶT TỈ LỆ chỉ owner/admin (quản lý KHÔNG) ──
  // Dùng ĐÚNG câu mà `datTiLe` ở app/app/commissions/actions.ts gửi đi (upsert),
  // không phải một câu `update` na ná — hai câu đó rơi vào hai nhánh RLS khác nhau.
  const doiTiLe = async (uid, role) =>
    asUser(uid, { tenant_id: t.id, role }, () =>
      thu(() =>
        c.query(
          `insert into public.commission_rates (tenant_id, job_type, percent, updated_by)
             values ($1,'service',9,$2)
             on conflict (tenant_id, job_type) do update set percent = excluded.percent`,
          [t.id, uid],
        ),
      ),
    );
  const qlDoi = await doiTiLe(uChu, "manager");
  check(
    "Quản lý KHÔNG đặt được tỉ lệ (CSDL từ chối, không im lặng bỏ qua)",
    !qlDoi.ok && /row-level security/i.test(qlDoi.e),
    qlDoi.e ?? "không bị chặn",
  );
  const chuDoi = await doiTiLe(uChu, "owner");
  check("Chủ tiệm đặt được tỉ lệ", chuDoi.ok && chuDoi.v.rowCount === 1, JSON.stringify(chuDoi));
  const { rows: [muc] } = await c.query(
    `select percent from public.commission_rates where tenant_id = $1 and job_type = 'service'`,
    [t.id],
  );
  check("Tỉ lệ mới đã vào sổ (8% → 9%)", Number(muc.percent) === 9, `percent=${muc.percent}`);

  // ── Ca 10: `commission_sinh_ky` — hàng rào vai + chạy lại không sinh thêm ──
  const nvSinh = await asUser(uTho, { tenant_id: t.id, role: "staff" }, () =>
    thu(() => c.query(`select public.commission_sinh_ky(current_date)`)),
  );
  check(
    "Nhân viên gọi commission_sinh_ky ⇒ bị chặn (forbidden)",
    !nvSinh.ok && /forbidden/.test(nvSinh.e),
    nvSinh.e ?? "không bị chặn",
  );
  const sinhKy = () =>
    asUser(uChu, { tenant_id: t.id, role: "owner" }, async () => {
      const { rows } = await c.query(`select public.commission_sinh_ky(current_date) as n`);
      return Number(rows[0].n);
    });
  // Lần 1 sinh BÙ đúng 1 khoản: dòng hàng hoá của ca 9 bị bỏ qua lúc tỉ lệ còn
  // 0%, nay tỉ lệ đã sửa về 5% thì nó được sinh — đúng công dụng của hàm này.
  const buLan1 = await sinhKy();
  check("Sửa tỉ lệ rồi tính lại kỳ ⇒ sinh bù đúng 1 khoản đã bị bỏ qua", buLan1 === 1, `n=${buLan1}`);
  const buLan2 = await sinhKy();
  check("Chạy lại lần nữa ⇒ 0 khoản mới (idempotent)", buLan2 === 0, `n=${buLan2}`);

  // ── Ca 11: khoản hoa hồng CHẢY VÀO phiếu lương (đường #167 đọc) ──
  const { rows: hhKy } = await c.query(
    `select coalesce(sum(amount_vnd),0)::bigint as tong from public.commission_entries
      where tenant_id = $1 and earned_on = (now() at time zone 'Asia/Ho_Chi_Minh')::date`,
    [t.id],
  );
  check(
    "Kỳ này có tổng hoa hồng khác 0 ⇒ cột hoa hồng phiếu lương không còn luôn bằng 0",
    Number(hhKy[0].tong) !== 0,
    `tong=${hhKy[0].tong}`,
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - fail}/${n} đạt.`);
process.exit(fail === 0 ? 0 : 1);
