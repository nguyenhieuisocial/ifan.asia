-- #302 — QUẢN LÝ / QUẢN TRỊ ẨN ĐƯỢC MỘT DÒNG TIỀN, VÀ SỔ QUỸ IM LẶNG THEO.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ ĐANG MỞ — đo được, không phải lo xa
-- ════════════════════════════════════════════════════════════════════
--
-- `cash_entries` có cột `deleted_at`, và luật RLS `cash_entries_rw` là `for
-- all`: nó kiểm tiệm và vai, **không chặn cột nào**. Không màn nào trong web
-- ghi cột đó — nhưng vai `manager` hoặc `admin` gọi thẳng vào cửa dữ liệu thì
-- đặt được.
--
-- Đo hôm nay (dựng một phiếu thu 5.000.000đ rồi thử ẩn, mỗi ca rollback):
--   · vai `manager` → **ẩn được**
--   · vai `admin`   → **ẩn được**
--
-- Sau khi ẩn: Sổ quỹ và Két sắt đều lọc `deleted_at is null` nên **cả hai màn
-- cùng quên khoản đó**. Không có cảnh báo, không có vết, không có chênh lệch
-- nào để ai đó thấy mà hỏi. **Năm triệu biến mất khỏi sổ một cách sạch sẽ.**
--
-- Chính chú thích trong `app/app/ketsat/queries.ts` đã tự nhận nguy cơ này —
-- nhưng nhận rồi để đó thì lỗ vẫn là lỗ.
--
-- ════════════════════════════════════════════════════════════════════
-- QUYẾT ĐỊNH: SỔ TIỀN THÌ KHÔNG XOÁ, CHỈ GHI DÒNG ĐỐI ỨNG
-- ════════════════════════════════════════════════════════════════════
--
-- Đây là nguyên tắc kế toán có từ trước máy tính, và nó có lý do: một quyển sổ
-- mà xoá được thì nó không còn là bằng chứng. Ghi nhầm 500.000đ thì cách sửa
-- **không phải** xoá dòng đó đi, mà là ghi thêm một dòng ngược chiều — hai
-- dòng cùng nằm đó, ai đọc cũng thấy đã có một lần nhầm và đã sửa.
--
-- Xoá mềm nghe vô hại vì "dữ liệu vẫn còn". Nhưng ở SỔ TIỀN, thứ người ta cần
-- không phải dòng dữ liệu — mà là **tổng**. Ẩn một dòng là đổi tổng, và đổi
-- tổng mà không để lại vết thì đúng bằng xoá thật.
--
-- ⚠️ KHÔNG chặn bằng cách gỡ cột `deleted_at`: một dòng đã bị ẩn từ trước
-- (đo: 1/19.146 dòng) và việc chạy nền có thể còn dùng. Chặn bằng TRIGGER, ở
-- đúng chỗ mọi đường ghi đều phải đi qua.

create or replace function public.cash_entries_cam_xoa()
returns trigger
language plpgsql
as $$
begin
  -- Chỉ chặn đúng hành vi ẩn: NULL → có giá trị. Bỏ ẩn (có → NULL) vẫn cho,
  -- vì đó là sửa lại một lần ẩn nhầm trước khi bản vá này tồn tại.
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'so_quy_khong_duoc_xoa_dong_tien'
      using hint = 'Sổ tiền không xoá dòng. Ghi một dòng đối ứng ngược chiều để sửa — hai dòng cùng nằm lại làm bằng chứng.';
  end if;
  return new;
end $$;

drop trigger if exists cash_entries_cam_xoa on public.cash_entries;
create trigger cash_entries_cam_xoa
  before update on public.cash_entries
  for each row execute function public.cash_entries_cam_xoa();

-- Xoá CỨNG cũng phải chặn — nếu không thì bịt cửa xoá mềm chỉ đẩy người ta
-- sang cửa còn tệ hơn.
create or replace function public.cash_entries_cam_xoa_cung()
returns trigger
language plpgsql
as $$
begin
  raise exception 'so_quy_khong_duoc_xoa_dong_tien'
    using hint = 'Sổ tiền không xoá dòng. Ghi một dòng đối ứng ngược chiều để sửa.';
end $$;

drop trigger if exists cash_entries_cam_xoa_cung on public.cash_entries;
create trigger cash_entries_cam_xoa_cung
  before delete on public.cash_entries
  for each row execute function public.cash_entries_cam_xoa_cung();

comment on function public.cash_entries_cam_xoa() is
  'Chặn ẩn một dòng sổ quỹ (#302). Đo được: manager/admin gọi thẳng API ẩn được một phiếu 5 triệu, và CẢ HAI màn tiền cùng quên khoản đó — không cảnh báo, không vết.';
