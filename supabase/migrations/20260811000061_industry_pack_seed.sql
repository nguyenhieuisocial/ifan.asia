-- ============================================================
-- iFan.asia — Migration #61: Nội dung 8 Industry Pack (V1a — Quy hoạch mục 16)
-- 6 pack mũi nhọn (spa/shop/kham/pet/fnb/retail) + education/other (giữ
-- NGUYÊN nội dung tag/quick-reply cũ từ seed_industry_template #12 — tenant
-- đang dùng 2 ngành này KHÔNG đổi hành vi).
--
-- KPI presets CHỈ 3 metric CÓ THẬT trong bảng kpi_targets (#59): revenue_won /
-- new_contacts / tasks_done — không hứa metric máy chưa đo được (bài học 29.2:
-- pack từng suýt hứa "khách quay lại"/"tái khám đúng hẹn" trước khi có máy đo).
--
-- modules: khai TRƯỚC cho V2+ (lịch hẹn, đơn hàng, kho...) — V1a CHƯA gate nav
-- theo modules (những module đó chưa tồn tại trong app); nav V1a hiện đủ các
-- mục đang có cho MỌI pack, chỉ đổi TỪ VỰNG. Ghi rõ để không hiểu nhầm là đã
-- xong "bật/tắt module" — đó là việc của V2 trở đi khi module thật ra đời.
-- ============================================================

insert into public.industry_packs (key, version, content) values
('spa', 1, '{
  "terminology": {"contact": "khách", "deal": "lịch/liệu trình", "deal_won": "đã làm dịch vụ"},
  "modules": ["booking", "packages", "commission"],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu dịch vụ"},
    {"metric": "new_contacts", "label": "Khách mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Tư vấn", "Hẹn lịch", "Đã đến làm", "Chăm sau"],
  "dashboard_layout": ["today_schedule", "contacts_need_care", "revenue_month"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Chăm da", "Triệt lông", "Gói liệu trình", "Đặt lịch", "Tái khám", "Khách VIP", "Hỏi giá", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào khách mới", "content": "Dạ em chào chị! Cảm ơn chị đã nhắn tin cho spa ạ. Chị đang quan tâm dịch vụ nào để em tư vấn mình luôn nha 🌸", "sort_order": 1},
      {"title": "Báo lịch trống", "content": "Dạ bên em còn trống khung [giờ] ngày [ngày] chị nha. Chị chốt khung nào để em giữ chỗ cho mình ạ?", "sort_order": 2},
      {"title": "Nhắc lịch hẹn", "content": "Dạ em nhắc lịch hẹn của chị vào [giờ] ngày [ngày] nha. Chị đến sớm 5-10 phút để được phục vụ chu đáo ạ. Nếu bận đột xuất, chị báo em sớm giúp em nhé!", "sort_order": 3},
      {"title": "Báo giá dịch vụ", "content": "Dạ dịch vụ [tên dịch vụ] bên em giá [giá] ạ. Hiện đang có ưu đãi [ưu đãi] cho khách đặt lịch trong tuần này, chị tranh thủ nha!", "sort_order": 4},
      {"title": "Hỏi thăm sau buổi làm", "content": "Dạ sau buổi [dịch vụ] hôm trước, da mình có ổn không chị ơi? Có gì lạ chị nhắn em liền để bên em hỗ trợ kịp thời nha. Chúc chị ngày mới xinh đẹp 💕", "sort_order": 5},
      {"title": "Nhắc buổi tiếp theo trong gói", "content": "Dạ chị ơi, mình sắp tới buổi tiếp theo trong gói liệu trình rồi ạ. Chị sắp xếp ghé trong tuần này để đạt hiệu quả tốt nhất nha, em giữ lịch giúp chị nhé?", "sort_order": 6}
    ]
  },
  "playbooks_hint": ["hỏi thăm sau 7 ngày", "nhắc chu kỳ 30-45 ngày theo dịch vụ"]
}'::jsonb),

