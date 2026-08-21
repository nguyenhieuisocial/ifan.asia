-- #300 — "GIỚI THIỆU BẠN TỚI ĐƯỢC THƯỞNG": bật được, lưu được, KHÔNG BAO GIỜ trả.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ ĐANG MỞ — mượn miệng chủ tiệm để hứa hộ một món không bao giờ tới
-- ════════════════════════════════════════════════════════════════════
--
-- Ô cài đặt có thật và lưu được thật (`loyalty_config.referral_points`, màn
-- Điểm thưởng). Chủ tiệm đặt "thưởng 200 điểm", dán lên tường, khách rủ bạn
-- tới — **không ai được cộng gì**.
--
-- Đo được (21/08):
--   · **0** hàm trong `public` + `private` có đọc `referral_points`
--   · **0** hàm nào gọi `loyalty_grant()` — hàm cộng điểm tay có tồn tại
--     nhưng không nơi nào gọi, kể cả từ mã web
--   · 69 dòng điểm `referral` trong sổ **đều nằm ở tiệm MẪU**, do kịch bản
--     gieo dữ liệu viết vào. Tiệm thật: 0 dòng.
--   · `contacts` **không hề có** chỗ ghi ai giới thiệu ai — nên kể cả muốn
--     trả cũng không biết trả cho ai
--
-- Đây là lỗi tệ hơn một tính năng thiếu: tính năng thiếu thì chủ tiệm biết mà
-- không hứa. Cái này khiến **chủ tiệm đi hứa với khách**, rồi mất mặt với
-- chính khách của mình.
--
-- ════════════════════════════════════════════════════════════════════
-- HAI ĐƯỜNG, VÀ VÌ SAO CHỌN ĐƯỜNG KHÓ HƠN
-- ════════════════════════════════════════════════════════════════════
--
-- (a) Gỡ ô cài đặt đi — nhanh, thật thà, nhưng lấy mất một thứ chủ tiệm rõ
--     ràng muốn có (họ đã bật nó).
-- (b) Làm cho nó chạy thật.
--
-- Chọn (b). Ô đó tồn tại vì có nhu cầu thật; xoá đi là trả lời một câu hỏi
-- thiết kế bằng cách né nó.
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN QUYẾT ĐỊNH, GHI RÕ VÌ MỖI CÁI ĐỀU CÓ ĐƯỜNG SAI CẠNH BÊN
-- ════════════════════════════════════════════════════════════════════
--
-- 1. **Thưởng khi khách mới HOÀN TẤT ĐƠN ĐẦU TIÊN**, không phải khi vừa tạo
--    hồ sơ. Cộng lúc tạo hồ sơ là mở cửa cho việc bịa tên khách để lấy điểm —
--    và người bịa được nhiều nhất chính là nhân viên trong tiệm.
--
-- 2. **Mỗi khách mới chỉ sinh thưởng ĐÚNG MỘT LẦN**, chốt bằng chỉ mục duy
--    nhất trên sổ điểm chứ không bằng phép kiểm trong hàm. Hai đơn hoàn tất
--    gần như cùng lúc thì phép kiểm bằng tay cho lọt cả hai.
--
-- 3. **KHÔNG tự thưởng chính mình.** Người giới thiệu ≠ khách mới. Nghe hiển
--    nhiên, nhưng đây đúng là loại chốt hay bị quên rồi bị lợi dụng.
--
-- 4. **Đọc mức thưởng TẠI LÚC TRẢ**, không đóng băng lúc gắn người giới thiệu.
--    Chủ tiệm đổi từ 200 xuống 50 thì lượt sau trả 50 — mức thưởng là chính
--    sách hiện hành, không phải lời hứa đã ký.

-- ── 1. Chỗ ghi ai giới thiệu ai ────────────────────────────────────────────
alter table public.contacts
  add column if not exists referred_by_contact_id uuid
    references public.contacts(id) on delete set null;

create index if not exists contacts_theo_nguoi_gioi_thieu
  on public.contacts (tenant_id, referred_by_contact_id)
  where referred_by_contact_id is not null;

comment on column public.contacts.referred_by_contact_id is
  'Khách nào đã giới thiệu khách này tới (#300). Thưởng trả khi khách mới hoàn tất đơn ĐẦU TIÊN.';

