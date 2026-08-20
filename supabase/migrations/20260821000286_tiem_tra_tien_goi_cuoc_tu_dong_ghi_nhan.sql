-- #286 — CHIỀU TIỀN CÒN LẠI: tiệm trả tiền thuê phần mềm, máy tự ghi nhận.
--
-- ════════════════════════════════════════════════════════════════════
-- ĐÂY LÀ MỘT LỖ "DỰNG RỒI BỎ", KHÔNG PHẢI TÍNH NĂNG MỚI
-- ════════════════════════════════════════════════════════════════════
--
-- Toàn bộ đường tiền đã có sẵn và chạy đúng từ lâu:
--   · `change_plan()` tạo **hoá đơn chờ thanh toán** và KHÔNG đổi gói cho tới
--     khi tiền được ghi nhận — đúng nếp, không hứa trước;
--   · `record_subscription_payment()` nhận một khoản, đánh dấu hoá đơn đã trả,
--     gọi `billing_apply_invoice()` để đổi gói thật, rồi báo cho tiệm. Nó đã
--     **chống ghi hai lần** (hoá đơn đã trả thì trả về `already_paid`) và
--     **chặn trả thiếu** (`underpaid`);
--   · màn quản trị nền tảng đã đọc `admin_open_invoices()` để xem ai còn nợ.
--
-- Thiếu đúng MỘT thứ: **không cửa nào gọi `record_subscription_payment`**.
-- Chính mã nguồn tự khai điều đó — "gói chưa đổi cho tới khi khoản tiền được
-- ghi nhận (chưa nối cổng)". Nghĩa là hôm nay tiệm bấm nâng gói xong sẽ nhận
-- một hoá đơn treo vĩnh viễn, và người của iFan phải vào tận cơ sở dữ liệu gọi
-- hàm bằng tay. Không mở bán được như vậy.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO LÀ MỘT ĐƯỜNG RIÊNG, KHÔNG DÙNG LẠI CỬA CỦA TIỆM (#243)
-- ════════════════════════════════════════════════════════════════════
--
-- Hai chiều tiền này giống nhau về kỹ thuật nhưng **khác nhau về mọi thứ còn
-- lại**:
--
--                    khách trả TIỆM (#243)        tiệm trả iFAN (bản này)
--   tiền vào          tài khoản của tiệm           tài khoản của iFan
--   khoá kiểm         khoá RIÊNG của từng tiệm     MỘT khoá của nền tảng
--   đối chiếu bằng    mã đơn hàng                  số hoá đơn
--   ai được đọc sổ    tiệm đó                      chỉ quản trị nền tảng
--
-- Nhét chung một bảng nghĩa là **tiệm nhìn thấy giao dịch của nền tảng** — và
-- ngược lại, một lỗi ở cửa của tiệm có thể ghi khống vào doanh thu của iFan.
-- Nên: bảng riêng, khoá riêng, cửa riêng.
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN ĐIỂM CHỐT
-- ════════════════════════════════════════════════════════════════════
--
-- (1) KHÔNG CÓ NHÁNH "CHƯA CẤU HÌNH THÌ CHO QUA". Thiếu khoá ⇒ từ chối. Kho
--     này đã dính đúng lỗ đó ở cửa Zalo (việc #10/#31): điều kiện bám vào MÔI
--     TRƯỜNG thay vì bám vào SỰ CÓ MẶT CỦA BÍ MẬT, nên bản thử công khai thành
--     cửa ghi dữ liệu giả. Ở đường tiền thì cùng lỗ ấy là **nâng gói khống**.
--
-- (2) GHI SỔ MỌI TIN NHẬN ĐƯỢC, kể cả tin không khớp hoá đơn nào. Tin lạ mà
--     lặng lẽ bỏ đi thì lúc tiệm gọi lên nói "tôi chuyển rồi" sẽ không có gì mở
--     ra đối chiếu. Đây đúng là luật "biên nhận webhook" đã chốt ở việc #52.
--
-- (3) CHỈ TIỀN VÀO. Tin báo tiền ra khỏi tài khoản iFan không bao giờ được
--     hiểu là ai đó vừa trả tiền — ghi sổ rồi đánh dấu bỏ qua.
--
-- (4) TRẢ THIẾU THÌ KHÔNG NÂNG GÓI, và **nói ra** thay vì im lặng. Hàm ghi
--     nhận đã trả về `underpaid`; ở đây chỉ việc lưu đúng trạng thái đó vào sổ
--     để quản trị nhìn thấy và gọi lại cho tiệm.
--
-- Số hoá đơn có dạng `IF-2026-000123`. Người chuyển khoản gõ tay thường bỏ dấu
-- gạch, viết thường, hoặc kèm chữ khác — nên phép bóc dưới đây chấp nhận cả
-- `IF2026000123` lẫn `if-2026-000123` nằm lẫn giữa câu.

-- ── Sổ giao dịch của tài khoản NỀN TẢNG (không thuộc tiệm nào) ──────────────
create table if not exists public.platform_bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null default 'sepay',
  provider_tx_id   text not null,
  gateway          text,
  transfer_type    text not null,
  amount_vnd       bigint not null,
  content          text,
  transaction_date timestamptz not null,
  invoice_number   text,
  invoice_id       uuid references public.subscription_invoices(id) on delete set null,
  match_status     text not null,
  raw              jsonb not null,
  received_at      timestamptz not null default now()
);

create unique index if not exists platform_bank_tx_khong_trung
  on public.platform_bank_transactions (provider, provider_tx_id);
create index if not exists platform_bank_tx_moi_nhat
  on public.platform_bank_transactions (received_at desc);

-- Sổ này KHÔNG thuộc tiệm nào nên không có luật theo tiệm để viết. Khoá hẳn
-- với mọi vai ứng dụng: chỉ quản trị nền tảng đọc, và đọc qua hàm riêng.
alter table public.platform_bank_transactions enable row level security;
revoke all on table public.platform_bank_transactions from anon, authenticated;

comment on table public.platform_bank_transactions is
  'Biến động số dư tài khoản NỀN TẢNG (tiệm trả tiền thuê phần mềm cho iFan). '
  'Khác public.bank_transactions — bảng đó là tài khoản của từng tiệm. Xem #286.';

-- ── Cửa nhận tin ───────────────────────────────────────────────────────────
create or replace function public.platform_sepay_ingest(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, pg_temp
as $$
declare
  v_want    text;
  v_tx_id   text;
  v_type    text;
  v_amount  bigint;
  v_content text;
  v_when    timestamptz;
  v_so      text;
  v_inv     record;
  v_kq      jsonb;
  v_trang   text;
begin
  -- CHỐT (1): thiếu khoá là ĐÓNG, không bao giờ là mở.
  select value into v_want from private.app_config where key = 'sepay_platform_ingest_key';
  if v_want is null or p_key is null or v_want <> p_key then
    raise exception 'invalid_key';
  end if;

  -- Bóc dữ liệu có đường lùi: thân tin lạ mà ném lỗi thì bên gửi thử lại vài
  -- lần rồi bỏ hẳn, và giao dịch mất luôn.
  v_tx_id := coalesce(nullif(btrim(p_payload ->> 'id'), ''), 'h_' || md5(p_payload::text));

  if exists (select 1 from public.platform_bank_transactions
              where provider = 'sepay' and provider_tx_id = v_tx_id) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  v_type    := lower(btrim(coalesce(p_payload ->> 'transferType', '')));
  v_amount  := floor(coalesce((p_payload ->> 'transferAmount')::numeric, 0))::bigint;
  v_content := coalesce(p_payload ->> 'content', '');
  v_when    := coalesce((p_payload ->> 'transactionDate')::timestamptz, now());

  -- CHỐT (3): chỉ tiền VÀO mới có nghĩa là ai đó vừa trả.
  if v_type <> 'in' then
    insert into public.platform_bank_transactions
      (provider_tx_id, gateway, transfer_type, amount_vnd, content, transaction_date,
       match_status, raw)
    values (v_tx_id, p_payload ->> 'gateway', coalesce(nullif(v_type, ''), 'unknown'),
            v_amount, v_content, v_when, 'ignored_outgoing', p_payload);
    return jsonb_build_object('status', 'ignored_outgoing');
  end if;

  -- Bóc số hoá đơn: chấp nhận có/không dấu gạch, chữ hoa hay thường, nằm lẫn
  -- giữa câu. Chuẩn hoá về đúng dạng `IF-YYYY-NNNNNN` để tra.
  v_so := (regexp_match(upper(replace(v_content, '-', '')), 'IF([0-9]{4})([0-9]{6})'))[1];
  if v_so is not null then
    v_so := 'IF-' || v_so || '-' ||
            (regexp_match(upper(replace(v_content, '-', '')), 'IF([0-9]{4})([0-9]{6})'))[2];
  end if;

  if v_so is null then
    -- CHỐT (2): tin không khớp vẫn VÀO SỔ. Không có dòng này thì lúc tiệm gọi
    -- lên nói "tôi chuyển rồi" sẽ không có gì để mở ra đối chiếu.
    insert into public.platform_bank_transactions
      (provider_tx_id, gateway, transfer_type, amount_vnd, content, transaction_date,
       match_status, raw)
    values (v_tx_id, p_payload ->> 'gateway', 'in', v_amount, v_content, v_when,
            'no_invoice_code', p_payload);
    return jsonb_build_object('status', 'no_invoice_code');
  end if;

  select id, tenant_id, status into v_inv
    from public.subscription_invoices where number = v_so limit 1;

  if v_inv.id is null then
    insert into public.platform_bank_transactions
      (provider_tx_id, gateway, transfer_type, amount_vnd, content, transaction_date,
       invoice_number, match_status, raw)
    values (v_tx_id, p_payload ->> 'gateway', 'in', v_amount, v_content, v_when,
            v_so, 'invoice_not_found', p_payload);
    return jsonb_build_object('status', 'invoice_not_found', 'invoice', v_so);
  end if;

  -- Đường tiền THẬT đi qua đúng một hàm đã có (#27): nó tự đánh dấu hoá đơn,
  -- tự áp gói, tự báo cho tiệm, và tự chặn ghi hai lần. Ở đây KHÔNG được tự
  -- cập nhật hoá đơn — làm thế là dựng đường thứ hai cho cùng một chuyện.
  v_kq := public.record_subscription_payment(v_so, 'sepay', v_tx_id, v_amount);

  v_trang := case
    when (v_kq ->> 'applied')::boolean then 'applied'
    when coalesce((v_kq ->> 'underpaid')::boolean, false) then 'underpaid'
    when coalesce((v_kq ->> 'already_paid')::boolean, false) then 'already_paid'
    else 'unknown'
  end;

  insert into public.platform_bank_transactions
    (provider_tx_id, gateway, transfer_type, amount_vnd, content, transaction_date,
     invoice_number, invoice_id, match_status, raw)
  values (v_tx_id, p_payload ->> 'gateway', 'in', v_amount, v_content, v_when,
          v_so, v_inv.id, v_trang, p_payload);

  return jsonb_build_object('status', v_trang, 'invoice', v_so, 'ket_qua', v_kq);
end;
$$;

revoke all on function public.platform_sepay_ingest(text, jsonb) from public, anon, authenticated;
grant execute on function public.platform_sepay_ingest(text, jsonb) to service_role;

comment on function public.platform_sepay_ingest(text, jsonb) is
  'Nhận biến động số dư tài khoản NỀN TẢNG, đối chiếu bằng SỐ HOÁ ĐƠN rồi gọi '
  'record_subscription_payment. Ghi sổ mọi tin, kể cả tin không khớp — #286.';

-- ── Quản trị nền tảng đọc sổ ───────────────────────────────────────────────
create or replace function public.admin_platform_transactions(p_limit integer default 50)
returns setof public.platform_bank_transactions
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select * from public.platform_bank_transactions
   where public.is_platform_admin()
   order by received_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

revoke all on function public.admin_platform_transactions(integer) from public, anon;
grant execute on function public.admin_platform_transactions(integer) to authenticated;

comment on function public.admin_platform_transactions(integer) is
  'Sổ tiền vào của nền tảng, chỉ quản trị nền tảng đọc được. Không phải quản '
  'trị thì trả 0 dòng — im lặng đúng chỗ, vì đây không phải lỗi của người gọi.';
