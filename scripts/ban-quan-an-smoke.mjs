#!/usr/bin/env node
/**
 * CỔNG: bán tại quầy cho quán ăn — bàn, đơn mở, ghi chú món, khách lẻ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Cụm này có ba chỗ hỏng IM LẶNG, không chỗ nào báo lỗi khi sai:
 *
 *   ① HAI ĐƠN TRÊN MỘT BÀN. Hai nhân viên cùng chạm "Bàn 03" trên hai máy là
 *      chuyện hằng ngày ở quán đông. Nếu chỉ kiểm ở màn thì cả hai lượt đều
 *      thấy bàn trống, cả hai tạo đơn, và đơn thứ hai thành ĐƠN MỒ CÔI: có
 *      dòng hàng, có tiền, nhưng màn bàn chỉ hiện một đơn nên không ai mở lại.
 *      Tiền của quán nằm trong một đơn không ai thấy.
 *
 *   ② GỘP NHẦM HAI LY KHÁC GHI CHÚ. Hai ly cà phê, một ly ít đường. Nếu máy
 *      gộp thành một dòng "2 ly" thì bếp làm sai, và không ai biết cho tới lúc
 *      khách phàn nàn. `null` và chuỗi rỗng là cùng một ý nhưng SQL coi khác
 *      nhau — đúng chỗ dễ trượt.
 *
 *   ③ ĐƠN TRỎ SANG BÀN CỦA TIỆM KHÁC. RLS chỉ kiểm `tenant_id` của chính dòng
 *      đang ghi, KHÔNG nhìn sang bảng cha. Không có trigger chốt thì tiệm A ghi
 *      được đơn gắn vào bàn tiệm B và RLS cho qua.
 *
 * ⚠️ MỌI PHÉP GHI Ở ĐÂY ĐỀU TRONG MỘT GIAO DỊCH RỒI ROLLBACK. Cổng chạy trên
 *   ĐÚNG kho dữ liệu của khách thật.
 *
 * Chạy: node scripts/ban-quan-an-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI cấp biến qua secrets */
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();
// Cổng kiểm chạy trên ĐÚNG kho dữ liệu của khách thật — một lượt kiểm treo sẽ
// giữ khoá và chặn cả việc áp bản vá khẩn. (luật 1 của soat-ky-luat-bo-kiem)
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat += 1;
  else truot += 1;
};

