-- BỐN CHỐT CHẶN Ở TẦNG CSDL — chỗ giao diện gác mà máy chủ bỏ trống.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐƯỜNG TẤN CÔNG LÀ THẬT, KHÔNG PHẢI GIẢ ĐỊNH
-- ═══════════════════════════════════════════════════════════════════
-- Vai `authenticated` có đủ SELECT/INSERT/UPDATE/DELETE qua PostgREST trên mọi
-- bảng dưới đây. Khoá anon nằm công khai trong mã trình duyệt, thẻ đăng nhập
-- nằm trong trình duyệt của chính nhân viên ⇒ mọi phép đo dưới đây gọi được từ
-- trình duyệt của MỘT NGƯỜI ĐANG ĐĂNG NHẬP, không cần công cụ gì đặc biệt.
-- (Đối chứng đã đo: người CHƯA đăng nhập vẫn bị RLS chặn sạch.)
--
-- Ba lỗ đầu có chung một hình dạng: **giao diện gác, máy chủ không gác.** Giao
-- diện là lớp trang trí — ai gọi thẳng API thì nó không tồn tại. Lỗ thứ tư nặng
-- hơn hẳn: nó không phải sai quyền TRONG một tiệm mà là **một tiệm đụng vào dữ
-- liệu của tiệm khác.**
--
-- Đo trước khi vá (một giao dịch rồi rollback, mỗi khẳng định một SAVEPOINT
-- riêng, đóng vai bằng `request.jwt.claims` như `scripts/rls-smoke.mjs`):
-- **33 phép, 27 LỌT / 6 CHẶN**. Sáu phép CHẶN là ĐỐI CHỨNG — chúng chứng minh
-- bộ đo phát hiện được chốt chặn thật, nên 27 phép LỌT kia không phải do đo
-- hỏng.
--
-- Dữ liệu đang có, TỰ ĐO LẠI chứ không chép theo hồ sơ (20/08):
--   leave_requests                    0 dòng
--   contracts / contract_sessions     0 / 0 dòng · sổ buổi lệch 0
--   order_payments                    84 dòng — 83 gắn đơn `completed`,
--                                     1 gắn `confirmed`, **0 gắn đơn đã huỷ**
--   orders có `deleted_at`            0 dòng
-- ⇒ Không ràng buộc mới nào đụng phải dòng cũ vi phạm. Vá bây giờ là chặn
--    trước, không phải dọn hậu quả.

-- ═══════════════════════════════════════════════════════════════════
-- LỖ 1 — NHÂN VIÊN TỰ DUYỆT ĐƠN NGHỈ PHÉP
-- ═══════════════════════════════════════════════════════════════════
-- Policy `leave_self_insert` (migration #166) chỉ kiểm `employee_id` là của
-- chính mình. Nó KHÔNG kiểm `status` và `decided_by` — mà bảng lại cho phép ghi
-- thẳng hai cột đó lúc INSERT.
--
-- Đo thật, đóng vai `staff` (vai THẤP NHẤT):
--
--   INSERT đơn nghỉ status='approved', decided_by = CHÍNH MÌNH   => LỌT
--     (đơn vào sổ với status = approved, không ai gật)
--   ĐỐI CHỨNG · staff SỬA đơn của mình thành 'approved'          => CHẶN (0 dòng)
--
-- Hai dòng đó cạnh nhau là toàn bộ câu chuyện: **chốt chặn canh cửa UPDATE mà
-- quên cửa INSERT.** Người viết #166 nghĩ đúng một nửa — nghĩ rằng đơn luôn
-- SINH RA ở trạng thái chờ rồi mới được ai đó gật. Nhưng "sinh ra ở trạng thái
-- chờ" chỉ là MẶC ĐỊNH CỦA CỘT, mà mặc định thì client ghi đè được.
--
-- Cùng lỗ, đóng vai `manager`:
--   INSERT thẳng đơn nghỉ của MÌNH đã 'approved'                        => LỌT
--   SỬA đơn nghỉ CỦA CHÍNH MÌNH pending → approved                      => LỌT
--   giả mạo người duyệt (decided_by = chủ tiệm) khi duyệt đơn người khác => LỌT
--
-- Ca "quản lý tự duyệt đơn của chính mình" **không tầng nào giữ, kể cả giao
-- diện** — nút Duyệt vẫn hiện trên đơn của chính họ. Và nó trái CHUẨN CỦA CHÍNH
-- KHO NÀY: `discount_decide` đã cấm tự duyệt từ trước, kèm nguyên văn lý do
-- *"Không có dòng này thì trần theo vai chỉ là một nút bấm thêm: nhân viên xin
-- rồi tự gật, y như không có trần."* Câu đó đúng nguyên vẹn cho đơn nghỉ phép.

-- ─── 1a. Cửa INSERT: đơn chỉ được SINH RA ở trạng thái chờ ───
--
-- Ràng buộc bảng `leave_da_quyet` đã bắt status/decided_by/decided_at phải nhất
-- quán với nhau, nhưng nó KHÔNG cấm sinh ra một đơn đã-duyệt-sẵn nhất quán.
-- Chỗ phải chặn là quyền GHI, tức policy.

drop policy leave_self_insert on public.leave_requests;

create policy leave_self_insert on public.leave_requests for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and employee_id in (
      select id from public.employees where user_id = (select auth.uid())
    )
    -- BA DÒNG MỚI. Nộp đơn là XIN, không phải QUYẾT: đơn chỉ được sinh ra ở
    -- trạng thái chờ, chưa có người quyết và chưa có mốc quyết. Muốn đổi sang
    -- approved/rejected thì bắt buộc phải đi qua cửa UPDATE, nơi `leave_decide`
    -- chặn theo vai và `leave_khong_tu_quyet` (dưới đây) chặn tự duyệt.
    and status = 'pending'
    and decided_by is null
    and decided_at is null
  );

