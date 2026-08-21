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

import { themThanhVien } from "./ho-tro/tu-cach-thanh-vien.mjs";
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
  // Bắt buộc từ #301 — xem `scripts/ho-tro/tu-cach-thanh-vien.mjs`.
  await themThanhVien(c, t.id, uChu, "owner");
  await themThanhVien(c, t.id, uQL, "manager");
  await themThanhVien(c, t.id, uNV);
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

  // ══════════════════════════════════════════════════════════════════════
  // ĐƯỜNG GHI THÔ — lỗ tiền thật, bịt bằng migration #183
  // ══════════════════════════════════════════════════════════════════════
  // ⚠️ VÌ SAO KHỐI NÀY PHẢI CÓ dù bên trên đã có ca "LÁCH 3b". Ca đó dựng đơn
  // bằng KẾT NỐI QUẢN TRỊ nên `orders.created_by` là null; policy
  // `order_lines_write` chỉ cho `staff` ghi dòng của ĐƠN MÌNH TẠO, nên nó bị
  // chặn Ở TẦNG RLS trước khi tới lượt trần. Nó xanh vì một lý do KHÁC với lý
  // do người đọc tưởng — và trần chưa từng bị thử ở đường ghi thô.
  //
  // Nhân viên bán hàng THẬT thì đơn nào cũng do chính họ tạo ⇒ RLS cho qua ⇒
  // `PATCH /rest/v1/order_lines {"discount_vnd": …}` ghi được bất kỳ số nào.
  // Khối này dựng đúng cảnh đó: đơn do CHÍNH nhân viên tạo.
  console.log("[tran-giam-gia-smoke] Ghi THÔ vào order_lines (không qua hàm) phải bị trần chặn:");
  const moDonCuaNhanVien = async (kind = "order", parent = null) => {
    const { rows: [o] } = await c.query(
      `insert into public.orders (tenant_id, kind, contact_id, status, created_by, parent_order_id)
         values ($1,$2,$3,'draft',$4,$5) returning id`,
      [t.id, kind, kh.id, uNV, parent],
    );
    return o.id;
  };
  const ghiThang = (orderId, giam, gia = 1000000, sl = 1) =>
    c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,$4,$5,$6) returning id`,
      [t.id, orderId, item.id, sl, gia, giam],
    );
  const laBiTran = (r) => !r.ok && /discount_cap_exceeded/.test(r.e);

  const donNV = await moDonCuaNhanVien();
  await asUser(uNV, NV, async () => {
    const r = await thu(() => ghiThang(donNV, 300000)); // 30% — vượt trần 5%
    check("nhân viên ghi THẲNG 30% vào đơn của chính mình ⇒ BỊ CHẶN",
      laBiTran(r), r.ok ? "ghi được — trần bị đi vòng!" : r.e);
  });
  let dongTrongTran;
  await asUser(uNV, NV, async () => {
    const r = await thu(() => ghiThang(donNV, 50000)); // 5% — đúng trần
    check("nhân viên ghi THẲNG 5% (đúng trần) ⇒ vẫn qua, không chặn oan",
      r.ok && r.v.rowCount === 1, r.e ?? "");
    if (r.ok) dongTrongTran = r.v.rows[0].id;
  });
  await asUser(uNV, NV, async () => {
    const r = await thu(() => c.query(
      `update public.order_lines set discount_vnd = 900000 where id=$1`, [dongTrongTran]));
    check("nhân viên SỬA dòng của mình lên 90% ⇒ BỊ CHẶN",
      laBiTran(r), r.ok ? `sửa được ${r.v.rowCount} dòng!` : r.e);
  });
  // Trần là một TỶ LỆ: canh tử số mà bỏ mẫu số thì hạ giá dòng là lách xong.
  await asUser(uNV, NV, async () => {
    const r = await thu(() => c.query(
      `update public.order_lines set unit_price_vnd = 100000 where id=$1`, [dongTrongTran]));
    check("nhân viên HẠ GIÁ DÒNG để đẩy 5% thành 50% ⇒ BỊ CHẶN",
      laBiTran(r), r.ok ? `sửa được ${r.v.rowCount} dòng!` : r.e);
  });
  await asUser(uQL, QL, async () => {
    const r1 = await thu(() => ghiThang(donNV, 120000)); // 12% — dưới trần 15%
    check("quản lý ghi THẲNG 12% (trần 15%) ⇒ qua", r1.ok && r1.v.rowCount === 1, r1.e ?? "");
    const r2 = await thu(() => ghiThang(donNV, 300000)); // 30% — vượt trần 15%
    check("quản lý ghi THẲNG 30% (trần 15%) ⇒ BỊ CHẶN", laBiTran(r2), r2.ok ? "ghi được!" : r2.e);
  });
  await asUser(uChu, CHU, async () => {
    const r = await thu(() => ghiThang(donNV, 950000)); // 95% — chủ tiệm không trần
    check("chủ tiệm ghi THẲNG 95% ⇒ qua (chủ tiệm không có trần)",
      r.ok && r.v.rowCount === 1, r.e ?? "");
  });
  {
    const r = await thu(() => ghiThang(donNV, 900000)); // kết nối quản trị, không vai
    check("kết nối quản trị (không có vai) ghi 90% ⇒ KHÔNG chặn, đường nội bộ còn sống",
      r.ok && r.v.rowCount === 1, r.e ?? "");
  }

  // Cửa miễn ③ — phiếu đã duyệt. Không có cửa này thì `discount_decide` bị
  // chính trigger của mình chặn khi nó áp mức vượt trần vào dòng hàng.
  console.log("[tran-giam-gia-smoke] Bốn cửa miễn phải mở đúng chỗ:");
  {
    const don = await moDonCuaNhanVien();
    let dong;
    await asUser(uNV, NV, async () => {
      const r = await thu(() => ghiThang(don, 0));
      dong = r.ok ? r.v.rows[0].id : null;
      const x = await thu(() => giam(dong, 400000)); // 40% — vượt trần
      check("xin duyệt 40% ⇒ ra nhánh chờ duyệt (KHÔNG phải lỗi cụt)",
        x.ok && x.v.ket_qua === "cho_duyet", JSON.stringify(x));
    });
    const { rows: [p2] } = await c.query(
      `select id from public.discount_approvals where order_line_id=$1 and status='pending'`, [dong]);
    await asUser(uChu, CHU, async () => {
      const r = await thu(async () =>
        (await c.query(`select public.discount_decide($1,true,'ok') j`, [p2.id])).rows[0].j);
      check("CỬA ③ — duyệt mức 40% (vượt trần người xin) ⇒ trigger KHÔNG tự chặn chính nó",
        r.ok && r.v.ket_qua === "da_duyet", JSON.stringify(r));
    });
    const { rows: r2 } = await c.query(`select discount_vnd from public.order_lines where id=$1`, [dong]);
    check("duyệt xong thì 400.000đ ĐƯỢC ÁP THẬT vào dòng hàng",
      Number(r2[0].discount_vnd) === 400000, JSON.stringify(r2));
    // Ghi thô ĐÚNG số đã được duyệt cho ĐÚNG dòng đó vẫn phải qua — đây mới là
    // phép thử thật của cửa ③ (hai ca trên đi qua hàm definer nên lọt cửa ②).
    await asUser(uNV, NV, async () => {
      await thu(() => c.query(`update public.order_lines set discount_vnd = 0 where id=$1`, [dong]));
      const r = await thu(() => c.query(
        `update public.order_lines set discount_vnd = 400000 where id=$1`, [dong]));
      check("CỬA ③ — ghi thô ĐÚNG số đã có phiếu duyệt ⇒ qua",
        r.ok && r.v.rowCount === 1, r.e ?? "");
      const r2 = await thu(() => c.query(
        `update public.order_lines set discount_vnd = 500000 where id=$1`, [dong]));
      check("nhưng ghi thô số KHÁC số đã duyệt ⇒ vẫn BỊ CHẶN",
        laBiTran(r2), r2.ok ? "ghi được!" : r2.e);
    });
  }
  {
    // CỬA ④ — đơn hoàn. `createReturn` chép giảm giá theo tỷ lệ từ dòng gốc đã
    // duyệt; dòng hoàn có qty ÂM nên "tỷ lệ giảm" tính ra vô nghĩa.
    const donHoan = await moDonCuaNhanVien("return", donNV);
    await asUser(uNV, NV, async () => {
      const r = await thu(() => ghiThang(donHoan, 400000, 1000000, -1)); // 40% trên dòng hoàn
      check("CỬA ④ — dòng ĐƠN HOÀN chép giảm giá 40% ⇒ qua, nghiệp vụ trả hàng không gãy",
        r.ok && r.v.rowCount === 1, r.e ?? "");
    });
  }
  {
    // CỬA ② — voucher. `voucher_apply` (#159) phân bổ tiền mã giảm giá xuống
    // `order_lines.discount_vnd`. Mã 30% của chính tiệm phát hành KHÔNG liên
    // quan tới trần cá nhân của nhân viên gõ mã — chặn là giết tính năng voucher.
    await c.query(
      `insert into public.vouchers (tenant_id, code, kind, percent_off, max_uses, max_discount_vnd, expires_at)
         values ($1,$2,'percent',30,10,10000000, now() + interval '1 day')`,
      [t.id, "THUTRAN" + st],
    );
    const donMa = await moDonCuaNhanVien();
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd)
         values ($1,$2,$3,1,1000000,0)`, [t.id, donMa, item.id]);
    await asUser(uNV, NV, async () => {
      const r = await thu(async () =>
        (await c.query(`select public.voucher_apply($1,$2) j`, [donMa, "THUTRAN" + st])).rows[0].j);
      check("CỬA ② — nhân viên áp mã giảm 30% của tiệm ⇒ qua, voucher không chết",
        r.ok && r.v.ok === true, JSON.stringify(r));
    });
    const { rows } = await c.query(
      `select coalesce(sum(discount_vnd),0)::bigint g from public.order_lines where order_id=$1`, [donMa]);
    check("tiền mã giảm ĐƯỢC ghi thật xuống dòng hàng (300.000đ)",
      Number(rows[0].g) === 300000, JSON.stringify(rows));
  }

  console.log(
    fail === 0
      ? `[tran-giam-gia-smoke] ${n}/${n} PASS — trần theo vai có thật, đường ghi thô đã đóng, bốn cửa miễn còn mở đúng chỗ.`
      : `[tran-giam-gia-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
  );
} finally {
  await c.query("rollback");
  await c.end();
}
process.exit(fail === 0 ? 0 : 1);
