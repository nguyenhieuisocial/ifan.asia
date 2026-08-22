# ADR-0018 — Ngày tạo & ngày sửa cho mọi file vault, do máy đóng dấu

**Trạng thái:** ĐÃ CHỐT 14/08/2026 (Opus) — hồ sơ thi công.
**⚠️ ĐÍNH CHÍNH 22/08/2026 — dòng trạng thái này ghi `**chưa code**` cho tới hôm nay, sai.** Đo lại 22/08: `scripts/vault-ngay.mjs` **có thật** (12.7 KB, đủ 3 chế độ mô tả ở mục 7: đóng dấu · `--kiem` · `--cai-moc`), và `docs/VAN-HANH.md` đã hướng dẫn cài móc. Giữ nguyên chữ cũ trong dòng này để lại dấu vết. Đây đúng bệnh **"thứ đúng lúc viết, sai lúc đọc"** mà README mục "Luật bắt buộc" mô tả — và lần này nó cắn chính hồ sơ của công cụ dựng ra để chống nó.
**Chỉ đạo founder:** *"Toàn bộ vault đều phải có ngày tạo và ngày chỉnh sửa gần nhất (auto)."*

---

## 1. Vấn đề

Vault có 60 file chữ. Mở một file ra, **không cách nào biết nó viết hồi nào và lần cuối ai đụng vào là bao giờ** — trừ 7 file có người tự gõ một dòng ngày vào thân bài.

Đây không phải chuyện tiện nghi. Cả phiên 14/08 bắt được 18 lỗi tài liệu, và **17/18 đều cùng một hình: thứ đúng lúc viết, sai lúc đọc.** Không có ngày thì người đọc không có tín hiệu nào để nghi ngờ — một file viết 31/07 (trước khi founder bác bảng giá, bác tệp khách 2–10 người, bác cổng V2) đọc y hệt một file viết hôm nay.

Chữ **(auto)** trong chỉ đạo là phần quan trọng nhất. Dòng ngày gõ tay **chính là** bệnh: 7 file đang có thì đã có file ghi *"Cập nhật lần cuối: 2026-08-11"* trong khi nội dung sửa 12/08.

## 2. Đo thật trước khi quyết (bẫy 4 — cấm viết kế hoạch mà không đo)

Hai nguồn ngày hiển nhiên, **cả hai đều nói dối**, theo hai chiều ngược nhau:

| Nguồn | Sai | Sai kiểu gì |
|---|---|---|
| **git** — file vào kho lúc nào | **36/57 file** | Vault mới vào git **11/08**; 21 file viết thật **31/07** ⇒ đóng dấu muộn 11 ngày |
| **ổ đĩa** — hệ điều hành ghi ngày tạo | **12/57 file** | Obsidian Sync / ghi đè **xoá mất ngày gốc**. `00 Trang chủ.md` khai "tạo 14/08" trong khi nó nằm trong commit **11/08** |

**Lấy ngày SỚM NHẤT trong hai nguồn** thì ra phân bố khớp lịch sử thật của dự án:

```
31/07: 21 file   ← đúng đợt nghiên cứu tự động 5 agent (31/07)
01/08:  7 file
10/08:  4 file
11/08: 19 file   ← đúng ngày lập vault + đưa vào git
12–14/08: 6 file
```

**Vì sao lấy MIN là đúng về mặt logic, không phải mẹo:** cả hai con số đều là bằng chứng *"file đã tồn tại chậm nhất là ngày này"*. Ngày sớm hơn là bằng chứng chặt hơn. Và MIN **không bao giờ khai file già hơn sự thật** — nó chỉ có thể khai trẻ hơn. Sai theo chiều khiêm tốn, không sai theo chiều bịa.

⚠️ **Giới hạn phải nói thẳng:** với 12 file bị ổ đĩa ghi đè, MIN dừng ở **11/08** — ngày vault vào git, **không phải ngày viết**. Không có nguồn nào phục hồi được ngày gốc. Ghi vào luật để người đọc biết "11/08" ở mấy file lâu đời nghĩa là *"có từ trước, không truy được"*.

## 3. Quyết định

### 3.1 Hai trường, đặt ở đầu file (frontmatter)

```yaml
---
ngày tạo: 2026-07-31
sửa lần cuối: 2026-08-14
---
```

Obsidian hiện khối này thành bảng **Properties** ngay đầu file, nhận dạng `YYYY-MM-DD` là kiểu Ngày nên **sắp xếp và lọc được** — mở được câu hỏi *"file nào 2 tuần chưa ai đụng?"* mà nay không trả lời nổi.

Đo được: **0/60 file đang có frontmatter** ⇒ không đụng gì sẵn có.