comment on policy leave_self_insert on public.leave_requests is
  'Nhân viên tự nộp đơn nghỉ CHO CHÍNH MÌNH, và chỉ ở trạng thái chờ. Ba điều kiện status/decided_by/decided_at thêm ở #204: bản #166 chỉ kiểm employee_id nên `staff` INSERT thẳng đơn approved + decided_by=chính mình là LỌT (đo 20/08), trong khi cửa UPDATE thì đã chặn — canh một cửa, quên cửa kia.';

-- ─── 1b. Cửa UPDATE: không ai được tự quyết đơn của chính mình ───
--
-- VÌ SAO DÙNG TRIGGER, KHÔNG NHÉT THÊM ĐIỀU KIỆN VÀO POLICY `leave_decide`:
-- policy lọc dòng thì kết quả là "0 dòng bị sửa" — KHÔNG có lỗi. Mà
-- `quyetDonNghi` (`app/app/team/actions.ts`) chỉ đọc `error`, nên quản lý bấm
-- Duyệt trên đơn của chính mình sẽ thấy **báo thành công trong khi không có gì
-- xảy ra**. Đó đúng là loại "sai trong im lặng" mà kho này đã trả giá nhiều
-- lần. Trigger ném lỗi thật thì người dùng nhận được câu trả lời.
--
-- Cùng lý lẽ với `discount_decide`, chỉ khác chỗ đặt: ở đó việc quyết đi qua
-- một hàm RPC nên chặn được ngay trong thân hàm; ở đây việc quyết là một UPDATE
-- thẳng qua PostgREST nên chỗ duy nhất chặn được là trigger.

create or replace function public.leave_khong_tu_quyet() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tu_minh boolean;
begin
  -- Chỉ xét khi lượt sửa này ĐỤNG tới việc quyết. Sửa ghi chú, sửa ngày… không
  -- liên quan thì đi tiếp, đừng cản đường không cần thiết.
  if new.status is not distinct from old.status
     and new.decided_by is not distinct from old.decided_by then
    return new;
  end if;

  -- Không có người đăng nhập (service role / script quản trị / seed) thì không
  -- có "chính mình" để mà xét. Bỏ qua — `discount_decide` cũng chỉ so với
  -- `auth.uid()`, và các script seed của kho chạy bằng quyền postgres.
  if auth.uid() is null then
    return new;
  end if;

  -- Xét CẢ dòng cũ lẫn dòng mới: nếu chỉ xét `new.employee_id` thì còn đường
  -- vòng "đổi chủ đơn sang mình rồi mới gật". Hai id, một truy vấn, hết cửa.
  select bool_or(user_id = (select auth.uid()))
    into v_tu_minh
    from public.employees
   where id in (new.employee_id, old.employee_id);

  if coalesce(v_tu_minh, false) then
    raise exception 'leave_self_decide: không được tự quyết đơn nghỉ của chính mình'
      using errcode = '23514';
  end if;

  -- Sổ phải ghi ĐÚNG người đã bấm. Không có dòng này thì chốt trên vẫn đứng,
  -- nhưng bằng chứng "ai duyệt" lại giả mạo được (đo: quản lý ghi decided_by =
  -- chủ tiệm, LỌT) — mà bằng chứng giả thì về sau không ai kiểm lại được nữa.
  if new.status <> 'pending' and new.decided_by is distinct from (select auth.uid()) then
    raise exception 'leave_decider_mismatch: người duyệt phải là chính người đang đăng nhập'
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger leave_khong_tu_quyet
  before update on public.leave_requests
  for each row execute function public.leave_khong_tu_quyet();

comment on function public.leave_khong_tu_quyet() is
  'Cấm tự quyết đơn nghỉ của chính mình + cấm giả mạo người duyệt. Cùng nguyên tắc `discount_decide` đã áp cho phiếu giảm giá (#204). Ném lỗi thay vì lọc dòng ở policy vì lọc dòng cho ra "0 dòng, không lỗi" = màn hình báo thành công trong khi không có gì xảy ra.';

