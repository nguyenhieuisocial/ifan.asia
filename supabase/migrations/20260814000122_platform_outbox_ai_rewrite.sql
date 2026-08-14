-- Migration #122 — cột lưu bản THẬT SỰ đã gửi, khi Haiku soạn lại tin chuông.
--
-- Founder (14/08): "các thông báo cần Haiku review và soạn gửi phù hợp!"
-- Hồ sơ: docs/adr/0007-chuong-canh-bao-nen-tang.md mục 12e.
--
-- ⚠️ ĐÍNH CHÍNH một câu trong chính hồ sơ đó — viết lúc chưa đọc kỹ code:
-- "Dùng lại túi lượt + trần chi tiêu ADR-0011 việc 6" là SAI, đọc thẳng vào
-- increment_usage/increment_usage_for thì cả hai đều bắt buộc p_tenant NOT
-- NULL ("if p_tenant is null then raise exception 'no_tenant_context'"), còn
-- platform_outbox tự khai ngay trong comment của nó: "không tenant_id, một
-- người nhận duy nhất". Không có tenant thì không có gì để tính quota theo
-- tenant — ép dùng chung sẽ phải bịa một tenant giả, còn tệ hơn không dùng.
-- Không dựng đường đếm mới: khối lượng đã bị chặn tự nhiên bởi p_batch=20
-- của platform_claim_outbox (tối đa 20 lượt gọi AI mỗi lần cron chạy).
--
-- Vì sao KHÔNG dùng ai_reply_log (bảng ghi trước/sau sẵn có của AI trực
-- việc): cột tenant_id và conversation_id của nó NOT NULL, và outcome là enum
-- đóng khớp đúng 8 ca của tính năng đó (skipped_daily_cap, skipped_turn_cap…)
-- — ép platform_outbox (không tenant, không hội thoại) vào đó là bịa dữ liệu
-- để vừa khuôn, đúng thứ luật D2 cấm.
--
-- Cách đúng: platform_outbox đã CÓ sẵn `body` (bản gốc, máy tự sinh). Thêm
-- MỘT cột `sent_body` — bản THẬT SỰ đã gửi khi khác bản gốc (Haiku soạn lại
-- thành công). NULL = gửi nguyên bản gốc (AI tắt/lỗi/không cần soạn lại) —
-- không ghi trùng dữ liệu khi không có gì khác biệt.

alter table public.platform_outbox
  add column if not exists sent_body text;

comment on column public.platform_outbox.sent_body is
  'Bản Haiku soạn lại đã THẬT SỰ gửi (migration #122). NULL = gửi nguyên body gốc (AI tắt/lỗi/không cần soạn lại).';

-- platform_complete_outbox thêm tham số p_sent_body (mặc định null, không phá
-- lời gọi cũ). Chỉ ghi khi p_ok và có khác biệt thật với body gốc — tránh
-- lưu trùng dữ liệu vô ích khi Haiku trả về y hệt bản gốc.
create or replace function public.platform_complete_outbox(
  p_key text,
  p_id bigint,
  p_ok boolean,
  p_error text default null,
  p_sent_body text default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  if p_key is null
     or (select value from private.app_config where key = 'bot_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  if p_ok then
    update public.platform_outbox
      set status = 'sent', sent_at = now(), last_error = null,
          sent_body = case when p_sent_body is distinct from body then p_sent_body else null end
      where id = p_id;
  else
    update public.platform_outbox
      set status = case when attempts >= 5 then 'failed' else 'pending' end,
          last_error = left(coalesce(p_error, 'send_failed'), 500)
      where id = p_id;
  end if;
end $$;
revoke all on function public.platform_complete_outbox(text, bigint, boolean, text, text) from public;
grant execute on function public.platform_complete_outbox(text, bigint, boolean, text, text) to anon, authenticated;