('shop', 1, '{
  "terminology": {"contact": "khách", "deal": "đơn hàng tiềm năng", "deal_won": "chốt đơn"},
  "modules": ["orders", "shipping", "inventory"],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu chốt"},
    {"metric": "new_contacts", "label": "Khách mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Hỏi giá", "Chốt", "Giao hàng", "Thu tiền"],
  "dashboard_layout": ["orders_pending", "ads_profit_loss", "unanswered_messages"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Hỏi giá", "Chốt đơn", "Giao hàng", "Đổi trả", "Sỉ/CTV", "Hết hàng chờ về", "Khách thân thiết", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào khách + hỏi nhu cầu", "content": "Dạ shop chào mình ạ! Mình quan tâm mẫu nào, gửi giúp shop hình hoặc mã sản phẩm để em kiểm tra giá và tồn cho nhanh nha 💛", "sort_order": 1},
      {"title": "Báo giá + xin thông tin lên đơn", "content": "Dạ mẫu này giá [giá], còn đủ size/màu mình nha. Mình để lại tên + SĐT + địa chỉ, em lên đơn liền cho kịp chuyến hàng hôm nay ạ.", "sort_order": 2},
      {"title": "Xác nhận đơn", "content": "Dạ em xác nhận đơn của mình: [sản phẩm] - [giá], giao tới [địa chỉ]. Mình kiểm tra giúp em thông tin đúng chưa để em chuyển đóng gói luôn nha. Cảm ơn mình đã ủng hộ shop ạ!", "sort_order": 3},
      {"title": "Báo phí ship + thời gian giao", "content": "Dạ phí ship về [khu vực] là [phí], dự kiến [số] ngày nhận hàng ạ. Đơn từ [mức tiền] được freeship, mình gom thêm cho lợi ship nha 😉", "sort_order": 4},
      {"title": "Hướng dẫn đổi trả", "content": "Dạ shop hỗ trợ đổi/trả trong [số] ngày với hàng còn tag, chưa qua sử dụng ạ. Mình quay video lúc mở hàng để được hỗ trợ nhanh nhất nếu có lỗi nha.", "sort_order": 5},
      {"title": "Báo chính sách sỉ/CTV", "content": "Dạ shop có chính sách sỉ/CTV từ [số lượng] sản phẩm, chiết khấu tới [%]. Mình để lại SĐT/Zalo, em gửi bảng sỉ chi tiết cho mình tham khảo nha!", "sort_order": 6}
    ]
  },
  "playbooks_hint": ["xin đánh giá sau giao 3 ngày", "gợi ý mua lại chu kỳ 30-60-90 ngày"]
}'::jsonb),

('kham', 1, '{
  "terminology": {"contact": "bệnh nhân", "deal": "ca điều trị", "deal_won": "hoàn tất điều trị"},
  "modules": ["booking", "recall"],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu điều trị"},
    {"metric": "new_contacts", "label": "Bệnh nhân mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Tư vấn", "Đặt hẹn", "Đang điều trị", "Tái khám"],
  "dashboard_layout": ["today_schedule", "recall_due", "revenue_month"],
  "custom_fields": [{"key": "allergy_note", "label": "Tiền sử dị ứng", "type": "text"}],
  "sample_data": {
    "tags": ["Tư vấn", "Đặt hẹn", "Đang điều trị", "Tái khám", "Khách VIP", "Hỏi giá", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào bệnh nhân mới", "content": "Dạ phòng khám chào anh/chị! Cảm ơn anh/chị đã nhắn tin ạ. Anh/chị đang cần tư vấn vấn đề gì để em sắp xếp lịch khám phù hợp nha?", "sort_order": 1},
      {"title": "Báo lịch trống", "content": "Dạ phòng khám còn trống khung [giờ] ngày [ngày] ạ. Anh/chị chốt khung nào để em giữ lịch cho mình nha?", "sort_order": 2},
      {"title": "Nhắc lịch hẹn", "content": "Dạ em nhắc lịch hẹn của anh/chị vào [giờ] ngày [ngày] ạ. Anh/chị đến sớm 10 phút làm thủ tục giúp em nha. Có gì đột xuất anh/chị báo em sớm nhé!", "sort_order": 3},
      {"title": "Báo giá điều trị", "content": "Dạ liệu trình [tên] bên em giá [giá] ạ, gồm [số buổi] buổi. Anh/chị cần tư vấn thêm gì em hỗ trợ ngay nha.", "sort_order": 4},
      {"title": "Nhắc tái khám", "content": "Dạ anh/chị ơi, đã đến hẹn tái khám theo chỉ định rồi ạ. Anh/chị sắp xếp ghé trong tuần này để bác sĩ theo dõi kịp thời nha, em giữ lịch giúp mình nhé?", "sort_order": 5},
      {"title": "Hỏi thăm sau thủ thuật", "content": "Dạ sau khi làm [thủ thuật], anh/chị cảm thấy ổn không ạ? Có gì bất thường anh/chị nhắn em liền để bác sĩ hỗ trợ kịp thời nha.", "sort_order": 6}
    ]
  },
  "playbooks_hint": ["nhắc tái khám theo chỉ định", "hỏi thăm sau thủ thuật 2 ngày"]
}'::jsonb),

