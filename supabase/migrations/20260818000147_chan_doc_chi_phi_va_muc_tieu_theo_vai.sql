-- Việc #174 — nhân viên ĐỌC được chi phí marketing và mục tiêu doanh số của
-- cả tiệm, trong khi màn hình chặn họ.
--
-- Nửa còn lại của phép quét ở #173: hôm đó soát chiều GHI, đây soát chiều ĐỌC.
-- Quét mọi policy SELECT trên bảng có `tenant_id`, đối chiếu với luật chặn của
-- màn hình tương ứng. Trong 5 bảng "tiền", 3 bảng đã khoá đúng (item_costs,
-- order_line_costs, cash_entries — vá ở #163), còn 2 bảng hở.
--
-- ĐO THẬT (gieo dữ liệu trước để "0 dòng" không bị nhầm là "bị chặn"):
--   vai staff  → source_costs 1/1  ·  kpi_targets 1/1   (đọc hết)
--   màn hình   → cả hai màn chỉ cho owner/admin/manager vào
--
-- ── source_costs ────────────────────────────────────────────────────────────
-- Chú thích trong migration gốc (#52) ghi rõ đây là lựa chọn CÓ CHỦ Ý: "mọi
-- thành viên tenant đọc được (màn báo cáo đã chặn staff ở tầng app)". Nay đổi
-- lại, vì 2 lý do:
--   1. Lệch với `item_costs` — cùng loại dữ liệu (tiền vốn/chi phí) mà một bên
--      khoá ở CSDL, một bên chỉ khoá ở giao diện.
--   2. Nếp của kho này là "CSDL mới là chốt thật, giao diện chỉ là lớp hiển
--      thị" (ghi trong `contacts/page.tsx`). Khoá bằng màn hình thôi thì nhân
--      viên vẫn đọc được qua đường API bằng chính phiên đăng nhập của họ.
-- KHÔNG gãy gì: `source_costs` chỉ có MỘT chỗ đọc trong app
-- (`reports/sources/types.ts`), mà màn đó vốn đã chặn staff.
drop policy if exists source_costs_select on public.source_costs;
create policy source_costs_select on public.source_costs for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (select public.app_role()) in ('owner', 'admin', 'manager')
  );

-- ── kpi_targets ─────────────────────────────────────────────────────────────
-- KHÔNG khoá thẳng như trên được: thẻ "tiến độ mục tiêu" trên màn Hôm nay hiện
-- cho MỌI vai, và nó đọc `kpi_targets` qua RPC `kpi_progress` (RPC này KHÔNG
-- phải security definer nên RLS vẫn áp). Khoá thẳng là gãy thẻ đó của nhân
-- viên.
--
-- Đáng chú ý hơn: thẻ đó đang lọc "của mình" Ở TRÌNH DUYỆT
-- (`data.targets.find(x => x.user_id === userId)` trong today/kpi-progress-card.tsx),
-- nghĩa là mục tiêu của TẤT CẢ đồng nghiệp vẫn về tới máy nhân viên rồi mới bị
-- giấu đi. Lọc ở trình duyệt không phải là chặn.
--
-- Vậy: quản lý trở lên đọc hết; ai khác chỉ đọc đúng dòng CỦA MÌNH. Thẻ màn
-- Hôm nay vẫn chạy nguyên, mà dữ liệu đồng nghiệp không rời khỏi máy chủ nữa.
drop policy if exists kpi_targets_select on public.kpi_targets;
create policy kpi_targets_select on public.kpi_targets for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      (select public.app_role()) in ('owner', 'admin', 'manager')
      or user_id = (select auth.uid())
    )
  );
