import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung chờ của MÀN CHI TIẾT một đơn.
 *
 * ⚠️ Trước bản này thư mục `[id]` không có `loading.tsx`, nên Next.js lấy khung
 * chờ của thư mục cha — tức **khung xương DANH SÁCH đơn**. Người dùng bấm vào
 * một đơn và thấy tám dòng danh sách nhấp nháy, rồi mới nhảy sang một màn có
 * hình dạng hoàn toàn khác. Đó đúng là cái mà khung chờ sinh ra để tránh: nó
 * phải nói trước *sắp thấy gì*, không phải *vừa rời khỏi đâu*.
 *
 * Hình khối bám theo `order-detail-view`: một hàng đầu (nút quay lại + tên) ·
 * khối thông tin đơn · bảng dòng hàng · khối tổng tiền.
 */
export default function Loading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-7 w-48 max-w-full" />
        </div>
        <Skeleton className="h-24 rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-28 rounded-lg" />
      </div>
    </div>
  );
}
