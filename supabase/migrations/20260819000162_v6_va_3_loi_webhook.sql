-- V6 integrations — VÁ BA LỖI THẬT trong migration #160-161, bắt được ngay hôm
-- viết nhờ bộ kiểm `scripts/webhook-apikey-smoke.mjs` (20/27 PASS lượt đầu).
-- Cả ba đều là lỗi của người viết #160-161, không phải kỳ vọng sai của bộ kiểm.

-- ════════════════════════════════════════════════════════════════════
-- LỖI 1 — SAI KIỂU: cả mảng phát tin CHẾT CÂM
-- ════════════════════════════════════════════════════════════════════
-- `domain_events.id` là BIGINT (identity, migration #1), nhưng #160 khai
-- `webhook_deliveries.event_id` và `webhook_fanout_cursor.last_event_id` là UUID
-- — vì mọi bảng khác trong kho đều dùng uuid nên người viết suy ra theo thói quen
-- thay vì ĐỌC. Hậu quả: `webhook_queue_new()` gãy ngay câu lệnh đầu tiên với
-- "operator does not exist: bigint > uuid", tức KHÔNG MỘT TIN NÀO từng đi ra
-- được kể từ lúc áp. Không phải lỗi biên — hàm không có nhánh nào chạy được.
--
-- Bài học ghi lại: kiểu khoá chính KHÔNG được suy ra từ quy ước chung của kho,
-- phải đo. Và một hàm chưa từng được gọi thật thì không phân biệt được với một
-- hàm luôn chạy đúng.
alter table public.webhook_deliveries
  alter column event_id type bigint using null;
alter table public.webhook_fanout_cursor
  alter column last_event_id type bigint using null;

-- ════════════════════════════════════════════════════════════════════
-- LỖI 2 — RÀNG BUỘC KHÔNG CHẶN ĐƯỢC GÌ
-- ════════════════════════════════════════════════════════════════════
-- `check (array_length(event_types, 1) > 0)` với mảng RỖNG thì `array_length`
-- trả NULL, mà CHECK gặp NULL là CHO QUA. Mặc định của cột lại đúng là '{}'.
-- Đã tạo được đường báo không đăng ký loại sự kiện nào trên CSDL thật.
--
-- Hậu quả đúng bằng thứ mà chính đầu migration #160 gọi là tệ nhất: đường báo
-- hiện "đang hoạt động" trên màn hình mà không tin nào chạy qua.
alter table public.webhook_endpoints
  drop constraint if exists webhook_endpoints_event_types_check;
alter table public.webhook_endpoints
  add constraint webhook_endpoints_co_su_kien
  check (coalesce(array_length(event_types, 1), 0) > 0);

-- ════════════════════════════════════════════════════════════════════
-- LỖI 3 — NHẬN LẠI PHIẾU ĐANG GỬI DỞ ⇒ BÊN NHẬN NHẬN TIN HAI LẦN
-- ════════════════════════════════════════════════════════════════════
-- `webhook_claim` chỉ lọc `status='pending' and next_attempt_at <= now()`, KHÔNG
-- lọc `claimed_at is null`, và cũng không dời `next_attempt_at`. `for update skip
-- locked` chỉ che nhau khi hai giao dịch CÙNG MỞ; worker gọi RPC xong là commit
-- ngay, nên lượt sau lấy đúng phiếu đó và gửi lần hai.
--
-- Đo được: gọi claim hai lần liên tiếp, cùng một phiếu ra lại, `attempts` lên 2.
-- Luật 2 của thẻ design nói bên nhận PHẢI chịu được nhận hai lần — nhưng đó là
-- lưới đỡ cho mạng chập, không phải giấy phép để mình tự gửi trùng.
create or replace function public.webhook_claim(p_max integer default 20)
returns table (
  delivery_id uuid,
  endpoint_id uuid,
  url         text,
  secret      text,
  event_type  text,
  payload     jsonb,
  attempts    integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with lay as (
    select d.id from public.webhook_deliveries d
     where d.status = 'pending'
       and d.next_attempt_at <= now()
       and d.claimed_at is null      -- ← chỗ thiếu làm gửi trùng
     order by d.next_attempt_at
     limit p_max
     for update skip locked
  ),
  danh_dau as (
    update public.webhook_deliveries d
       set claimed_at = now(), attempts = d.attempts + 1
      from lay where d.id = lay.id
      returning d.*
  )
  select m.id, m.endpoint_id, e.url, e.secret, m.event_type, m.payload, m.attempts
    from danh_dau m
    join public.webhook_endpoints e on e.id = m.endpoint_id;
end;
$$;
revoke execute on function public.webhook_claim(integer) from public, anon, authenticated;

-- Hệ quả tốt: `webhook_tha_phieu_ket()` giờ mới THẬT SỰ có việc. Trước bản vá
-- này nó không bảo vệ điều gì (phiếu kẹt vẫn bị nhận lại), và chú thích của nó
-- ở #161 nói sai sự thật. Nay đúng: worker chết giữa chừng để lại `claimed_at`,
-- và chỉ hàm này mới thả ra được sau 10 phút.

-- ════════════════════════════════════════════════════════════════════
-- Dựng lại webhook_queue_new theo ĐÚNG kiểu bigint
-- ════════════════════════════════════════════════════════════════════
create or replace function public.webhook_queue_new(p_max integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at   timestamptz;
  v_id   bigint;
  v_moi  integer := 0;
  v_cuoi record;
begin
  select last_event_at, last_event_id into v_at, v_id
    from public.webhook_fanout_cursor where only_row for update;

  -- Con trỏ GHÉP (thời điểm + mã dòng): nhiều sự kiện trùng mốc thời gian là
  -- chuyện thường (chốt đơn 5 món sinh 5 dòng cùng khoảnh khắc). Con trỏ chỉ
  -- theo thời gian sẽ LÀM RƠI sự kiện — đúng lỗi #167 đã đo được.
  with moi as (
    select e.* from public.domain_events e
     where (e.created_at, e.id) > (v_at, coalesce(v_id, 0))
     order by e.created_at, e.id
     limit p_max
  ),
  chen as (
    insert into public.webhook_deliveries
      (tenant_id, endpoint_id, event_id, event_type, payload)
    select m.tenant_id, w.id, m.id, m.event_type, m.payload
      from moi m
      join public.webhook_endpoints w
        on w.tenant_id = m.tenant_id
       and w.status = 'active'
       and m.event_type = any(w.event_types)
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into v_moi from chen;

  select e.created_at, e.id into v_cuoi
    from public.domain_events e
   where (e.created_at, e.id) > (v_at, coalesce(v_id, 0))
   order by e.created_at desc, e.id desc
   limit 1;

  if v_cuoi.created_at is not null then
    update public.webhook_fanout_cursor
       set last_event_at = v_cuoi.created_at, last_event_id = v_cuoi.id, updated_at = now()
     where only_row;
  end if;

  return v_moi;
end;
$$;
revoke execute on function public.webhook_queue_new(integer) from public, anon, authenticated;

-- Con trỏ đang đứng ở "lúc tạo bảng". Đẩy lên sự kiện mới nhất để lần chạy đầu
-- KHÔNG dội toàn bộ lịch sử sự kiện ra ngoài — tiệm vừa bật webhook không cần
-- nhận lại mọi đơn hàng từ đầu năm.
update public.webhook_fanout_cursor
   set last_event_at = coalesce((select max(created_at) from public.domain_events), now()),
       last_event_id = (select id from public.domain_events
                         order by created_at desc, id desc limit 1),
       updated_at = now()
 where only_row;