('pet', 1, '{
  "terminology": {"contact": "chủ nuôi", "deal": "lịch/liệu trình", "deal_won": "đã làm dịch vụ"},
  "modules": ["booking", "packages", "sub_profiles"],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu dịch vụ"},
    {"metric": "new_contacts", "label": "Chủ nuôi mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Tư vấn", "Hẹn lịch", "Đã đến làm", "Chăm sau"],
  "dashboard_layout": ["today_schedule", "pets_due_care", "revenue_month"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Tắm chải", "Cắt tỉa lông", "Khám thú y", "Đặt lịch", "Tái khám", "Khách VIP", "Hỏi giá", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào chủ nuôi mới", "content": "Dạ em chào anh/chị! Cảm ơn anh/chị đã nhắn tin ạ. Bé nhà mình cần dịch vụ gì để em tư vấn phù hợp nha 🐾", "sort_order": 1},
      {"title": "Báo lịch trống", "content": "Dạ bên em còn trống khung [giờ] ngày [ngày] ạ. Anh/chị chốt khung nào để em giữ chỗ cho bé nha?", "sort_order": 2},
      {"title": "Nhắc lịch hẹn", "content": "Dạ em nhắc lịch hẹn cho bé vào [giờ] ngày [ngày] ạ. Anh/chị đến sớm 5-10 phút giúp em nha. Có gì đột xuất báo em sớm nhé!", "sort_order": 3},
      {"title": "Báo giá dịch vụ", "content": "Dạ dịch vụ [tên dịch vụ] cho bé giá [giá] ạ. Hiện đang có ưu đãi [ưu đãi], anh/chị tranh thủ nha!", "sort_order": 4},
      {"title": "Nhắc lịch tiêm/tắm định kỳ", "content": "Dạ anh/chị ơi, bé nhà mình sắp tới hạn [tiêm/tắm] rồi ạ. Anh/chị sắp xếp ghé giúp em giữ lịch nha?", "sort_order": 5},
      {"title": "Hỏi thăm sau buổi làm", "content": "Dạ sau buổi [dịch vụ] hôm trước, bé nhà mình khỏe không ạ? Có gì lạ anh/chị nhắn em liền để hỗ trợ kịp thời nha 💕", "sort_order": 6}
    ]
  },
  "playbooks_hint": ["nhắc chu kỳ tắm 30 ngày", "nhắc tiêm theo mốc"]
}'::jsonb),

