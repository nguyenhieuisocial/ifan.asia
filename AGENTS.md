<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ifan.asia** (3337 symbols, 8680 relationships, 258 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
3. `docs/adr/README.md` — **mở cái này trước, đừng đoán ADR mới nhất là số mấy** (danh sách này tự cập nhật, câu văn ở đây thì không). **Luôn mở ADR MỚI NHẤT trước** — nó là quyết định của đợt đang mở và thường ĐÍNH CHÍNH kế hoạch cũ. **0005** = một tài khoản nhiều tiệm · **0006** = phiên hỗ trợ chỉ-đọc (đọc trước khi đụng quyền/RLS) · **0007** = chuông báo founder qua Zalo · **0008** = cổng khách công khai (V1.5, đã đóng) · **0009** = V2 Lịch hẹn = **hồ sơ thi công đợt ĐANG MỞ**.
4. Vault (`C:\iFan.asia`): mở `00 Trang chủ.md` TRƯỚC — nó là bản đồ "tin file nào" + LUẬT ĐỌC (thứ tự thắng-thua khi mâu thuẫn, file nào cấm nuốt thẳng). Kế hoạch & hồ sơ việc: `04 Kế hoạch\Quy hoạch tính năng hợp nhất (10-08).md` — Phần III (mục 11–15): tầng NGÀNH 6 pack, 8 trục, trình tự V1→V5.

**QUAN TRỌNG — trước khi dựng bất kỳ bảng/migration mới:** đọc HỢP ĐỒNG DỮ LIỆU trong Quy hoạch — mục 23–24 (catalog/variants, lịch hẹn+cọc, đơn hàng+hoàn, kho stock_moves, voucher, gói buổi, hoa hồng, thu chi, sub_profiles, lead_submissions) **VÀ mục 31.0 = hợp đồng hạ tầng dùng chung 24k–24u** (tệp đính kèm, tìm kiếm toàn cục, in phiếu/PDF, mã vạch, trường tùy biến, bộ lọc lưu sẵn, nhật ký bản ghi, cấp số chứng từ, mẫu tin, khung giờ gửi, realtime chống ghi đè). Thực thể nào có hợp đồng thì dựng ĐÚNG hợp đồng, cấm tự chế bản riêng. Mục nào ghi "(sửa 24x)" thì dựng theo bản ĐÃ SỬA, không dựng bản cũ rồi vá. Khuôn bắt buộc: **34.5** (module × ngành) · **34.6** (ma trận quyền) · **32 (ma trận liên kết & đồng bộ — module mới phải khai sự kiện phát/nghe vào đây TRƯỚC khi code)**. *(Mục 26/27 đã bị CẮT khỏi file master 12/08 — trỏ vào đó là trỏ vào bia mộ.)*

**BẢN CÓ HIỆU LỰC CAO NHẤT = MỤC 34** (biên bản phản biện cuối, Opus soát 11/08): **34.5** ma trận module×ngành (thay 26) · **34.6** ma trận quyền (thay 27) · **34.7** trình tự chính thức **V1a→V8** (thay 33/28/8) · **34.1** bảy mục bổ sung cuối 31.74–31.80 (P&L bản gọn · lượt-khách gộp thanh toán + đệm ca · bán trên sàn · thuế suất dòng hàng · khuyến mãi tự áp/combo/giá theo tay nghề · vận chuyển + nhãn · PIN đổi người máy chung). Luật đọc: mục viết sau thắng mục viết trước.

**Hợp đồng phải VẼ TRƯỚC migration của thực thể tương ứng** (34.1 + 34.3): ~~24b/24c sửa theo 31.75 (lượt khách + đệm ca) trước khi dựng `appointments` ở V2~~ — **HẾT HIỆU LỰC 12/08: ADR-0009 đã CẮT 31.75 khỏi V2**, `appointments` đã dựng xong không kèm 31.75. Còn hiệu lực: 24c thêm kênh-bán/mã-đơn-ngoài/thuế-suất + 24h thêm chuyển-quỹ-2-vế/số-dư-đầu-kỳ trước khi dựng ở V3.

**BẮT ĐẦU NGAY TẠI ĐÂY — đợt đang mở là V2 "Lịch hẹn"** (mở 12/08).
- **V1a ĐÓNG 11/08** (mục 35) · **V1b ĐÓNG 12/08** (mục 36) · **V1.5 ĐÓNG 12/08, 3/3** — cả ba giữ làm vết lịch sử + khuôn mẫu cách làm, **KHÔNG phải việc cần làm**.
- **Hồ sơ thi công V2 nằm ở `docs/adr/0009-v2-lich-hen.md`**, KHÔNG nằm trong Quy hoạch (mục 17 viết từ 10/08 — còn đúng về 5 phần luồng nhưng **phạm vi đã bị ADR-0009 cắt từ 13 mục xuống 6**). Đọc ADR-0009 trước khi đụng bất cứ thứ gì của V2.
- Việc theo thứ tự: **#91** hồ sơ ✅ → **#92** migration nền ✅ → **thẻ design 3 màn** ✅ → **#93** màn Cài đặt Dịch vụ & Tài nguyên ✅ (13/08, 346 ca xanh) → **màn Lịch** ✅ (13/08 đợt 2, 346 ca RLS + 136 ca timezone) → **#99** ✅ (13/08 đợt 3) → nới `access.ts` cho manager ✅ (13/08 đợt 4, 348 ca RLS) → **#94** ✅ (13/08 đợt 5) → **đặt lịch từ chat** ✅ (13/08 đợt 6, 156 ca timezone) → **nhắc nội bộ** ← *tiếp theo*.

### 🔴 SONNET ĐỌC ĐÂY — hàng đợi code (cập nhật 13/08, đợt 7) — **HÀNG ĐỢI RỖNG, V2 ĐỦ 6/6**

Opus đã xong toàn bộ phần kiến trúc/hoạch định. **Từ đây là code.** Làm theo thứ tự, mỗi việc xong thì cập nhật `docs/SU-THAT-SAN-PHAM.md` **cùng commit, VÀ `git push` trong cùng lượt** (xem cảnh báo dưới — đừng để lại như đợt 2).

~~1-4. V2 việc 4 · bộ kiểm timezone · #99 · nới access.ts cho manager~~ · ~~5. #94~~ · ~~6. V2 việc 5 — đặt lịch từ chat~~ · ~~7. V2 việc 6 — nhắc nội bộ (nhân viên tự động, migration #85)~~ — **XONG CẢ BẢY. V2 "Lịch hẹn" khép lại ĐỦ 6/6 việc theo ADR-0009 mục 7 — không còn việc nào trong hàng đợi.** Chi tiết bug + khoảng chưa kiểm hết: `docs/SU-THAT-SAN-PHAM.md` mục "Cập nhật 13/08 (đợt 2)" tới "(đợt 7)".

**⚠️ Việc 6 — đính chính so với chữ ADR mục 3:** job nhắc chỉ dùng 2/3 kênh ADR liệt kê (chuông + Zalo Bot, BỎ `activities`) — lý do là một lỗi thiết kế thật bắt được trước khi code (activities không tự đóng ⇒ mỗi ca hẹn sẽ để lại một "việc" quá hạn vĩnh viễn trên `/app/today`). Đọc đủ lý do + "Điều kiện xem lại" ở đầu migration `20260813000085_v2_appointment_reminders.sql` và mục "Cập nhật 13/08 (đợt 7)" trước khi đụng vào bảng `activities` cho việc này.

**13/08 — Opus đã mở đợt V2.5 và viết xong hồ sơ + 8 thẻ design. Hàng đợi bên dưới có việc, code được ngay.**

**✓ Việc 5+6 nay đã kiểm tay thật 100% (đợt 8, 13/08).** Công cụ Browser pane phiên trước bị treo (không phải lỗi code — đã xác nhận bằng cách gọi `.click()` thẳng qua JS cũng không chạy, trên cả nút đã chạy tốt từ lâu) → đổi sang **Playwright** thì bấm được ngay, cả hai luồng chạy đúng từ đầu tới cuối qua giao diện thật. Bắt thêm 1 bug thật KHÔNG liên quan V2 (React key trùng `HandoffBanner`/`AiAssist`, có từ #55) — đã sửa, đã kiểm lại. Đọc "Cập nhật 13/08 (đợt 8)" trong sổ sự thật. **Bài học giữ lại: Browser pane phiên nghi hỏng thì đổi Playwright để xác nhận, đừng lặp lại kết luận "chưa kiểm được".**

**⚠️ Lỗi quy trình đợt 2, ĐỌC KỸ đừng lặp lại:** commit màn Lịch từng nằm ở máy, quên `git push`, khiến server thật 404 mà sổ đã ghi CHẠY THẬT — founder tự bấm thử mới phát hiện. Đã kiểm: chỉ sót đúng 1 lần đó (lịch sử trước giờ luôn đẩy đầy đủ), đã đẩy bù. **Luật mới: commit xong PHẢI push ngay trong cùng lượt, không tách hai bước.**

**⚠️ Bẫy môi trường dev mới bắt được ở đợt 5:** trang `force-dynamic` đôi khi vẫn trả bản CŨ trong trình duyệt kiểm thử dù server đã build lại — thêm `?v=<số>` vào URL để né cache mới thấy đúng. `next-themes` cũng cần TẢI LẠI trang sau khi bật giả lập chế độ tối (không tự áp lại nếu chỉ đổi cờ giả lập mà không tải lại). Đọc chi tiết ở `docs/SU-THAT-SAN-PHAM.md` mục "Cập nhật 13/08 (đợt 5)" trước khi kiểm giao diện.

**⚠️ D1 nhắc lại — sửa `createAppointment` thì soát HẾT nơi gọi:** đợt 6 bắt được bug thật — hàm dùng chung gán cứng `source: "calendar"`, khiến lịch đặt từ chat ghi nhầm nguồn. Nay `source` là tham số BẮT BUỘC (không có mặc định ngầm) — thêm nơi gọi mới thì PHẢI truyền rõ `"chat"` hay `"calendar"`, quên truyền sẽ đỏ ngay ở `tsc`, không phải lỗi ngầm.

**Đợt V2.5 mở 13/08 — hồ sơ thi công: `docs/adr/0011-gia-va-trang-cong-khai.md`. ĐỌC HẾT ADR TRƯỚC KHI GÕ DÒNG ĐẦU.** Bảy việc, theo thứ tự:

| # | Việc | Ghi chú bắt buộc |
|---|---|---|
| 1 | **🔴 GỠ CÁI ĐANG SAI CÔNG KHAI** — bảng giá đã bị bác + 2 nhãn sai sự thật | ADR mục 6 việc 1. Trang chủ **đang bán giá founder đã bác** kèm câu hứa ràng buộc, và gắn nhãn "Sẵn sàng" cho 2 tính năng **không tồn tại**. Làm trước mọi thứ khác. |
| 2 | Dựng lại `lib/feature-registry.ts` theo 20 mảng | ADR mục 5.1 là nguồn duy nhất. 3 trạng thái `ready`/`building`/`planned`. **Mọi trang đọc từ đây, cấm gõ tay số.** |
| 3 | Trang chủ mới | 4 thẻ: `landing-hero` · `landing-mot-ngay` · `landing-khac-biet-va-mien-phi` · `landing-mobile` |
| 4 | 4 trang mới: `/tinh-nang` · `/lo-trinh` · `/bang-gia` · `/nganh/[slug]`×6 | 4 thẻ `trang-*`. **`/nganh/shop|retail|fnb` KHÔNG kể chuyện đặt lịch** — pack không seed dịch vụ, kể là hứa suông |
| 5 | Đổi dòng AI sang Haiku 4.5 + giảm số tin gửi đi | ADR mục 3. **Đo chất lượng 20 hội thoại thật TRƯỚC khi đổi hẳn.** Rẻ đi 5 lần |
| 6 | Túi lượt AI + trần chi tiêu | ADR mục 4.2. **Trần bật sẵn mặc định**, hết túi thì DỪNG chứ không tự tính thêm tiền |
| 7 | Reverse trial 30 ngày | ADR mục 5b. **Dữ liệu vượt hạn mức chuyển chỉ-đọc, CẤM xoá** |

**⚠️ Ba con số phải nhớ khi làm việc 5–6:** dòng AI đang đặt mặc định là **Opus 5 — đắt nhất** (410đ/lượt); Haiku 4.5 chỉ **82đ/lượt** cùng đầu việc. Bảng giá cũ hứa 1.000–5.000 lượt AI ⇒ **hai gói đắt nhất càng bán càng lỗ**. Chưa cháy đồng nào vì AI chưa bật thật — nhưng **V2.5 chính là đợt bật nó**.

**⚠️ Giá đã chốt nội bộ (ADR mục 4c) nhưng CHƯA công bố:** trang `/bang-gia` chỉ hiện gói Miễn phí với số thật; gói trả phí ghi *"công bố khi mở bán"*. **Cấm đưa con số gói trả phí lên bất kỳ trang nào.**

**Ba luật dễ quên nhất, đọc lại trước khi gõ dòng đầu:**
- **D3** — ca kiểm mới phải **thấy ĐỎ trên code chưa sửa** rồi mới được tin là xanh. Dán nguyên văn dòng đỏ vào báo cáo.
- **D2** — không dựng bảng/cột/nút nào mà không có code ghi vào. **ADR-0010 thêm module vào KẾ HOẠCH, không cho phép dựng vỏ rỗng.**
- **i18n + giao diện tối + điện thoại** — kiểm đủ 4 tổ hợp. Đợt V1.5 bỏ sót đúng chỗ này và thành nợ #94.

**Phạm vi mới (13/08, đọc `docs/adr/0010-ban-do-module-va-lo-trinh.md`):** iFan gồm **20 module**, tệp khách **2–100 người**, có thêm **đợt V2.5 (AI trực việc)** sau V2. **Không đảo thứ tự đợt nào.**
- **Chống trùng nằm ở CSDL, KHÔNG ở giao diện** (ADR-0009 mục 6). Hai `EXCLUDE` đã chạy thật, chỉ áp cho `booked`/`arrived` **và** `deleted_at is null` — huỷ/no-show/xoá mềm đều **nhả chỗ**. Đừng dựng lại lớp kiểm trùng ở tầng web rồi tưởng đó là chốt chặn.
- **Đã CẮT khỏi V2, đừng lén dựng lại:** `staff_services` · lịch lặp · đệm ca (31.75) · waitlist · walk-in · thu cọc thật · feature-gate theo gói. Lý do đo được nằm ở ADR-0009 mục 7.

**⚖️ KHÔNG còn cổng nào chặn V2.** *(Trước đây mục này ghi "V2 KHÔNG được mở khi 4 số đo sống của V1b còn CHƯA ĐO". **Founder đã bác 12/08**, nguyên văn: "tôi cần xong hết mới cần có người dùng". Cổng đó **chết**, Quy hoạch mục 37 đọc theo nghĩa lịch sử. Giữ dòng này làm vết vì cổng chết mà không ai gỡ đã hai lần khiến trợ lý khẳng định sai với founder.)*

Hàng đợi sau V2 (chi tiết ở 34.7 — bảng V1a→V8): V3 Tiền thật → V4 Hàng hóa chuẩn → V5 Két sắt & P&L → V6 Giữ khách → V7 Đội ngũ sâu → V8 Nghiêm túc & mở. Mỗi mục: thẻ design vẽ trước → code → cổng tổng → đo đúng con số hồ sơ đã khai → cập nhật sổ sự thật + nhật ký cùng đợt commit. Opus review theo bộ 11 câu cố định (mục 22). *(Bước "founder duyệt" đã bỏ 13/08 — xem luật toàn quyền ở `C:\iFan.asia\00 Trang chủ.md` mục 6.)*

**🚫 HAI LUẬT CHỐNG TỰ TIỆN — Opus vi phạm cả hai ngày 13/08, đọc kỹ:**
1. **KHÔNG tự gọi agent nền.** Chỉ giao việc cho agent **khi founder bảo giao**. Mỗi agent là một cửa sổ ngữ cảnh mới đốt token thật. Tự giao vì "cho nhanh" = đốt tiền founder không xin phép.
2. **Tới lúc code thì DỪNG LẠI và nói "founder đổi sang Sonnet 5"** — không tự code bằng Opus, cũng **không lách bằng cách đẩy sang agent**. Đây là **ngoại lệ duy nhất** được phép dừng ngoài 3 trường hợp của luật toàn quyền, vì nó là luật về hành vi của chính founder.

⚠️ **"Toàn quyền" KHÔNG phải "miễn luật".** Toàn quyền bỏ **cổng duyệt nội dung** (không phải xin phép về phạm vi, thiết kế, cách làm). Nó **không** bỏ: luật D1–D3 · thứ tự đọc bắt buộc ở trên · luật phân vai model · luật không tự gọi agent · luật cập nhật sổ sự thật. Ngày 13/08 Opus hiểu "toàn quyền" thành "không luật nào áp nữa" và phạm 3 lỗi liên tiếp trong một giờ.

**Nếp khi xong việc:** cổng tổng (typecheck+lint+build+CI) trên cây yên · cập nhật `docs/SU-THAT-SAN-PHAM.md` cùng commit · nối nhật ký vào `C:\iFan.asia\05 Nhật ký\<ngày>.md` (một ngày một file) · `npx gitnexus analyze` sau loạt commit lớn. Trả lời founder bằng tiếng Việt đời thường (đã làm gì → được gì → còn lại gì), không dump kỹ thuật.
<!-- /ifan:handoff -->
