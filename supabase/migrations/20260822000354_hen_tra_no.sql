-- ════════════════════════════════════════════════════════════════════
-- #354 — HẸN TRẢ NỢ (thẻ `man-hen-tra-no`)
-- ════════════════════════════════════════════════════════════════════
-- Màn Công nợ trả lời đúng một câu: ai đang nợ bao nhiêu. Đo trên tiệm demo:
-- 107 khách, 41,7 triệu. Nhưng nó KHÔNG NHỚ ĐƯỢC GÌ CẢ — chủ tiệm gọi chị Mai
-- hôm qua, chị hẹn thứ Năm trả, mai mở màn ra thì y như chưa từng gọi.
--
-- Hệ quả: gọi lại đúng người vừa gọi hôm qua, bỏ quên đúng người đã hẹn hôm
-- nay, và không ai biết khách nào hẹn rồi thất hẹn ba lần — trong khi đó chính
-- là thông tin quyết định còn nên bán chịu cho họ nữa hay không.

/**
 * Mỗi dòng là MỘT LẦN HẸN. Hẹn mới KHÔNG ghi đè hẹn cũ.
 *
 * ⚠️ GIỮ LẠI MỌI LẦN HẸN LÀ CẢ ĐIỂM MẤU CHỐT. Nhờ vậy mới đếm được "thất hẹn 2
 *   lần" — con số có sức nặng nhất trên màn Công nợ, vì nó trả lời câu *còn nên
 *   bán chịu cho người này không*. Cho `update` để sửa ngày là vứt đúng thứ
 *   đáng giữ; nên bảng này chỉ GHI THÊM.
 *
 * ⚠️ HẸN GẮN VỚI KHÁCH, KHÔNG GẮN VỚI TỪNG ĐƠN. Khách nợ 3 đơn thì họ hẹn trả
 *   TIỀN, không hẹn trả từng đơn một. Gắn theo đơn là bắt chủ tiệm nhập ba lần
 *   cho một cuộc gọi.
 */
create table if not exists public.hen_tra_no (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  ngay_hen    date not null,
  ghi_chu     text,
  tao_boi     uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint hen_tra_no_ghi_chu_check check (ghi_chu is null or char_length(ghi_chu) <= 300),
  -- Hẹn quá xa là gõ nhầm năm, không phải một cái hẹn thật.
  constraint hen_tra_no_ngay_hop_ly check (ngay_hen >= date '2020-01-01' and ngay_hen <= date '2100-01-01')
);

comment on table public.hen_tra_no is
  'Mỗi dòng là MỘT lần khách hẹn trả nợ. Chỉ ghi thêm, không sửa không xoá — lịch sử thất hẹn là thứ đáng giữ nhất (#354).';

create index if not exists hen_tra_no_tim
  on public.hen_tra_no (tenant_id, contact_id, ngay_hen desc);

alter table public.hen_tra_no enable row level security;

/**
 * ⚠️ CHỈ CHỦ · QUẢN TRỊ · QUẢN LÝ — đúng ba vai đang xem được màn Công nợ.
 *   Nhân viên thường không thấy màn đó, nên cũng không có lý do chạm vào đây.
 *   Chốt ở RLS chứ không chỉ ở giao diện: giao diện chặn thì gọi thẳng API vẫn
 *   ghi được.
 */
drop policy if exists hen_tra_no_select on public.hen_tra_no;
create policy hen_tra_no_select on public.hen_tra_no for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

drop policy if exists hen_tra_no_insert on public.hen_tra_no;
create policy hen_tra_no_insert on public.hen_tra_no for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- ⚠️ CỐ Ý KHÔNG CÓ policy cho UPDATE và DELETE. Không phải quên: bảng này chỉ
--   ghi thêm. Không có policy nghĩa là RLS từ chối, kể cả với chủ tiệm.

/**
 * Lần hẹn GẦN NHẤT của mỗi khách, kèm số lần đã thất hẹn.
 *
 * ⚠️ "THẤT HẸN" = ngày hẹn ĐÃ QUA mà khách vẫn còn nợ. Đếm theo NGÀY GIỜ VIỆT
 *   NAM: giờ quốc tế cắt ngày Việt Nam lúc 7 giờ sáng, nên một cái hẹn "hôm
 *   nay" sẽ bị tính thành quá hẹn ngay từ sáng sớm.
 *
 * ⚠️ HÀM NÀY KHÔNG BIẾT KHÁCH CÒN NỢ HAY KHÔNG — nó chỉ kể chuyện hẹn. Nơi gọi
 *   ghép nó với danh sách nợ; khách đã trả xong thì rời khỏi danh sách đó và
 *   cái hẹn cũng không hiện nữa. Cố ý KHÔNG xoá lịch sử hẹn khi khách trả tiền:
 *   "người này từng hẹn và giữ lời" đáng giữ y như phần ngược lại.
 */
create or replace function public.hen_tra_gan_nhat(p_contact_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with x as (
    select distinct on (h.contact_id)
      h.contact_id, h.ngay_hen, h.ghi_chu, h.created_at
    from public.hen_tra_no h
    where h.contact_id = any(coalesce(p_contact_ids, '{}'::uuid[]))
    order by h.contact_id, h.ngay_hen desc, h.created_at desc
  ),
  dem as (
    select h.contact_id, count(*)::int lan_that_hen
      from public.hen_tra_no h
     where h.contact_id = any(coalesce(p_contact_ids, '{}'::uuid[]))
       and h.ngay_hen < public.ngay_vn()
     group by 1
  )
  select coalesce(jsonb_object_agg(x.contact_id, jsonb_build_object(
    'ngay_hen', x.ngay_hen,
    'ghi_chu', x.ghi_chu,
    'tre_ngay', greatest(0, public.ngay_vn() - x.ngay_hen),
    'lan_that_hen', coalesce(dem.lan_that_hen, 0)
  )), '{}'::jsonb)
  from x left join dem on dem.contact_id = x.contact_id;
$$;

revoke all on function public.hen_tra_gan_nhat(uuid[]) from public, anon;
grant execute on function public.hen_tra_gan_nhat(uuid[]) to authenticated;

comment on function public.hen_tra_gan_nhat(uuid[]) is
  'Lần hẹn trả gần nhất của mỗi khách + số lần đã thất hẹn. Chạy quyền người gọi nên RLS lo phân quyền (#354).';
