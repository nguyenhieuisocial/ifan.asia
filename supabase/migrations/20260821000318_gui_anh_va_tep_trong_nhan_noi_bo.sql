-- ════════════════════════════════════════════════════════════════════
-- GỬI ẢNH VÀ TỆP TRONG NHẮN NỘI BỘ
-- ════════════════════════════════════════════════════════════════════
--
-- Thẻ `man-nhan-noi-bo-kieu-slack.html`: *"Bảng công, ảnh sản phẩm, ảnh
-- trước-sau. Hiện phải gửi qua Zalo rồi quay lại đây nói 'em gửi Zalo rồi
-- nha'."* — tức là kênh nhắn nội bộ đang bị bỏ qua cho đúng loại nội dung mà
-- một tiệm làm đẹp trao đổi nhiều nhất.
--
-- ┌─ TỆP NẰM Ở KHO, BẢNG NÀY CHỈ GIỮ ĐƯỜNG DẪN ───────────────────────
-- Tệp thật nằm trong kho `tenant-files`, đường dẫn `{mã tiệm}/chat/…`. Chính
-- sách của kho đã chốt: thư mục đầu tiên PHẢI là mã tiệm của người ghi, nên
-- một tiệm không đọc/ghi được tệp của tiệm khác — không cần dựng lại luật đó
-- ở đây lần thứ hai.
--
-- ┌─ QUYỀN ĐỌC ĐI THEO TIN NHẮN ──────────────────────────────────────
-- Thấy được tin thì thấy được tệp của tin đó. Chép lại luật kênh vào đây là
-- dựng bộ quyền thứ hai, và hai bộ sẽ lệch nhau ở lần sửa sau.
--
-- ⚠️ Tệp được TẢI LÊN TRƯỚC khi tin nhắn tồn tại (người ta chọn ảnh rồi mới
--   bấm Gửi). Nên có thể còn lại tệp mồ côi nếu họ chọn xong rồi bỏ đi. Chấp
--   nhận: một tệp mồ côi chỉ tốn chỗ, còn bắt tạo tin trước rồi mới cho chọn
--   ảnh là làm ngược cách người ta thao tác. Ghi lại đây để sau này dọn.

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  /** Đường dẫn trong kho `tenant-files`, luôn bắt đầu bằng mã tiệm. */
  duong_dan text not null,
  /** Tên tệp gốc để hiện cho người đọc — KHÔNG dùng làm đường dẫn. */
  ten text not null,
  loai text not null,
  /** Cỡ tệp tính bằng byte — để màn hình nói "2,4 MB" mà không phải tải về đo. */
  co bigint not null check (co >= 0),
  created_at timestamptz not null default now()
);

create index if not exists chat_attachments_message_idx
  on public.chat_attachments (message_id);

alter table public.chat_attachments enable row level security;

-- Thấy tin thì thấy tệp. `exists` dựa thẳng vào chính sách của `chat_messages`
-- nên luật kênh chỉ tồn tại ở MỘT chỗ.
create policy chat_attachments_select on public.chat_attachments
  for select using (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.chat_messages m where m.id = chat_attachments.message_id)
  );

create policy chat_attachments_insert on public.chat_attachments
  for insert with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
    and exists (
      select 1 from public.chat_messages m
       where m.id = chat_attachments.message_id
         and m.sender_user_id = (select auth.uid())
    )
  );

-- Gỡ tệp khỏi tin CỦA CHÍNH MÌNH. Không ai gỡ hộ người khác.
create policy chat_attachments_delete on public.chat_attachments
  for delete using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.chat_messages m
       where m.id = chat_attachments.message_id
         and m.sender_user_id = (select auth.uid())
    )
  );

comment on table public.chat_attachments is
  'Ảnh/tệp đính kèm tin nhắn nội bộ. Tệp thật nằm ở kho tenant-files ({mã tiệm}/chat/…); bảng này chỉ giữ đường dẫn. Quyền đọc ĐI THEO tin nhắn để luật kênh chỉ tồn tại một chỗ — #318.';