await c.query("begin");
try {
  // ── Lược đồ có đủ chỗ chứa chưa ────────────────────────────────────
  const { rows: cot } = await c.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'orders' and column_name in ('resource_id', 'tam_tinh_luc'))
        or (table_name = 'order_lines' and column_name = 'ghi_chu'))`);
  kiem("ba cột mới đã có", cot.length === 3, cot.map((x) => `${x.table_name}.${x.column_name}`).join(" · "));

  const { rows: [ chiMuc ] } = await c.query(`
    select count(*) n from pg_indexes
    where schemaname = 'public' and indexname = 'orders_mot_ban_mot_don_mo'`);
  kiem("có chỉ mục 'một bàn một đơn mở'", Number(chiMuc.n) === 1);

  const { rows: [ trig ] } = await c.query(`
    select count(*) n from pg_trigger
    where tgrelid = 'public.orders'::regclass and tgname = 'orders_resource_tenant_guard'`);
  kiem("có chốt chéo tiệm cho bàn", Number(trig.n) === 1);

  // ── Quán mẫu đã khai bàn ───────────────────────────────────────────
  const { rows: [ quan ] } = await c.query(`select id from public.tenants where slug = 'sample-fnb'`);
  if (!quan) throw new Error("không thấy tiệm mẫu sample-fnb");
  const { rows: cacBan } = await c.query(
    `select id, name from public.resources
     where tenant_id = $1 and kind = 'table' and is_active order by name limit 3`,
    [quan.id],
  );
  kiem("quán mẫu có bàn để bán", cacBan.length >= 2, `${cacBan.length} bàn lấy mẫu`);
  if (cacBan.length < 2) throw new Error("cần ít nhất 2 bàn để đo");

  const { rows: [ khach ] } = await c.query(
    `select id from public.contacts where tenant_id = $1 and deleted_at is null limit 1`,
    [quan.id],
  );
  const { rows: [ mon ] } = await c.query(
    `select id, price_vnd from public.items where tenant_id = $1 and status = 'active' limit 1`,
    [quan.id],
  );

  const taoDon = async (banId) => {
    const { rows: [ d ] } = await c.query(
      `insert into public.orders (tenant_id, contact_id, resource_id, status)
       values ($1, $2, $3, 'draft') returning id`,
      [quan.id, khach.id, banId],
    );
    return d.id;
  };

  // ── ① Một bàn chỉ một đơn đang mở ──────────────────────────────────
  const don1 = await taoDon(cacBan[0].id);
  let chan2 = false;
  await c.query("savepoint sp1");
  try {
    await taoDon(cacBan[0].id);
  } catch (e) {
    chan2 = e.code === "23505";
    await c.query("rollback to savepoint sp1");
  }
  kiem("đơn thứ hai trên cùng một bàn bị CHẶN", chan2, chan2 ? "23505 chỉ mục duy nhất" : "LỌT — sẽ sinh đơn mồ côi");

  // Đơn ĐÃ XONG thì không giữ chỗ nữa — bàn phải mở lại được.
  await c.query(`update public.orders set status = 'confirmed' where id = $1`, [don1]);
  await c.query(`update public.orders set status = 'completed' where id = $1`, [don1]);
  let moLaiDuoc = true;
  await c.query("savepoint sp2");
  try {
    await taoDon(cacBan[0].id);
  } catch {
    moLaiDuoc = false;
    await c.query("rollback to savepoint sp2");
  }
  kiem("đơn xong rồi thì bàn mở lại được", moLaiDuoc, moLaiDuoc ? "" : "bàn bị khoá vĩnh viễn");

  // ── ② Ghi chú tách dòng ────────────────────────────────────────────
  const don2 = await taoDon(cacBan[1].id);
  const themDong = async (ghiChu) => {
    await c.query(
      `insert into public.order_lines (tenant_id, order_id, item_id, qty, unit_price_vnd, discount_vnd, tax_rate, ghi_chu)
       values ($1, $2, $3, 1, $4, 0, 0, $5)`,
      [quan.id, don2, mon.id, mon.price_vnd, ghiChu],
    );
  };
  await themDong(null);
  await themDong("ít đường");
  const { rows: [ demDong ] } = await c.query(
    `select count(*) n from public.order_lines where order_id = $1`, [don2],
  );
  kiem("cùng món khác ghi chú ⇒ hai dòng riêng", Number(demDong.n) === 2, `${demDong.n} dòng`);

  const { rows: [ demTrong ] } = await c.query(
    `select count(*) n from public.order_lines where order_id = $1 and ghi_chu is null`, [don2],
  );
  kiem("dòng không ghi chú lưu là NULL, không phải chuỗi rỗng", Number(demTrong.n) === 1);

  const { rows: [ qua ] } = await c.query(
    `select count(*) n from public.order_lines
     where order_id = $1 and char_length(coalesce(ghi_chu, '')) > 200`, [don2],
  );
  kiem("không dòng nào vượt trần 200 ký tự ghi chú", Number(qua.n) === 0);
  let chanDai = false;
  await c.query("savepoint sp3");
  try {
    await themDong("x".repeat(201));
  } catch (e) {
    chanDai = e.code === "23514";
    await c.query("rollback to savepoint sp3");
  }
  kiem("ghi chú dài quá 200 ký tự bị chặn", chanDai);

  // ── ③ Chốt chéo tiệm ───────────────────────────────────────────────
  const { rows: [ tiemKhac ] } = await c.query(
    `select t.id, (select r.id from public.resources r
                    where r.tenant_id = t.id and r.kind = 'table' limit 1) ban
     from public.tenants t
     where t.id <> $1 and exists (select 1 from public.resources r
                                   where r.tenant_id = t.id and r.kind = 'table')
     limit 1`,
    [quan.id],
  );
  if (tiemKhac?.ban) {
    let chanCheo = false;
    await c.query("savepoint sp4");
    try {
      await taoDon(tiemKhac.ban);
    } catch (e) {
      chanCheo = e.code === "23514";
      await c.query("rollback to savepoint sp4");
    }
    kiem(
      "đơn tiệm A trỏ sang bàn tiệm B bị CHẶN",
      chanCheo,
      chanCheo ? "23514 chốt chéo tiệm" : "LỌT — tiệm này tham chiếu sang dữ liệu tiệm khác",
    );
  } else {
    kiem("đơn tiệm A trỏ sang bàn tiệm B bị CHẶN", false, "CHƯA ĐO — không tìm được tiệm thứ hai có bàn");
  }

  // ── Khách lẻ ───────────────────────────────────────────────────────
  const { rows: [ hamKhachLe ] } = await c.query(`
    select count(*) n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'khach_le_cua_tiem'`);
  kiem("có hàm tạo khách lẻ", Number(hamKhachLe.n) === 1);

  // ── Bàn tự trống theo trạng thái đơn, không có cột trạng thái riêng ──
  const { rows: [ cotThua ] } = await c.query(`
    select count(*) n from information_schema.columns
    where table_schema = 'public' and table_name = 'resources'
      and column_name in ('trang_thai', 'status', 'dang_dung')`);
  kiem(
    "bàn KHÔNG có cột trạng thái riêng (suy từ đơn)",
    Number(cotThua.n) === 0,
    Number(cotThua.n) ? "có cột thừa — hai chỗ cùng nhớ một sự thật sẽ lệch nhau" : "",
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
