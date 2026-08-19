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
for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
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

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
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
