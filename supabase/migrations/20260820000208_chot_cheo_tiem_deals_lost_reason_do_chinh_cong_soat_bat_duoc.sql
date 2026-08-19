-- ============================================================
-- CẠNH THỨ 27 — `deals.lost_reason_id`, do CHÍNH CỔNG SOÁT bắt được
--
-- ═══════════════════════════════════════════════════════════════════
-- CÁCH TÌM RA NÓ MỚI LÀ PHẦN ĐÁNG GHI
-- ═══════════════════════════════════════════════════════════════════
-- Migration #205 vá 26 cạnh của 10 mảng sinh sau đợt rà #136, và đi kèm cổng
-- `scripts/soat-canh-cheo-tiem.mjs`. Lượt chạy ĐẦU TIÊN của cổng đó — trước cả
-- khi kịp cắm vào CI — ĐỎ một cạnh mà cả ba đợt rà trước lẫn đợt #205 đều
-- không thấy: `deals.lost_reason_id → lost_reasons`.
--
-- Vì sao ba đợt trước bỏ sót, ghi rõ để đừng lặp lại:
--   · #136 rà theo DANH SÁCH 63 cạnh dựng bằng tay ⇒ sót thì không ai biết là
--     đã sót; danh sách tay không tự tố cáo chỗ thiếu của nó.
--   · #205 chia phạm vi theo MỐC THỜI GIAN ("10 mảng sinh sau #136") ⇒ cạnh này
--     nằm ở bảng `deals`/`lost_reasons` có từ 03/08, rơi đúng vào vùng
--     "#136 đã xét rồi" mà không ai kiểm lại giả định đó.
--   · Bảng `deals` CÓ trigger `deals_tenant_guard` (từ #136) ⇒ mọi phép đếm
--     theo TÊN trigger đều thấy "bảng này có chốt rồi". Nhưng trigger đó chỉ
--     canh `contact_id`. Cổng đọc THÂN HÀM theo TỪNG CỘT nên nhìn ra ngay.
--
-- Đây đúng là thứ một cổng kiểm phải làm mà một đợt rà thủ công không làm được:
-- nó không có ký ức, không có giả định, và không mệt.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐÃ ĐO, KHÔNG ĐOÁN
-- ═══════════════════════════════════════════════════════════════════
-- Hai tiệm dựng trong MỘT giao dịch, đóng vai `authenticated` bằng
-- `request.jwt.claims`, rollback sạch (20/08):
--
--   BẪY      · deal của tiệm A trỏ `lost_reason_id` sang LÝ DO THUA của tiệm B  => LỌT
--   ĐỐI CHỨNG· cùng thao tác, lý do thua của CHÍNH tiệm A                       => LỌT (đúng)
--
-- Dữ liệu đang có: **0 dòng lệch tiệm** trên cạnh này ⇒ chốt không đụng dòng cũ.
--
-- ═══════════════════════════════════════════════════════════════════
-- HẬU QUẢ — NHẸ, và ghi đúng mức độ chứ không thổi lên
-- ═══════════════════════════════════════════════════════════════════
-- `lost_reasons_report()` là `security invoker` ⇒ RLS vẫn áp lên cả `deals` lẫn
-- `lost_reasons`, nên tên lý do của tiệm B KHÔNG hiện sang tiệm A: hàm `left
-- join` ra `reason_name = NULL`. Tức cạnh này KHÔNG lộ dữ liệu và KHÔNG sai sổ
-- tiền — nó tạo một con trỏ treo, và một dòng "deal thua không rõ lý do" trong
-- báo cáo của CHÍNH tiệm A.
--
-- Vá vì nó cùng LỚP BỆNH, không phải vì nó nguy hiểm. Để một cạnh cùng lớp nằm
-- lại chỉ vì "hậu quả nhẹ" là thứ khiến đợt rà sau phải phân loại lại từ đầu —
-- mà chi phí của một nhánh `if` trong trigger đã có sẵn thì gần bằng không.
--
-- ═══════════════════════════════════════════════════════════════════
-- CÁCH VÁ: MỞ RỘNG trigger cũ, không thêm trigger thứ hai
-- ═══════════════════════════════════════════════════════════════════
-- `deals_tenant_guard` đã tồn tại và đã canh đúng lớp bệnh này cho `contact_id`
-- — thêm một trigger nữa cạnh nó là dựng cơ chế thứ hai cho cùng một luật.
-- Đúng cách #136 đã mở rộng `order_lines_tenant_guard` khi phát hiện nó bỏ sót
-- `order_id`: sửa thân hàm, rồi dựng lại trigger để `lost_reason_id` vào danh
-- sách cột theo dõi (không có bước dựng lại thì sửa cột này KHÔNG kích trigger).
-- ============================================================

create or replace function public.deals_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'deals.contact_id phải cùng tiệm với cơ hội (khách % thuộc tiệm khác)', new.contact_id
        using errcode = '23514';
    end if;
  end if;

  -- MỚI (#208). Bản gốc #136 chỉ canh contact_id.
  if new.lost_reason_id is not null then
    select tenant_id into v_tenant from public.lost_reasons where id = new.lost_reason_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'deals.lost_reason_id phải cùng tiệm với cơ hội (lý do thua % thuộc tiệm khác)', new.lost_reason_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists deals_tenant_guard on public.deals;
create trigger deals_tenant_guard
  before insert or update of contact_id, lost_reason_id, tenant_id
  on public.deals
  for each row execute function public.deals_tenant_guard();

comment on function public.deals_tenant_guard() is
  'Task #149 (#136), MỞ RỘNG ở #208: bản gốc chỉ canh contact_id, bỏ sót lost_reason_id — cạnh này do chính cổng scripts/soat-canh-cheo-tiem.mjs bắt được ở lượt chạy đầu tiên, sau khi ba đợt rà tay (#136/#204/#205) đều bỏ sót vì bảng deals ĐÃ có trigger cùng tên nên mọi phép đếm theo TÊN đều tưởng là đã chốt.';
