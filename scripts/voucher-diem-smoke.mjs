#!/usr/bin/env node
/**
 * Cổng chống tái phát cho Voucher + Tích điểm (V6 retention, migration #157-159).
 *
 * Hai chỗ mất tiền nhanh nhất của cả sản phẩm nằm ở đây, nên chúng được kiểm
 * bằng CSDL THẬT chứ không bằng mô phỏng:
 *
 *   VOUCHER — ba trần (số lượt · tiền giảm mỗi đơn · ngày hết hạn) phải là
 *     ràng buộc CSDL, không phải lời nhắc trên màn hình. Và mã phải PHÂN BỔ về
 *     từng dòng hàng đúng tới từng đồng: kho này cố ý không có giảm giá cấp đơn
 *     (migration #127), nên phân bổ sai là báo cáo lãi sai vĩnh viễn.
 *   TÍCH ĐIỂM — điểm là NỢ của tiệm. Sổ điểm phải append-only (chủ tiệm cũng
 *     không sửa được), tiêu phải theo lô sắp hết hạn trước, và một đơn chỉ được
 *     tích đúng một lần.
 *
 * Một lỗi THẬT bộ này bắt được ngay hôm viết: hàm tích điểm trừ voucher lần thứ
 * hai (voucher đã nằm trong discount của dòng rồi) ⇒ khách mất điểm oan.
 *
 * Chạy trong MỘT transaction rồi ROLLBACK — không để lại dữ liệu trên CSDL thật.
 * Cần env SUPABASE_DB_URL (CI truyền vào, xem .github/workflows/ci.yml).
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// Chạy TAY thì đọc .env.local; trên CI biến đã có sẵn trong môi trường và FILE
// ĐÓ KHÔNG TỒN TẠI. Bản đầu đọc thẳng không hỏi ⇒ CI đỏ ngay lượt đầu với lỗi
// "không mở được .env.local" — cùng khuôn phòng thân đã có ở ap-migration.mjs.
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
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();

let n = 0, fail = 0;
const check = (name, cond, detail = "") => {
  n++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${n} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) fail++;
};
const asUser = async (uid, claims, fn) => {
  await c.query(`select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: claims })]);
  try { return await fn(); } finally { await c.query(`select set_config('role','postgres',true)`); }
};
// Lỗi trong transaction làm ABORT cả transaction ⇒ mỗi phép thử phải nằm trong
// savepoint riêng, y như khuôn của rls-smoke.
let spN = 0;
const thu = async (fn) => {
  const sp = `sp_thu_${++spN}`;
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

// ── THÁO CHỐT: chứng minh ca kiểm KHÔNG RỖNG ────────────────────────────────
// Một ca xanh không phân biệt được với một ca không kiểm gì cả. Nên hai chốt
// quan trọng nhất của migration #195 phải THẤY ĐỎ được theo yêu cầu:
//
//   THAO_CHOT=khong-am    node scripts/voucher-diem-smoke.mjs
//   THAO_CHOT=idempotent  node scripts/voucher-diem-smoke.mjs
//
// Cách làm: đọc CHÍNH file migration, thay đúng một dòng, nạp đè hàm bên trong
// transaction của bộ kiểm (rồi rollback ⇒ CSDL thật không đổi). Không chép lại
// thân hàm vào đây — chép là có ngày bản chép và bản thật lệch nhau, và khi đó
// phép "tháo chốt" chứng minh nhầm một hàm không ai chạy.
//
// ⚠️ ĐIỀU PHÉP THÁO CHỐT DẠY RA, ghi lại vì nó đổi cách đọc ca kiểm: chống chạy
// hai lần được canh bằng BA lớp ĐỘC LẬP — ① cửa "đã quyết toán" ở đầu hàm ·
// ② trần "đã thu/đã trả ở phiếu hoàn trước" · ③ chỉ mục duy nhất
// `loyalty_ledger_return_unique`. Tháo ① thì ca "báo đã quyết toán" ĐỎ ngay,
// nhưng ca "ví không đổi" vẫn XANH vì ② đỡ. Nên đừng đọc ca "ví không đổi" như
// bằng chứng cho ①: mỗi lớp có bằng chứng riêng, và ③ được kiểm thẳng bằng ca
// "chèn dòng trùng ⇒ CSDL từ chối" (không tháo được bằng cách thay câu lệnh nên
// phải kiểm trực diện).
const THAO_CHOT = process.env.THAO_CHOT ?? "";
const CHOT = {
  // Bỏ trần "không thu quá số điểm khách còn" ⇒ ví khách bị đòi quá tay.
  "khong-am": {
    thay: [["v_thu := least(v_muon_thu, greatest(v_con, 0));", "v_thu := v_muon_thu;"]],
  },
  // Bỏ cửa "đã quyết toán rồi thì thôi" (lớp ①).
  idempotent: {
    thay: [["return jsonb_build_object('tra_lai', 0, 'thu_lai', 0, 'ly_do', 'da_quyet_toan');", "null;"]],
  },
};
function sqlDaThaoChot() {
  const cap = CHOT[THAO_CHOT];
  if (!cap) {
    console.error(`THAO_CHOT không hợp lệ: ${THAO_CHOT}. Chọn: ${Object.keys(CHOT).join(" · ")}`);
    process.exit(2);
  }
  const nguon = readFileSync(
    path.join(GOC, "supabase", "migrations", "20260819000195_hoan_diem_khi_tra_hang.sql"),
    "utf8",
  );
  const dau = nguon.indexOf("create or replace function public.loyalty_settle_return");
  const cuoi = nguon.indexOf("$fn$;", dau);
  if (dau < 0 || cuoi < 0) {
    console.error("Không tìm thấy thân hàm loyalty_settle_return trong migration #195.");
    process.exit(2);
  }
  let ham = nguon.slice(dau, cuoi + 5);
  for (const [tim, doi] of cap.thay) {
    if (!ham.includes(tim)) {
      console.error(`Không tìm thấy dòng cần tháo: ${tim}`);
      process.exit(2);
    }
    ham = ham.replace(tim, doi);
  }
  return (cap.truoc ? cap.truoc + "\n" : "") + ham;
}

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
  if (THAO_CHOT) {
    await c.query(sqlDaThaoChot());
    console.log(`⚠️ ĐANG THÁO CHỐT "${THAO_CHOT}" — bộ kiểm PHẢI ĐỎ ở ca tương ứng.`);
  }
  const uid = randomUUID();
  await c.query(`insert into auth.users (id, aud, role, email) values ($1,'authenticated','authenticated',$2)`,
    [uid, `thu-diem-${Date.now()}@t.local`]);
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem thu diem', $1) returning id`, ["thu-diem-" + Date.now()]);
  const { rows: [ct] } = await c.query(
    `insert into public.contacts (tenant_id, full_name) values ($1,'Chi Lan') returning id`, [t.id]);
  const { rows: [item] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','San pham thu','cai',0,'active') returning id`, [t.id]);
  const mkOrder = async () => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',$2,'draft') returning id`,
      [t.id, ct.id]);
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,1,740000,0)`, [t.id, o.id, item.id]);
    return o.id;
  };

  const NV = { tenant_id: t.id, role: "staff" };
  const QL = { tenant_id: t.id, role: "manager" };
  const XEM = { tenant_id: t.id, role: "viewer" };

  // ── Chưa bật thì không tích ──
  const o1 = await mkOrder();
  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select public.loyalty_earn_for_order($1) d`, [o1])).rows[0].d);
    check("chưa bật tích điểm ⇒ cộng 0 điểm", r.ok && r.v === 0, JSON.stringify(r));
  });

  await c.query(`insert into public.loyalty_config (tenant_id, is_active) values ($1,true)
                 on conflict (tenant_id) do update set is_active = true`, [t.id]);

  // ── Cộng điểm ──
  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select public.loyalty_earn_for_order($1) d`, [o1])).rows[0].d);
    check("đơn 740.000đ ⇒ 74 điểm (10.000đ = 1 điểm)", r.ok && r.v === 74, JSON.stringify(r));
    const r2 = await thu(async () => (await c.query(`select public.loyalty_earn_for_order($1) d`, [o1])).rows[0].d);
    check("gọi lần hai cho CÙNG đơn ⇒ 0 (không nhân đôi điểm)", r2.ok && r2.v === 0, JSON.stringify(r2));
  });

  // ── Vai Chỉ xem không phát sinh điểm ──
  const o2 = await mkOrder();
  await asUser(uid, XEM, async () => {
    const r = await thu(async () => (await c.query(`select public.loyalty_earn_for_order($1) d`, [o2])).rows[0].d);
    check("vai Chỉ xem KHÔNG cộng được điểm", !r.ok && /forbidden/.test(r.e), JSON.stringify(r));
  });

  // ── Ví điểm ──
  {
    const { rows } = await c.query(`select diem_con from public.loyalty_balances where contact_id = $1`, [ct.id]);
    check("ví điểm của khách = 74", rows[0]?.diem_con === "74", JSON.stringify(rows));
  }

  // ── Tiêu điểm ──
  await asUser(uid, NV, async () => {
    let r = await thu(async () => (await c.query(`select public.loyalty_redeem($1,$2)`, [ct.id, 1000])).rows[0]);
    check("tiêu 1.000 điểm khi ví chỉ có 74 ⇒ bị chặn", !r.ok && /not_enough_points/.test(r.e), JSON.stringify(r));
    r = await thu(async () => (await c.query(`select public.loyalty_redeem($1,$2)`, [ct.id, 350])).rows[0]);
    check("tiêu 350 điểm (không đúng bội số 1.000) ⇒ bị chặn", !r.ok && /not_multiple/.test(r.e), JSON.stringify(r));
    r = await thu(async () => (await c.query(`select public.loyalty_redeem($1,$2)`, [ct.id, 0])).rows[0]);
    check("tiêu 0 điểm ⇒ bị chặn", !r.ok && /invalid_points/.test(r.e), JSON.stringify(r));
  });

  // ── Tặng điểm tay: nhân viên bị chặn, quản lý được ──
  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select public.loyalty_grant($1,$2,'referral')`, [ct.id, 200])).rows[0]);
    check("nhân viên KHÔNG tặng được điểm tay", !r.ok && /forbidden/.test(r.e), JSON.stringify(r));
  });
  await asUser(uid, QL, async () => {
    const r = await thu(async () => (await c.query(`select public.loyalty_grant($1,$2,'referral','Gioi thieu ban')`, [ct.id, 1200])).rows[0]);
    check("quản lý tặng được 1.200 điểm giới thiệu", r.ok, JSON.stringify(r));
  });

  // ── FIFO: lô sắp hết hạn tiêu trước ──
  {
    // Ép lô "giới thiệu" (1.200 điểm) hết hạn SỚM hơn lô đơn hàng (74 điểm)
    await c.query(`update public.loyalty_ledger set expires_at = now() + interval '1 month'
                    where contact_id = $1 and reason = 'referral'`, [ct.id]);
    await c.query(`update public.loyalty_ledger set expires_at = now() + interval '11 months'
                    where contact_id = $1 and reason = 'order'`, [ct.id]);
    await asUser(uid, NV, async () => {
      const r = await thu(async () => (await c.query(`select public.loyalty_redeem($1,$2) v`, [ct.id, 1000])).rows[0].v);
      check("tiêu 1.000 điểm ⇒ giảm 100.000đ", r.ok && r.v === "100000", JSON.stringify(r));
    });
    const { rows } = await c.query(
      `select reason, remaining from public.loyalty_ledger
        where contact_id = $1 and delta_points > 0 order by expires_at`, [ct.id]);
    const lo = Object.fromEntries(rows.map((x) => [x.reason, x.remaining]));
    check("tiêu ĐÚNG lô sắp hết hạn trước (giới thiệu 1200→200, đơn hàng 74 còn nguyên)",
      lo.referral === 200 && lo.order === 74, JSON.stringify(lo));
  }

  // ── Sổ append-only: không ai sửa/xoá được dòng đã ghi ──
  await asUser(uid, { tenant_id: t.id, role: "owner" }, async () => {
    let r = await thu(async () => c.query(`update public.loyalty_ledger set delta_points = 99999 where contact_id = $1`, [ct.id]));
    const suaDuoc = r.ok && r.v.rowCount > 0;
    check("CHỦ TIỆM cũng KHÔNG sửa được dòng sổ điểm đã ghi", !suaDuoc, JSON.stringify(r.ok ? r.v.rowCount : r.e));
    r = await thu(async () => c.query(`delete from public.loyalty_ledger where contact_id = $1`, [ct.id]));
    const xoaDuoc = r.ok && r.v.rowCount > 0;
    check("CHỦ TIỆM cũng KHÔNG xoá được dòng sổ điểm", !xoaDuoc, JSON.stringify(r.ok ? r.v.rowCount : r.e));
    r = await thu(async () => c.query(
      `insert into public.loyalty_ledger (tenant_id, contact_id, delta_points, reason, expires_at, remaining)
         values ($1,$2,999999,'manual', now() + interval '1 year', 999999)`, [t.id, ct.id]));
    check("KHÔNG ai chèn thẳng vào sổ điểm (chỉ qua hàm)", !r.ok, JSON.stringify(r.ok ? "chèn được!" : r.e));
  });

  // ── Tổng nợ điểm của tiệm ──
  {
    const { rows } = await c.query(`select * from public.loyalty_debt where tenant_id = $1`, [t.id]);
    const d = rows[0];
    check("tổng nợ điểm = 274 điểm ⇒ 27.400đ",
      d && d.diem_chua_tieu === "274" && d.no_vnd === "27400", JSON.stringify(d));
  }

  // ── Ba trần voucher bắt buộc ──
  for (const [ten, sql] of [
    ["thiếu trần SỐ LƯỢT", `insert into public.vouchers (tenant_id, code, kind, percent_off, max_discount_vnd, expires_at) values ($1,'A1','percent',15,100000, now()+interval '10 days')`],
    ["thiếu trần TIỀN GIẢM", `insert into public.vouchers (tenant_id, code, kind, percent_off, max_uses, expires_at) values ($1,'A2','percent',15,200, now()+interval '10 days')`],
    ["thiếu NGÀY HẾT HẠN", `insert into public.vouchers (tenant_id, code, kind, percent_off, max_uses, max_discount_vnd) values ($1,'A3','percent',15,200,100000)`],
  ]) {
    const r = await thu(async () => c.query(sql, [t.id]));
    check(`voucher ${ten} ⇒ CSDL từ chối`, !r.ok, r.ok ? "tạo ĐƯỢC!" : "");
  }
  {
    const r = await thu(async () => c.query(
      `insert into public.vouchers (tenant_id, code, kind, max_uses, max_discount_vnd, expires_at)
         values ($1,'A4','percent',200,100000, now()+interval '10 days')`, [t.id]));
    check("voucher kiểu % mà không ghi % ⇒ CSDL từ chối", !r.ok, r.ok ? "tạo ĐƯỢC!" : "");
  }
  {
    await c.query(`insert into public.vouchers (tenant_id, code, kind, percent_off, max_uses, max_discount_vnd, expires_at)
                     values ($1,'he2026','percent',15,200,100000, now()+interval '10 days')`, [t.id]);
    const r = await thu(async () => c.query(
      `insert into public.vouchers (tenant_id, code, kind, percent_off, max_uses, max_discount_vnd, expires_at)
         values ($1,'HE2026','percent',20,50,50000, now()+interval '10 days')`, [t.id]));
    check("hai mã chỉ khác hoa/thường ⇒ CSDL từ chối (nhân viên gõ tay phải ra đúng một mã)",
      !r.ok, r.ok ? "tạo ĐƯỢC!" : "");
  }


  // ════════════════════════════════════════════════════════════
  // VOUCHER — phần dễ mất tiền nhất
  // ════════════════════════════════════════════════════════════
  const mkOrder2 = async () => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',$2,'draft') returning id`,
      [t.id, ct.id]);
    // Hai dòng lệch nhau để phép phân bổ theo tỷ lệ có gì để chứng minh
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd, sort_order)
         values ($1,$2,$3,1,500000,0,1), ($1,$2,$3,1,240000,0,2)`, [t.id, o.id, item.id]);
    return o.id;
  };

  await c.query(
    `insert into public.vouchers (tenant_id, code, kind, percent_off, max_uses, max_discount_vnd, expires_at, min_order_vnd)
       values ($1,'SALE15','percent',15,200,100000, now()+interval '10 days', 300000)`, [t.id]);

  await asUser(uid, NV, async () => {
    let r = await thu(async () => (await c.query(`select public.voucher_check('SALE15',$1,$2) j`, [740000, ct.id])).rows[0].j);
    check("giam 15% cua 740.000d la 111.000d nhung TRAN 100.000d chan lai",
      r.ok && r.v.ok === true && r.v.giam_vnd === 100000 && r.v.cham_tran_tien === true, JSON.stringify(r));

    r = await thu(async () => (await c.query(`select public.voucher_check('sale15',$1,$2) j`, [740000, ct.id])).rows[0].j);
    check("go ma bang chu thuong van ra dung ma", r.ok && r.v.ok === true, JSON.stringify(r));

    r = await thu(async () => (await c.query(`select public.voucher_check('SALE15',$1,$2) j`, [200000, ct.id])).rows[0].j);
    check("don 200.000d chua dat muc toi thieu => bao RO ly do, khong im lang bo qua",
      r.ok && r.v.ok === false && r.v.ly_do === "chua_du_don_toi_thieu", JSON.stringify(r));

    r = await thu(async () => (await c.query(`select public.voucher_check('KHONGCO',$1,$2) j`, [740000, ct.id])).rows[0].j);
    check("ma khong ton tai => bao ro", r.ok && r.v.ly_do === "khong_ton_tai", JSON.stringify(r));
  });

  const o3 = await mkOrder2();
  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select public.voucher_apply($1,'SALE15') j`, [o3])).rows[0].j);
    check("ap ma vao don that => giam dung 100.000d", r.ok && r.v.ok === true && r.v.giam_vnd === 100000, JSON.stringify(r));
  });
  {
    const { rows } = await c.query(
      `select unit_price_vnd, discount_vnd from public.order_lines where order_id = $1 order by sort_order`, [o3]);
    const tong = rows.reduce((s2, x) => s2 + Number(x.discount_vnd), 0);
    check("tong phan bo ve cac dong KHOP DUNG 100.000d (khong roi vai dong)", tong === 100000, JSON.stringify(rows));
    check("phan bo theo TY LE tien: dong 500k ganh nhieu hon dong 240k",
      Number(rows[0].discount_vnd) > Number(rows[1].discount_vnd), JSON.stringify(rows));
    check("khong dong nao bi giam qua gia tri cua chinh no",
      rows.every((x) => Number(x.discount_vnd) <= Number(x.unit_price_vnd)), JSON.stringify(rows));
  }
  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select public.voucher_apply($1,'SALE15') j`, [o3])).rows[0].j);
    check("ap ma thu hai vao cung don => bi chan", r.ok && r.v.ok === false && r.v.ly_do === "don_da_co_ma", JSON.stringify(r));
  });

  await asUser(uid, NV, async () => {
    const r = await thu(async () => (await c.query(`select public.loyalty_earn_for_order($1) d`, [o3])).rows[0].d);
    check("don 740k giam 100k => tich 64 diem (khong tru voucher hai lan thanh 54)", r.ok && r.v === 64, JSON.stringify(r));
  });

  {
    await c.query(`insert into public.vouchers (tenant_id, code, kind, amount_off_vnd, max_uses, max_discount_vnd, expires_at)
                     values ($1,'CHAOBAN','amount',50000,1,50000, now()+interval '10 days')`, [t.id]);
    const oA = await mkOrder2(), oB = await mkOrder2();
    await asUser(uid, NV, async () => {
      let r = await thu(async () => (await c.query(`select public.voucher_apply($1,'CHAOBAN') j`, [oA])).rows[0].j);
      check("ma tran 1 luot - luot dau dung duoc", r.ok && r.v.ok === true, JSON.stringify(r));
      r = await thu(async () => (await c.query(`select public.voucher_apply($1,'CHAOBAN') j`, [oB])).rows[0].j);
      check("ma tran 1 luot - luot thu hai bi chan", r.ok && r.v.ok === false && r.v.ly_do === "het_luot", JSON.stringify(r));
    });
  }

  {
    await c.query(`insert into public.vouchers (tenant_id, code, kind, amount_off_vnd, max_uses, max_discount_vnd, expires_at)
                     values ($1,'CUXI','amount',20000,99,20000, now() - interval '1 day')`, [t.id]);
    await c.query(`insert into public.vouchers (tenant_id, code, kind, amount_off_vnd, max_uses, max_discount_vnd, expires_at, status)
                     values ($1,'TAMDUNG','amount',20000,99,20000, now() + interval '9 days','paused')`, [t.id]);
    await asUser(uid, NV, async () => {
      let r = await thu(async () => (await c.query(`select public.voucher_check('CUXI',$1,$2) j`, [740000, ct.id])).rows[0].j);
      check("ma het han => bao ro het han", r.ok && r.v.ly_do === "het_han", JSON.stringify(r));
      r = await thu(async () => (await c.query(`select public.voucher_check('TAMDUNG',$1,$2) j`, [740000, ct.id])).rows[0].j);
      check("ma da dung => bao ro da dung", r.ok && r.v.ly_do === "da_dung", JSON.stringify(r));
    });
  }

  {
    const oC = await mkOrder2();
    await asUser(uid, XEM, async () => {
      const r = await thu(async () => (await c.query(`select public.voucher_apply($1,'SALE15') j`, [oC])).rows[0].j);
      check("vai Chi xem KHONG ap duoc ma giam gia", !r.ok && /forbidden/.test(r.e), JSON.stringify(r));
    });
    await asUser(uid, NV, async () => {
      const r = await thu(async () => c.query(
        `insert into public.voucher_redemptions (tenant_id, voucher_id, order_id, discount_vnd)
           select $1, id, $2, 999999 from public.vouchers where code='SALE15'`, [t.id, oC]));
      check("KHONG ai ghi thang luot dung de lach tran (chi qua ham)", !r.ok, r.ok ? "ghi duoc!" : "");
    });
  }

  // ════════════════════════════════════════════════════════════
  // ÁP MÃ VÀO ĐƠN THẬT — các lý do BỊ LOẠI phải trả về, KHÔNG ném lỗi
  // ════════════════════════════════════════════════════════════
  // `voucher_check` đã được kiểm ở trên, nhưng màn Đơn hàng gọi `voucher_apply`
  // chứ không gọi `voucher_check`. Hai hàm là hai đường: apply có thể ném lỗi ở
  // chỗ check trả về êm, và khi đó nhân viên nhận một câu lỗi kỹ thuật thay vì
  // lý do đọc được. Nên kiểm ĐÚNG đường mà giao diện đi.
  {
    const oNho = await (async () => {
      const { rows: [o] } = await c.query(
        `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',$2,'draft') returning id`,
        [t.id, ct.id]);
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
           values ($1,$2,$3,1,100000,0)`, [t.id, o.id, item.id]);
      return o.id;
    })();
    const oHetHan = await mkOrder2();
    const oHetLuot = await mkOrder2();

    await asUser(uid, NV, async () => {
      let r = await thu(async () => (await c.query(`select public.voucher_apply($1,'SALE15') j`, [oNho])).rows[0].j);
      check("ap ma vao don 100k chua dat muc toi thieu => tra ly_do, KHONG nem loi",
        r.ok && r.v.ok === false && r.v.ly_do === "chua_du_don_toi_thieu" && Number(r.v.can_tu) === 300000,
        JSON.stringify(r));

      r = await thu(async () => (await c.query(`select public.voucher_apply($1,'CUXI') j`, [oHetHan])).rows[0].j);
      check("ap ma DA HET HAN vao don that => tra ly_do het_han, KHONG nem loi",
        r.ok && r.v.ok === false && r.v.ly_do === "het_han", JSON.stringify(r));

      r = await thu(async () => (await c.query(`select public.voucher_apply($1,'CHAOBAN') j`, [oHetLuot])).rows[0].j);
      check("ap ma DA HET LUOT vao don that => tra ly_do het_luot, KHONG nem loi",
        r.ok && r.v.ok === false && r.v.ly_do === "het_luot", JSON.stringify(r));
    });

    const { rows: dong } = await c.query(
      `select discount_vnd from public.order_lines where order_id = any($1::uuid[])`, [[oNho, oHetHan, oHetLuot]]);
    check("ma bi loai => KHONG dong hang nao bi tru mot dong nao",
      dong.every((x) => Number(x.discount_vnd) === 0), JSON.stringify(dong));
  }

  // ════════════════════════════════════════════════════════════
  // TRẢ ĐƠN BẰNG ĐIỂM (migration #194) — nửa còn thiếu của mảng Giữ khách
  // ════════════════════════════════════════════════════════════
  // Ca quan trọng nhất ở khối này là SỔ QUỸ: điểm không phải tiền vào két, nên
  // `order_payments_emit_cash_entry` phải bỏ qua. Sai chỗ đó là sổ quỹ phình lên
  // bằng tiền không tồn tại — chủ tiệm đếm két rồi tưởng nhân viên lấy mất.
  {
    const { rows: [ct2] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,'Chi Mai') returning id`, [t.id]);
    await asUser(uid, QL, async () => {
      await c.query(`select public.loyalty_grant($1,$2,'manual','Nap de thu')`, [ct2.id, 10000]);
    });

    const { rows: [oD] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',$2,'draft') returning id`,
      [t.id, ct2.id]);
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,1,500000,0)`, [t.id, oD.id, item.id]);

    const demQuy = async () =>
      Number((await c.query(`select count(*) n from public.cash_entries where tenant_id = $1`, [t.id])).rows[0].n);
    const quyTruoc = await demQuy();

    await asUser(uid, NV, async () => {
      let r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 0])).rows[0].j);
      check("tra don bang 0 diem => so_diem_khong_hop_le",
        r.ok && r.v.ok === false && r.v.ly_do === "so_diem_khong_hop_le", JSON.stringify(r));

      r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 300])).rows[0].j);
      check("tra 300 diem (khong dung boi so 1.000) => khong_dung_boi_so + noi ro boi so",
        r.ok && r.v.ok === false && r.v.ly_do === "khong_dung_boi_so" && Number(r.v.boi_so) === 1000, JSON.stringify(r));

      r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 2000])).rows[0].j);
      check("tra 2.000 diem => don duoc tra 200.000d, khach con 8.000 diem",
        r.ok && r.v.ok === true && Number(r.v.giam_vnd) === 200000 &&
        Number(r.v.diem_da_dung) === 2000 && Number(r.v.con_lai_diem) === 8000, JSON.stringify(r));
    });

    {
      const { rows } = await c.query(
        `select diem_con from public.loyalty_balances where contact_id = $1`, [ct2.id]);
      check("vi diem bi tru DUNG 2.000 (10.000 -> 8.000)", rows[0]?.diem_con === "8000", JSON.stringify(rows));
    }
    {
      const { rows } = await c.query(
        `select method, amount_vnd from public.order_payments where order_id = $1`, [oD.id]);
      check("don co DUNG mot khoan tra kieu 'points' = 200.000d",
        rows.length === 1 && rows[0].method === "points" && Number(rows[0].amount_vnd) === 200000, JSON.stringify(rows));
    }
    {
      const { rows } = await c.query(
        `select count(*) n from public.cash_entries where order_id = $1`, [oD.id]);
      const quySau = await demQuy();
      check("SO QUY khong sinh them dong nao (diem khong phai tien vao ket)",
        Number(rows[0].n) === 0 && quySau === quyTruoc, `dong cua don=${rows[0].n} · tong quy ${quyTruoc}->${quySau}`);
    }

    await asUser(uid, NV, async () => {
      let r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 9000])).rows[0].j);
      check("tra 9.000 diem khi vi con 8.000 => khong_du_diem + noi ro con bao nhieu",
        r.ok && r.v.ok === false && r.v.ly_do === "khong_du_diem" && Number(r.v.con) === 8000, JSON.stringify(r));

      // Đơn 500k đã trả 200k bằng điểm ⇒ còn thiếu 300k. 5.000 điểm = 500k > 300k.
      r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 5000])).rows[0].j);
      check("tra bang diem VUOT so con thieu cua don => bi chan, noi ro con thieu bao nhieu",
        r.ok && r.v.ok === false && r.v.ly_do === "vuot_so_con_thieu" && Number(r.v.con_thieu) === 300000, JSON.stringify(r));
    });

    // Chặn rồi thì KHÔNG được trừ điểm — nếu trừ, khách mất điểm mà đơn không giảm.
    {
      const { rows } = await c.query(
        `select diem_con from public.loyalty_balances where contact_id = $1`, [ct2.id]);
      check("hai lan bi chan o tren KHONG lam mat diem cua khach (van 8.000)",
        rows[0]?.diem_con === "8000", JSON.stringify(rows));
    }

    await asUser(uid, XEM, async () => {
      const r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 1000])).rows[0].j);
      check("vai Chi xem KHONG tra duoc don bang diem", !r.ok && /forbidden/.test(r.e), JSON.stringify(r));
    });

    // ── Đơn đã chốt ──
    {
      const { rows: [oXong] } = await c.query(
        `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',$2,'completed') returning id`,
        [t.id, ct2.id]);
      await asUser(uid, NV, async () => {
        const r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oXong.id, 1000])).rows[0].j);
        check("don DA CHOT => don_da_chot, khong nem loi", r.ok && r.v.ok === false && r.v.ly_do === "don_da_chot", JSON.stringify(r));
      });
    }

    // ── Tiệm tắt tích điểm ──
    {
      await c.query(`update public.loyalty_config set is_active = false where tenant_id = $1`, [t.id]);
      await asUser(uid, NV, async () => {
        const r = await thu(async () => (await c.query(`select public.loyalty_redeem_for_order($1,$2) j`, [oD.id, 1000])).rows[0].j);
        check("tiem CHUA BAT tich diem => chua_bat_tich_diem", r.ok && r.v.ok === false && r.v.ly_do === "chua_bat_tich_diem", JSON.stringify(r));
      });
      await c.query(`update public.loyalty_config set is_active = true where tenant_id = $1`, [t.id]);
    }

    // ── "Đơn không gắn khách" KHÔNG DỰNG ĐƯỢC ──
    // `orders.contact_id` là `not null` (migration #127) ⇒ nhánh `don_khong_co_khach`
    // của `loyalty_redeem_for_order` KHÔNG THỂ chạm tới bằng đường bình thường.
    // Kiểm chính cái chốt đó thay vì kiểm một nhánh không tồn tại — và nếu sau này
    // ai mở cột đó ra nullable, ca này đỏ để nhớ nối lại nhánh kia.
    {
      const r = await thu(async () => c.query(
        `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',null,'draft')`, [t.id]));
      check("KHONG tao duoc don khong gan khach => nhanh don_khong_co_khach la duong chet",
        !r.ok && /contact_id/.test(r.e), r.ok ? "tao DUOC!" : "");
    }
  }

  // ════════════════════════════════════════════════════════════
  // TRẢ HÀNG PHẢI ĐỘNG TỚI ĐIỂM — CẢ HAI CHIỀU (migration #195)
  // ════════════════════════════════════════════════════════════
  // Trước #195, trả hàng KHÔNG đụng gì tới sổ điểm: khách trả đơn bằng điểm rồi
  // hoàn hàng thì mất trắng phần đó (hệ không có đường hoàn tiền mặt cho phiếu
  // hoàn), còn điểm tiệm đã tặng thì vẫn nằm nguyên trong ví dù hàng đã về kho.
  {
    const mkKhach = async (ten) =>
      (await c.query(`insert into public.contacts (tenant_id, full_name) values ($1,$2) returning id`,
        [t.id, ten])).rows[0].id;

    /** Đơn gốc một dòng. `giam` để kiểm phép đo giá trị hàng trả ở dòng CÓ giảm giá. */
    const mkDon = async (khach, gia, sl = 1, giam = 0) => {
      const { rows: [o] } = await c.query(
        `insert into public.orders (tenant_id, kind, contact_id, status, created_by)
           values ($1,'order',$2,'draft',$3) returning id`, [t.id, khach, uid]);
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
           values ($1,$2,$3,$4,$5,$6)`, [t.id, o.id, item.id, sl, gia, giam]);
      return o.id;
    };

    /** Đi ĐÚNG đường của tầng web: draft → confirmed → completed (trigger nổ ở bước cuối). */
    const chot = async (id) => {
      await c.query(`update public.orders set status='confirmed' where id=$1`, [id]);
      await c.query(`update public.orders set status='completed' where id=$1`, [id]);
    };

    /** Phiếu hoàn `phan` phần của đơn gốc — chép đúng khuôn `createReturn` của tầng web. */
    const mkHoan = async (donGoc, khach, phan) => {
      const { rows: dong } = await c.query(
        `select item_id, qty, unit_price_vnd, discount_vnd from public.order_lines where order_id=$1`, [donGoc]);
      const { rows: [o] } = await c.query(
        `insert into public.orders (tenant_id, kind, parent_order_id, contact_id, status, created_by)
           values ($1,'return',$2,$3,'draft',$4) returning id`, [t.id, donGoc, khach, uid]);
      for (const d of dong) {
        await c.query(
          `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
             values ($1,$2,$3,$4,$5,$6)`,
          [t.id, o.id, d.item_id, -(Number(d.qty) * phan), d.unit_price_vnd,
           Math.floor(Number(d.discount_vnd) * phan)]);
      }
      return o.id;
    };

    const vi = async (khach) => Number((await c.query(
      `select coalesce(sum(remaining),0) d from public.loyalty_ledger
        where contact_id=$1 and remaining>0 and expires_at>now()`, [khach])).rows[0].d);
    const soDiem = async (khach) => Number((await c.query(
      `select coalesce(sum(delta_points),0) d from public.loyalty_ledger where contact_id=$1`,
      [khach])).rows[0].d);
    const dongCuaHoan = async (don) => (await c.query(
      `select reason, delta_points, note from public.loyalty_ledger where order_id=$1 order by reason`,
      [don])).rows;

    // ── Ca 1: hoàn TOÀN BỘ ⇒ trả đủ điểm đã tiêu, thu đủ điểm đã tặng ──
    const kA = await mkKhach("Chi Hoan Het");
    await asUser(uid, QL, async () => {
      await c.query(`select public.loyalty_grant($1,$2,'manual','Nap de thu')`, [kA, 10000]);
    });
    const dA = await mkDon(kA, 1000000);
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_redeem_for_order($1,$2)`, [dA, 3000]);
    });
    await chot(dA);
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_earn_for_order($1)`, [dA]);
    });
    check("đơn gốc 1.000.000đ: tiêu 3.000 điểm + tích 100 điểm ⇒ ví 7.100",
      (await vi(kA)) === 7100, `ví = ${await vi(kA)}`);

    const hA = await mkHoan(dA, kA, 1);
    await chot(hA);
    {
      const d = await dongCuaHoan(hA);
      const thu2 = d.find((x) => x.reason === "return_clawback");
      const tra = d.find((x) => x.reason === "return_refund");
      check("hoàn TOÀN BỘ ⇒ thu lại ĐỦ 100 điểm đã tặng + trả lại ĐỦ 3.000 điểm đã tiêu",
        d.length === 2 && Number(thu2?.delta_points) === -100 && Number(tra?.delta_points) === 3000,
        JSON.stringify(d));
      check("hoàn TOÀN BỘ ⇒ ví khách về ĐÚNG như trước khi mua (10.000)",
        (await vi(kA)) === 10000, `ví = ${await vi(kA)}`);
    }
    {
      const { rows } = await c.query(
        `select (expires_at > now() + interval '11 months') xa from public.loyalty_ledger
          where order_id=$1 and reason='return_refund'`, [hA]);
      check("điểm trả lại là LÔ MỚI, hạn dùng tính lại từ đầu (12 tháng)",
        rows[0]?.xa === true, JSON.stringify(rows));
    }

    // ── Ca 2: hoàn MỘT PHẦN ⇒ cả hai chiều đúng theo tỉ lệ ──
    // Dòng gốc CÓ giảm giá: phiếu hoàn mang qty ÂM nhưng discount DƯƠNG, nên công
    // thức chung `qty*giá − giảm` ra số ÂM (sai). Ca này đỏ nếu ai đổi về công thức đó.
    const kB = await mkKhach("Chi Hoan Nua");
    await asUser(uid, QL, async () => {
      await c.query(`select public.loyalty_grant($1,$2,'manual','Nap de thu')`, [kB, 10000]);
    });
    const dB = await mkDon(kB, 1000000, 2, 200000); // 2.000.000 − 200.000 = 1.800.000
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_redeem_for_order($1,$2)`, [dB, 4000]);
    });
    await chot(dB);
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_earn_for_order($1)`, [dB]);
    });
    check("đơn gốc 1.800.000đ: tiêu 4.000 điểm + tích 180 điểm ⇒ ví 6.180",
      (await vi(kB)) === 6180, `ví = ${await vi(kB)}`);

    const hB = await mkHoan(dB, kB, 0.5);
    await chot(hB);
    {
      const d = await dongCuaHoan(hB);
      const thu2 = d.find((x) => x.reason === "return_clawback");
      const tra = d.find((x) => x.reason === "return_refund");
      check("hoàn MỘT NỬA ⇒ thu lại 90/180 điểm và trả lại 2.000/4.000 điểm (đúng tỉ lệ)",
        d.length === 2 && Number(thu2?.delta_points) === -90 && Number(tra?.delta_points) === 2000,
        JSON.stringify(d));
      check("hoàn MỘT NỬA ⇒ ví khách = 6.180 − 90 + 2.000 = 8.090",
        (await vi(kB)) === 8090, `ví = ${await vi(kB)}`);
    }

    // ── Ca 3: khách đã TIÊU HẾT điểm được tặng ⇒ thu tới 0, KHÔNG âm ──
    const kC = await mkKhach("Chi Tieu Het");
    const dC = await mkDon(kC, 10000000); // ⇒ 1.000 điểm
    await chot(dC);
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_earn_for_order($1)`, [dC]);
      await c.query(`select public.loyalty_redeem($1,$2,null,'Tieu het o cho khac')`, [kC, 1000]);
    });
    check("khách tiêu hết 1.000 điểm được tặng ⇒ ví 0", (await vi(kC)) === 0, `ví = ${await vi(kC)}`);
    const hC = await mkHoan(dC, kC, 1);
    await chot(hC);
    check("khách đã tiêu hết rồi mới trả hàng ⇒ KHÔNG ghi dòng thu nào (không đòi khống)",
      (await dongCuaHoan(hC)).length === 0, JSON.stringify(await dongCuaHoan(hC)));
    check("khách đã tiêu hết rồi mới trả hàng ⇒ sổ điểm KHÔNG ÂM (ví 0, tổng sổ 0)",
      (await vi(kC)) === 0 && (await soDiem(kC)) === 0,
      `ví = ${await vi(kC)} · tổng sổ = ${await soDiem(kC)}`);

    // ── Ca 3b: còn ÍT hơn số muốn thu ⇒ thu ĐÚNG phần còn, dừng ở 0 ──
    // Ca 3 chứng minh "không ghi khống"; ca này chứng minh phép CẮT thật sự cắt
    // đúng con số, chứ không phải chỉ bỏ qua khi ví rỗng.
    const kD = await mkKhach("Chi Con It");
    const dD = await mkDon(kD, 10300000); // ⇒ 1.030 điểm
    await chot(dD);
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_earn_for_order($1)`, [dD]);
      await c.query(`select public.loyalty_redeem($1,$2,null,'Tieu bot o cho khac')`, [kD, 1000]);
    });
    check("khách tích 1.030 điểm, tiêu 1.000 ⇒ ví còn 30", (await vi(kD)) === 30, `ví = ${await vi(kD)}`);
    const hD = await mkHoan(dD, kD, 1);
    await chot(hD);
    {
      const d = await dongCuaHoan(hD);
      const thu2 = d.find((x) => x.reason === "return_clawback");
      check("muốn thu 1.030 nhưng ví chỉ còn 30 ⇒ thu ĐÚNG 30, ví về 0, KHÔNG âm",
        d.length === 1 && Number(thu2?.delta_points) === -30 && (await vi(kD)) === 0,
        `${JSON.stringify(d)} · ví = ${await vi(kD)}`);
      check("ghi chú nói RÕ vì sao thu hụt (chủ tiệm đọc được, không tưởng máy tính sai)",
        /đáng lẽ 1030/.test(thu2?.note ?? ""), JSON.stringify(thu2?.note));
    }

    // ── Ca 4: chạy lại lần hai ⇒ KHÔNG đổi gì ──
    // Gọi thẳng hàm chứ không đổi trạng thái: trigger chỉ nổ một lần theo thiết
    // kế, nên đường duy nhất chứng minh được tính idempotent là gọi lại tay.
    {
      const viTruoc = await vi(kA);
      const dongTruoc = (await dongCuaHoan(hA)).length;
      // Bọc savepoint: khi tháo chốt sâu, lần chạy thứ hai đụng chỉ mục duy nhất
      // và NÉM lỗi — không bọc thì cả bộ kiểm chết đứng thay vì báo ĐỎ một ca.
      const r = await thu(async () => (await c.query(`select public.loyalty_settle_return($1) j`, [hA])).rows[0].j);
      check("chạy quyết toán lần HAI cho cùng phiếu hoàn ⇒ báo đã quyết toán, không làm gì thêm",
        r.ok && r.v.ly_do === "da_quyet_toan" && Number(r.v.tra_lai) === 0 &&
        Number(r.v.thu_lai) === 0, JSON.stringify(r));
      check("chạy lần HAI ⇒ ví khách và số dòng sổ KHÔNG đổi (không nhân đôi)",
        (await vi(kA)) === viTruoc && (await dongCuaHoan(hA)).length === dongTruoc,
        `ví ${viTruoc}->${await vi(kA)} · dòng ${dongTruoc}->${(await dongCuaHoan(hA)).length}`);

      // Lớp ③ — kiểm TRỰC DIỆN, vì không tháo được bằng phép thay câu lệnh.
      // Kết nối này là CHỦ bảng nên qua được RLS; thứ phải chặn nó là CHỈ MỤC.
      const r2 = await thu(async () => c.query(
        `insert into public.loyalty_ledger
           (tenant_id, contact_id, delta_points, reason, order_id, expires_at, remaining)
         values ($1,$2,1,'return_refund',$3, now() + interval '1 year', 1)`, [t.id, kA, hA]));
      check("CSDL từ chối dòng quyết toán TRÙNG cho cùng phiếu hoàn (chỉ mục duy nhất)",
        !r2.ok && /loyalty_ledger_return_unique/.test(r2.e), r2.ok ? "ghi được!" : r2.e);
    }

    // ── Ca 5: đơn gốc không dùng điểm, không được tặng điểm ⇒ KHÔNG dòng thừa ──
    const kE = await mkKhach("Chi Don Nho");
    const dE = await mkDon(kE, 5000); // dưới 10.000đ ⇒ tích 0 điểm
    await chot(dE);
    await asUser(uid, NV, async () => {
      await c.query(`select public.loyalty_earn_for_order($1)`, [dE]);
    });
    const hE = await mkHoan(dE, kE, 1);
    await chot(hE);
    check("đơn gốc không tiêu điểm, không được tặng điểm ⇒ hoàn hàng KHÔNG sinh dòng sổ nào",
      (await dongCuaHoan(hE)).length === 0 && (await soDiem(kE)) === 0,
      `${JSON.stringify(await dongCuaHoan(hE))} · tổng sổ = ${await soDiem(kE)}`);

    // ── Hai lý do MỚI không mở thêm cửa ghi nào ──
    // Sổ điểm append-only (#157) chỉ giữ được nếu MỌI lý do đều không có policy
    // ghi. Thêm giá trị vào ràng buộc `reason` mà quên chỗ này là tự tay mở cửa.
    await asUser(uid, { tenant_id: t.id, role: "owner" }, async () => {
      const r = await thu(async () => c.query(
        `insert into public.loyalty_ledger (tenant_id, contact_id, delta_points, reason, expires_at, remaining)
           values ($1,$2,500,'return_refund', now() + interval '1 year', 500)`, [t.id, kA]));
      check("CHỦ TIỆM cũng KHÔNG tự ghi được dòng 'trả lại điểm' (chỉ qua hàm)",
        !r.ok, r.ok ? "ghi được!" : "");
    });
  }

  console.log(
    fail === 0
      ? `[voucher-diem-smoke] ${n}/${n} PASS — voucher + sổ điểm đúng luật, không để lại dữ liệu.`
      : `[voucher-diem-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
  );
} finally {
  await c.query("rollback");
  await c.end();
}
process.exit(fail === 0 ? 0 : 1);