### 3.2 Ngày lấy từ đâu

| Trường | Cách tính |
|---|---|
| **ngày tạo** | Sớm nhất giữa *(a)* commit ĐẦU TIÊN chạm file và *(b)* ngày tạo ổ đĩa |
| **sửa lần cuối** | File **sạch** so với git ⇒ ngày commit CUỐI chạm nó. File **đang có sửa đổi chưa commit** ⇒ **hôm nay** |

**Vì sao không dùng thẳng ngày-sửa của ổ đĩa:** công cụ định dạng trên máy có chạm file kho code mà **không đổi một chữ nào** (đã ghi ở trang chủ vault mục 2). Ngày-sửa ổ đĩa sẽ nhảy vì mấy lần chạm đó ⇒ file "vừa sửa" mà nội dung y nguyên. Hỏi git thì **không có commit = không có thay đổi**, đúng bản chất.

### 3.3 Phạm vi

- **60 file .md của vault** — gồm cả `99 Lưu trữ/`. Founder nói "toàn bộ", và đóng dấu ngày không cần mở file ra đọc, nên không đụng luật tầng 4.
- ⚠️ **3 file trong `99 Lưu trữ/` nằm ngoài git** (`.gitignore` chặn). Chúng **chỉ có ổ đĩa** làm nguồn — ngày yếu hơn phần còn lại. Chấp nhận, ghi rõ trong luật.
- ⛔ **LOẠI `.claude/`** — đó là **cấu hình máy, không phải kiến thức vault**. Và loại vì lý do cứng: mấy file luật hookify **đã dùng frontmatter để khai `name` / `enabled` / `event`**; chèn thêm khoá ngày vào đó là chèn vào vùng máy khác đang đọc.

### 3.4 ⚠️ Phần dễ hỏng nhất: MỘT chỗ ghi ngày, không phải hai (luật D1)

Đo ra **7 file đã có dòng ngày trong thân bài**, và `scripts/vault-status.mjs` **đang tự sửa mấy dòng đó** (hàm `dongDauNgay`). Thêm frontmatter mà để nguyên là **dựng ra hai cái máy cùng ghi một sự thật vào hai chỗ** — đúng bệnh D1 mà cả tuần nay đi vá.

**Phải tách hai loại dòng ngày — chúng trông giống nhau nhưng nghĩa khác hẳn:**

| Loại | Ví dụ đo được | Xử lý |
|---|---|---|
| **Siêu dữ liệu file** — trùng nghĩa với frontmatter | `*Cập nhật: 2026-08-12*` · `*Sửa lần cuối: 14/08/2026*` | **Xoá khỏi thân bài.** Nghĩa chuyển lên frontmatter |
| **Nội dung thật** — nói chuyện khác | `*Chốt ngày 2026-07-31 theo chỉ đạo của founder*` · `*Ngày báo cáo: 01/08/2026*` · `*cập nhật tới 07/2026*` | **GIỮ NGUYÊN.** Đây là ngày *quyết định* / ngày *số liệu*, không phải ngày sửa file |

⛔ **Cấm vá máy móc theo chuỗi khớp.** Chính sáng nay, quét theo tiền đề mà không phân biệt ngữ cảnh suýt bôi bẩn 3 file nghiên cứu đối thủ hoàn toàn đúng. Bảy dòng này **sửa tay từng dòng, có mắt người đọc**, không để máy quét.

**Và `dongDauNgay()` trong `vault-status.mjs` phải GỠ** sau khi chuyển xong — để lại là để lại cái máy ghi thứ hai.

## 4. Phương án đã LOẠI

| Phương án | Vì sao loại |
|---|---|
| **Chỉ dùng git** | Sai 36/57 file. Vault vào git sau khi viết 11 ngày |
| **Chỉ dùng ổ đĩa** | Sai 12/57 file, và **sai âm thầm** — đồng bộ ghi đè là mất ngày gốc, không có gì báo |
| **Đọc ngày từ chính câu chữ trong file** | Nghe hợp lý, thực tế là bẫy: trong file nghiên cứu đối thủ có đầy ngày **của người khác** (ngày đối thủ ra mắt, ngày nguồn tin). Máy không phân biệt được ⇒ đóng dấu ngày của Odoo lên file iFan |
| **Plugin Obsidian (Templater / Linter)** | **Chỉ chạy khi người sửa trong Obsidian.** Mà phần lớn file vault do trợ lý sửa qua công cụ dòng lệnh ⇒ đúng những lần sửa nhiều nhất lại **không** được đóng dấu. Chọn nó là chọn một cái máy có lỗ đúng chỗ hay dùng nhất |
| **Nhắc người tự sửa ngày (luật hookify)** | **Đã thử và đã tắt 12/08** — lý do đầy đủ trong `.claude/hookify.require-vault-date-update.local.md`. Nhắc 2 lần mỗi thao tác (lỗi trong mã plugin), và 53/56 lần là nhiễu. **Nguyên tắc đã chốt: không nhắc người nhớ, làm cho không thể quên** |

