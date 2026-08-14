# ADR-0003 — Phân bậc trợ lý để tối ưu token (10/08/2026)

> ⚠️ **ĐỌC KHUNG NÀY TRƯỚC — file này nói về TRỢ LÝ CON, không phải về phiên chính** (đính chính 14/08, Opus).
>
> Câu *"phân bậc bằng effort **thay cho** phân vai model"* bên dưới rất dễ bị đọc thành *"iFan không
> phân vai model"* — **SAI**. Hai chuyện khác nhau, cùng tồn tại:
>
> | | Ai đổi model | Trạng thái |
> |---|---|---|
> | **Phiên chính** (Opus/Sonnet/Fable) | **FOUNDER tự đổi bằng tay** | ✅ **ĐANG ÁP DỤNG** — chốt 11–12/08, xem `00 Trang chủ.md` mục 6 + file master mục 14. Opus = kiến trúc/hoạch định/**thiết kế**/review · Sonnet = **CHỈ** code & sửa lỗi · Fable = nghĩ khi được gọi riêng. |
> | **Trợ lý con** (agent nền) | Trợ lý tự ép model | ❌ **HỎNG, không dùng** — đúng như file này đo 10/08; tái xác nhận 13/08 (ép `model: "sonnet"` cho agent nền là chết ngay). Nên agent nền vẫn phân bậc bằng `effort`. |
>
> Nói gọn: **file này vẫn đúng nguyên vẹn cho trợ lý con.** Nó chỉ không phải là căn cứ để bỏ luật
> phân vai của phiên chính — luật đó là **luật về hành vi của chính founder**, và trợ lý không được
> sửa (xem `00 Trang chủ.md` mục 6, khung cảnh báo 13/08).
>
> Và đọc kèm **ADR-0004**: không tự gọi trợ lý nền khi founder chưa bảo — kể cả lúc đang có "toàn quyền".

Bối cảnh: founder yêu cầu phân vai model theo việc (nghĩ = Fable 5, code = Sonnet 5, soát = Opus 5) để tối ưu token. Trước khi hứa, thử thật 2 phép (đều tí hon, gần 0 chi phí):

1. **Đổi model cho trợ lý con — LỖI HỆ THỐNG** (10/08): harness gắn đuôi tên model sai
   ("claude-sonnet-4-6-thinking", "claude-opus-4-6-thinking[1m]" — không tồn tại), trợ lý chết
   ngay khi khởi động. Lỗi tái hiện ở cả 3 đường: agent Explore, agent thường, agent trong workflow.
2. **Chỉnh mức suy nghĩ (effort) — CHẠY TỐT**: low và high đều trả kết quả đúng.

Chọn: **phân bậc bằng effort trên cùng Fable 5** (kế thừa phiên), thay cho phân vai model:
- `effort: low` — việc cơ khí: đếm/liệt kê, sửa chuỗi dịch, viết thẻ theo mẫu có sẵn, di chuyển file, chạy checker.
- mặc định (kế thừa) — thi công tính năng thường.
- `effort: high` — thiết kế/kiến trúc, phản biện "làm để đó", kiểm chứng đối chiếu nguồn, việc dính bảo mật/tiền.

Vì sao: đạt đúng mục tiêu (chi token theo độ nặng của việc) bằng cần gạt đang hoạt động; không
chọn giải pháp đang hỏng rồi đổ tại hệ thống.

Điều kiện xem lại (ghi rõ để trigger không "nổ im lặm" như bài học FlowX §5.3): mỗi khi mở một
chiến dịch lớn mới, chạy lại phép thử model-override 0-token (script test-model-override đã lưu);
hệ thống sửa lỗi thì chuyển sang phân vai model như founder muốn và viết ADR mới.
