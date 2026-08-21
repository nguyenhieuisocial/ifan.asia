import { Skeleton } from "@/components/ui/skeleton";

/**
 * Khung chờ của MÀN CHI TIẾT một công ty.
 *
 * ⚠️ Trước bản này thư mục `[id]` không có `loading.tsx`, nên Next.js lấy khung
 * chờ của thư mục cha — tức khung chờ của màn khác. Hình dạng lệch hẳn nên lúc dữ liệu về
 * khung nhảy một cái. Khung chờ phải nói trước
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
        <Skeleton className="h-36 rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
