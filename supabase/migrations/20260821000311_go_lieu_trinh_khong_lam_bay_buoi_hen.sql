-- ════════════════════════════════════════════════════════════════════
-- XOÁ MỘT LIỆU TRÌNH KHÔNG ĐƯỢC LÀM HỎNG CÁC BUỔI ĐÃ ĐẶT
-- ════════════════════════════════════════════════════════════════════
--
-- Migration #310 nối buổi hẹn vào liệu trình bằng HAI cột — `series_id` và
-- `series_index` — với một ràng buộc bắt chúng luôn đi cùng nhau:
--
--     check ((series_id is null) = (series_index is null))
--
-- và khoá ngoại `on delete set null` để "xoá bản ghi luật lặp thì các buổi đã
-- đặt vẫn ở nguyên đó".
--
-- HAI THỨ ĐÓ ĐÁ NHAU. Khi xoá bản ghi luật lặp, Postgres chỉ set null cột
-- `series_id` (cột nằm trong khoá ngoại); `series_index` vẫn còn số. Ràng buộc
-- lập tức chặn, và **cả câu lệnh xoá hỏng**.
--
-- Hậu quả không phải là mất dữ liệu — mà là một lệnh dọn dẹp bình thường bỗng
-- báo một câu lỗi ràng buộc không ai hiểu, ở một chỗ không ai ngờ. Đúng loại
-- lỗi chỉ lộ ra khi CHẠY THẬT: viết ra thì cả hai vế đều nghe rất hợp lý.
--
-- Bắt được bằng phép thử dựng trên dữ liệu thật ngay trong lượt làm — ca
-- "XOÁ bản ghi luật lặp KHÔNG làm bay các buổi đã đặt".
--
-- CHỮA: gỡ TAY cả hai cột TRƯỚC khi bản ghi bị xoá. Không nới ràng buộc ra —
-- ràng buộc đó đúng, và nới nó ra để một lệnh xoá chạy được là đổi một thứ
-- đúng lấy một thứ tiện.

create or replace function private.lich_go_lieu_trinh()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Gỡ CẢ HAI cột. Khoá ngoại `on delete set null` chỉ với tới được cột
  -- `series_id`, nên nếu để nó tự làm thì `series_index` ở lại và ràng buộc
  -- `appointments_chuoi_du_doi` chặn cả câu xoá.
  update public.appointments
     set series_id = null,
         series_index = null
   where series_id = old.id;
  return old;
end;
$$;

drop trigger if exists appointment_series_go_lien_ket on public.appointment_series;
create trigger appointment_series_go_lien_ket
  before delete on public.appointment_series
  for each row execute function private.lich_go_lieu_trinh();

comment on function private.lich_go_lieu_trinh() is
  'Gỡ cả series_id LẪN series_index trước khi xoá bản ghi liệu trình. Khoá ngoại on-delete-set-null chỉ với tới một cột, và ràng buộc bắt hai cột đi cùng nhau sẽ chặn cả câu xoá — #311.';
