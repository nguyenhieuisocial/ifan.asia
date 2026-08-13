# ADR-0017 — Quyền lệnh bot: một BẢNG duy nhất, và cho trình biên dịch canh thay người (14/08/2026)

**Trạng thái:** đã quyết, CHƯA thi công.
**Người quyết:** Opus 5, phiên đêm 13→14/08.
**Nguồn:** việc #135, sinh ra từ việc #134 (rà cửa đọc dữ liệu ngoài app) sau **ba** lỗ quyền liên tiếp trong một đêm.

---

## 1. Bài toán — ba lỗ, một gốc

| Lỗ | Cổng đã hỏi | Lẽ ra phải hỏi |
|---|---|---|
| #119 — người lạ chiếm quyền chủ dự án trên bot | "có phải chủ tiệm nào đó không?" | "có phải chủ dự án không?" |
| #121 — nhân viên lấy SĐT mọi khách qua Zalo | "khách này có trong tiệm không?" | "người này mở app có xem được không?" |
| `/trangthai` — lộ số liệu kinh doanh mật | "chat này được nhắn bot không?" | "người nhắn là ai?" |

Cùng một gốc: **cổng hỏi sai câu, và không có gì bắt nó phải hỏi đúng.**

Riêng lỗ thứ ba còn có đặc điểm đáng sợ hơn: nó **không phải quên gõ một
dòng**. Bảng lệnh `/help` cũng ghi `/trangthai` như lệnh công khai, tức là
**cả mã lẫn tài liệu đều nhất quán… ở phía sai**. Một chỗ quên thì soát mắt còn
bắt được; hai chỗ cùng sai thì soát mắt xác nhận lẫn nhau là đúng.

## 2. Đo thật

| Đo | Kết quả |
|---|---|
| Cách chặn hiện tại | Mỗi lệnh tự viết `if (!isOwner)` rời rạc trong `route.ts` |
| Lệnh trả dữ liệu có chốt | `/nhatky` ✓ · `/phamvi` ✓ · `/trangthai` ✗ (vừa vá tay 14/08) |
| Nguồn của bảng `/help` | Chuỗi viết tay **riêng**, không liên quan gì tới các `if` ở trên |
| Hệ quả đang sống | Người thường gõ `/trangthai` bị bảo *"chưa có lệnh"* rồi ngay dưới **thấy đúng lệnh đó trong bảng** — mâu thuẫn do chính bản vá 14/08 tạo ra |
| Phép kiểm tự động cho tầng route | **KHÔNG CÓ.** Cả 399 ca `rls-smoke.mjs` đều ở tầng CSDL |
| Kho có vitest/jest không | **Không** — cổng thật là `typecheck` + `lint` + `rls-smoke.mjs` |
| Node 22.22 chạy thẳng TypeScript thuần? | **CÓ** — đã thử thật, không cần cờ, không cần bước dựng |

**Hai phát hiện đổi hẳn thiết kế:**

**(a) Quyền và tài liệu là HAI nguồn sự thật cho CÙNG một điều.** Đó là vi phạm
luật D1 nằm ngay giữa lớp bảo mật. Không cần thêm phép kiểm nào cũng thấy nó
sai — nhưng chính vì tách đôi mà lỗ thứ ba sống được.

**(b) Không cần thêm bộ chạy kiểm.** Node đã chạy được TypeScript thuần, nên
một script Node như `rls-smoke.mjs` là đủ. Điều này gỡ bỏ lý do "phải cài
vitest trước" — vốn là cái cớ dễ nhất để hoãn.

## 3. Phương án bị LOẠI

### (A) Đi soát tay từng lệnh mỗi lần thêm lệnh mới — LOẠI
Đây chính là cách đang làm, và nó vừa hỏng. Trông cậy vào trí nhớ ở lớp bảo
mật là kế hoạch chỉ đúng cho tới lần quên đầu tiên.

### (B) Thêm vitest/jest rồi viết kiểm route đầy đủ — LOẠI
Thêm một bộ chạy kiểm, một tệp cấu hình, một khái niệm mới cho cả kho — để
canh **bảy dòng quyết định**. Và phát hiện (b) cho thấy không cần. Trả giá lớn
cho thứ mua được rẻ.

### (C) Dựng máy chủ thật rồi gọi HTTP để kiểm — LOẠI
Kiểm được nhiều hơn (cả middleware), nhưng cần máy chủ chạy + khoá thật +
Telegram thật. Chậm, giòn, và **không chạy được trong cổng kiểm tự động**.
Giữ cho lần sau nếu cần, không phải bây giờ.

### (D) Viết phép kiểm dò chữ trong mã nguồn (grep `if (!isOwner)`) — LOẠI
Cùng chính đêm nay tôi đã bị một phép dò chữ thô báo nhầm ba cửa Live Chat là
"không có chốt" (thật ra chúng chốt bằng mã phiên đã băm). Dò chữ cho **cảm
giác** đã canh, mà cảm giác sai còn tệ hơn biết là chưa canh.

## 4. QUYẾT ĐỊNH

**Một bảng quyền duy nhất, đặt trong một tệp THUẦN (không nhập gì của Next),
làm nguồn cho CẢ hai việc: chặn lệnh và dựng bảng `/help`.**

