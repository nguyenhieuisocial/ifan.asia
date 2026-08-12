# Hệ thống thiết kế iFan

Bản gốc của các thẻ hiển thị trên **claude.ai → Design → `iFan Design System`**.

## ⚠️ Thẻ là BẢN PHÁC, không phải bản vẽ tỉ lệ 1:1

Đọc dòng này trước khi định "sửa cho đúng chuẩn" bất kỳ con số px nào trong thẻ.

- Thẻ vẽ điện thoại rộng **250–290px** để thay cho màn **375px** thật. Mọi kích thước
  bên trong **thu theo**, không phải số đo của app.
- Vì vậy: nút bấm vẽ 26–30px trong thẻ **chính là** cách thể hiện đúng của nút 32px
  thật. Luật *"vùng bấm tối thiểu 32px"* (Ngôn ngữ thiết kế, phần F) áp cho **app đã
  build**, đo bằng trình duyệt trên màn thật — **không** áp cho HTML của thẻ.
- **Cách tự kiểm trước khi sửa:** con số bạn định đổi có khác với **90+ thẻ đang có**
  không? Nếu cả kho làm giống nhau và chỉ bạn muốn khác — nhiều khả năng bạn đang
  áp nhầm luật, không phải cả kho sai.

*(Đã có người mắc: 12/08/2026, đọc luật 32px rồi đi sửa 4 thẻ đang đúng, phải hoàn
tác. Xem `AGENTS.md` mục "Sáu bẫy đã có người mắc", bẫy số 3.)*

**Thẻ dùng để làm gì:** chốt *cái gì lên màn, chữ viết ra sao, luật ứng xử nào* —
để founder duyệt trước khi code. Kích thước chính xác lấy từ **Ngôn ngữ thiết kế
phần A** (token) và từ code đang chạy, không lấy từ thẻ.

## Vì sao nằm trong git

Thẻ thiết kế là cấu hình **trên dịch vụ ngoài**, không nằm trong kho code. Mất là
mất vĩnh viễn, không lệnh nào dựng lại được. Đúng chuyện đã xảy ra ngày 05/08/2026
với hai thứ khác:

- một lưới an toàn trong cơ sở dữ liệu chỉ tồn tại ở đúng một máy chủ, không nằm
  trong migration nào — suýt biến mất khi chuyển vùng;
- mẫu thư đặt lại mật khẩu (`../supabase/email-templates/`) — cùng loại rủi ro.

Quy tắc rút ra: **thứ gì cấu hình ở dịch vụ ngoài mà quan trọng thì phải có bản
gốc trong git.**

## Cách sửa

1. Sửa file `.html` trong thư mục này (**không** sửa thẳng trên web — sửa trên web
   là bản git thành lạc hậu, lần đồng bộ sau sẽ ghi đè mất).
2. Đồng bộ lên claude.ai (Claude làm qua công cụ DesignSync).

## Khuôn của một thẻ

Mỗi file là HTML **tự chứa** — không tải phông, ảnh, script từ bên ngoài. Dòng đầu
tiên bắt buộc là `<!-- @dsCard group="..." -->`; `group` quyết định thẻ nằm mục nào
trong giao diện Design.

Bảy mục đang có: `Nền tảng`, `Thành phần`, `Màn hình`, `Trạng thái`, `Thương hiệu`,
`Mẫu màn hình`, `Landing big iFan` (5 thẻ `landing-*`). Hai mục `Mẫu màn hình` /
`Thương hiệu` chỉ có đúng một thẻ và trùng ý nhau — **nên gộp lại**, chưa làm vì
đổi `group` là đổi chỗ thẻ trên web, cần founder xem lại một lượt.

Khối `<style>` giống hệt nhau ở mọi thẻ (phông Be Vietnam Pro, ba lớp `.serif`
`.row` `.note`). Style riêng viết thẳng trên từng phần tử.

Kết thúc bằng đúng **một** `<p class="note">` nói thẻ này ứng với màn nào trong app.

## Bảng màu — không tự chế màu mới

```
#C94C18 cam đất (chính)   #E06B35 cam sáng      #A03A10 cam sẫm
#FAF5EF kem men           #1c1917 than (chữ)    #78716c xám ấm
#a8a29e xám nhạt          #d6d3d1 viền          #e7e5e4 viền nhạt
#16a34a xanh (xong)       #d97706 vàng (chờ)    #dc2626 đỏ (lỗi/nóng)
#0ea5e9 xanh dương (VIP)  #94a3b8 xám (ngủ đông)
```

