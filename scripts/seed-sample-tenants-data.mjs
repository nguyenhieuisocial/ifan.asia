/**
 * Dữ liệu chi tiết cho 5 tiệm mẫu (shop/kham/pet/fnb/retail) — chế độ Tham
 * quan tiệm mẫu (15b, migration #64). Làm giàu 11/08 theo chỉ đạo founder
 * "tiệm mẫu phải cực kỳ chi tiết, không nửa vời" — mỗi ngành có khách đa
 * dạng, hội thoại Zalo tự nhiên (8-14 tin/hội thoại), cơ hội rải đủ
 * thắng/thua/đang mở, việc quá hạn. File TÁCH RIÊNG khỏi logic seed
 * (scripts/seed-sample-tenants.mjs) vì nội dung rất dài.
 *
 * KHÔNG sửa tay file này — sinh ra từ 5 nội dung soạn riêng từng ngành rồi
 * gộp lại. Muốn sửa nội dung, sửa trực tiếp object bên dưới rồi chạy lại
 * scripts/seed-sample-tenants.mjs (idempotent, an toàn chạy lại).
 */
export const CONTENT = {
  "shop": {
    "companies": [
      {
        "name": "Công ty TNHH Thời Trang Minh Anh",
        "domain": "minhanhfashion.vn",
        "taxCode": "0312456789",
        "address": "123 Nguyễn Trãi, Phường 7, Quận 5, TP.HCM",
        "phone": "02838456789"
      },
      {
        "name": "Chuỗi Cửa Hàng Thời Trang Bích Ngọc Boutique",
        "domain": "bichngocstore.com",
        "taxCode": "0401987654",
        "address": "45 Lê Duẩn, Quận Hải Châu, TP. Đà Nẵng",
        "phone": "02363812456"
      }
    ],
    "contacts": [
      {
        "name": "Trần Thanh Hương",
        "phone": "0912345678",
        "email": "thanhhuong.tran@gmail.com",
        "tier": "vip",
        "address": "12 Lê Văn Sỹ, Quận 3",
        "province": "TP.HCM",
        "source": "zalo"
      },
      {
        "name": "Nguyễn Ngọc Mai",
        "phone": "0987654321",
        "email": "ngocmai.nguyen@gmail.com",
        "tier": "regular",
        "address": "45 Nguyễn Chí Thanh, Đống Đa",
        "province": "Hà Nội",
        "source": "facebook"
      },
      {
        "name": "Lê Bảo Trân",
        "phone": "0932165498",
        "email": "baotran.le@gmail.com",
        "tier": "new",
        "address": "78 Hoàng Diệu, Hải Châu",
        "province": "Đà Nẵng",
        "source": "facebook"
      },
      {
        "name": "Phạm Quốc Huy",
        "phone": "0977123456",
        "email": "quochuy.pham@gmail.com",
        "tier": "regular",
        "address": "23 Nguyễn Văn Cừ, Ninh Kiều",
        "province": "Cần Thơ",
        "source": "referral"
      },
      {
        "name": "Vũ Kim Phượng",
        "phone": "0793456781",
        "email": "kimphuong@minhanhfashion.vn",
        "tier": "vip",
        "address": "123 Nguyễn Trãi, Quận 5",
        "province": "TP.HCM",
        "source": "facebook",
        "sourceNow": "referral",
        "company": "minhanhfashion.vn"
      },
      {
        "name": "Võ Lan Anh",
        "phone": "0865123478",
        "email": "lananh.vo@gmail.com",
        "tier": "dormant",
        "address": "56 Lạch Tray, Ngô Quyền",
        "province": "Hải Phòng",
        "source": "zalo"
      },
      {
        "name": "Đặng Thảo Vy",
        "phone": "0356789123",
        "email": "thaovy.dang@gmail.com",
        "tier": "new",
        "address": "89 Cách Mạng Tháng 8, Quận 10",
        "province": "TP.HCM",
        "source": "facebook"
      },
      {
        "name": "Bùi Hồng Nhung",
        "phone": "0898765432",
        "email": "hongnhung.bui@gmail.com",
        "tier": "regular",
        "address": "34 Trần Phú",
        "province": "Khánh Hòa",
        "source": "zalo",
        "sourceNow": "referral"
      },
      {
        "name": "Hoàng Minh Tuấn",
        "phone": "0327891456",
        "email": "minhtuan.hoang@gmail.com",
        "tier": "regular",
        "address": "67 Xã Đàn, Đống Đa",
        "province": "Hà Nội",
        "source": "other"
      },
      {
        "name": "Đỗ Diễm My",
        "phone": "0709123456",
        "email": "diemmy@bichngocstore.com",
        "tier": "vip",
        "address": "200 Ba Tháng Hai, Quận 10",
        "province": "TP.HCM",
        "source": "referral",
        "company": "bichngocstore.com"
      },
      {
        "name": "Lý Thu Trang",
        "phone": "0837654123",
        "email": "thutrang.ly@gmail.com",
        "tier": "new",
        "address": "12 Mậu Thân, Ninh Kiều",
        "province": "Cần Thơ",
        "source": "facebook"
      },
      {
        "name": "Đỗ Ánh Tuyết",
        "phone": "0946123789",
        "email": "anhtuyet.do@gmail.com",
        "tier": "dormant",
        "address": "90 Điện Biên Phủ, Hải Châu",
        "province": "Đà Nẵng",
        "source": "facebook"
      },
      {
        "name": "Dương Phương Linh",
        "phone": "0965478123",
        "email": "phuonglinh.duong@gmail.com",
        "tier": "regular",
        "address": "15 Kim Mã, Ba Đình",
        "province": "Hà Nội",
        "source": "zalo"
      },
      {
        "name": "Trương Bích Liên",
        "phone": "0384567912",
        "email": "bichlien.truong@gmail.com",
        "tier": "vip",
        "address": "78 Lê Lợi",
        "province": "Bà Rịa - Vũng Tàu",
        "source": "referral"
      }
    ],
    "threads": [
      {
        "ext": "sample-shop-zl-001",
        "phone": "0912345678",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Shop ơi có đầm dự tiệc mới không chị coi với ạ",
            240
          ],
          [
            "out",
            "Dạ có chị ơi 🥰 Shop mới về mấy mẫu đầm dự tiệc đẹp lắm, để em gửi hình chị xem nha",
            238
          ],
          [
            "out",
            "[Hình ảnh] Đầm 2 dây nhung đen mới về đó chị, size S-L đủ hết",
            237
          ],
          [
            "in",
            "Ưng cái này nè, giá nhiêu em",
            230
          ],
          [
            "out",
            "Dạ đầm này 850k chị ơi, chị mặc size mấy để em coi size cho vừa",
            229
          ],
          [
            "in",
            "Chị mặc M à, chị cao 1m62 nặng 52kg",
            225
          ],
          [
            "out",
            "Dạ size M vừa đẹp luôn chị, chị lấy màu đen hay có màu đỏ đô cũng đẹp á",
            224
          ],
          [
            "in",
            "Cho chị màu đen đi, chị mua thêm cái áo blazer lần trước ưng đó, còn không em",
            200
          ],
          [
            "out",
            "Dạ còn chị ơi, áo blazer be 450k, chị lấy đầm + áo em tính 1 triệu 2 cho chị nha, free ship luôn",
            198
          ],
          [
            "in",
            "Ok chốt vậy, giao chỗ cũ nha em, chị chuyển khoản trước hay ship COD cũng được",
            195
          ],
          [
            "out",
            "Dạ chị COD cũng được ạ, mai shop gửi hàng đi liền, chiều mốt chị nhận nha 🥰",
            194
          ],
          [
            "note",
            "Khách VIP, mua đợt 3 trong tháng, ưu tiên ship nhanh",
            194
          ],
          [
            "out",
            "Chị ơi hàng giao rồi ạ, chị check giúp em có gì báo lại liền nha 💕",
            30
          ],
          [
            "in",
            "Ok nhận rồi, đẹp lắm, cảm ơn em",
            28
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-002",
        "phone": "0987654321",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Em ơi cái áo sơ mi trắng hôm bữa chị mua có ra thêm màu khác không",
            20
          ],
          [
            "out",
            "Dạ shop mới về thêm màu xanh pastel với màu hồng nhạt nữa chị ơi",
            19
          ],
          [
            "in",
            "Cho chị xem hình màu xanh pastel đi",
            18
          ],
          [
            "out",
            "[Hình ảnh] Đây chị ơi, vải giống cái trắng chị mua luôn á",
            17
          ],
          [
            "in",
            "Đẹp đó, giá vẫn 320k như cũ hả em",
            15
          ],
          [
            "out",
            "Dạ đúng rồi chị, chị lấy size M như lần trước ha",
            14
          ],
          [
            "in",
            "Ừ size M, mà chị hỏi thêm cái quần tây ống suông có size 28 không",
            5
          ],
          [
            "in",
            "Em ơi có không, chị cần gấp mai đi làm mặc",
            2
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-003",
        "phone": "0932165498",
        "status": "pending",
        "unread": 0,
        "m": [
          [
            "in",
            "Chào shop, cho em hỏi shop có ship Đà Nẵng không ạ",
            96
          ],
          [
            "out",
            "Dạ shop ship toàn quốc á em, em ở Đà Nẵng thì 2-3 ngày là nhận được hàng nha",
            95
          ],
          [
            "in",
            "Dạ em coi trên fanpage thấy cái chân váy caro đẹp quá, còn hàng không ạ",
            94
          ],
          [
            "out",
            "Dạ còn nha em, em cho chị xin số đo vòng eo với chiều cao để tư vấn size",
            93
          ],
          [
            "in",
            "Dạ em cao 1m58, eo 62cm ạ",
            90
          ],
          [
            "out",
            "Vậy em lấy size S là vừa đẹp á, chân váy này 280k, đơn từ 300k được freeship nên em mua thêm món gì ghép chung thì đỡ phí ship nha 😄",
            89
          ],
          [
            "in",
            "Vậy chị ơi có áo croptop nào hợp với chân váy caro không giới thiệu em với",
            85
          ],
          [
            "out",
            "[Hình ảnh] Áo kiểu này hợp lắm nè em, màu trắng với be đều mặc đẹp á",
            84
          ],
          [
            "in",
            "Em lấy màu be nha chị, croptop size S luôn",
            80
          ],
          [
            "out",
            "Dạ chốt đơn cho em: chân váy caro size S + croptop be size S, tổng 480k, em cho chị xin địa chỉ với sđt nhận hàng nha",
            79
          ],
          [
            "in",
            "Dạ em gửi qua Zalo này luôn được không ạ, số này của em",
            78
          ],
          [
            "out",
            "Dạ được em, chị lưu đơn cho em rồi nha, 2-3 hôm nữa hàng tới 💕",
            77
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-004",
        "phone": "0793456781",
        "status": "open",
        "unread": 2,
        "m": [
          [
            "in",
            "Chị Hương ơi, bên em công ty Minh Anh muốn đặt sỉ đợt hàng thu đông, chị báo giá sỉ giúp em với",
            72
          ],
          [
            "out",
            "Dạ chị ơi, sỉ từ 20 sản phẩm/mẫu trở lên em giảm 25% giá lẻ, từ 50 sản phẩm giảm 30% chị nha",
            70
          ],
          [
            "in",
            "Bên em lấy khoảng 100 áo khoác dạ với 80 chân váy len, tính giúp em tổng nhiêu",
            68
          ],
          [
            "out",
            "Dạ để em tính rồi báo chị liền ạ",
            66
          ],
          [
            "out",
            "Dạ áo khoác dạ giá sỉ 480k/cái (giảm 30%), chân váy len 210k/cái, 100 áo + 80 chân váy = 48tr + 16tr8 = 64tr8 chị ơi",
            65
          ],
          [
            "in",
            "Ok giá này ổn, cho chị xin catalogue với bảng size để bên chị chọn màu mã cụ thể",
            63
          ],
          [
            "out",
            "[File] Đây chị ơi, catalogue full mẫu thu đông năm nay ạ",
            60
          ],
          [
            "in",
            "Chị xem rồi, chị chọn được mẫu rồi đó, chị gửi list qua mail công ty cho chị nha, kèm hợp đồng luôn",
            40
          ],
          [
            "out",
            "Dạ em gửi liền qua mail chị nha, chị check giúp em thông tin xuất hoá đơn công ty với ạ",
            39
          ],
          [
            "note",
            "Khách sỉ lớn, đơn đầu tiên hợp tác với công ty Minh Anh, cần theo sát kỹ",
            39
          ],
          [
            "in",
            "Đợt này bên chị cần giao trước 15/9 để kịp lên hàng, em sắp xếp được không",
            3
          ],
          [
            "in",
            "Em ơi confirm giúp chị ngày giao được không, gấp lắm chị đang chờ",
            1
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-005",
        "phone": "0898765432",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Em ơi đơn chị đặt 5 hôm rồi sao chưa thấy giao vậy",
            120
          ],
          [
            "out",
            "Dạ chị cho em xin mã đơn em check giúp chị liền ạ",
            119
          ],
          [
            "in",
            "Chị đặt áo dài cách tân hôm 3/8 đó, chưa có mã gì hết á",
            118
          ],
          [
            "out",
            "Dạ em kiểm tra thấy đơn chị bị bên vận chuyển giao trễ do đợt mưa bão vừa rồi ạ, em xin lỗi chị nhiều 🙏",
            117
          ],
          [
            "in",
            "Trời vậy chừng nào mới tới, chị cần gấp có tiệc cuối tuần này",
            116
          ],
          [
            "out",
            "Dạ chị ơi em liên hệ bên ship rồi, họ báo trong 2 ngày nữa chắc chắn giao chị, em tặng thêm chị cái khăn choàng để xin lỗi vì trễ hẹn ạ",
            115
          ],
          [
            "in",
            "Thôi cũng được, em nhớ theo sát giúp chị nha, chị cần trước thứ 7",
            114
          ],
          [
            "out",
            "Dạ em theo sát chặt chẽ, có gì em cập nhật chị liền",
            113
          ],
          [
            "note",
            "Đơn bị delay do đối tác vận chuyển, đã tặng kèm khăn choàng xin lỗi khách",
            113
          ],
          [
            "out",
            "Chị ơi hàng đang giao rồi ạ, shipper gọi trước khi tới nha chị",
            50
          ],
          [
            "in",
            "Ok nhận được rồi, áo đẹp, khăn tặng cũng xinh, cảm ơn em nhiều",
            46
          ],
          [
            "out",
            "Dạ cảm ơn chị đã thông cảm cho shop ạ 🥰 Chúc chị dự tiệc vui vẻ nha",
            45
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-006",
        "phone": "0709123456",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Shop ơi bên Bích Ngọc mình hợp tác đợt trước ổn lắm, giờ chị muốn đặt thêm đợt hàng mùa hè",
            168
          ],
          [
            "out",
            "Dạ em nhớ chị nè 😍 Đợt này chị cần mẫu gì để em báo giá ạ",
            166
          ],
          [
            "in",
            "Chị cần đầm maxi hoa với áo kiểu tay bồng, mỗi loại 50 cái",
            165
          ],
          [
            "out",
            "Dạ giá sỉ đầm maxi 220k/cái, áo tay bồng 165k/cái, 50 cái mỗi loại là 11tr + 8tr25 = 19tr25 chị nha",
            164
          ],
          [
            "in",
            "Ok giá ổn như cũ, chị chuyển cọc 50% trước nha, còn lại nhận hàng chuyển nốt",
            160
          ],
          [
            "out",
            "Dạ chị chuyển cọc 9tr625 vào STK cũ giúp em, em gửi lại thông tin",
            159
          ],
          [
            "in",
            "Chị chuyển rồi đó, check giúp chị",
            158
          ],
          [
            "out",
            "Dạ em nhận được rồi ạ, cảm ơn chị, em lên đơn sản xuất liền, dự kiến giao trong 7 ngày",
            157
          ],
          [
            "note",
            "Khách sỉ quen thuộc lần 3, uy tín, giao dịch nhanh gọn",
            157
          ],
          [
            "out",
            "Chị ơi hàng đóng gói xong rồi, mai gửi xe khách vào Đà Nẵng cho chị nha",
            60
          ],
          [
            "in",
            "Ok em, cảm ơn shop nhiều, làm ăn uy tín ghê",
            58
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-007",
        "phone": "0837654123",
        "status": "open",
        "unread": 0,
        "m": [
          [
            "in",
            "Chào shop, shop đang có sale gì không ạ",
            50
          ],
          [
            "out",
            "Dạ chào chị, hiện shop đang sale 20% toàn bộ áo kiểu mùa hè đến hết tuần này ạ 🎉",
            49
          ],
          [
            "in",
            "Cho chị xem vài mẫu đi em",
            48
          ],
          [
            "out",
            "[Hình ảnh] Mẫu áo kiểu hoa nhí với áo linen đang hot nhất bên em nè chị",
            47
          ],
          [
            "in",
            "Áo linen giá sao em, chị thích màu be",
            45
          ],
          [
            "out",
            "Dạ áo linen giá gốc 350k, sale 20% còn 280k chị ơi, màu be còn size M với L",
            44
          ],
          [
            "in",
            "Chị mặc size M, cho chị 1 cái nha",
            40
          ],
          [
            "out",
            "Dạ chốt đơn áo linen be size M 280k, chị cho em xin địa chỉ giao hàng với ạ",
            39
          ],
          [
            "in",
            "Chị ở Cần Thơ, để chị gửi địa chỉ cụ thể qua đây",
            38
          ],
          [
            "out",
            "Dạ được chị, em chờ chị gửi rồi lên đơn liền ạ",
            37
          ]
        ]
      },
      {
        "ext": "sample-shop-zl-008",
        "phone": "0946123789",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "out",
            "Chị Tuyết ơi lâu quá không thấy chị ghé shop 🥰 Shop mới về bộ sưu tập thu đông đẹp lắm nè",
            500
          ],
          [
            "in",
            "Ừ dạo này chị bận quá chưa ghé được",
            480
          ],
          [
            "out",
            "Dạ chị tranh thủ xem qua fanpage nha, có mẫu áo len cổ lọ chị hay mua hồi trước á",
            479
          ],
          [
            "in",
            "Cho chị xem hình đi em",
            475
          ],
          [
            "out",
            "[Hình ảnh] Đây chị ơi, hàng mới về tuần này luôn",
            474
          ],
          [
            "in",
            "Đẹp đó, để chị coi lại tài chính rồi tính tiếp nha em, giờ chị chưa mua vội được",
            470
          ],
          [
            "out",
            "Dạ không sao ạ, khi nào chị cần cứ nhắn em, shop luôn có ưu đãi cho khách quen như chị 💕",
            469
          ],
          [
            "note",
            "Khách dormant hơn 3 tháng, đã gửi lại bộ sưu tập mới, khách hẹn coi tài chính, cần follow up sau",
            469
          ]
        ]
      }
    ],
    "deals": [
      {
        "title": "Đầm dự tiệc nhung đen + áo blazer be",
        "phone": "0912345678",
        "value": 1200000,
        "stageKind": "won",
        "wonDays": 2,
        "closeDays": -2,
        "nextDays": 15,
        "next": "Gợi ý bộ sưu tập mới dịp lễ cho chị Hương"
      },
      {
        "title": "Đơn sỉ đầm maxi hoa + áo tay bồng - Bích Ngọc",
        "phone": "0709123456",
        "value": 19250000,
        "stageKind": "won",
        "wonDays": 5,
        "closeDays": -5,
        "nextDays": 20,
        "next": "Hỏi thăm tình hình bán hàng, gợi ý đặt thêm đợt hàng thu"
      },
      {
        "title": "Áo dài cách tân dự tiệc",
        "phone": "0898765432",
        "value": 890000,
        "stageKind": "won",
        "wonDays": 3,
        "closeDays": -3,
        "nextDays": 30,
        "next": "Chăm sóc định kỳ, hỏi thăm có cần đặt thêm áo dài dịp Tết"
      },
      {
        "title": "Set áo dài lễ hội",
        "phone": "0865123478",
        "value": 650000,
        "stageKind": "lost",
        "lostDays": 20,
        "lostKw": "không liên lạc",
        "closeDays": -20,
        "nextDays": 10,
        "next": "Thử nhắn lại xem chị Lan Anh còn nhu cầu không"
      },
      {
        "title": "Quần tây ống suông size 28",
        "phone": "0987654321",
        "value": 320000,
        "stageName": "Hỏi giá",
        "closeDays": 3,
        "nextDays": -1,
        "next": "Gọi hỏi chị Mai có quần tây ống suông size 28 không, đang chờ trả lời"
      },
      {
        "title": "Áo linen be size M (sale 20%)",
        "phone": "0837654123",
        "value": 280000,
        "stageName": "Chốt",
        "closeDays": 2,
        "nextDays": 1,
        "next": "Nhắn xin lại địa chỉ giao hàng của chị Trang"
      },
      {
        "title": "Chân váy caro + áo croptop be",
        "phone": "0932165498",
        "value": 480000,
        "stageName": "Giao hàng",
        "closeDays": 1,
        "nextDays": 1,
        "next": "Theo dõi đơn hàng, gọi xác nhận đã nhận được chưa"
      },
      {
        "title": "Đơn sỉ áo khoác dạ + chân váy len - Minh Anh",
        "phone": "0793456781",
        "value": 64800000,
        "stageName": "Chốt",
        "closeDays": 4,
        "nextDays": -1,
        "next": "Confirm gấp ngày giao hàng trước 15/9 cho công ty Minh Anh"
      },
      {
        "title": "Set đồ công sở 3 món",
        "phone": "0384567912",
        "value": 1450000,
        "stageName": "Thu tiền",
        "closeDays": 1,
        "nextDays": 0,
        "next": "Nhắc chị Liên chuyển khoản nốt 500k còn lại"
      }
    ],
    "activities": [
      {
        "phone": "0987654321",
        "subject": "Gọi hỏi chị Mai về quần tây size 28",
        "body": "Chị Mai nhắn hỏi quần tây ống suông size 28 còn hàng không, cần gấp để mặc đi làm hôm sau, chưa phản hồi cho chị.",
        "dueOffsetHours": -3
      },
      {
        "phone": "0793456781",
        "subject": "Confirm ngày giao đơn sỉ Minh Anh",
        "body": "Công ty Minh Anh cần giao đơn áo khoác dạ và chân váy len trước ngày 15/9, phải chốt và báo ngày giao cụ thể gấp.",
        "dueOffsetHours": -20
      },
      {
        "phone": "0932165498",
        "subject": "Gọi xác nhận đơn hàng đã nhận",
        "body": "Kiểm tra đơn chân váy caro và áo croptop đã giao tới Bảo Trân chưa, nhắc bạn để lại đánh giá 5 sao giúp shop.",
        "dueOffsetHours": 1
      },
      {
        "phone": "0384567912",
        "subject": "Nhắc chị Liên thanh toán nốt tiền",
        "body": "Set đồ công sở 3 món đã giao, còn thiếu 500k, nhắn nhắc chị chuyển khoản nốt phần còn lại.",
        "dueOffsetHours": 6
      },
      {
        "phone": "0865123478",
        "subject": "Gọi chăm sóc lại khách lâu không mua",
        "body": "Chị Lan Anh hỏi giá set áo dài lễ hội rồi mất liên lạc, gọi lại hỏi thăm xem còn nhu cầu đặt hàng không.",
        "dueOffsetHours": 30
      },
      {
        "phone": "0946123789",
        "subject": "Follow up bộ sưu tập thu đông",
        "body": "Chị Tuyết hẹn xem lại tài chính rồi tính tiếp việc mua bộ sưu tập thu đông, nhắn hỏi thăm đã quyết định chưa.",
        "dueOffsetHours": 48
      }
    ]
  },
  "kham": {
    "companies": [
      {
        "name": "Công ty TNHH Thương Mại Dịch Vụ Phương Nam",
        "domain": "phuongnam.com.vn",
        "taxCode": "0312345678",
        "address": "123 Nguyễn Văn Trỗi, Phường 12, Quận Phú Nhuận, TP. Hồ Chí Minh",
        "phone": "02838123456"
      },
      {
        "name": "Công ty Cổ phần Xây Dựng Đại Thành",
        "domain": "daithanh.vn",
        "taxCode": "0398765432",
        "address": "45 Lê Duẩn, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        "phone": "02839876543"
      }
    ],
    "contacts": [
      {
        "name": "Nguyễn Thị Thu Hà",
        "phone": "0908123456",
        "email": "ha.nguyen88@gmail.com",
        "tier": "vip",
        "address": "123 Nguyễn Trãi, Phường Bến Thành, Quận 1",
        "province": "TP. Hồ Chí Minh",
        "source": "referral"
      },
      {
        "name": "Trần Văn Minh",
        "phone": "0913234567",
        "email": "minhtran.hn@gmail.com",
        "tier": "regular",
        "address": "45 Kim Mã, Phường Kim Mã, Quận Ba Đình",
        "province": "Hà Nội",
        "source": "zalo"
      },
      {
        "name": "Lê Thị Ngọc Anh",
        "phone": "0938345678",
        "email": "ngocanh.le@gmail.com",
        "tier": "new",
        "address": "12 Trần Phú, Phường Hải Châu, Quận Hải Châu",
        "province": "Đà Nẵng",
        "source": "facebook"
      },
      {
        "name": "Phạm Quốc Bảo",
        "phone": "0977456789",
        "email": "baopham.ct@gmail.com",
        "tier": "regular",
        "address": "78 Nguyễn Văn Cừ, Phường An Hòa, Quận Ninh Kiều",
        "province": "Cần Thơ",
        "source": "zalo"
      },
      {
        "name": "Hoàng Thị Mai",
        "phone": "0865567890",
        "email": "mai.hoang@phuongnam.com.vn",
        "tier": "vip",
        "address": "56 Phan Xích Long, Phường 2, Quận Phú Nhuận",
        "province": "TP. Hồ Chí Minh",
        "source": "referral",
        "sourceNow": "zalo",
        "company": "phuongnam.com.vn"
      },
      {
        "name": "Vũ Đình Phong",
        "phone": "0793678901",
        "email": "phong.vu79@gmail.com",
        "tier": "regular",
        "address": "34 Đại lộ Bình Dương, Phường Hiệp Thành, Thủ Dầu Một",
        "province": "Bình Dương",
        "source": "other"
      },
      {
        "name": "Đặng Thị Kim Loan",
        "phone": "0329789012",
        "email": "loandang.kl@gmail.com",
        "tier": "dormant",
        "address": "89 Lê Văn Sỹ, Phường 13, Quận 3",
        "province": "TP. Hồ Chí Minh",
        "source": "facebook"
      },
      {
        "name": "Ngô Văn Tài",
        "phone": "0987890123",
        "email": "tai.ngo90@gmail.com",
        "tier": "new",
        "address": "21 Xã Đàn, Phường Nam Đồng, Quận Đống Đa",
        "province": "Hà Nội",
        "source": "facebook"
      },
      {
        "name": "Bùi Thị Thanh Trúc",
        "phone": "0708901234",
        "email": "truc.bui@daithanh.vn",
        "tier": "regular",
        "address": "5 Lê Duẩn, Phường Bến Nghé, Quận 1",
        "province": "TP. Hồ Chí Minh",
        "source": "referral",
        "sourceNow": "zalo",
        "company": "daithanh.vn"
      },
      {
        "name": "Đỗ Minh Quân",
        "phone": "0919012345",
        "email": "quandominh@gmail.com",
        "tier": "vip",
        "address": "67 Lạch Tray, Phường Đằng Giang, Quận Ngô Quyền",
        "province": "Hải Phòng",
        "source": "zalo"
      },
      {
        "name": "Lý Thị Hồng Nhung",
        "phone": "0356123457",
        "email": "nhung.ly95@gmail.com",
        "tier": "new",
        "address": "90 Cách Mạng Tháng 8, Phường 5, Quận 3",
        "province": "TP. Hồ Chí Minh",
        "source": "facebook"
      },
      {
        "name": "Trương Văn Đức",
        "phone": "0888234568",
        "email": "ductruong.dn@gmail.com",
        "tier": "regular",
        "address": "15 Đồng Khởi, Phường Tân Mai, TP. Biên Hòa",
        "province": "Đồng Nai",
        "source": "other"
      },
      {
        "name": "Phan Thị Bích Ngọc",
        "phone": "0947345679",
        "email": "ngoc.phan@phuongnam.com.vn",
        "tier": "regular",
        "address": "100 Nguyễn Văn Trỗi, Phường 12, Quận Phú Nhuận",
        "province": "TP. Hồ Chí Minh",
        "source": "referral",
        "company": "phuongnam.com.vn"
      },
      {
        "name": "Nguyễn Hữu Thắng",
        "phone": "0369456780",
        "email": "thang.nguyen68@gmail.com",
        "tier": "dormant",
        "address": "22 Lê Lợi, Phường 1, TP. Vũng Tàu",
        "province": "Bà Rịa - Vũng Tàu",
        "source": "zalo"
      }
    ],
    "threads": [
      {
        "ext": "sample-kham-zl-001",
        "phone": "0938345678",
        "status": "open",
        "unread": 2,
        "m": [
          [
            "in",
            "Dạ chào phòng khám, em muốn hỏi về niềng răng ạ",
            30
          ],
          [
            "out",
            "Dạ chào em, phòng khám xin chào ạ 😊 Em cho chị hỏi em đang gặp vấn đề gì về răng vậy ạ? Răng hô, móm hay răng thưa/lệch lạc ạ?",
            29
          ],
          [
            "in",
            "Dạ em bị răng hô với hơi khấp khểnh phía trước ạ, em muốn niềng nhưng chưa biết giá cả sao chị",
            28
          ],
          [
            "out",
            "Dạ tuỳ tình trạng cụ thể của em nha, phòng khám có niềng mắc cài kim loại từ 20-25 triệu, mắc cài sứ 28-32 triệu, và niềng trong suốt Invisalign 35-40 triệu ạ. Giá này đã bao gồm cả quá trình điều trị luôn ạ",
            27
          ],
          [
            "in",
            "Dạ vậy có cần chụp phim trước không chị, với mất bao lâu thì xong ạ",
            26
          ],
          [
            "in",
            "Với niềng răng có đau lắm không chị, em hơi sợ 😅",
            26
          ],
          [
            "out",
            "Dạ có ạ, bước đầu tiên bác sĩ sẽ khám tổng quát và chụp phim Panorama, Cephalo để lên phác đồ điều trị chính xác cho em ạ. Thời gian niềng trung bình 18-24 tháng tuỳ mức độ ạ",
            25
          ],
          [
            "out",
            "Về đau thì những ngày đầu gắn mắc cài hoặc siết răng sẽ hơi ê nhẹ 2-3 ngày thôi ạ, bác sĩ sẽ kê thuốc giảm ê cho em, không đáng lo đâu ạ 🦷",
            24
          ],
          [
            "in",
            "Dạ vậy chị cho em đặt lịch khám tư vấn được không ạ, em rảnh thứ 7 tuần này",
            5
          ],
          [
            "in",
            "Chị ơi có phản hồi giúp em được không ạ, em muốn sắp xếp công việc trước 🙏",
            2
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-002",
        "phone": "0919012345",
        "status": "pending",
        "unread": 0,
        "m": [
          [
            "out",
            "Dạ chào anh Quân, phòng khám Nha Khoa Gia Đình An Tâm xin nhắc anh lịch tái khám định kỳ sau trám răng cối số 6 vào 9h sáng thứ 4 tuần sau (ngày 20/8) ạ 😊",
            72
          ],
          [
            "in",
            "Ok em, anh nhớ rồi. Mà răng anh trám hôm trước giờ vẫn ê nhẹ khi ăn đồ lạnh, có sao không em",
            70
          ],
          [
            "out",
            "Dạ hiện tượng ê buốt nhẹ với đồ lạnh/nóng sau trám là bình thường trong 1-2 tuần đầu ạ, răng cần thời gian thích nghi với miếng trám mới ạ. Nếu quá 2 tuần vẫn ê nhiều thì mình báo bác sĩ liền nha anh",
            69
          ],
          [
            "in",
            "Uk được, để anh theo dõi thêm. Lịch tái khám tuần sau đổi sang chiều được không em, sáng anh bận họp",
            68
          ],
          [
            "out",
            "Dạ được ạ, để em đổi lịch anh Quân sang 14h chiều thứ 4 (20/8) nha. Anh nhắn xác nhận lại giúp em ạ",
            67
          ],
          [
            "in",
            "Ok cảm ơn em",
            66
          ],
          [
            "out",
            "Dạ không có gì ạ, hẹn gặp anh Quân thứ 4 tuần sau nha 🦷😊",
            66
          ],
          [
            "out",
            "Dạ anh Quân ơi, phòng khám nhắc lịch ạ: ngày mai 14h thứ 4 anh có lịch tái khám, anh sắp xếp đến đúng giờ giúp phòng khám nha ạ 🙏",
            3
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-003",
        "phone": "0913234567",
        "status": "open",
        "unread": 2,
        "m": [
          [
            "in",
            "Em ơi, anh nhổ răng khôn hôm qua giờ vẫn còn đau nhiều, có bình thường không em",
            8
          ],
          [
            "out",
            "Dạ chào anh Minh, anh cho em hỏi anh đau nhiều ở mức nào ạ, có sưng má không, có sốt không ạ?",
            7
          ],
          [
            "in",
            "Má hơi sưng nhẹ, không sốt, nhưng đau nhói khi anh nhai hoặc há miệng to",
            7
          ],
          [
            "out",
            "Dạ tình trạng đau nhức và sưng nhẹ 1-2 ngày đầu sau nhổ răng khôn là bình thường ạ, do mô nướu đang lành lại ạ. Anh nhớ chườm lạnh bên má sưng 15-20 phút mỗi lần, và uống thuốc giảm đau kháng viêm bác sĩ kê đúng liều giúp em nha",
            6
          ],
          [
            "out",
            "Anh tránh súc miệng mạnh, không hút thuốc, không ăn đồ cứng/cay nóng trong vài ngày tới ạ, để tránh ảnh hưởng cục máu đông ở vết nhổ ạ",
            6
          ],
          [
            "in",
            "Ok em, mà anh thấy hơi có mùi hôi ở chỗ nhổ, có phải bị nhiễm trùng không",
            5
          ],
          [
            "out",
            "Dạ anh đừng lo quá ạ, có thể do thức ăn đọng lại chưa vệ sinh kỹ thôi ạ. Anh súc miệng nhẹ nhàng bằng nước muối sinh lý ấm sau ăn giúp em nha. Nhưng để chắc chắn, em xin phép sắp lịch cho anh ghé phòng khám kiểm tra lại vết nhổ trong hôm nay hoặc mai được không ạ, an toàn hơn cho anh 🙏",
            4
          ],
          [
            "in",
            "Ừ vậy chiều nay anh qua được, khoảng 4h",
            3
          ],
          [
            "in",
            "Em confirm giúp anh nha, anh sắp xếp công việc",
            1
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-004",
        "phone": "0977456789",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Chào phòng khám, cho em hỏi phòng khám có nhận bảo hiểm y tế không ạ",
            96
          ],
          [
            "out",
            "Dạ chào anh, phòng khám hiện chưa liên kết trực tiếp với BHYT nhà nước ạ, nhưng phòng khám có hỗ trợ xuất hoá đơn để anh làm thủ tục bảo hiểm sức khoẻ tư nhân (Bảo Việt, PVI, Manulife...) nếu anh có mua ạ",
            95
          ],
          [
            "in",
            "À vậy à, thế còn bảo hiểm bên công ty em mua qua Bảo Việt thì có áp dụng khám nha khoa không em biết không",
            94
          ],
          [
            "out",
            "Dạ cái này tuỳ gói bảo hiểm công ty anh mua ạ, anh xem lại hợp đồng hoặc gọi hotline Bảo Việt hỏi quyền lợi nha khoa được chi trả bao nhiêu % nha. Phòng khám sẽ xuất hoá đơn đỏ đầy đủ để anh nộp hồ sơ bồi hoàn ạ",
            93
          ],
          [
            "in",
            "Ok cảm ơn em, để anh hỏi lại công ty",
            92
          ],
          [
            "in",
            "À mà giá khám tổng quát và lấy cao răng ở đây bao nhiêu em",
            92
          ],
          [
            "out",
            "Dạ gói khám tổng quát, cạo vôi răng, đánh bóng là 400.000đ ạ, anh đặt lịch giúp em ngày nào tiện ạ 😊",
            91
          ],
          [
            "in",
            "Để anh sắp xếp rồi báo em sau nha",
            90
          ],
          [
            "out",
            "Dạ vâng ạ, anh cần gì cứ nhắn phòng khám nha anh 🙏",
            89
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-005",
        "phone": "0987890123",
        "status": "open",
        "unread": 0,
        "m": [
          [
            "in",
            "Chào phòng khám, em thấy quảng cáo trên Facebook, cho em hỏi khám tổng quát răng miệng giá bao nhiêu vậy ạ",
            15
          ],
          [
            "out",
            "Dạ chào em, cảm ơn em đã quan tâm phòng khám ạ 😊 Gói khám tổng quát tại phòng khám gồm khám, chụp phim (nếu cần), tư vấn của bác sĩ, giá 300.000đ ạ. Nếu có lấy cao răng và đánh bóng thêm thì combo là 450.000đ ạ",
            14
          ],
          [
            "in",
            "Dạ em chưa khám nha khoa bao giờ, em hơi lo là răng em có bị sâu nhiều không, với có phải nhổ răng khôn không",
            13
          ],
          [
            "out",
            "Dạ em đừng lo ạ, bác sĩ sẽ khám kỹ và tư vấn cụ thể tình trạng răng của em, có gì cần xử lý bác sĩ sẽ giải thích rõ trước khi làm chứ không tự ý làm gì đâu ạ 🦷",
            12
          ],
          [
            "in",
            "Dạ vậy cho em đặt lịch cuối tuần này được không ạ, em rảnh chủ nhật",
            11
          ],
          [
            "out",
            "Dạ được ạ, phòng khám mở cửa chủ nhật từ 8h-17h ạ. Em cho phòng khám xin tên đầy đủ với giờ em muốn đến để giữ lịch giúp em nha",
            10
          ],
          [
            "in",
            "Dạ em tên Ngô Văn Tài, em muốn đến khoảng 9h sáng chủ nhật ạ",
            9
          ],
          [
            "out",
            "Dạ em Tài ơi, phòng khám đã giữ lịch 9h sáng Chủ Nhật cho em rồi ạ. Em nhớ mang theo CCCD giúp phòng khám nha, hẹn gặp em 😊🦷",
            8
          ],
          [
            "in",
            "Dạ em cảm ơn ạ, mà em có cần nhịn ăn sáng trước khi khám không chị",
            1
          ],
          [
            "out",
            "Dạ không cần nhịn ăn đâu ạ, em ăn sáng bình thường rồi đến khám thoải mái ạ 😊",
            0.5
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-006",
        "phone": "0947345679",
        "status": "pending",
        "unread": 0,
        "m": [
          [
            "in",
            "Chị ơi bên phòng khám có tẩy trắng răng không, giá sao vậy chị",
            50
          ],
          [
            "out",
            "Dạ chào chị Ngọc, phòng khám có dịch vụ tẩy trắng răng tại phòng (Laser Whitening) giá 2.500.000đ/2 hàm, hoặc tẩy trắng máng tại nhà 2.000.000đ ạ. Chị đang công tác bên Phương Nam đúng không ạ, chị có nằm trong gói khám sức khoẻ định kỳ công ty mình đó ạ 😊",
            49
          ],
          [
            "in",
            "À đúng rồi chị, nhưng tẩy trắng có tính trong gói của công ty không hay em phải trả thêm",
            48
          ],
          [
            "out",
            "Dạ gói khám định kỳ công ty chỉ bao gồm khám tổng quát, chụp phim, tư vấn thôi ạ, còn tẩy trắng là dịch vụ thẩm mỹ riêng nên chị sẽ thanh toán thêm phần đó ạ, nhưng phòng khám có ưu đãi 10% cho nhân viên công ty đối tác ạ",
            47
          ],
          [
            "in",
            "Ok vậy còn răng số 5 hàm dưới em bị sâu nhẹ lần khám trước bác sĩ nói, giờ trám hết bao nhiêu em",
            46
          ],
          [
            "out",
            "Dạ trám răng sâu bằng vật liệu Composite thẩm mỹ giá 500.000-700.000đ/răng tuỳ mức độ sâu ạ, sâu nhẹ như chị nói thì khoảng 500.000đ ạ",
            45
          ],
          [
            "in",
            "Dạ vậy em làm luôn trám răng đợt khám công ty tới nha, còn tẩy trắng để em suy nghĩ thêm",
            44
          ],
          [
            "out",
            "Dạ được ạ, em ghi chú lại cho chị rồi ạ. Đợt khám định kỳ công ty Phương Nam là ngày 25/8 đúng không ạ, chị nhớ đến đúng giờ nha 🦷",
            43
          ],
          [
            "in",
            "Dạ đúng rồi, cảm ơn em nhiều",
            42
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-007",
        "phone": "0865567890",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "out",
            "Dạ chào chị Mai, phòng khám xin thông báo lịch khám sức khoẻ định kỳ răng miệng cho nhân viên công ty Phương Nam sẽ diễn ra ngày 25/8 (thứ 3) tại phòng khám ạ, chị sắp xếp thời gian đến giúp em nha ạ 😊",
            120
          ],
          [
            "in",
            "Dạ chị nhận được thông tin rồi, khám mất bao lâu vậy em, chị sợ không kịp giờ làm",
            118
          ],
          [
            "out",
            "Dạ mỗi người khám khoảng 20-30 phút thôi ạ, gồm khám tổng quát, chụp phim nếu cần, tư vấn của bác sĩ ạ. Chị đăng ký khung giờ nào tiện thì báo em giữ chỗ nha",
            117
          ],
          [
            "in",
            "Chị đăng ký 8h30 sáng được không em, chị muốn khám sớm rồi về làm việc",
            116
          ],
          [
            "out",
            "Dạ được ạ, em đã giữ suất 8h30 sáng ngày 25/8 cho chị Mai rồi ạ 🦷",
            115
          ],
          [
            "in",
            "Ok cảm ơn em. Năm ngoái chị khám có bị sâu 1 răng, không biết giờ sao rồi",
            100
          ],
          [
            "out",
            "Dạ đợt khám này bác sĩ sẽ kiểm tra lại răng đó cho chị luôn ạ, nếu cần trám thì báo chị làm liền để tránh sâu nặng thêm ạ",
            99
          ],
          [
            "in",
            "Ok vậy nha, hẹn gặp em ngày đó",
            98
          ],
          [
            "out",
            "Dạ vâng ạ, hẹn gặp chị Mai ạ, chúc chị 1 ngày làm việc tốt lành 😊🙏",
            97
          ]
        ]
      },
      {
        "ext": "sample-kham-zl-008",
        "phone": "0356123457",
        "status": "open",
        "unread": 2,
        "m": [
          [
            "in",
            "Em ơi, răng chị mới trám hôm kia giờ ăn đồ ngọt bị nhức buốt lắm, có sao không em",
            6
          ],
          [
            "out",
            "Dạ chào chị Nhung, chị cho em hỏi buốt nhiều hay chỉ thoáng qua vậy ạ, có nhức âm ỉ về đêm không ạ?",
            5
          ],
          [
            "in",
            "Buốt khi ăn ngọt/lạnh thôi, hết ăn là hết, không có nhức về đêm",
            5
          ],
          [
            "out",
            "Dạ vậy là ê buốt do răng nhạy cảm sau trám thôi ạ, khá phổ biến và sẽ giảm dần sau 1-2 tuần ạ. Chị hạn chế đồ ngọt/lạnh/nóng vài ngày, có thể dùng kem đánh răng chuyên cho răng nhạy cảm (loại Sensodyne) sẽ đỡ hơn ạ",
            4
          ],
          [
            "in",
            "À ok, mà nếu sau 2 tuần vẫn còn thì sao em",
            4
          ],
          [
            "out",
            "Dạ nếu sau 2 tuần vẫn ê buốt nhiều thì chị ghé phòng khám để bác sĩ kiểm tra lại miếng trám giúp chị nha, có thể cần chỉnh lại khớp cắn ạ",
            3
          ],
          [
            "in",
            "Dạ ok. À mà em ơi cho chị hỏi luôn giá niềng Invisalign ở đây bao nhiêu vậy, chị đang cân nhắc",
            2
          ],
          [
            "in",
            "Chị nghe nói niềng trong suốt đắt hơn nhiều so với mắc cài truyền thống đúng không em",
            1
          ]
        ]
      }
    ],
    "deals": [
      {
        "title": "Tư vấn niềng răng mắc cài sứ - Lê Thị Ngọc Anh",
        "phone": "0938345678",
        "value": 30000000,
        "stageName": "Tư vấn",
        "closeDays": 7,
        "nextDays": 2,
        "next": "Gọi xác nhận lịch khám tư vấn và chụp phim Panorama"
      },
      {
        "title": "Tái khám sau nhổ răng khôn - Trần Văn Minh",
        "phone": "0913234567",
        "value": 1500000,
        "stageName": "Tái khám",
        "closeDays": 1,
        "nextDays": 0,
        "next": "Kiểm tra vết nhổ, xử lý sưng đau ngay chiều nay"
      },
      {
        "title": "Khám tổng quát và lấy cao răng - Ngô Văn Tài",
        "phone": "0987890123",
        "value": 450000,
        "stageName": "Đặt hẹn",
        "closeDays": 5,
        "nextDays": 3,
        "next": "Nhắc lịch khám Chủ Nhật 9h sáng"
      },
      {
        "title": "Niềng răng Invisalign - Đỗ Minh Quân",
        "phone": "0919012345",
        "value": 38000000,
        "stageName": "Đang điều trị",
        "closeDays": 300,
        "nextDays": 14,
        "next": "Tái khám siết niềng buổi 5/18"
      },
      {
        "title": "Trám răng sâu số 5 - Phan Thị Bích Ngọc",
        "phone": "0947345679",
        "value": 500000,
        "stageName": "Đặt hẹn",
        "closeDays": 5,
        "nextDays": 5,
        "next": "Trám răng trong đợt khám định kỳ công ty ngày 25/8"
      },
      {
        "title": "Khám sức khoẻ định kỳ công ty - Hoàng Thị Mai",
        "phone": "0865567890",
        "value": 400000,
        "stageName": "Tái khám",
        "closeDays": 4,
        "nextDays": 4,
        "next": "Khám lại răng sâu phát hiện từ năm ngoái"
      },
      {
        "title": "Tẩy trắng răng Laser Whitening - Bùi Thị Thanh Trúc",
        "phone": "0708901234",
        "value": 2500000,
        "stageKind": "won",
        "wonDays": 3
      },
      {
        "title": "Nhổ răng khôn hàm dưới - Vũ Đình Phong",
        "phone": "0793678901",
        "value": 1800000,
        "stageKind": "won",
        "wonDays": 10
      },
      {
        "title": "Niềng răng mắc cài kim loại - Đặng Thị Kim Loan",
        "phone": "0329789012",
        "value": 22000000,
        "stageKind": "lost",
        "lostDays": 20,
        "lostKw": "giá cao"
      }
    ],
    "activities": [
      {
        "phone": "0913234567",
        "subject": "Gọi kiểm tra tình trạng đau sau nhổ răng - anh Minh",
        "body": "Gọi hỏi thăm anh Trần Văn Minh xem vết nhổ răng khôn còn sưng đau không, nhắc lịch tái khám ngay chiều nay nếu cần",
        "dueOffsetHours": -3
      },
      {
        "phone": "0356123457",
        "subject": "Theo dõi ê buốt sau trám - chị Nhung",
        "body": "Gọi hỏi chị Lý Thị Hồng Nhung xem tình trạng ê buốt răng mới trám đã giảm chưa, tư vấn thêm giá niềng Invisalign chị đang hỏi",
        "dueOffsetHours": -8
      },
      {
        "phone": "0938345678",
        "subject": "Xác nhận lịch tư vấn niềng răng - Ngọc Anh",
        "body": "Gọi xác nhận lịch tư vấn niềng răng thứ 7 tuần này cho Lê Thị Ngọc Anh, nhắc mang theo phim X-quang cũ nếu có",
        "dueOffsetHours": 1
      },
      {
        "phone": "0919012345",
        "subject": "Nhắc lịch siết niềng buổi 5 - anh Quân",
        "body": "Nhắc lịch anh Đỗ Minh Quân đến siết niềng Invisalign buổi 5, dự kiến trong 2 tuần tới",
        "dueOffsetHours": 48
      },
      {
        "phone": "0947345679",
        "subject": "Nhắc lịch trám răng đợt khám công ty - chị Ngọc",
        "body": "Nhắc chị Phan Thị Bích Ngọc lịch trám răng số 5 trong đợt khám định kỳ công ty Phương Nam ngày 25/8",
        "dueOffsetHours": 72
      },
      {
        "phone": "0865567890",
        "subject": "Chuẩn bị đợt khám định kỳ công ty Phương Nam",
        "body": "Chuẩn bị hồ sơ và lịch khám sức khoẻ định kỳ cho nhân viên công ty Phương Nam ngày 25/8, ưu tiên khám lại răng sâu của chị Hoàng Thị Mai",
        "dueOffsetHours": 96
      }
    ]
  },
  "pet": {
    "companies": [],
    "contacts": [
      {
        "name": "Nguyễn Thị Mai Anh",
        "phone": "0909123456",
        "email": "maianh.nguyen89@gmail.com",
        "tier": "vip",
        "address": "12 Nguyễn Văn Trỗi, Phường 8, Quận Phú Nhuận",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      },
      {
        "name": "Trần Văn Hùng",
        "phone": "0987654321",
        "email": "hungtran.pet@gmail.com",
        "tier": "regular",
        "address": "45 Trần Duy Hưng, Cầu Giấy",
        "province": "Hà Nội",
        "source": "facebook"
      },
      {
        "name": "Lê Thị Ngọc Hân",
        "phone": "0334567890",
        "email": "ngochan.le2001@gmail.com",
        "tier": "new",
        "address": "23 Nguyễn Văn Linh, Hải Châu",
        "province": "Đà Nẵng",
        "source": "referral"
      },
      {
        "name": "Phạm Minh Khôi",
        "phone": "0778901234",
        "email": "minhkhoi.pham@gmail.com",
        "tier": "vip",
        "address": "88 Điện Biên Phủ, Quận Bình Thạnh",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      },
      {
        "name": "Vũ Thị Thu Trang",
        "phone": "0865432109",
        "email": "thutrang.vu86@gmail.com",
        "tier": "regular",
        "address": "156 Lê Hồng Phong, Phường Phú Hòa",
        "province": "Bình Dương",
        "source": "facebook"
      },
      {
        "name": "Đặng Quốc Bảo",
        "phone": "0912345678",
        "email": "quocbao.dang@gmail.com",
        "tier": "dormant",
        "address": "67 Xã Đàn, Đống Đa",
        "province": "Hà Nội",
        "source": "other"
      },
      {
        "name": "Hoàng Thị Kim Ngân",
        "phone": "0932187654",
        "email": "kimngan.hoang93@gmail.com",
        "tier": "new",
        "address": "34 Phan Xích Long, Quận Phú Nhuận",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      },
      {
        "name": "Đỗ Văn Tài",
        "phone": "0703456789",
        "email": "vantai.do@gmail.com",
        "tier": "regular",
        "address": "12 Nguyễn Trãi, Ninh Kiều",
        "province": "Cần Thơ",
        "source": "referral"
      },
      {
        "name": "Bùi Thị Hồng Nhung",
        "phone": "0898765432",
        "email": "hongnhung.bui@gmail.com",
        "tier": "vip",
        "address": "290 Cách Mạng Tháng 8, Quận 10",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo",
        "sourceNow": "facebook"
      },
      {
        "name": "Ngô Minh Quân",
        "phone": "0356789012",
        "email": "minhquan.ngo@gmail.com",
        "tier": "new",
        "address": "45 Đồng Khởi, Biên Hòa",
        "province": "Đồng Nai",
        "source": "facebook"
      },
      {
        "name": "Lý Thị Diễm My",
        "phone": "0946123789",
        "email": "diemmy.ly@gmail.com",
        "tier": "regular",
        "address": "78 Lê Văn Sỹ, Quận 3",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      },
      {
        "name": "Trương Văn Phát",
        "phone": "0977889900",
        "email": "vanphat.truong@gmail.com",
        "tier": "dormant",
        "address": "112 Kim Mã, Ba Đình",
        "province": "Hà Nội",
        "source": "other"
      },
      {
        "name": "Phan Thị Yến Nhi",
        "phone": "0783216549",
        "email": "yennhi.phan@gmail.com",
        "tier": "new",
        "address": "56 Thùy Vân, Phường 8",
        "province": "Bà Rịa - Vũng Tàu",
        "source": "referral"
      },
      {
        "name": "Cao Văn Đức",
        "phone": "0819998877",
        "email": "vanduc.cao@gmail.com",
        "tier": "regular",
        "address": "203 Quang Trung, Quận Gò Vấp",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      }
    ],
    "threads": [
      {
        "ext": "sample-pet-zl-001",
        "phone": "0909123456",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Chị ơi shop mình có nhận tắm sấy + cắt tỉa lông cho Poodle không ạ?",
            120
          ],
          [
            "out",
            "Dạ có ạ chị ơi 🐶 Bên em nhận tắm sấy tạo kiểu, cắt tỉa lông cho Poodle nè. Bé nhà chị bao nhiêu tháng tuổi rồi ạ?",
            119
          ],
          [
            "in",
            "Bé Mint nhà chị được 8 tháng rồi, lông hơi rối với dài quá",
            118
          ],
          [
            "out",
            "Dạ bé 8 tháng lông dài dễ rối lắm ạ. Chị cho bé qua bên em tắm gỡ rối + cạo tỉa gọn gàng nha, giá gói tắm cắt tỉa Poodle dao động 280k-350k tùy tình trạng lông ạ",
            118
          ],
          [
            "in",
            "Vậy chị đặt lịch chiều mai được không em, khoảng 3h",
            117
          ],
          [
            "out",
            "Dạ được ạ chị, em note lịch 3h chiều mai cho bé Mint rồi nha. Chị nhớ cho bé ăn nhẹ trước giờ hẹn tầm 1-2 tiếng thôi để bé không bị say/mệt khi tắm ạ",
            116
          ],
          [
            "in",
            "Ok em, cảm ơn nha",
            115
          ],
          [
            "note",
            "Đã xác nhận lịch hẹn 15h ngày mai cho bé Mint - gói tắm cắt tỉa",
            114
          ],
          [
            "in",
            "Em ơi chị tới rồi nè",
            96
          ],
          [
            "out",
            "Dạ chị đợi em xíu ra đón bé nha 🥰",
            95
          ],
          [
            "out",
            "Bé Mint xong rồi nè chị ơi, lông mượt gọn đẹp lắm luôn, chị check thử ạ",
            93
          ],
          [
            "in",
            "Ưi đẹp quá trời, cảm ơn em nhiều nha, bé nhìn xinh hẳn",
            92
          ],
          [
            "out",
            "Dạ chị ưng là em vui rồi ạ 🥰 Lần sau bé cần tắm lại chị nhắn em đặt lịch sớm nha, tầm 3-4 tuần tắm lại 1 lần là đẹp á",
            92
          ],
          [
            "in",
            "Ok em nhé, có gì chị lại ghé",
            91
          ]
        ]
      },
      {
        "ext": "sample-pet-zl-002",
        "phone": "0987654321",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Alo shop, cho anh hỏi giá tiêm phòng cho mèo với",
            30
          ],
          [
            "out",
            "Dạ chào anh ạ 🐱 Bên em có tiêm phòng 4 bệnh cho mèo (giảm bạch cầu, viêm mũi khí quản, calici, hô hấp) giá 250k/mũi ạ, tiêm dại riêng 150k ạ",
            29
          ],
          [
            "in",
            "Bé Tom nhà anh 1 tuổi rồi, chưa tiêm mũi nào hết, giờ tiêm có sao không em",
            28
          ],
          [
            "out",
            "Dạ 1 tuổi chưa tiêm mũi nào thì mình nên cho bé khám tổng quát trước để bác sĩ kiểm tra sức khỏe ổn không rồi mới tiêm anh nha, tránh trường hợp bé đang yếu hoặc có bệnh nền ạ",
            27
          ],
          [
            "in",
            "Ừ vậy khám tổng quát giá sao em",
            26
          ],
          [
            "out",
            "Dạ khám tổng quát bên em 150k ạ (đo nhiệt độ, nghe tim phổi, kiểm tra da lông, tai mắt răng miệng), nếu khám xong ổn thì tiêm luôn cũng được ạ",
            25
          ],
          [
            "in",
            "Dạo này Tom hay rụng lông nhiều lắm em, có phải bị bệnh gì không",
            8
          ],
          [
            "out",
            "Dạ anh cho em hỏi thêm bé có bị ngứa gãi nhiều không ạ, chỗ rụng có bị hói mảng không hay rụng đều khắp người ạ? Mùa này thời tiết chuyển cũng dễ làm mèo rụng lông theo mùa á anh",
            7
          ],
          [
            "in",
            "Rụng đều thôi, không thấy gãi nhiều, chắc theo mùa nhỉ. À mà lịch khám tổng quát anh đặt được chưa em, cuối tuần này rảnh",
            2
          ]
        ]
      },
      {
        "ext": "sample-pet-zl-003",
        "phone": "0778901234",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Em ơi bên mình có gói spa cao cấp cho Husky không, lông bé nhiều với rụng dữ lắm",
            72
          ],
          [
            "out",
            "Dạ có ạ anh 🐺 Gói spa cao cấp bên em gồm tắm 2 lớp dầu gội, xả dưỡng lông, sấy tạo phồng, cắt tỉa móng, vệ sinh tai, xịt thơm... giá 950k ạ, rất hợp với Husky rụng lông nhiều luôn ạ",
            71
          ],
          [
            "in",
            "Ok vậy đặt lịch sáng thứ 7 được không em, khoảng 9h",
            70
          ],
          [
            "out",
            "Dạ được ạ anh, em note lịch 9h sáng thứ 7 cho bé Sói rồi nha, gói spa cao cấp Husky ạ",
            69
          ],
          [
            "note",
            "Lịch hẹn 9h thứ 7 - gói spa cao cấp Husky bé Sói, cần chuẩn bị lược chải lông rụng riêng",
            68
          ],
          [
            "in",
            "Bên em xử lý lông rụng kỹ không, bé anh lông 2 lớp rụng khủng khiếp lắm",
            50
          ],
          [
            "out",
            "Dạ bên em có dụng cụ chải lông rụng chuyên dụng cho giống lông 2 lớp như Husky ạ, chải kỹ trước khi tắm để lông rụng ra bớt á, sau tắm sấy xong bé sẽ mượt và đỡ rụng hơn nhiều ạ",
            49
          ],
          [
            "in",
            "Bé xong chưa em",
            4
          ],
          [
            "out",
            "Dạ bé xong rồi nè anh, lông mượt bồng bềnh đẹp xỉu luôn á 😍 anh xem hình nè",
            3
          ],
          [
            "in",
            "Ưi Sói nhà anh đẹp trai quá, cảm ơn em nhiều nha, lần sau anh dẫn qua tiếp",
            2
          ],
          [
            "out",
            "Dạ em cảm ơn anh đã tin tưởng ạ 🥰 Hẹn gặp lại bé Sói lần sau nha anh",
            1
          ]
        ]
      },
      {
        "ext": "sample-pet-zl-004",
        "phone": "0865432109",
        "status": "pending",
        "unread": 2,
        "m": [
          [
            "in",
            "Chị ơi shop có nhận trông giữ thú cưng qua đêm không ạ, tuần sau em đi công tác 3 ngày",
            40
          ],
          [
            "out",
            "Dạ có ạ chị 🐕 Bên em có dịch vụ lưu trú/gửi bé qua đêm, có chuồng riêng thoáng mát, ăn 2 bữa/ngày, cho ra sân chơi giờ cố định ạ. Giá 120k/ngày đêm với bé nhỏ như Phốc sóc ạ",
            39
          ],
          [
            "in",
            "Bé Bống nhà em hơi nhát người lạ, có sao không chị",
            38
          ],
          [
            "out",
            "Dạ chị yên tâm ạ, tụi em quen chăm bé nhát rồi, mấy ngày đầu tụi em để bé làm quen từ từ, không ép bé chơi đùa liền đâu ạ, cho bé thời gian thích nghi thôi ạ",
            37
          ],
          [
            "in",
            "Vậy chị gửi bé từ thứ 5 đến chủ nhật tuần sau nha, em đón lại chủ nhật chiều",
            36
          ],
          [
            "out",
            "Dạ em note lại nha chị: gửi bé Bống từ thứ 5 đến chủ nhật (3 đêm), 120k/đêm = 360k ạ. Chị nhớ mang theo thức ăn quen thuộc của bé qua để bé đỡ lạ bụng nha",
            35
          ],
          [
            "in",
            "Ok em, mà bé đang ăn hạt Royal Canin, có cần mang theo không hay bên shop có sẵn",
            20
          ],
          [
            "out",
            "Dạ chị mang theo hạt quen của bé qua giúp em nha, đổi thức ăn đột ngột dễ làm bé bị tiêu chảy lắm ạ, bên em chỉ hỗ trợ nước uống với đồ chơi thôi ạ",
            19
          ],
          [
            "in",
            "Dạ ok, à sáng thứ 5 em bận họp không ghé được, có ai nhận giúp bé lúc 7h sáng không em",
            5
          ],
          [
            "in",
            "Với chị muốn hỏi thêm có chụp hình gửi hằng ngày cho em xem bé sao không, em lo lắm",
            5
          ]
        ]
      },
      {
        "ext": "sample-pet-zl-005",
        "phone": "0932187654",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Em ơi chị mới tắm bé Milu bên shop sáng nay xong á, sao về nhà vẫn thấy hôi hôi vậy em",
            6
          ],
          [
            "out",
            "Dạ chị cho em xin lỗi vì trải nghiệm chưa tốt ạ 🙏 Chị cho em hỏi mùi hôi giống mùi gì ạ, mùi lông ẩm hay mùi khác lạ ạ để em kiểm tra lại quy trình giúp chị",
            5
          ],
          [
            "in",
            "Giống mùi ẩm ẩm, chắc sấy chưa khô kỹ hay sao ấy",
            5
          ],
          [
            "out",
            "Dạ em xin lỗi chị, có thể do lông bé Milu dày nên phần sát da chưa khô hoàn toàn khi sấy ạ. Em xin phép mời chị đưa bé Milu qua lại để em sấy khô kỹ lại hoàn toàn miễn phí cho chị nha, không tính thêm phí gì ạ",
            4
          ],
          [
            "in",
            "Ừ vậy chiều nay chị ghé lại được không em",
            3
          ],
          [
            "out",
            "Dạ được ạ chị, chị ghé giờ nào tiện cứ nhắn em trước để em sắp lịch không phải đợi lâu ạ. Em thành thật xin lỗi chị vì sơ suất này ạ 🙏",
            2
          ],
          [
            "in",
            "3h chiều nay chị ghé nha",
            1
          ]
        ]
      },
      {
        "ext": "sample-pet-zl-006",
        "phone": "0898765432",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Em ơi tháng này tới lịch tắm gói cao cấp cho bé Bông chưa nhỉ",
            200
          ],
          [
            "out",
            "Dạ chị ơi, bé Bông lần trước tắm là ngày 15 tháng trước, tính ra khoảng tuần sau là tới lịch định kỳ rồi ạ 🐱 Chị đặt lịch trước cho chắc suất nha",
            199
          ],
          [
            "in",
            "Ok vậy đặt thứ 4 tuần sau đi em, giờ như cũ 10h sáng",
            198
          ],
          [
            "out",
            "Dạ em note lịch 10h sáng thứ 4 tuần sau cho bé Bông rồi ạ, gói spa cao cấp mèo Anh lông ngắn như mọi lần nha chị",
            197
          ],
          [
            "in",
            "Dạo này bé hơi biếng ăn, em có tư vấn gì không",
            150
          ],
          [
            "out",
            "Dạ chị để ý bé có nôn hay đi vệ sinh bất thường không ạ? Mèo Anh lông ngắn đôi khi biếng ăn do đổi thời tiết hoặc do bị búi lông trong bụng ạ, chị thử đổi vị pate hoặc cho bé ăn thêm malt hỗ trợ đẩy lông ra xem có đỡ không nha",
            149
          ],
          [
            "in",
            "À có thể đó, dạo này bé cũng hay ho khạc khạc như bị nghẹn",
            148
          ],
          [
            "out",
            "Dạ đúng rồi đó chị, nghe giống bị búi lông á, chị mua tuýp malt cho mèo ở tiệm thú y cho bé ăn 1-2cm mỗi ngày nha, với khi bé qua tắm em cũng chải kỹ gỡ bớt lông rụng giúp bé đỡ nuốt lông vào bụng ạ",
            147
          ],
          [
            "in",
            "Dạ cảm ơn em, để chị thử xem sao",
            146
          ],
          [
            "note",
            "Khách VIP - nhắc mua thêm malt hỗ trợ tiêu hóa lông khi bé đến tắm",
            145
          ],
          [
            "in",
            "Bé tắm xong rồi nè em, lông mượt hẳn, cảm ơn em nhiều",
            48
          ],
          [
            "out",
            "Dạ chị ơi bé Bông đẹp lắm luôn á 🥰 Chị nhớ theo dõi vụ ăn uống giúp em, không đỡ thì cho bé đi khám thú y kiểm tra thêm nha chị",
            47
          ]
        ]
      },
      {
        "ext": "sample-pet-zl-007",
        "phone": "0356789012",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Chào shop, cho mình hỏi giá cạo vôi răng cho chó với",
            60
          ],
          [
            "out",
            "Dạ chào anh ạ 🐶 Bên em cạo vôi răng cho chó giá 350k-500k tùy kích thước bé và mức độ vôi răng ạ. Bé nhà anh giống gì, nặng khoảng bao nhiêu kg ạ",
            59
          ],
          [
            "in",
            "Bé Luna nhà mình Husky, khoảng 22kg",
            58
          ],
          [
            "out",
            "Dạ với size 22kg thì gói cạo vôi răng khoảng 450k ạ, có kèm kiểm tra nướu răng luôn để coi bé có viêm nướu gì không nữa ạ",
            57
          ],
          [
            "in",
            "Ok để mình xem lịch rồi báo em sau nha",
            56
          ],
          [
            "in",
            "À mà bên em có gói spa cao cấp không, mình muốn làm luôn 1 lần cho gọn",
            40
          ],
          [
            "out",
            "Dạ có ạ anh, gói spa cao cấp bên em 950k gồm tắm 2 lớp, sấy tạo phồng, cắt tỉa móng, vệ sinh tai, xịt thơm ạ. Nếu anh làm combo spa cao cấp + cạo vôi răng luôn thì em có thể giảm giúp anh 50k tổng gói ạ",
            39
          ],
          [
            "in",
            "Vậy tính ra bao nhiêu tổng em",
            38
          ],
          [
            "out",
            "Dạ 950k + 450k - giảm 50k = 1.350.000đ ạ, anh đặt lịch ngày nào để em sắp xếp ạ",
            37
          ],
          [
            "in",
            "Để mình hỏi vợ coi cuối tuần này rảnh không rồi báo em nha",
            36
          ]
        ]
      }
    ],
    "deals": [
      {
        "title": "Tắm cắt tỉa lông Poodle - bé Mint",
        "phone": "0909123456",
        "value": 350000,
        "stageKind": "won",
        "wonDays": 3
      },
      {
        "title": "Khám tổng quát + tư vấn tiêm phòng - bé Tom (mèo Anh lông ngắn)",
        "phone": "0987654321",
        "value": 550000,
        "stageName": "Tư vấn",
        "closeDays": 5,
        "nextDays": 2,
        "next": "Gọi xác nhận lịch khám tổng quát cuối tuần cho bé Tom"
      },
      {
        "title": "Gói spa cao cấp Husky - bé Sói",
        "phone": "0778901234",
        "value": 950000,
        "stageKind": "won",
        "wonDays": 7
      },
      {
        "title": "Cạo vôi răng - bé Bống (Phốc sóc)",
        "phone": "0865432109",
        "value": 400000,
        "stageName": "Hẹn lịch",
        "closeDays": 4,
        "nextDays": 1,
        "next": "Nhắn xác nhận giờ hẹn cạo vôi răng cho bé Bống"
      },
      {
        "title": "Tiêm phòng dại - bé Kem (mèo Ba Tư)",
        "phone": "0912345678",
        "value": 250000,
        "stageKind": "lost",
        "lostDays": 20,
        "lostKw": "không liên lạc"
      },
      {
        "title": "Tắm cắt tỉa + trị ve rận - bé Milu (Poodle)",
        "phone": "0932187654",
        "value": 320000,
        "stageName": "Đã đến làm",
        "closeDays": 1,
        "nextDays": 0,
        "next": "Sấy khô lại miễn phí do khách phản ánh còn mùi ẩm"
      },
      {
        "title": "Khám tổng quát định kỳ - bé Đậu (Corgi)",
        "phone": "0703456789",
        "value": 450000,
        "stageName": "Chăm sau",
        "closeDays": 3,
        "nextDays": 3,
        "next": "Gọi hỏi thăm tình trạng sức khỏe bé Đậu sau khám"
      },
      {
        "title": "Gói spa cao cấp định kỳ - bé Bông (mèo Anh lông ngắn)",
        "phone": "0898765432",
        "value": 1200000,
        "stageName": "Tư vấn",
        "closeDays": 6,
        "nextDays": 4,
        "next": "Tư vấn thêm sản phẩm hỗ trợ tiêu hóa lông cho bé Bông"
      },
      {
        "title": "Combo tắm spa cao cấp + cạo vôi răng - bé Luna (Husky)",
        "phone": "0356789012",
        "value": 1350000,
        "stageName": "Hẹn lịch",
        "closeDays": 7,
        "nextDays": 2,
        "next": "Chờ anh Quân xác nhận lịch cuối tuần với vợ"
      }
    ],
    "activities": [
      {
        "phone": "0932187654",
        "subject": "Gọi xác nhận đã sấy khô lại cho bé Milu",
        "body": "Gọi hỏi thăm chị Kim Ngân xem bé Milu về nhà đã hết mùi ẩm chưa sau khi sấy lại miễn phí, xin lỗi thêm một lần nữa cho chu đáo",
        "dueOffsetHours": -5
      },
      {
        "phone": "0987654321",
        "subject": "Follow up câu hỏi tiêm phòng cho bé Tom",
        "body": "Nhắn lại anh Hùng xác nhận lịch khám tổng quát cuối tuần này cho bé Tom trước khi tiêm phòng",
        "dueOffsetHours": -26
      },
      {
        "phone": "0865432109",
        "subject": "Xác nhận người nhận bé Bống lúc 7h sáng thứ 5",
        "body": "Sắp xếp nhân viên trực sớm nhận bé Bống lúc 7h sáng thứ 5, đồng thời báo chị Trang sẽ chụp hình gửi mỗi ngày trong lúc gửi giữ",
        "dueOffsetHours": -0.5
      },
      {
        "phone": "0703456789",
        "subject": "Gọi hỏi thăm tình trạng bé Đậu sau khám tổng quát",
        "body": "Gọi hỏi thăm anh Tài xem bé Đậu sau khám tổng quát có ăn uống bình thường không, nhắc lịch tái khám nếu bác sĩ có dặn",
        "dueOffsetHours": 24
      },
      {
        "phone": "0898765432",
        "subject": "Nhắc lịch tắm gói spa cao cấp định kỳ cho bé Bông",
        "body": "Nhắn chị Hồng Nhung xác nhận lại lịch 10h sáng thứ 4 tuần sau, hỏi thăm tình hình ăn uống của bé Bông có đỡ biếng ăn chưa",
        "dueOffsetHours": 48
      },
      {
        "phone": "0356789012",
        "subject": "Tư vấn thêm combo spa cao cấp cho bé Luna",
        "body": "Gọi lại anh Quân hỏi đã bàn với vợ chưa, chốt lịch combo tắm spa cao cấp + cạo vôi răng cho bé Luna cuối tuần này",
        "dueOffsetHours": 72
      }
    ]
  },
  "fnb": {
    "companies": [
      {
        "name": "Công ty TNHH Sự Kiện Việt Phong",
        "domain": "vietphongevents.vn",
        "taxCode": "0312345678",
        "address": "12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM",
        "phone": "02838123456"
      }
    ],
    "contacts": [
      {
        "name": "Nguyễn Thị Minh Anh",
        "phone": "0912345678",
        "email": "minhanh.nguyen88@gmail.com",
        "tier": "vip",
        "address": "45 Lê Lợi, Quận 1",
        "province": "TP.HCM",
        "source": "zalo"
      },
      {
        "name": "Trần Văn Hùng",
        "phone": "0987654321",
        "email": "hungtran.work@gmail.com",
        "tier": "regular",
        "address": "12 Nguyễn Trãi, Quận 5",
        "province": "TP.HCM",
        "source": "facebook",
        "sourceNow": "zalo"
      },
      {
        "name": "Lê Thị Thu Hà",
        "phone": "0909123456",
        "email": "thuha.le99@gmail.com",
        "tier": "new",
        "address": "78 Xã Đàn, Đống Đa",
        "province": "Hà Nội",
        "source": "referral"
      },
      {
        "name": "Phạm Văn Đức",
        "phone": "0932112233",
        "email": "vanduc.pham@gmail.com",
        "tier": "regular",
        "address": "23 Phan Xích Long, Phú Nhuận",
        "province": "TP.HCM",
        "source": "zalo"
      },
      {
        "name": "Hoàng Thị Lan",
        "phone": "0977889900",
        "email": "lanhoang.dn@gmail.com",
        "tier": "vip",
        "address": "156 Nguyễn Văn Linh",
        "province": "Đà Nẵng",
        "source": "facebook"
      },
      {
        "name": "Vũ Minh Khôi",
        "phone": "0708123456",
        "email": "minhkhoi.vu@gmail.com",
        "tier": "new",
        "address": "34 Cách Mạng Tháng 8, Quận 3",
        "province": "TP.HCM",
        "source": "other"
      },
      {
        "name": "Đặng Thị Ngọc",
        "phone": "0339876543",
        "email": "ngocdang.ct@gmail.com",
        "tier": "dormant",
        "address": "89 Trần Hưng Đạo, Ninh Kiều",
        "province": "Cần Thơ",
        "source": "zalo"
      },
      {
        "name": "Bùi Văn Nam",
        "phone": "0918765432",
        "email": "buivannam.hcm@gmail.com",
        "tier": "regular",
        "address": "67 Lý Thường Kiệt, Tân Bình",
        "province": "TP.HCM",
        "source": "referral"
      },
      {
        "name": "Ngô Thị Hồng",
        "phone": "0793456789",
        "email": "hongngo.bd@gmail.com",
        "tier": "new",
        "address": "12 Đại lộ Bình Dương, Thủ Dầu Một",
        "province": "Bình Dương",
        "source": "facebook",
        "sourceNow": "zalo"
      },
      {
        "name": "Trịnh Văn Sơn",
        "phone": "0903123456",
        "email": "son.trinh@vietphongevents.vn",
        "tier": "vip",
        "address": "12 Nguyễn Huệ, Quận 1",
        "province": "TP.HCM",
        "source": "referral",
        "company": "vietphongevents.vn"
      },
      {
        "name": "Lý Thị Kim Chi",
        "phone": "0865432198",
        "email": "kimchi.ly@gmail.com",
        "tier": "regular",
        "address": "56 Điện Biên Phủ, Bình Thạnh",
        "province": "TP.HCM",
        "source": "zalo"
      },
      {
        "name": "Phan Văn Tài",
        "phone": "0328765432",
        "email": "vantai.phan@gmail.com",
        "tier": "dormant",
        "address": "90 Đồng Khởi, Biên Hoà",
        "province": "Đồng Nai",
        "source": "other"
      },
      {
        "name": "Đỗ Thị Yến",
        "phone": "0787654321",
        "email": "doyen.vt@gmail.com",
        "tier": "new",
        "address": "23 Thuỳ Vân, Phường 2",
        "province": "Vũng Tàu",
        "source": "facebook"
      },
      {
        "name": "Trương Minh Đăng",
        "phone": "0946123789",
        "email": "dangtruong.hcm@gmail.com",
        "tier": "regular",
        "address": "101 Cộng Hoà, Tân Bình",
        "province": "TP.HCM",
        "source": "zalo"
      }
    ],
    "threads": [
      {
        "ext": "sample-fnb-zl-001",
        "phone": "0912345678",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Shop ơi cho em hỏi tối nay quán còn bàn cho nhóm 6 người không ạ?",
            30
          ],
          [
            "out",
            "Dạ chào chị Minh Anh ạ 😊 Quán còn bàn ạ, chị muốn đặt lúc mấy giờ để shop giữ bàn cho mình nha?",
            29.5
          ],
          [
            "in",
            "Khoảng 7h tối nha em, tụi chị muốn ngồi khu ngoài sân vườn",
            29
          ],
          [
            "out",
            "Dạ được ạ, khu sân vườn tối nay còn trống 2 bàn 6 người. Em giữ bàn 7h cho chị luôn nha, chị cho em xin tên để lên sổ đặt bàn ạ",
            28.5
          ],
          [
            "in",
            "Tên Minh Anh nha, cho chị hỏi luôn quán có ổ cắm điện khu sân vườn không, tụi chị có laptop cần làm việc trước khi ăn",
            28
          ],
          [
            "out",
            "Dạ khu sân vườn có ổ cắm ở mỗi bàn luôn ạ, chị yên tâm nha 🔌",
            27.5
          ],
          [
            "in",
            "Ok em, vậy chốt 7h tối nay nha, cảm ơn em",
            27
          ],
          [
            "out",
            "Dạ em cảm ơn chị đã đặt bàn ạ, hẹn gặp chị tối nay nha 😊☕",
            26.5
          ],
          [
            "note",
            "Đã giữ bàn số 5-6 khu sân vườn cho chị Minh Anh, 19h tối nay",
            26
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-002",
        "phone": "0987654321",
        "status": "pending",
        "unread": 1,
        "m": [
          [
            "in",
            "Chào shop, mình muốn đặt tiệc sinh nhật cho bạn gái vào thứ 7 tuần này, khoảng 10 người",
            20
          ],
          [
            "out",
            "Dạ chào anh Hùng ạ! Quán mình nhận đặt tiệc sinh nhật nha anh, cho em hỏi anh muốn tổ chức khung giờ nào và có cần trang trí không ạ?",
            19.5
          ],
          [
            "in",
            "Khoảng 6h chiều, mình muốn trang trí bong bóng với có bánh kem luôn, quán có hỗ trợ không?",
            19
          ],
          [
            "out",
            "Dạ quán có gói trang trí bong bóng + banner chúc mừng sinh nhật, còn bánh kem thì mình liên kết với tiệm bánh gần đó đặt giúp anh được ạ. Anh có ngân sách khoảng bao nhiêu để em tư vấn gói phù hợp?",
            18.5
          ],
          [
            "in",
            "Khoảng 2 triệu cho tiệc, bánh với trang trí luôn nha",
            18
          ],
          [
            "out",
            "Dạ với ngân sách 2 triệu thì gói tụi em đề xuất: bàn 10 người + trà bánh set + trang trí bong bóng chủ đề + bánh kem 20cm, tổng khoảng 1.8-2tr ạ, anh xem qua hình mẫu trang trí em gửi nha",
            17.5
          ],
          [
            "out",
            "[Hình ảnh mẫu trang trí bong bóng]",
            17
          ],
          [
            "in",
            "Ưng nè, vậy chốt gói này nha em, cho mình đặt cọc trước được không",
            16
          ],
          [
            "out",
            "Dạ được ạ, anh chuyển khoản cọc 500k qua số tài khoản quán gửi anh nha, còn lại thanh toán khi tổ chức",
            15.5
          ],
          [
            "in",
            "Cho mình hỏi thêm là bánh kem có ghi tên được không em, với có thể đổi vị bánh khác được không",
            2
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-003",
        "phone": "0903123456",
        "status": "open",
        "unread": 0,
        "m": [
          [
            "in",
            "Chào shop, bên mình là công ty Việt Phong Events, muốn hỏi đặt tiệc trà chiều cho team building khoảng 18 người vào thứ 6 tuần sau",
            50
          ],
          [
            "out",
            "Dạ chào anh Sơn ạ, quán rất vui được phục vụ team bên mình nha. Anh cho em xin khung giờ dự kiến và mình cần khu vực riêng hay ngồi chung không ạ?",
            49
          ],
          [
            "in",
            "Tầm 2h chiều, bên mình cần khu riêng để có thể trao đổi công việc luôn, có màn hình càng tốt",
            48
          ],
          [
            "out",
            "Dạ quán có phòng riêng tầng 2 sức chứa 20 người, có sẵn TV kết nối HDMI ạ, không có máy chiếu nhưng TV to rõ không kém ạ 😊",
            47
          ],
          [
            "in",
            "Ok vậy được, cho mình xin menu set trà bánh cho nhóm luôn được không em",
            46
          ],
          [
            "out",
            "Dạ em gửi menu ạ: Set A 150k/người gồm trà/cafe + 2 loại bánh ngọt, Set B 200k/người có thêm trái cây và bánh mặn. Công ty mình chọn set nào ạ?",
            45
          ],
          [
            "out",
            "[Menu set trà chiều công ty.pdf]",
            44.5
          ],
          [
            "in",
            "Bên mình chọn Set B nha, 18 người, có thể xuất hoá đơn VAT được không shop?",
            44
          ],
          [
            "out",
            "Dạ được ạ, anh cho em xin thông tin công ty (tên, mã số thuế, địa chỉ) để bên em xuất hoá đơn nha",
            43
          ],
          [
            "in",
            "Công ty TNHH Sự Kiện Việt Phong, MST 0312345678, địa chỉ 12 Nguyễn Huệ Q1",
            42
          ],
          [
            "out",
            "Dạ em ghi nhận rồi ạ, tuần sau gần ngày em nhắn xác nhận lại số lượng chính xác với anh nha. Cảm ơn công ty mình đã tin tưởng quán ạ 🙏",
            41
          ],
          [
            "note",
            "Khách hàng doanh nghiệp - đặt phòng riêng tầng 2, Set B 200k x 18, cần xuất VAT, nhắc xác nhận số lượng trước ngày tổ chức",
            40
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-004",
        "phone": "0932112233",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Cho hỏi quán có chỗ đậu xe hơi không shop, mình đi nhóm 4 người có 1 xe hơi",
            60
          ],
          [
            "out",
            "Dạ chào anh ạ, quán có bãi đậu xe máy phía trước, còn xe hơi thì gửi bên hông toà nhà kế bên quán ạ, cách quán tầm 20m thôi anh",
            59.5
          ],
          [
            "in",
            "Ok vậy được, gửi xe đó có mất phí không em",
            59
          ],
          [
            "out",
            "Dạ có ạ, phí gửi xe hơi bên đó khoảng 20-30k/lượt tuỳ giờ ạ",
            58.5
          ],
          [
            "in",
            "Quán ơi bàn ngoài trời có mái che không, sợ nắng quá",
            58
          ],
          [
            "out",
            "Dạ có dù che nắng cho khu ngoài trời anh nha, mát mẻ lắm ạ",
            57.5
          ],
          [
            "in",
            "Ổn rồi, chắc tụi mình ngồi ngoài trời cho thoáng",
            57
          ],
          [
            "out",
            "Dạ vâng ạ, em xếp bàn ngoài trời gần dù lớn cho nhóm mình nha",
            56.5
          ],
          [
            "in",
            "Ok cảm ơn em, chiều nay mình ghé quán nha",
            56
          ],
          [
            "out",
            "Dạ vâng ạ, hẹn gặp anh chiều nay ☕😊",
            55.5
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-005",
        "phone": "0977889900",
        "status": "pending",
        "unread": 1,
        "m": [
          [
            "in",
            "Shop ơi hôm qua chị ghé quán tầm giờ trưa, đợi order gần 40 phút mới có nước, nhân viên thì đông khách nên chị hiểu nhưng hơi lâu quá",
            10
          ],
          [
            "out",
            "Dạ em xin lỗi chị Lan rất nhiều ạ 🙏 Hôm qua quán đông khách đột xuất nên phục vụ có chậm trễ, em ghi nhận phản hồi của chị để nhắc nhở lại team pha chế và order ạ",
            9.5
          ],
          [
            "in",
            "Ừ không sao, chị vẫn thích quán, chỉ góp ý thôi để lần sau tốt hơn",
            9
          ],
          [
            "out",
            "Dạ em cảm ơn chị đã góp ý ạ, chị là khách quen của quán nên em rất mong chị thông cảm. Em xin gửi chị 1 voucher giảm 20% cho lần ghé tiếp theo để bù đắp nha, mong chị tiếp tục ủng hộ quán ạ 🥰",
            8.5
          ],
          [
            "in",
            "Ôi em chu đáo quá, cảm ơn shop nha",
            8
          ],
          [
            "out",
            "Dạ voucher em sẽ gửi qua Zalo cho chị, mã LANVIP20 dùng trong tháng này ạ",
            7.5
          ],
          [
            "out",
            "[Voucher giảm 20% - LANVIP20]",
            7
          ],
          [
            "in",
            "Cảm ơn em, mai chị ghé thử món mới bên mình xem",
            3
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-006",
        "phone": "0865432198",
        "status": "open",
        "unread": 0,
        "m": [
          [
            "in",
            "Em ơi quán có món mới không, lâu lâu chị mới ghé nè",
            15
          ],
          [
            "out",
            "Dạ có chị ơi, tuần này quán mới ra mắt Trà Đào Cam Sả và Cafe Muối Kem Cheese đó ạ, chị thử xem nha 😍",
            14.5
          ],
          [
            "in",
            "Nghe hấp dẫn ghê, cái nào bán chạy hơn em",
            14
          ],
          [
            "out",
            "Dạ Trà Đào Cam Sả đang hot lắm chị ơi, mát với thơm sả tự nhiên, nhiều bạn khen lắm ạ",
            13.5
          ],
          [
            "in",
            "Vậy chiều nay chị ghé làm 1 ly xem sao, mà giá bao nhiêu em",
            13
          ],
          [
            "out",
            "Dạ giá 45k/ly size M, 55k size L chị nha",
            12.5
          ],
          [
            "in",
            "Ok để chị đổi gu thử, cảm ơn em nha",
            12
          ],
          [
            "out",
            "Dạ chị ghé quán nhớ nhắn em nha, em để dành bàn quen cho chị ☕😊",
            11.5
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-007",
        "phone": "0793456789",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Chào quán ơi, em thấy trên Facebook quán có góc hoa đẹp lắm, cho em hỏi cuối tuần này thứ 7 sáng có bàn ngoài trời cho nhóm 5 người không ạ",
            20
          ],
          [
            "out",
            "Dạ chào em, cảm ơn em đã quan tâm đến quán nha 😊 Sáng thứ 7 khu ngoài trời vẫn còn bàn ạ, em muốn đặt lúc mấy giờ?",
            19
          ],
          [
            "in",
            "Dạ khoảng 8h30 sáng ạ, tụi em muốn chụp hình sống ảo với quay ít clip nữa",
            18
          ],
          [
            "out",
            "Dạ được ạ, khu vườn hoa quán mở cửa từ 7h sáng nên ánh sáng đẹp lắm, em qua sớm chút chụp cực đẹp luôn ạ",
            17
          ],
          [
            "in",
            "Quán có tính phí chụp hình gì không ạ hay chỉ cần gọi nước là được",
            16
          ],
          [
            "out",
            "Dạ không tính phí chụp hình ạ, mỗi bạn gọi 1 nước là thoải mái chụp cả khu vườn nha em 📸",
            15
          ],
          [
            "in",
            "Dạ vậy tụi em cần đặt cọc giữ bàn trước không quán, sợ cuối tuần đông",
            14
          ],
          [
            "out",
            "Dạ khu ngoài trời cuối tuần khá đông nên quán có nhận cọc giữ chỗ 100k/bàn, tới quán sẽ trừ vào hoá đơn ạ",
            13
          ],
          [
            "in",
            "Dạ vậy cho em xin số tài khoản để chuyển khoản cọc ạ",
            1
          ]
        ]
      },
      {
        "ext": "sample-fnb-zl-008",
        "phone": "0946123789",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Shop ơi quán có wifi không, mật khẩu gì vậy",
            80
          ],
          [
            "out",
            "Dạ quán có wifi free ạ, tên wifi là CafeGocPho, pass là gocpho2025 nha anh",
            79.5
          ],
          [
            "in",
            "Ok thanks em, mà quán mở cửa tới mấy giờ vậy, tối nay mình muốn ngồi làm việc trễ chút",
            79
          ],
          [
            "out",
            "Dạ quán mở tới 22h30 các ngày trong tuần ạ, cuối tuần thì tới 23h anh nha",
            78.5
          ],
          [
            "in",
            "Ổn đó, chắc tối nay mình ngồi tới 9h30 làm nốt deadline",
            78
          ],
          [
            "out",
            "Dạ anh cứ thoải mái ngồi nha, có cần hỗ trợ gì cứ gọi em ạ 💪",
            77.5
          ],
          [
            "in",
            "Cảm ơn em nhiều, để mình ghé",
            77
          ],
          [
            "out",
            "Dạ hẹn gặp anh tối nay ☕",
            76.5
          ]
        ]
      }
    ],
    "deals": [
      {
        "title": "Đặt bàn sân vườn tối - nhóm 6 người (chị Minh Anh)",
        "phone": "0912345678",
        "value": 350000,
        "stageKind": "won",
        "wonDays": 1,
        "closeDays": 0,
        "nextDays": 3,
        "next": "Nhắn hỏi cảm nhận buổi tối và mời đặt bàn lần sau"
      },
      {
        "title": "Tiệc trà chiều team building - Công ty Việt Phong (18 người)",
        "phone": "0903123456",
        "value": 4200000,
        "stageKind": "won",
        "wonDays": 3,
        "closeDays": 0,
        "nextDays": 4,
        "next": "Xác nhận lại số lượng khách trước ngày tổ chức"
      },
      {
        "title": "Đặt tiệc sinh nhật nhóm - chị Ngọc (đã hủy)",
        "phone": "0339876543",
        "value": 1600000,
        "stageKind": "lost",
        "lostDays": 20,
        "lostKw": "khác",
        "closeDays": 0,
        "nextDays": 14,
        "next": "Thỉnh thoảng nhắn ưu đãi để mời khách quay lại"
      },
      {
        "title": "Tiệc sinh nhật bạn gái - trang trí bong bóng (anh Hùng)",
        "phone": "0987654321",
        "value": 1900000,
        "stageName": "Đặt bàn",
        "closeDays": 3,
        "nextDays": 0,
        "next": "Nhắc anh Hùng chuyển khoản cọc 500k giữ tiệc sinh nhật"
      },
      {
        "title": "Đặt bàn ngoài trời chụp hình - nhóm 5 bạn (Ngô Thị Hồng)",
        "phone": "0793456789",
        "value": 500000,
        "stageName": "Đặt bàn",
        "closeDays": 2,
        "nextDays": 0,
        "next": "Chờ khách chuyển khoản cọc 100k giữ bàn ngoài trời"
      },
      {
        "title": "Đặt bàn quen buổi chiều - thử món mới (chị Kim Chi)",
        "phone": "0865432198",
        "value": 280000,
        "stageName": "Quay lại",
        "closeDays": 5,
        "nextDays": 3,
        "next": "Hỏi thăm cảm nhận món mới, mời đặt bàn nhóm dịp tới"
      },
      {
        "title": "Đặt bàn đôi buổi tối (anh Đức)",
        "phone": "0932112233",
        "value": 320000,
        "stageName": "Đã đến",
        "closeDays": 0,
        "nextDays": 2,
        "next": "Gửi lời cảm ơn, mời đánh giá 5 sao Google Maps"
      },
      {
        "title": "Hỏi đặt tiệc sinh nhật nhỏ cuối tuần (chị Yến)",
        "phone": "0787654321",
        "value": 1700000,
        "stageName": "Hỏi",
        "closeDays": 4,
        "nextDays": 1,
        "next": "Gọi tư vấn gói sinh nhật phù hợp ngân sách 1.7 triệu"
      },
      {
        "title": "Đặt bàn ngoài trời mừng sinh nhật nhỏ - đã tổ chức (anh Đăng)",
        "phone": "0946123789",
        "value": 780000,
        "stageName": "Đã đến",
        "closeDays": 0,
        "nextDays": 7,
        "next": "Nhắn dịp lễ sắp tới, mời quay lại đặt bàn nhóm"
      }
    ],
    "activities": [
      {
        "phone": "0987654321",
        "subject": "Nhắc chuyển khoản cọc tiệc sinh nhật",
        "body": "Gọi hoặc nhắn Zalo nhắc anh Hùng chuyển khoản cọc 500k để giữ lịch trang trí thứ 7 này",
        "dueOffsetHours": -5
      },
      {
        "phone": "0793456789",
        "subject": "Chờ khách chuyển cọc giữ bàn ngoài trời",
        "body": "Theo dõi khách Ngô Thị Hồng chuyển khoản cọc 100k giữ bàn sáng thứ 7, nếu chưa thấy thì nhắn nhắc lại",
        "dueOffsetHours": -2
      },
      {
        "phone": "0339876543",
        "subject": "Nhắn ưu đãi mời khách cũ quay lại",
        "body": "Gửi tin nhắn ưu đãi giảm giá nhẹ để mời chị Ngọc quay lại quán sau lần hủy tiệc trước đó",
        "dueOffsetHours": -30
      },
      {
        "phone": "0903123456",
        "subject": "Xác nhận lại số lượng khách tiệc công ty thứ Bảy",
        "body": "Gọi anh Sơn bên Việt Phong Events xác nhận số lượng chính xác 18 người và giờ tổ chức trước khi chuẩn bị",
        "dueOffsetHours": 0.5
      },
      {
        "phone": "0977889900",
        "subject": "Theo dõi phản hồi voucher xin lỗi",
        "body": "Xem chị Lan đã dùng voucher LANVIP20 chưa, nếu chưa thì nhắn nhẹ nhàng mời chị ghé lại",
        "dueOffsetHours": 20
      },
      {
        "phone": "0787654321",
        "subject": "Gọi tư vấn gói tiệc sinh nhật cho chị Yến",
        "body": "Tư vấn chi tiết gói sinh nhật 1.7 triệu, gửi hình ảnh mẫu trang trí cho chị Yến tham khảo",
        "dueOffsetHours": 26
      }
    ]
  },
  "retail": {
    "companies": [
      {
        "name": "Công ty TNHH Thương mại Kim Cương Xanh",
        "domain": "kimcuongxanh.com.vn",
        "taxCode": "0312456789",
        "address": "45 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        "phone": "02838223344"
      },
      {
        "name": "Công ty Cổ phần Nhân sự Hoa Mai",
        "domain": "hoamaihr.vn",
        "taxCode": "0107896543",
        "address": "88 Xã Đàn, Phường Nam Đồng, Quận Đống Đa, Hà Nội",
        "phone": "02435667788"
      }
    ],
    "contacts": [
      {
        "name": "Nguyễn Thị Ngọc Anh",
        "phone": "0912345678",
        "email": "ngocanh.nguyen@gmail.com",
        "tier": "vip",
        "address": "12 Lê Văn Sỹ, Phường 13, Quận 3",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      },
      {
        "name": "Trần Thị Bích Ngân",
        "phone": "0938221145",
        "email": "bichngan.tran@yahoo.com",
        "tier": "vip",
        "address": "56 Điện Biên Phủ, Phường 15, Quận Bình Thạnh",
        "province": "TP. Hồ Chí Minh",
        "source": "facebook"
      },
      {
        "name": "Lê Thị Hồng Nhung",
        "phone": "0327789456",
        "email": "hongnhung.le90@gmail.com",
        "tier": "regular",
        "address": "23 Phạm Văn Thuận, Phường Tân Tiến",
        "province": "Đồng Nai",
        "source": "zalo"
      },
      {
        "name": "Phạm Văn Đức",
        "phone": "0703456789",
        "email": "phamvanduc.pd@gmail.com",
        "tier": "regular",
        "address": "78 Nguyễn Văn Linh, Phường Hòa Cường Bắc, Quận Hải Châu",
        "province": "Đà Nẵng",
        "source": "referral"
      },
      {
        "name": "Vũ Thị Thanh Thảo",
        "phone": "0865123478",
        "email": "thanhthao.vu@gmail.com",
        "tier": "new",
        "address": "34 Đại lộ Bình Dương, Phường Phú Hòa",
        "province": "Bình Dương",
        "source": "facebook"
      },
      {
        "name": "Đặng Thị Kim Oanh",
        "phone": "0919887766",
        "email": "kimoanh.dang@gmail.com",
        "tier": "dormant",
        "address": "19 Nguyễn Trãi, Phường An Hòa, Quận Ninh Kiều",
        "province": "Cần Thơ",
        "source": "zalo"
      },
      {
        "name": "Hoàng Thị Mai Linh",
        "phone": "0345678912",
        "email": "mailinh.hoang@gmail.com",
        "tier": "new",
        "address": "5 Trần Phú, Phường Lộc Thọ",
        "province": "Khánh Hòa",
        "source": "other"
      },
      {
        "name": "Nguyễn Văn Tài",
        "phone": "0777889900",
        "email": "vantai.nguyen@gmail.com",
        "tier": "regular",
        "address": "102 Nguyễn Văn Cừ, Phường Bồ Đề, Quận Long Biên",
        "province": "Hà Nội",
        "source": "referral"
      },
      {
        "name": "Bùi Thị Ngọc Trâm",
        "phone": "0898123456",
        "email": "ngoctram.bui@gmail.com",
        "tier": "vip",
        "address": "27 Trần Thái Tông, Phường Dịch Vọng, Quận Cầu Giấy",
        "province": "Hà Nội",
        "source": "zalo"
      },
      {
        "name": "Trịnh Thị Yến Nhi",
        "phone": "0356789123",
        "email": "yennhi.trinh@gmail.com",
        "tier": "dormant",
        "address": "9 Thùy Vân, Phường Thắng Tam",
        "province": "Bà Rịa - Vũng Tàu",
        "source": "facebook"
      },
      {
        "name": "Nguyễn Thị Kim Cương",
        "phone": "0908765432",
        "email": "kimcuong.nguyen@kimcuongxanh.com.vn",
        "tier": "regular",
        "address": "45 Nguyễn Huệ, Phường Bến Nghé, Quận 1",
        "province": "TP. Hồ Chí Minh",
        "source": "other",
        "company": "kimcuongxanh.com.vn"
      },
      {
        "name": "Lê Văn Hải",
        "phone": "0913579246",
        "email": "hai.le@hoamaihr.vn",
        "tier": "regular",
        "address": "88 Xã Đàn, Phường Nam Đồng, Quận Đống Đa",
        "province": "Hà Nội",
        "source": "referral",
        "company": "hoamaihr.vn"
      },
      {
        "name": "Phan Thị Thu Hà",
        "phone": "0384567123",
        "email": "thuha.phan@gmail.com",
        "tier": "new",
        "address": "14 Đặng Huy Trứ, Phường Phú Hội",
        "province": "Thừa Thiên Huế",
        "source": "zalo"
      },
      {
        "name": "Đỗ Thị Bích Phượng",
        "phone": "0937456123",
        "email": "bichphuong.do@gmail.com",
        "tier": "vip",
        "address": "68 Nguyễn Thị Thập, Phường Tân Phú, Quận 7",
        "province": "TP. Hồ Chí Minh",
        "source": "zalo"
      }
    ],
    "threads": [
      {
        "ext": "sample-retail-zl-001",
        "phone": "0912345678",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Chị ơi shop có kem nền nào hợp da dầu mụn ẩn không ạ?",
            96
          ],
          [
            "out",
            "Dạ chào chị Ngọc Anh ạ 💕 Bên em có dòng kem nền kiềm dầu Missha hoặc La Roche-Posay đó chị, kiềm dầu tốt lắm ạ",
            95
          ],
          [
            "in",
            "Vậy 2 loại đó giá sao em, chị da dầu mụn ẩn hay bóng dầu vùng chữ T",
            95
          ],
          [
            "out",
            "Dạ La Roche-Posay Toleriane giá 690k, Missha thì 450k ạ. Với da dầu mụn ẩn chị dùng La Roche-Posay sẽ dịu nhẹ hơn, không gây bí da đâu ạ",
            94
          ],
          [
            "in",
            "Ok để chị suy nghĩ thêm, có kèm sample thử không em",
            93
          ],
          [
            "out",
            "Dạ có chị ơi, chị mua kem nền là em tặng kèm 2 miếng sample kem chống nắng cùng dòng luôn ạ 🎁",
            93
          ],
          [
            "in",
            "Cho chị xin thêm hình bảng màu đi em, chị không biết chọn tone nào",
            72
          ],
          [
            "out",
            "Dạ để em gửi chị bảng màu đủ 4 tone nha, chị nhắn màu da chị theo mùa hè này để em tư vấn tone chuẩn hơn ạ",
            71
          ],
          [
            "in",
            "Da chị hơi ngăm á em, nắng nhiều dạo này",
            70
          ],
          [
            "out",
            "Dạ vậy chị hợp tone 23 hoặc 25 đó ạ, để em giữ sẵn 1 hộp tone 23 chị ghé thử trước cho chắc nha 💄",
            70
          ],
          [
            "in",
            "Cuối tuần chị mới ghé được, để hộp đó cho chị nha em",
            48
          ],
          [
            "out",
            "Dạ em giữ hàng cho chị đến hết Chủ nhật này nha, chị ghé trước giờ đóng cửa (21h) là được ạ",
            47
          ],
          [
            "in",
            "Cho hỏi thêm là kem này dùng ban ngày cần bôi chống nắng riêng nữa không hay đủ rồi ạ?",
            3
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-002",
        "phone": "0938221145",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Shop ơi cho em hỏi serum vitamin C bên mình là hàng chính hãng thật không ạ? Em thấy giá rẻ hơn mấy chỗ khác nên hơi lo",
            120
          ],
          [
            "out",
            "Dạ chào chị Ngân ạ, bên em cam kết 100% hàng chính hãng nhập khẩu, có hóa đơn nhập hàng và tem chống hàng giả đầy đủ ạ 💕",
            119
          ],
          [
            "in",
            "Vậy sao giá lại rẻ hơn shop khác vậy em, em sợ hàng fake",
            118
          ],
          [
            "out",
            "Dạ vì bên em nhập số lượng lớn trực tiếp từ nhà phân phối nên giá tốt hơn ạ, chị yên tâm nha. Em gửi chị xem hình tem chống giả với mã tra cứu trên web hãng luôn nè",
            117
          ],
          [
            "in",
            "[hình ảnh]",
            117
          ],
          [
            "out",
            "Dạ đây chị, chị quét mã QR trên vỏ hộp là tra được ngày sản xuất với nhà phân phối chính thức luôn ạ, shop cũng có chính sách đổi trả trong 7 ngày nếu phát hiện có vấn đề",
            116
          ],
          [
            "in",
            "Ok để chị yên tâm hơn rồi, vậy chị lấy 1 chai serum Vitamin C loại 30ml nha",
            96
          ],
          [
            "out",
            "Dạ em chốt đơn cho chị 1 chai Vitamin C 30ml giá 590k, chị lấy giao tận nơi hay ghé lấy trực tiếp ạ?",
            95
          ],
          [
            "in",
            "Chị nhờ giao qua ship nha em, địa chỉ như cũ",
            95
          ],
          [
            "out",
            "Dạ em gửi đơn hàng đi trong hôm nay luôn ạ, cảm ơn chị Ngân tin tưởng shop nhiều nha 💕✨",
            94
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-003",
        "phone": "0908765432",
        "status": "pending",
        "unread": 0,
        "m": [
          [
            "in",
            "Chào shop, bên em là công ty Kim Cương Xanh, năm nay muốn đặt set quà mỹ phẩm tặng nhân viên dịp Tết, shop có làm số lượng lớn không ạ?",
            240
          ],
          [
            "out",
            "Dạ chào anh/chị, bên em nhận đặt sỉ set quà Tết cho doanh nghiệp ạ. Cho em hỏi bên mình dự kiến khoảng bao nhiêu suất và ngân sách tầm bao nhiêu 1 suất để em tư vấn set phù hợp ạ",
            239
          ],
          [
            "in",
            "Công ty em có khoảng 25 bạn nữ thôi, ngân sách tầm 450-550k 1 suất",
            238
          ],
          [
            "out",
            "Dạ với ngân sách đó em đề xuất set gồm sữa rửa mặt + toner + kem dưỡng mini size, đóng hộp giấy sang trọng có thể in logo công ty lên hộp luôn ạ, giá sỉ khoảng 500k/suất",
            237
          ],
          [
            "in",
            "In logo có tính thêm phí không em?",
            236
          ],
          [
            "out",
            "Dạ có ạ, phí thiết kế và in hộp riêng là 2tr trọn gói cho toàn bộ 25 hộp (không tính theo suất), thời gian làm khoảng 7-10 ngày ạ",
            235
          ],
          [
            "in",
            "Cho chị xin catalogue mẫu hộp với vài mẫu set đã làm trước đây được không em",
            210
          ],
          [
            "out",
            "Dạ em gửi chị catalogue qua Zalo nha, chị xem thử rồi mình chốt mẫu sớm để kịp Tết ạ vì cận Tết bên em khá đông đơn 🙏",
            209
          ],
          [
            "in",
            "[file] Catalogue_MyPhamNgocTrai_2026.pdf",
            209
          ],
          [
            "in",
            "Chị xem rồi, chị thích mẫu hộp số 2 với set dưỡng da, để chị hỏi lại sếp rồi báo em nha",
            160
          ],
          [
            "out",
            "Dạ vâng chị, anh/chị cần hỗ trợ thêm thông tin gì cứ nhắn em nha, em giữ báo giá này đến hết tháng cho công ty mình ạ",
            159
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-004",
        "phone": "0865123478",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Em ơi shop còn son kem lì màu đỏ đất mã 06 không ạ?",
            50
          ],
          [
            "out",
            "Dạ chào chị Thảo, để em kiểm tra kho xíu nha chị 💄",
            50
          ],
          [
            "out",
            "Dạ còn chị ơi, còn đúng 2 cây màu 06 đó ạ",
            49
          ],
          [
            "in",
            "Chị giữ giúp em 1 cây nha, chiều nay em ghé lấy được không?",
            49
          ],
          [
            "out",
            "Dạ được chị ơi, em giữ hàng cho chị đến 19h tối nay nha, chị ghé sớm hơn thì nhắn em trước 1 chút để em chuẩn bị sẵn ạ",
            48
          ],
          [
            "in",
            "Ok em cảm ơn, chắc khoảng 5h chiều chị ghé",
            48
          ],
          [
            "out",
            "Dạ vâng ạ, hẹn gặp chị chiều nay nha 🎀",
            47
          ],
          [
            "in",
            "À mà cây son đó có test màu lên môi được không hay phải mua về mới biết",
            30
          ],
          [
            "out",
            "Dạ có chị ơi, ở shop có bảng test màu cho chị thử trực tiếp lên tay và môi trước khi mua luôn ạ, chị yên tâm ghé thử nha",
            29
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-005",
        "phone": "0919887766",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Shop ơi em dùng kem dưỡng ẩm ban đêm mua tuần trước mà mấy hôm nay mặt em nổi mụn li ti nhiều lắm, có phải do sản phẩm không vậy em?",
            30
          ],
          [
            "out",
            "Dạ em chào chị Oanh, chị cho em xin thêm thông tin là chị dùng được bao lâu rồi ạ và mụn nổi ở vùng nào nhiều nhất để em kiểm tra giúp chị nha",
            29
          ],
          [
            "in",
            "Em dùng được 5 ngày rồi, mụn nổi nhiều ở 2 bên má với cằm",
            29
          ],
          [
            "out",
            "Dạ tình trạng này có thể là da chị đang \"đẩy mụn\" do sản phẩm mới hoặc cũng có thể không hợp da chị ạ. Chị có đang dùng chung với sản phẩm treatment nào khác không (như retinol, AHA/BHA) không ạ?",
            28
          ],
          [
            "in",
            "Không ạ em chỉ dùng đúng sản phẩm đó với sữa rửa mặt bình thường thôi",
            28
          ],
          [
            "out",
            "Dạ em hiểu rồi ạ, để đảm bảo an toàn cho da chị, em xin phép hỗ trợ chị đổi sang dòng kem dưỡng dịu nhẹ hơn (không chứa dầu khoáng) hoặc hoàn tiền lại nếu chị không muốn dùng tiếp nha, chị thấy phương án nào ổn hơn ạ 🙏",
            27
          ],
          [
            "note",
            "Không phải lỗi sản phẩm, có thể da khách đang purging hoặc kích ứng nhẹ, đã tư vấn đổi sang dòng lành tính theo quy trình CSKH",
            27
          ],
          [
            "in",
            "Thôi em muốn đổi sang loại khác dịu nhẹ hơn đó, shop tư vấn giúp em với",
            27
          ],
          [
            "out",
            "Dạ chị ghé shop mang theo hộp kem cũ (còn tối thiểu 70% là đổi được ạ), em sẽ đổi cho chị dòng Cetaphil hoặc La Roche-Posay Toleriane, 2 dòng này lành tính cho da nhạy cảm đang kích ứng ạ",
            26
          ],
          [
            "in",
            "Ok để mai em ghé đổi, cảm ơn shop tư vấn nhiệt tình",
            26
          ],
          [
            "in",
            "À mà em ghé được không hay phải hẹn trước ạ?",
            4
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-006",
        "phone": "0898123456",
        "status": "closed",
        "unread": 0,
        "m": [
          [
            "in",
            "Chị ơi shop có hàng mới về không, lâu rồi chị chưa ghé 🥰",
            80
          ],
          [
            "note",
            "Khách VIP thân thiết, mua hàng đều đặn mỗi tháng, ưu tiên phản hồi nhanh",
            80
          ],
          [
            "out",
            "Dạ có chị Trâm ơi, tuần này shop vừa nhập về dòng nước hoa mini mới với bộ trang điểm mùa hè cực xinh luôn ạ ✨",
            79
          ],
          [
            "in",
            "Cho chị xem hình đi em",
            79
          ],
          [
            "out",
            "[hình ảnh] Đây chị ơi, bộ 3 nước hoa mini 10ml các mùi hoa hồng, vani, và cam chanh, giá 850k trọn bộ ạ",
            78
          ],
          [
            "in",
            "Đẹp á, mà chị hợp mùi nào ta, chị thích mùi ngọt nhẹ nhẹ thôi",
            78
          ],
          [
            "out",
            "Dạ vậy chị hợp mùi vani với hoa hồng đó ạ, 2 mùi này thơm nhẹ nhàng lịch sự, đi làm xức cũng hợp luôn ạ",
            77
          ],
          [
            "in",
            "Ok chị lấy trọn bộ 3 mùi luôn cho đủ bộ sưu tập 😂",
            76
          ],
          [
            "out",
            "Dạ em chốt đơn cho chị bộ 3 nước hoa mini 850k nha, chị lấy tại shop như mọi lần đúng không ạ?",
            76
          ],
          [
            "in",
            "Ừ chiều mai chị ghé lấy luôn",
            75
          ],
          [
            "out",
            "Dạ vâng ạ, em chuẩn bị sẵn cho chị, cảm ơn chị Trâm ủng hộ shop hoài nha 💕",
            74
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-007",
        "phone": "0913579246",
        "status": "pending",
        "unread": 1,
        "m": [
          [
            "in",
            "Chào shop, em bên phòng nhân sự công ty Hoa Mai, cho em hỏi thông tin đặt quà Tết mỹ phẩm cho nhân viên nữ với ạ",
            60
          ],
          [
            "out",
            "Dạ chào anh Hải, bên em có nhận đặt set quà Tết doanh nghiệp ạ. Anh cho em xin số lượng dự kiến và mức giá mong muốn để em báo giá phù hợp nha",
            59
          ],
          [
            "in",
            "Công ty em khoảng 35 bạn nữ thôi, ngân sách tầm 400-450k/suất",
            58
          ],
          [
            "out",
            "Dạ với mức đó em đề xuất set mini gồm nước tẩy trang + kem dưỡng da tay + son dưỡng, đóng túi vải Tết đỏ xinh xắn, giá khoảng 420k/suất ạ",
            57
          ],
          [
            "in",
            "Nghe ổn đó, có mẫu hình gửi em xem không ạ",
            40
          ],
          [
            "out",
            "Dạ có anh, em gửi hình mẫu túi quà liền nha 🎁",
            39
          ],
          [
            "in",
            "[hình ảnh]",
            39
          ],
          [
            "in",
            "Ok đẹp á, để em trình sếp duyệt rồi báo lại shop sớm",
            38
          ]
        ]
      },
      {
        "ext": "sample-retail-zl-008",
        "phone": "0937456123",
        "status": "open",
        "unread": 1,
        "m": [
          [
            "in",
            "Shop ơi da chị dạo này khô bong tróc quá, có kem dưỡng nào đậm đặc mà không gây bí da không em?",
            90
          ],
          [
            "out",
            "Dạ chào chị Phượng, da khô mùa này bên em recommend kem dưỡng ẩm chuyên sâu của Laneige hoặc dòng Cerave đó ạ, cấp ẩm tốt mà kết cấu nhẹ không bí da đâu ạ",
            89
          ],
          [
            "in",
            "2 loại đó khác nhau sao em, chị đang phân vân",
            88
          ],
          [
            "out",
            "Dạ Laneige thơm nhẹ, kết cấu gel-cream mát da, giá 780k ạ. Cerave thì không mùi, có ceramide phục hồi da tốt hơn cho da khô nứt nẻ, giá 450k ạ",
            87
          ],
          [
            "in",
            "Chị da khô nứt nẻ luôn á, chắc lấy Cerave cho lành",
            86
          ],
          [
            "out",
            "Dạ vậy hợp với chị lắm ạ, chị dùng thêm cả sữa rửa mặt Cerave nữa không, dòng đó cũng dịu nhẹ không làm khô da thêm ạ",
            85
          ],
          [
            "in",
            "Ừ lấy luôn combo đi em cho tiện",
            85
          ],
          [
            "out",
            "Dạ em chốt combo Cerave sữa rửa mặt + kem dưỡng cho chị, tổng 680k ạ (có giảm 10% khi mua combo), chị nhận hàng qua ship hay ghé lấy ạ?",
            84
          ],
          [
            "in",
            "Ship về nhà cho chị nha, địa chỉ cũ",
            84
          ],
          [
            "out",
            "Dạ em lên đơn ngay ạ, dự kiến giao trong 1-2 ngày tới nha chị 💕",
            83
          ],
          [
            "in",
            "Cho chị hỏi thêm là dùng Cerave xong có cần bôi thêm kem chống nắng riêng ban ngày không hay đủ ẩm rồi khỏi cần?",
            1
          ]
        ]
      }
    ],
    "deals": [
      {
        "title": "Serum Vitamin C 30ml – chị Bích Ngân",
        "phone": "0938221145",
        "value": 590000,
        "stageKind": "won",
        "wonDays": 6
      },
      {
        "title": "Set nước hoa mini 3 mùi – chị Ngọc Trâm",
        "phone": "0898123456",
        "value": 850000,
        "stageKind": "won",
        "wonDays": 2
      },
      {
        "title": "Bộ chăm sóc da chống lão hóa cao cấp – chị Yến Nhi",
        "phone": "0356789123",
        "value": 2800000,
        "stageKind": "lost",
        "lostDays": 10,
        "lostKw": "giá cao"
      },
      {
        "title": "Kem nền kiềm dầu La Roche-Posay – chị Ngọc Anh",
        "phone": "0912345678",
        "value": 690000,
        "stageName": "Hỏi",
        "closeDays": 3,
        "nextDays": 0,
        "next": "Gọi hỏi chị Ngọc Anh đã chọn tone màu chưa, nhắc hộp tone 23 đang giữ"
      },
      {
        "title": "Son kem lì màu 06 – em Thanh Thảo",
        "phone": "0865123478",
        "value": 320000,
        "stageName": "Giữ hàng",
        "closeDays": 1,
        "nextDays": 0,
        "next": "Nhắc em Thảo ghé lấy son đã giữ trước 19h"
      },
      {
        "title": "Combo Cerave sữa rửa mặt + kem dưỡng – chị Bích Phượng",
        "phone": "0937456123",
        "value": 680000,
        "stageName": "Đã mua",
        "closeDays": 0,
        "nextDays": 1,
        "next": "Theo dõi đơn ship, hỏi thăm chị Phượng dùng có hợp da không"
      },
      {
        "title": "Đổi kem dưỡng ẩm dịu nhẹ (do nổi mụn) – chị Kim Oanh",
        "phone": "0919887766",
        "value": 450000,
        "stageName": "Quay lại",
        "closeDays": 2,
        "nextDays": -1,
        "next": "Xác nhận lịch chị Oanh ghé đổi kem, chuẩn bị sẵn hộp Cetaphil"
      },
      {
        "title": "Set quà Tết sỉ 25 suất – Cty Kim Cương Xanh",
        "phone": "0908765432",
        "value": 12500000,
        "stageName": "Hỏi",
        "closeDays": 15,
        "nextDays": 3,
        "next": "Gọi hỏi công ty đã duyệt mẫu hộp số 2 chưa, chốt số lượng in logo"
      },
      {
        "title": "Set quà Tết sỉ 35 suất – Cty Hoa Mai",
        "phone": "0913579246",
        "value": 14700000,
        "stageName": "Hỏi",
        "closeDays": 20,
        "nextDays": 5,
        "next": "Theo dõi phản hồi duyệt sếp bên Hoa Mai, gửi thêm mẫu túi nếu cần"
      }
    ],
    "activities": [
      {
        "phone": "0908765432",
        "subject": "Gọi chốt đơn sỉ quà Tết cho Kim Cương Xanh",
        "body": "Gọi hỏi công ty đã duyệt mẫu hộp số 2 và số lượng in logo chưa, chốt đơn trước cuối tuần",
        "dueOffsetHours": -20
      },
      {
        "phone": "0919887766",
        "subject": "Xác nhận lịch chị Oanh ghé đổi kem dưỡng",
        "body": "Chuẩn bị sẵn hộp Cetaphil/La Roche-Posay để đổi cho chị Oanh, xác nhận lại giờ ghé shop",
        "dueOffsetHours": -5
      },
      {
        "phone": "0865123478",
        "subject": "Nhắc khách lấy son đã giữ",
        "body": "Gọi nhắc em Thảo ghé lấy son kem lì màu 06 đã giữ, hết hạn giữ hàng lúc 19h hôm nay",
        "dueOffsetHours": -1
      },
      {
        "phone": "0937456123",
        "subject": "Trả lời câu hỏi chống nắng cho chị Phượng",
        "body": "Trả lời tin nhắn Zalo của chị Phượng về việc có cần dùng thêm kem chống nắng ban ngày sau Cerave không",
        "dueOffsetHours": 1
      },
      {
        "phone": "0913579246",
        "subject": "Theo dõi phản hồi duyệt quà Tết Hoa Mai",
        "body": "Gọi hỏi tiến độ duyệt mẫu túi quà Tết bên Hoa Mai, gửi thêm mẫu nếu sếp chưa ưng ý",
        "dueOffsetHours": 48
      },
      {
        "phone": "0356789123",
        "subject": "Gọi thăm hỏi chị Yến Nhi, mời quay lại",
        "body": "Chăm sóc lại khách cũ đã từ chối mua bộ dưỡng da chống lão hóa vì giá cao, gửi voucher giảm 10% mời quay lại",
        "dueOffsetHours": 72
      }
    ]
  }
};
