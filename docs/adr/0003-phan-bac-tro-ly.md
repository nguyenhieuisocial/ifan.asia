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

## Điều kiện xem lại

*(Sửa 17/08 — xem khung "hai lỗi của chính mục này" ngay bên dưới.)*

- **Khi mở một đợt lớn mới** ⇒ thử lại việc ép model cho trợ lý nền. **Phép thử là một câu, không phải một script:** gọi một trợ lý nền bất kỳ kèm `model` override và xem nó có chết lúc khởi động không. Chết ⇒ mục này còn đúng. Sống ⇒ chuyển trợ lý nền sang phân vai model như founder muốn ban đầu, và viết ADR mới.
- **Khi harness báo đã sửa lỗi gắn đuôi tên model** (`-thinking`, `-thinking[1m]`) ⇒ toàn bộ lý do tồn tại của quyết định này biến mất. Đo lúc quyết 10/08: lỗi tái hiện ở **cả 3 đường** (agent Explore · agent thường · agent trong workflow); tái xác nhận 13/08.
- **Khi founder đổi cách phân vai của PHIÊN CHÍNH** (Opus kiến trúc/thiết kế · Sonnet chỉ code · Fable gọi riêng) ⇒ đọc lại khung đầu file. Đây là **luật về hành vi của chính founder**, trợ lý không được tự sửa — nhưng khi founder đổi thì khung đầu file phải đổi theo, không được để hai nơi nói hai kiểu.
- **Khi bậc `effort` không còn phân biệt được chi phí thật** (đo bằng token thực chi, không phải cảm giác) ⇒ cần gạt đang dùng hết tác dụng, phải tìm cần gạt khác.

> ⚠️ **Hai lỗi của chính mục này, bắt được 17/08 — đáng ghi lại vì cả hai đều là "trigger nhìn thì có, dùng thì không".**
>
> 1. **Viết sai khuôn nên công cụ soát không thấy.** Bản cũ viết điều kiện thành một đoạn văn xuôi mở đầu bằng *"Điều kiện xem lại (ghi rõ để...)"*, không phải tiêu đề `## Điều kiện xem lại` như luật README quy định. Hệ quả: `scripts/adr-dieu-kien-xem-lai.mjs` báo ADR-0003 **"KHÔNG CÓ mục điều kiện xem lại"** ở **mọi lần chạy** — trong khi nó có. Đã chọn sửa file cho đúng khuôn, **không** nới công cụ cho dễ tính: một công cụ chấp nhận mọi hình dạng thì không còn phát hiện được gì.
> 2. **Trỏ vào một script chưa từng tồn tại.** Bản cũ ghi *"chạy lại phép thử model-override 0-token (script test-model-override đã lưu)"*. Tìm cả kho code lẫn toàn bộ lịch sử git: **không có file nào tên như vậy, chưa bao giờ có.** Điều kiện xem lại trỏ vào một công cụ không tồn tại thì **không ai chạy được**, mà đọc lên vẫn thấy rất chắc chắn. Đây là lần thứ hai trong một ngày dự án dính đúng bệnh này (lần đầu: `check-ds.mjs` — cổng soát thẻ design mà 111 thẻ đã "qua" trong khi nó chưa từng tồn tại).
>
> **Bài học chung:** trigger phải **tự đứng được**. Nếu nó cần một công cụ, công cụ đó phải có thật và phải kiểm được là có thật; nếu không có công cụ thì viết thẳng phép thử ra bằng lời — như đã sửa ở gạch đầu dòng thứ nhất.
