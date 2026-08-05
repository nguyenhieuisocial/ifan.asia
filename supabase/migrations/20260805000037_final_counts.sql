-- ============================================================
-- iFan.asia — Migration #37: dọn ĐỢT CUỐI các chỗ đếm/tra cứu còn trần ngầm
--
-- Nguồn: đợt quét toàn kho 05/08 (nhật ký "Dọn nợ kỹ thuật — quét toàn kho").
--   Sau #31 và #34 kho không còn range(0,999) / limit(1000) / select('*'), nhưng
--   vẫn còn 3 chỗ dựa vào TRẦN NGẦM 1000 dòng của PostgREST hoặc vào số dòng đã
--   tải về để nói ra một con số.
--
-- VẤN ĐỀ 1 — NGUY HIỂM THẬT (sai âm thầm, mất dữ liệu nối):
--   Nhập khách từ Excel tra công ty theo đuôi email công việc bằng một câu
--   `select id, email_domain from companies where email_domain in (…)`. Câu này
--   trả TỐI ĐA 1000 DÒNG. File nhập có nhiều đuôi công ty, hoặc tiệm có nhiều
--   công ty trùng đuôi, thì từ dòng 1001 trở đi công ty KHÔNG về tới tầng web →
--   khách tương ứng được tạo với company_id = NULL, KHÔNG có một dòng báo lỗi
--   nào. Chủ tiệm không có cách nào biết ai bị sót.
--   Chia lô ở tầng web KHÔNG cứu được triệt để: một lô 500 đuôi vẫn có thể ra
--   hơn 1000 công ty (nhiều công ty cùng đuôi), và thứ tự created_at là thứ tự
--   TOÀN CỤC nên khi bị cắt, cả một đuôi có thể biến mất sạch.
--   SỬA: đẩy hẳn việc tra xuống CSDL — hàm nhận mảng đuôi, trả về jsonb
--   {đuôi → company_id}. Kết quả là MỘT DÒNG jsonb nên không còn trần dòng nào.
--
-- VẤN ĐỀ 2 — con số bị chặn theo số dòng đang tải (không mất dữ liệu, nhưng nói sai):
--   a) Bảng Cơ hội (Kanban) tải tối đa 500 cơ hội rồi đếm/cộng tiền bằng
--      JavaScript: số "cần việc kế tiếp", số thẻ mỗi cột, tiền mỗi cột, tổng
--      đang thương lượng và doanh thu dự báo đều dừng ở tập 500 đó.
--   b) Huy hiệu "Chờ tôi duyệt" đếm trong 50 phiếu trang vừa tải.
--   SỬA: hai hàm đếm chạy thẳng trong CSDL, mỗi màn đúng MỘT lượt gọi. Danh
--   sách hiển thị vẫn giữ trần (bảng Kanban còn phải kéo-thả) — nhưng tầng web
--   nay biết CON SỐ THẬT nên hiện được nút "Tải thêm" đúng lúc, thay vì im lặng.
--
-- Chuẩn: y hệt #31/#34 — security invoker cho hàm đọc (RLS của NGƯỜI GỌI áp
--        nguyên, không mở thêm một quyền nào), set search_path, revoke
--        public/anon trước khi grant đích danh authenticated.
--        KHÔNG tạo bảng mới, KHÔNG sửa/nới bất kỳ policy nào đang có.
--        KHÔNG create or replace hàm cũ nào — cả 3 hàm đều MỚI.
-- ============================================================

