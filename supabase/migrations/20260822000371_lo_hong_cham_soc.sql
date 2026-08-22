-- ════════════════════════════════════════════════════════════════════
-- #371 — ĐO LỖ HỔNG CHĂM SÓC: ai vừa đến rồi bị bỏ quên
-- ════════════════════════════════════════════════════════════════════
--
-- Thẻ thiết kế: `man-lo-hong-cham-soc`. Màn: `/app/reports/cham-soc`.
--
-- #368 đã nối được nửa CƠ CHẾ (quy trình 3-5-7 chạy được sau buổi hẹn / đơn
-- hàng). Nửa còn thiếu là phép ĐO: không có chỗ nào trả lời "ai bị bỏ sót".
--
-- ⚠️ ĐO BẰNG KẾT QUẢ, KHÔNG BẰNG CƠ CHẾ — thẻ chốt như vậy, và lý do đo được:
--   bảng `activities` KHÔNG có cột nào ghi việc đó do quy trình nào tạo (đã tra
--   cột: id, tenant_id, type, subject, body, contact_id, deal_id, owner_id,
--   due_at, done_at, outcome, created_at, updated_at, project_id, started_at).
--   Nên định nghĩa "khách có việc chăm sinh ra từ quy trình" là thứ KHÔNG truy
--   ngược được. Định nghĩa theo kết quả — "khách có được liên hệ không" — đo
--   được, và còn đúng cả với tiệm chưa bật quy trình tự động nào.
--
-- ĐỊNH NGHĨA CHỐT (viết ra đây vì đây là chỗ dễ sai nhất của cả màn):
--
--   LƯỢT GẦN NHẤT (T) của một khách = mốc muộn nhất trong `p_ngay` ngày qua của
--     · buổi hẹn `status='done'` chưa xoá → lấy `end_at`
--     · đơn `kind='order'`, `status='completed'`, chưa xoá → lấy `created_at`
--     ⚠️ Bảng `orders` KHÔNG có cột `completed_at` (đã tra). Cả kho đang tính
--       doanh thu đơn hoàn tất theo `created_at` (#238, #239, #343) — dùng theo
--       cho khớp, chứ không tự bịa một mốc khác. `updated_at` KHÔNG dùng được:
--       nó nhảy theo mọi lần sửa đơn về sau.
--     ⚠️ `kind='return'` (phiếu trả hàng) KHÔNG tính là lượt mua.
--
--   LIÊN HỆ ĐƯỢC GHI NHẬN = mốc sớm nhất SAU T của bất kỳ thứ nào:
--     · `activities` của khách đó có `done_at > T` (việc đã làm xong)
--     · `activities` loại note/call/meeting tạo sau T
--     · tin nhắn trong hội thoại của khách đó (`messages.sent_at > T`)
--     · buổi hẹn MỚI của khách (`start_at > T`, chưa xoá, không phải huỷ)
--     · đơn MỚI của khách (`created_at > T`, chưa xoá)
--   Hai gạch cuối là luật "khách tự quay lại ⇒ ĐÓNG CHUỖI" của thẻ: mục đích
--   của chuỗi chăm là mời khách quay lại; khách tự quay lại là mục đích đã đạt.
--   Buổi hẹn bị HUỶ thì không đóng chuỗi — khách huỷ hẹn là khách càng cần gọi.
--
--   NHỊP 3-5-7 → chốt hạn ở mốc đầu tiên, ngày thứ 3, đếm theo NGÀY LỊCH giờ VN
--   (không phải 72 giờ tròn) để chữ "hôm nay" trên màn đúng nghĩa thường ngày:
--     · quá hạn        — chưa có liên hệ nào và T cách đây > 3 ngày
--     · đến hạn hôm nay— chưa có liên hệ nào và T cách đây đúng 3 ngày
--     · chưa tới hạn   — chưa có liên hệ nào và T cách đây < 3 ngày
--     · chăm đúng hạn  — liên hệ đầu tiên nằm trong 3 ngày kể từ T
--     · chăm trễ       — có liên hệ nhưng sau ngày thứ 3
--
-- ⚠️ VAI: chủ/quản trị/quản lý/người-xem thấy cả tiệm; `staff` chỉ thấy khách
--   MÌNH PHỤ TRÁCH (`contacts.owner_id`). Hàm khai `security definer` nên KHÔNG
--   có RLS đỡ hộ — phải tự chốt, đúng bài học #347 (ba hàm sổ tiền đi vòng qua
--   RLS và cho nhân viên xem số cả tiệm). Vì sao `viewer` xem cả tiệm: chính
--   sách `contacts_select` đã cho viewer đọc mọi khách của tiệm, nên hàm này
--   không mở thêm gì.
--
-- ⚠️ Hàm chạy quyền chủ sở hữu nên vượt được nhánh hẹp của `appointments_select`
--   (nhân viên chỉ thấy buổi mình làm) và `orders_select` (chỉ đơn mình tạo).
--   Đây là CÓ CHỦ Ý: thẻ chốt phạm vi của màn theo NGƯỜI PHỤ TRÁCH KHÁCH, không
--   theo người thực hiện buổi. Nhân viên thấy được "khách của tôi có đến hôm
--   nào" — đúng thứ họ cần để gọi, và không rộng hơn tệp khách họ vốn đọc được.

