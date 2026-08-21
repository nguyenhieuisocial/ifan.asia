/**
 * CỔNG: báo động bất thường phải KÊU đúng lúc, và IM đúng lúc.
 *
 * ═══════════════════════════════════════════════════════════════════
 * PHẦN "IM ĐÚNG LÚC" QUAN TRỌNG HƠN PHẦN "KÊU ĐÚNG LÚC"
 * ═══════════════════════════════════════════════════════════════════
 * Một tin báo sai là chủ tiệm bỏ dở việc để đi tìm một vấn đề không có thật.
 * Lần thứ hai thì họ tắt thông báo, và mọi tin sau đó — kể cả tin đúng — đều
 * mất. Vì vậy hơn nửa số ca dưới đây kiểm chuyện KHÔNG ĐƯỢC BÁO.
 *
 * ⚠️ MỌI CA GHI DỮ LIỆU ĐỀU NẰM TRONG GIAO DỊCH RỒI HOÀN TÁC. Không để lại một
 *   dòng nào trong cơ sở dữ liệu đang phục vụ.
 *
 * Chạy: node scripts/bao-dong-bat-thuong-smoke.mjs
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
    /* CI đã có env sẵn */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("❌ Thiếu SUPABASE_DB_URL — cổng này KHÔNG tự bỏ qua.");
  process.exit(1);
}

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${!ok && ghi ? " — " + ghi : ""}`);
  if (ok) dat++;
  else truot++;
};

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();

const { rows: [t] } = await c.query(
  `select id from public.tenants where slug = 'demo-spa-huong-sen'`,
);
if (!t) {
  console.error("❌ Không có tiệm demo để thử.");
  process.exit(1);
}
const { rows: [mau] } = await c.query(
  `select contact_id, item_id, staff_user_id, price_vnd, source
     from public.appointments where tenant_id = $1 limit 1`,
  [t.id],
);

/**
 * Thêm một lịch hẹn vào HÔM NAY hoặc NGÀY MAI, giờ Việt Nam.
 *
 * ⚠️ MỖI CA PHẢI RƠI VÀO MỘT PHÚT KHÁC NHAU. Bảng có ràng buộc loại trừ
 *   `appointments_no_overlap_staff`: một thợ không thể có hai ca chồng giờ.
 *   Nhồi nhiều ca cùng một mốc là bộ kiểm tự đâm vào ràng buộc thật của sản
 *   phẩm — và đó là ràng buộc ĐÚNG, không phải thứ để đi vòng.
 */
let demCa = 0;
const themLich = (gio, trangThai, buNgay = 0) => {
  const phut = (demCa++ % 12) * 5;
  const p2 = String(phut).padStart(2, "0");
  const p3 = String(phut + 4).padStart(2, "0");
  return c.query(
    `insert into public.appointments
       (tenant_id, contact_id, item_id, staff_user_id, price_vnd, source, start_at, end_at, status)
     values ($1, $2, $3, $4, $5, $6,
       ((public.ngay_vn() + $8::int)::text || ' ' || $7 || ':' || $10)::timestamp at time zone 'Asia/Ho_Chi_Minh',
       ((public.ngay_vn() + $8::int)::text || ' ' || $7 || ':' || $11)::timestamp at time zone 'Asia/Ho_Chi_Minh',
       $9)`,
    [t.id, mau.contact_id, mau.item_id, mau.staff_user_id, mau.price_vnd, mau.source,
     String(gio).padStart(2, "0"), buNgay, trangThai, p2, p3],
  );
};

/** Chạy hàm dò rồi đếm tin của riêng tiệm demo. */
const chay = async (gio) => {
  const { rows: [r] } = await c.query("select public.do_bat_thuong($1) j", [gio]);
  const { rows: [n] } = await c.query(
    `select count(*)::int n, max(title) tieu_de, max(body) than, max(link) lien_ket
       from public.notifications
      where tenant_id = $1 and type = 'bat_thuong'
        and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn()`,
    [t.id],
  );
  return { ket: r.j, ...n };
};

const trong = async (viec) => {
  await c.query("begin");
  try {
    return await viec();
  } finally {
    await c.query("rollback");
  }
};

// ── Ngoài khung giờ thì tuyệt đối im ────────────────────────────────
for (const gio of [3, 9, 12, 20, 23]) {
  const { rows: [r] } = await c.query("select public.do_bat_thuong($1) j", [gio]);
  kiem(`${String(gio).padStart(2, "0")}:00 — ngoài khung giờ, không dò gì`,
    r.j.bo_qua === "ngoai khung gio", JSON.stringify(r.j));
}

// ── Huỷ hẹn ─────────────────────────────────────────────────────────
console.log("[bao-dong] Luat 1 — huy hen don bat thuong:");

const nen = await c.query(
  `with dai as (select generate_series(public.ngay_vn() - 14, public.ngay_vn() - 1, interval '1 day')::date ngay),
   huy as (select (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date ngay, count(*)::int n
             from public.appointments a
            where a.tenant_id = $1 and a.status = 'cancelled' and a.deleted_at is null
              and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date between public.ngay_vn() - 14 and public.ngay_vn() - 1
            group by 1)
   select percentile_cont(0.5) within group (order by coalesce(huy.n, 0))::numeric tv,
          coalesce(max(huy.n), 0)::int cao
     from dai left join huy on huy.ngay = dai.ngay`,
  [t.id],
);
const { tv, cao } = nen.rows[0];
console.log(`  (tiem demo: muc thuong ngay ${tv}, ngay cao nhat 14 ngay ${cao})`);
const nguong = Math.max(3, Math.ceil(2 * Number(tv)), cao);

await trong(async () => {
  const r = await chay(15);
  kiem("hôm nay chưa huỷ lượt nào ⇒ im", r.n === 0, `đã ghi ${r.n} tin`);
});

await trong(async () => {
  for (let i = 0; i < nguong - 1; i++) await themLich(9 + (i % 8), "cancelled");
  const r = await chay(15);
  kiem(`huỷ ${nguong - 1} lượt (dưới ngưỡng ${nguong}) ⇒ im`, r.n === 0, `đã ghi ${r.n} tin`);
});

await trong(async () => {
  // Dồn hết vào khung 14–16 giờ để câu chữ phải có vế khung giờ.
  for (let i = 0; i < nguong; i++) await themLich(i % 2 ? 15 : 14, "cancelled");
  const r = await chay(15);
  kiem(`huỷ ${nguong} lượt (chạm ngưỡng) ⇒ CÓ báo`, r.n > 0, "không ghi tin nào");
  kiem("tiêu đề nói rõ số lượt", /huỷ \d+ lượt hẹn/.test(r.tieu_de ?? ""), r.tieu_de);
  kiem("thân tin nói KHUNG GIỜ khi huỷ dồn cục",
    /khung 14–16 giờ/.test(r.than ?? ""), r.than);
  kiem("có đường dẫn mở thẳng lịch hôm nay",
    /^\/app\/calendar\?date=\d{4}-\d{2}-\d{2}$/.test(r.lien_ket ?? ""), r.lien_ket);
});

await trong(async () => {
  // Rải đều 8 khung giờ khác nhau ⇒ KHÔNG được nói "phần lớn rơi vào khung nào".
  for (let i = 0; i < Math.max(nguong, 8); i++) await themLich(8 + i, "cancelled");
  const r = await chay(15);
  kiem("huỷ rải đều cả ngày ⇒ CÓ báo nhưng KHÔNG bịa ra khung giờ",
    r.n > 0 && !/khung/.test(r.than ?? ""), `${r.n} tin · ${r.than}`);
});

await trong(async () => {
  for (let i = 0; i < nguong; i++) await themLich(14, "cancelled");
  const mot = await chay(15);
  const hai = await chay(15);
  kiem("chạy lại lần hai trong cùng ngày ⇒ KHÔNG ghi thêm tin",
    hai.n === mot.n && mot.n > 0, `lần đầu ${mot.n}, lần sau ${hai.n}`);
});

// ── Lịch ngày mai ───────────────────────────────────────────────────
console.log("[bao-dong] Luat 2 — ngay mai vang bat thuong:");

await trong(async () => {
  const r = await chay(18);
  // Tiệm demo hiện có 15 lịch ngày mai, mốc ~33 ⇒ đúng là vắng thật.
  const { rows: [m] } = await c.query(
    `select count(*)::int n from public.appointments
      where tenant_id = $1 and deleted_at is null and status not in ('cancelled','no_show')
        and (start_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn() + 1`,
    [t.id],
  );
  console.log(`  (ngay mai dang co ${m.n} lich)`);
  kiem("ngày mai vắng hẳn so với mốc ⇒ CÓ báo", r.n > 0, `${r.n} tin`);
  if (r.n > 0) {
    kiem("tiêu đề nói rõ số lịch", /Ngày mai chỉ có \d+ lịch hẹn/.test(r.tieu_de ?? ""), r.tieu_de);
    kiem("thân tin nói được VIỆC CẦN LÀM, không chỉ báo tin buồn",
      /gọi lại khách cũ|ưu đãi/.test(r.than ?? ""), r.than);
    kiem("đường dẫn mở lịch NGÀY MAI",
      /^\/app\/calendar\?date=\d{4}-\d{2}-\d{2}$/.test(r.lien_ket ?? ""), r.lien_ket);
  }
});

await trong(async () => {
  // Nhồi lịch ngày mai lên trên mốc ⇒ phải im.
  for (let i = 0; i < 40; i++) await themLich(8 + (i % 10), "booked", 1);
  const r = await chay(18);
  kiem("ngày mai đông ⇒ im", r.n === 0, `đã ghi ${r.n} tin`);
});

// ── Ai được nhận ────────────────────────────────────────────────────
console.log("[bao-dong] Ai nhan tin:");
await trong(async () => {
  for (let i = 0; i < nguong; i++) await themLich(14, "cancelled");
  await chay(15);
  const { rows } = await c.query(
    `select m.role, count(*)::int n
       from public.notifications x
       join public.tenant_members m on m.user_id = x.user_id and m.tenant_id = x.tenant_id
      where x.tenant_id = $1 and x.type = 'bat_thuong'
        and (x.created_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn()
      group by 1`,
    [t.id],
  );
  const vai = new Set(rows.map((r) => r.role));
  kiem("nhân viên thường KHÔNG nhận tin số của cả tiệm", !vai.has("staff"),
    `các vai đã nhận: ${[...vai].join(", ")}`);
  kiem("chủ tiệm CÓ nhận", vai.has("owner"), `các vai đã nhận: ${[...vai].join(", ")}`);
});

await trong(async () => {
  const { rows: [chu] } = await c.query(
    `select user_id from public.tenant_members where tenant_id = $1 and role = 'owner' limit 1`,
    [t.id],
  );
  await c.query(
    `insert into public.notification_prefs (tenant_id, user_id, pref)
     values ($1, $2, jsonb_build_object('enabled', true, 'kinds', jsonb_build_object('bat_thuong', false)))
     on conflict (tenant_id, user_id) do update set pref = excluded.pref`,
    [t.id, chu.user_id],
  );
  for (let i = 0; i < nguong; i++) await themLich(14, "cancelled");
  await chay(15);
  const { rows: [n] } = await c.query(
    `select count(*)::int n from public.notifications
      where tenant_id = $1 and type = 'bat_thuong' and user_id = $2
        and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn()`,
    [t.id, chu.user_id],
  );
  kiem("tắt riêng loại tin này ⇒ người đó không nhận nữa", n.n === 0, `vẫn nhận ${n.n} tin`);
});

await trong(async () => {
  // ⚠️ CA NÀY CANH ĐÚNG MỘT LỖI ĐÃ VIẾT RA RỒI PHẢI SỬA (#348 → #349).
  //   Ô `enabled` trong `notification_prefs` là "bật BẢN TIN ZALO", không phải
  //   "bật mọi thông báo". Bản đầu đọc nhầm ô đó, nên chủ tiệm không dùng Zalo
  //   mà tắt bản tin đi là mất luôn báo động trong chuông — và không có gì nói
  //   cho họ biết. Thứ họ sẽ đọc được là "tôi đâu có tắt cái này".
  const { rows: [chu] } = await c.query(
    `select user_id from public.tenant_members where tenant_id = $1 and role = 'owner' limit 1`,
    [t.id],
  );
  await c.query(
    `insert into public.notification_prefs (tenant_id, user_id, pref)
     values ($1, $2, jsonb_build_object('enabled', false, 'kinds',
       jsonb_build_object('sla', false, 'today', false, 'unread', false)))
     on conflict (tenant_id, user_id) do update set pref = excluded.pref`,
    [t.id, chu.user_id],
  );
  for (let i = 0; i < nguong; i++) await themLich(14, "cancelled");
  await chay(15);
  const { rows: [n] } = await c.query(
    `select count(*)::int n from public.notifications
      where tenant_id = $1 and type = 'bat_thuong' and user_id = $2
        and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = public.ngay_vn()`,
    [t.id, chu.user_id],
  );
  kiem("tắt BẢN TIN ZALO ⇒ VẪN nhận báo động (hai công tắc khác nhau)",
    n.n > 0, "tắt bản tin lại làm mất luôn báo động");
});

// ── Không ai ngoài cron gọi được ────────────────────────────────────
const { rows: [q] } = await c.query(
  `select has_function_privilege('authenticated', p.oid, 'execute') auth_goi,
          has_function_privilege('anon', p.oid, 'execute') la_goi
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'do_bat_thuong'`,
);
kiem("người dùng thường KHÔNG gọi thẳng được hàm dò", !q.auth_goi && !q.la_goi);

await c.end();
console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
