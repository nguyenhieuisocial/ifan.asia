-- ============================================================================
-- #207 — Vá NỐT các chốt CSDL còn tồn đọng
--
-- Sáu vá độc lập, chung một bệnh: **luật sống ở tầng ứng dụng, CSDL không gác**.
-- Mỗi phần dưới đây đều đã ĐO trên dữ liệu thật trước khi viết; số đo ghi ngay
-- tại chỗ để lần sau đọc lại không phải đoán.
--
-- Thứ tự trong file = thứ tự ưu tiên lúc phát hiện, KHÔNG phải thứ tự phụ thuộc
-- (sáu phần không phụ thuộc nhau).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. bulk_operations — ĐANG HỎNG THẬT: biên nhận không bao giờ đóng được
-- ---------------------------------------------------------------------------
-- Bảng có ĐỦ 4 ràng buộc CHECK của máy trạng thái (#69), nhưng KHÔNG có đường
-- nào để đóng biên nhận: vai `authenticated` không có quyền UPDATE (chi tiết
-- bên dưới) ⇒ câu `.update()` của tầng web hỏng, mà hỏng KHÔNG ồn — nó không
-- được kiểm ⇒ tầng web không thể biết.
--
-- ĐO 20/08 trên dữ liệu thật: 2/2 biên nhận kẹt `status='running'`,
-- `done_count=0`, `finished_at=null` — trong khi việc ĐÃ CHẠY XONG từ 12/08.
--   · `assign_owner` → contact 90c52920 hôm nay ĐANG mang đúng owner đã yêu cầu
--   · `add_tag`      → nhãn "Test hàng loạt" được tạo đúng giây bấm (07:31:01)
--
-- Hệ quả dây chuyền: `runBulk` (app/app/contacts/bulk-actions.ts) khi bị gọi
-- lại cùng `operation_id` (Next.js thử lại server action lúc mạng chập) đọc lại
-- biên nhận, thấy `running`, rồi báo "thao tác thất bại" cho một lượt ĐÃ THÀNH
-- CÔNG.
--
-- ⚠️ NGUYÊN NHÂN GỐC KHÔNG PHẢI "quên policy" — là MỘT MẢNH THIẾT KẾ CHƯA XÂY.
-- #69 (dòng 150-155) nói rõ, và cố ý:
--
--     "Chưa cấp UPDATE cho ai ở migration này: hàm xử lý hàng loạt (task #79,
--      security definer riêng) sẽ là đường DUY NHẤT cập nhật done_count/
--      failed_count/status — 'biên nhận' mất ý nghĩa nếu ai cũng sửa được thẳng."
--
-- Kèm theo đó là `revoke update, delete on public.bulk_operations from
-- authenticated` (#69:155). ĐO 20/08: vai `authenticated` hôm nay có
-- INSERT/SELECT nhưng KHÔNG có UPDATE ở tầng GRANT.
--
-- Nghĩa là: thêm một policy UPDATE **cũng không chữa được** — câu lệnh sẽ chết
-- ở tầng GRANT trước khi RLS kịp xét. Và cấp thẳng GRANT UPDATE thì đúng là
-- phá điều #69 vừa từ chối: biên nhận mà người dùng sửa thẳng được thì không
-- còn là biên nhận.
--
-- Task #79 xây phần TS nhưng KHÔNG xây cái hàm ấy — `runBulk` gọi `.update()`
-- thẳng. Migration này xây NỐT mảnh còn thiếu, đúng như #69 đã định:
-- một hàm SECURITY DEFINER là đường DUY NHẤT đóng biên nhận, và nó tự kiểm
--   ① đúng tiệm + đúng người đã mở lượt (khớp policy INSERT)
--   ② chỉ đóng lượt đang 'running' — đóng hai lần bị từ chối, không ghi đè
--   ③ các con số phải CỘNG ĐÚNG bằng `total`, và `failures` phải khớp
--      `failed_count` — chính là 4 ràng buộc CHECK của #69, kiểm TRƯỚC khi ghi
--      để trả về câu lỗi đọc được thay vì để CHECK ném lỗi kỹ thuật
--   ④ `finished_at` do MÁY CHỦ đóng dấu (now()), người gọi không truyền vào
-- Vẫn KHÔNG cấp GRANT UPDATE cho `authenticated` — đường thẳng vẫn khoá.
create or replace function public.bulk_operation_close(
  p_id       uuid,
  p_done     integer,
  p_failed   integer,
  p_failures jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.bulk_operations;
begin
  select * into v_row
    from public.bulk_operations
   where id = p_id
     and tenant_id = (select public.current_tenant_id())
     and actor_id  = (select auth.uid())
   for update;
  -- Không thấy / không phải tiệm mình / không phải lượt mình: CÙNG một câu lỗi,
  -- không rò "biên nhận này có thật hay không".
  if not found then
    raise exception 'bulk_operation_not_found: không tìm thấy biên nhận % của bạn trong tiệm đang mở', p_id
      using errcode = '23514';
  end if;

  if v_row.status <> 'running' then
    raise exception 'bulk_operation_already_closed: biên nhận % đã đóng lúc % — không đóng lại lần hai',
      p_id, v_row.finished_at
      using errcode = '23514';
  end if;

  if p_done < 0 or p_failed < 0 or (p_done + p_failed) <> v_row.total then
    raise exception 'bulk_operation_count_mismatch: biên nhận % có % việc, mà báo về xong % + hỏng %',
      p_id, v_row.total, p_done, p_failed
      using errcode = '23514';
  end if;

  if coalesce(jsonb_array_length(p_failures), 0) <> p_failed then
    raise exception 'bulk_operation_failures_mismatch: báo % việc hỏng nhưng danh sách lý do có % dòng',
      p_failed, coalesce(jsonb_array_length(p_failures), 0)
      using errcode = '23514';
  end if;

  update public.bulk_operations
     set status       = 'done',   -- giữ nguyên nghĩa cũ của tầng web: đóng lượt
         done_count   = p_done,
         failed_count = p_failed,
         failures     = p_failures,
         finished_at  = now()     -- máy chủ đóng dấu, không nhận từ người gọi
   where id = p_id;
end $$;

revoke execute on function public.bulk_operation_close(uuid, integer, integer, jsonb) from public, anon;
grant  execute on function public.bulk_operation_close(uuid, integer, integer, jsonb) to authenticated;

-- KHÔNG dọn 2 dòng kẹt — đã cân nhắc và CỐ Ý bỏ qua:
--   ① Không dựng lại được sự thật. 4 ràng buộc CHECK buộc `status='done'` phải
--      kèm `done_count + failed_count = total`; mà trạng thái HÔM NAY không
--      chứng minh được chuyện NGÀY 12/08 — nhãn "Test hàng loạt" đã bị xoá mềm
--      lúc 07:32 (một phút sau), contact thì bị chạm lại ngày 18/08. Ghi một
--      con số không đo được vào BIÊN NHẬN là đúng thứ mà biên nhận sinh ra để
--      chống.
--   ② Không còn cắn được nữa. `operation_id` là `crypto.randomUUID()` sinh MỚI
--      mỗi lần bấm (contacts/bulk-selection-bar.tsx:27) ⇒ hai dòng cũ không thể
--      trùng khoá với bất kỳ lượt nào về sau. Để lại chỉ là vết sẹo đúng sự
--      thật: "biên nhận này chưa từng được đóng".
-- Chủ tiệm muốn sổ sạch thì đóng tay từng dòng — đó là quyết định của người có
-- mặt hôm 12/08, không phải của migration này.


-- ---------------------------------------------------------------------------
-- 2. attachments — cùng bệnh, chưa cắn ai (bảng đang 0 dòng)
-- ---------------------------------------------------------------------------
-- Có INSERT + SELECT + DELETE, thiếu UPDATE. Hai chỗ gãy ngay lần đầu có người
-- tải logo (app/app/settings/industry/actions.ts):
--   · `removeTenantLogo` (:93) báo "Đã gỡ logo" nhưng logo VẪN NGUYÊN
--   · `uploadTenantLogo` (:63) xoá mềm bản cũ khớp 0 dòng ⇒ luật "chỉ 1 logo
--     active" vỡ, bản ghi cũ tích lại vô hạn
--
-- CHỌN: thêm chính sách UPDATE. KHÔNG đổi sang `.delete()` (đã có sẵn policy).
-- VÌ SAO — ba lý do, xếp theo sức nặng:
--   ① **Bất biến 11 của dự án là "xoá mềm + thùng rác 30 ngày", không xoá
--      cứng** (docs/adr/0019-v3-tien-that.md:6, 0009-v2-lich-hen.md:126). Đổi
--      sang xoá cứng là chọc thủng một bất biến toàn dự án để né một policy
--      thiếu — chữa triệu chứng, tạo ngoại lệ.
--   ② **Đính kèm là FILE.** Xoá cứng bản ghi thì object trên `tenant-files`
--      thành mồ côi: không còn ai trỏ tới, không ai dọn, vẫn tính dung lượng.
--      Chính comment của `uploadTenantLogo` đã chốt "File thật của bản cũ KHÔNG
--      xoá (bất biến 11)" — bản ghi là thứ DUY NHẤT còn nối tới file đó.
--   ③ ADR-0019 mục 197 ghi lại đúng cái giá của việc xoá cứng: 3 sự kiện
--      `appointment.booked` mồ côi vì dữ liệu bị `delete` thẳng ⇒ báo cáo rơi
--      mất dòng TRONG IM LẶNG. Không lặp lại vết đó cho file.
--
-- Điều kiện khớp ĐÚNG policy INSERT/DELETE sẵn có: cùng tiệm và không phải vai
-- Chỉ xem.
create policy attachments_update on public.attachments
  for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );


-- ---------------------------------------------------------------------------
-- 3. orders — máy trạng thái: CSDL không gác gì
-- ---------------------------------------------------------------------------
-- ĐO 20/08 (giao dịch rồi rollback): `cancelled → confirmed → completed` qua
-- PostgREST **LỌT**, sinh 1 khoản hoa hồng 20.000đ + 3 dòng kho (trừ 6 đơn vị
-- tồn THẬT). Hạ đơn đã xong về `draft` rồi xoá dòng hàng cũng lọt — vì hạ
-- trạng thái mở đúng khoá `order_lines_lock_guard` (khoá này chỉ nhìn trạng
-- thái HIỆN TẠI, nên ai đổi được trạng thái thì mở được khoá).
--
-- BẢNG CHUYỂN — đọc thẳng từ app/app/orders/actions.ts, KHÔNG đoán. Cả ba
-- đường ghi trạng thái của tầng web đều đi qua đúng một hàm `transition(...)`
-- (:203-225) với danh sách trạng thái nguồn tường minh:
--
--     draft ──────► confirmed ──────► completed   (điểm cuối)
--       │               │
--       └───────┬───────┘
--               ▼
--           cancelled                             (điểm cuối)
--
--   | Từ        | Sang               | Nơi chốt ở tầng web                  |
--   |-----------|--------------------|--------------------------------------|
--   | draft     | confirmed          | actions.ts:240  transition(…,['draft'])
--   | draft     | cancelled          | actions.ts:280  ['draft','confirmed']
--   | confirmed | completed          | actions.ts:255  transition(…,['confirmed'])
--   | confirmed | cancelled          | actions.ts:280  ['draft','confirmed']
--   | completed | (không đi đâu)     | không hàm nào nhận 'completed' làm nguồn
--   | cancelled | (không đi đâu)     | không hàm nào nhận 'cancelled' làm nguồn
--
-- Bảng này ĐỒNG NHẤT cho cả `kind='order'` và `kind='return'`: phiếu hoàn là
-- một dòng `orders` mới, cũng bắt đầu ở `draft` và đi đúng đường trên (các nút
-- ở order-detail-view.tsx:1040/1045/1053 chỉ gác theo `status`, không gác
-- `kind`).
--
-- ⚠️ GHI LẠI ĐỂ NGƯỜI SAU QUYẾT, không tự quyết ở đây: trigger
-- `orders_sinh_dong_kho` (#150:162) CÓ SẴN một nhánh cho `completed →
-- cancelled` ("huỷ đơn đã chốt ⇒ trả lại đúng phần đã trừ"). Màn Đơn hàng
-- KHÔNG sinh ra được phép chuyển đó, nên nhánh ấy đang là mã chết — và sau
-- migration này nó thành mã chết VĨNH VIỄN. Chốt theo đúng bảng của màn hình
-- (yêu cầu của việc), không nới thêm một phép chuyển mà giao diện không có
-- đường bấm. Muốn mở `completed → cancelled` thì phần trả kho đã viết sẵn — chỉ
-- cần thêm một dòng vào bảng trên VÀ một nút ở màn hình, cùng lúc.
create or replace function public.orders_status_transition_guard() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  -- Ghi lại đúng trạng thái cũ (câu UPDATE có nhắc tên cột status nhưng không
  -- đổi giá trị) ⇒ không phải phép chuyển, cho qua.
  if new.status is not distinct from old.status then return new; end if;

  if old.status = 'draft'     and new.status in ('confirmed', 'cancelled') then return new; end if;
  if old.status = 'confirmed' and new.status in ('completed', 'cancelled') then return new; end if;

  raise exception
    'order_status_transition: đơn % đang "%" thì không chuyển sang "%" được. Đường hợp lệ: draft→confirmed→completed, và draft/confirmed→cancelled; completed và cancelled là điểm cuối — sửa sai thì lập phiếu mới, không lùi đơn cũ.',
    new.id, old.status, new.status
    using errcode = '23514';
end $$;

create trigger orders_status_transition_guard
  before update of status on public.orders
  for each row execute function public.orders_status_transition_guard();


-- ---------------------------------------------------------------------------
-- 4. appointments — tầng ứng dụng đã vá, CSDL vẫn trống
-- ---------------------------------------------------------------------------
-- Ba hàm ở app/app/calendar/actions.ts đã lọc trạng thái NGAY TRONG câu UPDATE.
-- Nhưng CSDL chỉ có CHECK giá trị hợp lệ; 5 trigger sẵn có trên `appointments`
-- (emit_events · item_kind_guard · reset_reminder · tenant_guard · touch)
-- KHÔNG cái nào gác phép chuyển ⇒ mọi đường ghi KHÁC màn Lịch (SQL tay,
-- Management API, script seed, một action mới viết sau quên chép bộ lọc) vẫn
-- lùi được ca đã xong.
--
-- BẢNG CHUYỂN — đọc từ calendar/actions.ts + calendar/types.ts:
--   EDITABLE_STATUSES   = booked, arrived   (types.ts:25)
--   ARRIVABLE_STATUSES  = booked            (types.ts:35) → arrived, no_show
--   COMPLETABLE_STATUSES= arrived           (types.ts:44) → done
--   huỷ: từ EDITABLE_STATUSES               (actions.ts:367)
--
--     booked ──► arrived ──► done        (điểm cuối)
--       │  │        │
--       │  │        └──────► cancelled   (điểm cuối)
--       │  └───────────────► no_show     (điểm cuối)
--       └──────────────────► cancelled
--
-- Thêm một chốt nữa mà tầng web đã có còn CSDL thì chưa: ca đã vào thùng rác
-- (`deleted_at is not null`) thì không đổi trạng thái được — `updateStatus`
-- lọc `.is("deleted_at", null)` (actions.ts:329), CSDL phải nói cùng câu.
create or replace function public.appointments_status_transition_guard() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  -- Đặt TRƯỚC bảng chuyển: ca trong thùng rác thì không có phép chuyển nào
  -- hợp lệ, kể cả phép chuyển đúng luật.
  if old.deleted_at is not null then
    raise exception
      'appointment_in_trash: ca hẹn % đang ở thùng rác — khôi phục trước rồi mới đổi trạng thái.',
      new.id
      using errcode = '23514';
  end if;

  if old.status = 'booked'  and new.status in ('arrived', 'no_show', 'cancelled') then return new; end if;
  if old.status = 'arrived' and new.status in ('done', 'cancelled') then return new; end if;

  raise exception
    'appointment_status_transition: ca hẹn % đang "%" thì không chuyển sang "%" được. Đường hợp lệ: booked→arrived/no_show/cancelled, arrived→done/cancelled; done, no_show, cancelled là điểm cuối.',
    new.id, old.status, new.status
    using errcode = '23514';
end $$;

create trigger appointments_status_transition_guard
  before update of status on public.appointments
  for each row execute function public.appointments_status_transition_guard();


-- ---------------------------------------------------------------------------
-- 5. stocktakes — bảng cha không khoá trạng thái
-- ---------------------------------------------------------------------------
-- ĐO 20/08: `da_chot → da_huy` LỌT mà dòng kho đã sinh VẪN CÒN (màn hình báo
-- đã huỷ, kho thì đã bị điều chỉnh rồi — hai bên nói hai chuyện khác nhau);
-- `da_huy → da_chot` LỌT và SINH dòng kho cho một phiên đã huỷ.
-- `stocktake_lines_lock_guard` khoá DÒNG khi phiên ở `da_chot`/`da_huy`, nhưng
-- không ai khoá BẢNG CHA.
--
-- Luật: rời `dang_dem` đúng MỘT LẦN, không quay lại.
--
--     dang_dem ──► da_chot   (điểm cuối)
--        └───────► da_huy    (điểm cuối)
--
-- Trigger này chạy BEFORE, còn `stocktakes_sinh_dong_kho` chạy AFTER ⇒ phép
-- chuyển sai bị chặn TRƯỚC khi kịp sinh dòng kho.
create or replace function public.stocktakes_status_transition_guard() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if old.status = 'dang_dem' and new.status in ('da_chot', 'da_huy') then return new; end if;

  raise exception
    'stocktake_status_transition: phiên kiểm kê % đang "%" thì không chuyển sang "%" được. Phiên chỉ rời "dang_dem" đúng một lần (sang da_chot hoặc da_huy) và không quay lại — sửa thì mở phiên mới.',
    new.id, old.status, new.status
    using errcode = '23514';
end $$;

create trigger stocktakes_status_transition_guard
  before update of status on public.stocktakes
  for each row execute function public.stocktakes_status_transition_guard();


-- ---------------------------------------------------------------------------
-- 6. Ba hàm chép tay công thức giá trị dòng
-- ---------------------------------------------------------------------------
-- `order_lines.line_total_vnd` là cột SINH:
--     round(sign(qty) * (abs(qty) * unit_price_vnd - discount_vnd))::bigint
-- Chú ý dấu: khoản giảm nằm TRONG ngoặc, nên nó cũng bị đảo dấu theo qty.
--
-- Ba hàm dưới đây tự nhân lại `qty * unit_price_vnd - discount_vnd` — công thức
-- này KHÁC cột sinh khi qty ÂM (tức là ở PHIẾU HOÀN):
--
--   ĐO 20/08, dòng hoàn qty=-2, đơn giá 1.000.000, giảm 400.000:
--     cột sinh  = -1.600.000
--     chép tay  = -2.400.000
--     lệch      =   -800.000  = ĐÚNG HAI LẦN khoản giảm
--
-- Hôm nay 87/87 đơn khớp chỉ vì 0/170 dòng có giảm giá. Nhưng `createReturn`
-- chép giảm giá theo tỷ lệ sang dòng hoàn ⇒ phiếu hoàn ĐẦU TIÊN của một dòng có
-- giảm giá sẽ lệch. Cùng lớp lỗi #198 đã vá nơi khác, ba chỗ này bị bỏ sót.
--
-- ⚠️ CHỈ CÒN 6c Ở ĐÂY — 6a và 6b ĐÃ CÓ NGƯỜI VÁ, GIỮA CHỪNG việc này:
--   `order_payments_guard` và `campaign_tong_ket` được **migration #206**
--   ("va_bon_lo_tien_do_duoc_tren_du_lieu_that") sửa và ÁP lên CSDL trong lúc
--   #207 đang viết — lúc bắt đầu soát, cả hai còn công thức chép tay.
--
--   Đã ĐỐI CHIẾU từng dòng bản #207 định ghi với bản #206 đang chạy: **giống
--   hệt, chỉ khác đúng dòng chú thích**. Nên hai phần đó bị GỠ khỏi file này.
--   Không phải vì thừa — mà vì để lại thì cùng một hàm có HAI migration cùng
--   khai; #207 chép ảnh chụp hôm nay, nên nếu nhánh #206 còn sửa tiếp hàm đó
--   trước khi #207 được áp thì #207 sẽ LẶNG LẼ NUỐT bản mới hơn của họ.
--   Hàm nào một chủ — đó là 6a/6b thuộc về #206.
--
--   6c dưới đây #206 KHÔNG đụng tới, và nó là phần duy nhất còn lại.

-- 6c. order_lines_discount_cap_guard — trần tự-giảm-giá theo vai.
--
-- ⚠️ HÀM NÀY **KHÔNG THỂ** ĐỌC CỘT SINH — đã ĐO, không phải phỏng đoán:
--   PostgreSQL tính cột SINH **SAU KHI** các trigger BEFORE chạy xong. Đo 20/08
--   bằng một trigger BEFORE INSERT tạm trên chính `order_lines`: nó đọc
--   `new.line_total_vnd` ra **NULL**, trong khi dòng ghi xong có giá trị
--   1.600.000. Đây là trigger BEFORE dùng `NEW` ⇒ cột sinh chưa tồn tại.
--
-- Và kể cả đọc được thì cũng KHÔNG NÊN dùng: `v_goc` là mẫu số để tính TỶ LỆ
-- giảm, tức tiền hàng TRƯỚC giảm; còn `line_total_vnd` là tiền SAU giảm. Thay
-- mẫu số bằng số sau giảm sẽ thổi phồng tỷ lệ và đổi nghĩa cái trần.
--
-- Cái SAI thật ở đây là DẤU, và nó cùng gốc với 6a/6b: `new.qty *
-- new.unit_price_vnd` ra số ÂM với dòng phiếu hoàn, rơi vào nhánh "dòng 0đ" và
-- báo một câu lỗi vô nghĩa. Hôm nay chưa cắn được vì hai lớp đỡ: phiếu hoàn đã
-- thoát sớm ở chốt ④, và `order_lines_sign_guard` (#127:358) ép qty dương cho
-- `kind='order'`. Vá bằng `abs()` — ĐÚNG cách cột sinh lấy độ lớn — để mẫu số
-- không phụ thuộc vào hai lớp đỡ đó còn đứng hay không.
create or replace function public.order_lines_discount_cap_guard() returns trigger
language plpgsql
set search_path = public, pg_temp as $$
declare
  v_role text;
  v_kind text;
  v_goc  numeric;
  v_pct  numeric(6,2);
  v_tran smallint;
  v_cap  public.discount_caps;
begin
  -- Không giảm giá thì không có gì để kiểm.
  if new.discount_vnd is null or new.discount_vnd = 0 then return new; end if;

  -- Sửa mà không đụng tới cả ba cột hợp thành tỷ lệ ⇒ bỏ qua. Giữ cho dòng cũ
  -- (ghi trước khi có trigger này) không bỗng dưng không sửa nổi vì lý do khác.
  if tg_op = 'UPDATE'
     and new.discount_vnd  = old.discount_vnd
     and new.qty           = old.qty
     and new.unit_price_vnd = old.unit_price_vnd then
    return new;
  end if;

  -- ② Ghi đến từ một hàm SECURITY DEFINER của hệ (hoặc từ chính kết nối quản
  --   trị/migration): `current_user` là chủ sở hữu bảng. Hàm đó tự kiểm luật.
  if current_user = (
    select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.order_lines'::regclass
  ) then
    return new;
  end if;

  v_role := (select public.app_role());
  -- ① Không có vai (nền/seed/quản trị) hoặc chủ tiệm (không trần) hoặc vai
  --   không nằm trong bảng trần (`viewer` đã bị RLS chặn ghi từ trước) ⇒ không chặn.
  if v_role is null or v_role not in ('staff', 'manager', 'admin') then return new; end if;

  -- ④ Đơn hoàn/trả hàng.
  select o.kind into v_kind from public.orders o where o.id = new.order_id;
  if v_kind = 'return' then return new; end if;

  select * into v_cap from public.discount_caps where tenant_id = new.tenant_id;
  -- Tiệm chưa có dòng cấu hình ⇒ dùng ĐÚNG mặc định của bảng (#165), không nới.
  v_tran := case v_role
              when 'staff'   then coalesce(v_cap.staff_max_pct, 5)
              when 'manager' then coalesce(v_cap.manager_max_pct, 15)
              else                coalesce(v_cap.admin_max_pct, 100)
            end;

  -- abs() — lấy độ lớn ĐÚNG cách cột sinh line_total_vnd lấy (xem chú thích 6c).
  v_goc := abs(new.qty) * new.unit_price_vnd;
  if v_goc > 0 then
    v_pct := round(new.discount_vnd * 100.0 / v_goc, 2);
    if v_pct <= v_tran then return new; end if;
  else
    -- Dòng 0đ (hoặc âm ngoài đường hoàn) mà vẫn trừ tiền: tỷ lệ không tính
    -- được, và đây là tiền cho không. Chặn — `discount_request` cũng từ chối ca
    -- này (`line_total_zero`), nên hai tầng nói cùng một câu.
    v_pct := null;
  end if;

  -- ③ Đã có phiếu duyệt khớp đúng số tiền cho đúng dòng này.
  if exists (
    select 1 from public.discount_approvals a
     where a.order_line_id = new.id
       and a.status        = 'approved'
       and a.discount_vnd  = new.discount_vnd
  ) then
    return new;
  end if;

  raise exception
    'discount_cap_exceeded: vai "%" chỉ được tự giảm tới % phần trăm, mà dòng này giảm % đ trên % đ (%). Gọi public.discount_request(order_line_id, discount_vnd, lý_do) để xin duyệt — không ghi thẳng discount_vnd.',
    v_role, v_tran, new.discount_vnd, v_goc, coalesce(v_pct::text || ' phần trăm', 'dòng 0đ')
    using errcode = '23514';
end $$;
