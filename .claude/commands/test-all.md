# /test-all — bộ kiểm THẬT của iFan

Bản chung đi tìm vitest/jest/pytest — **iFan không có cái nào**, nên nó sẽ báo
"không có test" và người đọc tưởng dự án không được kiểm. Sai: iFan kiểm bằng
ba cổng khác, chạy theo đúng thứ tự này:

```bash
npm run typecheck && npm run lint && node scripts/rls-smoke.mjs
```

| Cổng | Bắt được gì |
|---|---|
| `typecheck` | sai kiểu, thiếu khoá i18n, route không tồn tại |
| `lint` | lỗi quy ước |
| `rls-smoke.mjs` | **quan trọng nhất** — cách ly dữ liệu giữa các tiệm + kiểm tra tĩnh. Chạy trên CSDL THẬT, cần `SUPABASE_DB_URL` |

Đụng route hoặc i18n thì chạy thêm `npm run build`.

⚠️ Luật D3: ca nghiệm thu mới **phải thấy ĐỎ ít nhất một lần** trước khi làm cho
xanh. Ca chưa bao giờ đỏ là ca chưa chứng minh được nó kiểm thật.
