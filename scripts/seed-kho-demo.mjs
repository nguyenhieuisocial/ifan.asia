#!/usr/bin/env node
/**
 * Gieo dữ liệu KHO cho tiệm mẫu (V4 — ADR-0021).
 *
 * VÌ SAO CẦN: tiệm demo đã có 87 đơn / 170 dòng hàng bán ra từ việc #161, nhưng
 * tất cả chốt TRƯỚC khi có trigger kho (migration #150) ⇒ sổ kho rỗng, mở màn
 * Kho ra trắng trơn. Đúng bệnh việc #161 đã gặp với mảng Bán hàng: màn đã dựng
 * mà không có dữ liệu thì coi như chưa có.
 *
 * Gieo hai chiều cho GIỐNG ĐỜI THẬT, không chỉ nhập cho có:
 *   1. Phiếu nhập (có nhà cung cấp, giá vốn, quy đổi thùng→chai) — hàng VÀO.
 *   2. Bù dòng bán cho các đơn ĐÃ chốt trước đây — hàng RA.
 * ⇒ tồn cuối = nhập − đã bán, và màn lịch sử ra/vào có cả hai chiều để xem.
 *
 * Idempotent: chạy lại không nhân đôi (phiếu nhập nhận diện bằng ghi chú mốc,
 * dòng bán chống trùng bằng chỉ mục stock_moves_chung_tu_uniq).
 * CHỈ đụng tiệm is_sample = true.
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const DB = process.env.SUPABASE_DB_URL;
if (!DB) { console.error("Thiếu SUPABASE_DB_URL"); process.exit(1); }

const c = new pg.Client({
  connectionString: DB,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();
await c.query("begin");
await c.query("set local lock_timeout = '10s'");

const DAU_MOC = "[seed-kho-demo]"; // dấu nhận diện để chạy lại không nhân đôi

try {
  const { rows: tiem } = await c.query(
    `select id, slug from public.tenants where is_sample and deleted_at is null order by slug`);

  for (const t of tiem) {
    const { rows: hang } = await c.query(
      `select id, name, price_vnd from public.items
        where tenant_id = $1 and kind = 'product' and status = 'active' order by sort_order, name`, [t.id]);
    if (hang.length === 0) { console.log(`  ${t.slug}: không có hàng hoá vật lý — bỏ qua`); continue; }

    // ── 1. Bù dòng BÁN cho các đơn đã chốt trước khi có trigger kho ──────────
    const { rowCount: soBanBu } = await c.query(
      `insert into public.stock_moves (tenant_id, item_id, qty, reason, ref_type, ref_id, note, created_at)
       select ol.tenant_id, ol.item_id, -ol.qty,
              case when o.kind = 'return' then 'hoan' else 'ban' end,
              'order_line', ol.id, $2, o.created_at
         from public.order_lines ol
         join public.orders o on o.id = ol.order_id
         join public.items i on i.id = ol.item_id
        where ol.tenant_id = $1 and o.status = 'completed' and i.kind = 'product' and ol.qty <> 0
       on conflict (ref_type, ref_id, reason) where ref_id is not null do nothing`,
      [t.id, `${DAU_MOC} bù dòng bán của đơn chốt trước khi có sổ kho`]);

    // ── 2. Nhà cung cấp + phiếu nhập (chỉ tạo nếu chưa có phiếu mốc) ─────────
    const { rows: [daCo] } = await c.query(
      `select count(*)::int n from public.purchases where tenant_id = $1 and note like $2`,
      [t.id, `${DAU_MOC}%`]);

    let soNhap = 0;
    if (daCo.n === 0) {
      const { rows: [ncc] } = await c.query(
        `insert into public.suppliers (tenant_id, name, phone, note)
         values ($1, 'Công ty TNHH Thương mại Minh Long', '0908123456', $2) returning id`,
        [t.id, `${DAU_MOC} nhà cung cấp mẫu`]);

      const { rows: [ph] } = await c.query(
        `insert into public.purchases (tenant_id, supplier_id, status, note, received_at, created_at)
         values ($1, $2, 'draft', $3, now() - interval '20 days', now() - interval '20 days') returning id`,
        [t.id, ncc.id, `${DAU_MOC} nhập hàng đầu kỳ`]);

      for (const [i, h] of hang.entries()) {
        // Đã bán bao nhiêu thì nhập đủ để còn tồn dương hợp lý (trừ 1 mặt hàng
        // cố ý để ÂM — màn Kho phải chứng minh được là nó hiện ra hàng đang âm,
        // đó là tính năng chứ không phải sự cố, xem ADR-0021 mục 5).
        const { rows: [banRa] } = await c.query(
          `select coalesce(-sum(qty),0)::numeric sl from public.stock_moves
            where tenant_id=$1 and item_id=$2 and reason in ('ban','hoan')`, [t.id, h.id]);
        const daBan = Math.max(0, Math.ceil(Number(banRa.sl)));
        const deLaiAm = i === hang.length - 1;           // mặt hàng cuối: cố ý thiếu
        const canNhap = deLaiAm ? Math.max(1, daBan - 5) : daBan + 12;
        const heSo = 12;                                  // 1 thùng = 12 đơn vị bán
        const soThung = Math.max(1, Math.ceil(canNhap / heSo));
        const giaVonMoiDonVi = Math.max(1000, Math.round((h.price_vnd ?? 50000) * 0.55));
        await c.query(
          `insert into public.purchase_lines (tenant_id, purchase_id, item_id, qty_mua, he_so, don_gia_mua, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [t.id, ph.id, h.id, soThung, heSo, giaVonMoiDonVi * heSo, i]);
        soNhap++;
      }
      // Chốt phiếu ⇒ trigger sinh dòng nhập + cập nhật giá vốn.
      await c.query(`update public.purchases set status='completed' where id=$1`, [ph.id]);
    }

    const { rows: [tong] } = await c.query(
      `select count(*)::int mh, coalesce(sum(qty_on_hand),0)::numeric tong,
              count(*) filter (where qty_on_hand < 0)::int am
         from public.stock_levels where tenant_id = $1`, [t.id]);
    console.log(
      `  ${t.slug.padEnd(22)} bù ${String(soBanBu).padStart(3)} dòng bán · ${soNhap ? `nhập ${soNhap} mặt hàng` : "phiếu nhập đã có"}` +
      ` → ${tong.mh} mặt hàng, tổng tồn ${tong.tong}, đang âm: ${tong.am}`);
  }

  await c.query("commit");
  console.log("\n✓ Đã ghi thật.");
} catch (e) {
  await c.query("rollback");
  console.error("✗ LỖI, đã rollback:", e.message);
  if (e.code) console.error("  mã:", e.code);
  if (e.detail) console.error("  chi tiết:", e.detail);
  process.exitCode = 1;
} finally {
  await c.end();
}
