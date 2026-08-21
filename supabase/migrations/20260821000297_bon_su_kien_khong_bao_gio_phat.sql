-- ═══════════════════════════════════════════════════════════════════════════
-- #297 — HAI CHỖ "HỎNG MÀ KHÔNG ĐÈN NÀO ĐỎ" TRONG MẢNG TỰ ĐỘNG HOÁ
--
--   PHẦN A — bốn sự kiện `deal.won` / `deal.lost` / `appointment.cancelled` /
--            `appointment.no_show` có 0 dòng trong `domain_events`.
--            ⇒ ĐO XONG: KHÔNG PHẢI LỖI. Không đổi một dòng lược đồ nào.
--               Phần này chỉ GHI LẠI phép đo, vì cả hai cách "vá" hiển nhiên
--               đều làm hỏng thêm — xem bằng chứng bên dưới.
--
--   PHẦN B — phiếu duyệt treo 16 ngày không ai nhắc.
--            ⇒ ĐÂY MỚI LÀ LỖ THẬT. Vá ở phần B.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- PHẦN A — VÌ SAO KHÔNG SỬA TRIGGER, VÀ CŨNG KHÔNG BỎ SỰ KIỆN KHỎI DANH MỤC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SỐ ĐO (21/08, trên CSDL thật):
--
--   domain_events    deal.won 0 · deal.lost 0
--                    appointment.cancelled 0 · appointment.no_show 0
--   deals            won 19 · lost 6 · open 49
--   appointments     done 7.954 · no_show 611 · cancelled 577 · booked 525
--   workflows        win_followup (nghe `deal.won`) BẬT ở 5/5 tiệm, 0 lượt chạy
--
-- Nhìn bảng đó thì kết luận "trigger không phát" là hợp lý. **Đo thẳng thì sai.**
--
-- PHÉP ĐO QUYẾT ĐỊNH — trong giao dịch có `rollback`, đếm trước/sau từng thao tác:
--
--   UPDATE một cơ hội `open` → `won`      : deal.won 0 → 1      ✅ CÓ PHÁT
--   INSERT thẳng một cơ hội ở `won`       : deal.won 1 → 1      ❌ không phát
--   UPDATE một lịch `booked` → `cancelled`: appointment.cancelled 0 → 1  ✅
--   INSERT thẳng một lịch ở `cancelled`   : 1 → 1               ❌ không phát
--
-- Và chạy hết đường dây cho `win_followup`, vẫn trong giao dịch rollback:
--   chốt thắng → phát `deal.won` → `wf_match_conditions` = true
--              → `execute_workflow_run` = 'done' → sinh đúng 1 việc chăm sóc.
--   ⇒ Quy trình cài sẵn KHÔNG hỏng. Nó chưa từng có việc để làm.
--
-- VẬY 19 CƠ HỘI "THẮNG" Ở ĐÂU RA? Từ script gieo dữ liệu mẫu. Chúng INSERT
-- thẳng bản ghi ở trạng thái cuối (`seed-khach-lich-don-demo.mjs` dòng ~427:
-- `trongSo([["done",86],["cancelled",7],["no_show",7]])` rồi mới insert). Nhánh
-- INSERT của trigger phát `deal.created` / `appointment.booked` — đúng như thiết
-- kế — nên bốn sự kiện KIA không có dòng nào. Đối chứng khớp: cả 7.954 lịch
-- `done` chỉ sinh **1** `appointment.done`, và đúng 1 `appointment.arrived` —
-- hai lượt bấm tay thật trên giao diện ngày 19/08. Hai lượt đó đều phát đúng.
--
-- VÌ SAO KHÔNG CHỌN (a) "cho nhánh INSERT phát luôn sự kiện trạng thái":
--   1. `deal.won` nghĩa là *một cơ hội VỪA CHUYỂN sang thắng*. Một bản ghi nhập
--      về đã ở trạng thái thắng không phải một lần thắng mới. Chính
--      `docs/EVENT_CATALOG.md` dòng 153-154 đã chốt: `appointment.cancelled` là
--      sự kiện *"(đổi trạng thái)"*.
--   2. Không có đường nào trong sản phẩm đi tới nhánh đó. Đã soát:
--      `app/app/deals/actions.ts` và `app/app/calendar/actions.ts` chỉ INSERT
--      mà KHÔNG đặt `status` (rơi về mặc định `open` / `booked`); API công khai
--      `app/api/v1/[nguon]/route.ts` chỉ có quyền `read:*`; kho không có màn
--      nhập khẩu nào. ⇒ (a) vá một con đường không ai đi được.
--   3. Nhưng nó MỞ một con đường nguy hiểm: script gieo dữ liệu mẫu sẽ bắn
--      ~600 `appointment.cancelled` + ~600 `no_show` + `deal.won` ngay lúc
--      chạy, kéo theo quy trình nhắn cho khách về những việc của tuần trước.
--      Đúng cái hoạ mà đề bài dặn phải tránh — và nó tới từ chính cách vá,
--      không cần ai phát bù dữ liệu cũ.
--
-- VÌ SAO KHÔNG CHỌN (b) "bỏ bốn sự kiện khỏi danh mục cho người dùng chọn":
--   Sẽ giết `win_followup` — một quy trình cài sẵn đang BẬT ở cả 5 tiệm và vừa
--   được đo là chạy đúng đầu-cuối. Bỏ nó đi mới đúng là hỏng im lặng.
--
-- ⚠️ BẪY CHO NGƯỜI ĐỌC SAU. Luật ở `app/app/settings/workflows/catalog.ts`
-- dòng 7-10 nói đối chiếu bằng `select distinct event_type from domain_events`.
-- Phép đó **báo động nhầm** trên CSDL còn trẻ hoặc toàn dữ liệu mẫu: "chưa ai
-- từng thắng cơ hội nào" không phân biệt được với "phát sự kiện bị hỏng". Muốn
-- biết một sự kiện có phát hay không thì phải ĐỔI TRẠNG THÁI THẬT trong một
-- giao dịch rồi `rollback`, như bảng đo ở trên. Chú thích của `catalog.ts` đã
-- được sửa lại cho khớp cùng đợt này.
--
-- ⇒ PHẦN A KHÔNG CÓ CÂU LỆNH NÀO. Đó là kết luận, không phải chỗ còn thiếu.