('fnb', 1, '{
  "terminology": {"contact": "khách", "deal": "đặt bàn/đặt trước", "deal_won": "đã phục vụ"},
  "modules": ["booking_table", "loyalty"],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu chốt"},
    {"metric": "new_contacts", "label": "Khách mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Hỏi", "Đặt bàn", "Đã đến", "Quay lại"],
  "dashboard_layout": ["today_bookings", "regulars_absent", "unanswered_messages"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Đặt bàn", "Đặt trước", "Khách quen", "Tiệc nhóm", "Hỏi giá/menu", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào khách + hỏi nhu cầu", "content": "Dạ quán chào mình ạ! Mình cần đặt bàn hay đặt món mang về để em hỗ trợ nha?", "sort_order": 1},
      {"title": "Xác nhận đặt bàn", "content": "Dạ em xác nhận bàn cho [số người] vào [giờ] ngày [ngày] ạ. Mình kiểm tra giúp em thông tin đúng chưa nha, em giữ bàn cho mình nhé!", "sort_order": 2},
      {"title": "Báo menu/giá", "content": "Dạ menu quán mình xem giúp em link/hình đính kèm nha. Mình cần tư vấn món nào em gợi ý thêm ạ.", "sort_order": 3},
      {"title": "Nhắc lịch đặt bàn", "content": "Dạ em nhắc bàn của mình vào [giờ] ngày [ngày] ạ. Có gì đột xuất mình báo em sớm giúp quán nha!", "sort_order": 4},
      {"title": "Cảm ơn sau khi ghé", "content": "Dạ cảm ơn mình đã ghé quán hôm nay ạ! Hẹn gặp lại mình lần sau nha, có góp ý gì mình cứ nhắn em để quán phục vụ tốt hơn ạ 🍽️", "sort_order": 5}
    ]
  },
  "playbooks_hint": ["cảm ơn sau ghé", "ưu đãi giờ chết thứ 3-5"]
}'::jsonb),

('retail', 1, '{
  "terminology": {"contact": "khách", "deal": "đơn hàng tiềm năng", "deal_won": "đã mua"},
  "modules": ["orders", "inventory", "loyalty"],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu chốt"},
    {"metric": "new_contacts", "label": "Khách mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Hỏi", "Giữ hàng", "Đã mua", "Quay lại"],
  "dashboard_layout": ["orders_pending", "loyalty_upgrade_soon", "unanswered_messages"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Hỏi giá", "Giữ hàng", "Đã mua", "Đổi trả", "Khách thân thiết", "Hết hàng chờ về", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào khách + hỏi nhu cầu", "content": "Dạ cửa hàng chào mình ạ! Mình quan tâm sản phẩm nào để em kiểm tra hàng còn tại quầy cho mình nha.", "sort_order": 1},
      {"title": "Báo giá + giữ hàng", "content": "Dạ sản phẩm này giá [giá], em giữ hàng cho mình đến [giờ] hôm nay nha. Mình ghé lấy hoặc để em giao giúp ạ?", "sort_order": 2},
      {"title": "Xác nhận đã mua", "content": "Dạ cảm ơn mình đã mua [sản phẩm] tại cửa hàng ạ. Có gì cần hỗ trợ thêm mình cứ nhắn em nha!", "sort_order": 3},
      {"title": "Hướng dẫn đổi trả", "content": "Dạ cửa hàng hỗ trợ đổi/trả trong [số] ngày kèm hóa đơn ạ. Mình giữ giúp em hóa đơn để đổi trả nhanh hơn nha.", "sort_order": 4},
      {"title": "Báo khách thân thiết sắp lên hạng", "content": "Dạ mình sắp đạt hạng khách thân thiết rồi ạ, chỉ còn [số tiền] nữa thôi! Ưu đãi hạng mới sẽ áp dụng ngay cho lần mua tiếp theo nha.", "sort_order": 5}
    ]
  },
  "playbooks_hint": ["nhắc theo chu kỳ sản phẩm"]
}'::jsonb),

