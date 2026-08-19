-- V6 (19/08/2026) — BỊT LỖ TIỀN: trần giảm giá bị ĐI VÒNG HOÀN TOÀN.
--
-- ════════════════════════════════════════════════════════════════════
-- LỖ LÀ GÌ
-- ════════════════════════════════════════════════════════════════════
-- Migration #165 dựng đủ bộ trần giảm giá theo vai: bảng `discount_caps`
-- (nhân viên 5%, quản lý 15%, quản trị 100%, chủ tiệm không trần), bảng phiếu
-- `discount_approvals`, hai hàm `discount_request` / `discount_decide`.
--
-- Nhưng đo lại ngày 19/08: **KHÔNG chỗ nào trong `app/`, `lib/`, `components/`
-- gọi tới ba thứ đó.** Màn Đơn hàng ghi thẳng:
--
--     insert into order_lines (…, discount_vnd) values (…, <số người dùng gõ>)
--
-- với ô nhập tự do, chỉ chặn bằng zod `min(0).max(ORDER_LINE_PRICE_MAX)`.
-- Trên `order_lines` có 4 trigger (`snapshot_cost`, `lock_guard`, `sign_guard`,
-- `tenant_guard`) và KHÔNG cái nào nhìn tới trần.
--
-- ⇒ Nhân viên vai `staff` tự giảm bao nhiêu tuỳ ý, không ai biết cho tới lúc
--   xem lãi cuối tháng. Trần theo vai đang là chữ trên giấy.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO CHẶN Ở CSDL CHỨ KHÔNG CHỈ SỬA TẦNG WEB
-- ════════════════════════════════════════════════════════════════════
-- Bản vá tầng web (cho màn Đơn hàng đi qua `discount_request`) là cần, nhưng
-- KHÔNG đủ, vì `order_lines` mở ghi cho chính người dùng qua PostgREST: policy
-- `order_lines_write` cho `staff` ghi mọi dòng của ĐƠN MÌNH TẠO — mà nhân viên
-- bán hàng thì đơn nào cũng do chính họ tạo. Ai có token đăng nhập là gọi
-- thẳng được REST API, không cần đi qua màn hình:
--
--     PATCH /rest/v1/order_lines?id=eq.<id>   {"discount_vnd": 900000}
--
-- Luật chỉ có thật khi nó nằm ở chỗ KHÔNG đi vòng được. Đây là cùng bài học đã
-- ghi ở `order_lines_lock_guard` (#127): *"đơn completed thì CSDL khoá — không
-- phải giao diện khoá"*.
--
-- ════════════════════════════════════════════════════════════════════
-- VÌ SAO VẪN GIỮ ĐƯỢC LUẬT "KHÔNG CHẶN CỨNG"
-- ════════════════════════════════════════════════════════════════════
-- Luật gốc ở đầu #165: *"Vượt trần thì KHÔNG chặn cứng mà chuyển sang chờ
-- duyệt; chặn cứng là nhân viên mất khách ngay trước mặt."*
--
-- Trigger này KHÔNG mâu thuẫn với luật đó, vì hai tầng nói hai chuyện khác nhau:
--   · Tầng NGHIỆP VỤ (`discount_request`, tầng web gọi nó): vượt trần ⇒ ra
--     nhánh "đã gửi chờ duyệt", nhân viên vẫn nói được với khách "em xin sếp
--     một phút". KHÔNG có thông báo lỗi cụt nào ở đây.
--   · Tầng CSDL (trigger này): chỉ đóng ĐƯỜNG GHI THÔ — đường mà không người
--     bán hàng nào đi qua, chỉ có người cố tình lách API mới đi.
-- Người dùng bình thường KHÔNG BAO GIỜ chạm tới lỗi của trigger này. Nếu họ
-- chạm phải, đó là dấu hiệu tầng web còn một đường ghi thẳng chưa nối — và lời
-- lỗi nói thẳng phải dùng `discount_request` để người sửa biết đường.
--
-- ════════════════════════════════════════════════════════════════════
-- BỐN CỬA MIỄN — mỗi cửa là một nghiệp vụ THẬT đang chạy, chặn là gãy
-- ════════════════════════════════════════════════════════════════════
--  ① `app_role()` null / vai lạ — hàm nền, seed, job, kết nối quản trị. Chặn ở
--    đây là gãy các đường nội bộ mà không được lợi gì (chúng không phải nhân
--    viên đang giảm giá cho khách).
--
--  ② Ghi ĐẾN TỪ MỘT HÀM SECURITY DEFINER của hệ — nhận ra bằng `current_user`
--    đang là CHỦ SỞ HỮU bảng `order_lines`. Đo thật trên CSDL này (19/08):
--    ghi thẳng qua PostgREST thì trong trigger `current_user='authenticated'`;
--    ghi từ trong một hàm security-definer thì `current_user='postgres'`.
--    (Không so `current_user <> session_user`: PostgREST nối bằng vai
--    `authenticator` rồi `set role authenticated`, nên hai vai LUÔN khác nhau
--    kể cả ở đường ghi thô — so như vậy là mở toang cửa.)
--    Vì sao PHẢI có cửa này: `voucher_apply` (#159) phân bổ tiền voucher xuống
--    `order_lines.discount_vnd` — mã "giảm 30%" của chính tiệm phát hành, do
--    nhân viên gõ vào, hoàn toàn hợp lệ và KHÔNG liên quan tới trần cá nhân.
--    Không có cửa này thì tính năng voucher chết ngay.
--    Cửa này an toàn vì mọi hàm đi qua đây đều đã `revoke from public, anon` và
--    tự kiểm luật của nó: `discount_request` kiểm trần, `discount_decide` kiểm
--    phiếu + trần người duyệt, `voucher_apply` kiểm mã + lượt + hạn.
--    ⚠️ Hệ quả: trigger này CỐ Ý *không* `security definer`. Trong một hàm
--    definer thì `current_user` luôn là chủ hàm, nên đặt definer là tự làm mù
--    chính mình. Nó đọc `orders`/`discount_caps`/`discount_approvals` bằng
--    quyền người gọi — cả ba bảng đều có policy SELECT cho cả tiệm nên đọc được.
--
--  ③ Dòng đã có PHIẾU DUYỆT `approved` khớp đúng số tiền. Không có cửa này thì
--    `discount_decide` bị chính trigger của mình chặn nếu nó không còn chạy
--    dưới dạng security-definer (hoặc nếu giá dòng đổi sau lúc xin, làm tỷ lệ
--    tính lại vọt lên trên trần người duyệt). Đây là lớp phòng thủ thứ hai của
--    cửa ②, cố ý trùng.
--
--  ④ ĐƠN HOÀN/TRẢ HÀNG (`orders.kind = 'return'`). `createReturn` ở
--    `app/app/orders/actions.ts` chép `discount_vnd` theo tỷ lệ từ dòng gốc —
--    dòng gốc đó ĐÃ qua duyệt rồi, và dòng hoàn có `qty` ÂM nên "tỷ lệ giảm"
--    tính ra vô nghĩa. Chặn là gãy nghiệp vụ trả hàng đang chạy.
--    Giới hạn biết trước, ghi ra chứ không giấu: ai cố tình dựng một đơn
--    `kind='return'` rồi nhét giảm giá lớn vào thì trigger này không bắt. Đó là
--    lỗ KHÁC (kiểm số lượng hoàn so với đơn gốc), thuộc `createReturn`.
--
-- ════════════════════════════════════════════════════════════════════
-- CANH THÊM CẢ `qty` VÀ `unit_price_vnd` — không chỉ `discount_vnd`
-- ════════════════════════════════════════════════════════════════════
-- Trần là một TỶ LỆ, nên chỉ canh tử số là để hở mẫu số: ghi giảm 50.000đ trên
-- dòng 1.000.000đ (5%, lọt trần) rồi sửa `unit_price_vnd` xuống 100.000đ là
-- thành 50% — cùng một khoản tiền, cùng một người, không trigger nào kêu.
-- Hôm nay tầng web chưa có đường sửa giá dòng, nhưng đường REST thô thì có, và
-- đường REST thô chính là thứ trigger này sinh ra để đóng.
-- Dòng CŨ đã vượt trần từ trước (nếu có) không bị đụng: sửa mà cả ba cột đều
-- không đổi thì bỏ qua.

-- ════════════════════════════════════════════════════════════════════
create or replace function public.order_lines_discount_cap_guard()
returns trigger
language plpgsql
-- CỐ Ý KHÔNG `security definer` — xem cửa ② ở trên.
set search_path = public, pg_temp
as $$
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

  v_goc := new.qty * new.unit_price_vnd;
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

comment on function public.order_lines_discount_cap_guard() is
  'Đóng ĐƯỜNG GHI THÔ của trần giảm giá (#165). Vượt trần thì đi qua discount_request để ra nhánh chờ duyệt — trigger này chỉ chặn ghi thẳng discount_vnd/qty/unit_price_vnd qua REST. Miễn: vai hệ thống, hàm security-definer của hệ (voucher_apply…), dòng đã có phiếu duyệt khớp, đơn hoàn.';

drop trigger if exists order_lines_discount_cap_guard on public.order_lines;
create trigger order_lines_discount_cap_guard
  before insert or update of discount_vnd, qty, unit_price_vnd on public.order_lines
  for each row execute function public.order_lines_discount_cap_guard();
