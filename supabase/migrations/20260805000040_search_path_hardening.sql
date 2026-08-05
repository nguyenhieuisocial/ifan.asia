-- =============================================================
-- iFan.asia — Migration #40: Ghim `pg_temp` cuối `search_path` cho MỌI hàm
--                            security definer trong schema `public`.
--
-- VÌ SAO CẦN:
--   Postgres LUÔN tìm schema tạm (`pg_temp`) khi phân giải tên BẢNG/KIỂU. Nếu
--   `pg_temp` không được liệt kê tường minh trong `search_path` thì nó được tìm
--   ĐẦU TIÊN — trước cả `pg_catalog`. Nghĩa là một hàm definer đặt
--   `search_path = public` vẫn có thể bị đánh tráo: kẻ tấn công tạo
--   `pg_temp.tenant_members` rồi gọi hàm, hàm đọc nhầm bảng tạm và chạy dưới
--   quyền `postgres`. Liệt kê `pg_temp` ở CUỐI đẩy nó xuống sau cùng — đúng
--   khuyến nghị "Writing SECURITY DEFINER Functions Safely" của Postgres.
--
-- MỨC ĐỘ THẬT: CHƯA khai thác được qua sản phẩm — PostgREST không cho chạy DDL
--   nên `authenticated` không tạo được bảng tạm. Đây là việc cơ học làm cho
--   sạch, không phải vá lỗ hổng đang chảy máu.
--
-- CÁCH LÀM — vì sao là khối DO chứ không chép lại 87 định nghĩa hàm:
--   `alter function ... set search_path` CHỈ đụng vào thuộc tính cấu hình, KHÔNG
--   đụng vào thân hàm. Chép lại định nghĩa thì mỗi hàm là một cơ hội gõ nhầm và
--   đè mất bản mới nhất (nhiều migration song song đang cùng sửa mấy hàm này).
--   Duyệt `pg_proc` là an toàn tuyệt đối với phần thân.
--
-- KHÔNG NỚI LỎNG BẤT CỨ THỨ GÌ:
--   · `search_path=public`     → `public, pg_temp`      (chặt hơn: pg_temp xuống cuối)
--   · `search_path=pg_catalog` → `pg_catalog, pg_temp`  (chặt hơn: pg_temp xuống cuối)
--   · `search_path=""`         → `pg_temp`              (tương đương HỆT bản cũ —
--       đường dẫn rỗng thì pg_temp vốn đã là nơi duy nhất được tìm; ghi tường
--       minh để bộ kiểm đếm được, KHÔNG thêm `public` vào 2 hàm bí mật Zalo)
--   · không có `search_path`   → `public, pg_temp`      (phòng xa; hiện không hàm nào)
--
-- Chạy lại nhiều lần an toàn: hàm nào đã có `pg_temp` thì bỏ qua.
-- =============================================================

do $$
declare
  r        record;
  v_cur    text;
  v_new    text;
  v_kind   text;
  v_target text;
  v_done   int := 0;
  v_skip   int := 0;
begin
  for r in
    select p.oid,
           p.prokind,
           quote_ident(n.nspname) || '.' || quote_ident(p.proname)
             || '(' || pg_get_function_identity_arguments(p.oid) || ')' as target,
           (select cfg
              from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
             where cfg like 'search_path=%'
             limit 1) as sp
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prokind in ('f', 'p')
     order by 1
  loop
    v_cur    := substring(r.sp from '^search_path=(.*)$');
    v_target := r.target;

    -- Đã ghim rồi → không đụng vào (migration chạy lại không đổi gì).
    if v_cur is not null and v_cur ~ '(^|[,[:space:]"])pg_temp([,[:space:]"]|$)' then
      v_skip := v_skip + 1;
      continue;
    end if;

    if r.sp is null then
      v_new := 'public, pg_temp';           -- chưa ghim gì: đặt mặc định an toàn
    elsif btrim(v_cur, ' "') = '' then
      v_new := 'pg_temp';                   -- đường dẫn rỗng: giữ nguyên độ chặt
    else
      v_new := v_cur || ', pg_temp';        -- nối vào cuối, giữ nguyên thứ tự cũ
    end if;

    v_kind := case r.prokind when 'p' then 'procedure' else 'function' end;
    execute format('alter %s %s set search_path = %s', v_kind, v_target, v_new);
    v_done := v_done + 1;
  end loop;

  raise notice '[#40] search_path: % hàm vừa ghim pg_temp, % hàm đã có sẵn', v_done, v_skip;
end $$;

-- -------------------------------------------------------------
-- CỔNG FAIL-CLOSED: còn sót hàm definer nào chưa có pg_temp thì migration NGÃ,
-- không âm thầm đi tiếp rồi báo cáo "đã xong".
-- -------------------------------------------------------------
do $$
declare v_left int;
begin
  select count(*) into v_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
        where substring(cfg from '^search_path=(.*)$')
              ~ '(^|[,[:space:]"])pg_temp([,[:space:]"]|$)');
  if v_left > 0 then
    raise exception '[#40] còn % hàm security definer chưa ghim pg_temp', v_left;
  end if;
end $$;
