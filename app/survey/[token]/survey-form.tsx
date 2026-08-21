"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

const COMMENT_MAX = 1000;

async function submitSurveyAction(
  token: string,
  rating: number,
  comment: string,
): Promise<string> {
  try {
    const res = await fetch(`/api/survey/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    const body = await res.json().catch(() => null);
    // Đã gửi rồi / link hỏng → nói đúng lý do, đừng gộp thành "lỗi".
    if (res.status === 409 && body?.error === "not_found_or_done") return "done";
    if (res.status === 429) return "busy";
    if (!res.ok) return "error";
    return body?.result ?? "error";
  } catch {
    return "offline";
  }
}

export function SurveyForm({
  token,
  shopName,
  itemName,
  alreadySubmitted,
  existingRating,
  mauNen,
}: {
  token: string;
  shopName: string;
  itemName: string;
  alreadySubmitted: boolean;
  /** Màu thương hiệu tiệm (#335) — cùng màu với trang mặt tiền của họ. */
  mauNen: string;
  existingRating: number | null;
}) {
  const [rating, setRating] = useState(existingRating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(alreadySubmitted);
  const [loi, setLoi] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!rating) return;
    setLoi("");
    startTransition(async () => {
      const result = await submitSurveyAction(token, rating, comment);
      // Bản đầu chỉ xử lý nhánh "ok" — gửi hỏng thì nút bật lại và KHÔNG có gì
      // hiện ra, khách bấm mãi không hiểu vì sao. Mọi nhánh phải nói được thành lời.
      if (result === "ok" || result === "done") {
        setDone(true);
        return;
      }
      setLoi(
        result === "busy"
          ? "Bạn gửi hơi nhanh, vui lòng thử lại sau ít phút."
          : result === "offline"
            ? "Không có mạng. Kiểm tra kết nối rồi gửi lại giúp mình nhé."
            : "Chưa gửi được. Vui lòng thử lại sau ít phút.",
      );
    });
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mb-3 text-4xl">🙏</div>
          <h1 className="text-lg font-semibold">Cảm ơn bạn!</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Đánh giá của bạn đã được ghi nhận và giúp chúng tôi cải thiện dịch
            vụ.
          </p>
        </div>
      </div>
    );
  }

  const display = hovered || rating;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-center text-lg font-semibold">
          {shopName || "Đánh giá dịch vụ"}
        </h1>
        {itemName && (
          <p className="mt-1 text-center text-[13px] text-muted-foreground">
            {itemName}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(s)}
              className="p-1 transition-transform hover:scale-110 focus:outline-none"
              aria-label={`${s} sao`}
            >
              <Star
                className={`size-9 transition-colors ${
                  s <= display
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
        </div>

        {rating > 0 && (
          <p className="mt-2 text-center text-[13px] font-medium text-muted-foreground">
            {["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Rất tốt"][rating]}
          </p>
        )}

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Bình luận thêm (tuỳ chọn)..."
          rows={3}
          maxLength={COMMENT_MAX}
          className="mt-4 w-full rounded-lg border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        />

        <button
          type="button"
          disabled={!rating || isPending}
          onClick={submit}
          className="mt-4 w-full rounded-lg py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: mauNen }}
        >
          {isPending ? "Đang gửi..." : "Gửi đánh giá"}
        </button>

        {loi && (
          <p className="mt-2 text-center text-[12px] text-destructive">{loi}</p>
        )}
      </div>
    </div>
  );
}
