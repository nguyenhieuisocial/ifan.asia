-- Việc #173 — vai "Chỉ xem" còn ghi được vào 4 bảng nữa.
--
-- Tìm ra bằng cách quét TOÀN BỘ 71 policy GHI trên mọi bảng có `tenant_id`,
-- lọc ra policy KHÔNG xét vai VÀ KHÔNG khoá theo dòng-của-chính-mình
-- (`auth.uid()`). Còn đúng 4 bảng. Đo thật trên CSDL production (gieo dữ liệu
-- bằng quyền postgres rồi đóng vai viewer qua request.jwt.claims, transaction
-- rollback) — cả 4 đều LỌT.
--
-- Cùng lớp #170 (Hộp thư) và #172 (nhãn khách): đợt siết vai Chỉ xem ban đầu
-- (#163) khoá 4 bảng lõi nhưng bỏ sót các bảng phụ trợ.
--
-- ⚠️ NHỚ: nút "Xem demo nhanh" trên trang đăng nhập CÔNG KHAI đưa người lạ vào
-- bằng đúng vai này, mật khẩu in ngay dưới nút.

-- ── 1. kb_entries — NẶNG NHẤT ────────────────────────────────────────────────
-- Kho tri thức là nguồn AI đọc để trả lời khách THẬT. Vai Chỉ xem sửa/thêm
-- được ⇒ người lạ nhét được kiến thức sai vào miệng AI. Đo: sửa 1 dòng ✓,
-- thêm 1 dòng ✓.
-- XOÁ đã kín sẵn nhờ trigger `kb_delete_unpublish_guard` (chỉ owner/admin) —
-- vẫn khai policy delete để luật ở TẦNG RLS nói cùng một điều với trigger,
-- không để trigger gánh một mình.
-- ĐỌC: bảng này ĐÃ có policy `kb_entries_select` riêng — GIỮ NGUYÊN, không
-- đụng. Chỉ thay policy ghi `kb_entries_write` (kiểu `for all`, chính nó là
-- chỗ hở: `for all` phủ luôn cả insert/update/delete).
drop policy if exists kb_entries_write on public.kb_entries;

create policy kb_entries_insert on public.kb_entries for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

create policy kb_entries_update on public.kb_entries for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

create policy kb_entries_delete on public.kb_entries for delete
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin')
  );

-- ── 2. contact_identities ────────────────────────────────────────────────────
-- Liên kết SĐT/Zalo ↔ khách. Đo: viewer XOÁ được 9 dòng. Hỏng bảng này thì
-- tin khách nhắn tới không nhận ra là ai nữa.
-- ĐỌC giữ nguyên: hồ sơ khách hiện các kênh đã nối, vai Chỉ xem phải xem được.
drop policy if exists contact_identities_all on public.contact_identities;

create policy contact_identities_select on public.contact_identities for select
  using (tenant_id = (select public.current_tenant_id()));

create policy contact_identities_insert on public.contact_identities for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

create policy contact_identities_update on public.contact_identities for update
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

create policy contact_identities_delete on public.contact_identities for delete
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

-- ── 3. attachments ───────────────────────────────────────────────────────────
-- Đo: viewer thêm ✓, xoá ✓. ĐỌC giữ nguyên (xem tệp đính kèm của khách).
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) <> 'viewer'
  );

-- ── 4. deal_stage_history — XOÁ HẲN policy, không thêm điều kiện ─────────────
-- Bảng append-only, CHỈ trigger `log_deal_stage_change` được ghi. Trigger đó
-- là `security definer`, chủ sở hữu `postgres`, và bảng KHÔNG bật
-- `force row level security` ⇒ trigger đi vòng qua RLS, không cần policy nào
-- cho phía người dùng. Chú thích trong `app/app/deals/actions.ts` cũng ghi rõ
-- "action không tự ghi".
-- Policy insert hiện tại vì vậy là mặt tấn công thuần tuý (đo: viewer bịa được
-- 1 dòng lịch sử). Xoá hẳn đúng hơn là thêm điều kiện vai — không ai ở phía
-- người dùng có việc gì ghi vào đây cả.
drop policy if exists deal_stage_history_insert on public.deal_stage_history;
