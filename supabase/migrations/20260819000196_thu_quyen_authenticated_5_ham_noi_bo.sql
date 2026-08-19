-- THU QUYỀN `authenticated` Ở 5 HÀM NỘI BỘ — bịt 4 lỗ CHÉO TIỆM đã đo được.
--
-- ═══════════════════════════════════════════════════════════════════
-- NGUYÊN NHÂN GỐC: một lỗi cơ chế, lặp lại 5 lần
-- ═══════════════════════════════════════════════════════════════════
-- Postgres cấp EXECUTE cho PUBLIC trên MỌI hàm mới. Supabase thêm `anon`,
-- `authenticated`, `service_role` vào PUBLIC. Các migration trước viết:
--
--     revoke execute on function public.<ham>(...) from public, anon;
--
-- Câu đó thu quyền của vai `public` và `anon` — nhưng `authenticated` đã được
-- cấp RIÊNG, nên nó GIỮ NGUYÊN quyền. Đây đúng là bài học đã ghi ở #191:
-- **"đã thu quyền" KHÔNG có nghĩa là "gọi không được nữa"** — phải ĐO lại bằng
-- has_function_privilege, không đọc câu lệnh rồi tin.
--
-- Cả 5 hàm dưới đây là hàm NỘI BỘ: đã tìm toàn bộ app/, lib/, components/ —
-- KHÔNG một dòng mã ứng dụng nào gọi chúng. Chúng chỉ được trigger và các hàm
-- CSDL khác gọi, mà những chỗ đó đều `security definer` nên chạy bằng quyền chủ
-- sở hữu, không cần quyền của người đăng nhập. Quyền này chưa bao giờ được ai
-- cố ý mở — nó tự rơi vào.
--
-- ═══════════════════════════════════════════════════════════════════
-- ĐÃ ĐO, KHÔNG ĐOÁN — đóng vai người thật (`set role authenticated` +
-- request.jwt.claims giả lập, y hệt asUser() trong rls-smoke), người đóng vai
-- KHÔNG hề là thành viên tiệm B. Mọi phép thử đều rollback.
-- ═══════════════════════════════════════════════════════════════════
--
--  1. loyalty_config_get(uuid) — ĐỌC TRỘM. Vai `viewer` (thấp nhất) của tiệm A
--     gọi với id tiệm B, nhận nguyên cấu hình điểm thưởng của B. Hàm còn
--     `insert ... on conflict do nothing` nên TẠO được dòng cấu hình cho tiệm
--     bất kỳ.
--
--  2. loyalty_settle_return(uuid) — GHI TRỘM + LỘ. `select * into v_don from
--     orders where id = p_return_order_id` không lọc tiệm. Người tiệm A gọi với
--     phiếu hoàn của tiệm B: hàm trả về số điểm trong ví khách của B, ghi thêm
--     dòng vào sổ điểm của B, và **xoá 500 điểm của khách tiệm B**.
--
--  3. commission_sinh_cho_hop_dong(uuid, boolean) — GHI TRỘM. Gọi với
--     p_reversal = true trên hợp đồng tiệm B ⇒ hoa hồng 1.000.000đ của nhân
--     viên tiệm B bị TRIỆT TIÊU về 0 bởi người ngoài.
--
--  4. commission_sinh_cho_don(uuid) — GHI TRỘM. Số dòng hoa hồng của tiệm B
--     đi từ 1 lên 2.
--
--  5. tenant_open_now(uuid) — NHẸ, khác loại. Chỉ trả "đang mở cửa hay không",
--     gần như công khai (trang mặt tiền có). Nhưng nó là hàm được cấp quyền
--     CÓ CHỦ Ý, và mã ứng dụng vẫn không gọi thẳng — chỉ `ai_autopilot_decide`
--     (definer, `authenticated` KHÔNG gọi được) gọi nó. Thu quyền cho đồng bộ.
--
-- ĐƯỜNG KHAI THÁC THẬT: cần biết trước uuid tiệm. `storefront_view` (cửa công
-- khai) không trả uuid. NHƯNG `my_tenants()` trả tenant_id của mọi tiệm mình
-- TỪNG thuộc — tức **nhân viên đã bị gỡ khỏi tiệm** mất quyền RLS nhưng vẫn
-- nhớ uuid, và 5 hàm trên không kiểm tư cách thành viên lấy một lần.

revoke execute on function public.loyalty_config_get(uuid)                      from public, anon, authenticated;
revoke execute on function public.loyalty_settle_return(uuid)                   from public, anon, authenticated;
revoke execute on function public.commission_sinh_cho_hop_dong(uuid, boolean)   from public, anon, authenticated;
revoke execute on function public.commission_sinh_cho_don(uuid)                 from public, anon, authenticated;
revoke execute on function public.tenant_open_now(uuid)                         from public, anon, authenticated;

comment on function public.loyalty_config_get is
  'NỘI BỘ — chỉ trigger/hàm CSDL definer gọi. KHÔNG cấp cho authenticated: hàm không lọc tiệm, cấp là đọc trộm cấu hình điểm tiệm khác (#196).';
comment on function public.loyalty_settle_return is
  'NỘI BỘ — trigger phiếu hoàn gọi. KHÔNG cấp cho authenticated: hàm không lọc tiệm, cấp là xoá được điểm khách của tiệm khác (#196).';
comment on function public.commission_sinh_cho_hop_dong is
  'NỘI BỘ — trigger hợp đồng gọi. KHÔNG cấp cho authenticated: hàm không lọc tiệm, cấp là triệt tiêu được hoa hồng nhân viên tiệm khác (#196).';
comment on function public.commission_sinh_cho_don is
  'NỘI BỘ — trigger đơn hàng gọi. KHÔNG cấp cho authenticated: hàm không lọc tiệm (#196).';
comment on function public.tenant_open_now is
  'NỘI BỘ — ai_autopilot_decide (definer) gọi. Mã ứng dụng KHÔNG gọi thẳng (#196).';
