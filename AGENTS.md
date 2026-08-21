<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ifan.asia** (6203 symbols, 14971 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

### 🎨 MỌI THIẾT KẾ / UX / UI ĐỀU PHẢI ĐI QUA CLAUDE DESIGN (founder chốt 17/08)

**Nguyên văn:** *"Tất cả design, ux, ui đều cần sử dụng claude design nhé!"*

| Bước | Làm gì |
|---|---|
| 1 | **Bản gốc luôn là `design-system/*.html` trong git** — sửa ở đây, không sửa thẳng trên web |
| 2 | **Đẩy lên claude.ai bằng `DesignSync`** ngay trong cùng lượt — dự án `iFan Design System`, id `070f3a01-92e0-4c8e-9980-64c9a951d579` |
| 3 | **Kiểm lại bằng `list_files`** — số thẻ trên đó phải khớp `ls design-system/*.html \| wc -l` |

⛔ **Không có màn hình / thành phần / trạng thái nào được code khi chưa có thẻ trên Claude Design.** Thẻ vẽ trước, code sau — nếp này đã áp từ V1a và không đổi.

> ### ⭐ CHỈ THỊ FOUNDER 21/08 — làm rõ thêm một bậc
>
> Nguyên văn: *"Tất cả các giao diện, màn hình, ux, ui, design đều cần chuẩn chỉnh và hoàn thiện tối đa, phải sử dụng claude design để hỗ trợ rồi mới tinh chỉnh chứ không được tự ý làm mà không sử dụng claude design nhé."*
>
> **Nghĩa là ba việc, theo đúng thứ tự:**
>
> | | Việc | Công cụ |
> |---|---|---|
> | 1 | **Thiết kế trên Claude Design TRƯỚC** — dựng bố cục, trạng thái, luồng bấm | skill `design` (canvas nhiều khung) hoặc thẻ trong `design-system/` |
> | 2 | **Tinh chỉnh** — founder xem, sửa, chốt | trên chính bản thiết kế đó |
> | 3 | **Rồi mới code** — mã bám theo bản đã chốt | `app/`, `components/` |
>
> ⛔ **CẤM đường tắt "code trước rồi vẽ thẻ bù".** Đó đúng là con đường đã tạo ra nợ 48 thẻ lạc hậu phát hiện ngày 21/08 — mã chạy trước, thẻ chạy theo sau, rồi thẻ rớt lại.
>
> ⛔ **Sửa giao diện một màn đang chạy cũng phải qua bước 1.** "Chỉ thêm một ô nhỏ" vẫn là giao diện. Ô chọn người giới thiệu ngày 21/08 được code thẳng mà không đụng thẻ — đúng thứ chỉ thị này cấm.
>
> **Cổng canh:** `scripts/soat-the-con-dung.mjs` so ngày sửa mã với ngày sửa thẻ. Sửa mã giao diện mà thẻ đứng yên ⇒ CI đỏ.

> ### ⭐⭐ CHỈ THỊ 21/08 (lần hai) — ĐẢO CHIỀU QUY TRÌNH
>
> Nguyên văn: *"Claude Design phải là nơi thiết kế, không phải kho lưu sau khi đã code → Những gì đã làm sai, ngược thì fix ngay lập tức toàn bộ đi."*
>
> **Nếp CŨ (SAI, đã làm suốt nhiều tuần):** code màn → viết thẻ HTML mô tả lại → đẩy lên Claude Design. Thẻ là **biên bản chụp lại** một thứ đã dựng xong. Founder không sửa được gì trên đó — chỉ đọc.
>
> **Nếp ĐÚNG từ nay:**
>
> | | Việc | Ở đâu |
> |---|---|---|
> | 1 | **Thiết kế** — bố cục, trạng thái, luồng bấm | Thẻ mới trong `design-system/`, nhóm `@dsCard group="Đề xuất chờ chốt"` |
> | 2 | **Đẩy lên Claude Design để founder xem và chốt** | dự án `iFan Design System` |
> | 3 | **Code bám theo bản đã chốt** | `app/`, `components/` |
>
> ### ⛔ ĐÍNH CHÍNH 21/08 (lần ba) — KHÔNG dựng canvas riêng
>
> Founder hỏi thẳng: *"Sử dụng Claude Design chứ sao dùng design canvas nhỉ?"*
>
> Bản trước của mục này bảo dựng một **canvas riêng** (`design-canvas/`, skill `design`) làm "bản thiết kế sống". **Sai, và đã gỡ bỏ hoàn toàn ngày 21/08.** Lý do: nó tạo ra **nơi thứ hai** chứa thiết kế, tách khỏi 157 thẻ đang có. Founder phải nhớ hai chỗ, và hai chỗ chắc chắn sẽ lệch nhau — đúng cái bệnh mục dưới đây đang cảnh báo.
>
> **Một nơi duy nhất: dự án Claude Design `iFan Design System`.** Thiết kế mới = thêm thẻ vào `design-system/` với nhóm **"Đề xuất chờ chốt"**, đẩy lên, founder xem rồi quyết. Chốt xong mới code, và đổi nhóm thẻ sang `"Màn hình"`.
>
> **Thẻ cũ giữ nguyên, KHÔNG xoá** — chúng là bản ghi *vì sao* mỗi quyết định được chọn, và phần đó vẫn có giá trị. Cái đổi là **thứ tự**: từ nay thiết kế xong mới code, không phải code xong mới mô tả lại.
>
> ⛔ **Màn mới hoặc sửa giao diện đáng kể ⇒ vẽ thẻ TRƯỚC, đẩy lên Claude Design TRƯỚC, code SAU.**

> ### ⭐ CHỈ THỊ 21/08 (lần bốn) — GỌN, TINH, TIẾT KIỆM DIỆN TÍCH
>
> Nguyên văn: *"các design cần ưu tiên clean, tinh tế và tối ưu diện tích để thao tác nhanh, gọn hơn"*
>
> Đây là **tiêu chí chấm** cho mọi thẻ và mọi màn, không phải lời khuyên chung. Bốn câu hỏi phải trả lời được TRƯỚC khi đẩy thẻ:
>
> | Hỏi | Đạt khi |
> |---|---|
> | **Một màn điện thoại thấy được mấy dòng?** | Danh sách công việc: **≥ 5 dòng** trong 812px. Dưới 4 là hỏng — người ta phải cuộn để biết mình có bao nhiêu việc. |
> | **Mỗi dòng có mấy nút?** | **Một nút chính + tối đa hai nút biểu tượng.** Bốn nút chữ mỗi dòng nhân với trăm dòng là một bức tường. |
> | **Chỗ trống này đang nói gì?** | Khoảng trắng phải **tách nhóm**. Trống mà không tách gì thì là chỗ đáng lẽ hiện được thêm một dòng. |
> | **Bấm mấy lần mới xong việc?** | Việc thường làm nhất phải **một bấm**. Chép rồi dán là hai bước cho một việc — xem thẻ `de-xuat-mot-cu-bam.html`. |
>
> **Tinh tế ≠ trang trí.** Ít viền hơn, ít nền xám hơn, ít chip màu hơn; phân cấp bằng **cỡ chữ và độ đậm**, không bằng khung hộp. Mỗi đường kẻ phải trả lời được "nó ngăn cái gì với cái gì".
>
> ⛔ **Không nhồi cho chật.** Gọn là **bỏ thứ không cần**, không phải thu nhỏ chữ hay bóp khoảng bấm. Vùng bấm trên điện thoại vẫn **≥ 44px** (`max-md:h-11`) — cổng `soat-the-tren-dien-thoai.mjs` vẫn là mức sàn.

> ### ⚠️ LỖ ĐÃ NỔ THẬT — đọc trước khi tin "chắc đồng bộ rồi"
>
> Đồng bộ là **thao tác TAY, không có gì nhắc, không có gì báo khi quên**. Đo 17/08: dự án trên claude.ai đóng dấu **04/08** — **lệch 13 ngày**. Cụ thể:
> - **3 thẻ thiếu hẳn:** `man-cai-dat-khung` · `man-chi-tiet-co-hoi` · `man-kho-tri-thuc`
> - **Và cả 111 thẻ đều đã sửa trong git kể từ 04/08** ⇒ 108 thẻ trùng tên kia cũng là **nội dung cũ**. Nhìn danh sách tên thì tưởng chỉ thiếu 3; thực tế lệch toàn bộ.
>
> **Bài học:** so tên file KHÔNG đủ để kết luận đã đồng bộ. Đã đẩy đủ 111/111 ngày 17/08.
>
> ### ⚠️ ĐÍNH CHÍNH 19/08 — đừng dùng "mốc thời gian dự án" làm bằng chứng
>
> Bản trước của mục này dặn "phải so cả **mốc thời gian** dự án". **Cách đó SAI.** Đo lại 19/08: `list_projects` trả `updatedAt` = **04/08** trong khi trên đó đã có những thẻ vẽ ngày **18–19/08** — tức mốc đó KHÔNG nhúc nhích khi ghi file, nó là mốc của thứ khác. Tin theo nó thì hoặc hoảng loạn đẩy lại toàn bộ mỗi ngày, hoặc tệ hơn: tưởng "mốc cũ nhưng chắc ổn" rồi bỏ qua.
>
> **Cách đúng, rẻ và chắc:** `list_files` rồi `comm` với `ls design-system/*.html`. Đo 19/08 bằng cách này ra ngay **4 thẻ thiếu hẳn** (`luat-mat-mang` · `man-kho` · `man-kiem-ke` · `man-phieu-nhap` — đúng 4 thẻ mới nhất). Danh sách tên vẫn không chứng minh được NỘI DUNG khớp, nên khi đã phải mở tay ra sửa thì **đẩy lại cả bộ** (141 file một lượt, `finalize_plan` với glob `*.html` rồi `write_files` — nội dung đọc thẳng từ đĩa, không tốn context).
>
> **Đã có cổng canh — 19/08.** Nói "không canh được vì cần đăng nhập" là ĐÚNG NHƯNG BỎ CUỘC SỚM: phiên đăng nhập claude.ai của founder có thật và đủ quyền, chỉ là nó nằm ở máy founder chứ không nằm trên máy chạy CI. Canh gián tiếp được: `scripts/soat-dong-bo-the.mjs` ghi dấu vân tay bộ thẻ vào `design-system/.dong-bo.json` (có trong git) mỗi lần đẩy, rồi so mỗi lần push. **Sửa thẻ mà quên đẩy là CI đỏ ngay.** Quy trình nay thành: sửa thẻ → đẩy bằng `DesignSync` → `node scripts/soat-dong-bo-the.mjs --ghi` → commit cả sổ. ⚠️ Chạy `--ghi` khi CHƯA đẩy là tự bịt mắt mình — cổng sẽ xanh trong khi trên đó vẫn là bản cũ. Cổng này KHÔNG chứng minh được "trên đó đúng" (ai sửa thẳng trên web thì nó không biết), nó chỉ bắt đúng con bệnh đã xảy ra thật: sửa ở máy rồi quên đẩy. Cổng `scripts/soat-the-design.mjs` chỉ canh được nội dung thẻ ở MÁY — nó bắt được 3 thẻ tự khai "chưa có code" trong khi màn đã chạy thật, nhưng không biết gì về bản trên claude.ai. **Đã đẩy đủ 141/141 ngày 19/08.**
>
> ⚠️ **Đừng nhầm dự án:** tài khoản còn có `hieu.asia Design System` (id `35276112-…`). **Tuyệt đối không đẩy đè lên đó** — luật phân vùng, không đụng tài nguyên hieu.asia.

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

### 📣 MỖI COMMIT PHẢI CÓ DÒNG `Founder:` — bằng TIẾNG VIỆT CÓ DẤU

Founder nhận bản tin "iFan vừa lên bản mới" trong nhóm Telegram. Bản tin lấy
**dòng `Founder:` trong thân commit**; không có thì nó rơi về đọc **tiêu đề
commit**, mà tiêu đề viết KHÔNG DẤU theo quy ước — nên founder nhận được:

> 🐞 Sửa lỗi: goi Zalo la 'lien ket' giong Telegram + bien chi duong

Founder đã phản ánh: *"đều không có dấu và không đầy đủ chi tiết"*. **Đúng, và
lỗi ở người viết commit, không phải ở bản tin** — chỗ nhận câu tiếng Việt đã
dựng sẵn từ 13/08 mà không ai điền.

```
fix(notifications): goi Zalo la 'lien ket'      <- tiêu đề: KHÔNG dấu (quy ước)

Founder: Giờ tìm "Liên kết Zalo" là ra, không còn bị gọi hai tên nữa.

...phần còn lại viết cho người thi công...
```

**Luật:** một câu, tiếng Việt **có dấu**, nói **người dùng được gì** — không nói
tên file, tên hàm, tên bảng. Viết được cả `Người dùng thấy gì:` (bản tin nhận cả
hai). Commit không có dòng này = founder nhận một dòng khó đọc, **và không có gì
báo lỗi**.

#### 🔴 VỊ TRÍ QUAN TRỌNG NGANG NỘI DUNG — đặt NGAY DƯỚI TIÊU ĐỀ, không đặt cuối

Founder phản ánh lại 14/08: *"các thông báo vẫn bug chưa đầy đủ và chi tiết, và
lỗi không dấu"* — **dù 17/21 commit hôm đó ĐÃ có dòng `Founder:`.**

Đo từng commit thì ra quy luật sạch:

| Dòng `Founder:` nằm ở ký tự thứ | Founder nhận được gì |
|---|---|
| **85** | ✅ đúng câu tiếng Việt đã viết |
| 982 · 1.151 · 1.366 · 2.071 | ❌ rơi về **tiêu đề không dấu** |

**Câu commit BỊ CẮT CỤT trên đường từ Vercel sang bản tin.** Dòng nằm gần đầu thì
sống sót; nằm sâu trong thân dài thì bị cắt mất, hàm `tg_release_mark` không tìm
thấy nên rơi về lưới đỡ = tiêu đề, mà tiêu đề **viết không dấu theo quy ước**.

⚠️ **Khuôn nhận dạng KHÔNG hỏng** — đã thử chính nó trên nội dung thật của cả hai
commit, bắt đúng cả hai. Đừng đi sửa hàm SQL; lỗi nằm ở **đầu vào bị cắt**.

**Vậy nên:**

```
ci(smoke): gan booking-schedule-smoke vao CI      <- tiêu đề: KHÔNG dấu

Founder: Bài kiểm chống lỗi lệch giờ nay chạy tự động mỗi lần ra bản.

...phần dài viết cho người thi công để XUỐNG DƯỚI...
```

**Càng viết commit kỹ (dài) thì càng dễ mất dòng này** — nghịch lý, và im lặng.
Đặt nó ở dòng thứ 3 là hết cửa. *(Ghi 14/08 sau khi chính Opus đặt nó ở cuối
suốt một ngày rồi founder phải báo lỗi hai lần.)*

> **Bài học chung, không chỉ chuyện commit:** quy ước có ví dụ đúng nhưng **không
> nói rõ ràng buộc** thì người sau làm sai mà vẫn tin mình đúng luật. Ví dụ ở
> trên vẫn luôn đặt `Founder:` ngay dưới tiêu đề — nhưng vì **chưa ai viết thành
> chữ rằng VỊ TRÍ là bắt buộc**, người đọc tưởng đó chỉ là cách trình bày.
> **Ràng buộc nào không viết ra thì coi như không có.**

#### ⛔ KHÔNG BAO GIỜ CHÉP LỜI CHỈ ĐẠO CỦA FOUNDER VÀO DÒNG NÀY (lỗi thật 17/08, 5 commit liền)

Founder phản ánh lần 3. Bản tin trong nhóm hiện lại **chính lời founder vừa nhắn**:

```
🚀 iFan vừa lên bản mới — 16:15 ngày 17/08
"Tiep tuc ngay, khong duoc dung cho nhu vay nua"      <- ĐÂY LÀ LỖI
mã bản 94f2d32
```

**5 commit chiều 17/08 đều như vậy** (`0e6e870` "tiep tuc lam di" · `d440568` "Du design
can het chua? chu dong lam het di" · `8f56d89` · `f80450e` · `94f2d32`). Sai lan theo kiểu
**BẮT CHƯỚC**: mỗi phiên mở commit trước ra làm mẫu thay vì đọc luật, nên một lần sai thành
năm lần sai — và không ai thấy vì founder mới là người đọc đầu ra.

| Dòng `Founder:` KHÔNG phải | Nó LÀ |
|---|---|
| nhật ký hội thoại | **lời nhắn CHO founder** về việc **người dùng nhận được gì** |
| lời founder vừa nhắn bạn | câu bạn tự viết, tiếng Việt **có dấu**, không tên file/hàm/bảng |
| câu trong ngoặc kép | câu trần thuật bình thường |

**Bản chỉ dọn nội bộ thì khai thẳng, đừng bịa giá trị:** `Founder: Bản dọn dẹp nội bộ, người
dùng không thấy khác biệt.`

#### 🔧 BẢN CHỈ DỌN DẸP NỘI BỘ: khai `Nội bộ:` — ĐỪNG bịa câu gửi founder

Founder phản ánh 17/08, **ngay hôm dựng cổng chặn**: *"Chủ đề Thông báo cần đúng là thông báo
các thay đổi, chứ không phải kiểu: Bản đồ code trong máy đã cập nhật theo các thay đổi hôm nay"*.

Đó là **hệ quả không lường của chính cổng chặn**: nó bắt MỌI commit phải có dòng `Founder:`, nên
người viết (chính Opus) bịa một câu cho một commit `chore(gitnexus)` — và câu bịa chảy thẳng vào
nhóm. **Cổng bắt buộc khai báo mà không chừa đường khai "không có gì để báo" thì tự sinh ra rác.**

```
chore(gitnexus): cap nhat ban do code          <- tiêu đề: KHÔNG dấu

Nội bộ: chỉ cập nhật bản đồ code trong máy.    <- KHÔNG phát tin vào nhóm
```

| Dùng dòng nào | Khi nào | Kết quả |
|---|---|---|
| `Founder:` | `feat` · `fix` · `security` · `perf` — **bất cứ gì người dùng thấy** | phát tin vào chủ đề Thông báo |
| `Nội bộ:` | `chore` · `ci` · `test` · `refactor` · `style` · `build` · `docs` · `design` | **không** phát tin |

⛔ **Cổng CHẶN nếu dùng `Nội bộ:` cho `feat`/`fix`** — thứ gì đổi với người dùng thì founder có
quyền biết, không được né. Và **câu `Founder:` sai khuôn KHÔNG biến bản thành nội bộ** (nếu không
người ta né tin bằng cách viết câu xấu) — bản đó vẫn ra tin, kèm cảnh báo.

**✅ NAY ĐÃ CÓ MÁY ÉP — luật này không còn chỉ là chữ.** Ba lớp, dựng 17/08:

1. **Hook `commit-msg`** — `git commit` **BỊ TỪ CHỐI** nếu dòng này thiếu · đặt quá sâu (>300
   ký tự, sẽ bị cắt) · gần như không có dấu · bọc ngoặc kép · là câu ra lệnh. Cài tự động khi
   `npm install` (`core.hooksPath` → `.githooks`). Thử tay: `node scripts/soat-commit-founder.mjs --test`
2. **Lưới đỡ trong CSDL** (migration #129) — câu sai khuôn bị loại lúc soạn tin, và băng-rôn
   **nói thẳng** "câu gửi anh viết sai khuôn nên tôi bỏ". Không im lặng.
3. **CI** — báo động nếu commit sai vẫn lọt (Vercel dựng bản độc lập với CI, nên đây là lớp
   phát hiện, không phải lớp chặn).

> **Bài học lớn hơn — dùng cho MỌI luật trong file này:** quy ước này thất bại 3 ngày liền
> (14/08: tới đích 12/21 · 17/08: 5 commit chép lời chỉ đạo) **không phải vì viết chưa rõ**,
> mà vì **không có gì cưỡng chế**. Ngày 14/08 đã chẩn nhầm chỗ này: kết luận "cách người-tự-viết
> thất bại" rồi đi thay bằng phương án đắt hơn (nhờ AI soạn lại mọi tin — ADR-0007 mục 12e),
> mà phương án đó **không chữa được ca 17/08** (thử thật: AI chỉ thêm dấu vào lời chỉ đạo) và
> **chưa từng chạy một lần nào** (máy chủ không hề có khoá AI, dù hồ sơ tự khai đã có).
> **Khi một luật bị vi phạm nhiều lần, hỏi "thiếu cơ chế ép?" TRƯỚC khi hỏi "sai phương án?".**

### 🚀 RA BẢN: iFan có ĐÚNG MỘT đường — `git push`. Cấm đường thứ hai.

`git push` lên `main` → Vercel tự dựng và tự đưa lên production. **Không có bước nào khác.**

⛔ **CẤM chạy `vercel deploy` / `vercel --prod`** — kể cả khi một lệnh chung như `/deploy`
bảo làm vậy. Lệnh đó tự dò stack, thấy Next.js là gợi ý `vercel deploy`; nó **không biết
luật của iFan**. Chạy nó là mở đường ra bản thứ hai — phạm bất biến 3 (*một hành động lõi
= một đường code*), và tạo ra bản production **không khớp với `main`**, tức là sổ sự thật
nói một đằng còn web chạy một nẻo, **không có gì báo lỗi**.

Trước khi push: `npm run typecheck` + `npm run lint` (và `npm run build` nếu đụng route/i18n).
Ghi ngày 13/08 sau khi soát công cụ: `/deploy` là lệnh CHUNG của máy, dùng được cho dự án
khác, **không dùng cho iFan**.

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
1. `docs/SO-DO-HE-THONG.md` — bản vẽ nhà + **14 BẤT BIẾN** (vi phạm là bug; mỗi bất biến có vết sẹo thật; đếm lại 14/08 — bất biến 14 thêm 12/08 mà các nơi tham chiếu quên sửa số). Chú ý **bất biến 12**: module mới phải khai sự kiện phát/nghe vào Quy hoạch mục 32 **TRƯỚC khi code** — thiếu hàng là trả hồ sơ.
2. `docs/SU-THAT-SAN-PHAM.md` — tính năng nào đang chạy thật (nguồn sự thật duy nhất).
3. `docs/adr/README.md` — **mở cái này trước, đừng đoán ADR mới nhất là số mấy** (danh sách này tự cập nhật, câu văn ở đây thì không). **Luôn mở ADR MỚI NHẤT trước** — nó thường ĐÍNH CHÍNH kế hoạch cũ. **0005** = một tài khoản nhiều tiệm · **0006** = phiên hỗ trợ chỉ-đọc (đọc trước khi đụng quyền/RLS) · **0007** = chuông báo founder qua Zalo · **0008** = cổng khách công khai (V1.5) · **0009** = V2 Lịch hẹn. **Đợt nào đang mở thì đọc khối 📍 đầu `docs/adr/README.md`, đừng suy ra từ dòng này** — dòng này từng ghi 0009 là "hồ sơ thi công đợt ĐANG MỞ" và sai suốt 5 ngày sau khi V2 đóng. <!--đợt-cũ: câu trên kể lại lỗi cũ, không phải đang khai đợt-->
4. Vault (`C:\iFan.asia`): mở `00 Trang chủ.md` TRƯỚC — nó là bản đồ "tin file nào" + LUẬT ĐỌC (thứ tự thắng-thua khi mâu thuẫn, file nào cấm nuốt thẳng). Kế hoạch & hồ sơ việc: `04 Kế hoạch\Quy hoạch tính năng hợp nhất (10-08).md` — Phần III (mục 11–15): tầng NGÀNH 6 pack, 8 trục, trình tự V1→V5.

**QUAN TRỌNG — trước khi dựng bất kỳ bảng/migration mới:** đọc HỢP ĐỒNG DỮ LIỆU trong Quy hoạch — mục 23–24 (catalog/variants, lịch hẹn+cọc, đơn hàng+hoàn, kho stock_moves, voucher, gói buổi, hoa hồng, thu chi, sub_profiles, lead_submissions) **VÀ mục 31.0 = hợp đồng hạ tầng dùng chung 24k–24u** (tệp đính kèm, tìm kiếm toàn cục, in phiếu/PDF, mã vạch, trường tùy biến, bộ lọc lưu sẵn, nhật ký bản ghi, cấp số chứng từ, mẫu tin, khung giờ gửi, realtime chống ghi đè). Thực thể nào có hợp đồng thì dựng ĐÚNG hợp đồng, cấm tự chế bản riêng. Mục nào ghi "(sửa 24x)" thì dựng theo bản ĐÃ SỬA, không dựng bản cũ rồi vá. Khuôn bắt buộc: **34.5** (module × ngành) · **34.6** (ma trận quyền) · **32 (ma trận liên kết & đồng bộ — module mới phải khai sự kiện phát/nghe vào đây TRƯỚC khi code)**. *(Mục 26/27 đã bị CẮT khỏi file master 12/08 — trỏ vào đó là trỏ vào bia mộ.)*

**BẢN CÓ HIỆU LỰC CAO NHẤT = MỤC 34** (biên bản phản biện cuối, Opus soát 11/08): **34.5** ma trận module×ngành (thay 26) · **34.6** ma trận quyền (thay 27) · **34.7** trình tự chính thức **V1a→V8** (thay 33/28/8) · **34.1** bảy mục bổ sung cuối 31.74–31.80 (P&L bản gọn · lượt-khách gộp thanh toán + đệm ca · bán trên sàn · thuế suất dòng hàng · khuyến mãi tự áp/combo/giá theo tay nghề · vận chuyển + nhãn · PIN đổi người máy chung). Luật đọc: mục viết sau thắng mục viết trước.

**Hợp đồng phải VẼ TRƯỚC migration của thực thể tương ứng** (34.1 + 34.3): ~~24b/24c sửa theo 31.75 (lượt khách + đệm ca) trước khi dựng `appointments` ở V2~~ — **HẾT HIỆU LỰC 12/08: ADR-0009 đã CẮT 31.75 khỏi V2**, `appointments` đã dựng xong không kèm 31.75. Còn hiệu lực: 24c thêm kênh-bán/mã-đơn-ngoài/thuế-suất + 24h thêm chuyển-quỹ-2-vế/số-dư-đầu-kỳ trước khi dựng ở V3.

**BẮT ĐẦU NGAY TẠI ĐÂY — đợt đang mở nằm ở `docs/adr/README.md`, khối 📍 trên cùng.** Mở file đó ra đọc, đừng tin bất kỳ số đợt nào chép trong file này.

> ⛔ **CẤM ghi tên/số đợt đang mở vào file này.** Đây không phải luật cho đẹp — ngày 18/08 đo ra **ba** file cùng khai đợt đang mở và **cả ba đều sai, sai theo ba kiểu khác nhau**: file này ghi "V2 Lịch hẹn" (đóng 13/08, tức **sai suốt 5 ngày và 2 đợt**), `00 Trang chủ.md` ghi "V2.5" (cũng đóng 13/08), `docs/adr/README.md` thì gọi V2.5 là "đợt đang mở" và V3 là "đợt kế tiếp" (V3 đóng 17/08).
> Trớ trêu: bài học chống đúng bệnh này đã được viết ngay trong file này ngày 17/08 (*"ghi vào sổ dài 1.400 dòng không phải là bàn giao — bàn giao là ghi vào chỗ người sau MỞ RA ĐẦU TIÊN"*) — và chính chỗ bàn giao đó vẫn cũ. **Một bản chép là một bản sẽ lệch.** Canh bằng `node scripts/soat-doi-dang-mo.mjs`.

- **Các đợt ĐÃ ĐÓNG** — giữ làm vết lịch sử + khuôn mẫu cách làm, **KHÔNG phải việc cần làm**: V1a (11/08, mục 35) · V1b (12/08, mục 36) · V1.5 (12/08, 3/3) · V2 Lịch hẹn (13/08, 6/6 — ADR-0009) · V2.5 AI trực việc + Bảng giá (13/08 — ADR-0014 + ADR-0011) · V3 Tiền thật (17/08, 8/8 — ADR-0019).
- **Luật vẫn còn nguyên giá trị:** hồ sơ thi công của một đợt nằm ở ADR của đợt đó, **KHÔNG** nằm trong Quy hoạch. Đọc ADR của đợt trước khi đụng bất cứ thứ gì thuộc đợt đó — Quy hoạch viết từ 10/08 thường đã bị ADR cắt phạm vi (ví dụ ADR-0009 cắt V2 từ 13 mục xuống 6).
- **Trước khi mở đợt mới:** phải có ADR/hồ sơ 5 phần cho đợt đó **trước khi code** (luật 34.7 + tiền lệ ADR-0019). ADR-0019 đã cảnh báo: gom quá nhiều thứ vào một đợt là đợt không bao giờ đóng.

### 🔴 HÀNG ĐỢI VIỆC THEO DÕI — cập nhật 17/08 (đọc mục này TRƯỚC phần V2/V2.5 bên dưới)

> ⚠️ **Vì sao mục này sinh ra:** tối 17/08 founder hỏi *"cái đó bạn chưa làm nhưng đã note cho agent khác biết để làm chưa"*. Đo ngay: 4 việc theo dõi có **9 lần** nhắc trong `docs/SU-THAT-SAN-PHAM.md` nhưng **0 lần** trong `AGENTS.md` — file mà phiên sau **bắt buộc đọc đầu tiên**. Và mục hàng đợi ngay dưới còn ghi *"HÀNG ĐỢI RỖNG, V2 ĐỦ 6/6"* từ 13/08 trong khi V3 đã đóng và V2.5 đã xong.
> **Bài học:** ghi vào sổ dài 1.400 dòng **không phải là bàn giao** — bàn giao là ghi vào chỗ người sau MỞ RA ĐẦU TIÊN. Cùng họ với mọi lỗi ngày 17/08: thông tin có thật mà nằm chỗ không ai đọc thì bằng không có.

| # | Việc | Trạng thái | Đọc ở đâu |
|---|---|---|---|
| **#153** | Gỡ cột chết `platform_outbox.sent_body` + `platform_complete_outbox` về 4 tham số | **chưa làm** (founder nhắc dừng vì ngoài phạm vi Telegram) | sổ sự thật đợt 34 · migration #130 |
| **#154** | Xét **tách** hai mảng `inventory` ("Hàng hoá & Kho") và `finance` ("Két sắt & Công nợ") ở ADR-0012 | **chưa làm** | sổ sự thật đợt 34 · `lib/feature-registry.ts` (chú thích tại dòng khai hai mảng) |
| **#155** | Cầu nối hỏi–đáp: ca "chết đột ngột giữa lúc xử lý" không báo người hỏi | **CỐ Ý không dựng** — đã ghi phương án + ngưỡng 30 phút, mở lại khi xảy ra thật lần đầu | sổ sự thật đợt 36 (khối đính chính) |
| **#117** | Khoá AI trên máy chủ | **vẫn MỞ** — founder chốt 17/08 **không cắm**. Mọi tính năng AI đang **tắt trên bản thật** | ADR-0007 mục 12e (khối đỏ) · ADR-0016 |
| **#152** | Sổ `schema_migrations` lệch 44 bản | ✅ **xong 17/08** — có `scripts/ap-migration.mjs`, CI canh bằng `--kiem` | sổ sự thật đợt 34 |
| **#148** | Số khách trộn tiệm demo | ✅ **xong 17/08** trong migration #138 | sổ sự thật đợt 35 |

**⚠️ Ba luật MỚI của ngày 17/08 — đọc trước khi commit bất cứ gì:**

1. **Mỗi commit phải có `Founder:` (có dấu, ngay dưới tiêu đề) hoặc `Nội bộ:`** — hook `commit-msg` TỪ CHỐI commit sai khuôn. Cài tự động khi `npm install`. Xem mục "MỖI COMMIT PHẢI CÓ DÒNG `Founder:`" ở trên.
2. **Áp migration bằng `node scripts/ap-migration.mjs <version>`** — nó áp SQL và ghi sổ trong cùng transaction. Đừng áp thẳng bằng script tạm; sổ đã lệch 44 bản vì nếp đó.
3. **Trùng số migration ⇒ ai vào TRƯỚC giữ số, người sau nhường.** Công cụ sẽ dừng và in danh sách trùng. Hai phiên chạy song song trên cùng thư mục là chuyện thật đã xảy ra 17/08.

---

### 🔴 SONNET ĐỌC ĐÂY — hàng đợi code (cập nhật 13/08, đợt 7) — **HÀNG ĐỢI RỖNG, V2 ĐỦ 6/6** *(mục lịch sử — V2 và V2.5 đã đóng; việc đang mở nằm ở bảng NGAY TRÊN)*

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
