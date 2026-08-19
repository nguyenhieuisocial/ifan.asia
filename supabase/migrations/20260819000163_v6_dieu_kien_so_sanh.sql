-- V6 automation (19/08/2026) — mở rộng ĐIỀU KIỆN của quy trình tự động.
--
-- VÌ SAO CẦN: bản cũ của `wf_match_conditions` chỉ so sánh BẰNG (và `exists`).
-- Nghĩa là mọi luật dạng "vượt ngưỡng" đều KHÔNG DIỄN ĐẠT ĐƯỢC: "giảm giá trên
-- 15%", "đơn trên 5 triệu", "quá 3 ngày chưa trả lời"… Đo được khi khảo sát để
-- làm trần giảm giá theo vai (việc #180) — hoá ra chặn không phải ở màn hình mà
-- ở chính engine.
--
-- Giữ TƯƠNG THÍCH NGƯỢC tuyệt đối: giá trị trần (không phải object) vẫn nghĩa là
-- BẰNG, y như cũ. Mọi playbook cài sẵn đang chạy không phải sửa gì.
--
-- Hình dạng điều kiện sau bản này:
--   "stage": "Đàm phán"            → bằng (như cũ)
--   "phone": {"exists": true}      → có/không có (như cũ)
--   "discount_pct": {"gt": 15}     → lớn hơn        ← MỚI
--   "total": {"gte": 5000000}      → lớn hơn hoặc bằng
--   "qty": {"lt": 3} / {"lte": 3}  → nhỏ hơn / nhỏ hơn hoặc bằng
--   "status": {"neq": "cancelled"} → khác
--   "source": {"in": ["zalo","web"]} → thuộc danh sách
--   "note": {"contains": "gấp"}    → có chứa chữ (không phân biệt hoa thường)

create or replace function public.wf_match_conditions(p_cond jsonb, p_event jsonb, p_agg jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  k       text;
  v       jsonb;
  f       jsonb;
  v_want  boolean;
  v_so    numeric;
  v_moc   numeric;
begin
  if p_cond is null or jsonb_typeof(p_cond) <> 'object' then
    return true;
  end if;

  for k, v in select key, value from jsonb_each(p_cond) loop
    f := public.wf_field(k, p_event, p_agg);

    -- Giá trị trần (chuỗi/số/bool) ⇒ so BẰNG. Nhánh này phải đứng ĐẦU để mọi
    -- điều kiện cũ đi đúng đường cũ, không rơi vào nhánh mới nào.
    if jsonb_typeof(v) <> 'object' then
      if f is distinct from v then return false; end if;

    elsif v ? 'exists' then
      v_want := coalesce((v ->> 'exists')::boolean, true);
      if (f is not null and jsonb_typeof(f) <> 'null') <> v_want then return false; end if;

    elsif v ? 'neq' then
      if f is not distinct from (v -> 'neq') then return false; end if;

    elsif v ? 'in' then
      if jsonb_typeof(v -> 'in') <> 'array' then return false; end if;
      if f is null or not (v -> 'in') @> jsonb_build_array(f) then return false; end if;

    elsif v ? 'contains' then
      -- Chỉ áp cho chữ. Trường rỗng hoặc không phải chữ ⇒ KHÔNG khớp (chứ không
      -- phải "khớp mọi thứ") — điều kiện không đo được thì coi như không thoả.
      if f is null or jsonb_typeof(f) <> 'string' then return false; end if;
      if position(lower(v ->> 'contains') in lower(f #>> '{}')) = 0 then return false; end if;

    elsif v ?| array['gt', 'gte', 'lt', 'lte'] then
      -- Trường không phải số thì điều kiện KHÔNG thoả. Cố ý không thử ép kiểu
      -- từ chuỗi: "12abc" ép được thành 12 ở vài cách viết, và một luật tiền bạc
      -- chạy nhầm vì ép kiểu ngầm là thứ không ai truy ra được.
      if f is null or jsonb_typeof(f) <> 'number' then return false; end if;
      v_so := (f #>> '{}')::numeric;

      if v ? 'gt' then
        v_moc := (v ->> 'gt')::numeric;
        if not (v_so > v_moc) then return false; end if;
      end if;
      if v ? 'gte' then
        v_moc := (v ->> 'gte')::numeric;
        if not (v_so >= v_moc) then return false; end if;
      end if;
      if v ? 'lt' then
        v_moc := (v ->> 'lt')::numeric;
        if not (v_so < v_moc) then return false; end if;
      end if;
      if v ? 'lte' then
        v_moc := (v ->> 'lte')::numeric;
        if not (v_so <= v_moc) then return false; end if;
      end if;

    else
      -- Object lạ (gõ sai tên phép so, ví dụ "greater") ⇒ KHÔNG khớp.
      -- Cho qua ở đây là biến một luật gõ sai thành luật chạy với MỌI sự kiện —
      -- nguy hiểm hơn hẳn việc luật đó im lặng không chạy.
      return false;
    end if;
  end loop;

  return true;
end;
$$;
