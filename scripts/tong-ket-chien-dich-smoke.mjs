#!/usr/bin/env node
/**
 * Cổng chống tái phát cho TỔNG KẾT CHIẾN DỊCH (migration #181).
 *
 * Bảng `campaign_summary` dựng từ #171 nhưng chưa có gì ghi vào, nên màn
 * `/app/events` chỉ biết nói "chưa có tổng kết". Bản #181 mở đường ghi — và
 * đường ghi đó tính TIỀN, nên sai ở đây là chủ tiệm quyết định sai về tiền.
 *
 * Bảy luật phải đứng vững:
 *   1. Doanh thu là số TRƯỚC khi trừ mã (tiền giảm đã nằm sẵn trong dòng hàng
 *      — trừ lần nữa là trừ hai lần).
 *   2. Chỉ đơn `completed`; đơn nháp/huỷ không tính là tiền.
 *   3. Giá vốn đọc `order_line_costs`; dòng CHƯA nhập giá vốn KHÔNG được cộng
 *      thành 0 mà phải đếm vào `cogs_missing_lines`.
 *   4. "Thật sự tăng thêm" = đơn trong kỳ − đơn kỳ nền dài bằng đúng như thế.
 *   5. Người rút đồng ý: chỉ đếm người ĐÃ NHẬN TIN của đúng đợt này và rút SAU đó.
 *   6. Chiến dịch dừng (hết ngày hoặc chạm trần) thì TỰ tính tổng kết.
 *   7. Chỉ owner/admin/manager đọc được bản tổng kết (giá vốn + doanh thu).
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
  const uChu = randomUUID();
  const uNV = randomUUID();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2), ($3,'authenticated','authenticated',$4)`,
    [uChu, `chu-${st}@t.local`, uNV, `nv-${st}@t.local`],
  );
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem chien dich', $1) returning id`,
    ["ck-" + st],
  );
  const { rows: [t2] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem khac', $1) returning id`,
    ["ck-khac-" + st],
  );
  await c.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1,$2,'owner'), ($1,$3,'staff')`,
    [t.id, uChu, uNV],
  );

  // Hai mặt hàng: MỘT có giá vốn, MỘT chưa từng nhập giá vốn (luật 3).
  const { rows: [coVon] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','Co gia von','chai',500000,'active') returning id`,
    [t.id],
  );
  const { rows: [khongVon] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','Chua nhap gia von','chai',300000,'active') returning id`,
    [t.id],
  );
  await c.query(`insert into public.item_costs (item_id, tenant_id, cost_vnd) values ($1,$2,200000)`, [
    coVon.id,
    t.id,
  ]);

  const themKhach = async (ten) => {
    const { rows: [k] } = await c.query(
      `insert into public.contacts (tenant_id, full_name) values ($1,$2) returning id`,
      [t.id, ten],
    );
    return k.id;
  };
  const khCu = await themKhach("Khach cu");
  const khMoi1 = await themKhach("Khach moi 1");
  const khMoi2 = await themKhach("Khach moi 2");

  const batDau = new Date(Date.now() - 10 * 86400000);
  const ketThuc = new Date(Date.now() + 10 * 86400000);

  // Khách cũ có đơn TRƯỚC khi chiến dịch bắt đầu (25 ngày trước) — vừa làm nền
  // cho "khách mới", vừa nằm NGOÀI kỳ nền 10 ngày nên không đội số nền lên.
  const taoDon = async (contactId, lines, opts = {}) => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status, created_by, created_at)
         values ($1,'order',$2,'draft',$3,$4) returning id`,
      [t.id, contactId, uChu, opts.at ?? new Date()],
    );
    for (const [itemId, qty, gia, giam] of lines) {
      await c.query(
        `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
           values ($1,$2,$3,$4,$5,$6)`,
        [t.id, o.id, itemId, qty, gia, giam ?? 0],
      );
    }
    // Máy trạng thái ở CSDL (#207) bắt đơn đi ĐÚNG đường
    // `draft → confirmed → completed`; bản cũ nhảy thẳng từ nháp sang xong.
    // Đây là chốt ĐÚNG (nó chặn đường lùi đơn để sinh hoa hồng lần hai), nên
    // sửa BỘ KIỂM cho đi đúng đường, không nới chốt.
    const dich = opts.status ?? "completed";
    if (dich !== "draft") {
      if (dich === "completed") {
        await c.query(`update public.orders set status = 'confirmed' where id = $1`, [o.id]);
      }
      await c.query(`update public.orders set status = $2 where id = $1`, [o.id, dich]);
    }
    return o.id;
  };

  await taoDon(khCu, [[coVon.id, 1, 500000]], { at: new Date(Date.now() - 25 * 86400000) });
  // Một đơn trong KỲ NỀN (10 ngày ngay trước ngày bắt đầu) — số nền = 1.
  await taoDon(khCu, [[coVon.id, 1, 500000]], { at: new Date(Date.now() - 15 * 86400000) });

  const { rows: [cd] } = await c.query(
    `insert into public.campaigns (tenant_id, name, start_at, end_at, max_discount_total_vnd, ad_cost_vnd, status, created_by)
       values ($1,'Uu dai thang 8',$2,$3,50000000,2000000,'running',$4) returning id`,
    [t.id, batDau, ketThuc, uChu],
  );
  const { rows: [ma] } = await c.query(
    `insert into public.vouchers (tenant_id, code, kind, amount_off_vnd, max_uses, max_discount_vnd, expires_at, campaign_id, created_by)
       values ($1,$2,'amount',100000,100,50000000,$3,$4,$5) returning id`,
    [t.id, "CK" + st, ketThuc, cd.id, uChu],
  );

  /**
   * Đơn có dùng mã của chiến dịch. Tiền giảm ĐÃ trừ vào dòng hàng (đúng như
   * `voucher_apply` #159 làm) rồi mới ghi `voucher_redemptions` — nếu tổng kết
   * trừ lần nữa thì luật 1 vỡ và bộ này bắt được.
   */
  const donCoMa = async (contactId, lines, giam, opts = {}) => {
    const orderId = await taoDon(contactId, lines, opts);
    await c.query(
      `insert into public.voucher_redemptions (tenant_id, voucher_id, order_id, contact_id, discount_vnd, created_by)
         values ($1,$2,$3,$4,$5,$6)`,
      [t.id, ma.id, orderId, contactId, giam, uChu],
    );
    return orderId;
  };

  // Đơn 1: 1 × 500.000 (có giá vốn 200.000) đã trừ 100.000 ⇒ dòng còn 400.000.
  await donCoMa(khMoi1, [[coVon.id, 1, 500000, 100000]], 100000, {
    at: new Date(Date.now() - 5 * 86400000),
  });
  // Đơn 2: 1 × 300.000 (CHƯA nhập giá vốn) đã trừ 100.000 ⇒ dòng còn 200.000.
  await donCoMa(khMoi2, [[khongVon.id, 1, 300000, 100000]], 100000, {
    at: new Date(Date.now() - 3 * 86400000),
  });
  // Đơn 3: khách CŨ, đã trừ 100.000 ⇒ không tính là khách mới.
  await donCoMa(khCu, [[coVon.id, 1, 500000, 100000]], 100000, {
    at: new Date(Date.now() - 2 * 86400000),
  });
  // Đơn 4: dùng mã nhưng đơn bị HUỶ ⇒ không được tính vào tiền (luật 2).
  await donCoMa(khMoi1, [[coVon.id, 1, 500000, 100000]], 100000, {
    at: new Date(Date.now() - 1 * 86400000),
    status: "cancelled",
  });

  await c.query(`select public.campaign_tong_ket($1)`, [cd.id]);
  const layTK = async () => {
    const { rows } = await c.query(`select * from public.campaign_summary where campaign_id = $1`, [
      cd.id,
    ]);
    return rows[0];
  };
  const tk = await layTK();

  // Ba đơn hợp lệ: dòng còn lại 400k + 200k + 400k = 1.000.000; giảm 3 × 100k.
  check(
    "Doanh thu = tổng dòng + tiền giảm (KHÔNG trừ mã hai lần)",
    Number(tk.revenue_vnd) === 1_300_000,
    `revenue=${tk.revenue_vnd}`,
  );
  check("Tiền giảm = 300.000 (3 lượt, KHÔNG tính đơn đã huỷ)", Number(tk.discount_vnd) === 300_000, `d=${tk.discount_vnd}`);
  check("Lượt dùng mã = 3 (đơn đã huỷ không tính)", Number(tk.uses_count) === 3, `n=${tk.uses_count}`);
  check("Tiền quảng cáo lấy từ chiến dịch = 2.000.000", Number(tk.ad_cost_vnd) === 2_000_000, `ad=${tk.ad_cost_vnd}`);
  check(
    "Giá vốn = 400.000 (chỉ 2 dòng CÓ giá vốn), KHÔNG cộng dòng thiếu thành 0",
    Number(tk.cogs_vnd) === 400_000,
    `cogs=${tk.cogs_vnd}`,
  );
  check(
    "Đếm đúng 1 dòng chưa nhập giá vốn ⇒ màn phải nói 'còn lại' là cận trên",
    Number(tk.cogs_missing_lines) === 1,
    `thieu=${tk.cogs_missing_lines}`,
  );
  check(
    "Còn lại = doanh thu − giảm − quảng cáo − giá vốn",
    Number(tk.net_vnd) === 1_300_000 - 300_000 - 2_000_000 - 400_000,
    `net=${tk.net_vnd}`,
  );
  check(
    "Khách mới = 2 (khách cũ đã có đơn trước ngày bắt đầu không tính)",
    Number(tk.new_customer_count) === 2,
    `moi=${tk.new_customer_count}`,
  );
  // Trong kỳ: 3 đơn completed (đơn huỷ không tính). Kỳ nền 10 ngày trước: 1 đơn.
  check(
    "Thật sự tăng thêm = 3 trong kỳ − 1 kỳ nền = 2",
    Number(tk.incremental_count) === 2,
    `inc=${tk.incremental_count}`,
  );

  // ── Người rút đồng ý nhận tin (luật 5) ──
  await c.query(
    `update public.contacts set marketing_consent = 'granted', marketing_consent_at = now()
      where id = any($1::uuid[])`,
    [[khMoi1, khMoi2, khCu]],
  );
  const gioGui = new Date();
  gioGui.setUTCHours(5, 0, 0, 0); // 12:00 giờ VN — trong khung 8h–21h của #171
  const { rows: [dot] } = await c.query(
    `insert into public.campaign_sends (tenant_id, campaign_id, send_at, body, created_by)
       values ($1,$2,$3,'Uu dai',$4) returning id`,
    [t.id, cd.id, gioGui, uChu],
  );
  await c.query(
    `insert into public.campaign_send_recipients (tenant_id, send_id, contact_id) values ($1,$2,$3), ($1,$2,$4)`,
    [t.id, dot.id, khMoi1, khMoi2],
  );
  // khMoi1 rút SAU khi nhận tin ⇒ tính. khCu rút nhưng KHÔNG nhận tin đợt này ⇒ không tính.
  await c.query(
    `update public.contacts set marketing_consent = 'withdrawn', marketing_consent_withdrawn_at = now()
      where id = any($1::uuid[])`,
    [[khMoi1, khCu]],
  );
  await c.query(`select public.campaign_tong_ket($1)`, [cd.id]);
  const tk2 = await layTK();
  check(
    "Người rút đồng ý = 1 (chỉ người ĐÃ NHẬN TIN đợt này và rút SAU đó)",
    Number(tk2.opt_out_count) === 1,
    `optout=${tk2.opt_out_count}`,
  );

  // ── Luật 6: chiến dịch dừng thì TỰ tính lại ──
  await c.query(`update public.campaigns set ad_cost_vnd = 3000000 where id = $1`, [cd.id]);
  await c.query(`update public.campaigns set status = 'ended' where id = $1`, [cd.id]);
  const tk3 = await layTK();
  check(
    "Chốt chiến dịch ('ended') TỰ tính lại tổng kết với tiền quảng cáo mới",
    Number(tk3.ad_cost_vnd) === 3_000_000,
    `ad=${tk3.ad_cost_vnd}`,
  );

  // Chạm trần tiền giảm ⇒ máy tự dừng ⇒ cũng phải có bản tổng kết.
  const { rows: [cd2] } = await c.query(
    `insert into public.campaigns (tenant_id, name, start_at, end_at, max_discount_total_vnd, status, created_by)
       values ($1,'Dot cham tran',$2,$3,150000,'running',$4) returning id`,
    [t.id, batDau, ketThuc, uChu],
  );
  const { rows: [ma2] } = await c.query(
    `insert into public.vouchers (tenant_id, code, kind, amount_off_vnd, max_uses, max_discount_vnd, expires_at, campaign_id, created_by)
       values ($1,$2,'amount',200000,100,50000000,$3,$4,$5) returning id`,
    [t.id, "TRAN" + st, ketThuc, cd2.id, uChu],
  );
  const donTran = await taoDon(khMoi2, [[coVon.id, 1, 500000, 200000]]);
  await c.query(
    `insert into public.voucher_redemptions (tenant_id, voucher_id, order_id, contact_id, discount_vnd, created_by)
       values ($1,$2,$3,$4,200000,$5)`,
    [t.id, ma2.id, donTran, khMoi2, uChu],
  );
  const { rows: [tt2] } = await c.query(`select status from public.campaigns where id = $1`, [cd2.id]);
  const { rows: [tkTran] } = await c.query(
    `select uses_count from public.campaign_summary where campaign_id = $1`,
    [cd2.id],
  );
  check(
    "Chạm trần ⇒ máy tự dừng VÀ tự sinh bản tổng kết (không đợi ai bấm)",
    tt2.status === "stopped" && tkTran && Number(tkTran.uses_count) === 1,
    JSON.stringify({ status: tt2.status, tk: tkTran }),
  );

  // ── Luật 7: quyền đọc + quyền gọi ──
  const docTK = async (uid, role, tenantId) =>
    asUser(uid, { tenant_id: tenantId, role }, async () => {
      const { rows } = await c.query(`select count(*)::int as n from public.campaign_summary`);
      return rows[0].n;
    });
  check("Chủ tiệm đọc được bản tổng kết", (await docTK(uChu, "owner", t.id)) === 2, "");
  check("Quản lý đọc được bản tổng kết", (await docTK(uChu, "manager", t.id)) === 2, "");
  check(
    "Nhân viên KHÔNG đọc được (bảng này chứa giá vốn + doanh thu)",
    (await docTK(uNV, "staff", t.id)) === 0,
    "",
  );
  check("Tiệm khác đọc 0 dòng", (await docTK(uChu, "owner", t2.id)) === 0, "");

  const nvGoi = await asUser(uNV, { tenant_id: t.id, role: "staff" }, () =>
    thu(() => c.query(`select public.campaign_tong_ket_yeu_cau($1)`, [cd.id])),
  );
  check(
    "Nhân viên gọi tay campaign_tong_ket_yeu_cau ⇒ bị chặn",
    !nvGoi.ok && /forbidden/.test(nvGoi.e),
    nvGoi.e ?? "không bị chặn",
  );
  const cheoTiem = await asUser(uChu, { tenant_id: t2.id, role: "owner" }, () =>
    thu(() => c.query(`select public.campaign_tong_ket_yeu_cau($1)`, [cd.id])),
  );
  check(
    "Gọi tổng kết cho chiến dịch TIỆM KHÁC ⇒ bị chặn",
    !cheoTiem.ok && /campaign_not_found/.test(cheoTiem.e),
    cheoTiem.e ?? "không bị chặn",
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${n - fail}/${n} đạt.`);
process.exit(fail === 0 ? 0 : 1);