-- ═══════════════════════════════════════════════════════════════════
-- LỖ 2 — HỢP ĐỒNG: HẾT HẠN VẪN TRỪ BUỔI, VAI CHỈ-XEM TRỪ VÀ XOÁ ĐƯỢC BUỔI
-- ═══════════════════════════════════════════════════════════════════

-- ─── 2a. Trigger quên nhánh `expires_at` ───
--
-- `contract_sessions_cap` (#154) kiểm đã-huỷ, đã-xong, hết-buổi — nhưng không
-- kiểm hạn dùng, dù cột `expires_at` khai ngay trong cùng migration.
--
--   trừ buổi của hợp đồng HẾT HẠN HÔM QUA        => LỌT (sessions_used = 1)
--   ĐỐI CHỨNG · hợp đồng ĐÃ HUỶ                  => CHẶN (contract_cancelled)
--   ĐỐI CHỨNG · hợp đồng ĐÃ HẾT BUỔI 5/5         => CHẶN (contract_full)
--
-- Hai dòng ĐỐI CHỨNG chứng minh trigger CÓ chạy thật — nên "lọt" ở dòng đầu là
-- thiếu luật, không phải trigger không nổ.
--
-- ⚠️ NGÀY LẤY THEO GIỜ VN, KHÔNG DÙNG `current_date`. Migration #203 đã đo và
-- kết luận: yêu cầu PostgREST thật CHẠY Ở UTC (không có `TimeZone` nào đặt cho
-- `authenticated`, không có `db_pre_request`). Từ 00:00 đến 06:59 giờ VN, ngày
-- UTC vẫn là HÔM QUA — dùng `current_date` thì hợp đồng vừa hết hạn tối qua vẫn
-- trừ được buổi suốt bảy tiếng sáng hôm sau, mỗi ngày, âm thầm. Đúng lúc chạy
-- phép đo này hai cách đã cho hai ngày khác nhau (VN 2026-08-19 · UTC
-- 2026-08-18) — tức lỗ này KHÔNG phải lo xa.
--
-- Hết hạn tính là `expires_at < hôm_nay_VN`, tức **ngày ghi trên hợp đồng vẫn
-- dùng được trọn ngày** (khách cầm hợp đồng ghi "đến 20/08" thì ngày 20/08 vẫn
-- vào được). Hai đối chứng cho ranh giới này đã đo và phải tiếp tục LỌT: hợp
-- đồng vô thời hạn (`expires_at` null) và hợp đồng hết hạn ĐÚNG HÔM NAY.
--
-- ⚠️ Còn một việc KHÔNG làm được ở migration này: `app/app/contracts/actions.ts`
-- ánh xạ `contract_cancelled` / `contract_full` sang câu tiếng Việt riêng, còn
-- mã mới `contract_expired` sẽ rơi vào rổ chung "dữ liệu không hợp lệ". Chặn thì
-- đã chặn đúng, chỉ là câu giải thích chưa tới — phải thêm một dòng vào `loiGhi`
-- và một khoá `contracts.errors.contract_expired`. Đợt này CẤM đụng thư mục đó
-- (phiên khác đang sửa), nên ghi lại đây thay vì im lặng.

create or replace function public.contract_sessions_cap() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_used int;
  v_total int;
  v_status text;
  v_expires date;
begin
  -- `and tenant_id = new.tenant_id` là DÒNG MỚI, và nó không thừa: không có nó
  -- thì một dòng buổi trỏ sang hợp đồng TIỆM KHÁC (lỗ 4 bên dưới) sẽ bị chặn
  -- bằng câu "hợp đồng đã huỷ" / "đã dùng hết buổi" — tức là **rò trạng thái dữ
  -- liệu của tiệm khác qua câu báo lỗi**. Lọc tiệm ở đây thì không tìm thấy gì,
  -- không nói gì, và `contract_sessions_tenant_guard` mới là chỗ ném lỗi đúng.
  select sessions_used, sessions_total, status, expires_at
    into v_used, v_total, v_status, v_expires
    from public.contracts
   where id = new.contract_id and tenant_id = new.tenant_id;

  if v_status = 'cancelled' then
    raise exception 'contract_cancelled: hợp đồng đã huỷ'
      using errcode = '23514';
  end if;

  -- NHÁNH MỚI (#204). `expires_at` null = vô thời hạn, đúng như #154 khai.
  if v_expires is not null
     and v_expires < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'contract_expired: hợp đồng đã hết hạn ngày %', v_expires
      using errcode = '23514';
  end if;

  if v_status = 'completed' or v_used >= v_total then
    raise exception 'contract_full: hợp đồng đã dùng hết buổi'
      using errcode = '23514';
  end if;

  return new;
end $$;

comment on function public.contract_sessions_cap() is
  'Chốt chặn trước khi trừ một buổi: hợp đồng đã huỷ / ĐÃ HẾT HẠN / đã hết buổi. Nhánh hết hạn thêm ở #204 (bản #154 quên; đo được: trừ buổi hợp đồng hết hạn hôm qua LỌT). Ngày lấy theo giờ VN chứ không `current_date` vì yêu cầu thật chạy ở UTC — xem #203. Truy vấn lọc thêm tenant để không rò trạng thái hợp đồng tiệm khác qua câu báo lỗi.';

-- ─── 2b. Policy `contract_sessions_all` không lọc vai ───
--
-- `for all` + chỉ kiểm `tenant_id`. Khác MỌI bảng khác trong cùng migration
-- #154: `service_packages` và `contracts` đều có `*_select` mở cho mọi vai và
-- `*_manage` bó vào owner/admin/manager. Riêng bảng này gộp bốn quyền vào một
-- dòng — và chỗ gộp đó là chỗ thủng.
--
-- Ý ĐỊNH GỐC KHÔNG SAI, chỉ viết quá tay: chú thích #154 ghi *"Mọi vai: nhân
-- viên cần đổi buổi cho khách"*. Đúng cho INSERT. Nhưng "mọi vai" gồm cả
-- `viewer` — vai CHỈ XEM — và `for all` đem cái "mọi vai" ấy sang cả UPDATE lẫn
-- DELETE.
--
--   viewer TRỪ BUỔI hợp đồng còn hạn             => LỌT (sessions_used 3 → 4)
--   viewer SỬA dòng lịch sử (đổi ghi chú)        => LỌT (3 dòng)
--   viewer XOÁ dòng lịch sử dùng buổi            => LỌT
--   ĐỐI CHỨNG · viewer TẠO hợp đồng              => CHẶN (`contracts_manage`)
--   ĐỐI CHỨNG · viewer ĐỌC lịch sử dùng buổi     => LỌT (3 dòng — phải giữ)
--
-- Vá theo đúng khuôn hai bảng anh em, chỉ nới đúng chỗ #154 cố ý nới: INSERT mở
-- cho mọi vai TRỪ `viewer` (khuôn `app_role() <> 'viewer'` đã dùng ở
-- `appointments_insert` và `order_payments_insert`), còn SỬA/XOÁ là việc quản lý.

drop policy contract_sessions_all on public.contract_sessions;

create policy contract_sessions_select on public.contract_sessions for select
  using (tenant_id = (select public.current_tenant_id()));

create policy contract_sessions_insert on public.contract_sessions for insert
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) <> 'viewer');

