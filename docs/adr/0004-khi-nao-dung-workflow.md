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
4. Đã lỡ chạy workflow thì cho chạy hết — giết giữa chừng lãng phí hơn.
