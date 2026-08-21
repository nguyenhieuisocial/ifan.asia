-- ════════════════════════════════════════════════════════════════════
-- #332 — VÁ CHỐT "PHẠM VI MỘT PHẦN PHẢI CÓ DANH SÁCH" (#331 viết hụt)
-- ════════════════════════════════════════════════════════════════════
-- Chốt ở #331 viết là:
--
--     array_length(tiem_ids, 1) >= 1
--
-- Với mảng RỖNG, `array_length` trả về **NULL** chứ không phải 0. Mà
-- `NULL >= 1` ra NULL, và ràng buộc CHECK coi NULL là **ĐẠT**. Nên chốt trông
-- như đang canh mà thật ra mở toang: chèn được một công tắc "mở cho vài tiệm"
-- với danh sách tiệm rỗng.
--
-- ⚠️ HẬU QUẢ KHÔNG PHẢI LÀ LỖI, MÀ LÀ MỘT TRẠNG THÁI NÓI DỐI: màn quản trị
--   hiện "đang mở một phần" (công tắc màu vàng) trong khi thực tế KHÔNG AI
--   thấy tính năng. Người đọc màn tin là đã mở, người dùng thì không thấy gì,
--   và không có lời báo lỗi nào ở giữa để lần ra.
--
-- ⚠️ BÀI HỌC GIỮ LẠI: `array_length` KHÔNG trả 0 cho mảng rỗng. Mọi phép so
--   sánh độ dài mảng trong kho này phải bọc `coalesce(..., 0)`. Chốt cũ đã qua
--   được lượt soát của chính người viết vì đọc lên nghe rất đúng — chỉ có bộ
--   kiểm chạy thật mới bắt được (`cong-tac-smoke.mjs` ca 13–14).

alter table public.feature_flags
  drop constraint if exists feature_flags_pham_vi_phai_co_danh_sach;

alter table public.feature_flags
  add constraint feature_flags_pham_vi_phai_co_danh_sach check (
    (pham_vi <> 'vai_tiem' or coalesce(array_length(tiem_ids, 1), 0) >= 1) and
    (pham_vi <> 'theo_vai' or coalesce(array_length(vai, 1), 0) >= 1)
  );