-- ---------- 1) Nhập Excel: tra công ty theo đuôi email công việc ----------
-- Trả {"acme.vn": "<uuid>", …}; đuôi không có công ty nào khớp thì vắng khóa
-- (tầng web hiểu là "không nối vào công ty nào").
--
-- Giữ NGUYÊN luật đang chạy ở tầng web:
--   · chỉ nối vào công ty ĐÃ CÓ (file Excel không bao giờ đẻ ra công ty mới),
--   · bỏ qua công ty đã xóa mềm,
--   · trùng đuôi thì lấy công ty CŨ NHẤT (created_at nhỏ nhất; thêm id để hai
--     công ty tạo cùng mốc vẫn cho ra một kết quả ổn định, không đổi mỗi lần).
-- Lọc đuôi rỗng/NULL ngay trong hàm để mảng bẩn từ tầng web không thành điều
-- kiện thừa.
--
-- security invoker: policy companies_all (tenant_id = current_tenant_id()) áp
-- nguyên cho người gọi ⇒ không có đường nào nhìn thấy công ty của tiệm khác.
create or replace function public.companies_by_email_domain(p_domains text[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(email_domain, id), '{}'::jsonb)
  from (
    select distinct on (c.email_domain) c.email_domain, c.id::text as id
    from public.companies c
    where c.deleted_at is null
      and c.email_domain = any(p_domains)
    order by c.email_domain, c.created_at asc, c.id asc
  ) s
$$;

comment on function public.companies_by_email_domain(text[]) is
  'Tra công ty theo đuôi email công việc cho luồng nhập Excel: {đuôi → company_id}, công ty cũ nhất thắng. Một dòng jsonb ⇒ không dính trần 1000 dòng của PostgREST.';

revoke execute on function public.companies_by_email_domain(text[]) from public, anon;
grant execute on function public.companies_by_email_domain(text[]) to authenticated;

-- ---------- 2) Bảng Cơ hội: mọi con số của bảng Kanban ----------
-- Một round-trip cho: tổng số cơ hội · số "cần việc kế tiếp" · tổng tiền đang
-- thương lượng · doanh thu dự báo · số thẻ + tiền của TỪNG cột.
--
-- Định nghĩa bám ĐÚNG tầng web đang dùng, không đẻ ra nghĩa mới:
--   · "cần việc kế tiếp" = needsNextAction() của app/app/deals/types.ts:
--     cơ hội ĐANG MỞ và (chưa có việc kế tiếp HOẶC đã quá hạn).
--   · "dự báo" = forecastValue(): Σ(giá trị × tỉ lệ thắng của bước)/100, chỉ
--     tính cơ hội đang mở, bước chưa đặt tỉ lệ coi như 0.
--   · số thẻ/tiền mỗi cột tính CẢ cơ hội đã thắng/thua (đúng như cột
--     Thắng/Thua đang hiện "tổng từ trước tới nay").
--   · cơ hội đã xóa mềm không tính, ở mọi con số.
--
-- security invoker: policy deals_select áp nguyên ⇒ nhân viên chỉ đếm được cơ
-- hội mình phụ trách, y hệt danh sách họ nhìn thấy. Hai con số không thể lệch
-- nhau vì cùng một luật RLS.
create or replace function public.deal_board_stats(p_pipeline uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with d as (
    select d.stage_id, d.status, d.value_vnd, d.next_action_at
    from public.deals d
    where d.pipeline_id = p_pipeline
      and d.deleted_at is null
  ),
  per_stage as (
    select stage_id, count(*) as n, coalesce(sum(value_vnd), 0) as total
    from d
    group by stage_id
  )
  select jsonb_build_object(
    'total', (select count(*) from d),
    'needs_action', (select count(*) from d
        where status = 'open'
          and (next_action_at is null or next_action_at <= now())),
    'open_total', (select coalesce(sum(value_vnd), 0) from d where status = 'open'),
    'forecast', (select coalesce(sum(d.value_vnd * coalesce(s.win_probability, 0)) / 100.0, 0)
        from d
        join public.pipeline_stages s on s.id = d.stage_id
        where d.status = 'open'),
    'stages', (select coalesce(
        jsonb_object_agg(stage_id::text, jsonb_build_object('n', n, 'total', total)),
        '{}'::jsonb) from per_stage))
$$;

comment on function public.deal_board_stats(uuid) is
  'Mọi con số của bảng Kanban Cơ hội (đếm/cộng trong CSDL): tổng, cần việc kế tiếp, tiền đang thương lượng, dự báo, và số thẻ + tiền từng cột.';

revoke execute on function public.deal_board_stats(uuid) from public, anon;
grant execute on function public.deal_board_stats(uuid) to authenticated;

-- ---------- 3) Duyệt & yêu cầu: số phiếu ĐANG chờ chính tôi duyệt ----------
-- Đúng bằng điều kiện tầng web đang lọc để dựng tab "Chờ tôi duyệt":
--   phiếu được giao cho tôi, tôi CHƯA quyết định, và phiếu vẫn còn đang chờ
--   (phiếu đã bị người khác cùng cấp chốt thì không còn chờ tôi nữa).
create or replace function public.approval_pending_count()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int
  from public.wf_approval_assignees a
  join public.wf_approval_requests r on r.id = a.request_id
  where a.user_id = auth.uid()
    and a.decision = 'pending'
    and r.status = 'pending'
$$;

comment on function public.approval_pending_count() is
  'Số phiếu đang chờ chính người gọi duyệt — huy hiệu tab "Chờ tôi duyệt" (trước đây chặn ở 50 vì đếm trong trang vừa tải).';

revoke execute on function public.approval_pending_count() from public, anon;
grant execute on function public.approval_pending_count() to authenticated;
