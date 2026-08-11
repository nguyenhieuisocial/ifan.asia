# ADR-0004 — Khi nào dùng workflow, khi nào dùng trợ lý đơn, khi nào tự làm (10/08/2026)

Bối cảnh: founder chỉ đạo hạn chế workflow khi không thực sự cần. Số đo ủng hộ: mỗi trợ lý con
có ~50–60k token phí khởi động bất kể việc to nhỏ (phép thử effort: 2 việc đếm-file tốn 115k).

Luật (bổ sung ADR-0003, không thay thế):
1. **Tự làm tại chỗ** — việc nhỏ, tuyến tính, ít file, hoặc kiểm tra nhanh (kể cả phép thử hệ
   thống): làm thẳng bằng tay + ctx_execute, KHÔNG spawn gì. Phép thử kiểu test-model-override
   từ nay chạy inline.
2. **Trợ lý đơn (sub-agent)** — một việc trọn gói cần đọc/sửa nhiều nhưng tuần tự (một tính năng
   lẻ, một cuộc điều tra, một bản kiểm kê): 1 agent, không workflow.
3. **Workflow CHỈ khi** hội đủ ít nhất một: (a) fan-out thật ≥4 đơn vị việc độc lập chạy song
   song; (b) cần bàn phản biện/kiểm chứng nhiều góc; (c) chạy dài nhiều rủi ro đứt — cần
   resume-from-cache (đã cứu 24 trợ lý hôm 10/08).
4. **Đã lỡ chạy thì CHO CHẠY HẾT** — giết giữa chừng lãng phí hơn: token đã tiêu vẫn mất, mà
   kết quả thì mất trắng. Áp dụng cho CẢ workflow LẪN trợ lý đơn, không có ngoại lệ "đằng nào
   cũng sắp bỏ". Muốn đổi hướng thì đợi nó xong rồi bỏ kết quả — vẫn rẻ hơn giết.

## Sửa sai 11/08 — chính tôi vi phạm điều 4

Founder nhắc hạn chế agent (lần thứ 3 trong ngày). Tôi vẫn spawn 2 trợ lý quét luồng user vì tự
nhủ "việc rà cả app đủ lớn để đáng dùng" — đó là tự bào chữa, không phải điều 2 cho phép. Rồi khi
bị nhắc tiếp, tôi GIẾT cả hai giữa chừng — vi phạm luôn điều 4 vốn đã viết sẵn từ 10/08. Một trong
hai trợ lý đã báo "tìm thấy chỗ đáng ngờ" ngay trước khi bị giết: mất trắng phát hiện đó.

Hai luật rút ra, đặt lên trước mọi phán đoán "việc này đủ lớn":
- **Founder đã nhắc hạn chế agent ⇒ mặc định là TỰ LÀM**, kể cả khi việc trông lớn. Muốn spawn
  thì phải nói trước lý do và để founder quyết, không tự quyết rồi báo sau.
- **Đo trước khi kết luận "việc này quá lớn để tự làm".** Bản quét thật sự tốn đúng 2 câu lệnh
  grep trên messages/vi.json (toàn bộ chữ người dùng thấy nằm gọn 1 file) và cho kết quả CHẮC
  CHẮN hơn trợ lý. Cảm giác "việc lớn" gần như luôn sai khi dữ liệu tập trung một chỗ.
