-- ════════════════════════════════════════════════════════════════════
-- LỜI NHẮN THOẠI ĐƯỢC PHÉP KHÔNG CÓ CHỮ NÀO
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ TRIỆU CHỨNG ─────────────────────────────────────────────────────
-- Thợ bấm nút Ghi âm trong Chat nội bộ, nói xong, bấm Gửi. Màn hình hiện đúng
-- một câu: **"Nội dung không hợp lệ."** Nghe như họ gõ sai — mà họ không gõ gì
-- cả, vì lời nhắn thoại theo định nghĩa là KHÔNG có chữ nào.
--
-- ┌─ CĂN NGUYÊN (đo trên kho THẬT 22/08, không suy đoán) ─────────────
-- Ràng buộc `chat_messages_body_check`, đọc từ bản ĐANG CHẠY bằng
-- `pg_get_constraintdef` (không chép từ file migration cũ):
--
--     CHECK (((length(TRIM(BOTH FROM body)) >= 1)
--         AND (length(TRIM(BOTH FROM body)) <= 4000)))
--
-- Nó ra đời ở #169, thời tin nhắn chỉ có chữ. Đính kèm tệp mãi #318 mới có.
-- Từ ngày đó, màn soạn (`o-chon-tep.tsx`) và tầng máy chủ (`chat/actions.ts`)
-- đều hứa **"có tệp thì lời nhắn được PHÉP RỖNG"** — riêng kho dữ liệu không
-- biết lời hứa ấy. Đo trên kho thật: **0 tệp đính kèm nào từng gửi thành
-- công** kể từ #318. Tính năng đính kèm chưa từng chạy một lần nào, và không
-- ai biết, vì câu báo lỗi đổ tội cho người gõ.
--
-- ⚠️ LƯỢT CHỮA TRƯỚC ĐI ĐƯỜNG VÒNG. Phiên 22/08 bị cấm đụng thư mục này nên
--   chữa ở tầng máy chủ: tin chỉ-có-tệp được **tự gán một dòng chữ** ("Lời
--   nhắn thoại" / "Ảnh / tệp đính kèm") để lách ràng buộc. Nó chạy, nhưng nó
--   đổi bản chất của cột `body`: cột ấy là chỗ chứa **lời người dùng viết**,
--   không phải chỗ chứa **chữ để hiển thị**. Trộn hai việc lại thì mọi chỗ đọc
--   `body` về sau đều phải đoán "chữ này là thật hay do máy bịa" — và không có
--   cách nào đoán đúng. Ô tìm kiếm sẽ tìm ra một tin theo chữ mà người gửi
--   chưa bao giờ viết. Bản vá này bỏ hẳn đường vòng đó.
--
-- ┌─ VÌ SAO KHÔNG NỚI THÀNH "CHO RỖNG TUỐT" ──────────────────────────
-- Tin rỗng chữ mà cũng không có tệp thì không mang thông tin gì — nó là một
-- bong bóng trắng, và người đọc sẽ tưởng màn hình hỏng. Luật phải là **rỗng
-- chữ KHI VÀ CHỈ KHI có tệp đính kèm**.
--
-- ⚠️ CHECK THƯỜNG KHÔNG LÀM ĐƯỢC LUẬT NÀY: tệp nằm ở bảng khác
--   (`chat_attachments`), mà `check` trong Postgres không nhìn được sang bảng
--   khác. Nên luật đi bằng CONSTRAINT TRIGGER — và phải **DEFERRABLE INITIALLY
--   DEFERRED**, vì tin phải được ghi TRƯỚC thì tệp mới có khoá ngoại để trỏ
--   vào. Kiểm ngay lúc ghi tin thì luôn thấy "chưa có tệp nào" và chặn nhầm
--   mọi lượt. Kiểm lúc CHỐT giao dịch thì thấy đủ cả hai.
--
-- ⚠️ HỆ QUẢ BẮT BUỘC: tin và tệp phải nằm TRONG CÙNG MỘT giao dịch. Đường cũ
--   ghi hai lượt riêng (`insert` tin, rồi `insert` tệp) — hai giao dịch, nên
--   chốt lượt đầu là đã trượt. Vì vậy bản vá này thêm hàm `chat_gui_tin`: một
--   lượt gọi, một giao dịch, tin và tệp cùng vào hoặc cùng không.
--   Đường cũ còn để lại một hố nữa mà hàm này lấp luôn: ghi tin xong mà ghi
--   tệp hỏng thì tin đã nằm trong sổ rồi — người gửi thấy "đã gửi" nhưng tin
--   hiện ra không có ảnh nào, họ gửi lại, thành hai tin đều không ảnh.

-- ────────────────────────────────────────────────────────────────────
-- 1. NỚI CHECK: BỎ SÀN 1 KÝ TỰ, GIỮ NGUYÊN TRẦN 4000
-- ────────────────────────────────────────────────────────────────────
-- Trần 4000 chép nguyên từ bản ĐANG CHẠY. Sàn thì bỏ — nó đã chuyển sang chốt
-- bên dưới, chốt đó biết nhìn sang bảng tệp.
alter table public.chat_messages
  drop constraint if exists chat_messages_body_check;
alter table public.chat_messages
  add constraint chat_messages_body_check
  check (length(trim(both from body)) <= 4000);

comment on constraint chat_messages_body_check on public.chat_messages is
  'Chỉ còn TRẦN 4000 ký tự. Sàn "phải có ít nhất 1 ký tự" đã bỏ ở #373 vì lời nhắn thoại không có chữ nào; luật thay thế nằm ở chốt chat_messages_rong_thi_phai_co_tep — nó nhìn được sang bảng tệp, còn check thì không.';

-- ────────────────────────────────────────────────────────────────────
-- 2. CHỐT: RỖNG CHỮ ⇒ PHẢI CÓ TỆP
-- ────────────────────────────────────────────────────────────────────
create or replace function private.chat_rong_thi_phai_co_tep()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_than text;
begin
  -- Chốt này treo trên HAI bảng, nên phải tự biết mình đang được gọi từ đâu.
  if tg_table_name = 'chat_attachments' then
    -- Gỡ tệp cuối cùng khỏi một tin không có chữ ⇒ tin đó thành bong bóng
    -- trắng. Không canh nhánh này thì luật "khi và chỉ khi" chỉ đúng lúc ghi,
    -- và một luật chỉ đúng một nửa thời gian thì không phải là luật.
    v_id := old.message_id;
  else
    v_id := new.id;
  end if;

  select body into v_than from public.chat_messages where id = v_id;

  -- Không còn tin nào: đây là lượt xoá tin kéo theo tệp (khoá ngoại cascade).
  -- Không có gì để canh, và kêu ở đây là chặn cả đường xoá.
  if not found then return null; end if;

  if length(trim(both from v_than)) = 0
     and not exists (select 1 from public.chat_attachments where message_id = v_id)
  then
    raise exception 'tin_rong_khong_co_tep'
      using hint = 'Tin nhắn được phép không có chữ, nhưng chỉ khi nó mang theo ít nhất một tệp đính kèm.';
  end if;

  return null;
end;
$$;

comment on function private.chat_rong_thi_phai_co_tep() is
  'Chốt HOÃN của #373: tin nhắn rỗng chữ phải mang ít nhất một tệp. Hoãn tới lúc chốt giao dịch vì tin luôn phải ghi TRƯỚC tệp (khoá ngoại) — kiểm ngay lúc ghi thì lượt nào cũng thấy "chưa có tệp" và chặn nhầm.';

drop trigger if exists chat_messages_rong_thi_phai_co_tep on public.chat_messages;
create constraint trigger chat_messages_rong_thi_phai_co_tep
  after insert or update of body on public.chat_messages
  deferrable initially deferred
  for each row execute function private.chat_rong_thi_phai_co_tep();

drop trigger if exists chat_attachments_go_het_thi_phai_co_chu on public.chat_attachments;
create constraint trigger chat_attachments_go_het_thi_phai_co_chu
  after delete on public.chat_attachments
  deferrable initially deferred
  for each row execute function private.chat_rong_thi_phai_co_tep();

-- ────────────────────────────────────────────────────────────────────
-- 3. GỬI TIN + TỆP TRONG MỘT GIAO DỊCH
-- ────────────────────────────────────────────────────────────────────
-- `security invoker` là CỐ Ý: RLS của `chat_messages` và `chat_attachments` là
-- bộ quyền DUY NHẤT. Đổi sang `security definer` là phải chép lại toàn bộ luật
-- kênh vào đây lần thứ hai, và hai bản sẽ lệch nhau ở lần sửa sau.
create or replace function public.chat_gui_tin(
  p_channel_id uuid,
  p_body       text,
  p_parent_id  uuid default null,
  p_tep        jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then raise exception 'khong_thuoc_tiem_nao'; end if;

  insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, parent_id)
  values (v_tenant, p_channel_id, auth.uid(), p_body, p_parent_id)
  returning id into v_id;

  -- Tệp đi cùng chuyến. `tenant_id` lấy từ `current_tenant_id()` chứ KHÔNG
  -- nhận từ người gọi: một mã tiệm do người gọi đưa là một mã tiệm có thể bịa.
  insert into public.chat_attachments (tenant_id, message_id, duong_dan, ten, loai, co)
  select v_tenant, v_id, x.duong_dan, x.ten, x.loai, x.co
    from jsonb_to_recordset(coalesce(p_tep, '[]'::jsonb))
      as x(duong_dan text, ten text, loai text, co bigint);

  return v_id;
end;
$$;

comment on function public.chat_gui_tin(uuid, text, uuid, jsonb) is
  'Gửi một tin nhắn nội bộ kèm tệp trong MỘT giao dịch (#373). Phải là một giao dịch vì chốt "rỗng chữ thì phải có tệp" chỉ chạy lúc chốt giao dịch — ghi hai lượt riêng thì lượt đầu đã trượt. Cũng xoá luôn cảnh tin đã ghi mà tệp thì không.';

revoke all on function public.chat_gui_tin(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.chat_gui_tin(uuid, text, uuid, jsonb) to authenticated;