-- ── CHỈ MỤC: quét buổi hẹn XONG theo mốc KẾT THÚC ────────────────────
-- Chỉ mục sẵn có là `(tenant_id, start_at) where deleted_at is null`, nên lọc
-- theo `end_at` phải quét MỌI buổi hẹn của tiệm rồi loại bằng filter (đo trên
-- kho kiểm: 487 dòng quét để lấy 85). Tiệm mẫu ~10.000 buổi thì mỗi lần mở màn
-- là một lượt quét 10.000 dòng. Chỉ mục riêng cho đúng câu hỏi này.
create index if not exists appointments_lo_hong_cham_soc_idx
  on public.appointments (tenant_id, end_at desc)
  where status = 'done' and deleted_at is null;

-- Đơn hoàn tất đã có `orders_tenant_created_idx (tenant_id, created_at desc)
-- where deleted_at is null` — đúng cột cần, không thêm chỉ mục thứ hai.

create or replace function public.lo_hong_cham_soc(
  p_ngay integer default 30,
  p_loc text default 'qua_han',
  p_nguon text default 'tat_ca',
  p_gioi_han integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tiem uuid := public.current_tenant_id();
  v_vai text := public.app_role();
  v_ca_tiem boolean;
  v_toi uuid := auth.uid();
  v_ngay integer := least(greatest(coalesce(p_ngay, 30), 1), 365);
  v_gioi_han integer := least(greatest(coalesce(p_gioi_han, 100), 1), 200);
  v_loc text := coalesce(p_loc, 'qua_han');
  v_nguon text := coalesce(p_nguon, 'tat_ca');
  v_hom_nay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_tu timestamptz := now() - (v_ngay || ' days')::interval;
  v_ket jsonb;
begin
  if v_tiem is null or v_vai is null then
    return null;
  end if;
  v_ca_tiem := v_vai in ('owner', 'admin', 'manager', 'viewer');
  if v_loc not in ('qua_han', 'hom_nay', 'sap_toi', 'tat_ca') then v_loc := 'qua_han'; end if;
  if v_nguon not in ('tat_ca', 'buoi_hen', 'don_hang') then v_nguon := 'tat_ca'; end if;

  with moc as (
    -- Một dòng cho mỗi khách: lượt đến/mua MUỘN NHẤT trong kỳ, kèm nguồn của
    -- chính lượt đó (buổi hẹn hay đơn) để màn nói được "vì sao khách này ở đây".
    select distinct on (x.contact_id)
      x.contact_id, x.luc, x.loai, x.nhan, x.tien
    from (
      select ap.contact_id, ap.end_at as luc, 'buoi_hen'::text as loai,
             i.name as nhan, nullif(ap.price_vnd, 0) as tien
        from public.appointments ap
        left join public.items i on i.id = ap.item_id
       where ap.tenant_id = v_tiem and ap.status = 'done' and ap.deleted_at is null
         and ap.end_at >= v_tu and ap.end_at <= now()
      union all
      select o.contact_id, o.created_at, 'don_hang'::text, null::text,
             (select sum(coalesce(l.line_total_vnd,
                                  l.qty * l.unit_price_vnd - coalesce(l.discount_vnd, 0)))::bigint
                from public.order_lines l where l.order_id = o.id)
        from public.orders o
       where o.tenant_id = v_tiem and o.kind = 'order' and o.status = 'completed'
         and o.deleted_at is null
         and o.created_at >= v_tu and o.created_at <= now()
    ) x
    order by x.contact_id, x.luc desc
  ),
  kh as (
    select m.contact_id, m.luc, m.loai, m.nhan, m.tien,
           c.full_name, c.phone, c.owner_id, c.marketing_consent
      from moc m
      join public.contacts c on c.id = m.contact_id and c.tenant_id = v_tiem
     where c.deleted_at is null and c.merged_into_id is null
       and (v_ca_tiem or c.owner_id = v_toi)
  ),
  -- `materialized` là BẮT BUỘC, không phải cho đẹp: không có nó Postgres nội
  -- suy CTE vào từng biểu thức đếm bên dưới và nhân 5 truy vấn con này lên 25
  -- lần (đo được: 67.767 khối đệm → 5.400). Cùng một kết quả, khác một bậc chi phí.
  lh as materialized (
    select k.*,
      (v_hom_nay - (k.luc at time zone 'Asia/Ho_Chi_Minh')::date) as so_ngay,
      least(
        (select min(a.done_at) from public.activities a
          where a.contact_id = k.contact_id and a.tenant_id = v_tiem and a.done_at > k.luc),
        (select min(a.created_at) from public.activities a
          where a.contact_id = k.contact_id and a.tenant_id = v_tiem
            and a.type in ('note', 'call', 'meeting') and a.created_at > k.luc),
        (select min(ms.sent_at) from public.messages ms
           join public.conversations cv on cv.id = ms.conversation_id
          where cv.contact_id = k.contact_id and ms.tenant_id = v_tiem and ms.sent_at > k.luc),
        (select min(ap.start_at) from public.appointments ap
          where ap.contact_id = k.contact_id and ap.tenant_id = v_tiem
            and ap.deleted_at is null and ap.status <> 'cancelled' and ap.start_at > k.luc),
        (select min(o.created_at) from public.orders o
          where o.contact_id = k.contact_id and o.tenant_id = v_tiem
            and o.deleted_at is null and o.created_at > k.luc)
      ) as lan_lien_he
    from kh k
  ),
  xep as (
    select l.*,
      -- Ngày thứ mấy kể từ T thì được liên hệ (null = chưa ai liên hệ). Màn vẽ
      -- ba ô 3-5-7 từ đúng hai con số này, không cần thêm dữ liệu.
      case when l.lan_lien_he is null then null
           else greatest((l.lan_lien_he at time zone 'Asia/Ho_Chi_Minh')::date
                         - (l.luc at time zone 'Asia/Ho_Chi_Minh')::date, 0) end as ngay_lien_he,
      case
        when l.lan_lien_he is null and l.so_ngay > 3 then 'qua_han'
        when l.lan_lien_he is null and l.so_ngay = 3 then 'den_han'
        when l.lan_lien_he is null then 'chua_toi_han'
        when (l.lan_lien_he at time zone 'Asia/Ho_Chi_Minh')::date
             - (l.luc at time zone 'Asia/Ho_Chi_Minh')::date <= 3 then 'dung_han'
        else 'cham_tre'
      end as trang_thai
    from lh l
    -- Khách đã TẮT NHẬN TIN không nằm trong bất kỳ con số nào; số người bị ẩn
    -- đếm riêng ở dưới và màn phải nói ra. Ẩn im lặng thì tỉ lệ "đã chăm" đẹp
    -- lên một cách giả tạo — thẻ chốt đúng chuyện này.
    where l.marketing_consent <> 'withdrawn'
  ),
  dem as (
    select
      count(*)::int as tong,
      count(*) filter (where so_ngay >= 3)::int as da_toi_han,
      count(*) filter (where trang_thai = 'qua_han')::int as qua_han,
      count(*) filter (where trang_thai = 'den_han')::int as den_han,
      count(*) filter (where trang_thai = 'dung_han' and so_ngay >= 3)::int as dung_han,
      count(*) filter (where trang_thai in ('dung_han', 'cham_tre') and so_ngay >= 3)::int as da_cham
    from xep
  ),
  chon as (
    select x.* from xep x
     where (v_nguon = 'tat_ca' or x.loai = v_nguon)
       and (
         v_loc = 'tat_ca'
         or (v_loc = 'qua_han' and x.trang_thai = 'qua_han')
         or (v_loc = 'hom_nay' and x.trang_thai = 'den_han')
         or (v_loc = 'sap_toi' and x.trang_thai = 'chua_toi_han')
       )
     order by x.so_ngay desc, x.full_name asc
     limit v_gioi_han
  )
  select jsonb_build_object(
    'ngay', v_ngay,
    'loc', v_loc,
    'nguon', v_nguon,
    'ca_tiem', v_ca_tiem,
    -- Tiệm đã bật quy trình nào chạy SAU buổi hẹn / SAU đơn chưa. Hỏi theo
    -- `trigger_event` chứ không theo `key` của hai mẫu #368: tiệm tự dựng một
    -- quy trình khác trên cùng sự kiện thì vẫn là "đã bật".
    'bat_tu_dong', (
      select exists (
        select 1 from public.workflows w
         where w.tenant_id = v_tiem and w.is_active
           and w.trigger_event in ('appointment.done', 'order.completed'))),
    'an_tat_tin', (select count(*)::int from lh where marketing_consent = 'withdrawn'),
    'tong', (select tong from dem),
    'da_toi_han', (select da_toi_han from dem),
    'qua_han', (select qua_han from dem),
    'den_han', (select den_han from dem),
    'dung_han', (select dung_han from dem),
    'da_cham', (select da_cham from dem),
    'dong', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contact_id', s.contact_id,
        'ten', s.full_name,
        'dien_thoai', s.phone,
        'luc', s.luc,
        'loai', s.loai,
        'nhan', s.nhan,
        'tien', s.tien,
        'so_ngay', s.so_ngay,
        'ngay_lien_he', s.ngay_lien_he,
        'trang_thai', s.trang_thai,
        'nguoi_phu_trach', p.display_name
      ) order by s.so_ngay desc, s.full_name asc)
      from chon s
      left join public.profiles p on p.user_id = s.owner_id
    ), '[]'::jsonb)
  ) into v_ket;

  return v_ket;
end $$;

revoke all on function public.lo_hong_cham_soc(integer, text, text, integer) from public, anon;
grant execute on function public.lo_hong_cham_soc(integer, text, text, integer) to authenticated;

comment on function public.lo_hong_cham_soc(integer, text, text, integer) is
  'Lỗ hổng chăm sóc (#371): khách có lượt đến/mua trong p_ngay ngày qua mà từ đó tới nay chưa có liên hệ nào được ghi nhận. Chốt vai bên trong: staff chỉ thấy khách mình phụ trách.';
