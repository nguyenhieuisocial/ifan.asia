-- ════════════════════════════════════════════════════════════════════
-- #353 — VÀ CHÍNH PHÉP CHẶN Ở #352 LÀM HÀM HỎNG HẲN
-- ════════════════════════════════════════════════════════════════════
-- #352 thêm hai phép chặn đường dẫn lạ. Cả hai đều SAI, và cái sai thứ hai làm
-- hàm ném lỗi ở MỌI lượt gọi — kể cả lượt hợp lệ. Nghĩa là trong khoảng thời
-- gian ngắn giữa #352 và bản này, tính năng đính chứng từ **hỏng hoàn toàn**.
-- Bộ kiểm bắt được ngay; nếu không có bộ kiểm thì thứ đầu tiên phát hiện ra sẽ
-- là một chủ tiệm đang đứng cạnh xấp hoá đơn.
--
-- ① `position(chr(0) in v_d)` — `chr(0)` NÉM LỖI trong Postgres:
--   *"null character not permitted"*. Và phép kiểm đó vốn đã thừa: kiểu `text`
--   của Postgres **không thể chứa** ký tự rỗng, nên chuỗi đi tới đây chắc chắn
--   không có. Tôi thêm nó theo THÓI QUEN từ các ngôn ngữ khác, không phải theo
--   một mối nguy đo được ở đây.
--
-- ② `v_d like '%\%'` — trong `LIKE`, gạch chéo ngược CHÍNH LÀ ký tự thoát mặc
--   định, nên khuôn này nói "kết thúc bằng một ký tự được thoát" chứ không nói
--   "có chứa gạch chéo ngược". Dùng `position()` thì không có ký tự nào mang
--   nghĩa đặc biệt.
--
-- BÀI HỌC ĐỂ LẠI: hai dòng này được thêm vào cùng lượt với một phép chặn ĐÚNG
-- và cần thiết (chặn `..`, có đo thật đứng sau). Phép chặn đúng làm cả nhóm
-- trông như đã được cân nhắc kỹ. Thêm phòng thủ "cho chắc" mà không có mối
-- nguy đo được là cách một bản vá tự tạo ra lỗi mới.

create or replace function public.dinh_chung_tu(p_id uuid, p_chung_tu jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tiem uuid := public.current_tenant_id();
  v_mau  text;
  v_x    jsonb;
  v_d    text;
begin
  if v_tiem is null then
    return jsonb_build_object('loi', 'khong_thuoc_tiem_nao');
  end if;
  if jsonb_typeof(p_chung_tu) <> 'array' or jsonb_array_length(p_chung_tu) > 3 then
    return jsonb_build_object('loi', 'sai_hinh_dang');
  end if;

  v_mau := v_tiem::text || '/chung-tu/';
  for v_x in select * from jsonb_array_elements(p_chung_tu) loop
    v_d := coalesce(v_x->>'duong_dan', '');
    if v_d not like v_mau || '%' then
      return jsonb_build_object('loi', 'duong_dan_ngoai_tiem');
    end if;
    -- `..` ở BẤT KỲ đâu. Đã đo thật: kho Supabase CÓ hiểu `..` và tệp rơi sang
    -- thư mục tiệm kia. Một đường dẫn ảnh hợp lệ không bao giờ cần tới `..`.
    if position('..' in v_d) > 0 then
      return jsonb_build_object('loi', 'duong_dan_leo_thu_muc');
    end if;
    -- Gạch chéo ngược: lối lách khi một lớp phía sau tự đổi nó thành `/`.
    -- `position()` chứ KHÔNG `LIKE` — xem lý do ② ở đầu file.
    if position('\' in v_d) > 0 then
      return jsonb_build_object('loi', 'duong_dan_la');
    end if;
  end loop;

  update public.cash_entries
     set chung_tu = p_chung_tu
   where id = p_id and tenant_id = v_tiem and direction = 'out' and deleted_at is null;

  if not found then
    return jsonb_build_object('loi', 'khong_ghi_duoc');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dinh_chung_tu(uuid, jsonb) from public, anon;
grant execute on function public.dinh_chung_tu(uuid, jsonb) to authenticated;

comment on function public.dinh_chung_tu(uuid, jsonb) is
  'Đính ảnh chứng từ vào một phiếu CHI. Chốt: đúng tiền tố thư mục tiệm, không chứa `..` (kho Supabase CÓ hiểu `..` — đã đo thật), không gạch chéo ngược (#351, #352, #353).';
