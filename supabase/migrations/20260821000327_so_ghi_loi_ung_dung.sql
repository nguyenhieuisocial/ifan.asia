-- ════════════════════════════════════════════════════════════════════
-- SỔ GHI LỖI ỨNG DỤNG
-- ════════════════════════════════════════════════════════════════════
--
-- ┌─ VÌ SAO CẦN ──────────────────────────────────────────────────────
-- Đo 21/08: kho KHÔNG có bất kỳ đường nào để biết một tiệm vừa gặp lỗi. Không
-- Sentry, không đếm tỷ lệ lỗi, và `app/error.tsx` chỉ VẼ một màn xin lỗi rồi
-- thôi — không ai được báo. Nghĩa là một màn hỏng với khách hàng thật có thể
-- nằm im nhiều ngày cho tới khi có người chịu khó nhắn cho founder.
--
-- `system_alerts` KHÔNG dùng lại được: bảng đó gắn chặt vào việc chạy nền
-- (`job_id`, `job_name`, `fail_count`), không có chỗ cho lỗi trình duyệt.
-- Nhét vào là làm hỏng ý nghĩa của cả hai.
--
-- ┌─ VÌ SAO KHÔNG DÙNG DỊCH VỤ NGOÀI ─────────────────────────────────
-- Lời lỗi và vết gọi hàm có thể mang theo dữ liệu của tiệm. Gửi sang máy chủ
-- bên thứ ba là một quyết định về DỮ LIỆU KHÁCH HÀNG, không phải quyết định kỹ
-- thuật — và nó cần founder chốt, không phải lập trình viên tự chốt. Bảng này
-- chạy được ngay, không cần khoá, không cần đăng ký, và dữ liệu ở lại đúng chỗ
-- nó vốn nằm.
--
-- ┌─ GOM THEO DẤU VÂN TAY, KHÔNG GHI TỪNG LƯỢT ───────────────────────
-- ⚠️ Một lỗi trong vòng lặp vẽ giao diện bắn ra hàng nghìn lượt mỗi phút. Ghi
--   từng lượt thì bảng phình, gói miễn phí hết dung lượng, và người đọc không
--   nhìn ra ĐANG CÓ MẤY LOẠI lỗi — thứ duy nhất thật sự cần biết. Nên mỗi loại
--   lỗi chỉ MỘT dòng, tăng `so_lan`.

create table if not exists public.app_errors (
  /** Dấu vân tay của một LOẠI lỗi: loại + lời lỗi + dòng đầu của vết gọi. */
  dau_van_tay text primary key,
  /** 'client' = lỗi ở trình duyệt người dùng · 'server' = lỗi ở máy chủ. */
  noi text not null check (noi in ('client', 'server')),
  loi text not null,
  /** Vết gọi hàm, đã cắt ngắn. Cắt ở tầng ghi chứ không tin người gửi. */
  vet text,
  /** Đường dẫn màn hình lúc lỗi — thứ đầu tiên người sửa cần biết. */
  duong_dan text,
  trinh_duyet text,
  /** Có thể null: lỗi xảy ra trước khi biết người dùng là ai. */
  tenant_id uuid,
  user_id uuid,
  so_lan integer not null default 1,
  lan_dau timestamptz not null default now(),
  lan_cuoi timestamptz not null default now(),
  /** Đã xem và xử lý xong — để danh sách không đầy lỗi cũ. */
  da_xu_ly_luc timestamptz
);

create index if not exists app_errors_lan_cuoi_idx
  on public.app_errors (lan_cuoi desc) where da_xu_ly_luc is null;

-- ⚠️ BẬT RLS, KHÔNG POLICY NÀO — mẫu "chỉ máy chủ đụng" của kho này
--   (`platform_admins`, `link_codes`, `app_rate_limits`...). Vết gọi hàm có thể
--   mang dữ liệu của tiệm, nên KHÔNG mở cho `authenticated` đọc.
alter table public.app_errors enable row level security;

/**
 * Ghi một lượt lỗi.
 *
 * ⚠️ `security definer` và CHỈ cấp cho `service_role`. Đường ghi lỗi phải nhận
 *   được cả lỗi của người CHƯA đăng nhập (màn đăng nhập hỏng cũng là lỗi cần
 *   biết), nên nó không thể đòi phiên — bù lại phải chặn ở tầng máy chủ bằng
 *   giới hạn tần suất, và tuyệt đối không cho vai `anon` gọi thẳng.
 */
create or replace function public.ghi_loi_ung_dung(
  p_dau_van_tay text,
  p_noi text,
  p_loi text,
  p_vet text,
  p_duong_dan text,
  p_trinh_duyet text,
  p_tenant_id uuid,
  p_user_id uuid
) returns void
language plpgsql
security definer set search_path = public, pg_temp as $$
begin
  insert into public.app_errors as e (
    dau_van_tay, noi, loi, vet, duong_dan, trinh_duyet, tenant_id, user_id
  ) values (
    p_dau_van_tay,
    p_noi,
    left(coalesce(p_loi, ''), 500),
    left(coalesce(p_vet, ''), 3000),
    left(coalesce(p_duong_dan, ''), 300),
    left(coalesce(p_trinh_duyet, ''), 300),
    p_tenant_id,
    p_user_id
  )
  on conflict (dau_van_tay) do update
    set so_lan = e.so_lan + 1,
        lan_cuoi = now(),
        -- Lỗi tái phát sau khi đã đánh dấu xử lý ⇒ MỞ LẠI. Giữ nguyên "đã xử
        -- lý" là giấu mất một lỗi đang xảy ra thật.
        da_xu_ly_luc = null,
        duong_dan = coalesce(excluded.duong_dan, e.duong_dan);
end $$;

revoke all on function public.ghi_loi_ung_dung(text, text, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ghi_loi_ung_dung(text, text, text, text, text, text, uuid, uuid)
  to service_role;
grant select, insert, update on public.app_errors to service_role;

comment on table public.app_errors is
  'Sổ ghi lỗi ứng dụng. GOM theo dấu vân tay — mỗi loại lỗi MỘT dòng, tăng so_lan; ghi từng lượt thì một lỗi trong vòng lặp vẽ giao diện làm phình bảng và che mất số LOẠI lỗi. BẬT RLS + KHÔNG policy = chỉ máy chủ đụng, vì vết gọi hàm có thể mang dữ liệu của tiệm — #327.';
