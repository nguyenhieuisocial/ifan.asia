-- #284 — Lương theo NGÀY CÔNG và theo GIỜ, không chỉ lương tháng.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ: máy HỎI nhưng không TÍNH
-- ════════════════════════════════════════════════════════════════════
--
-- Hồ sơ nhân sự chỉ có `base_salary_vnd` (lương tháng) và `overtime_rate_vnd`
-- (đơn giá tăng ca theo giờ). Khi chốt lương, dòng "lương cứng" luôn ghi ĐÚNG
-- số lương tháng, bất kể người đó đi bao nhiêu công. Màn Bảng lương chỉ *hỏi*
-- lại — "người này nhận đủ lương cứng mà thiếu công, có chắc không?" — rồi để
-- người dùng tự sửa tay.
--
-- Rất nhiều tiệm dịch vụ Việt Nam trả **theo công ngày**: đi 20 công thì nhận
-- 20 ngày lương. Với họ, phần mềm hiện đang tính SAI mặc định, và cách chữa
-- duy nhất là mỗi tháng sửa tay từng phiếu — tức là làm lại bằng tay đúng việc
-- mà họ mua phần mềm để khỏi phải làm.
--
-- ════════════════════════════════════════════════════════════════════
-- HAI KIỂU MỚI, VÀ MỘT KIỂU CỐ Ý KHÔNG DỰNG
-- ════════════════════════════════════════════════════════════════════
--
-- Thêm: **theo ngày công** (đơn giá ngày × số công) và **theo giờ** (đơn giá
-- giờ × số giờ làm thật).
--
-- KHÔNG dựng kiểu "khoán". Trả khoán theo đầu việc / đầu dịch vụ là thứ mảng
-- **hoa hồng** đã làm đúng và làm đủ từ trước: mỗi khoản một dòng, bấm được về
-- tận đơn gốc. Dựng thêm một đường thứ hai để nói cùng một chuyện là dựng chỗ
-- cho hai con số lệch nhau. Ai trả thuần khoán thì để lương cứng bằng 0 và
-- dùng hoa hồng — ghi rõ ở đây để người sau không tưởng là bỏ sót.
--
-- ════════════════════════════════════════════════════════════════════
-- BA ĐIỂM CHỐT
-- ════════════════════════════════════════════════════════════════════
--
-- (1) MẶC ĐỊNH LÀ 'monthly'. Mọi hồ sơ đang có giữ nguyên cách tính cũ, không
--     một phiếu lương nào đổi số sau lượt này. Đổi cách trả lương của người
--     khác mà không ai bấm là chuyện không được phép xảy ra.
--
-- (2) ĐƠN GIÁ NGÀY / GIỜ LÀ CỘT RIÊNG, không suy từ lương tháng chia ra. Chia
--     lương tháng cho số công chuẩn nghe tiện nhưng sai ngay tháng đầu: tháng
--     có 26 ngày làm và tháng có 22 ngày làm sẽ ra hai đơn giá khác nhau cho
--     cùng một người, trong khi thoả thuận thật của họ chỉ có một con số.
--
-- (3) KHÔNG ÉP PHẢI ĐIỀN. Chọn kiểu "theo ngày công" mà chưa điền đơn giá thì
--     dòng lương cứng ra 0 — và màn Bảng lương đã sẵn có chốt soát "thiếu
--     phiếu / thiếu số" để hỏi. Chặn cứng ở tầng dữ liệu sẽ khoá luôn đường
--     lưu nửa chừng của người đang nhập dở hồ sơ.

alter table public.employees
  add column if not exists pay_type text not null default 'monthly',
  add column if not exists daily_rate_vnd bigint not null default 0,
  add column if not exists hourly_rate_vnd bigint not null default 0;

alter table public.employees
  drop constraint if exists employees_pay_type_hop_le;
alter table public.employees
  add constraint employees_pay_type_hop_le
  check (pay_type in ('monthly', 'daily', 'hourly'));

alter table public.employees
  drop constraint if exists employees_don_gia_khong_am;
alter table public.employees
  add constraint employees_don_gia_khong_am
  check (daily_rate_vnd >= 0 and hourly_rate_vnd >= 0);

comment on column public.employees.pay_type is
  'Cách trả lương cứng: monthly (mặc định, giữ nguyên nếp cũ) · daily (đơn giá '
  'ngày × số công) · hourly (đơn giá giờ × số giờ làm thật). Trả khoán thì để '
  'lương cứng 0 và dùng mảng hoa hồng — xem #284.';
comment on column public.employees.daily_rate_vnd is
  'Đơn giá MỘT ngày công. Cột riêng, KHÔNG suy từ lương tháng chia ra — xem #284.';
comment on column public.employees.hourly_rate_vnd is
  'Đơn giá MỘT giờ làm. Khác `overtime_rate_vnd` (đơn giá giờ TĂNG CA) — #284.';
