# Hệ thống thiết kế iFan

Bản gốc của các thẻ hiển thị trên **claude.ai → Design → `iFan Design System`**.

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
trong giao diện Design. Bốn mục đang dùng: `Nền tảng`, `Thành phần`, `Màn hình`,
`Trạng thái`.

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

## Nguyên tắc: thẻ tả CODE THẬT, không tả cái mình muốn

Trước khi vẽ hay sửa một thẻ, mở đúng file trong `app/` hoặc `components/` ra đọc.
Thẻ nói bo góc 8px mà code là 6px thì thẻ sai, không phải code sai — hoặc sửa thẻ,
hoặc sửa code, nhưng phải chọn một.
