#!/usr/bin/env node
/**
 * CỔNG: trang cảnh báo chuyển hướng của `/q/<mã>` phải chặn đúng ba ngã.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CỔNG NÀY TỒN TẠI
 * ═══════════════════════════════════════════════════════════════════
 * `ifan.asia/q/<mã>` từng là MỘT CÁNH CỬA CHUYỂN HƯỚNG MỞ: chủ tiệm tự dán địa
 * chỉ đích, ai cũng dựng được mã, và khách quét xong bị đẩy thẳng — **tên miền
 * iFan đứng ra bảo lãnh cho cú nhảy ấy**. Khách thấy link iFan thì tin, vì họ
 * tin iFan.
 *
 * Bản vá (#215 + thẻ `trang-canh-bao-chuyen-huong`) chia ba ngã. Cái dễ hỏng
 * nhất KHÔNG phải hai ngã cảnh báo mà là **ngã đi thẳng**: nới tay một chút là
 * cửa mở lại, và **không có gì kêu** — trang vẫn chạy, khách vẫn tới đích, chỉ
 * là không ai cảnh báo nữa. Đó đúng loại hỏng im lặng mà kho này đã trả giá
 * nhiều lần. Nên cổng đo CẢ BA ngã, và hai ngã đi-thẳng là ĐỐI CHỨNG: chúng
 * chứng minh cổng không chỉ "thấy trang cảnh báo là xanh".
 *
 * ═══════════════════════════════════════════════════════════════════
 * CÁCH CHẠY
 * ═══════════════════════════════════════════════════════════════════
 *   DIA_CHI=http://localhost:3000 node scripts/qr-canh-bao-smoke.mjs
 * Cần `SUPABASE_DB_URL` và một máy chủ web đang chạy. Trong CI dùng chung máy
 * chủ mà cổng `soat-trang-cong-khai-dien-thoai` đã dựng — không tốn thêm lượt
 * build.
 *
 * ⚠️ Cổng này GHI THẬT vào CSDL (một mã QR trên tiệm mẫu) rồi XOÁ ở khối
 * `finally`, vì nó phải đi qua đường HTTP thật — không bọc giao dịch rollback
 * được như các bộ kiểm khác. Mã dùng tiền tố `thucb` + mốc thời gian nên không
 * đụng mã thật, và nằm trên tiệm `is_sample = true`.
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { ca, rejectUnauthorized: true } });
await c.connect();
// Hạn chờ khoá cho CẢ PHIÊN, không phải `set local` trong giao dịch: bộ kiểm
// này KHÔNG bọc giao dịch được (phải đi qua HTTP thật, mà máy chủ web dùng kết
// nối khác — dữ liệu trong giao dịch chưa commit thì nó không thấy). Không có
// hạn chờ thì một migration đang xếp hàng ở CSDL dùng chung sẽ làm bộ kiểm treo
// lặng lẽ tới hết `statement_timeout` rồi chết mơ hồ — đúng việc #176.
await c.query("set lock_timeout = '10s'");

const DIA_CHI = process.env.DIA_CHI || "http://localhost:3000";
let fail = 0, n = 0;
const ok = (t, cond, d = "") => { n++; console.log(`${cond ? "  PASS" : "  FAIL"} ${n} ${t}${cond ? "" : " — " + d}`); if (!cond) fail++; };

const ma = "thucb" + (Date.now() % 1e6);
let qrId = null;

try {
  // Tiệm mẫu đã bật mặt tiền + đã khai tên miền ở Live Chat (nếu có)
  const { rows: [T] } = await c.query(
    `select id from public.tenants where slug='demo-spa-huong-sen'`);
  if (!T) throw new Error("khong co tiem demo");
  const { rows: [S] } = await c.query(
    `select id from public.lead_sources where tenant_id=$1 limit 1`, [T.id]);
  const { rows: [ch] } = await c.query(
    `select config->'allowed_origins' ao from public.channels where tenant_id=$1 and type='livechat' limit 1`, [T.id]);
  const khaiSan = Array.isArray(ch?.ao) && ch.ao.length ? ch.ao[0] : null;
  console.log(`Tiem demo khai san ten mien: ${khaiSan ?? "(khong khai gi)"}`);

  const { rows: [q] } = await c.query(
    `insert into public.qr_codes (tenant_id,code,name,source_id,target_url,is_active)
     values ($1,$2,$3,$4,'https://vi-du-la.com/a',true) returning id`,
    [T.id, ma, "Thu canh bao " + ma, S.id]);
  qrId = q.id;

  const doi = async (url) => c.query(`update public.qr_codes set target_url=$1 where id=$2`, [url, qrId]);
  const goi = async () => {
    const r = await fetch(`${DIA_CHI}/q/${ma}`, { redirect: "manual" });
    const body = r.status === 200 ? await r.text() : "";
    return { status: r.status, loc: r.headers.get("location"), body };
  };

  console.log("\n=== NGA 2: dia chi LA -> canh bao VANG ===");
  await doi("https://dat-lich-spa-la.vn/uu-dai");
  const a = await goi();
  ok("tra trang 200 (khong day thang)", a.status === 200, `status=${a.status} loc=${a.loc}`);
  ok("tieu de dung", a.body.includes("Bạn sắp rời khỏi iFan"), a.body.slice(0, 120));
  ok("hien ten mien dich to", a.body.includes("dat-lich-spa-la.vn"), "khong thay ten mien");
  ok('nut chinh la "Quay lai"', /class="nut chinh"[^>]*>Quay lại</.test(a.body), "khong thay nut chinh");
  ok('con loi "Van tiep tuc"', a.body.includes("Vẫn tiếp tục"), "mat loi di tiep");
  ok("co noindex", a.body.includes("noindex"), "thieu noindex");
  ok("KHONG nhac ten tiem", !a.body.includes("Hương Sen") && !a.body.toLowerCase().includes("huong sen"), "LO ten tiem");

  console.log("\n=== NGA 3: doi lot iFan -> canh bao DO ===");
  await doi("https://ifan-asia.com/dang-nhap");
  const b = await goi();
  ok("tra trang 200", b.status === 200, `status=${b.status}`);
  ok("tieu de dung", b.body.includes("Trang này giả làm iFan"), b.body.slice(0, 120));
  ok("dat hai dia chi canh nhau", b.body.includes("iFan thật là") && b.body.includes("ifan-asia.com"), "thieu doi chieu");
  ok('loi di tiep KHONG con la nut', !/class="nut phu"/.test(b.body) && b.body.includes("vẫn mở trang này"), "van con nut Tiep tuc");

  console.log("\n=== NGA 1: dich la CHINH iFan -> di thang (doi chung) ===");
  await doi("https://ifan-web.vercel.app/t/demo-spa-huong-sen");
  const d = await goi();
  ok("chuyen huong thang, khong hien canh bao", d.status === 302 && (d.loc ?? "").includes("/t/demo-spa-huong-sen"), `status=${d.status} loc=${d.loc}`);

  if (khaiSan) {
    console.log("\n=== NGA 1b: dich thuoc ten mien tiem DA KHAI -> di thang ===");
    await doi(khaiSan + "/trang-nao-do");
    const e = await goi();
    ok("chuyen huong thang", e.status === 302, `status=${e.status}`);
  } else {
    console.log("\n(bo qua nga 1b: tiem demo chua khai ten mien nao o Live Chat)");
  }
} catch (e) {
  console.error("LOI:", e.message);
  fail++;
} finally {
  if (qrId) {
    await c.query(`delete from public.qr_scans where qr_code_id=$1`, [qrId]).catch(() => {});
    await c.query(`delete from public.qr_codes where id=$1`, [qrId]).catch(() => {});
    console.log("\n(da xoa ma QR thu)");
  }
  await c.end();
}
console.log(`\n${fail === 0 ? "TAT CA PASS" : fail + " FAIL"} (${n} phep)`);
process.exit(fail ? 1 : 0);
