-- Migration #109 — nhật ký AI trực việc phải tự SỬA khi lỗi tạm thời qua đi.
--
-- LỖI THẬT bắt được khi thử tay: cổng gọi AI hỏng tạm thời (đợt sáng đổi model
-- Haiku, migration #106) → ghi outcome='error' cho một tin khách. Sau khi sửa
-- cổng gọi, máy quét chạy lại ĐÚNG tin đó, AI trả lời THÀNH CÔNG và tin ĐÃ GỬI
-- THẬT cho khách — nhưng `ai_reply_log_record()` cũ dùng `on conflict do
-- nothing`, nên dòng nhật ký vẫn đứng nguyên ở 'error' MÃI MÃI dù khách đã
-- được trả lời. Founder mở Nhật ký sẽ đọc "lỗi" cho một tin đã xong việc —
-- đúng loại sai sự thật mà cả đợt AI trực việc dựng ra để chống.
--
-- SỬA: 'error' là tình trạng TẠM THỜI (mạng chập chờn, cổng hỏng phút đó) nên
-- được PHÉP ghi đè khi biết kết cục thật; 'sent' và 'skipped_out_of_scope' là
-- SỰ THẬT ĐÃ XẢY RA (tin đã gửi thật / đã triệu chứng đúng phạm vi) nên
-- KHÔNG được ghi đè — không có chuyện "tin đã gửi" tự nhiên biến thành gì
-- khác trong nhật ký. 5 outcome 'skipped_*' còn lại (do decide() tự ghi) vẫn
-- giữ nguyên `on conflict do nothing` — đó là quyết định luật KHÔNG đổi theo
-- lần chạy, không phải tình trạng chờ giải quyết.

create or replace function public.ai_reply_log_record(
  p_conversation_id uuid,
  p_trigger_message_id uuid,
  p_outcome text,
  p_reason text default null,
  p_sent_message_id uuid default null
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
  v_da_ghi boolean;
begin
  if p_outcome not in ('sent','skipped_out_of_scope','error') then
    raise exception 'invalid_outcome';
  end if;
  if p_trigger_message_id is null then raise exception 'invalid_trigger_message'; end if;
  select c.tenant_id into v_tenant
    from public.conversations c where c.id = p_conversation_id;
  if v_tenant is null then raise exception 'conversation_not_found'; end if;

  insert into public.ai_reply_log
    (tenant_id, conversation_id, trigger_message_id, outcome, reason, message_id)
    values (v_tenant, p_conversation_id, p_trigger_message_id, p_outcome, p_reason,
            case when p_outcome = 'sent' then p_sent_message_id else null end)
    on conflict (trigger_message_id) do update
      set outcome = excluded.outcome, reason = excluded.reason,
          message_id = excluded.message_id, created_at = now()
      -- Chỉ ghi đè khi dòng CŨ đang là 'error' — tình trạng tạm thời, chờ kết
      -- cục thật. 'sent'/'skipped_out_of_scope' cũ là sự thật đã xảy ra.
      where public.ai_reply_log.outcome = 'error'
    returning true into v_da_ghi; -- có dòng trả về = ĐÃ GHI (mới hoặc ghi đè từ 'error')
    -- KHÔNG có dòng trả về (v_da_ghi vẫn null) = xung đột nhưng mệnh đề WHERE
    -- chặn lại (dòng cũ đã là 'sent'/'skipped_out_of_scope', không được đổi)
    -- → không ghi gì, không phát event, giữ nguyên sự thật đã có.

  if p_outcome = 'sent' and v_da_ghi is not null then
    perform public.wf_emit(v_tenant, 'ai.replied', 'conversation', p_conversation_id::text,
                           jsonb_build_object('message_id', p_sent_message_id));
  end if;
end $$;

comment on function public.ai_reply_log_record(uuid, uuid, text, text, uuid) is
  'ADR-0014 mục 4. outcome=error được phép ghi đè khi biết kết cục thật (lỗi tạm thời); sent/skipped_out_of_scope là sự thật đã xảy ra, không ghi đè. 5 outcome skipped_* còn lại do ai_autopilot_decide() tự ghi, không đổi.';
