-- ════════════════════════════════════════════════════════════════════
-- MỨC THÔNG BÁO CỦA KÊNH PHẢI THẬT SỰ CÓ TÁC DỤNG
-- ════════════════════════════════════════════════════════════════════
--
-- #309 dựng bảng `chat_channel_prefs` với ba mức `all` · `mentions` · `off`,
-- và lượt sửa giao diện vừa bày cả ba ra thành một menu. Nhưng **không có
-- dòng mã nào đọc tới nó**: thông báo sinh ra từ trigger trên `chat_mentions`,
-- và trigger đó không biết bảng kia tồn tại.
--
-- Nghĩa là: chọn "Tắt hẳn" xong vẫn nhận thông báo y như cũ. Một cái nút nói
-- dối — thứ tệ hơn hẳn việc không có nút. Người dùng sẽ tin là đã tắt, rồi
-- bực vì "phần mềm không nghe lời", rồi tắt thông báo CẢ ứng dụng — đúng cái
-- kết cục mà tính năng này sinh ra để tránh.
--
-- ┌─ VÀ MỘT ĐIỀU PHẢI NÓI THẲNG VỀ MỨC 'all' ─────────────────────────
-- Hôm nay thông báo CHỈ sinh ra khi có người GỌI TÊN. Tin thường không báo
-- cho ai, cố ý (xem chú thích trong `guiTinChat`). Nên mức `all` và mức
-- `mentions` hiện HÀNH XỬ Y HỆT NHAU.
--
-- Không làm cho `all` báo mọi tin — một kênh cả tiệm nhắn cả ngày mà tin nào
-- cũng đẩy thông báo thì trong hai ngày mọi người sẽ tắt thông báo hệ thống,
-- và lời nhắc lịch hẹn chết theo. Đó là cái giá thật, đổi lấy một tính năng
-- không ai xin.
--
-- Thay vào đó GIAO DIỆN chỉ bày HAI lựa chọn có thật. Giá trị `all` vẫn nhận
-- ở tầng dữ liệu (bản cũ đã ghi) và được đọc như `mentions`.

create or replace function public.chat_mentions_bao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text;
  v_kenh uuid;
  v_muc  text;
begin
  select m.body, m.channel_id into v_body, v_kenh
    from public.chat_messages m where m.id = new.message_id;

  -- Mức thông báo CỦA NGƯỜI ĐƯỢC GỌI TÊN cho ĐÚNG kênh đó.
  -- Không có dòng nào = 'all' — mặc định phải là NHẬN ĐỦ, vì người chưa từng
  -- chỉnh mà tự nhiên không nhận thông báo sẽ tưởng không ai gọi mình.
  select coalesce(p.muc, 'all') into v_muc
    from public.chat_channel_prefs p
   where p.channel_id = v_kenh
     and p.user_id = new.mentioned_user_id;

  if coalesce(v_muc, 'all') = 'off' then
    -- Người ta đã tắt kênh này. Không báo, và cũng không ghi gì thêm — lời
    -- gọi tên vẫn nằm trong `chat_mentions` nên hộp "Nhắc tới tôi" vẫn thấy.
    return null;
  end if;

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  values (new.tenant_id, new.mentioned_user_id, 'chat_mention',
          'Có người nhắc tên bạn trong tin nhắn nội bộ',
          left(coalesce(v_body, ''), 300),
          '/app/chat?c=' || v_kenh::text);

  return null;
end;
$$;

comment on function public.chat_mentions_bao() is
  'Sinh thông báo khi có người gọi tên — TRỪ khi người đó đã tắt thông báo của đúng kênh ấy (chat_channel_prefs.muc = off). Lời gọi tên vẫn được ghi lại nên hộp "Nhắc tới tôi" vẫn thấy — #314.';
