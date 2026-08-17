# ADR-0005 — Một tài khoản, nhiều tiệm: cơ chế "tiệm đang chọn" (11/08/2026)

**Trạng thái:** đã thi công (Sonnet 5, migration #66, 11/08) — bước 1-5 của mục 5 xong: thẻ design, migration, ca kiểm RLS (13 ca mới, tổng 225/225 PASS), kiểm token thật (23/23 PASS), giao diện chuyển tiệm trong menu người dùng. Bước 6 (sổ sự thật + nhật ký) đang làm cùng đợt commit này.
**Người quyết:** founder — chọn phương án "cho 1 tài khoản chuyển qua lại nhiều tiệm"
(thay vì trang demo công khai) trong phiên 11/08.

---

## 1. Bối cảnh — vì sao đụng vào đây là việc nguy hiểm nhất hệ thống

Toàn bộ luật phân quyền + chống xem trộm dữ liệu chéo tiệm (RLS) đứng trên đúng
HAI hàm: `current_tenant_id()` và `app_role()` (migration #3). Cả hai đọc claim
`app_metadata.tenant_id` / `app_metadata.role` trong JWT.

**Đã đo thật, không suy đoán** (11/08, tạo user thử trên DB Singapore rồi đăng
nhập thật và giải mã token, xong xoá sạch):

```
app_metadata: { role: "viewer", tenant_id: "222720b4-…" }
→ Custom Access Token Hook ĐANG BẬT trên bản chạy chính thức.
```

Hệ quả: nhánh claim của `current_tenant_id()` **luôn thắng**; nhánh dự phòng tra
DB (`order by created_at asc limit 1`) gần như không bao giờ chạy trong production.
Mọi thiết kế BẮT BUỘC đi qua `custom_access_token_hook()` (migration #2, dòng 98).

Hook hiện tại luôn lấy membership **cũ nhất**:

```sql
select tenant_id, role into m from public.tenant_members
 where user_id = (event->>'user_id')::uuid and status = 'active'
 order by created_at asc limit 1;
```

Không có khái niệm "tiệm đang chọn". Hook chỉ nhận `event` (user_id, claims) —
**không đọc được cookie/header**, nên lựa chọn của người dùng bắt buộc phải nằm
trong DB để hook đọc được.

---

## 2. Ba sự thật đã kiểm chứng làm đổi mức ưu tiên của việc này

### 2.1. Trạng thái "một người nhiều tiệm" ĐÃ TỒN TẠI trên bản chạy thật

```
sample.tenants.owner@ifan.asia → 5 tiệm (sample-shop, sample-kham, sample-pet,
                                          sample-fnb, sample-retail), vai owner cả 5
```

Đây là tài khoản kỹ thuật do script seed tiệm mẫu tạo (không ai đăng nhập), nên
chưa gây hại. Nhưng nó chứng minh trạng thái này **đến được**, và app hiện sẽ
xử lý sai (chỉ thấy tiệm cũ nhất).

### 2.2. Lược đồ DB VỐN ĐÃ thiết kế cho nhiều tiệm/người — chỉ tầng app giả định 1

`tenant_members` khoá chính là `(tenant_id, user_id)`. **Không có ràng buộc nào
cấm một user vào nhiều tiệm.** `tenant_creation_limits.max_tenants` cũng đã tồn
tại sẵn để nâng hạn mức. Đây là tính năng làm dở, không phải tính năng mới.

### 2.3. LỖI ĐANG SỐNG: nhận lời mời tiệm thứ hai = im lặng không có gì xảy ra

`accept_invitation()` (migration #28, dòng 160-195) **không có bất kỳ chốt nào**
kiểm tra người nhận đã thuộc tiệm khác chưa. Kịch bản thật hôm nay:

> Chị A là chủ Spa X. Anh B chủ Spa Y mời chị A vào Spa Y.
> Chị A bấm link, nhận lời mời → DB ghi thành công dòng thứ 2.
> Hook vẫn cấp claim = Spa X (tiệm cũ hơn) → chị A **không bao giờ vào được Spa Y**,
> mà cũng không thấy lỗi gì. Ghế của Spa Y bị trừ mất.

Thị trường mục tiêu (spa/salon/nha khoa VN) có thợ làm 2 tiệm và chủ chuỗi 2-3 chi
nhánh là chuyện thường → đây là lỗi sẽ gặp, không phải giả định.

**Kết luận về mức độ:** việc này không chỉ phục vụ nhu cầu "khách xem demo" mà
còn vá một lỗi đang sống và mở đường cho chuỗi nhiều chi nhánh. Xứng đáng làm tử tế.

---

## 3. Quyết định

### 3.1. Nơi lưu "tiệm đang chọn": một cột trên `profiles`

```sql
alter table public.profiles
  add column active_tenant_id uuid references public.tenants(id) on delete set null;
```

Lưu ý thi công: **khoá chính của `profiles` là `user_id`**, KHÔNG phải `id`
(đã kiểm bằng information_schema — đừng viết `profiles.id`).

Không tạo bảng riêng: một người chỉ có đúng một "tiệm đang chọn", đây là thuộc
tính của hồ sơ người dùng (Mục 2 CLAUDE.md — không trừu tượng hoá cho việc dùng một lần).

### 3.2. Bất biến an toàn (QUAN TRỌNG NHẤT — mọi thứ khác dựa vào điều này)

> **Claim `tenant_id` chỉ được phép mang giá trị là một tiệm mà người đó ĐANG là
> thành viên `status='active'`, và `role` phải lấy từ ĐÚNG dòng membership đó.**

Nghĩa là: `active_tenant_id` là **gợi ý ưu tiên**, không phải nguồn quyền. Hook
không bao giờ tin con trỏ đó một cách mù quáng — nó luôn resolve qua
`tenant_members`. Nếu con trỏ trỏ vào tiệm đã bị đuổi/xoá → tự động rơi về tiệm
cũ nhất còn hợp lệ, không lỗi, không kẹt.

Cách viết đạt được điều này bằng MỘT truy vấn duy nhất (không cần validate 2 bước):

```sql
select tm.tenant_id, tm.role into m
  from public.tenant_members tm
  left join public.profiles p on p.user_id = tm.user_id
 where tm.user_id = (event->>'user_id')::uuid
   and tm.status = 'active'
 order by (tm.tenant_id = p.active_tenant_id) desc,  -- tiệm đang chọn lên đầu
          tm.created_at asc                           -- không có thì tiệm cũ nhất
 limit 1;
```

Đã đo: hiện KHÔNG có user nào bị ghi cứng `tenant_id` vào `auth.users.raw_app_meta_data`
(đếm = 0) → hook là **nguồn duy nhất** sinh claim. Phải giữ nguyên tính chất này;
cấm mọi chỗ gọi `admin.auth.admin.updateUserById` để set `app_metadata.tenant_id`.

### 3.3. Nhánh dự phòng phải khớp hook

`current_tenant_id()` và `app_role()` (migration #3) phải sửa nhánh fallback theo
ĐÚNG thứ tự ưu tiên trên. Nếu hai đường lệch nhau, hệ thống sẽ hành xử khác nhau
giữa lúc hook bật/tắt → loại lỗi cực khó truy. Cùng một `order by`, chép nguyên.

### 3.4. RPC đổi tiệm

```
switch_tenant(p_tenant_id uuid) returns void   -- security definer
  1. auth.uid() phải có membership active trong p_tenant_id, không thì raise 'not_a_member'
  2. update profiles set active_tenant_id = p_tenant_id where user_id = auth.uid()
  3. ghi record_audit_log('tenant','switched') — hợp đồng 24q, KHÔNG chế log riêng
```

Server action: gọi RPC → **bắt buộc** `await supabase.auth.refreshSession()` →
`redirect()`. Thiếu `refreshSession()` thì token cũ vẫn mang tiệm cũ (đúng bài học
đã ghi trong `createWorkspace` và `enterSampleTenant`, ADR-0001 #11).

### 3.5. RPC liệt kê tiệm của tôi — BẮT BUỘC, không né được

Đã kiểm RLS thật:

```
tenant_members.members_select  USING (tenant_id = current_tenant_id())
tenants.tenants_select         USING (id = current_tenant_id())
```

→ **Người dùng KHÔNG nhìn thấy membership của chính mình ở tiệm khác, cũng không
thấy tên các tiệm đó.** Không có RPC mới thì màn hình chuyển tiệm không thể vẽ được.

```
my_tenants() returns table(tenant_id uuid, name text, slug text,
                           industry text, role text, is_sample boolean, is_active boolean)
  security definer, chỉ trả về dòng của auth.uid() với status='active'
```

Đây là chỗ **rủi ro rò rỉ cao nhất của cả đợt**: một hàm security definer trả về
tên tiệm. Bắt buộc `where tm.user_id = auth.uid()` — không tham số hoá user_id,
không nhận input nào từ client. Phải có ca kiểm trong `scripts/rls-smoke.mjs`:
user X gọi `my_tenants()` không được thấy tiệm của user Y.

### 3.6. Sửa `can_create_tenant()` — nếu không sẽ tự bẫy chính mình

Hiện tại:

```sql
select count(*) from tenant_members where user_id = auth.uid()
  < coalesce(max_tenants, 1)
```

Đếm **mọi** membership. Hệ quả khi có chuyển tiệm:
- Nhân viên được mời vào 1 tiệm → vĩnh viễn không mở được tiệm của chính mình.
- Người đang tham quan tiệm mẫu → cũng bị chặn (hiện chỉ thoát được nhờ đúng
  một nút trên dải băng cam; mất nút đó là kẹt).

Sửa: **chỉ đếm tiệm mà người đó là `owner` và tiệm đó `is_sample = false`.**
Hạn mức "được mở mấy tiệm" nói về tiệm mình LÀM CHỦ, không phải tiệm mình được mời vào.

### 3.7. Nới `enter_sample_tenant()` cho đúng yêu cầu founder

- Bỏ chốt `already_has_tenant` (đó là giới hạn tạm của V1a, nay có cơ chế thật).
- Vẫn **giữ** phần xoá membership tiệm mẫu cũ (mỗi lúc chỉ 1 tour) — nhưng tuyệt
  đối không đụng membership tiệm thật.
- **Bổ sung:** set `active_tenant_id` = tiệm mẫu vừa vào, nếu không thì vào rồi
  mà hook vẫn trả tiệm thật → bấm nút không thấy gì xảy ra.
- `exit_sample_tenant()` phải trả `active_tenant_id` về tiệm thật (hoặc `null`),
  không để trỏ vào dòng vừa xoá.

---

## 4. Sổ rủi ro — những chỗ PHẢI kiểm trước khi cho chạy thật

| # | Rủi ro | Mức | Chốt chặn |
|---|---|---|---|
| R1 | Claim mang tiệm người ta không phải thành viên | **Chí mạng** | Hook resolve qua `tenant_members`; cấm ghi thẳng app_metadata; ca kiểm RLS |
| R2 | `my_tenants()` lộ tiệm người khác | **Chí mạng** | Không nhận tham số user; ca kiểm chéo user trong rls-smoke |
| R3 | Hook và nhánh fallback lệch thứ tự ưu tiên | Cao | Chép nguyên `order by`, kiểm cả 2 đường |
| R4 | Đổi tiệm xong nhưng token chưa refresh | Trung bình | `refreshSession()` + `redirect()`; xấu nhất là vẫn ở tiệm cũ — KHÔNG rò rỉ |
| R5 | Bộ nhớ đệm phía trình duyệt (TanStack Query) còn dữ liệu tiệm cũ | Trung bình | Đổi tiệm phải `redirect()` (điều hướng thật), không chuyển bằng client-side |
| R6 | Kênh realtime cũ còn nghe tin tiệm cũ | Trung bình | Kiểm mọi `.channel(...)` có bị hủy khi đổi tiệm; liệt kê trong bản kiểm kê |
| R7 | Đếm ghế / tính tiền nhân đôi khi 1 người ở 2 tiệm | Trung bình | Rà `seats`, billing: phải đếm theo tenant, không theo user |
| R8 | `signIn()` ghi `login_events.tenant_id` bằng dòng bất kỳ (`.limit(1)` không `order by`) | Thấp–TB | Ghi theo tiệm đã resolve, không lấy dòng ngẫu nhiên |
| R9 | Tài khoản nhân viên đăng nhập bằng SĐT gắn cứng mã tiệm trong email tổng hợp | Ghi nhận | Thợ làm 2 tiệm = 2 tài khoản riêng, **không** chuyển tiệm được. Đây là hành vi ĐÚNG, phải nói rõ với người dùng, không âm thầm |
| R10 | Tiệm mẫu lẫn vào danh sách "tiệm của tôi" gây rối | Thấp | Gắn nhãn riêng + lối thoát rõ ràng trong màn chuyển tiệm |

---

## 5. Thứ tự thi công bắt buộc (giao Sonnet 5)

Theo nếp đã chốt (mục 35.2): **thẻ design trước → duyệt → mới code.**

1. **Thẻ design** `chuyen-tiem.html` (≥2 nhóm biến thể: menu chuyển tiệm ở đầu
   thanh bên khi có nhiều tiệm / trạng thái chỉ có 1 tiệm thì KHÔNG hiện gì) →
   máy kiểm thẻ → đồng bộ claude design → commit.
   *(Đính chính 17/08: dòng gốc ghi `check-ds.mjs` — công cụ đó CHƯA TỪNG TỒN TẠI, xem ADR-0002.
   Máy kiểm thật là `scripts/soat-the-design.mjs`.)*
2. **Migration** (một đợt): `profiles.active_tenant_id` + sửa
   `custom_access_token_hook` + sửa `current_tenant_id`/`app_role` +
   `switch_tenant()` + `my_tenants()` + sửa `can_create_tenant()` +
   nới `enter_sample_tenant`/`exit_sample_tenant`.
3. **Ca kiểm RLS** thêm vào `scripts/rls-smoke.mjs` TRƯỚC khi làm giao diện:
   - user A gọi `my_tenants()` không thấy tiệm của user B
   - `switch_tenant()` sang tiệm không phải thành viên → bị chặn
   - sau khi bị đuổi khỏi tiệm đang chọn → tự rơi về tiệm hợp lệ, không kẹt
   - nhớ cập nhật hằng số `STATIC_CHECKS`
4. **Kiểm thật đầu-cuối bằng token thật**: đăng nhập, đổi tiệm, giải mã lại JWT
   xác nhận claim đổi đúng (dùng lại cách đã làm ở mục 1 của ADR này).
5. **Giao diện**: menu chuyển tiệm + nới màn onboarding cho phép xem tiệm mẫu
   dù đã có tiệm.
6. **Sổ sự thật + nhật ký cùng một đợt commit** (mục 35.4 điểm 10 — đã vi phạm
   một lần ngày 11/08, không lặp lại).

**Không mở phần này chung với V1b** cho tới khi bước 3 và 4 xanh thật.

---

## 6. Bản kiểm kê code (quét toàn kho 11/08) — danh sách việc cho Sonnet

### 6.0. Một đính chính quan trọng về phương pháp

Bản quét tự động kết luận "không có `supabase/config.toml` → hook CHƯA bật → hệ
thống đang chạy nhánh fallback SQL". **Kết luận đó SAI**, và sai theo hướng nguy
hiểm (sẽ dẫn tới thiết kế nhầm chỗ).

Sự thật đo được (mục 1 của ADR này): hook **ĐANG BẬT**, claim `tenant_id` có thật
trong JWT production. Suy từ việc thiếu file config là suy đoán; giải mã token
thật là đo. **Đo thắng suy đoán.**

Nhưng quan sát gốc của bản quét vẫn có giá trị và phải ghi thành rủi ro riêng:

> **RỦI RO HẠ TẦNG R11 — hook được bật bằng tay trên Dashboard, KHÔNG có trong code.**
> Dựng lại dự án, tạo môi trường mới, hoặc khôi phục sau sự cố → hook không tự
> bật lại, hệ thống âm thầm rơi sang nhánh fallback với hành vi khác. Cần đưa
> việc bật hook vào tài liệu vận hành (và `config.toml` nếu về sau dùng Supabase CLI),
> đồng thời thêm một ca kiểm khởi động: đăng nhập thử → claim `tenant_id` phải có mặt.
> `scripts/rls-smoke.mjs` hiện chỉ kiểm hàm hook TỒN TẠI, không kiểm nó ĐƯỢC BẬT.

### 6.1. LỖI CHÍ MẠNG bổ sung — ghi đè cấu hình sang tiệm khác

`app/auth/actions.ts` (`createWorkspace`): gọi `create_tenant` → `refreshSession()`
→ `apply_industry_pack`. Vì hook trả tiệm **cũ nhất**, tài khoản được nâng hạn mức
tạo tiệm thứ 2 sẽ khiến `apply_industry_pack` **ghi đè gói ngành lên TIỆM CŨ**, rồi
đưa người dùng vào tiệm cũ.

Đây là **ghi hỏng dữ liệu cấu hình chéo tiệm**, nặng hơn mọi lỗi "chọn nhầm tiệm"
khác trong danh sách. Cách chặn nằm sẵn trong thiết kế mục 3: **set
`active_tenant_id` = tiệm vừa tạo TRƯỚC khi gọi `refreshSession()`.** Áp dụng y hệt
cho `enterSampleTenant`.

### 6.2. Việc phải sửa, theo mức

**CAO — sửa cùng đợt migration, không tách:**

| Chỗ | Việc |
|---|---|
| `app/auth/actions.ts` `createWorkspace` / `enterSampleTenant` | Set tiệm đang chọn TRƯỚC `refreshSession()` (mục 6.1) |
| `app/invite/[token]/page.tsx` | Thiếu `refreshSession()` sau `accept_invitation` → nhận lời mời xong vẫn ở tiệm cũ |
| `app/auth/actions.ts` `signIn` | Bỏ luật "đã có tiệm → vứt lời mời đang chờ". Luật này là hiện thân của giả định 1-người-1-tiệm |
| `app/app/settings/team/actions.ts` `removeMember` | `update ... .eq("user_id", …)` KHÔNG chỉ định tiệm → có switcher rồi sẽ gỡ nhầm người khỏi tiệm khác. Thêm `.eq("tenant_id", …)` tường minh |
| 6 chỗ rút `tenant_id` từ membership rồi dùng làm khoá GHI | `settings/forms`, `settings/qr`, `settings/replies`, `settings/notifications`, `contacts/import-export-actions`, `deals/actions` — dùng tiệm đang chọn, không lấy dòng đầu tiên |
| `app/app/layout.tsx` | Nguồn của header + `tenantId` cho realtime + `role` toàn nav. Phải đọc theo tiệm đang chọn |

**TRUNG BÌNH — cơ học, số lượng lớn (hợp với Sonnet):**

- **28 màn/action đọc `role`** bằng `.from("tenant_members").select("role").eq("user_id", …).maybeSingle()`
  (khắp `app/app/**`: trang chủ, today, contacts, reports, và toàn bộ `settings/*`).
  Hai việc cho mỗi chỗ: (a) thêm `.eq("status","active")`, (b) đọc theo tiệm đang chọn.
  **Nên gom vào MỘT hàm dùng chung** (kiểu `getCurrentMembership()`) thay vì sửa 28 chỗ
  rồi chỗ thứ 29 lại quên — đúng tinh thần "một đường duy nhất" của `getTenantPack()`.
- 3 chỗ xác minh "người này có phải thành viên không" không lọc tiệm
  (`deals/actions`, `inbox/actions`, `settings/sla/actions`) → có thể giao việc cho
  người ở tiệm khác khi đã có switcher.
- 3 chỗ ghi `login_events.tenant_id` bằng `.limit(1)` không `order by` → ghi nhật ký
  đăng nhập vào sai tiệm (`signIn`, `signInStaffByPhone`, `auth/confirm/route.ts`).

**THẤP:**

- `can_create_tenant()` (migration #41) — ngoài `is_sample` (mục 3.6) còn **không lọc
  `status='removed'`**: người từng bị gỡ khỏi một tiệm vĩnh viễn mất một suất hạn mức.
  `create_tenant` đếm y hệt, sửa cả hai.
- Ô checklist "đã mời nhân viên" ở trang chủ đếm cả người đã bị gỡ.

### 6.3. Tin tốt từ bản quét — giảm đáng kể phạm vi rủi ro

- **Không có bất kỳ cookie / localStorage / cache nào đang lưu tiệm hiện tại.**
  Không phải đi dọn bộ nhớ đệm cũ (rủi ro R5 nhẹ hơn dự kiến). Đổi lại: chưa có
  sẵn chỗ nào để lưu "tiệm đang chọn" → đúng như mục 3.1 đã quyết.
- **`proxy.ts` hoàn toàn trung lập với tenant** (chỉ kiểm đã đăng nhập chưa).
  Không phải sửa tầng chặn đường.
- Kênh realtime có dạng `tenant:{id}:inbox` → xác nhận rủi ro R6 là thật, phải hủy
  kênh cũ khi đổi tiệm.

### 6.4. Một lỗ hổng ĐANG TỒN TẠI, phát sinh từ đợt quét — tách task riêng

Người vừa bị gỡ khỏi tiệm (`status='removed'`) **vẫn giữ nguyên quyền cho tới khi
token hết hạn**: `current_tenant_id()`/`app_role()` đọc claim mà không kiểm lại
`status`, và 28 chỗ đọc `role` ở tầng web cũng không lọc `status='active'`.

Đây là lỗ **có sẵn từ trước**, không do việc chuyển tiệm sinh ra — nhưng đợt này
đụng đúng vào những dòng code đó nên sửa luôn là rẻ nhất. Không gộp vào phạm vi
chuyển tiệm để tránh phình; ghi thành task riêng và làm cùng đợt.

## Điều kiện xem lại

- **Khi một người cần mở HAI tiệm cùng lúc** (hai tab, hai cửa sổ) ⇒ mục 3.1 sập. "Tiệm đang chọn" là **một cột trên `profiles`**, tức một giá trị cho cả tài khoản — hai tab sẽ giẫm lên nhau. Lúc đó mới cần đưa lựa chọn vào URL hoặc phiên, và đó là việc lớn, không phải sửa vặt.
- **Khi xuất hiện vai KHÔNG nằm trong `tenant_members`** (ví dụ vai cấp nền tảng, đối tác ngoài) ⇒ đọc lại bất biến 3.2 trước khi làm bất cứ gì — mọi thứ khác dựa lên nó.
- **Khi số tiệm trung bình mỗi tài khoản vượt ~5** ⇒ màn chuyển tiệm cần tìm kiếm/ghim, không còn là danh sách phẳng.
