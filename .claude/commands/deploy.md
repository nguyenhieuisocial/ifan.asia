# /deploy — KHÔNG DÙNG cho iFan

⛔ **Dừng lại. iFan có ĐÚNG MỘT đường ra bản: `git push`.**

```
git push origin main      # Vercel tự dựng, tự đưa lên production
```

**Vì sao lệnh chung nguy hiểm ở đây:** bản chung (`~/.claude/commands/deploy.md`)
tự dò stack, thấy Next.js là gợi ý `vercel deploy`. Chạy nó là mở **đường ra bản
thứ hai** → phạm bất biến 3, và tạo bản production **không khớp `main`**: sổ sự
thật ghi một đằng, web chạy một nẻo, **không có gì báo lỗi**.

**Trước khi push:** `npm run typecheck` + `npm run lint` (thêm `npm run build`
nếu đụng route/i18n). Luật đầy đủ: `AGENTS.md` mục "🚀 RA BẢN".
