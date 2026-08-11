<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ifan.asia** (2666 symbols, 7193 relationships, 206 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ifan.asia/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ifan.asia/clusters` | All functional areas |
| `gitnexus://repo/ifan.asia/processes` | All execution flows |
| `gitnexus://repo/ifan.asia/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- ifan:handoff -->
# iFan — ĐỌC TRƯỚC KHI LÀM BẤT CỨ GÌ (bàn giao giữa các phiên/model)

**Phân vai (chỉ đạo founder 11/08):** Fable 5 = CHỈ nghĩ & hoạch định (không code, không migration) · Sonnet 5 = code & debug · Opus 5 = review. Bạn là model nào thì làm đúng vai đó.

**Thứ tự đọc bắt buộc (5 phút):**
1. `docs/SO-DO-HE-THONG.md` — bản vẽ nhà + 10 BẤT BIẾN (vi phạm là bug; mỗi bất biến có vết sẹo thật).
2. `docs/SU-THAT-SAN-PHAM.md` — tính năng nào đang chạy thật (nguồn sự thật duy nhất).
3. `docs/adr/0001–0004` — vì sao quyết thế + luật chọn workflow/trợ-lý/effort.
4. Vault (`C:\iFan.asia`): mở `00 Trang chủ.md` TRƯỚC — nó là bản đồ "tin file nào" + LUẬT ĐỌC (thứ tự thắng-thua khi mâu thuẫn, file nào cấm nuốt thẳng). Kế hoạch & hồ sơ việc: `04 Kế hoạch\Quy hoạch tính năng hợp nhất (10-08).md` — Phần III (mục 11–15): tầng NGÀNH 6 pack, 8 trục, trình tự V1→V5.

**QUAN TRỌNG — trước khi dựng bất kỳ bảng/migration mới:** đọc HỢP ĐỒNG DỮ LIỆU trong Quy hoạch — mục 23–24 (catalog/variants, lịch hẹn+cọc, đơn hàng+hoàn, kho stock_moves, voucher, gói buổi, hoa hồng, thu chi, sub_profiles, lead_submissions) **VÀ mục 31.0 = hợp đồng hạ tầng dùng chung 24k–24u** (tệp đính kèm, tìm kiếm toàn cục, in phiếu/PDF, mã vạch, trường tùy biến, bộ lọc lưu sẵn, nhật ký bản ghi, cấp số chứng từ, mẫu tin, khung giờ gửi, realtime chống ghi đè). Thực thể nào có hợp đồng thì dựng ĐÚNG hợp đồng, cấm tự chế bản riêng. Mục nào ghi "(sửa 24x)" thì dựng theo bản ĐÃ SỬA, không dựng bản cũ rồi vá. Khuôn bắt buộc: mục 26 (module × ngành), 27 (ma trận quyền), **32 (ma trận liên kết & đồng bộ — module mới phải khai sự kiện phát/nghe vào đây TRƯỚC khi code)**.

**BẢN CÓ HIỆU LỰC CAO NHẤT = MỤC 34** (biên bản phản biện cuối, Opus soát 11/08): **34.5** ma trận module×ngành (thay 26) · **34.6** ma trận quyền (thay 27) · **34.7** trình tự chính thức **V1a→V8** (thay 33/28/8) · **34.1** bảy mục bổ sung cuối 31.74–31.80 (P&L bản gọn · lượt-khách gộp thanh toán + đệm ca · bán trên sàn · thuế suất dòng hàng · khuyến mãi tự áp/combo/giá theo tay nghề · vận chuyển + nhãn · PIN đổi người máy chung). Luật đọc: mục viết sau thắng mục viết trước.

**Hợp đồng phải VẼ TRƯỚC migration của thực thể tương ứng** (34.1 + 34.3): 24b/24c sửa theo 31.75 (lượt khách + đệm ca) trước khi dựng `appointments` ở V2; 24c thêm kênh-bán/mã-đơn-ngoài/thuế-suất + 24h thêm chuyển-quỹ-2-vế/số-dư-đầu-kỳ trước khi dựng ở V3.

**BẮT ĐẦU NGAY TẠI ĐÂY — mục 35 = hồ sơ thi công V1a, chi tiết nhất, đọc trước tiên:** phạm vi đúng 9 việc (35.1), thứ tự bắt buộc 8 bước (35.2), tiêu chí nghiệm thu đo được (35.3), 10 cạm bẫy đã biết (35.4), điều kiện mở V1b (35.5). KHÔNG tự mở rộng phạm vi V1a — 4 việc bị cắt (bộ lọc lưu sẵn, nhãn khách, tìm kiếm toàn cục, impersonate…) đã có lý do dời sang V1b, ghi trong 35.1.

Hàng đợi sau V1a (chi tiết ở 34.7 — bảng V1a→V8): V1b Dữ liệu có nhà → V1.5 Cửa vào khách (vỏ cổng khách một lần) → V2 Lịch hẹn (17+31.75, chặn trùng EXCLOSE constraint ở DB + sửa hợp đồng lượt-khách-gộp TRƯỚC khi dựng bảng) → V3 Tiền thật → V4 Hàng hóa chuẩn → V5 Két sắt & P&L → V6 Giữ khách → V7 Đội ngũ sâu → V8 Nghiêm túc & mở. Mỗi mục: thẻ design vẽ trước → founder duyệt → code → cổng tổng → đo đúng con số hồ sơ đã khai → cập nhật sổ sự thật + nhật ký cùng đợt commit. Opus review theo bộ 11 câu cố định (mục 22).

**Nếp khi xong việc:** cổng tổng (typecheck+lint+build+CI) trên cây yên · cập nhật `docs/SU-THAT-SAN-PHAM.md` cùng commit · nối nhật ký vào `C:\iFan.asia\05 Nhật ký\<ngày>.md` (một ngày một file) · `npx gitnexus analyze` sau loạt commit lớn. Trả lời founder bằng tiếng Việt đời thường (đã làm gì → được gì → còn lại gì), không dump kỹ thuật.
<!-- /ifan:handoff -->
