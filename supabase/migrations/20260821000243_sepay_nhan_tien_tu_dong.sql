-- ═══════════════════════════════════════════════════════════════════════════
-- NHẬN TIỀN TỰ ĐỘNG QUA SEPAY — khách chuyển khoản xong là đơn TỰ ghi nhận
-- ───────────────────────────────────────────────────────────────────────────
-- HÔM NAY: thu ngân phải tự bấm "Đã nhận tiền" (`recordPayment`,
-- app/app/orders/actions.ts). Mã QR đã in sẵn nội dung `DH<8 ký tự đầu mã đơn>`
-- (order-detail-view.tsx) nhưng KHÔNG ai đọc lại nội dung ấy — khách chuyển
-- xong, đơn vẫn treo cho tới khi có người nhìn app ngân hàng rồi gõ tay.
--
-- SEPAY làm đúng một việc: đọc biến động số dư tài khoản ngân hàng CỦA TIỆM
-- rồi bắn một request về đây. Migration này nhận request đó, bóc mã đơn trong
-- nội dung chuyển khoản, và ghi `order_payments` — cùng một cửa mà thu ngân
-- vẫn đi, nên mọi chốt sẵn có (`order_payments_guard` khoá dòng đơn #241,
-- `order_payments_emit_cash_entry` sinh phiếu quỹ, `order_payments_emit_event`
-- phát `payment.received`) tự chạy y như thu tay. KHÔNG mở đường ghi thứ hai.
--
-- ── BỐN CA HỎNG, mỗi ca một lối ra ─────────────────────────────────────────
--  ① CHỮ KÝ SAI/THIẾU → từ chối, KHÔNG ghi gì. Hai cổng, thiếu cái nào cũng
--     chặn: khoá nền tảng `sepay_ingest_key` + khoá RIÊNG CỦA TIỆM trong kho
--     bí mật. KHÔNG có nhánh "chưa cấu hình thì cho qua" — đó đúng là lỗ đã
--     dính ở webhook Zalo (việc #10/#31, docs/SU-THAT-SAN-PHAM.md) và không
--     được phép tái sinh ở ĐƯỜNG TIỀN.
--  ② BẮN TRÙNG (SePay gọi lại tối đa 7 lần trong 5 giờ) → chống hai lớp:
--     `bank_transactions_idem (tenant_id, provider, provider_tx_id)` chặn ở sổ
--     nhận, và `order_payments_idem (provider, provider_ref)` chặn ở sổ tiền.
--     Lớp hai là lưới cuối: kể cả lớp một bị vòng qua, tiền vẫn không ghi hai lần.
--  ③ KHÔNG KHỚP ĐƠN NÀO (khách gõ sai nội dung, hoặc chuyển khoản không phải
--     tiền hàng) → GHI VÀO SỔ NHẬN kèm lý do đọc được, VÀ báo thẳng cho chủ
--     tiệm + quản trị viên. Tuyệt đối không nuốt im lặng: tiền đã vào tài khoản
--     thật rồi, im lặng ở đây nghĩa là tiền của khách biến mất khỏi hệ thống.
--  ④ LỆCH TIỀN → phân biệt rõ ba kiểu, không gộp làm một:
--     · ít hơn số còn phải thu  ⇒ GHI trả góp phần (`partial`), đơn còn nợ.
--     · đúng bằng               ⇒ GHI đủ (`matched`).
--     · NHIỀU hơn               ⇒ KHÔNG ghi (`amount_over`) + báo người. Ghi
--       bừa là `order_payments_guard` ném lỗi, mà ghi số ÍT hơn thực nhận là
--       tự sửa chứng từ — cả hai đều sai. Người phải quyết (hoàn lại? đơn
--       khác?), máy chỉ được nói ra.
--
-- ── VÌ SAO `provider_ref` KHÔNG PHẢI chỉ mỗi mã giao dịch SePay ─────────────
-- `order_payments_idem` là chỉ mục TOÀN CỤC trên (provider, provider_ref) —
-- không có tenant_id trong đó. Mã giao dịch SePay chạy theo TỪNG TÀI KHOẢN
-- SePay, nên hai tiệm hoàn toàn có thể cùng nhận giao dịch mang số 1. Lấy
-- thẳng con số đó làm `provider_ref` thì tiệm thứ hai bị chỉ mục chặn — TIỀN
-- THẬT của họ rơi mất trong im lặng. Vì vậy khoá là `<mã tiệm>:<mã giao dịch>`:
-- vẫn đúng một dòng cho mỗi giao dịch, và không tiệm nào chặn tiệm nào.
--
-- ── PHẠM VI ────────────────────────────────────────────────────────────────
-- Đây là chiều KHÁCH → TIỆM (thẻ design man-nhan-thanh-toan.html). KHÁC hẳn
-- chiều TIỆM → iFAN (man-thanh-toan.html, `subscription_payments` #27) — chiều
-- đó vẫn founder ghi nhận tay, migration này không đụng tới.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Khoá nền tảng cho cổng nhận ─────────────────────────────────────────
-- Khuôn `zalo_ingest_key` (#5) / `bot_ingest_key` (#53): khoá SINH TRONG CSDL,
-- không nằm trong kho mã. Khoá RIÊNG cho đường tiền — lộ khoá chat không được
-- phép mở luôn cửa ghi tiền.
--   select value from private.app_config where key = 'sepay_ingest_key';
insert into private.app_config (key, value)
  values ('sepay_ingest_key', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

-- ── 2. Sổ nhận: MỌI giao dịch SePay bắn về, khớp hay không khớp ─────────────
-- Bảng này tồn tại vì ca ③. Không có nó thì "không khớp đơn nào" = ném đi, và
-- chủ tiệm không bao giờ biết có tiền về mà hệ thống không hiểu. Ghi cả giao
-- dịch ĐI RA nữa: sổ đối chiếu mà khuyết một chiều thì không đối chiếu được.
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'sepay' check (provider ~ '^[a-z_]{2,20}$'),
  -- Mã giao dịch bên SePay — chìa khoá chống bắn trùng.
  provider_tx_id text not null,
  -- Mã tham chiếu của NGÂN HÀNG (vd FT24012345678) — thứ chủ tiệm tra được
  -- trong app ngân hàng khi phải đối chiếu tay.
  reference_code text,
  gateway text,
  transfer_type text not null check (transfer_type in ('in', 'out', 'unknown')),
  amount_vnd bigint not null check (amount_vnd >= 0),
  content text,
  transaction_date timestamptz not null,
  -- Mã đơn bóc ra từ nội dung chuyển khoản (8 ký tự đầu mã đơn). NULL = nội
  -- dung không có mã nào đọc được.
  order_code text,
  order_id uuid references public.orders(id) on delete set null,
  order_payment_id uuid references public.order_payments(id) on delete set null,
  -- KẾT QUẢ KHỚP — mỗi giá trị một câu giải thích riêng trên màn Cài đặt. Gộp
  -- thành "không khớp" là lấy mất thứ duy nhất giúp chủ tiệm biết phải sửa gì.
  match_status text not null check (match_status in (
    'matched',          -- khớp đơn, thu đủ phần còn lại
    'partial',          -- khớp đơn, thu được một phần (đơn vẫn còn nợ)
    'no_code',          -- nội dung chuyển khoản không có mã đơn
    'order_not_found',  -- có mã nhưng không đơn nào của tiệm mang mã đó
    'ambiguous',        -- mã trùng nhiều đơn — máy KHÔNG được đoán
    'order_cancelled',  -- đơn đã huỷ
    'already_paid',     -- đơn đã thu đủ từ trước
    'amount_over',      -- tiền về NHIỀU hơn số còn phải thu
    'no_amount',        -- thân tin không đọc ra số tiền — dữ liệu hỏng, không phải tiền
    'duplicate_payment',-- sổ tiền đã có đúng giao dịch này (lưới cuối)
    'ignored_out'       -- không phải tiền VÀO — ghi để sổ đủ, không xử lý
  )),
  -- Nguyên văn SePay gửi. Giữ lại vì lúc phải đối chiếu tay thì thứ duy nhất
  -- đáng tin là bản gốc, không phải bản đã diễn giải.
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
alter table public.bank_transactions enable row level security;

-- Chống bắn trùng LỚP MỘT. Có tenant_id vì mã giao dịch SePay chỉ duy nhất
-- trong phạm vi một tài khoản SePay (xem đầu file).
create unique index bank_transactions_idem
  on public.bank_transactions (tenant_id, provider, provider_tx_id);
create index bank_transactions_tenant_idx
  on public.bank_transactions (tenant_id, received_at desc);

-- ĐÚNG nhóm nối/ngắt SePay và nhận thông báo tiền lạ: owner/admin. Cố ý KHÔNG
-- mở cho manager dù họ đọc được `cash_entries` — sổ này là sổ CHẨN ĐOÁN của
-- một kết nối, và mở một quyền mà không màn nào dùng tới là để lại quyền chết.
-- Khoản thu KHỚP được thì đã nằm sẵn trong sổ quỹ, manager vẫn thấy đủ.
-- KHÔNG policy ghi nào: sổ này chỉ hàm security definer dưới đây ghi, và ghi
-- xong là BẤT BIẾN (cùng luật với order_payments).
create policy bank_transactions_select on public.bank_transactions for select
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin'));
revoke all on public.bank_transactions from anon;

comment on table public.bank_transactions is
  'So nhan giao dich ngan hang qua SePay (#243). BAT BIEN — chi ham sepay_ingest_transaction ghi. Giu CA dong khong khop don: tien da vao tai khoan that, nuot im lang la mat tien cua khach.';

-- Tra mã đơn 8 ký tự → đơn. Không có chỉ mục này thì mỗi giao dịch quét cả
-- bảng orders; tiệm chạy vài năm là mỗi lần khách chuyển khoản lại quét vài
-- chục nghìn dòng.
create index orders_ma_ngan_idx
  on public.orders (tenant_id, left(replace(id::text, '-', ''), 8));

-- ── 3. Nối / ngắt / xem trạng thái ─────────────────────────────────────────

/**
 * Nối SePay cho tiệm đang mở: cất KHOÁ WEBHOOK vào kho bí mật (vault).
 *
 * Khoá KHÔNG chạm bảng nào — cùng luật với token bot Telegram (#97). Bảng bị
 * đọc nhầm một lần là khoá lộ vĩnh viễn, mà khoá này mở đúng cửa GHI TIỀN.
 *
 * Độ dài tối thiểu 24 ký tự: cổng nhận là địa chỉ công khai trên internet, nên
 * khoá ngắn là khoá dò được. Màn Cài đặt có nút tự sinh khoá 32 ký tự ngẫu
 * nhiên để chủ tiệm không phải tự nghĩ.
 */
create or replace function public.sepay_connect(p_api_key text)
returns void
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;

  -- Vai đọc từ BẢNG THÀNH VIÊN, không đọc từ claim: claim còn sống ~1 giờ sau
  -- khi người bị gỡ khỏi tiệm (bài học đã ghi ở app/app/settings/payments/actions.ts).
  select m.role into v_role from public.tenant_members m
   where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active';
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  if p_api_key is null or length(btrim(p_api_key)) < 24 or length(btrim(p_api_key)) > 200 then
    raise exception 'invalid_key_format';
  end if;

  perform private.set_channel_secret('sepay:' || v_tenant || ':apikey', btrim(p_api_key));
end $$;
revoke all on function public.sepay_connect(text) from public, anon;
grant execute on function public.sepay_connect(text) to authenticated;

/**
 * Ngắt SePay: XOÁ HẲN khoá khỏi kho bí mật.
 *
 * Xoá chứ không đánh dấu: khoá còn nằm lại là cổng nhận vẫn ghi tiền được vào
 * đơn của tiệm. "Ngắt" mà bí mật vẫn sống thì không phải ngắt (#97).
 * KHÔNG xoá sổ `bank_transactions` — đó là chứng từ, ngắt kết nối là thôi nhận
 * giao dịch mới chứ không phải xoá lịch sử tiền.
 */
create or replace function public.sepay_disconnect()
returns void
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  select m.role into v_role from public.tenant_members m
   where m.tenant_id = v_tenant and m.user_id = auth.uid() and m.status = 'active';
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  delete from vault.secrets where name = 'sepay:' || v_tenant || ':apikey';
end $$;
revoke all on function public.sepay_disconnect() from public, anon;
grant execute on function public.sepay_disconnect() to authenticated;

/**
 * "Đã nối hay chưa" cho màn Cài đặt. Trả ĐÚNG một boolean — tuyệt đối không
 * trả khoá ra ngoài, kể cả cho chủ tiệm: khoá đã dán vào SePay rồi thì không
 * ai cần đọc lại, mà mỗi đường đọc thêm là một đường rò.
 */
create or replace function public.sepay_status()
returns boolean
language plpgsql
stable
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then return false; end if;
  return exists (
    select 1 from vault.secrets where name = 'sepay:' || v_tenant || ':apikey'
  );
end $$;
revoke all on function public.sepay_status() from public, anon;
grant execute on function public.sepay_status() to authenticated;

-- ── 4. Cổng nhận giao dịch ─────────────────────────────────────────────────

/**
 * Nhận MỘT giao dịch SePay: kiểm khoá → bóc mã đơn → ghi tiền → ghi sổ nhận.
 *
 * Toàn bộ nằm trong MỘT giao dịch CSDL: hoặc cả khoản thu lẫn dòng sổ cùng
 * vào, hoặc không gì vào cả. Tách ra hai nhịp là mở đúng cái khe "đã trừ tiền
 * mà sổ không ghi".
 *
 * Trả về `{status, order_id, payment_id}` — tầng web KHÔNG diễn giải lại, chỉ
 * chuyển tiếp. Mọi quyết định nghiệp vụ ở đây, một chỗ.
 */
create or replace function public.sepay_ingest_transaction(
  p_key text,
  p_tenant uuid,
  p_api_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, pg_temp as $$
declare
  v_want text;
  v_tx_id text;
  v_type text;
  v_amount bigint;
  v_content text;
  v_when timestamptz;
  v_code text;
  v_ids uuid[];
  v_order uuid;
  v_ostatus text;
  v_total bigint;
  v_paid bigint;
  v_remaining bigint;
  v_status text;
  v_payment uuid;
begin
  -- ── CỔNG 1: khoá nền tảng ────────────────────────────────────────────────
  if p_key is null
     or (select value from private.app_config where key = 'sepay_ingest_key')
        is distinct from p_key then
    raise exception 'invalid_key';
  end if;

  -- ── CỔNG 2: khoá RIÊNG CỦA TIỆM ──────────────────────────────────────────
  -- Chưa nối ⇒ v_want là NULL ⇒ TỪ CHỐI. Đây chính là chỗ webhook Zalo từng
  -- sai: "chưa cấu hình" phải là ĐÓNG, không bao giờ là mở.
  select decrypted_secret into v_want from vault.decrypted_secrets
   where name = 'sepay:' || p_tenant || ':apikey' limit 1;
  if v_want is null or p_api_key is null or v_want <> p_api_key then
    raise exception 'unauthorized';
  end if;

  -- ── Bóc dữ liệu, KHÔNG để ép kiểu làm vỡ cả lượt ────────────────────────
  -- Thân tin lạ mà ném lỗi thì SePay gọi lại 7 lần rồi bỏ, và giao dịch mất
  -- hẳn. Nên mọi phép đọc dưới đây đều có đường lùi.
  v_tx_id := coalesce(
    nullif(btrim(p_payload ->> 'id'), ''),
    -- Không có mã giao dịch thì băm nguyên thân tin: vẫn chống trùng được,
    -- và giao dịch vẫn vào sổ thay vì rơi mất.
    'h_' || md5(p_payload::text)
  );

  if exists (
    select 1 from public.bank_transactions
     where tenant_id = p_tenant and provider = 'sepay' and provider_tx_id = v_tx_id
  ) then
    return jsonb_build_object('status', 'duplicate', 'order_id', null, 'payment_id', null);
  end if;

  v_type := lower(btrim(coalesce(p_payload ->> 'transferType', '')));
  -- Chỉ lấy phần chữ số đầu chuỗi: không bao giờ ném, và VNĐ không có phần lẻ.
  v_amount := coalesce(
    (substring(coalesce(p_payload ->> 'transferAmount', '') from '^[0-9]+'))::bigint, 0);
  v_content := nullif(btrim(coalesce(p_payload ->> 'content', '')), '');

  -- SePay ghi giờ theo ĐỒNG HỒ VIỆT NAM và không kèm múi giờ. Đọc thẳng là
  -- lệch 7 tiếng — đúng lớp lỗi migration #213 đã dập ở chỗ khác.
  begin
    v_when := (nullif(btrim(p_payload ->> 'transactionDate'), ''))::timestamp
              at time zone 'Asia/Ho_Chi_Minh';
  exception when others then
    v_when := null;
  end;
  v_when := coalesce(v_when, now());

  -- ── Khớp đơn ────────────────────────────────────────────────────────────
  if v_type <> 'in' then
    v_status := 'ignored_out';
  else
    -- Mã QR của kho in nội dung `DH` + 8 ký tự đầu mã đơn (order-detail-view.tsx).
    -- `\m`/`\M` là RÀNG BUỘC ĐẦU/CUỐI TỪ, không phải ký tự — nhờ đó mã phải
    -- đứng riêng thành một từ. Thiếu ràng buộc này thì một chuỗi dài bất kỳ
    -- trong nội dung ngân hàng cũng có thể chứa 8 ký tự trông như mã đơn, và
    -- tiền của khách chạy vào đơn của người khác.
    v_code := substring(upper(coalesce(v_content, '')) from '\mDH([0-9A-F]{8})\M');
    if v_code is null then
      v_status := 'no_code';
    else
      select array_agg(o.id) into v_ids
        from (
          select o.id from public.orders o
           where o.tenant_id = p_tenant
             and o.deleted_at is null
             and left(replace(o.id::text, '-', ''), 8) = lower(v_code)
           limit 2
        ) o;

      if v_ids is null or array_length(v_ids, 1) = 0 then
        v_status := 'order_not_found';
      elsif array_length(v_ids, 1) > 1 then
        -- Máy KHÔNG được chọn hộ khi có hai đơn cùng mã ngắn. Đoán sai là ghi
        -- tiền vào đơn của người khác.
        v_status := 'ambiguous';
      else
        v_order := v_ids[1];
        select o.status into v_ostatus from public.orders o where o.id = v_order;

        select coalesce(sum(l.line_total_vnd), 0) into v_total
          from public.order_lines l where l.order_id = v_order;
        select coalesce(sum(p.amount_vnd), 0) into v_paid
          from public.order_payments p where p.order_id = v_order;
        v_remaining := v_total - v_paid;

        if v_ostatus = 'cancelled' then
          v_status := 'order_cancelled';
        elsif v_amount <= 0 then
          v_status := 'no_amount';
        elsif v_remaining <= 0 then
          v_status := 'already_paid';
        elsif v_amount > v_remaining then
          v_status := 'amount_over';
        else
          begin
            insert into public.order_payments
                (tenant_id, order_id, method, amount_vnd, provider, provider_ref, received_at)
              values
                (p_tenant, v_order, 'bank_transfer', v_amount, 'sepay',
                 p_tenant::text || ':' || v_tx_id, v_when)
              returning id into v_payment;
            v_status := case when v_amount = v_remaining then 'matched' else 'partial' end;
          exception
            -- LƯỚI CUỐI chống bắn trùng: sổ tiền đã có đúng giao dịch này.
            when unique_violation then
              v_payment := null;
              v_status := 'duplicate_payment';
            -- `order_payments_guard` (#241) khoá dòng đơn rồi mới đếm, nên nó
            -- thấy được khoản mà lượt kiểm ở trên chưa thấy (hai máy thu cùng
            -- lúc). Nhận lại đúng lý do của nó, không nuốt thành "lỗi chung".
            when check_violation then
              v_payment := null;
              v_status := case
                when sqlerrm like 'order_cancelled%' then 'order_cancelled'
                else 'amount_over'
              end;
          end;
        end if;
      end if;
    end if;
  end if;

  insert into public.bank_transactions
      (tenant_id, provider, provider_tx_id, reference_code, gateway, transfer_type,
       amount_vnd, content, transaction_date, order_code, order_id, order_payment_id,
       match_status, raw)
    values
      (p_tenant, 'sepay', v_tx_id,
       nullif(btrim(coalesce(p_payload ->> 'referenceCode', '')), ''),
       nullif(btrim(coalesce(p_payload ->> 'gateway', '')), ''),
       case when v_type = 'in' then 'in' when v_type = 'out' then 'out' else 'unknown' end,
       v_amount, v_content, v_when,
       case when v_code is null then null else 'DH' || v_code end,
       v_order, v_payment, v_status, coalesce(p_payload, '{}'::jsonb));

  -- ── Tiền VÀO mà KHÔNG ghi được vào đơn nào ⇒ phải có người biết ─────────
  -- Ghi vào sổ thôi là chưa đủ: sổ nằm trong Cài đặt, không ai mở hằng ngày.
  -- Tiền đã nằm trong tài khoản thật rồi — im lặng ở đây là khách trả tiền
  -- xong mà đơn vẫn treo, và không ai trong tiệm biết vì sao.
  if v_status in ('no_code', 'order_not_found', 'ambiguous',
                  'order_cancelled', 'already_paid', 'amount_over') then
    insert into public.notifications
        (tenant_id, user_id, type, title, title_key, body_key, params, link)
      select p_tenant, m.user_id, 'payment',
             'Có tiền về nhưng chưa ghi được vào đơn nào',
             'sepay.unmatched.title', 'sepay.unmatched.body',
             jsonb_build_object('amount', v_amount, 'content', coalesce(v_content, '')),
             '/app/settings/payments'
        from public.tenant_members m
       where m.tenant_id = p_tenant and m.status = 'active'
         and m.role in ('owner', 'admin');
  end if;

  return jsonb_build_object('status', v_status, 'order_id', v_order, 'payment_id', v_payment);
end $$;

-- `anon` gọi được là ĐÚNG THIẾT KẾ (cổng webhook không có phiên đăng nhập) —
-- và hợp luật A của scripts/soat-cua-cong-khai.mjs vì hàm đòi khoá riêng
-- (`p_key`) NGAY câu lệnh đầu, trước khi chạm bất cứ bảng nào.
revoke all on function public.sepay_ingest_transaction(text, uuid, text, jsonb) from public;
grant execute on function public.sepay_ingest_transaction(text, uuid, text, jsonb)
  to anon, authenticated;

comment on function public.sepay_ingest_transaction(text, uuid, text, jsonb) is
  'Cong nhan giao dich SePay (#243): hai khoa (nen tang + rieng tiem) → boc ma don trong noi dung chuyen khoan → ghi order_payments qua DUNG cua thu tien san co → ghi so bank_transactions. Khong khop thi ghi ly do + bao chu tiem, khong bao gio nuot im lang.';