create policy contract_sessions_update on public.contract_sessions for update
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner', 'admin', 'manager'));

create policy contract_sessions_delete on public.contract_sessions for delete
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner', 'admin', 'manager'));

comment on policy contract_sessions_insert on public.contract_sessions is
  'Ghi nhận dùng một buổi: mọi vai TRỪ `viewer` — nhân viên cần đổi buổi cho khách (ý định gốc #154), nhưng vai CHỈ XEM thì không. Tách khỏi policy `for all` cũ ở #204, sau khi đo được viewer trừ buổi / sửa / xoá được dòng lịch sử.';

-- ─── 2c. XOÁ DÒNG LỊCH SỬ LÀM SỔ BUỔI LỆCH VĨNH VIỄN ───
--
-- Đây là phần nặng nhất của lỗ 2, và nó KHÔNG phải chuyện phân vai.
--
--   viewer xoá 1 dòng  => sessions_used 3 → **3** · còn 2 dòng lịch sử
--   OWNER  xoá 1 dòng  => sessions_used 3 → **3** · còn 2 dòng lịch sử
--   staff  xoá 1 dòng  => LỌT
--
-- Chú ý dòng thứ hai: **kể cả chủ tiệm xoá thì sổ cũng lệch.**
-- `contract_sessions_sync` (#154) chỉ có nhánh AFTER INSERT (+1), không có nhánh
-- trả lại. Nên siết vai thôi là chưa đủ — siết vai chỉ đổi AI được làm hỏng sổ,
-- không làm sổ hết hỏng.
--
-- QUYẾT ĐỊNH — VÀ VÌ SAO: **cho phép xoá (owner/admin/manager) + trigger trả
-- buổi lại**, thay vì cấm hẳn DELETE.
--
--   · Sổ buổi là CHỨNG TỪ: nó là bằng chứng khách đã tiêu bao nhiêu buổi trong
--     gói TRẢ TRƯỚC. Một dòng biến mất mà con đếm đứng yên nghĩa là khách MẤT
--     TRẮNG một buổi đã trả tiền, và không ai nhìn thấy gì để mà nghi — đúng cái
--     bệnh #202 đã ghi: *"dữ liệu hỏng chẳng hiện ra ở đâu cả… dưới dạng một con
--     số trông hoàn toàn bình thường"*. Vậy nên điều BẮT BUỘC không phải là cấm
--     xoá, mà là **con đếm không bao giờ được phép trôi.**
--   · Cấm hẳn DELETE thì đóng luôn đường sửa sai có thật: nhân viên bấm nhầm hai
--     lần, khách bị trừ hai buổi. Không có đường lùi thì người thiệt là KHÁCH, và
--     cách duy nhất còn lại là nhờ người viết mã vào sửa tay CSDL — tệ hơn hẳn.
--   · Trigger bảo vệ MỌI đường, policy chỉ bảo vệ đường PostgREST. Một lần xoá
--     bằng service role, bằng script, hay bằng màn quản trị sau này vẫn phải trả
--     buổi lại. Đó là lý do **trigger là lớp chính, siết vai chỉ là lớp phụ.**
--   · Cái mất khi cho xoá: dấu vết của chính lần ghi nhầm. Chấp nhận được — đây
--     là sửa sai một lượt ghi nhận, không phải xoá dấu một giao dịch tiền
--     (`cash_entries` vẫn là sổ bất biến riêng, không đụng tới).
--
-- Vai được xoá lấy đúng bậc `owner/admin/manager` mà kho đang dùng cho việc quản
-- lý (`contracts_manage`, `appointments_delete`) — không đặt ra bậc mới chỉ cho
-- một bảng.

create or replace function public.contract_sessions_restore() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  update public.contracts
     set sessions_used = greatest(sessions_used - 1, 0),
         -- Hợp đồng từng bị `contract_sessions_sync` chốt 'completed' khi dùng
         -- hết buổi. Trả lại một buổi mà không mở khoá trạng thái thì sổ nói
         -- "còn buổi" trong khi `contract_sessions_cap` vẫn chặn với lý do "đã
         -- dùng hết buổi" — lại một kiểu lệch khác, chỉ đổi chỗ.
         -- 'cancelled' KHÔNG được sống lại: huỷ là quyết định của con người.
         status = case when status = 'completed' then 'active' else status end,
         updated_at = now()
   where id = old.contract_id and tenant_id = old.tenant_id;
  -- Hợp đồng bị xoá hẳn thì các dòng buổi cascade theo và câu UPDATE trên khớp
  -- 0 dòng (hàng cha đã biến mất trong cùng lệnh). Vô hại, cố ý không chặn.
  return old;
end $$;

create trigger contract_sessions_restore
  after delete on public.contract_sessions
  for each row execute function public.contract_sessions_restore();

comment on function public.contract_sessions_restore() is
  'Trả lại một buổi vào `contracts.sessions_used` khi một dòng lịch sử bị xoá, và mở khoá trạng thái completed → active. Cặp đối xứng của `contract_sessions_sync` (#154 chỉ có nhánh +1). Không có nó thì xoá một dòng làm sổ buổi lệch VĨNH VIỄN — đo 20/08: xoá 1 dòng, sessions_used vẫn 3, KỂ CẢ khi người xoá là chủ tiệm (#204).';

-- ═══════════════════════════════════════════════════════════════════
-- LỖ 3 — THU TIỀN CHO ĐƠN ĐÃ HUỶ, VÀ TIỀN VÀO SỔ QUỸ THẬT
-- ═══════════════════════════════════════════════════════════════════
-- Giao diện có gác: `app/app/orders/[id]/order-detail-view.tsx:1005` chỉ vẽ ô
-- thu tiền khi `status !== 'cancelled'`. Máy chủ thì không: `recordPayment`
-- không kiểm trạng thái, và `order_payments_guard` CHỈ so tổng tiền.
--
--   thu 400.000đ cho đơn ĐÃ HUỶ                  => LỌT, và trigger tự sinh
--                                                   **1 phiếu quỹ 400.000đ**
--   ĐỐI CHỨNG · thu 500.000đ cho đơn 400.000đ    => CHẶN (payment_exceeds_order_total)
--   ĐỐI CHỨNG · thu 400.000đ cho đơn CÒN SỐNG    => LỌT (phải giữ)
--
-- Nặng ở chỗ tiền KHÔNG dừng lại ở bảng phiếu thu: `order_payments_emit_cash_entry`
-- đẩy thẳng một phiếu vào `cash_entries`. Sổ quỹ là thứ đem đi đối chiếu với
-- tiền đếm được trong két — nên đây không phải một dòng rác trong bảng phụ, mà
-- là **két ảo tăng thêm 400.000đ cho một đơn không còn tồn tại.**
--
-- Kho đã canh cửa DÒNG HÀNG của đơn huỷ mà bỏ trống cửa THU TIỀN: đo cùng lúc
-- thấy `order_lines_lock_guard` chặn ngay việc thêm dòng hàng vào đơn đã huỷ
-- (*"sửa sai thì tạo phiếu điều chỉnh mới, không sửa dòng cũ"*). Cùng một đơn,
-- cùng một lý lẽ, hai cửa — chỉ một cửa có khoá.
--
-- Đặt phép kiểm vào `order_payments_guard` chứ không thêm policy RLS, vì đây là
-- luật NGHIỆP VỤ (trạng thái của đơn cha), không phải luật phân quyền — và vì
-- trigger ném lỗi rõ, trong khi RLS lọc dòng thì im lặng.
--
-- CHỈ chặn `cancelled`: `draft` / `confirmed` / `completed` vẫn thu tiền được
-- như hôm nay (đặt cọc đơn nháp là việc bình thường), đúng bằng cái giao diện
-- đang cho phép. Cột `orders.deleted_at` CỐ Ý không xét — soát cả kho thì nó chỉ
-- được ĐỌC, chưa có đường nào ghi, và 0 đơn đang mang giá trị đó; thêm nhánh cho
-- một trạng thái chưa tồn tại là đoán mò (luật D2).

create or replace function public.order_payments_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_total bigint;
  v_paid bigint;
  v_status text;
begin
  select status into v_status
    from public.orders
   where id = new.order_id and tenant_id = new.tenant_id;
  if v_status = 'cancelled' then
    raise exception 'order_cancelled: đơn % đã huỷ — không thu tiền vào đơn đã huỷ; trả lại tiền thì tạo phiếu hoàn',
      new.order_id
      using errcode = '23514';
  end if;

  select coalesce(sum(qty * unit_price_vnd - discount_vnd), 0) into v_total
    from public.order_lines where order_id = new.order_id;
  select coalesce(sum(amount_vnd), 0) into v_paid
    from public.order_payments where order_id = new.order_id;
  if v_paid + new.amount_vnd > v_total then
    raise exception 'payment_exceeds_order_total: đơn % tổng %đ, đã thu %đ, thu thêm %đ sẽ vượt',
      new.order_id, v_total, v_paid, new.amount_vnd
      using errcode = '23514';
  end if;
  return new;
end $$;

comment on function public.order_payments_guard() is
  'Chốt chặn trước khi ghi một khoản thu: đơn đã huỷ thì không thu, và tổng thu không vượt tổng đơn. Nhánh đơn-đã-huỷ thêm ở #204 — bản cũ chỉ so tổng tiền nên thu được 400.000đ cho đơn đã huỷ và trigger tự sinh 1 phiếu vào sổ quỹ thật (đo 20/08). Giao diện có gác chỗ này, máy chủ thì không.';

-- ═══════════════════════════════════════════════════════════════════
-- LỖ 4 — CHÉO TIỆM: NGƯỜI TIỆM A TRỪ ĐƯỢC BUỔI TRÊN HỢP ĐỒNG TIỆM B
-- ═══════════════════════════════════════════════════════════════════
-- Đây là lớp nặng nhất: không phải "sai quyền trong một tiệm" mà là **một tiệm
-- đụng vào dữ liệu tiệm khác** — đúng lớp bệnh migration #136 đã bịt 12 chỗ.
--
-- Cơ chế: RLS của `contract_sessions` chỉ kiểm `tenant_id` của CHÍNH DÒNG BUỔI,
-- không kiểm hợp đồng nó trỏ tới có cùng tiệm không. Người tiệm A ghi một dòng
-- mang `tenant_id = A` nhưng `contract_id` trỏ sang hợp đồng của tiệm B: RLS
-- thấy tenant khớp nên cho qua, rồi `contract_sessions_sync` chạy quyền cao vẫn
-- cộng `sessions_used` của hợp đồng tiệm B.
--
--   BẪY · người tiệm A trừ buổi trên hợp đồng tiệm B
--        => GHI ĐƯỢC, và sessions_used của tiệm B **2 → 3**
--   BẪY · dòng buổi tiệm A trỏ sang LỊCH HẸN tiệm B          => GHI ĐƯỢC
--   BẪY · hợp đồng tiệm A trỏ sang KHÁCH tiệm B              => GHI ĐƯỢC
--   BẪY · hợp đồng tiệm A trỏ sang GÓI DỊCH VỤ tiệm B        => GHI ĐƯỢC
--   ĐỐI CHỨNG · người tiệm A trừ buổi trên hợp đồng CỦA TIỆM A
--        => ghi được, sessions_used tăng ĐÚNG 1 (3 → 4)
--
-- Tức là **cả bốn cạnh khoá ngoại của mảng Hợp đồng đều hở**, không riêng cạnh
-- đã báo. Vá cả bốn ở đây, vì cùng một mảng và cùng một lượt sửa.
--
-- ═══ VÌ SAO KHÔNG DÙNG KHOÁ NGOẠI GHÉP (đã cân nhắc trước, như được dặn) ═══
-- Khoá ngoại ghép `(tenant_id, contract_id) → contracts(tenant_id, id)` đúng là
-- chốt declarative không lách được. Nhưng ở ĐÂY nó không rẻ, và đã đo:
--
--   · Cần thêm khoá duy nhất `(tenant_id, id)` trên TỪNG bảng cha. Đo trên CSDL:
--     `contracts`, `service_packages`, `contacts`, `appointments` đều CHƯA có —
--     khoá chính chỉ có `id`. Tức phải dựng bốn chỉ mục duy nhất thừa, trong đó
--     `contacts` và `appointments` là hai bảng lớn nhất kho, trả phí mỗi lần ghi
--     mãi mãi. "Rẻ nhất" không đúng với hình dạng dữ liệu này.
--   · Kho đã có ĐÚNG MỘT khuôn cho lớp bệnh này: trigger `*_tenant_guard`
--     (#131 mở đầu, #136 áp cho 12 quan hệ). Chính khuôn đó là thứ đem đi RÀ:
--     phép soát tìm lỗ này quét `pg_trigger` theo khuôn ấy. Thêm cơ chế thứ hai
--     nghĩa là mọi đợt rà sau phải nhớ tìm CẢ HAI hình dạng — và thứ phải nhớ
--     thì sẽ có ngày quên. Đây là cái giá lặp lại, không phải giá một lần.
--   · Sức mạnh thực tế NGANG nhau: cả hai đều do máy chủ ép ở mọi đường ghi, và
--     cả hai đều bị bỏ qua như nhau khi `session_replication_role = 'replica'`
--     (`scripts/perf-seed.mjs` có dùng). Khoá ngoại không mạnh hơn ở chỗ nào đo
--     được.
--   · Trigger còn nói được câu tiếng Việt chỉ đúng cột sai; khoá ngoại chỉ ném
--     một lỗi ràng buộc chung, `loiGhi` sẽ gộp vào "dữ liệu không hợp lệ".
--
-- ⇒ Theo khuôn `*_tenant_guard` của kho. Cùng lý do "đừng dựng cơ chế thứ hai
--   cho cùng một luật" mà #136 đã chọn thêm trigger MỚI cạnh trigger cũ thay vì
--   sửa trigger cũ.

create or replace function public.contracts_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  if new.contact_id is not null then
    select tenant_id into v_tenant from public.contacts where id = new.contact_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contracts.contact_id phải cùng tiệm với hợp đồng (khách % thuộc tiệm khác)', new.contact_id
        using errcode = '23514';
    end if;
  end if;

  if new.package_id is not null then
    select tenant_id into v_tenant from public.service_packages where id = new.package_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contracts.package_id phải cùng tiệm với hợp đồng (gói % thuộc tiệm khác)', new.package_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger contracts_tenant_guard
  before insert or update of contact_id, package_id, tenant_id
  on public.contracts
  for each row execute function public.contracts_tenant_guard();

comment on function public.contracts_tenant_guard() is
  'Chặn hợp đồng trỏ vào khách / gói dịch vụ của tiệm khác. Mảng Hợp đồng (#154) sinh ra SAU đợt rà chéo tiệm #136 nên chưa cạnh nào được rà — đo 20/08: cả hai cạnh đều ghi được sang tiệm khác (#204).';

-- `contract_sessions` là cạnh nặng nhất: nó không chỉ ghi sai chỗ mà còn TIÊU
-- một buổi có thật của tiệm khác qua `contract_sessions_sync`.
create or replace function public.contract_sessions_tenant_guard() returns trigger
language plpgsql
security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.contracts where id = new.contract_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'contract_sessions.contract_id phải cùng tiệm với dòng buổi (hợp đồng % thuộc tiệm khác)', new.contract_id
      using errcode = '23514';
  end if;

  if new.appointment_id is not null then
    select tenant_id into v_tenant from public.appointments where id = new.appointment_id;
    if v_tenant is distinct from new.tenant_id then
      raise exception 'contract_sessions.appointment_id phải cùng tiệm với dòng buổi (lịch hẹn % thuộc tiệm khác)', new.appointment_id
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger contract_sessions_tenant_guard
  before insert or update of contract_id, appointment_id, tenant_id
  on public.contract_sessions
  for each row execute function public.contract_sessions_tenant_guard();

comment on function public.contract_sessions_tenant_guard() is
  'Chặn dòng dùng buổi trỏ vào hợp đồng / lịch hẹn của tiệm khác. Không có nó thì người tiệm A tiêu được buổi trên hợp đồng tiệm B và `contract_sessions_sync` vẫn cộng sessions_used của tiệm B (đo 20/08: 2 → 3). Theo khuôn `*_tenant_guard` của #131/#136 (#204).';

-- ═══════════════════════════════════════════════════════════════════
-- ĐÃ SOÁT RỘNG HƠN MỘT CẠNH — VÀ ĐÂY LÀ THỨ SOÁT ĐƯỢC / KHÔNG SOÁT ĐƯỢC
-- ═══════════════════════════════════════════════════════════════════
-- Câu hỏi "cùng hình dạng đó còn ở bảng nào khác" đã đem đi đo, không đoán.
-- Quét toàn bộ khoá ngoại một cột giữa hai bảng ĐỀU CÓ `tenant_id`:
--
--   108 cạnh · 24 cạnh đã có chốt kiểu `*_tenant_guard` · **84 cạnh chưa thấy chốt**
--
-- Chia 84 cạnh đó theo mốc đợt rà #136 (17/08) thì ra một quy luật sạch:
--
--   40 cạnh thuộc bảng SINH RA SAU #136 ⇒ **chưa từng đi qua đợt rà nào**
--     (#150 Kho · #151-153 Nhập hàng/NCC · **#154 Hợp đồng** · #155 CSAT ·
--      #157 Điểm/Voucher · #160 Webhook · #165 Giảm giá · #166 Nhân sự ·
--      #167 Lương/Hoa hồng · #170 Tuyển dụng · #171 Chiến dịch)
--   44 cạnh thuộc bảng có TRƯỚC #136 — đợt đó đã xét từng cái và kết luận an
--     toàn qua RPC `security definer` / select-trước-dùng-lại / RLS-GRANT.
--
-- **KHÔNG được đọc "84 cạnh chưa thấy chốt" thành "84 lỗ".** Đã đo một phản ví
-- dụ ngay tại chỗ: `leave_requests.employee_id → employees` cũng không có
-- trigger nào, nhưng thử ghi đơn nghỉ của tiệm A trỏ sang nhân viên tiệm B thì
-- **CHẶN** — policy `leave_self_insert` đã bịt sẵn vì nhân viên tiệm khác không
-- thuộc `auth.uid()`. Chính #136 cũng đo ra 51/63 cạnh an toàn. Muốn biết một
-- cạnh có hở thật hay không thì phải THỬ GHI, không suy từ việc thiếu trigger.
--
-- ⇒ Migration này vá 4 cạnh ĐÃ THỬ VÀ THẤY HỞ THẬT (cả mảng Hợp đồng), và CỐ Ý
--   không rải trigger cho 36 cạnh còn lại — đúng luật D2 mà #136 tự áp cho mình:
--   *"không thêm chốt cho chỗ chưa đo thấy hở"*.
--
-- CÁI KHÔNG SOÁT ĐƯỢC TRONG ĐỢT NÀY, ghi ra để không ai tưởng đã xong: 36 cạnh
-- kia của 10 mảng sinh sau #136 (nặng nhất về tiền: `commission_entries.*` #167,
-- `payslips.*` #167, `voucher_redemptions.*` #157, `purchase_lines.*` #151) mỗi
-- cạnh cần dựng dữ liệu hai tiệm rồi thử ghi thật — đó là một đợt rà riêng đúng
-- cỡ #136, không nhét vừa vào bản vá này.
--
-- BÀI HỌC LỚN HƠN CẢ BỐN LỖ: #136 là một đợt rà MỘT LẦN, không để lại cổng nào
-- canh. Mọi mảng dựng sau nó đều bắt đầu lại từ số không, và không có gì báo.
-- Phép quét ở trên (108 cạnh, đối chiếu `pg_constraint` với `pg_trigger`) chạy
-- được bằng SQL thuần trong vài giây — nó xứng đáng thành một script soát trong
-- `scripts/`, không phải một đoạn chú thích trong migration.

-- ═══════════════════════════════════════════════════════════════════
-- ĐO LẠI SAU KHI ÁP — bốn đường khai thác phải CHẶN, đường thường phải chạy
-- ═══════════════════════════════════════════════════════════════════
-- Ghi ở đây để bản sau còn biết đã nghiệm thu bằng gì: CHÍNH bộ 33 phép đã đo
-- trước khi vá, chạy lại nguyên vẹn trên bản ĐÃ VÁ. Điều kiện đạt gồm HAI vế,
-- thiếu vế nào cũng không tính là xong:
--   ① mọi phép khai thác (staff/quản lý tự duyệt · hợp đồng hết hạn · vai chỉ
--      xem trừ-sửa-xoá buổi · sổ buổi lệch khi xoá · thu tiền đơn đã huỷ · bốn
--      cạnh chéo tiệm) chuyển từ LỌT sang CHẶN;
--   ② mọi phép ĐỐI CHỨNG "đường dùng bình thường" GIỮ NGUYÊN LỌT — nộp đơn nghỉ
--      chờ duyệt · quản lý duyệt và từ chối đơn NGƯỜI KHÁC · nhân viên trừ buổi
--      hợp đồng còn hạn · hợp đồng vô thời hạn và hợp đồng hết hạn đúng hôm nay ·
--      vai chỉ xem vẫn ĐỌC được lịch sử · thu tiền đơn còn sống · trừ buổi trên
--      hợp đồng của chính tiệm mình vẫn cộng ĐÚNG 1.
-- Vế ② quan trọng ngang vế ①: một bản vá chặn sạch cả đường dùng thật thì không
-- phải bản vá, chỉ là tắt tính năng.
