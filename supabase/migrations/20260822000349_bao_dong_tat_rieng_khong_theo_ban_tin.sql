-- ════════════════════════════════════════════════════════════════════
-- #349 — TẮT BÁO ĐỘNG PHẢI LÀ MỘT CÔNG TẮC RIÊNG, KHÔNG DÍNH BẢN TIN ZALO
-- ════════════════════════════════════════════════════════════════════
-- #348 chặn gửi khi `pref->>'enabled' = 'false'`. Đọc kỹ chỗ dùng thật thì SAI:
-- cột `notification_prefs.pref` do màn Cài đặt → Thông báo ghi, và ô `enabled`
-- ở đó là **"bật bản tin Zalo"** — không phải "bật mọi thông báo". Ba khoá
-- `kinds.{sla,today,unread}` bên dưới nó cũng chỉ nói NỘI DUNG BẢN TIN ZALO
-- gồm những gì.
--
-- Hệ quả nếu để nguyên: chủ tiệm không dùng Zalo, tắt bản tin đi — và mất luôn
-- báo động bất thường trong chuông của app, mà **không có gì nói cho họ biết**.
-- Đúng lớp bệnh "một công tắc chung cho mọi loại tin": ai khó chịu vì một loại
-- sẽ tắt sạch, kể cả những loại họ vẫn muốn.
--
-- ⇒ Chỉ đọc `kinds.bat_thuong`. Không có khoá ⇒ NHẬN.
--
-- Phần tầng web đi kèm bản này: form Cài đặt phải GỬI LẠI `kinds.bat_thuong`
-- mỗi lần lưu. Form đó ghi đè NGUYÊN CẢ cột `pref`, nên nếu không gửi lại thì
-- một cú bấm Lưu ở khu bản tin sẽ xoá mất lựa chọn tắt báo động và người dùng
-- lặng lẽ bị bật lại — thứ họ sẽ đọc là "tôi đã tắt rồi mà nó vẫn báo".

