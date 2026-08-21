-- ════════════════════════════════════════════════════════════════════
-- #352 — CHẶN ĐƯỜNG DẪN LEO THƯ MỤC TRONG ẢNH CHỨNG TỪ
-- ════════════════════════════════════════════════════════════════════
-- #351 chốt đường dẫn bằng cách so TIỀN TỐ: phải bắt đầu bằng
-- `<mã tiệm>/chung-tu/`. Bộ kiểm ghi nhận một chỗ chưa chứng minh được: đường
-- dẫn `<mã tiệm>/chung-tu/../../<tiệm khác>/…` cũng bắt đầu đúng tiền tố.
--
-- ĐÃ ĐI ĐO THẬT, KHÔNG ĐOÁN. Hai phép đo ngày 22/08 trên kho đang chạy:
--   ① Bằng KHOÁ DỊCH VỤ: tải lên đường dẫn có `../..` thì tệp **rơi hẳn sang
--     thư mục tiệm kia**. Kho Supabase CÓ hiểu `..`, nó không coi cả chuỗi là
--     một cái tên. (Trước khi đo, giả thiết của tôi là ngược lại — và tôi đã
--     suýt ghi giả thiết đó vào bộ kiểm như một sự thật.)
--   ② Bằng TÀI KHOẢN NGƯỜI DÙNG THƯỜNG: bị chặn — `new row violates row-level
--     security policy`. Kho chuẩn hoá đường dẫn TRƯỚC khi kiểm quyền, nên
--     chính sách `(storage.foldername(name))[1] = current_tenant_id()` nhìn
--     thấy tiệm ĐÍCH THẬT chứ không nhìn tiền tố.
--
-- ⇒ Đường tải lên của người dùng KHÔNG rò. Nhưng cột `chung_tu` vẫn NHẬN được
--   một chuỗi có `..`, và nơi ký hạn giờ để xem ảnh có thể chạy bằng khoá dịch
--   vụ — lúc đó `..` sẽ được kho giải ra và mở tệp của tiệm khác. Lỗ không nằm
--   ở kho, nó nằm ở chỗ NHẬN đường dẫn.
--
-- ⚠️ CHẶN Ở ĐÂY DÙ ĐƯỜNG KIA ĐÃ AN TOÀN. Một lớp chặn dựa vào việc "lớp khác
--   đang đúng" là lớp chặn sẽ hỏng vào ngày lớp kia đổi — mà lúc đó không ai
--   nhớ ra là nó từng gánh phần này.

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
    -- `..` ở BẤT KỲ đâu trong chuỗi. Không cố đoán xem nó có leo ra khỏi thư
    -- mục tiệm hay không: một đường dẫn ảnh hợp lệ không bao giờ cần tới `..`,
    -- nên từ chối thẳng là vừa đúng vừa không có ca biên nào phải nghĩ.
    if v_d like '%..%' then
      return jsonb_build_object('loi', 'duong_dan_leo_thu_muc');
    end if;
    -- Gạch chéo ngược và ký tự rỗng: hai lối lách quen thuộc khi một lớp phía
    -- sau tự đổi chúng thành `/` hoặc cắt chuỗi.
    if v_d like '%\%' or position(chr(0) in v_d) > 0 then
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
  'Đính ảnh chứng từ vào một phiếu CHI. Chốt đường dẫn: đúng tiền tố thư mục tiệm, KHÔNG chứa `..` (kho Supabase có hiểu `..` — đã đo), không gạch chéo ngược, không ký tự rỗng (#351, #352).';
