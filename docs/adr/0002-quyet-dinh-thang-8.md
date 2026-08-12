# ADR-0002 — Các quyết định đã chốt trong tháng 8/2026 (ghi bù 10/08)

Nối tiếp ADR-0001. Mỗi mục: bối cảnh → chọn gì → vì sao. Đổi = viết ADR mới, không sửa bản cũ.

1. **Vùng máy chủ: Singapore, không phải Mumbai.**
   Bối cảnh: dự án Supabase ban đầu đặt Mumbai; đo tay bắt tay TCP tới pooler cho thấy Mumbai ~191ms còn Singapore ~49ms từ VN (đo qua CDN edge từng cho kết quả sai vì chỉ chạm edge, không chạm DB).
   Chọn: chuyển toàn bộ sang project Singapore, web Vercel đặt `sin1`, Mumbai tạm dừng (10/08) — chỉ khôi phục khi cần đối chiếu.
   Vì sao: khách hàng mục tiêu 100% ở VN; độ trễ DB là thứ người dùng cảm nhận trực tiếp ở Inbox.

2. **Đường xác nhận email 2 chế độ (`/auth/confirm` nhận cả `code` lẫn `token_hash`).**
   Bối cảnh: Supabase free tier không cho sửa mẫu email (báo lỗi 400) và giới hạn 2 thư/giờ; link trong mẫu mặc định có dạng khác link PKCE.
   Chọn: một route xử lý cả hai dạng, kèm lọc tham số `next` chống chuyển hướng mở.
   Vì sao: không thể kiểm soát mẫu thư → phải chấp nhận mọi dạng link hợp lệ mà Supabase gửi. Lối thoát thật là dịch vụ thư riêng (Resend, task #44).

3. **Sau đăng nhập về "Hôm nay" (`/app/today`), không về Tổng quan.**
   Vì sao: nhân viên mở app để biết *hôm nay gọi ai, việc gì trễ* — không phải để xem biểu đồ. Riêng luồng tạo tiệm mới vẫn về `/app` để hiện thẻ chọn ngành.

4. **Hệ thẻ thiết kế: bản gốc nằm trong git (`design-system/`), claude.ai chỉ là bản chiếu.**
   Bối cảnh: thẻ trên claude.ai từng lệch với app thật (VIP vẽ xanh dương trong khi token thật là hổ phách).
   Chọn: mọi thẻ phải quy đổi màu thẳng từ token oklch trong `app/globals.css` (script quy đổi trong scratchpad, đã kiểm chứng khớp primary 100%); máy kiểm `check-ds.mjs` gác cổng bảng màu + định dạng; sửa thẻ = sửa trong git rồi đồng bộ lên.
   Vì sao: thẻ tả trí nhớ sẽ mục; thẻ tả code thì tự đúng theo code.

5. **Go-global: mỗi ngôn ngữ một URL + gợi ý theo Accept-Language, KHÔNG tự chuyển hướng theo IP.**
   Bối cảnh: founder thấy site nước ngoài tự nhận diện IP đổi ngôn ngữ.
   Chọn: URL riêng từng ngôn ngữ, banner gợi ý đổi ngôn ngữ theo trình duyệt, cookie ghi nhớ; IP chỉ dùng cho tiền tệ/vùng. (Ghi nhận ở task #45, làm sau khi có khách đầu tiên.)
   Vì sao: tự chuyển hướng theo IP giết SEO (Google bot ở Mỹ chỉ thấy bản tiếng Anh) và phá quyền tự chọn của người dùng.

6. **Hướng app di động: PWA "cảm giác iOS", không làm app native.**
   Chọn: manifest + service worker (Serwist) + đẩy thông báo iOS 16.4+ (sau khi người dùng Thêm vào màn hình chính); tận dụng bottom-nav và safe-area đã có.
   Vì sao: không cần tài khoản Apple Developer, một mã nguồn, ra tính năng nhanh — đúng giai đoạn chưa có khách trả tiền. (Task #50.)

7. **Kênh nhắc việc nhân viên: Zalo Bot Platform (bot.zapps.me), không chờ OA.**
   Bối cảnh: OA cần pháp nhân + duyệt; đã xác minh Zalo Bot là thật, miễn phí 3 bot / 50 người / 3000 tin/tháng, không cần duyệt OA.
   Chọn: nhắc SLA/việc trễ/phiếu duyệt qua Zalo Bot trước; OA vẫn là kênh nhắn KHÁCH sau này. Founder tự tạo bot (AI không tạo tài khoản hộ). (Task #53.)

8. **Phân loại lỗi thống nhất 3 nhóm — mọi chỗ báo lỗi phải xếp vào một nhóm:**
   (a) *Lỗi người dùng* (nhập sai, thiếu quyền) → báo ngay trên màn, lời lẽ dễ hiểu, không cảnh báo hệ thống;
   (b) *Lỗi hệ thống* (bug, job nền hỏng, cấu hình thiếu) → cảnh báo tức thời cho đội kỹ thuật (kênh nhắc riêng — task #52), người dùng chỉ thấy "có trục trặc, đã ghi nhận";
   (c) *Lỗi đối tác* (Zalo, Supabase, cổng thanh toán sập/chậm) → hiện trạng thái "kênh X đang gián đoạn", tự thử lại có biên nhận chống trùng, không đổ lỗi cho người dùng.
   Vì sao: học từ FlowX — trộn 3 loại này làm một là nguồn gốc của lỗi ngầm và cảnh báo rác.

## Điều kiện xem lại

- **Khi Resend chạy thật (task #44)** ⇒ mục 2 hết lý do tồn tại ở dạng hiện tại: kiểm lại xem còn cần nhận cả hai dạng link không, và gỡ nhánh thừa. Đây là nợ có ngày đáo hạn, không phải thiết kế vĩnh viễn.
- **Khi Zalo đổi hạn mức Bot Platform** (nay: 3 bot / 50 người / 3.000 tin mỗi tháng) ⇒ mục 7 và toàn bộ ADR-0007 dựa lên nó.
- **Khi Zalo OA cắm xong** ⇒ mục 7 câu cuối thành hiện thực: OA nhận phần nhắn KHÁCH, Bot giữ phần nhắn NHÂN VIÊN. Đi cùng ADR-0009 mục 9.
- **Khi mở bán ra ngoài Việt Nam** ⇒ mục 5 (go-global) chuyển từ ghi-nhận sang phải-làm; task #45.
- **Khi Supabase cho sửa mẫu email ở gói đang dùng** ⇒ mục 2 xem lại.
