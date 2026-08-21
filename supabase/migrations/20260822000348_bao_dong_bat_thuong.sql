-- ════════════════════════════════════════════════════════════════════
-- #348 — BÁO ĐỘNG BẤT THƯỜNG (thẻ `man-bao-dong-bat-thuong`)
-- ════════════════════════════════════════════════════════════════════
-- Mọi màn số liệu của iFan đều CHỜ chủ tiệm mở ra xem. Chủ tiệm spa thì cả ngày
-- ở sàn. Nên thứ có giá trị nhất trong cả mảng số liệu không phải thêm một biểu
-- đồ, mà là một tin TỰ TÌM ĐẾN khi có chuyện đáng nhìn.
--
-- ⚠️ CẢ BẢN NÀY XOAY QUANH MỘT RỦI RO: BÁO NHẦM. Một tin sai là chủ tiệm bỏ dở
--   việc đang làm để đi tìm một vấn đề không có thật. Lần thứ hai thì họ tắt
--   thông báo, và MỌI TIN SAU ĐÓ — kể cả tin đúng — đều mất. Giá của một lần
--   báo nhầm không phải "một lần phiền" mà là MẤT HẲN KÊNH NÀY.
--   ⇒ Thà bỏ sót một ngày bất thường nhẹ còn hơn báo một ngày bình thường.

