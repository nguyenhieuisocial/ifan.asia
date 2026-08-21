import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung chờ của MÀN CHI TIẾT một khách.
 *
 * ⚠️ Trước bản này thư mục `[id]` không có `loading.tsx`, nên Next.js lấy khung
 * chờ của thư mục cha — tức **khung xương DANH SÁCH khách**. Người dùng bấm vào một tên và thấy
 * danh sách nhấp nháy thêm một nhịp nữa. Khung chờ phải nói trước
 * *sắp thấy gì*, không phải *vừa rời khỏi đâu*.
 */
export default function Loading() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-7 w-52 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
