-- Sức khoẻ đường ống bán — bốn con số mới của bảng Cơ hội, ĐẾM TRONG CSDL.
--
-- VÌ SAO CÓ MIGRATION NÀY
-- ───────────────────────
-- Bảng Kanban Cơ hội bày tối đa BOARD_DEAL_LIMIT = 500 thẻ một lượt, nên MỌI con
-- số mô tả cả bảng đều phải do CSDL đếm chứ không đếm trên tập thẻ đã tải — luật
-- đó đã được migration #37 (`deal_board_stats`) đặt ra cho `total`,
-- `needs_action`, `open_total`, `forecast`, và số của từng cột.
--
-- Đợt này thêm bốn số cùng họ, nên chúng phải đi cùng đường:
--
--   · `forecast_this_month`     — phần dự báo có ngày chốt rơi vào tháng này
--   · `overdue_close_count`     — số cơ hội mở ĐÃ QUÁ ngày dự kiến chốt
--   · `overdue_close_forecast`  — phần dự báo đến TỪ nhóm quá ngày đó
--   · `stale`                   — số cơ hội mở đứng yên một bước ≥ 14 ngày
--
-- ĐO ĐƯỢC TRƯỚC KHI LÀM (21/08, trên CSDL thật, chỉ đọc):
--   33 cơ hội đang mở · 26 trong số đó (79%) đã quá ngày dự kiến chốt · tổng giá
--   trị nhóm quá hạn 112.070.000đ · 32/33 thẻ đứng yên một bước từ 7 tới 30 ngày.
--   Cả 26 cơ hội quá hạn vẫn được cộng NGUYÊN vào con số "dự kiến thu" mà chủ
--   tiệm đọc để tính tiền mặt. Không màn nào, không cảnh báo nào nói ra điều đó.
--
-- TẦNG WEB KHÔNG PHỤ THUỘC MIGRATION NÀY ĐỂ CHẠY ĐƯỢC
-- ────────────────────────────────────────────────────
-- Bốn khoá trên khai `optional` trong `BoardStats` (app/app/deals/types.ts).
-- Chưa áp migration ⇒ RPC trả jsonb thiếu bốn khoá ⇒ chúng về `undefined` ⇒ tầng
-- web tự đếm trên tập thẻ đã tải, đúng khuôn `stats?.x ?? tự đếm` mà
-- `open_total`/`forecast` đã dùng sẵn cho trường hợp RPC hỏng. Tức là: áp
-- migration làm con số ĐÚNG Ở MỌI QUY MÔ; chưa áp thì màn vẫn chạy, chỉ kém
-- chính xác khi tiệm vượt 500 thẻ. Không có trạng thái vỡ ở giữa.
--
-- NGƯỠNG NGUỘI 14 NGÀY
-- ────────────────────
-- Nhân đôi ở hai nơi (hằng số `STALE_DAYS` bên web và số 14 dưới đây) là CỐ Ý và
-- có rủi ro đã biết: lệch nhau thì con số tổng không khớp nhãn trên thẻ. Chọn
-- vậy vì đường kia — đọc ngưỡng từ một bảng cấu hình — bắt phải đẻ ra một màn
-- Cài đặt cho một con số chưa ai kêu là sai. Nếu ngày nào ngưỡng thành thứ chủ
-- tiệm tự đặt được, thì sửa CẢ HAI trong cùng một lần, và lúc đó nên chuyển hẳn
-- sang đọc từ bảng `tenant_settings` để chỉ còn một nguồn.
--
-- `stage_entered_at` là cái đồng hồ trung thực, khác `next_action_at`: nút "Hẹn
-- tiếp" dời `next_action_at` bao nhiêu lần cũng được và không ghi vết, nên cơ hội
-- bị dời hẹn mãi KHÔNG BAO GIỜ lọt vào `needs_action` — nó chết êm trong khi vẫn
-- được cộng đủ vào dự báo. `stage_entered_at` chỉ đổi khi thẻ thật sự sang bước
-- khác. Migration nền CRM (#4) đã chú thích thẳng cột này là "phục vụ SLA/rotting"
-- — tới nay mới có thứ dùng nó đúng việc.

create or replace function public.deal_board_stats(p_pipeline uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with d as (
    select d.stage_id, d.status, d.value_vnd, d.next_action_at,
           d.expected_close_date, d.stage_entered_at
    from public.deals d
    where d.pipeline_id = p_pipeline
      and d.deleted_at is null
  ),
  per_stage as (
    select stage_id, count(*) as n, coalesce(sum(value_vnd), 0) as total
    from d
    group by stage_id
  ),
  -- Cơ hội đang mở kèm phần dự báo của chính nó (giá trị × tỉ lệ thắng của bước)
  -- và ngày "hôm nay" theo giờ Việt Nam — `expected_close_date` là kiểu date nên
  -- phải so với NGÀY của múi giờ tiệm, không phải ngày UTC của máy chủ.
  mo as (
    select d.value_vnd * coalesce(s.win_probability, 0) / 100.0 as du_bao,
           d.expected_close_date,
           d.stage_entered_at,
           (now() at time zone 'Asia/Ho_Chi_Minh')::date as hom_nay
    from d
    join public.pipeline_stages s on s.id = d.stage_id
    where d.status = 'open'
  )
  select jsonb_build_object(
    'total', (select count(*) from d),
    'needs_action', (select count(*) from d
        where status = 'open'
          and (next_action_at is null or next_action_at <= now())),
    'open_total', (select coalesce(sum(value_vnd), 0) from d where status = 'open'),
    'forecast', (select coalesce(sum(du_bao), 0) from mo),
    -- Quá ngày chốt: đã trượt lời hứa về TIỀN, khác "quá hạn việc kế tiếp" (lời
    -- hứa với chính mình, dời lúc nào cũng được).
    'overdue_close_count', (select count(*) from mo
        where expected_close_date is not null and expected_close_date < hom_nay),
    'overdue_close_forecast', (select coalesce(sum(du_bao), 0) from mo
        where expected_close_date is not null and expected_close_date < hom_nay),
    -- "Tháng này" CỐ Ý loại nhóm đã quá hạn, kể cả khi ngày chốt của chúng rơi
    -- đúng tháng này: nó đã trượt rồi, cộng tiếp là lại dựng lên một con số hứa
    -- hẹn đúng thứ vừa lỡ. Khớp nguyên văn hàm forecastHorizon() bên web.
    'forecast_this_month', (select coalesce(sum(du_bao), 0) from mo
        where expected_close_date is not null
          and expected_close_date >= hom_nay
          and date_trunc('month', expected_close_date) = date_trunc('month', hom_nay)),
    'stale', (select count(*) from mo
        where stage_entered_at <= now() - interval '14 days'),
    'stages', (select coalesce(
        jsonb_object_agg(stage_id::text, jsonb_build_object('n', n, 'total', total)),
        '{}'::jsonb) from per_stage))
$$;

comment on function public.deal_board_stats(uuid) is
  'Mọi con số của bảng Kanban Cơ hội (đếm/cộng trong CSDL): tổng, cần việc kế tiếp, tiền đang thương lượng, dự báo, số thẻ + tiền từng cột, và (từ #260) sức khoẻ đường ống — dự báo chốt trong tháng, nhóm quá ngày dự kiến chốt, số cơ hội nguội ≥ 14 ngày đứng yên một bước.';

-- Quyền giữ NGUYÊN như #37. `create or replace` không đụng tới grant đã cấp,
-- nhưng khai lại cho rõ: người đọc migration này không phải mở #37 mới biết ai
-- gọi được hàm.
revoke execute on function public.deal_board_stats(uuid) from public, anon;
grant execute on function public.deal_board_stats(uuid) to authenticated;
