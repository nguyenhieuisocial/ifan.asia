-- ============================================================
-- iFan.asia — Migration #34: dọn nốt hai bộ đếm "tải về rồi đếm"
--
-- Nguồn: nợ kỹ thuật còn lại sau migration #31 (mục "đếm bằng COUNT").
--
-- VẤN ĐỀ — PostgREST trả tối đa 1000 dòng mỗi lượt. Hai màn dưới đây đang TẢI
--   danh sách về rồi đếm bằng `.length` ở tầng web, nên từ dòng thứ 1001 con số
--   ĐỨNG YÊN Ở 1000 mà không có một dấu hiệu nào báo là đã bị cắt:
--     1) Cài đặt → Quy trình tự động: "đã chạy N lần trong 7 ngày" của mỗi quy
--        trình (kèm trạng thái lần chạy gần nhất) — sai từ lần chạy thứ 1001
--        TRONG 7 NGÀY.
--     2) Cài đặt → Biểu mẫu: "N lượt gửi" của mỗi biểu mẫu — NẶNG HƠN vì không
--        có mốc thời gian nào cả: tiệm dùng lâu là chắc chắn sai.
--   SỬA: hai hàm đếm chạy COUNT ngay trong CSDL, mỗi màn đúng MỘT lượt gọi.
--
-- Chuẩn: y hệt #31 — security invoker cho hàm đọc (RLS của NGƯỜI GỌI áp nguyên,
--        không mở thêm một quyền nào), set search_path, revoke public/anon
--        trước khi grant đích danh authenticated.
--        KHÔNG tạo bảng mới, KHÔNG sửa/nới bất kỳ policy nào đang có.
--
-- KHÔNG có trong migration này (cố ý): phần "giữ mã lời mời qua luồng đăng ký"
--   thuần tầng web — `accept_invitation()` của #28 ĐÃ kiểm lại giới hạn ghế đúng
--   lúc NHẬN (đánh dấu lời mời 'accepted' để nhả ghế của chính nó, rồi insert vào
--   `tenant_members` đi qua trigger `tenant_members_seat_limit`). Không đụng vào
--   hàm đó thì không có đường nào làm yếu lớp chặn ấy.
-- ============================================================

-- ---------- Quy trình tự động: số lần chạy + trạng thái lần gần nhất ----------
-- Một round-trip cho CẢ HAI con số của mỗi quy trình, thay cho việc tải toàn bộ
-- lượt chạy 7 ngày về máy chủ web.
-- Trả {"<workflow_id>": {"runs": 37, "last_status": "done"}, …}; quy trình chưa
-- chạy lần nào thì vắng khóa (tầng web hiểu là 0 lượt / chưa có trạng thái).
-- p_since do tầng web truyền (mốc 7 ngày theo giờ VN, giống trước) — giữ nguyên
-- cách tính mốc ở một chỗ duy nhất, không nhân bản logic giờ VN xuống DB.
create or replace function public.workflow_run_stats(p_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(workflow_id::text,
      jsonb_build_object('runs', n, 'last_status', last_status)),
    '{}'::jsonb)
  from (
    select workflow_id,
           count(*) as n,
           -- "gần nhất" = created_at lớn nhất; thêm id để hai lượt chạy trùng
           -- mốc thời gian vẫn cho ra một kết quả ổn định, không đổi mỗi lần mở.
           (array_agg(status order by created_at desc, id desc))[1] as last_status
    from public.workflow_runs
    where created_at >= p_since
    group by workflow_id) s
$$;

revoke execute on function public.workflow_run_stats(timestamptz) from public, anon;
grant execute on function public.workflow_run_stats(timestamptz) to authenticated;

-- ---------- Biểu mẫu: số lượt gửi của mỗi biểu mẫu ----------
-- Trả {"<form_id>": 1234, …}; biểu mẫu chưa ai gửi thì vắng khóa (web hiểu là 0).
-- KHÔNG giới hạn thời gian — đúng ý nghĩa "tổng số lượt đã gửi" mà màn đang hiện.
create or replace function public.form_submission_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(form_id::text, n), '{}'::jsonb)
  from (
    select form_id, count(*) as n
    from public.wf_form_submissions
    group by form_id) s
$$;

revoke execute on function public.form_submission_counts() from public, anon;
grant execute on function public.form_submission_counts() to authenticated;
