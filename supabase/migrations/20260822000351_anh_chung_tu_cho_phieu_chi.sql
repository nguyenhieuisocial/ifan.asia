-- ════════════════════════════════════════════════════════════════════
-- #351 — ẢNH CHỨNG TỪ CHO PHIẾU CHI (thẻ `man-anh-chung-tu-phieu-chi`)
-- ════════════════════════════════════════════════════════════════════
-- Sổ quỹ ghi được tiền ra và có phân nhóm, nhưng KHÔNG có chỗ nào đính bằng
-- chứng. Một dòng "chi 5.000.000đ · nhóm khác · trả tiền vật tư" thì tới cuối
-- tháng không ai xác minh được, kể cả chính người đã ghi.
--
-- Đây là lỗ hổng TIN CẬY, không phải thiếu tiện nghi: tiệm nhỏ ở Việt Nam chi
-- phần lớn bằng tiền mặt, và người ghi sổ thường không phải chủ tiệm.
--
-- ⚠️ CHỈ CHO PHIẾU CHI. Tiền vào đã có chứng từ sẵn — nó gắn với đơn hàng, có
--   dòng hàng, có phiếu thu. Mở cho cả hai chiều là thêm một thứ phải nuôi mà
--   không giải quyết vấn đề nào. Chốt bằng CHECK ở dưới, không chỉ bằng giao
--   diện: giao diện chặn thì gọi thẳng API vẫn ghi được.

alter table public.cash_entries
  add column if not exists chung_tu jsonb not null default '[]'::jsonb;

comment on column public.cash_entries.chung_tu is
  'Ảnh chứng từ của phiếu CHI: [{duong_dan, ten, co}]. Tối đa 3. Đường dẫn trong kho tenant-files, xem bằng đường dẫn ký hạn giờ (#351).';

/**
 * Hình dạng bắt buộc của `chung_tu`.
 *
 * ⚠️ `jsonb_array_length` NÉM LỖI nếu giá trị không phải mảng, và lỗi trong một
 *   CHECK làm hỏng cả câu ghi. Nên phải kiểm `jsonb_typeof` TRƯỚC — thứ tự các
 *   vế trong `and` ở Postgres KHÔNG được bảo đảm, nên dùng `case` cho chắc.
 *
 * ⚠️ CHECK coi NULL là ĐẠT. Cột đã khai `not null default '[]'` nên không có
 *   dòng nào null, nhưng ghi lại đây vì đây là cái bẫy đã sập một lần trong kho
 *   này: `array_length(x, 1)` trả NULL cho mảng rỗng, và `NULL >= 1` là NULL,
 *   nên CHECK cho qua trong khi tưởng là đang chặn.
 */
alter table public.cash_entries
  drop constraint if exists cash_entries_chung_tu_hop_le;

alter table public.cash_entries
  add constraint cash_entries_chung_tu_hop_le check (
    case
      when jsonb_typeof(chung_tu) <> 'array' then false
      when jsonb_array_length(chung_tu) > 3 then false
      -- Ảnh chứng từ chỉ có nghĩa với tiền RA.
      when jsonb_array_length(chung_tu) > 0 and direction <> 'out' then false
      else true
    end
  );

/**
 * Đính ảnh chứng từ vào một phiếu chi ĐÃ GHI.
 *
 * ⚠️ VÌ SAO LÀ MỘT HÀM RIÊNG chứ không để tầng web `update` thẳng: ảnh phải nằm
 *   ĐÚNG trong thư mục của tiệm mình. Không kiểm thì một người có quyền ghi sổ
 *   có thể đính đường dẫn trỏ sang thư mục tiệm khác, và màn hình sẽ ngoan
 *   ngoãn ký hạn rồi mở ảnh đó ra. Đây đúng lớp bệnh đã chặn một lần ở đường
 *   dẫn logo tiệm (#334).
 *
 * ⚠️ CHẠY QUYỀN NGƯỜI GỌI (`security invoker`) — để RLS `cash_entries_rw` tự
 *   lo phần "ai được sửa sổ quỹ". Viết lại phép kiểm vai ở đây là dựng lớp
 *   phân quyền thứ hai để về sau lệch với lớp thứ nhất.
 */
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
begin
  if v_tiem is null then
    return jsonb_build_object('loi', 'khong_thuoc_tiem_nao');
  end if;
  if jsonb_typeof(p_chung_tu) <> 'array' or jsonb_array_length(p_chung_tu) > 3 then
    return jsonb_build_object('loi', 'sai_hinh_dang');
  end if;

  v_mau := v_tiem::text || '/chung-tu/';
  for v_x in select * from jsonb_array_elements(p_chung_tu) loop
    if coalesce(v_x->>'duong_dan', '') not like v_mau || '%' then
      return jsonb_build_object('loi', 'duong_dan_ngoai_tiem');
    end if;
  end loop;

  update public.cash_entries
     set chung_tu = p_chung_tu
   where id = p_id and tenant_id = v_tiem and direction = 'out' and deleted_at is null;

  if not found then
    -- Không phân biệt "không có phiếu" với "không có quyền": nói rõ hơn là
    -- giúp người lạ dò xem phiếu nào tồn tại.
    return jsonb_build_object('loi', 'khong_ghi_duoc');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dinh_chung_tu(uuid, jsonb) from public, anon;
grant execute on function public.dinh_chung_tu(uuid, jsonb) to authenticated;

comment on function public.dinh_chung_tu(uuid, jsonb) is
  'Đính ảnh chứng từ vào một phiếu CHI. Chốt đường dẫn phải nằm trong thư mục của chính tiệm; chạy quyền người gọi để RLS lo phân quyền (#351).';
