# ADR-0023 — Khách dùng điểm tích luỹ: đó là TRẢ TIỀN, không phải giảm giá

**Ngày:** 19/08/2026 · **Trạng thái:** đã chốt, nền CSDL đã áp (migration #194), tầng web đang nối

---

## 1. Vì sao phải quyết, thay vì cứ làm

Mảng tích điểm đang chạy **một chiều**: máy cộng điểm cho khách đúng (`loyalty_earn_for_order` được gọi thật ở màn Đơn hàng), nhưng `loyalty_redeem` **không chỗ nào gọi** — đo 19/08: 0 lời gọi trong `app/`, `lib/`, `components/`. Đối chứng để chắc phép tìm không sai: `loyalty_earn_for_order` ra 2 lời gọi.

Nghĩa là **điểm chỉ tăng, không tiêu được**. Với khách đó là lời hứa suông; với tiệm đó là một khoản nợ chỉ phình ra.

Nối vào thì phải trả lời một câu không né được: **khi khách tiêu điểm, số tiền đó vào sổ sách với tư cách gì?** Hai cách, và chúng cho ra **báo cáo khác nhau**, nên không thể chọn bừa rồi sửa sau.

---

## 2. Hai cách, và vì sao chọn cách thứ hai

### Cách A — điểm thành GIẢM GIÁ trên dòng hàng

Giống hệt voucher: chia số tiền quy đổi về từng dòng, cộng vào `order_lines.discount_vnd`.

**Bị loại vì hai thứ đã có sẵn trong kho, không phải vì tôi thấy không thích:**

1. **Thẻ design chốt "điểm là NỢ"** (`design-system/man-voucher-tich-diem.html`, quyết định 4). Sổ điểm là append-only, mỗi lần cộng là một lô mang hạn riêng, và có hẳn view `loyalty_debt` quy thẳng số điểm đang lưu hành ra tiền. Khách tiêu điểm là tiệm **trả** món nợ đó — không phải bán rẻ đi.
   Ghi thành giảm giá thì **doanh thu tụt xuống trong khi khoản nợ vẫn nằm nguyên trong sổ điểm**: nhìn báo cáo tưởng bán ế, nhìn sổ điểm tưởng còn nợ. Đúng loại "số liệu đá nhau" mà kho này đã tốn rất nhiều công dập.

2. **Kho cố ý KHÔNG có giảm giá cấp đơn** (ghi ở chính thẻ đó). Muốn nhét điểm vào thì phải chia nhỏ về từng dòng, và khi đó nó **đụng trần giảm giá theo vai** (migration #183, cùng ngày): một khoản khách **tự trả bằng điểm của chính mình** mà nhân viên phải xin quản lý duyệt là vô nghĩa. Muốn tránh thì phải mở thêm một cửa miễn nữa trong chốt trần — mỗi cửa miễn là một chỗ để lọt.

### Cách B — điểm thành một CÁCH TRẢ TIỀN ✅ CHỌN

`order_payments.method` thêm giá trị thứ tư: `points`.

- Doanh thu (`order_lines`) **không đổi** — bán bao nhiêu vẫn là bấy nhiêu.
- Lãi gộp **không đổi** — đã kiểm: `lib/finance/gross-margin.ts` tính từ `order_lines`, không đọc `order_payments`.
- "Đã trả bao nhiêu / còn thiếu bao nhiêu" của đơn **tự đúng**, vì `paidVnd` vốn đã là tổng `order_payments`.
- Khoản nợ điểm giảm đi đúng bằng số đã tiêu — sổ điểm và sổ bán hàng khớp nhau.

---

## 3. Hệ quả PHẢI chặn kèm theo: sổ quỹ

`order_payments_emit_cash_entry` xưa nay sinh một phiếu **thu** cho **mọi** lần trả tiền. Điểm không phải tiền mặt cũng không phải chuyển khoản — **không đồng nào vào két**.

Để nguyên là **sổ quỹ phình lên bằng tiền không tồn tại**, và chủ tiệm đếm két cuối ngày sẽ thiếu đúng bằng số điểm khách đã tiêu. Đây mới là chỗ nguy hiểm thật của quyết định này, nguy hơn cả việc chọn A hay B.

Đã vá trong cùng migration: trigger bỏ qua `method = 'points'`.

**Đã đo, không đoán** (giao dịch thử rồi huỷ, trên CSDL thật):

| Phép thử | Kết quả |
|---|---|
| Ghi khoản trả bằng `points` | qua — ràng buộc đã mở đúng |
| Sổ quỹ sau khi ghi | **không sinh dòng nào** |
| **Đối chứng:** trả tiền mặt | **vẫn sinh phiếu quỹ** — chứng minh không phải tôi làm hỏng cả trigger |
| Cách trả bịa đặt | bị chặn |

Phép đối chứng là phần quan trọng nhất của bảng này: không có nó thì "không sinh dòng nào" có thể chỉ vì trigger đã chết hẳn.

---

## 4. Một cửa duy nhất, không hai lời gọi

Tầng web **không** được gọi `loyalty_redeem` rồi tự chèn `order_payments`. Giữa hai lời gọi mà đứt mạng là **khách mất điểm nhưng đơn không được trừ tiền**, và không có đường nào lần ra.

Gộp vào `loyalty_redeem_for_order(p_order_id, p_points)` — trừ điểm và ghi khoản trả trong **cùng một giao dịch**.

Hàm trả `jsonb {ok, ly_do?}` chứ không ném lỗi cho các nhánh nghiệp vụ bình thường (không đủ điểm · đơn đã chốt · đơn không gắn khách · chưa bật tích điểm · không đúng bội số · vượt số còn thiếu). Cùng khuôn `voucher_check` và `discount_request`: **người bán hàng cần đọc được LÝ DO**, không phải một câu lỗi kỹ thuật.

Kèm một chốt dễ bỏ sót: **không cho trả quá số còn thiếu của đơn**. Dư ra là tiệm nợ khách tiền mặt, mà cả hệ này không có đường hoàn tiền bằng điểm.

---

## 5. Điều kiện xem lại

Quyết định này sai nếu một trong các điều sau xảy ra:

- Có tiệm thật muốn **báo cáo doanh thu đã trừ phần khách trả bằng điểm** (tức coi điểm là chiết khấu bán hàng, không phải trả nợ). Khi đó phải thêm một cột phân tách trong báo cáo, **không** đảo lại cách ghi.
- Cần **hoàn tiền mặt cho điểm** — hiện cố ý không có; nếu có thì `vuot_so_con_thieu` phải xét lại.
- Kế toán thuế yêu cầu phần trả bằng điểm xuất hiện trong sổ quỹ dưới dạng khác. Chưa có yêu cầu này vì chưa bán cho khách thật.

---

## 6. Còn thiếu, ghi ra để không ai tưởng đã có

- **Hoàn đơn không đụng gì tới điểm — cả hai chiều.** Đo được ở `loyalty_earn_for_order`: dòng `if v_order.kind <> 'order' then return 0` ⇒ đơn hoàn không tích điểm (đúng), nhưng cũng **không thu lại điểm đã tích ở đơn gốc**, và **không trả lại điểm khách đã tiêu**. Nghĩa là mua rồi trả hàng thì khách **giữ nguyên điểm đã được tặng** — một lỗ rò nhỏ nhưng có thật, và có sẵn từ trước bản này. Ghi thành việc theo dõi chứ không im lặng bỏ.
- **Màn hồ sơ khách** chưa hiện lịch sử "đã tiêu điểm ở đơn nào" — sổ điểm có ghi `order_id`, chỉ thiếu chỗ đọc.