-- Không tự giới thiệu chính mình.
alter table public.contacts drop constraint if exists contacts_khong_tu_gioi_thieu;
alter table public.contacts
  add constraint contacts_khong_tu_gioi_thieu
  check (referred_by_contact_id is null or referred_by_contact_id <> id);

-- ── 2. Một khách mới chỉ sinh thưởng đúng một lần ──────────────────────────
-- Neo vào khách MỚI (người làm phát sinh khoản thưởng), không neo vào người
-- nhận — một người giới thiệu nhiều bạn thì nhận nhiều lần, đúng ý.
alter table public.loyalty_ledger
  add column if not exists referred_contact_id uuid
    references public.contacts(id) on delete set null;

create unique index if not exists loyalty_mot_lan_thuong_moi_nguoi_duoc_gioi_thieu
  on public.loyalty_ledger (tenant_id, referred_contact_id)
  where reason = 'referral' and referred_contact_id is not null;

-- ── 3. Đường trả thưởng ────────────────────────────────────────────────────
create or replace function private.tra_thuong_gioi_thieu(p_order uuid)
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_don      record;
  v_nguoi_gt uuid;
  v_diem     integer;
  v_han      integer;  -- số THÁNG, theo `loyalty_config.expire_months`
begin
  select o.id, o.tenant_id, o.contact_id, o.status
    into v_don
    from public.orders o
   where o.id = p_order;
  if v_don.contact_id is null then return; end if;

  select c.referred_by_contact_id into v_nguoi_gt
    from public.contacts c
   where c.id = v_don.contact_id and c.tenant_id = v_don.tenant_id;
  if v_nguoi_gt is null then return; end if;

  -- Mức thưởng đọc TẠI ĐÂY, tại lúc trả (quyết định 4).
  -- Cột hạn điểm tên là `expire_months` (THÁNG). Bản nháp đầu viết
  -- `points_expire_days` vì đoán theo tên nghe hợp lý — đọc lược đồ mới thấy
  -- sai. Đúng bài học đã trả giá ở #288: đọc lược đồ trước khi ghi vào nó.
  select coalesce(lc.referral_points, 0), coalesce(lc.expire_months, 0)
    into v_diem, v_han
    from public.loyalty_config lc
   where lc.tenant_id = v_don.tenant_id;
  if coalesce(v_diem, 0) <= 0 then return; end if;

  -- ĐÂY LÀ ĐƠN ĐẦU TIÊN CHỨ? Nếu khách mới đã từng có đơn hoàn tất nào khác
  -- thì lượt thưởng đã (hoặc đáng lẽ đã) trả rồi. Chỉ mục duy nhất bên dưới
  -- mới là chốt thật; phép đếm này chỉ để không ném lỗi vô ích.
  if exists (
    select 1 from public.orders o2
     where o2.tenant_id = v_don.tenant_id
       and o2.contact_id = v_don.contact_id
       and o2.id <> v_don.id
       and o2.status = 'completed'
       and o2.deleted_at is null
  ) then
    return;
  end if;

  insert into public.loyalty_ledger
      (tenant_id, contact_id, delta_points, reason, referred_contact_id, note,
       expires_at, remaining)
    values
      (v_don.tenant_id, v_nguoi_gt, v_diem, 'referral', v_don.contact_id,
       'Thưởng giới thiệu khách mới',
       case when v_han > 0 then now() + (v_han || ' months')::interval else null end,
       v_diem)
  on conflict do nothing;
end $$;

-- ── 4. Gắn vào lúc đơn chuyển sang "hoàn tất" ──────────────────────────────
create or replace function public.orders_tra_thuong_gioi_thieu()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and coalesce(old.status, '') <> 'completed' then
    -- Bên nhận hỏng KHÔNG được làm hỏng việc bán hàng (bất biến 12): nuốt lỗi
    -- của riêng phần thưởng, nhưng ghi ra để không hỏng trong im lặng.
    begin
      perform private.tra_thuong_gioi_thieu(new.id);
    exception when others then
      raise warning 'tra_thuong_gioi_thieu that bai cho don %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists orders_thuong_gioi_thieu on public.orders;
create trigger orders_thuong_gioi_thieu
  after update on public.orders
  for each row execute function public.orders_tra_thuong_gioi_thieu();

comment on function private.tra_thuong_gioi_thieu(uuid) is
  'Trả điểm cho người giới thiệu khi khách mới hoàn tất đơn ĐẦU TIÊN (#300). Trước bản này ô cài đặt bật được nhưng không đường nào trả.';