-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỀU ĐÃ ĐO ĐƯỢC, VÀ ĐỀU ĐỔI THIẾT KẾ SO VỚI BẢN VẼ
-- ════════════════════════════════════════════════════════════════════
-- ① MỨC THƯỜNG NGÀY PHẢI BÙ NGÀY KHÔNG CÓ LƯỢT HUỶ BẰNG 0.
--    Đo 22/08 trên 10 tiệm: quán cà phê mẫu chỉ có huỷ ở 5/14 ngày. Bỏ 9 ngày
--    trống ra ngoài thì "mức thường ngày" = 1; bù 0 vào thì = 0. Con số thứ hai
--    mới trả lời đúng câu "một ngày BÌNH THƯỜNG thì huỷ bao nhiêu" — và đó mới
--    là câu người đọc đang hỏi. (`so_lieu_hom_nay` ở #345 tính kiểu thứ nhất
--    cho huỷ hẹn nhưng kiểu thứ hai cho lịch — #349 dọn chỗ lệch đó.)
--
-- ② HAI CHỐT NHƯ BẢN VẼ LÀ CHƯA ĐỦ, PHẢI BA.
--    Bản vẽ chốt "≥ 2 lần mức thường ngày" và "≥ 3 lượt". Nhưng khi mức thường
--    ngày bằng 0 hoặc 0,5 (đúng tình cảnh của 3/10 tiệm đo được) thì chốt đầu
--    thành vô nghĩa — 3 lượt huỷ đã là "gấp 6 lần". Với phòng khám mẫu, ngày
--    huỷ nhiều nhất trong 14 ngày là 4 lượt; báo động ở 3 lượt là báo một ngày
--    BÌNH THƯỜNG.
--    ⇒ Thêm chốt thứ ba: hôm nay phải ≥ NGÀY CAO NHẤT của 14 ngày qua. Chốt này
--      tự co giãn theo cỡ tiệm, không cần ai chỉnh tay: tiệm lớn cần 7-8 lượt
--      mới kêu, quán nhỏ chỉ cần 3.
--
-- ③ "NGÀY MAI VẮNG" KHÔNG ĐƯỢC SO VỚI SỐ ĐÃ CHỐT SỔ CỦA NGÀY CŨ.
--    Lịch ngày mai GIỜ NÀY vẫn đang được đặt thêm; ngày cũ thì đã chốt. So hai
--    thứ đó là so lệch, và sẽ báo "ngày mai vắng" gần như MỖI NGÀY.
--    ⇒ Mốc phải là "ngày đó có bao nhiêu lịch TÍNH TỚI TRƯỚC ĐÓ MỘT NGÀY".
--    ⚠️ NÓI THẲNG: dữ liệu mẫu KHÔNG kiểm chứng được điều này — nó sinh mọi
--      lịch hẹn trong một lần chạy nên hai cách tính ra gần y hệt nhau (33 so
--      33). Đây là chỗ sửa theo LẬP LUẬN chứ không theo số đo, và nó chỉ lộ ra
--      khi có tiệm thật nhận khách đặt trong ngày.

/**
 * Dò bất thường cho MỌI tiệm và ghi thông báo. Chạy bằng nhịp cron bên ngoài.
 *
 * ⚠️ CHỈ `service_role` GỌI ĐƯỢC. Hàm đi xuyên mọi tiệm nên không được để người
 *   dùng thường chạm tới — cùng khuôn với `process_appointment_reminders`.
 *
 * @param p_gio  giờ Việt Nam (0–23). Bỏ trống thì lấy giờ hiện tại.
 */
create or replace function public.do_bat_thuong(p_gio integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Hai mốc giờ DUY NHẤT. 15:00 vì đã đủ một ngày tín hiệu mà còn nửa buổi
  -- chiều để gọi lại khách; 18:00 vì đó là lúc còn KỊP LÀM GÌ ĐÓ cho ngày mai.
  -- Ngoài hai mốc này thì không có tin nào — kể cả ban đêm.
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
    -- ── Trần CỨNG: một tin mỗi tiệm mỗi ngày, đứng trên mọi luật khác ──
    if exists (
      select 1 from public.notifications x
       where x.tenant_id = r.id and x.type = 'bat_thuong'
         and (x.created_at at time zone 'Asia/Ho_Chi_Minh')::date = v_nay
    ) then
      continue;
    end if;

    -- ── Chưa đủ 14 ngày dữ liệu thì KHÔNG có khái niệm "bất thường" ──
    -- Tiệm mới sẽ nhận báo động mỗi ngày rồi bỏ đi trước khi kịp thấy iFan
    -- hữu ích.
    if not exists (
      select 1 from public.appointments a
       where a.tenant_id = r.id and a.deleted_at is null
         and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_nay - 14
    ) then
      continue;
    end if;

    v_tieu_de := null;

    if v_gio = c_gio_huy then
      -- ── Luật 1: huỷ hẹn dồn bất thường ─────────────────────────────
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
        -- Khung 2 giờ có nhiều lượt huỷ nhất, chỉ kể khi chiếm từ một nửa.
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
      -- ── Luật 2: ngày mai vắng bất thường ───────────────────────────
      select count(*)::int into v_mai
        from public.appointments a
       where a.tenant_id = r.id and a.deleted_at is null
         and a.status not in ('cancelled', 'no_show')
         and (a.start_at at time zone 'Asia/Ho_Chi_Minh')::date = v_nay + 1;

      -- ⚠️ Mốc tính TỚI TRƯỚC ĐÓ MỘT NGÀY — xem ghi chú ③ ở đầu file.
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

    -- ── Gửi cho CHỦ · QUẢN TRỊ · QUẢN LÝ, ai chưa tắt ──────────────
    -- Nhân viên thường KHÔNG nhận: đây là số của cả tiệm, vừa là rò thông tin
    -- vừa là tin họ không làm gì được.
    for n in
      select m.user_id
        from public.tenant_members m
        left join public.notification_prefs p
          on p.tenant_id = m.tenant_id and p.user_id = m.user_id
       where m.tenant_id = r.id
         and m.role in ('owner', 'admin', 'manager')
         -- Không có dòng cài đặt ⇒ NHẬN. Chỉ tắt khi người dùng tự tắt.
         and coalesce(p.pref->>'enabled', 'true') <> 'false'
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
  'Dò bất thường (huỷ hẹn dồn lúc 15:00, lịch ngày mai vắng lúc 18:00) rồi ghi thông báo cho chủ/quản trị/quản lý. Trần cứng một tin mỗi tiệm mỗi ngày. Chỉ service_role gọi được (#348).';