## 5. Giữ cho nó THẬT SỰ tự động

Một lệnh chạy tay thì **không phải "auto"** — nó chỉ là dòng ngày gõ tay có thêm một bước.

1. **Móc `pre-commit` trong kho vault** — mỗi lần commit, tự đóng dấu lại các file `.md` đang được commit rồi thêm vào chính commit đó. Vault có **116 commit trong 3 ngày** ⇒ nhịp này đủ dày.
2. ⚠️ **Móc git KHÔNG nằm trong git** (`.git/hooks/` không được commit). Máy mới / kho mới clone là **mất sạch, không có gì báo**. Nên phải có lệnh `--cài-móc` để dựng lại, **và khai vào `docs/VAN-HANH.md`** — đúng chỗ dành cho "cài đặt chỉ bật được bằng tay, quên là hệ thống vẫn chạy nhưng SAI hành vi".
3. **Lỗ còn lại, nói thẳng:** sửa trong Obsidian mà chưa commit thì frontmatter chưa đổi. Lần commit kế tiếp đóng dấu bù. Không bịt kín được nếu không dựng một tiến trình canh file thường trực — **không đáng** cho vault một người dùng.

## 6. Nghiệm thu (luật D3 — phải thấy ĐỎ trước)

Cổng kiểm `--kiểm`: so từng file giữa dấu đang có và giá trị tính lại; lệch là **ĐỎ**.

**Bắt buộc chứng minh nó biết đỏ** — sửa tay một ngày trong một file rồi chạy, phải thấy đỏ đúng file đó; dán nguyên văn dòng đỏ vào báo cáo. Cổng chưa từng đỏ **không phân biệt được với cổng không kiểm gì**.

Bốn ca phải kiểm:

1. File bình thường trong git — hai ngày đúng như tính tay.
2. **File có sửa đổi chưa commit** ⇒ `sửa lần cuối` = hôm nay.
3. **File ngoài git** (`99 Lưu trữ/`) ⇒ không chết, lấy ngày ổ đĩa.
4. **File tên có dấu tiếng Việt** ⇒ ⚠️ **git bọc nháy và mã hoá octal tên file có dấu.** Bẫy này **đã cắn 2 lần**: `vault-status.mjs` (phải thêm `-z`), và **cắn lại chính phiên đo hôm nay** — lệnh đối chiếu báo cả 57 file "ngoài git", một kết quả không thể đúng. **Kiểm bằng file có dấu, không kiểm bằng file ASCII rồi suy ra.**

## 7. Việc giao thi công (Sonnet)

| # | Việc |
|---|---|
| 1 | `scripts/vault-ngay.mjs` — 3 chế độ: đóng dấu · `--kiểm` · `--cài-móc` |
| 2 | Chạy lần đầu cho đủ **60 file** |
| 3 | **Sửa tay 7 dòng ngày cũ** theo bảng mục 3.4 — phân biệt siêu-dữ-liệu với nội dung, không quét máy |
| 4 | **Gỡ `dongDauNgay()`** khỏi `vault-status.mjs` (máy ghi thứ hai) |
| 5 | Cài móc `pre-commit` + khai vào `docs/VAN-HANH.md` |
| 6 | Nghiệm thu 4 ca mục 6, **thấy đỏ trước** |
| 7 | Ghi luật vào trang chủ vault mục 7 + nối nhật ký |

## 8. Điều kiện xem lại

- **Khi vault vượt ~300 file** ⇒ móc `pre-commit` gọi git nhiều lần mỗi file sẽ làm chậm rõ rệt mỗi lần commit; lúc đó đọc cả lịch sử một lần rồi tra bảng, đừng hỏi từng file.
- **Khi có người thứ hai sửa vault** (không phải founder) ⇒ mục 5 lỗ "sửa trong Obsidian chưa commit" rộng ra nhiều lần, phải tính lại có cần tiến trình canh file không.
- **Khi vault được đưa lên GitHub** (nay bị cấm vì chứa mật khẩu) ⇒ `--kiểm` chuyển thành cổng CI thật, thay vì chỉ chạy tay.
- **Khi Obsidian đổi cách đọc frontmatter** hoặc bỏ kiểu Ngày ⇒ mục 3.1 mất lý do chọn frontmatter, xem lại có nên quay về dòng chữ trong thân bài.
