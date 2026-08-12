-- ============================================================
-- iFan.asia — Migration #87: gói Miễn phí 30 lượt AI/tháng (ADR-0011 mục 4c.1)
--
-- Bảng giá cũ (migration #27) seed gói 'free' với ai_calls=20. ADR-0011 chốt
-- lại số thật cho gói Miễn phí vĩnh viễn là 30 lượt/tháng — con số này ĐÃ
-- công khai trên /bang-gia (bangGia.free.f4) nên phải khớp CSDL, không chờ
-- ngày mở bán như giá gói trả phí (mục 4c.6 — ba gói trả phí basic/pro/
-- business giữ nguyên, chưa đụng tới, chờ quyết định gộp về đúng 2 gói).
-- ============================================================

update public.plans
  set limits = limits || jsonb_build_object('ai_calls', 30)
  where code = 'free';
