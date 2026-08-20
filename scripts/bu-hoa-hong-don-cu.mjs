#!/usr/bin/env node
/**
 * BÙ HOA HỒNG cho những đơn đã xong mà chưa từng sinh hoa hồng.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ ĐƠN ĐÃ XONG MÀ KHÔNG CÓ HOA HỒNG
 * ═══════════════════════════════════════════════════════════════════
 * Đã đo (20/08): trigger `orders_sinh_hoa_hong` là **AFTER UPDATE OF status**,
 * không phải AFTER INSERT. Nghĩa là chèn thẳng một đơn với `status='completed'`
 * thì trigger **không bao giờ chạy** — đơn nằm đó, tiền nằm đó, và hoa hồng
 * bằng không. Không lỗi, không cảnh báo. Đúng lớp bệnh "hỏng im lặng".
 *
 * Các bộ nạp mẫu đời đầu chèn đơn kiểu đó, nên tiệm demo có một mảng đơn đã
 * xong mà màn Hoa hồng không thấy gì. Trên một tiệm demo thì đó là **số liệu
 * đá nhau ngay trước mặt khách xem thử**: báo cáo doanh thu có tháng đó, báo
 * cáo hoa hồng thì không.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG CHÈN THẲNG VÀO `commission_entries`
 * ═══════════════════════════════════════════════════════════════════
 * Vì đó chính là cách tạo ra vấn đề lần đầu. Ở đây đi bằng **đúng cái nút mà
 * chủ tiệm bấm**: RPC `commission_sinh_ky(<tháng>)` — hàm mà màn Hoa hồng gọi.
 * Nó tự tra tỉ lệ, tự tính doanh số, tự quy công cho đúng người, và tự bỏ qua
 * dòng đã có (`on conflict do nothing` + chỉ mục `commission_mot_dong_mot_nguoi`).
 * ⇒ chạy bao nhiêu lần cũng không nhân đôi tiền. Đã đọc mã hàm để chắc, không
 * tin vào tên hàm.
 *
 * Hàm đòi vai chủ/quản trị/quản lý và đòi biết đang ở tiệm nào, nên phải **mạo
 * danh chủ tiệm** đúng như khi người thật đăng nhập — không chạy bằng quyền
 * quản trị CSDL để đi vòng qua hàng rào.
 *
 *   node --env-file=.env.local scripts/bu-hoa-hong-don-cu.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const SLUG = process.env.TIEM ?? "demo-spa-huong-sen";
const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { ca, rejectUnauthorized: true } });

const dem = async (tenantId) => (await c.query(
  `select
     (select count(*)::int from public.commission_entries where tenant_id=$1) dong,
     (select coalesce(sum(amount_vnd),0)::bigint from public.commission_entries where tenant_id=$1) tien,
     (select count(*)::int from public.orders o
       where o.tenant_id=$1 and o.status='completed' and o.deleted_at is null
         and not exists (select 1 from public.commission_entries e where e.order_id=o.id)) don_thieu`,
  [tenantId])).rows[0];

async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");

  const { rows: [T] } = await c.query(
    `select id, name, is_sample from public.tenants where slug=$1`, [SLUG]);
  if (!T) throw new Error(`Không có tiệm '${SLUG}'`);
  if (!T.is_sample) throw new Error(`'${SLUG}' KHÔNG phải tiệm mẫu — dừng.`);

  const { rows: [O] } = await c.query(
    `select user_id from public.tenant_members
     where tenant_id=$1 and role='owner' and status='active' limit 1`, [T.id]);
  if (!O) throw new Error("Tiệm không có chủ đang hoạt động");

  const truoc = await dem(T.id);
  console.log(`Tiệm: ${T.name}`);
  console.log(`Trước: ${truoc.dong} dòng hoa hồng · ${Number(truoc.tien).toLocaleString("vi-VN")}đ · ${truoc.don_thieu} đơn đã xong còn thiếu\n`);

  // Các tháng có đơn đã xong — không bịa danh sách tháng, hỏi thẳng dữ liệu.
  const { rows: thang } = await c.query(
    `select distinct date_trunc('month', o.created_at at time zone 'Asia/Ho_Chi_Minh')::date ky
     from public.orders o
     where o.tenant_id=$1 and o.status='completed' and o.deleted_at is null
     order by 1`, [T.id]);

  for (const { ky } of thang) {
    await c.query("begin");
    await c.query("set local lock_timeout = '10s'");
    // Mạo danh chủ tiệm y như phiên đăng nhập thật: claim lồng trong
    // `app_metadata`, vai `authenticated`. Chạy bằng quyền quản trị CSDL sẽ đi
    // vòng qua chính hàng rào mà hàm này dựng lên — đo được cũng vô nghĩa.
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({
      sub: O.user_id, role: "authenticated",
      app_metadata: { tenant_id: T.id, role: "owner" },
    })]);
    await c.query(`set local role authenticated`);
    const { rows: [r] } = await c.query(`select public.commission_sinh_ky($1::date) n`, [ky]);
    await c.query(`reset role`);
    await c.query("commit");
    const nhan = new Date(ky).toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" });
    console.log(`  ${nhan}: sinh thêm ${r.n} dòng`);
  }

  const sau = await dem(T.id);
  console.log(`\nSau  : ${sau.dong} dòng hoa hồng · ${Number(sau.tien).toLocaleString("vi-VN")}đ · ${sau.don_thieu} đơn đã xong còn thiếu`);

  // ĐỐI CHỨNG: đơn đã xong mà vẫn không có hoa hồng thì phải giải thích được,
  // không được lặng lẽ bỏ qua. Thường là đơn của người chưa nối tài khoản
  // (việc #210) hoặc đơn toàn dòng làm tròn về 0đ.
  if (sau.don_thieu > 0) {
    const { rows } = await c.query(
      `select o.id, o.code, (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date ngay,
              exists (select 1 from public.employees e where e.tenant_id=o.tenant_id
                        and e.user_id = o.created_by) nguoi_tao_co_ho_so
       from public.orders o
       where o.tenant_id=$1 and o.status='completed' and o.deleted_at is null
         and not exists (select 1 from public.commission_entries e where e.order_id=o.id)
       limit 5`, [T.id]);
    console.log(`\n⚠️  Còn ${sau.don_thieu} đơn không sinh được hoa hồng. Năm ca đầu:`);
    for (const r of rows)
      console.log(`   ${r.ngay}  ${r.code ?? r.id.slice(0, 8)}  người tạo có hồ sơ nhân sự: ${r.nguoi_tao_co_ho_so ? "có" : "KHÔNG"}`);
  }
}

main()
  .catch((e) => { console.error("HỎNG:", e.message); process.exitCode = 1; })
  .finally(() => c.end());