-- ═══════════════════════════════════════════════════════════════════════════
-- PHẦN B — PHIẾU DUYỆT TREO KHÔNG AI NHẮC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SỐ ĐO: `wf_approval_requests` có 2 phiếu `pending` từ 04/08 — treo 16 ngày.
-- Soát cả 26 việc nền trong `cron.job` và toàn bộ migration: không có MỘT nhắc
-- nhở / leo thang / đóng-cũ nào cho phiếu duyệt. "Yêu cầu trợ giúp" thì có
-- (`help-requests-close-stale`, đóng sau 30 ngày) — phiếu duyệt thì không.
--
-- Treo một phiếu duyệt đắt hơn treo một yêu cầu trợ giúp: phiếu sinh từ quy
-- trình còn GIỮ luôn `workflow_runs` ở trạng thái `waiting`. Hai phiếu treo =
-- hai quy trình đứng im 16 ngày, không có gì báo.
--
-- ── NGƯỠNG, VÀ VÌ SAO ────────────────────────────────────────────────────
--   2 ngày  → bắt đầu nhắc, mỗi ngày một lần.
--             Tiệm 5-20 người quyết trong ngày; phiếu xin giảm giá để qua 2
--             ngày là khách đã đi rồi. Nhắc sớm hơn thì thành phiền: người ta
--             còn đang cân nhắc thật.
--   30 ngày → tự đóng, GHI RÕ LÝ DO, và thả `workflow_runs` đang kẹt ra.
--             Giữ đúng 30 ngày như `help_requests_close_stale` để kho chỉ có
--             MỘT con số "quá cũ". Tới lúc đó phiếu đã bị nhắc ~28 lần —
--             không ai đóng lén sau lưng ai.
--
-- ── KHÔNG CÒN NGƯỜI DUYỆT THÌ LEO THANG ──────────────────────────────────
-- `wf_approval_assignees` là danh sách ghi một lần rồi thôi; nó không biết
-- người đó còn làm ở tiệm không. Có `lock-departed-staff-nightly` (#280) gỡ tư
-- cách người đã nghỉ, nên một phiếu HOÀN TOÀN có thể chỉ còn người đã nghỉ
-- trong danh sách — nhắc mãi cũng không ai nghe. Cùng bài học với #212. Nên:
-- lọc người nhắc theo `tenant_members.status = 'active'`, và khi không còn ai
-- thì báo cho chủ/quản trị.
--
-- ── GIỜ NHẮC THEO MÚI GIỜ CỦA TIỆM ───────────────────────────────────────
-- CSDL để `TimeZone = UTC`. Một lời nhắc bắn lúc 3 giờ sáng thì bằng không
-- nhắc. Nên việc này hẹn MỖI GIỜ, và chỉ làm cho tiệm nào ĐANG là 9 giờ sáng
-- theo `tenants.timezone` của chính tiệm đó (khuôn #280).
--
-- ⚠️ ĐỪNG "SỬA" NÓ VỀ 3 GIỜ SÁNG. Luật ở #192/#203 — *việc nền không chạy
-- giữa giờ làm* — nhắm vào những lượt QUÉT NẶNG (`trash-purge-nightly` xoá
-- vĩnh viễn, `sample-tenant-refresh-nightly` dựng lại số liệu đang demo).
-- Việc này ngược lại: nó chỉ đọc vài dòng có chỉ mục và gửi thông báo cho
-- NGƯỜI, nên phải rơi đúng giờ người ta ngồi ở tiệm.


-- ── B1. Mốc nhắc gần nhất ─────────────────────────────────────────────────
-- Không có cột này thì chạy tay hai lần là khách nhận hai lời nhắc giống hệt.
alter table public.wf_approval_requests
  add column if not exists last_reminded_at timestamptz;

comment on column public.wf_approval_requests.last_reminded_at is
  'Lần gần nhất wf_approvals_nudge() nhắc phiếu này. NULL = chưa nhắc lần nào.';


-- ── B2. Việc nền ──────────────────────────────────────────────────────────
create or replace function public.wf_approvals_nudge()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c_nhac_sau  constant interval := interval '2 days';
  c_dong_sau  constant interval := interval '30 days';
  c_cach_nhac constant interval := interval '20 hours';
  c_gio_nhac  constant int      := 9;    -- 9 giờ sáng THEO GIỜ CỦA TIỆM

  r        record;
  v_nguoi  uuid[];
  v_u      uuid;
  v_ngay   int;
  v_dong   int;
  v_ket    boolean;
  v_gui    int := 0;   -- số phiếu đã động tới (nhắc hoặc đóng)
begin
  for r in
    select q.id, q.tenant_id, q.run_id, q.submission_id, q.title,
           q.level, q.total_levels, q.created_at, q.last_reminded_at
      from public.wf_approval_requests q
      join public.tenants t on t.id = q.tenant_id
     where q.status = 'pending'
       and extract(
             hour from (now() at time zone coalesce(t.timezone, 'Asia/Ho_Chi_Minh'))
           )::int = c_gio_nhac
     order by q.created_at
  loop
    v_ngay := floor(extract(epoch from (now() - r.created_at)) / 86400)::int;

    -- ══ QUÁ CŨ → ĐÓNG, CÓ LÝ DO, VÀ THẢ QUY TRÌNH ĐANG KẸT ═══════════════
    if now() - r.created_at >= c_dong_sau then
      update public.wf_approval_requests
         set status        = 'cancelled',
             decided_at    = now(),
             decision_note = 'Tự đóng sau ' || v_ngay
                             || ' ngày không ai quyết định. Việc nền'
                             || ' wf_approvals_nudge đã nhắc mỗi ngày kể từ ngày thứ 2.'
                             || ' Cần lại thì gửi yêu cầu mới.'
       where id = r.id and status = 'pending';
      get diagnostics v_dong = row_count;

      -- 0 dòng = có người vừa kịp quyết định xen vào giữa. Không phải lỗi,
      -- nhưng cũng KHÔNG được đi tiếp mà đóng quy trình của họ.
      if v_dong = 0 then
        continue;
      end if;

      -- Quy trình đang `waiting` chờ chính phiếu này: không được để nó chờ
      -- mãi một phiếu đã đóng. `last_error` mang lý do — đóng mà không nói vì
      -- sao thì lại đúng cái bệnh đang chữa.
      if r.run_id is not null then
        update public.workflow_runs
           set status      = 'rejected',
               finished_at = now(),
               last_error  = 'approval_expired_30d'
         where id = r.run_id and status = 'waiting';
      end if;

      if r.submission_id is not null then
        update public.wf_form_submissions
           set status = 'cancelled'
         where id = r.submission_id and status = 'submitted';
      end if;

      -- Báo cho NGƯỜI GỬI và những người còn đang được giao duyệt.
      for v_u in
        select s.submitted_by
          from public.wf_form_submissions s
          join public.tenant_members m
            on m.tenant_id = r.tenant_id and m.user_id = s.submitted_by
           and m.status = 'active'
         where s.id = r.submission_id and s.submitted_by is not null
        union
        select a.user_id
          from public.wf_approval_assignees a
          join public.tenant_members m
            on m.tenant_id = a.tenant_id and m.user_id = a.user_id
           and m.status = 'active'
         where a.request_id = r.id and a.decision = 'pending'
      loop
        insert into public.notifications
          (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
        values
          (r.tenant_id, v_u, 'approval',
           'Phiếu quá hạn đã tự đóng',
           r.title || ' — chờ ' || v_ngay || ' ngày không ai quyết định.',
           '/app/approvals',
           'approval.expired.title', 'approval.expired.body',
           jsonb_build_object('subject', r.title, 'days', v_ngay));
      end loop;

      -- Sổ ghi: KHÔNG bảng log mới — cùng bảng `record_audit` mà
      -- `record_audit_log()` ghi vào. Việc nền không có phiên đăng nhập nên
      -- không gọi được hàm đó (nó `raise 'no_tenant_context'`); ghi thẳng là
      -- khuôn đã dùng ở #280 cho `lock-departed-staff-nightly`.
      insert into public.record_audit
        (tenant_id, entity_type, entity_id, actor_id, action, diff)
      values
        (r.tenant_id, 'wf_approval_request', r.id, auth.uid(), 'expired',
         jsonb_build_object(
           'ly_do',      'khong_ai_quyet_dinh',
           'so_ngay_cho', v_ngay,
           'tieu_de',     r.title,
           'cap',         r.level,
           'tong_cap',    r.total_levels,
           'run_id',      r.run_id,
           'boi', case when auth.uid() is null
                       then 'luot_quet_nen' else 'nguoi_goi_tay' end));

      v_gui := v_gui + 1;
      continue;
    end if;

    -- ══ CHƯA TỚI HẠN NHẮC, HOẶC HÔM NAY NHẮC RỒI ════════════════════════
    if now() - r.created_at < c_nhac_sau then
      continue;
    end if;
    if r.last_reminded_at is not null
       and r.last_reminded_at > now() - c_cach_nhac then
      continue;
    end if;

    -- ══ AI CÒN NHẮC ĐƯỢC ════════════════════════════════════════════════
    -- Chỉ người ĐƯỢC GIAO, CHƯA quyết, và CÒN LÀM ở tiệm.
    select array_agg(a.user_id) into v_nguoi
      from public.wf_approval_assignees a
      join public.tenant_members m
        on m.tenant_id = a.tenant_id and m.user_id = a.user_id
       and m.status = 'active'
     where a.request_id = r.id and a.decision = 'pending';

    v_ket := v_nguoi is null or array_length(v_nguoi, 1) is null;

    if v_ket then
      -- Không còn ai duyệt được → LEO THANG lên chủ/quản trị. Nhắc tiếp người
      -- đã nghỉ việc thì phiếu này treo tới 30 ngày rồi tự đóng, mà không ai
      -- từng biết nó tồn tại.
      select array_agg(m.user_id) into v_nguoi
        from public.tenant_members m
       where m.tenant_id = r.tenant_id
         and m.status = 'active'
         and m.role::text in ('owner', 'admin');
    end if;

    -- Tiệm không còn chủ lẫn quản trị đang hoạt động: không có ai để báo.
    -- Bỏ qua chứ KHÔNG đánh dấu đã nhắc — để ngày mai còn thử lại.
    if v_nguoi is null or array_length(v_nguoi, 1) is null then
      continue;
    end if;

    foreach v_u in array v_nguoi loop
      insert into public.notifications
        (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
      values
        (r.tenant_id, v_u, 'approval',
         case when v_ket then 'Phiếu duyệt không còn người xử lý'
                         else 'Phiếu vẫn đang chờ bạn duyệt' end,
         r.title || ' — đã chờ ' || v_ngay || ' ngày.',
         '/app/approvals',
         case when v_ket then 'approval.stalled.title'
                         else 'approval.reminder.title' end,
         case when v_ket then 'approval.stalled.body'
                         else 'approval.reminder.body' end,
         jsonb_build_object('subject', r.title, 'days', v_ngay));
    end loop;

    update public.wf_approval_requests
       set last_reminded_at = now()
     where id = r.id;

    v_gui := v_gui + 1;
  end loop;

  return v_gui;
end;
$$;

comment on function public.wf_approvals_nudge() is
  'Nhắc phiếu duyệt treo (từ ngày thứ 2, mỗi ngày một lần, 9 giờ sáng theo giờ '
  'tiệm), leo thang lên chủ/quản trị khi không còn người duyệt nào còn làm, và '
  'tự đóng phiếu quá 30 ngày — có ghi lý do vào record_audit và thả '
  'workflow_runs đang waiting. Trả về số phiếu đã động tới.';

-- Chỉ việc nền gọi. Không mở cho vai nào của ứng dụng.
revoke all on function public.wf_approvals_nudge() from public, anon, authenticated;


-- ── B3. Hẹn giờ ───────────────────────────────────────────────────────────
-- Mỗi giờ; bên trong hàm mới lọc ra tiệm nào đang 9 giờ sáng. `cron.schedule`
-- ghi đè theo khoá `(jobname, username)` từ pg_cron 1.4 (bản đang chạy 1.6.4)
-- nên chạy lại migration không sinh bản trùng — cùng lý do đã ghi ở #203.
select cron.schedule('wf-approvals-nudge', '0 * * * *',
  $$select public.wf_approvals_nudge()$$);
