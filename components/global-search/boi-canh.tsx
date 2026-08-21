"use client";

import { createContext, useContext, useMemo } from "react";
import type { TenantPack } from "@/lib/tenant-pack";

/**
 * VAI + TỪ VỰNG NGÀNH cho bảng lệnh (Ctrl K).
 *
 * Bảng lệnh mở được từ hai chỗ — nút kính lúp ở thanh trên và ô tìm trong màn
 * "Hôm nay" — và cả hai đều cần biết người đang đăng nhập là vai gì, để không
 * gợi ý một cánh cửa khoá. Khung `/app/layout.tsx` đã có sẵn cả hai giá trị;
 * truyền xuống bằng bối cảnh thay vì chuyền tay qua từng lớp màn ở giữa (màn
 * "Hôm nay" không liên quan gì tới vai, không có lý do bắt nó cầm hộ).
 *
 * Mặc định `viewer` — vai HẸP NHẤT. Ai đó quên bọc khung thì bảng lệnh hiện
 * thiếu mục, chứ không hiện thừa mục người ta không được vào. Riêng công tắc
 * mặc định BẬT, cùng luật với `co_bat()`: không có công tắc thì tính năng vẫn
 * chạy — trục trặc không được phép làm cả tính năng biến mất.
 */
interface BoiCanh {
  role: string;
  pack?: TenantPack;
  /**
   * Công tắc `bang-lenh` (#331) — chủ SaaS gạt tắt được mà không cần ra bản mới.
   *
   * ⚠️ Đặt Ở ĐÂY chứ không kiểm ở từng lối vào. Bảng lệnh có HAI lối vào (nút
   *   trên thanh và ô tìm trong màn "Hôm nay") cộng thêm phím Ctrl K. Kiểm ở
   *   ba chỗ là sớm muộn cũng sót một chỗ, và cái sót đó chính là chỗ vẫn mở
   *   khi người ta tưởng đã tắt.
   */
  bat: boolean;
}

const Ctx = createContext<BoiCanh>({ role: "viewer", bat: true });

export function BoiCanhBangLenh({
  role,
  pack,
  bat,
  children,
}: {
  role: string;
  pack?: TenantPack;
  bat: boolean;
  children: React.ReactNode;
}) {
  const v = useMemo(() => ({ role, pack, bat }), [role, pack, bat]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useBoiCanhBangLenh(): BoiCanh {
  return useContext(Ctx);
}
