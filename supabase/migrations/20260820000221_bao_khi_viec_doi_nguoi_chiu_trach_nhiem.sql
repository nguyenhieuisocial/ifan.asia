-- #219 — Đổi người chịu trách nhiệm của một VIỆC thì phải báo cho người liên quan.
--
-- Thẻ: design-system/cua-so-sua-viec.html, mục "Đổi người rồi thì báo ai".
-- Việc #202.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO LUẬT NÀY NẰM Ở KHO DỮ LIỆU, KHÔNG PHẢI Ở TẦNG WEB
-- ═══════════════════════════════════════════════════════════════════
-- Bảng `notifications` CỐ Ý không mở đường ghi cho người dùng thường (migration
-- #2: chỉ có policy select + mark_read, không có policy insert). Mọi thông báo
-- trong phần mềm này đều do kho dữ liệu tự sinh. Nên "báo người mới" không phải
-- là thêm vài dòng ở màn hình mà là một luật ở đây.
--
-- Được thêm cái lợi thứ hai: đổi người bằng ĐƯỜNG NÀO cũng báo. Hôm nay đường
-- duy nhất là cửa sổ Sửa việc; mai có màn khác cũng đổi được người thì không ai
-- phải nhớ đi thêm lời báo lần nữa.
--
-- ═══════════════════════════════════════════════════════════════════
-- BỐN TÌNH HUỐNG (thẻ đã chốt) — và vì sao KHÔNG báo cho người vừa bấm
-- ═══════════════════════════════════════════════════════════════════
--  ① Quản lý giao việc CỦA MÌNH cho Ngọc  → báo Ngọc. Không báo người cũ:
--     người cũ chính là người vừa bấm.
--  ② Quản lý chuyển việc từ Ngọc sang Lan → báo CẢ HAI. Ngọc mất quyền nhìn
--     thấy việc đó NGAY LẬP TỨC (nhân viên chỉ đọc được việc của chính mình,
--     policy `activities_select`); im lặng ở đây khiến Ngọc tưởng việc bị xoá.
--  ③ Quản lý lấy việc của Ngọc VỀ MÌNH   → chỉ báo Ngọc.
--  ④ Lưu mà KHÔNG đổi người              → không báo ai. Mệnh đề `when` của
--     trigger lo việc này: sửa chính tả trong tiêu đề mà bắn thông báo cho cả
--     tiệm thì vài ngày sau không ai đọc chuông nữa.
--
-- Vế "không tự báo cho chính mình" (`<> auth.uid()`) là thứ giữ cho chuông còn
-- giá trị. Một cái chuông báo lại đúng thứ mình vừa bấm là cái chuông người ta
-- học cách phớt lờ.
--
-- ═══════════════════════════════════════════════════════════════════
-- VÌ SAO NGƯỜI CŨ KHÔNG CÓ ĐƯỜNG DẪN — chỗ dễ dựng sai nhất
-- ═══════════════════════════════════════════════════════════════════
-- Ngay khi owner_id đổi, người cũ (vai nhân viên) KHÔNG còn đọc được dòng việc
-- đó nữa. Gắn `link` vào thông báo của họ thì bấm vào ra TRANG TRỐNG — đúng lớp
-- "cảnh báo dẫn vào ngõ cụt". Nên thông báo của người cũ để `link = null`.
--
-- ═══════════════════════════════════════════════════════════════════
-- NHÓM LỌC CỦA CHUÔNG
-- ═══════════════════════════════════════════════════════════════════
-- Chuông hiện lọc theo 4 nhóm có tên (sla · handoff · approval · workflow) +
-- "Khác". Loại `task_owner_changed` này rơi vào "Khác" — ĐÚNG Ý: thêm nhóm
-- "Giao việc" là một quyết định riêng, thẻ đã ghi rõ không gộp vào đợt này.

create or replace function public.activities_bao_doi_nguoi_chiu()
returns trigger
language plpgsql
-- definer: người bấm thường là quản lý, mà bảng `notifications` không mở đường
-- ghi cho BẤT KỲ vai nào ở tầng web. Không có definer thì lệnh insert bên dưới
-- bị RLS lọc sạch — 0 dòng, KHÔNG lỗi — và thông báo âm thầm không bao giờ tới.
security definer set search_path = public, pg_temp
as $$
declare
  v_nguoi_bam uuid := auth.uid();
  v_ten_viec  text := coalesce(nullif(new.subject, ''), nullif(new.body, ''), '(việc không có tiêu đề)');
  v_nguoi_giao text;
  v_nguoi_moi  text;
  v_han       text;
  v_link      text;
begin
  -- Tên để in vào câu thông báo. Thiếu hồ sơ (người vừa bị gỡ) thì dùng nhãn
  -- chung — không in mã nội bộ ra cho chủ tiệm đọc.
  select coalesce(nullif(p.display_name, ''), 'một đồng nghiệp') into v_nguoi_giao
    from public.profiles p where p.user_id = v_nguoi_bam;
  v_nguoi_giao := coalesce(v_nguoi_giao, 'một đồng nghiệp');

  select coalesce(nullif(p.display_name, ''), 'một đồng nghiệp') into v_nguoi_moi
    from public.profiles p where p.user_id = new.owner_id;
  v_nguoi_moi := coalesce(v_nguoi_moi, 'một đồng nghiệp');

  -- Hạn theo GIỜ VIỆT NAM. In mốc UTC ra là lệch 7 tiếng — cùng lớp lỗi đã vá ở
  -- #213/#218, việc hạn 18h hôm nay hiện thành 11h thì chủ tiệm đọc sai cả ngày.
  v_han := case
    when new.due_at is null then 'chưa đặt'
    else to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
  end;

  -- Đường mở việc cho NGƯỜI MỚI. Việc gắn khách thì nhảy thẳng vào đúng dòng
  -- trong khối "Việc đang chờ" (cùng quy ước `#activity-<id>` với thông báo việc
  -- quá hạn, migration #51); việc dự án thì mở bảng Công việc đã lọc theo dự án.
  v_link := case
    when new.contact_id is not null then '/app/contacts/' || new.contact_id::text || '#activity-' || new.id::text
    when new.project_id is not null then '/app/tasks?project=' || new.project_id::text
    else '/app/tasks'
  end;

  -- Sự kiện nghiệp vụ: khai TRƯỚC ở docs/EVENT_CATALOG.md (luật D1). Mang đúng
  -- hai thứ mà `contact.owner_changed` mang — người cũ và người mới — nên chủ
  -- tiệm nào muốn báo qua Zalo thay vì chuông thì tự bật trong Quy trình tự
  -- động, không cần ai code thêm.
  perform public.wf_emit(
    new.tenant_id, 'task.owner_changed', 'activity', new.id::text,
    jsonb_build_object(
      'old_owner_id', old.owner_id,
      'new_owner_id', new.owner_id,
      'subject', v_ten_viec,
      'due_at', new.due_at));

  -- ---- Người MỚI: có đường mở việc ----
  if new.owner_id is distinct from v_nguoi_bam then
    insert into public.notifications
      (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
    values (
      new.tenant_id, new.owner_id, 'task_owner_changed',
      'Bạn vừa được giao một việc',
      left(v_ten_viec || ' — hạn ' || v_han || '. ' || v_nguoi_giao || ' giao.', 500),
      v_link,
      'task.ownerAssigned.title', 'task.ownerAssigned.body',
      jsonb_build_object('subject', v_ten_viec, 'due', v_han, 'actor', v_nguoi_giao));
  end if;

  -- ---- Người CŨ: KHÔNG có đường mở việc (xem chú thích đầu tệp) ----
  if old.owner_id is distinct from v_nguoi_bam then
    insert into public.notifications
      (tenant_id, user_id, type, title, body, link, title_key, body_key, params)
    values (
      new.tenant_id, old.owner_id, 'task_owner_changed',
      'Việc đã chuyển sang người khác',
      left(v_ten_viec || ' nay do ' || v_nguoi_moi || ' chịu.', 500),
      null,
      'task.ownerRemoved.title', 'task.ownerRemoved.body',
      jsonb_build_object('subject', v_ten_viec, 'owner', v_nguoi_moi));
  end if;

  return null;
end;
$$;

comment on function public.activities_bao_doi_nguoi_chiu() is
  'Bao chuong khi VIEC doi nguoi chiu trach nhiem (#219, viec #202). Bao nguoi MOI (kem duong mo viec) va nguoi CU (KHONG kem duong dan — ho mat quyen doc dong viec ngay khi owner_id doi, gan link vao la bam ra trang trong). KHONG bao cho chinh nguoi vua bam. definer vi bang notifications khong mo duong ghi cho bat ky vai nao o tang web.';

drop trigger if exists activities_bao_doi_nguoi_chiu on public.activities;
-- Chỉ chạy khi owner_id THẬT SỰ đổi trên một dòng type='task'. Mệnh đề `when`
-- (không phải `if` trong thân hàm) để lần Lưu nào không đổi người thì hàm không
-- được gọi lấy một lần — rẻ hơn, và không có đường nào lọt ra một thông báo thừa.
create trigger activities_bao_doi_nguoi_chiu
  after update on public.activities
  for each row
  when (new.type = 'task' and new.owner_id is distinct from old.owner_id)
  execute function public.activities_bao_doi_nguoi_chiu();
