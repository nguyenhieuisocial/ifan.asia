#!/usr/bin/env node
/**
 * Cổng chống tái phát cho TRẦN GIẢM GIÁ THEO VAI (migration #165, việc #180).
 *
 * Đây là chỗ mất tiền trực tiếp: một lỗ ở đây nghĩa là nhân viên tự giảm bao
 * nhiêu cũng được, và không ai biết cho tới lúc xem lãi cuối tháng.
 *
 * Ba đường lách phải bị đóng, và bộ này kiểm cả ba:
 *   1. Xin rồi TỰ DUYỆT phiếu của chính mình.
 *   2. Nhờ đồng nghiệp có trần THẤP HƠN mức đang xin gật hộ.
 *   3. Ghi thẳng vào bảng phiếu / bảng dòng hàng để bỏ qua hàm.
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
  const uNV = randomUUID();
  const uQL = randomUUID();
  const uChu = randomUUID();
  const st = Date.now();
  await c.query(
    `insert into auth.users (id, aud, role, email) values
       ($1,'authenticated','authenticated',$2),
       ($3,'authenticated','authenticated',$4),
       ($5,'authenticated','authenticated',$6)`,
    [uNV, `nv-${st}@t.local`, uQL, `ql-${st}@t.local`, uChu, `chu-${st}@t.local`],
  );
  const { rows: [t] } = await c.query(
    `insert into public.tenants (name, slug) values ('Tiem thu tran', $1) returning id`,
    ["thu-tran-" + st],
  );
  const { rows: [item] } = await c.query(
    `insert into public.items (tenant_id, kind, name, unit, price_vnd, status)
       values ($1,'product','San pham','cai',0,'active') returning id`,
    [t.id],
  );
  //  là NOT NULL — đơn phải gắn khách (đo lúc chạy bộ kiểm).
  const { rows: [kh] } = await c.query(
    `insert into public.contacts (tenant_id, full_name) values ($1,'Khach thu tran') returning id`,
    [t.id],
  );
  const moDong = async () => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status) values ($1,'order',$2,'draft') returning id`,
      [t.id, kh.id],
    );
    const { rows: [l] } = await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,1,1000000,0) returning id`,
      [t.id, o.id, item.id],
    );
    return l.id;
  };
  const NV = { tenant_id: t.id, role: "staff" };
  const QL = { tenant_id: t.id, role: "manager" };
  const CHU = { tenant_id: t.id, role: "owner" };
  const XEM = { tenant_id: t.id, role: "viewer" };
  const giam = async (lineId, tien, ly = null) =>
    (await c.query(`select public.discount_request($1,$2,$3) j`, [lineId, tien, ly])).rows[0].j;

  console.log("[tran-giam-gia-smoke] Trong trần thì áp thẳng, vượt trần thì chờ duyệt:");
  {
    const l = await moDong();
    await asUser(uNV, NV, async () => {
      const r = await thu(() => giam(l, 40000)); // 4% — dưới trần 5%
      check("nhân viên giảm 4% (trần 5%) ⇒ áp ngay", r.ok && r.v.ket_qua === "da_ap", JSON.stringify(r));
    });
    const { rows } = await c.query(`select discount_vnd from public.order_lines where id=$1`, [l]);
    check("dòng hàng ĐÃ được giảm thật 40.000đ", Number(rows[0].discount_vnd) === 40000, JSON.stringify(rows));
  }
  const lVuot = await moDong();
  await asUser(uNV, NV, async () => {
    const r = await thu(() => giam(lVuot, 300000)); // 30% — vượt trần 5%
    check("nhân viên giảm 30% ⇒ CHỜ DUYỆT, không chặn cứng",
      r.ok && r.v.ket_qua === "cho_duyet" && Number(r.v.tran_cua_ban) === 5, JSON.stringify(r));
  });
  {
    const { rows } = await c.query(`select discount_vnd from public.order_lines where id=$1`, [lVuot]);
    check("dòng hàng CHƯA được giảm khi còn chờ duyệt", Number(rows[0].discount_vnd) === 0, JSON.stringify(rows));
  }
  {
    const { rows } = await c.query(
      `select count(*)::int n from public.discount_approvals where order_line_id=$1 and status='pending'`, [lVuot]);
    check("sinh ĐÚNG một phiếu chờ duyệt", rows[0].n === 1, JSON.stringify(rows));
  }
  await asUser(uNV, NV, async () => {
    const r = await thu(() => giam(lVuot, 350000));
    check("xin lại lần nữa ⇒ vẫn MỘT phiếu, không đẻ thêm", r.ok && r.v.ket_qua === "cho_duyet", JSON.stringify(r));
  });
  {
    const { rows } = await c.query(
      `select count(*)::int n from public.discount_approvals where order_line_id=$1 and status='pending'`, [lVuot]);
    check("vẫn đúng một phiếu sau khi xin lại", rows[0].n === 1, JSON.stringify(rows));
  }

  console.log("[tran-giam-gia-smoke] Ba đường lách phải bị đóng:");
  const { rows: [phieu] } = await c.query(
    `select id from public.discount_approvals where order_line_id=$1 and status='pending'`, [lVuot]);
  await asUser(uNV, NV, async () => {
    const r = await thu(async () =>
      (await c.query(`select public.discount_decide($1,true) j`, [phieu.id])).rows[0].j);
    check("LÁCH 1 — nhân viên tự duyệt phiếu ⇒ bị chặn ở vai", !r.ok && /forbidden/.test(r.e), JSON.stringify(r));
  });
  await asUser(uQL, QL, async () => {
    const r = await thu(async () =>
      (await c.query(`select public.discount_decide($1,true) j`, [phieu.id])).rows[0].j);
    check("LÁCH 2 — quản lý trần 15% gật cho khoản 35% ⇒ bị chặn",
      r.ok && r.v.ket_qua === "vuot_tran_cua_nguoi_duyet", JSON.stringify(r));
  });
  await asUser(uNV, NV, async () => {
    const r = await thu(() => c.query(
      `insert into public.discount_approvals (tenant_id, order_line_id, order_id, discount_vnd, discount_pct,
         line_total_vnd, requested_by, requested_role, status, decided_by, decided_at)
       select $1,$2,order_id,900000,90,1000000,$3,'staff','approved',$3,now()
         from public.order_lines where id=$2`, [t.id, lVuot, uNV]));
    // Phải đo SỐ DÒNG THẬT SỰ VÀO, không chỉ đo "có văng lỗi không":
    // `insert ... select` mà nguồn bị RLS lọc sạch thì chạy XONG với 0 dòng,
    // không lỗi. Đọc kết quả kiểu đó thành "ghi được" là báo động giả.
    const soDongVao = r.ok ? r.v.rowCount : 0;
    check("LÁCH 3 — ghi thẳng phiếu ĐÃ DUYỆT vào bảng ⇒ không dòng nào vào",
      soDongVao === 0, r.ok ? `ghi được ${soDongVao} dòng!` : "");
  });
  await asUser(uNV, NV, async () => {
    const r = await thu(() => c.query(
      `update public.order_lines set discount_vnd = 900000 where id=$1`, [lVuot]));
    const suaDuoc = r.ok && r.v.rowCount > 0;
    check("LÁCH 3b — nhân viên sửa thẳng giảm giá trên dòng hàng ⇒ bị chặn",
      !suaDuoc, r.ok ? `sửa được ${r.v.rowCount} dòng!` : "");
  });

  console.log("[tran-giam-gia-smoke] Chủ tiệm duyệt được, và duyệt xong thì ÁP THẬT:");
  await asUser(uChu, CHU, async () => {
    const r = await thu(async () =>
      (await c.query(`select public.discount_decide($1,true,'ok') j`, [phieu.id])).rows[0].j);
    check("chủ tiệm duyệt ⇒ được", r.ok && r.v.ket_qua === "da_duyet", JSON.stringify(r));
  });
  {
    const { rows } = await c.query(`select discount_vnd from public.order_lines where id=$1`, [lVuot]);
    check("DUYỆT XONG thì giảm giá ĐƯỢC ÁP THẬT vào dòng hàng (350.000đ)",
      Number(rows[0].discount_vnd) === 350000, JSON.stringify(rows));
  }
  await asUser(uChu, CHU, async () => {
    const r = await thu(async () =>
      (await c.query(`select public.discount_decide($1,true) j`, [phieu.id])).rows[0].j);
    check("duyệt lại phiếu đã quyết ⇒ báo không còn chờ, không áp lại",
      r.ok && r.v.ket_qua === "khong_con_cho_duyet", JSON.stringify(r));
  });

  console.log("[tran-giam-gia-smoke] Vai và cấu hình:");
  {
    const l2 = await moDong();
    await asUser(uNV, XEM, async () => {
      const r = await thu(() => giam(l2, 10000));
      check("vai Chỉ xem KHÔNG xin giảm giá được", !r.ok && /forbidden/.test(r.e), JSON.stringify(r));
    });
    await asUser(uChu, CHU, async () => {
      const r = await thu(() => giam(l2, 900000)); // 90%
      check("chủ tiệm giảm 90% ⇒ áp ngay (không có trần)", r.ok && r.v.ket_qua === "da_ap", JSON.stringify(r));
    });
    const l3 = await moDong();
    await asUser(uQL, QL, async () => {
      const r = await thu(() => giam(l3, 120000)); // 12% — dưới trần 15%
      check("quản lý giảm 12% (trần 15%) ⇒ áp ngay", r.ok && r.v.ket_qua === "da_ap", JSON.stringify(r));
    });
  }
  {
    const r = await thu(() => c.query(
      `update public.discount_caps set staff_max_pct = 50, manager_max_pct = 20 where tenant_id=$1`, [t.id]));
    check("cấu hình NGƯỢC (nhân viên 50% > quản lý 20%) ⇒ CSDL từ chối", !r.ok, r.ok ? "lưu được!" : "");
  }
  {
    const l4 = await moDong();
    await asUser(uNV, NV, async () => {
      const r = await thu(() => giam(l4, 2000000)); // lớn hơn giá dòng
      check("giảm nhiều hơn giá trị dòng hàng ⇒ từ chối", r.ok && r.v.ket_qua === "giam_qua_gia_dong", JSON.stringify(r));
    });
  }

  console.log(
    fail === 0
      ? `[tran-giam-gia-smoke] ${n}/${n} PASS — trần theo vai có thật, ba đường lách đều đóng.`
      : `[tran-giam-gia-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
  );
} finally {
  await c.query("rollback");
  await c.end();
}
process.exit(fail === 0 ? 0 : 1);
