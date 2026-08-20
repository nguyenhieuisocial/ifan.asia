#!/usr/bin/env node
/**
 * BÙ khoản hoa hồng của NGƯỜI ĐÃ NGHỈ đang lọt ra ngoài mọi phiếu lương.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Lỗi gốc đã vá trong mã (`app/app/payroll/actions.ts`, 20/08): bảng lương chỉ
 * xếp người CÒN LÀM trong kỳ, nên khi khách trả hàng vào tháng sau và hệ thống
 * đảo ngược hoa hồng của một người đã nghỉ, khoản âm ấy **không rơi vào phiếu
 * lương nào**. Tiệm đã trả dư và không có đường thu lại.
 *
 * Nhưng bản vá chỉ đúng **từ nay về sau**. Dữ liệu mẫu đã sinh ra TRƯỚC khi vá
 * vẫn còn nguyên chỗ lệch — đo được: tiệm `sample-shop`, kỳ 07/2026, lệch đúng
 * **−17.750đ** của chị Mai Thị Ánh Nguyệt (nghỉ 30/06, khách trả hàng 06/07).
 *
 * Để nguyên thì bộ dữ liệu mẫu **tự mâu thuẫn** — mà nó tồn tại chính là để
 * chứng minh điều ngược lại. Một chỗ lệch biết mà không sửa còn tệ hơn không
 * biết: người sau đọc số sẽ tin, hoặc mất công đi tìm lại đúng cái ta đã biết.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ĐI ĐÚNG ĐƯỜNG SẢN PHẨM CHO PHÉP, KHÔNG TẮT CHỐT CHẶN
 * ═══════════════════════════════════════════════════════════════════
 * Kỳ 07 đã CHỐT, và có ba chốt chặn canh: `payroll_close_guard`,
 * `payslips_locked_guard`, `payslip_lines_locked_guard`. Đường hợp lệ duy nhất
 * là **mở khoá về nháp KÈM LÝ DO** — đúng nút mà chủ tiệm bấm — rồi chốt lại.
 * Không `alter table`, không tắt trigger, không ghi đè bằng quyền quản trị.
 *
 * Người đã nghỉ KHÔNG hưởng lương cứng và tăng ca của kỳ đó (họ không đi làm
 * ngày nào). Phiếu của họ chỉ mang đúng phần hoa hồng phát sinh — ở đây là một
 * số ÂM, tức khoản tiệm đã trả dư. Phiếu âm nghe lạ nhưng đó là sự thật kế
 * toán; giấu nó đi mới là bịa.
 *
 *   node --env-file=.env.local scripts/bu-hoa-hong-nguoi-da-nghi.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const ca = readFileSync(new URL("../supabase/supabase-ca.crt", import.meta.url), "utf8");
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { ca, rejectUnauthorized: true } });

const LY_DO = "Bù khoản hoa hồng đảo ngược của người đã nghỉ việc — lỗi #210, đã vá trong mã 20/08";
const vnd = (n) => Number(n).toLocaleString("vi-VN");

async function main() {
  await c.connect();
  await c.query("set lock_timeout = '10s'");

  // Tìm MỌI chỗ lệch trên MỌI tiệm mẫu — không nhắm sẵn một tiệm, vì nếu chỉ
  // sửa đúng chỗ đã biết thì lần sau có chỗ khác lại phải viết file mới.
  const { rows: lech } = await c.query(`
    select t.id tenant_id, t.slug, t.is_sample,
           p.id period_id, p.period, p.status,
           ce.id ce_id, ce.employee_id, ce.amount_vnd::bigint tien, ce.earned_on,
           e.full_name, e.ended_on
    from public.commission_entries ce
    join public.employees e on e.id = ce.employee_id
    join public.tenants t on t.id = ce.tenant_id
    join public.payroll_periods p
      on p.tenant_id = ce.tenant_id
     and p.period = date_trunc('month', ce.earned_on)::date
    where e.ended_on is not null
      and ce.earned_on > e.ended_on
      and not exists (select 1 from public.payslip_lines pl where pl.source_id = ce.id)
    order by t.slug, p.period`);

  if (!lech.length) { console.log("Không còn khoản nào lọt ra ngoài phiếu lương."); return; }

  console.log(`Tìm thấy ${lech.length} khoản lọt ra ngoài:\n`);
  for (const r of lech)
    console.log(`  ${r.slug} · kỳ ${String(r.period).slice(0, 7)} (${r.status}) · ${r.full_name} ` +
                `nghỉ ${String(r.ended_on).slice(0, 10)} · ${vnd(r.tien)}đ`);

  for (const r of lech) {
    if (!r.is_sample) { console.log(`\n⚠️  BỎ QUA ${r.slug} — KHÔNG phải tiệm mẫu.`); continue; }
    console.log(`\n── ${r.slug} kỳ ${String(r.period).slice(0, 7)}`);
    await c.query("begin");
    await c.query("set local lock_timeout = '10s'");
    try {
      const daChot = r.status === "closed";
      if (daChot) {
        await c.query(
          `update public.payroll_periods set status='draft', unlock_reason=$2, closed_by=null, closed_at=null
           where id=$1`, [r.period_id, LY_DO]);
        console.log("   mở khoá về nháp (kèm lý do)");
      }

      // Phiếu lương của người đã nghỉ trong kỳ này — chưa có thì tạo, lương
      // cứng và tăng ca để 0 vì họ không đi làm ngày nào.
      let { rows: [ps] } = await c.query(
        `select id from public.payslips where period_id=$1 and employee_id=$2`,
        [r.period_id, r.employee_id]);
      if (!ps) {
        // `net_vnd` là cột TỰ SINH (gross − deduction) — ghi tay vào là lỗi
        // "cannot insert a non-DEFAULT value". Đúng ra phải vậy: một con số
        // suy được từ hai con số khác thì không nên có đường ghi riêng, nếu
        // không sẽ có ngày ba số đó nói ba chuyện.
        ({ rows: [ps] } = await c.query(
          `insert into public.payslips (tenant_id, period_id, employee_id, gross_vnd, deduction_vnd)
           values ($1,$2,$3,0,0) returning id`, [r.tenant_id, r.period_id, r.employee_id]));
        console.log("   tạo phiếu lương cho người đã nghỉ (lương cứng 0)");
      }

      await c.query(
        `insert into public.payslip_lines (tenant_id, payslip_id, kind, amount_vnd, source_type, source_id, label)
         values ($1,$2,'commission',$3,'commission',$4,$5)`,
        [r.tenant_id, ps.id, r.tien, r.ce_id,
         `Đảo hoa hồng ${String(r.earned_on).slice(0, 10)} — khách trả hàng sau khi nghỉ việc`]);
      console.log(`   thêm dòng hoa hồng ${vnd(r.tien)}đ`);

      // Cộng lại phiếu TỪ CÁC DÒNG của nó — không tự tính nhẩm rồi ghi số.
      const { rows: [tong] } = await c.query(
        `select coalesce(sum(amount_vnd) filter (where amount_vnd >= 0),0)::bigint gross,
                coalesce(-sum(amount_vnd) filter (where amount_vnd < 0),0)::bigint deduction
         from public.payslip_lines where payslip_id=$1`, [ps.id]);
      await c.query(
        `update public.payslips set gross_vnd=$2, deduction_vnd=$3 where id=$1`,
        [ps.id, tong.gross, tong.deduction]);

      // Tổng kỳ cộng lại TỪ CÁC PHIẾU — cùng lý do.
      const { rows: [ky] } = await c.query(
        `select coalesce(sum(net_vnd),0)::bigint n from public.payslips where period_id=$1`, [r.period_id]);
      await c.query(`update public.payroll_periods set total_vnd=$2 where id=$1`, [r.period_id, ky.n]);
      console.log(`   tổng kỳ: ${vnd(ky.n)}đ`);

      if (daChot) {
        const { rows: [chu] } = await c.query(
          `select user_id from public.tenant_members
           where tenant_id=$1 and role='owner' and status='active' limit 1`, [r.tenant_id]);
        await c.query(
          `update public.payroll_periods set status='closed', closed_by=$2, closed_at=now() where id=$1`,
          [r.period_id, chu.user_id]);
        console.log("   chốt lại");
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      console.error(`   HỎNG: ${e.message}`);
      process.exitCode = 1;
    }
  }

  // ĐỐI CHỨNG: đếm lại từ đầu. Không tin vào việc "đã chạy xong không lỗi".
  const { rows: [con] } = await c.query(`
    select count(*)::int n from public.commission_entries ce
    join public.employees e on e.id = ce.employee_id
    where e.ended_on is not null and ce.earned_on > e.ended_on
      and not exists (select 1 from public.payslip_lines pl where pl.source_id = ce.id)`);
  console.log(`\nCòn lọt ra ngoài: ${con.n} khoản ${con.n === 0 ? "(ĐẠT)" : "(CHƯA XONG)"}`);
  if (con.n > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("HỎNG:", e.message); process.exitCode = 1; })
  .finally(() => c.end());
