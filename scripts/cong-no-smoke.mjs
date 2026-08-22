/**
 * CỔNG: công nợ & tiền giữ hộ (#340) đếm ĐÚNG, và không lẫn sang tiệm khác.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO MÀN NÀY PHẢI ĐƯỢC CANH KỸ HƠN MÀN KHÁC
 * ═══════════════════════════════════════════════════════════════════
 * Đây là màn TIỀN, và chủ tiệm sẽ RA QUYẾT ĐỊNH theo nó: gọi đòi ai, có dám
 * tiêu không. Một con số sai ở đây không dừng lại ở màn hình — nó thành một
 * cuộc gọi đòi nợ nhầm người, hoặc một khoản tiêu vào tiền của khách.
 *
 * BỐN LUẬT:
 * ① CHỈ ĐƠN ĐÃ CHỐT. Đơn nháp thì chưa ai nợ ai.
 * ② KHÔNG LẪN SANG TIỆM KHÁC. Tiệm A không được thấy một đồng nào của tiệm B.
 * ③ TIỀN GIỮ HỘ CHIA ĐỀU THEO BUỔI, và luôn ≤ tiền đã thu.
 * ④ KHÔNG CỘNG HAI CON SỐ. Hàm trả về hai khối riêng — nếu một ngày nào đó có
 *    ai gộp chúng lại thì phải thấy ngay.
 *
 * ⚠️ CÓ THÁO CHỐT: `THAO_CHOT=ke-ca-nhap` cho cả đơn NHÁP vào công nợ ⇒ ca ①
 *    PHẢI ĐỎ.
 *
 * Chạy: node scripts/cong-no-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
if (!process.env.SUPABASE_DB_URL) {
  try {
    // ⚠️ `\r?\n`, KHÔNG phải `\n`: tách theo `\n` thì dòng kiểu Windows còn sót `\r` ở
    //   đuôi, mà trong regex JavaScript `\r` LÀ ký tự xuống dòng — `.` không khớp nó và
    //   `$` (không cờ `m`) chỉ khớp cuối chuỗi, nên `(.*)$` TRƯỢT sạch mọi dòng CRLF.
    //   Đo 22/08 trên `.env.local` của máy này (37 dòng CRLF + 6 dòng LF): đọc được đúng
    //   1/22 biến rồi dừng ở "thiếu khoá" ⇒ script này CHƯA TỪNG CHẠY ĐƯỢC trên Windows.
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL.");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true },
});
await c.connect();
// Cổng kiểm chạy trên ĐÚNG kho dữ liệu của khách thật — một lượt kiểm treo sẽ
// giữ khoá và chặn cả việc áp bản vá khẩn. Đặt hạn để nó tự bỏ cuộc.
// (luật 1 của scripts/soat-ky-luat-bo-kiem.mjs)
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");

let n = 0;
let fail = 0;
const check = (ten, ok, chiTiet = "") => {
  n++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${n} ${ten}${ok ? "" : " — " + chiTiet}`);
  if (!ok) fail++;
};
const tr = (x) => (Number(x) / 1e6).toFixed(1) + " tr";

const nhuNguoi = async (uid, tenant, vai, fn) => {
  await c.query(
    `select set_config('request.jwt.claims',$1,true), set_config('role','authenticated',true)`,
    [JSON.stringify({ sub: uid, role: "authenticated", app_metadata: { tenant_id: tenant, role: vai } })],
  );
  try {
    return await fn();
  } finally {
    await c.query(`select set_config('role','postgres',true)`);
  }
};

const THAO_CHOT = process.env.THAO_CHOT ?? "";

await c.query("begin");
try {
  if (THAO_CHOT === "ke-ca-nhap") {
    const f = readFileSync(
      path.join(GOC, "supabase", "migrations", "20260822000340_cong_no_va_tien_giu_ho.sql"),
      "utf8",
    );
    const moc = "create or replace function public.cong_no_khach";
    const than = f.slice(f.indexOf(moc));
    await c.query(
      than
        .slice(0, than.indexOf("$$;") + 3)
        .replace("and o.status in ('confirmed', 'completed')", "and o.status <> 'cancelled'"),
    );
    console.log('⚠️ ĐANG THÁO CHỐT "ke-ca-nhap" — ca ① PHẢI ĐỎ.');
  }

  // Hai tiệm thật có dữ liệu, để đo cả chiều "không lẫn sang tiệm khác".
  const { rows: tiem } = await c.query(
    `select distinct o.tenant_id from public.orders o
      where o.kind='order' and o.status in ('confirmed','completed') limit 2`,
  );
  if (tiem.length < 2) {
    console.log("  ⚠️ BỎ QUA: hệ thống chưa có 2 tiệm có đơn đã chốt.");
  }
  const A = tiem[0]?.tenant_id;
  const B = tiem[1]?.tenant_id;
  const { rows: [ngA] } = await c.query(
    `select user_id from public.tenant_members where tenant_id=$1 and role in ('owner','admin') limit 1`,
    [A],
  );

  const doc = (t) =>
    nhuNguoi(ngA.user_id, t, "owner", async () => ({
      no: (await c.query(`select public.cong_no_khach(500) j`)).rows[0].j,
      gh: (await c.query(`select public.tien_giu_ho(500) j`)).rows[0].j,
    }));

  const { no, gh } = await doc(A);

  // ── ① Chỉ đơn đã chốt ────────────────────────────────────────────
  // Đối chiếu bằng một câu đếm ĐỘC LẬP viết ngay tại đây — không gọi lại chính
  // hàm đang kiểm, vì như vậy là lấy nó ra làm bằng chứng cho chính nó.
  const { rows: [doiChung] } = await c.query(
    `with d as (
       select o.id,
         coalesce((select sum(l.qty*l.unit_price_vnd - coalesce(l.discount_vnd,0))
                     from public.order_lines l where l.order_id=o.id),0) tong,
         coalesce((select sum(p.amount_vnd) from public.order_payments p where p.order_id=o.id),0) thu
       from public.orders o
       where o.tenant_id=$1 and o.kind='order' and o.status in ('confirmed','completed')
     )
     select coalesce(sum(tong-thu),0)::bigint v, count(*) filter (where tong-thu>0) so from d where tong-thu>0`,
    [A],
  );
  check(
    "① công nợ khớp phép đếm độc lập (chỉ đơn đã chốt)",
    String(no.tong) === String(doiChung.v),
    `hàm ${tr(no.tong)} · đối chứng ${tr(doiChung.v)}`,
  );
  check("① số đơn khớp", String(no.so_don) === String(doiChung.so), `${no.so_don} vs ${doiChung.so}`);

  // Tổng bốn nhóm tuổi phải bằng đúng tổng — thiếu một nhóm là mất tiền trong bảng.
  const cong = ["d30", "d60", "d90", "tren90"].reduce((s, k) => s + Number(no.tuoi[k]), 0);
  check("bốn nhóm tuổi nợ cộng lại ĐÚNG bằng tổng", cong === Number(no.tong), `${tr(cong)} vs ${tr(no.tong)}`);

  // ── ② Không lẫn sang tiệm khác ───────────────────────────────────
  if (B) {
    const { no: noB } = await doc(B);
    // ⚠️ `current_tenant_id()` KHÔNG tin phiếu khi người đó không phải thành
    //   viên tiệm B (#301) — nên nó rơi về tiệm THẬT của người này, tức là A.
    //   Kết quả PHẢI y hệt lượt đọc A. Đó chính là bằng chứng không lẫn.
    check(
      "② đeo phiếu tiệm khác vẫn chỉ thấy tiệm của mình",
      String(noB.tong) === String(no.tong),
      `${tr(noB.tong)} vs ${tr(no.tong)}`,
    );
  }
  // Không dòng khách nào thuộc tiệm khác lọt vào danh sách.
  const idKhach = (no.khach ?? []).map((x) => x.contact_id);
  if (idKhach.length) {
    const { rows: [lan] } = await c.query(
      `select count(*)::int n from public.contacts where id = any($1::uuid[]) and tenant_id <> $2`,
      [idKhach, A],
    );
    check("② không khách nào của tiệm khác lọt vào danh sách", lan.n === 0, `${lan.n} khách lạ`);
  }

  // ── ③ Tiền giữ hộ ────────────────────────────────────────────────
  check(
    "③ tiền giữ hộ KHÔNG bao giờ lớn hơn tiền đã thu",
    Number(gh.dang_giu) <= Number(gh.da_thu),
    `giữ ${tr(gh.dang_giu)} > thu ${tr(gh.da_thu)}`,
  );
  const { rows: [gDoi] } = await c.query(
    `select coalesce(sum(round(price_paid_vnd::numeric*(sessions_total-sessions_used)/nullif(sessions_total,0))),0)::bigint v
       from public.contracts
      where tenant_id=$1 and status='active' and sessions_total>0 and sessions_used<sessions_total`,
    [A],
  );
  check(
    "③ tiền giữ hộ khớp phép chia đều theo buổi",
    String(gh.dang_giu) === String(gDoi.v),
    `hàm ${tr(gh.dang_giu)} · đối chứng ${tr(gDoi.v)}`,
  );
  const saiBuoi = (gh.goi ?? []).filter((x) => x.con_buoi <= 0 || x.con_buoi > x.tong_buoi);
  check("③ không gói nào có số buổi còn lại vô lý", saiBuoi.length === 0, `${saiBuoi.length} gói`);
  const thieuTen = (gh.goi ?? []).filter((x) => !x.goi);
  check(
    "③ mọi gói đều có TÊN (nối đúng bảng service_packages)",
    thieuTen.length === 0,
    `${thieuTen.length}/${(gh.goi ?? []).length} gói trống tên`,
  );

  // ── ④ Hai khối riêng, không gộp ──────────────────────────────────
  check(
    "④ hàm trả về HAI khối riêng, không có trường nào cộng chung",
    !("tong_tat_ca" in no) && !("tong_tat_ca" in gh) && !("dang_giu" in no) && !("tong" in gh),
    "có trường gộp hai con số — xem lại",
  );

  // ── Vai không được xem thì màn tự chặn ───────────────────────────
  const nguon = readFileSync(path.join(GOC, "app", "app", "cong-no", "page.tsx"), "utf8");
  check(
    "màn chặn vai không có quyền (staff/viewer)",
    /VAI_XEM_DUOC/.test(nguon) && /owner|admin|manager/.test(nguon) && !/["']staff["']/.test(nguon),
    "page.tsx không thấy chốt vai",
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(
  fail === 0
    ? `[cong-no-smoke] ${n}/${n} PASS — chỉ đơn đã chốt, không lẫn tiệm khác, tiền giữ hộ chia đúng theo buổi.`
    : `[cong-no-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
);
process.exit(fail === 0 ? 0 : 1);
