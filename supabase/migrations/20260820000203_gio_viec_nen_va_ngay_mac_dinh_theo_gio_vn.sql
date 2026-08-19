-- Múi giờ: 4 việc chạy nền mang tên "đêm" nhưng chạy 10 giờ SÁNG + 3 chỗ mặc
-- định ngày lấy theo UTC.
--
-- ═══════════════════════════════════════════════════════════════════
-- A. BỐN VIỆC CHẠY NỀN CHẠY GIỮA GIỜ LÀM VIỆC
-- ═══════════════════════════════════════════════════════════════════
-- `cron.job` chạy theo giờ của CSDL, và CSDL này để `TimeZone = UTC` (đo ngày
-- 20/08 bằng `show timezone`, nguồn `configuration file` — không vai nào,
-- không CSDL nào đặt đè). Việt Nam là UTC+7 nên `3` giờ UTC = **10 giờ sáng**
-- giờ Việt Nam, đúng giữa giờ làm việc:
--
--   trash-purge-nightly            17 3 * * *  → 10:17 sáng
--   cron-history-cleanup           23 3 * * *  → 10:23 sáng
--   sample-tenant-refresh-nightly  11 3 * * *  → 10:11 sáng
--   help-requests-close-stale       0 3 * * *  → 10:00 sáng
--
-- Nặng nhất là `trash-purge-nightly`: nó **xoá vĩnh viễn** khách hàng / cơ hội
-- / công ty đã xoá mềm quá 30 ngày (migration #60, #83, #127) — chạy đúng lúc
-- người ta đang dùng phần mềm. Và `sample-tenant-refresh-nightly` dựng lại dữ
-- liệu tiệm mẫu, có thể đổi số **ngay giữa lúc đang demo cho khách**.
--
-- Đây là bốn cái QUÊN, không phải một quy ước khác: mọi việc nền còn lại trong
-- kho đều đã quy đổi đúng — `metric-daily-rollup` và `contact-tier-nightly` và
-- `subscription-lifecycle` ở `0 19` (= 02:00 VN) · `lead-score-nightly` ở
-- `0 20` (= 03:00 VN) · `weekly-digest` ở `0 23 * * 0` (= 06:00 sáng thứ Hai
-- VN). Luật đã có, chỉ bốn việc này chưa áp.
--
-- Vá: giữ nguyên PHÚT (để bốn việc vẫn so le nhau như thiết kế cũ), đổi giờ
-- `3` → `20`. 20:00 UTC = 03:00 sáng VN HÔM SAU.
--
-- Dùng `cron.schedule` chứ không `unschedule` + `schedule`: từ pg_cron 1.4
-- (bản đang chạy là 1.6.4) hàm này ghi đè theo khoá `(jobname, username)` —
-- đã kiểm chỉ mục `jobname_username_uniq` và `current_user = postgres`, đúng
-- chủ của cả bốn việc, nên không sinh bản trùng. Lệnh giữ NGUYÊN từng chữ so
-- với `cron.job.command` đang chạy.

select cron.schedule('trash-purge-nightly', '17 20 * * *',
  $$select public.trash_purge_expired()$$);

select cron.schedule('cron-history-cleanup', '23 20 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$);

select cron.schedule('sample-tenant-refresh-nightly', '11 20 * * *',
  $$select public.refresh_sample_tenant_dates()$$);

select cron.schedule('help-requests-close-stale', '0 20 * * *',
  $$select public.help_requests_close_stale()$$);

-- ═══════════════════════════════════════════════════════════════════
-- B. BA CHỖ MẶC ĐỊNH `current_date` — RA NGÀY UTC
-- ═══════════════════════════════════════════════════════════════════
-- `current_date` cũng đọc `TimeZone` của phiên. Từ 00:00 đến 06:59 giờ VN,
-- ngày UTC vẫn là HÔM QUA — nên tin tuyển dụng mở lúc 1 giờ sáng sẽ ghi ngày
-- hôm trước.
--
-- ⚠️ Trước khi vá đã ĐO xem PostgREST có tự đặt múi giờ theo từng yêu cầu
-- không (nếu có thì `current_date` lúc chạy thật KHÔNG phải UTC và đây không
-- phải lỗi). Đo ngày 20/08 bằng cách đọc CÙNG MỘT dòng qua hai đường:
--
--   mốc thật `2026-08-03 22:25:23+00` (= 05:25 sáng 04/08 giờ VN)
--     · qua PostgREST, ép `created_at::date` ngay trong yêu cầu → 2026-08-03
--     · nối thẳng pg, cùng phép ép                              → 2026-08-03
--     · nếu phiên là Asia/Ho_Chi_Minh thì phải ra 2026-08-04
--
-- Hai đường ra GIỐNG nhau, và PostgREST kết xuất timestamptz với đuôi
-- `+00:00`. Thêm nữa `pg_db_role_setting` không có dòng TimeZone nào cho
-- `authenticator` / `anon` / `authenticated`, cũng không có `db_pre_request`
-- nào để chèn `SET TimeZone`. ⇒ Yêu cầu thật CHẠY Ở UTC, lỗi có thật.
--
-- Ba bảng liên quan đang RỖNG (0 dòng lúc vá) nên chưa có hàng nào hỏng ngoài
-- đời — vá bây giờ là chặn trước, không phải dọn hậu quả.

alter table public.job_openings
  alter column opened_on set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;

alter table public.candidates
  alter column applied_on set default (now() at time zone 'Asia/Ho_Chi_Minh')::date;

-- `candidate_hire` nhận `p_started_on` và màn Tuyển dụng CHỈ truyền khi người
-- dùng tự chọn ngày (`app/app/recruitment/actions.ts`) — bỏ trống thì rơi vào
-- mặc định của tham số. Đổi mặc định thì phải `create or replace` cả hàm; thân
-- hàm giữ NGUYÊN từng chữ so với bản đang chạy (`pg_get_functiondef`), quyền
-- và chú thích tự giữ vì không đổi chữ ký.
create or replace function public.candidate_hire(
  p_candidate_id uuid,
  p_token_hash text,
  p_started_on date default (now() at time zone 'Asia/Ho_Chi_Minh')::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tenant uuid := (select public.current_tenant_id());
  v_role   text := (select public.app_role());
  v_ung    public.candidates;
  v_emp    uuid;
  v_inv    uuid;
begin
  if v_tenant is null then raise exception 'no_tenant_context'; end if;
  -- Tạo nhân sự + gửi lời mời = hai việc mà `employees_manage` và
  -- `invitations_manage` đều giới hạn ở owner/admin. Hàm definer bỏ qua RLS nên
  -- phải kiểm lại bằng tay, nếu không nó chính là đường vòng quanh hai policy đó.
  if v_role not in ('owner', 'admin') then raise exception 'forbidden'; end if;

  select * into v_ung from public.candidates
   where id = p_candidate_id and tenant_id = v_tenant
   for update;
  if not found then raise exception 'candidate_not_found'; end if;
  if v_ung.email is null then raise exception 'candidate_email_required'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_token_hash';
  end if;

  insert into public.employees (tenant_id, candidate_id, full_name, phone, dob, started_on)
  values (v_tenant, v_ung.id, v_ung.full_name, v_ung.phone, v_ung.dob, p_started_on)
  returning id into v_emp;

  -- 'staff' viết thẳng ở đây, KHÔNG lấy từ tham số. Xem khối chú thích trên.
  insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
  values (v_tenant, v_ung.email, 'staff', p_token_hash, auth.uid())
  returning id into v_inv;

  update public.candidates set stage = 'hired' where id = v_ung.id;

  return jsonb_build_object('employee_id', v_emp, 'invitation_id', v_inv, 'role', 'staff');
end;
$function$;