```
lib/telegram/quyen-lenh.ts     ← thuần, không nhập Next/Supabase
  BANG_LENH  : mỗi lệnh khai { chiChuDuAn, moTa }
  duocGoi(lenh, laChuDuAn)     : true/false
  bangTroGiup(laChuDuAn)       : chuỗi /help, tự lọc theo vai
```

Ba tính chất, mỗi cái bịt một đường lỗi đã xảy ra thật:

1. **Một nguồn sự thật** — `/help` dựng TỪ bảng, nên tài liệu không thể nói
   khác luật. Bịt đúng cách lỗ thứ ba sống sót.
2. **Mặc định là TỪ CHỐI** — lệnh không có trong bảng thì `duocGoi` trả `false`.
   Thêm lệnh mà quên khai quyền thì nó **không chạy**, thay vì chạy mở toang.
   Hỏng về phía đóng.
3. **Trình biên dịch canh, không phải người** — kiểu của tên lệnh suy ra TỪ
   khoá của bảng. Thêm nhánh xử lý cho một lệnh chưa khai trong bảng là
   **typecheck đỏ**, mà typecheck vốn đã là cổng bắt buộc. Không tốn thêm gì.

Tính chất 3 là thứ đáng giá nhất: nó biến "nhớ đặt chốt" thành "không thể quên".

**Người thường KHÔNG được thấy lệnh chỉ dành cho chủ dự án trong `/help`.** Bản
hiện tại vừa giấu (chặn thì trả lời *"chưa có lệnh"*) vừa khoe (`/help` liệt kê
kèm ghi chú *"chỉ chủ dự án"*) — chọn một. Chọn **giấu**, đúng ý định đã ghi
trong chú thích của `/nhatky`.

## 5. Phép kiểm — script Node thuần, không thêm bộ chạy nào

`scripts/quyen-lenh-smoke.mjs`, cùng khuôn `rls-smoke.mjs` (đếm PASS/FAIL, mã
thoát khác 0 khi hỏng):

| Ca | Ngưỡng đạt |
|---|---|
| 1. Mỗi lệnh trả dữ liệu (`/trangthai`, `/nhatky`, `/phamvi`) với người thường | `duocGoi` = **false** |
| 2. Đối chứng: cùng các lệnh đó với chủ dự án | `duocGoi` = **true** |
| 3. Lệnh công khai (`/help`, `/lienket`, `/chude`, `/moi`) với người thường | `duocGoi` = **true** |
| 4. Lệnh không có trong bảng | `duocGoi` = **false** (mặc định từ chối) |
| 5. `bangTroGiup(false)` | **KHÔNG** chứa tên bất kỳ lệnh nào `chiChuDuAn` |
| 6. `bangTroGiup(true)` | Chứa **đủ** mọi lệnh trong bảng |
| 7. Mọi lệnh route xử lý đều có trong bảng | Không lệnh nào đứng ngoài |

Luật D3 vẫn áp: mỗi ca phải **thấy ĐỎ ít nhất một lần** trước khi tin là xanh.
Ca 5 là ca duy nhất bắt được đúng lỗi mâu thuẫn đang sống.

## 6. Hệ quả

- **Thêm:** 1 tệp thuần `lib/telegram/quyen-lenh.ts`; 1 script kiểm; 1 dòng
  trong `package.json` (nếu muốn gộp vào cổng kiểm).
- **Sửa:** `app/api/telegram/webhook/route.ts` — bỏ các `if (!isOwner)` rời
  rạc, gọi `duocGoi` một chỗ; `HELP_TEXT` chuyển thành `bangTroGiup(isOwner)`.
- **Không đụng:** logic từng lệnh, cầu nối, CSDL, bất kỳ migration nào.
- **Founder không phải làm gì.**

**Nợ ghi sổ, KHÔNG được im lặng bỏ:** ADR này chỉ phủ **bot Telegram**. Cầu nối
`telegram-bridge.mjs` và webhook Zalo vẫn tự quyết quyền theo cách riêng. Khi
nào một trong hai thêm lệnh trả dữ liệu ⇒ kéo về cùng bảng này, đừng chép cách
cũ. (Bot Zalo hiện chỉ có `/link` + tra cứu đã chốt ở CSDL nên chưa cần.)

## Điều kiện xem lại

- **Khi bot Telegram có lệnh GHI dữ liệu** (không chỉ đọc) ⇒ bảng hai giá trị
  `chiChuDuAn` là không đủ, phải tách "đọc gì" và "ghi gì". Hiện mọi lệnh đều
  chỉ-đọc trừ `/phamvi` và `/lienket`, nên chưa cần.
- **Khi có vai thứ ba ngoài "chủ dự án / người thường"** trên bot (ví dụ mời
  cộng tác viên vào nhóm với quyền hẹp) ⇒ `duocGoi` đổi từ boolean sang vai.
- **Khi cần kiểm cả tầng HTTP** (middleware, header bảo vệ, hạn mức) ⇒ mục 3(C),
  lúc đó mới dựng máy chủ thật, không dựng trước.