Nền nhạt của màu trạng thái: `#f0fdf4` `#fef3c7` `#fef2f2` `#f0f9ff`.

Giá trị gốc trong code là oklch (`../app/globals.css`) — bảng trên là quy đổi hex
để duyệt bằng mắt.

**Bảng trên KHÔNG đầy đủ** (soát 12/08/2026). Kho đã dùng thêm ~11 mã màu ở 18–31
thẻ mỗi mã mà bảng chưa liệt kê — ví dụ `#f4f0ee` `#f0edeb` (nền khối), `#595451`
`#282523` (chữ đậm nhạt), `#1b552c` (chữ trên nền xanh), `#633f00` `#ffeaca` (chữ
và viền trên nền vàng), `#e7000b` (chữ đỏ), `#124a7b` (chữ trên nền xanh dương).

⚠️ **Cách tự kiểm màu — đừng tin bảng này, hãy đếm cả kho:**

```bash
# màu bạn định dùng đã có bao nhiêu thẻ dùng rồi?
grep -oih "#abc123" design-system/*.html | wc -l
```

Dùng ở **18+ thẻ** = màu canonical, cứ dùng. Chỉ ở **1–2 thẻ** = nhiều khả năng
bạn (hoặc người trước) tự chế — tìm mã gần giống đang phổ biến mà dùng. Đây là
cách duy nhất đúng, vì bảng viết tay ở trên luôn chạy sau thực tế.

## Bảy thẻ đầu tiên có TRƯỚC bảng màu này

`colors` `typography` `buttons` `badges` `bubbles` `tiles` `empty-state` được dựng
trước khi bảng màu trên được chốt, nên chúng **dùng màu ngoài bảng** (ví dụ
`badges.html` dùng `#dcfce7`, `#15803d`, `#f1f5f9`…) và `badges.html` còn thiếu
dòng ghi chú cuối.

Đưa vào git **nguyên xi**, cố ý không sửa: sửa cùng lúc với việc sao lưu thì không
còn biết bản gốc trông ra sao. Việc kéo chúng về đúng bảng màu — và đối chiếu lại
với token thật trong `app/globals.css`, vì app dùng `bg-status-closed` chứ không
dùng mấy mã màu kia — là một việc riêng, cần làm.

## Nguyên tắc: thẻ tả CODE THẬT, không tả cái mình muốn

Trước khi vẽ hay sửa một thẻ, mở đúng file trong `app/` hoặc `components/` ra đọc.
Thẻ nói bo góc 8px mà code là 6px thì thẻ sai, không phải code sai — hoặc sửa thẻ,
hoặc sửa code, nhưng phải chọn một.

## ⚠️ Hai thứ trong thẻ TỰ MỤC theo thời gian

Thẻ được vẽ TRƯỚC khi code. Nghĩa là ngay lúc code xong, một phần nội dung thẻ trở
thành sai — mà không ai được báo. Soát ngày 12/08/2026 tìm ra **12 chỗ** thuộc đúng
hai loại dưới đây:

**1. Nhãn "(chưa có code)"** — 10 thẻ vẫn dán nhãn này trong khi màn đã chạy thật
nhiều ngày (có thẻ đã chạy từ đợt trước nữa). Người đọc tưởng tính năng còn thiếu.

**2. Con số nghiệp vụ chép tay** — thẻ nhập Excel ghi "tối đa 5.000 dòng" trong khi
code chặn ở 2.000. Trớ trêu: chính thẻ đó dạy *"nói giới hạn TRƯỚC khi họ chọn tệp"*
— mà con số nó nói lại sai gấp 2,5 lần. Ai dựng theo thẻ sẽ hứa sai với người dùng.

**Luật rút ra — làm ngay trong CÙNG lượt code xong một màn:**

- Bỏ nhãn `(chưa có code)` ở `<title>` **và** ở `<p class="note">` cuối thẻ.
- Đối chiếu lại mọi CON SỐ trong thẻ với hằng số thật trong code.

**Cách tự soát cả kho:**

```bash
# thẻ nào còn dán nhãn chưa-có-code? đối chiếu tay xem màn đó đã chạy chưa
grep -l "chưa có code" design-system/*.html
```

Còn 7 thẻ dán nhãn này và **đều đúng** (tính năng thật sự chưa dựng): kho hàng,
thu chi, thanh toán tự động, đa ngôn ngữ, 4 kênh mạng xã hội, tự tạo quy trình, và
mục V2 trong `industry-settings.html`. Giữ nguyên tới khi dựng.