-- education & other: NỘI DUNG Y HỆT seed_industry_template cũ (migration #12) —
-- tenant đang dùng 2 ngành này KHÔNG đổi hành vi khi lên pack engine.
('education', 1, '{
  "terminology": {"contact": "học viên", "deal": "khóa học", "deal_won": "đăng ký khóa"},
  "modules": [],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu chốt"},
    {"metric": "new_contacts", "label": "Học viên mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Hỏi", "Chốt", "Giao hàng", "Thu tiền"],
  "dashboard_layout": ["orders_pending", "unanswered_messages", "revenue_month"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Học thử", "Đăng ký khóa", "Phụ huynh", "Học phí", "Khai giảng", "Tư vấn lộ trình", "Bảo lưu", "Học viên cũ"],
    "quick_replies": [
      {"title": "Chào phụ huynh / học viên", "content": "Dạ em chào anh/chị! Cảm ơn anh/chị đã quan tâm đến trung tâm ạ. Anh/chị đang tìm khóa học cho bé hay cho mình để em tư vấn đúng lộ trình nha?", "sort_order": 1},
      {"title": "Mời học thử", "content": "Dạ trung tâm có buổi học thử miễn phí vào [ngày, giờ] ạ. Anh/chị cho em xin tên và độ tuổi của học viên để em xếp lớp phù hợp nha.", "sort_order": 2},
      {"title": "Báo học phí + ưu đãi", "content": "Dạ học phí khóa [tên khóa] là [số tiền] cho [số buổi] buổi ạ. Đăng ký trước [ngày] được ưu đãi [ưu đãi], anh/chị tham khảo giúp em nha.", "sort_order": 3},
      {"title": "Thông báo khai giảng", "content": "Dạ lớp [tên lớp] khai giảng ngày [ngày], lịch học [thứ, giờ] ạ. Lớp còn [số] chỗ, anh/chị giữ chỗ sớm giúp em nha.", "sort_order": 4},
      {"title": "Nhắc đóng học phí", "content": "Dạ em xin phép nhắc học phí [đợt] của học viên [tên] ạ. Anh/chị sắp xếp hoàn tất trước [ngày] giúp trung tâm nha. Em cảm ơn ạ!", "sort_order": 5},
      {"title": "Hỏi thăm sau buổi học đầu", "content": "Dạ hôm nay [tên học viên] học buổi đầu, bé có thích lớp không anh/chị? Có góp ý gì anh/chị cứ nhắn em để thầy cô điều chỉnh cho phù hợp ạ.", "sort_order": 6}
    ]
  },
  "playbooks_hint": []
}'::jsonb),

('other', 1, '{
  "terminology": {"contact": "khách", "deal": "cơ hội", "deal_won": "chốt đơn"},
  "modules": [],
  "kpi_presets": [
    {"metric": "revenue_won", "label": "Doanh thu chốt"},
    {"metric": "new_contacts", "label": "Khách mới"},
    {"metric": "tasks_done", "label": "Việc xong"}
  ],
  "pipeline_stages": ["Hỏi", "Chốt", "Giao hàng", "Thu tiền"],
  "dashboard_layout": ["orders_pending", "unanswered_messages", "revenue_month"],
  "custom_fields": [],
  "sample_data": {
    "tags": ["Khách mới", "Khách quen", "Hỏi giá", "Cần theo dõi", "Khiếu nại"],
    "quick_replies": [
      {"title": "Chào khách", "content": "Dạ em chào anh/chị! Cảm ơn anh/chị đã nhắn tin ạ. Anh/chị cần hỗ trợ gì để em tư vấn mình luôn nha?", "sort_order": 1},
      {"title": "Báo giá", "content": "Dạ [sản phẩm/dịch vụ] bên em giá [giá] ạ. Anh/chị cần thêm thông tin gì em gửi chi tiết luôn nha.", "sort_order": 2},
      {"title": "Xin phép phản hồi sau", "content": "Dạ em đã nhận thông tin của anh/chị. Em kiểm tra và phản hồi mình trong ít phút nữa, anh/chị chờ em xíu nha. Em cảm ơn ạ!", "sort_order": 3},
      {"title": "Cảm ơn sau mua", "content": "Dạ cảm ơn anh/chị đã tin tưởng ủng hộ ạ. Trong quá trình sử dụng có gì cần hỗ trợ, anh/chị cứ nhắn em bất cứ lúc nào nha!", "sort_order": 4},
      {"title": "Xin đánh giá", "content": "Dạ nếu hài lòng với dịch vụ, anh/chị cho bên em xin một đánh giá 5 sao để ủng hộ tinh thần đội ngũ nha. Em cảm ơn anh/chị nhiều ạ!", "sort_order": 5}
    ]
  },
  "playbooks_hint": []
}'::jsonb);