create or replace function public.do_bat_thuong(p_gio integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_gio_huy    constant int := 15;
  c_gio_lich   constant int := 18;
  c_huy_toi_thieu constant int := 3;
  c_lich_toi_thieu constant numeric := 5;

  v_gio     int := coalesce(p_gio, extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int);
  v_nay     date := public.ngay_vn();
  r         record;
  n         record;
  v_tv      numeric;
  v_cao     int;
  v_huy     int;
  v_khung   record;
  v_mai     int;
  v_moc     numeric;
  v_tieu_de text;
  v_than    text;
  v_khoa_td text;
  v_khoa_th text;
  v_tham    jsonb;
  v_link    text;
  v_so_tin  int := 0;
  v_so_tiem int := 0;
begin
  if v_gio not in (c_gio_huy, c_gio_lich) then
    return jsonb_build_object('bo_qua', 'ngoai khung gio', 'gio', v_gio);
  end if;

  for r in
    select t.id from public.tenants t where t.deleted_at is null
  loop
    if exists (
      select 1 from public.notifications x
       where x.tenant_id = r.id and x.type = 'bat_thuong'
         and (x.created_at at time zone 'Asia/Ho_Chi_Minh')::date = v_nay
    ) then
      continue;
    end if;

    if not exists (
      select 1 from public.appointments a
       where a.tenant_id = r.id and a.deleted_at is null
         and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_nay - 14
    ) then
      continue;
    end if;

    v_tieu_de := null;

    if v_gio = c_gio_huy then
      select count(*)::int into v_huy
        from public.appointments a
       where a.tenant_id = r.id and a.status = 'cancelled' and a.deleted_at is null
         and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = v_nay;

      with dai as (
        select generate_series(v_nay - 14, v_nay - 1, interval '1 day')::date ngay
      ), huy as (
        select (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date ngay, count(*)::int n
          from public.appointments a
         where a.tenant_id = r.id and a.status = 'cancelled' and a.deleted_at is null
           and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date between v_nay - 14 and v_nay - 1
         group by 1
      )
      select percentile_cont(0.5) within group (order by coalesce(huy.n, 0)),
             coalesce(max(huy.n), 0)
        into v_tv, v_cao
        from dai left join huy on huy.ngay = dai.ngay;

      if v_huy >= c_huy_toi_thieu and v_huy >= 2 * v_tv and v_huy >= v_cao then
        select (extract(hour from a.start_at at time zone 'Asia/Ho_Chi_Minh')::int / 2) * 2 tu,
               count(*)::int n
          into v_khung
          from public.appointments a
         where a.tenant_id = r.id and a.status = 'cancelled' and a.deleted_at is null
           and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = v_nay
         group by 1 order by 2 desc, 1 limit 1;

        v_khoa_td := 'batThuong.huy.title';
        v_tieu_de := 'Hôm nay huỷ ' || v_huy || ' lượt hẹn';
        v_tham := jsonb_build_object('soHuy', v_huy, 'mocHuy', v_tv);

        if v_khung.n * 2 >= v_huy then
          v_khoa_th := 'batThuong.huy.bodyKhungGio';
          v_than := 'Mức thường ngày là ' || v_tv || ' lượt. Phần lớn rơi vào khung '
                 || v_khung.tu || '–' || (v_khung.tu + 2) || ' giờ.';
          v_tham := v_tham || jsonb_build_object('tuGio', v_khung.tu, 'denGio', v_khung.tu + 2);
        else
          v_khoa_th := 'batThuong.huy.body';
          v_than := 'Mức thường ngày là ' || v_tv || ' lượt.';
        end if;
        v_link := '/app/calendar?date=' || v_nay::text;
      end if;

    else
      select count(*)::int into v_mai
        from public.appointments a
       where a.tenant_id = r.id and a.deleted_at is null
         and a.status not in ('cancelled', 'no_show')
         and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = v_nay + 1;

      with dai as (
        select generate_series(v_nay - 14, v_nay - 1, interval '1 day')::date ngay
      )
      select percentile_cont(0.5) within group (order by (
        select count(*) from public.appointments a
         where a.tenant_id = r.id and a.deleted_at is null
           and a.status not in ('cancelled', 'no_show')
           and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = dai.ngay
           and (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= dai.ngay - 1
      ))
        into v_moc
        from dai;

      if v_moc >= c_lich_toi_thieu and v_mai * 2 <= v_moc then
        v_khoa_td := 'batThuong.lichVang.title';
        v_khoa_th := 'batThuong.lichVang.body';
        v_tieu_de := 'Ngày mai chỉ có ' || v_mai || ' lịch hẹn';
        v_than := 'Thường ngày ' || v_moc || ' lịch. Còn kịp gọi lại khách cũ hoặc chạy ưu đãi trong tối nay.';
        v_tham := jsonb_build_object('soMai', v_mai, 'mocMai', v_moc);
        v_link := '/app/calendar?date=' || (v_nay + 1)::text;
      end if;
    end if;

    if v_tieu_de is null then
      continue;
    end if;

    for n in
      select m.user_id
        from public.tenant_members m
        left join public.notification_prefs p
          on p.tenant_id = m.tenant_id and p.user_id = m.user_id
       where m.tenant_id = r.id
         and m.role in ('owner', 'admin', 'manager')
         -- ⚠️ CHỈ đọc `kinds.bat_thuong`. KHÔNG đọc `pref->>'enabled'` — ô đó
         --   là "bật bản tin Zalo", xem đầu file.
         and coalesce(p.pref->'kinds'->>'bat_thuong', 'true') <> 'false'
    loop
      insert into public.notifications
        (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
      values (r.id, n.user_id, 'bat_thuong', v_tieu_de, v_than, v_link,
              v_khoa_td, v_khoa_th, v_tham);
      v_so_tin := v_so_tin + 1;
    end loop;
    v_so_tiem := v_so_tiem + 1;
  end loop;

  return jsonb_build_object('gio', v_gio, 'so_tiem', v_so_tiem, 'so_tin', v_so_tin);
end;
$$;

revoke all on function public.do_bat_thuong(integer) from public, anon, authenticated;
grant execute on function public.do_bat_thuong(integer) to service_role;

comment on function public.do_bat_thuong(integer) is
  'Dò bất thường (huỷ hẹn dồn lúc 15:00, lịch ngày mai vắng lúc 18:00) rồi ghi thông báo cho chủ/quản trị/quản lý. Tắt riêng bằng kinds.bat_thuong — KHÔNG dính ô bật/tắt bản tin Zalo. Trần một tin mỗi tiệm mỗi ngày (#348, #349).';
