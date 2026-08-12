<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ifan.asia** (2777 symbols, 7351 relationships, 212 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

**Phân vai (chỉ đạo founder — bản mới nhất 12/08, THAY bản 11/08):** **Opus 5 = kiến trúc + hoạch định + THIẾT KẾ** (viết hồ sơ thi công, ADR, hợp đồng dữ liệu, vẽ thẻ design, review) · **Sonnet 5 = CHỈ code & sửa lỗi** · Fable 5 = nghĩ/lập kế hoạch khi được gọi. Bạn là model nào thì làm đúng vai đó.
> Vẽ thẻ design là việc của **Opus**, không phải Sonnet — founder đã sửa lại điểm này 12/08 sau khi Opus định bàn giao nhầm. Trong "vẽ thẻ" có 2 phần: quyết định cái gì lên màn (thiết kế) + gõ HTML (sản xuất) — **cả hai đều thuộc Opus**, đừng tách ra để đẩy phần sau đi.

## ⚠️ SÁU BẪY ĐÃ CÓ NGƯỜI MẮC — đọc trước, đừng mắc lại

Viết ngày 12/08 sau một phiên Opus mắc **cả sáu**. Mỗi dòng là chuyện đã xảy ra thật, không phải lo xa.

1. **Trích luật mà chưa mở luật ra đọc.** Sau khi phiên bị restart/nén, bạn còn nhớ *mang máng* rồi viết tiếp như thể vẫn nắm chắc — nguy hiểm hơn quên hẳn. **Dấu hiệu:** bạn vừa gõ "theo 13 bất biến" / "luật D1" / "3 tầng luật thiết kế" mà chưa `Read` file đó **trong phiên này**. Mở ra đọc, đừng tin trí nhớ.
   > **VIỆC ĐẦU TIÊN SAU RESTART không phải là làm tiếp — mà là đọc lại file master:** `C:\iFan.asia\04 Kế hoạch\Quy hoạch tính năng hợp nhất (10-08).md` (~1.500 dòng, 36 mục — **đây là "file master" founder hay nhắc**, không có file nào tên master). Tối thiểu phải đọc: **mục 2** (12 luật luồng + 14 luật giao diện G1–G14 + 3 luật D1–D3) · **mục 14** (phân vai, đọc khung đính chính đầu mục) · **mục 22** (bộ soát 11 câu — hồ sơ của bạn phải qua được) · **mục 23–24** (định nghĩa "ĐẦY ĐỦ" + hợp đồng dữ liệu lõi) · mục của đợt đang làm.
   > *Đã có người bỏ bước này rồi trong MỘT ngày mắc lại bẫy 1 tới **ba lần**: vẽ 7 thẻ design mà chưa đọc mục 2; viết hợp đồng dữ liệu mà chưa đọc mục 23–24 (thiếu 2/5 điều bắt buộc, câu soát 11 sẽ trả hồ sơ); và suýt đẩy việc sai vai vì mục 14 chưa được đính chính.*
2. **Lấy chi tiết từ tài liệu đã tự khai là bị thay.** Nhiều file mở đầu bằng ⚠️/ℹ️ nói rõ *"phần X đã bị thay bởi Y"* hoặc *"chi tiết lấy theo Z"*. **Đọc dòng đầu tiên trước khi đọc phần thân.** Đã có người đọc `Ngôn ngữ thiết kế iFan.md` (file tự ghi "chi tiết lấy theo thẻ"), thấy luật "cấm vùng bấm <32px", rồi đi "sửa" 4 thẻ design đang đúng.
3. **Áp luật của APP THẬT vào BẢN PHÁC.** Thẻ trong `design-system/` là **phác hoạ**, không phải bản vẽ tỉ lệ 1:1 — điện thoại vẽ 250–290px thay cho 375px thật. Con số px trong thẻ **không phải** con số px của app. Muốn biết thẻ vẽ đúng khuôn chưa: chạy máy kiểm, và **so với 90+ thẻ đang có** — lệch khỏi số đông là dấu hiệu bạn sai, không phải cả kho sai.
4. **Viết kế hoạch từ tài liệu mà không ĐO.** Sai theo **cả hai chiều**: (a) dựng lại thứ đã chạy — bảng nhãn khách bị ghi "chưa làm" trong khi có 43 nhãn + 172 lượt gắn thật; (b) dựng trước thứ chưa dùng được — `module_data_check` suýt được xây trong khi 0 module nào có màn để tắt. **Luật: mỗi dòng "trạng thái" trong hồ sơ phải có bằng chứng SQL hoặc grep kèm theo.**
5. **Quên khai sự kiện — và khai một nơi là chưa đủ.** Bất biến 12 bắt khai vào **Quy hoạch mục 32**; luật D1 bắt khai tên sự kiện vào **`docs/EVENT_CATALOG.md`**. Thiếu bất kỳ nơi nào = *"trả hồ sơ, không nhận code"*. Mảnh **cố ý không phát sự kiện cũng phải khai kèm lý do**, im lặng bị tính là sót.
6. **Đẩy việc sang vai khác vì nó "trông giống việc của họ".** Vẽ thẻ design gồm 2 phần: quyết định cái gì lên màn (**thiết kế**) + gõ HTML (**sản xuất**) — **cả hai đều là Opus**. Đừng tách ra để đẩy phần sau cho Sonnet.

> **Một câu để nhớ cả sáu:** *đọc dòng ⚠️ đầu file · đo trước khi viết · khai đủ hai nơi · và khi thấy mình sắp "sửa" thứ mà 90 file khác đang làm giống nhau — dừng lại, chính bạn mới là bên sai.*

## ℹ️ Hiện tượng môi trường đã biết — đừng mất công điều tra lại

**Lỗi "hydration" giả ở `next dev` (Turbopack), KHÔNG xảy ra ở bản chạy thật.** Nhận diện: console
trình duyệt báo *"Hydration failed…"* / *"A tree hydrated but some attributes… didn't match"*, phần
lệch là `id="radix-_R_..."` hoặc `aria-controls` tự sinh của Radix (menu, dialog, dropdown — bất cứ
đâu dùng `DropdownMenuTrigger`/`Dialog`/`Popover`…). Xảy ra ngẫu nhiên, không liên quan tới code vừa
sửa — đã xác nhận bằng `git stash` (lỗi vẫn còn trên code gốc, kể cả trang không có tham số URL nào).

**Nguyên nhân (đã tra, không phải đoán):** lỗi có sẵn ở thượng nguồn, chưa có bản vá —
[radix-ui/primitives#3700](https://github.com/radix-ui/primitives/issues/3700). React 19.2 đổi cách
sinh tiền tố mặc định của `useId()`; Next.js App Router chạy trên nhánh React canary mới nhất, và khi
kết hợp với chế độ dev của Turbopack thì đôi khi bản HTML server dựng và bản trình duyệt tự tính `useId()`
ra khác nhau ngay lần đầu tải. Bản dự án đang dùng đúng tổ hợp gây lỗi: React 19.2.4 + Next.js 16.3.0 +
`radix-ui` 1.6.7. Cách khắc phục DUY NHẤT hiện có trên GitHub issue là hạ Next.js xuống bản 15.4.7 —
**không áp dụng được cho dự án này** (bản đó có 3 lỗ thư viện mức CAO mà việc #35 đã nâng cấp để vá).

**Việc cần làm khi gặp:** bỏ qua, không debug tiếp bằng cách đọc log/console của lỗi này. Muốn kiểm
tra tính năng có chạy đúng không thì build bản thật (`npm run build && npm run start`) rồi thử —
bản build thật đã kiểm nhiều lần, sạch, không dính lỗi này (task #77, 12/08). Theo dõi issue trên để
biết khi nào thượng nguồn vá.

**Thứ tự đọc bắt buộc (5 phút):**
1. `docs/SO-DO-HE-THONG.md` — bản vẽ nhà + **13 BẤT BIẾN** (vi phạm là bug; mỗi bất biến có vết sẹo thật). Chú ý **bất biến 12**: module mới phải khai sự kiện phát/nghe vào Quy hoạch mục 32 **TRƯỚC khi code** — thiếu hàng là trả hồ sơ.
2. `docs/SU-THAT-SAN-PHAM.md` — tính năng nào đang chạy thật (nguồn sự thật duy nhất).
3. `docs/adr/0001–0008` — vì sao quyết thế. **Luôn mở ADR MỚI NHẤT trước** (nó là quyết định của đợt đang mở và thường ĐÍNH CHÍNH kế hoạch cũ). **0005** = một tài khoản nhiều tiệm · **0006** = phiên hỗ trợ chỉ-đọc (đọc trước khi đụng quyền/RLS) · **0007** = chuông báo founder qua Zalo · **0008** = cổng khách công khai = **hồ sơ thi công đợt ĐANG MỞ**.
4. Vault (`C:\iFan.asia`): mở `00 Trang chủ.md` TRƯỚC — nó là bản đồ "tin file nào" + LUẬT ĐỌC (thứ tự thắng-thua khi mâu thuẫn, file nào cấm nuốt thẳng). Kế hoạch & hồ sơ việc: `04 Kế hoạch\Quy hoạch tính năng hợp nhất (10-08).md` — Phần III (mục 11–15): tầng NGÀNH 6 pack, 8 trục, trình tự V1→V5.

**QUAN TRỌNG — trước khi dựng bất kỳ bảng/migration mới:** đọc HỢP ĐỒNG DỮ LIỆU trong Quy hoạch — mục 23–24 (catalog/variants, lịch hẹn+cọc, đơn hàng+hoàn, kho stock_moves, voucher, gói buổi, hoa hồng, thu chi, sub_profiles, lead_submissions) **VÀ mục 31.0 = hợp đồng hạ tầng dùng chung 24k–24u** (tệp đính kèm, tìm kiếm toàn cục, in phiếu/PDF, mã vạch, trường tùy biến, bộ lọc lưu sẵn, nhật ký bản ghi, cấp số chứng từ, mẫu tin, khung giờ gửi, realtime chống ghi đè). Thực thể nào có hợp đồng thì dựng ĐÚNG hợp đồng, cấm tự chế bản riêng. Mục nào ghi "(sửa 24x)" thì dựng theo bản ĐÃ SỬA, không dựng bản cũ rồi vá. Khuôn bắt buộc: mục 26 (module × ngành), 27 (ma trận quyền), **32 (ma trận liên kết & đồng bộ — module mới phải khai sự kiện phát/nghe vào đây TRƯỚC khi code)**.

**BẢN CÓ HIỆU LỰC CAO NHẤT = MỤC 34** (biên bản phản biện cuối, Opus soát 11/08): **34.5** ma trận module×ngành (thay 26) · **34.6** ma trận quyền (thay 27) · **34.7** trình tự chính thức **V1a→V8** (thay 33/28/8) · **34.1** bảy mục bổ sung cuối 31.74–31.80 (P&L bản gọn · lượt-khách gộp thanh toán + đệm ca · bán trên sàn · thuế suất dòng hàng · khuyến mãi tự áp/combo/giá theo tay nghề · vận chuyển + nhãn · PIN đổi người máy chung). Luật đọc: mục viết sau thắng mục viết trước.

**Hợp đồng phải VẼ TRƯỚC migration của thực thể tương ứng** (34.1 + 34.3): 24b/24c sửa theo 31.75 (lượt khách + đệm ca) trước khi dựng `appointments` ở V2; 24c thêm kênh-bán/mã-đơn-ngoài/thuế-suất + 24h thêm chuyển-quỹ-2-vế/số-dư-đầu-kỳ trước khi dựng ở V3.

**BẮT ĐẦU NGAY TẠI ĐÂY — đợt đang mở là V1.5 "Cửa vào khách"** (mở 12/08).
- **V1a ĐÓNG 11/08** (mục 35) · **V1b ĐÓNG 12/08** (mục 36) — cả hai giữ làm vết lịch sử + khuôn mẫu cách làm, **KHÔNG phải việc cần làm**.
- **Hồ sơ thi công V1.5 nằm ở `docs/adr/0008-cong-khach-cong-khai.md`**, KHÔNG nằm trong Quy hoạch (mục 18 viết từ 10/08 chỉ mô tả một nửa đợt). Đọc ADR-0008 trước khi đụng bất cứ thứ gì của V1.5.
- Việc theo thứ tự: **#86** thẻ design 3 màn (**việc của Opus, không phải Sonnet**) → **#87** migration nền (`business_hours` + `business_closures` + `tenants.timezone` + cấu hình mặt tiền) → **#88** trang `/t/[slug]` + form thu lead.
- **Hai chốt của ADR-0008 mà bảng 34.7 bản gốc ghi NGƯỢC** — làm theo ADR, không làm theo bản gốc: (1) **KHÔNG dựng `/k/[token]` ở V1.5**, chỉ chốt hợp đồng trên giấy, dựng ở V2.5 (V1.5 chưa có người dùng nào — luật D2); (2) **`business_hours` DỰNG NGAY ở V1.5**, không đợi V2.

**⚖️ Cổng đang đóng — đọc trước khi đề xuất làm V2:** V2 (Lịch hẹn) **KHÔNG được mở** khi 4 số đo sống của V1b còn ở trạng thái CHƯA ĐO (chưa có tiệm thật nên chưa đo được). Phán quyết đầy đủ: **Quy hoạch mục 37**. Muốn mở V2 thì phải đi kiếm tiệm thật, không phải code thêm.

Hàng đợi sau V1.5 (chi tiết ở 34.7 — bảng V1a→V8): V2 Lịch hẹn (17+31.75, chặn trùng bằng **`EXCLUDE` constraint (btree_gist)** ở DB + sửa hợp đồng lượt-khách-gộp TRƯỚC khi dựng bảng) → V3 Tiền thật → V4 Hàng hóa chuẩn → V5 Két sắt & P&L → V6 Giữ khách → V7 Đội ngũ sâu → V8 Nghiêm túc & mở. Mỗi mục: thẻ design vẽ trước → founder duyệt → code → cổng tổng → đo đúng con số hồ sơ đã khai → cập nhật sổ sự thật + nhật ký cùng đợt commit. Opus review theo bộ 11 câu cố định (mục 22).

**Nếp khi xong việc:** cổng tổng (typecheck+lint+build+CI) trên cây yên · cập nhật `docs/SU-THAT-SAN-PHAM.md` cùng commit · nối nhật ký vào `C:\iFan.asia\05 Nhật ký\<ngày>.md` (một ngày một file) · `npx gitnexus analyze` sau loạt commit lớn. Trả lời founder bằng tiếng Việt đời thường (đã làm gì → được gì → còn lại gì), không dump kỹ thuật.
<!-- /ifan:handoff -->
