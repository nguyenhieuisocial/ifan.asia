# ADR-0028 — Chấm công: định vị cấu hình được + selfie làm bằng chứng có mặt

**Trạng thái:** ĐỀ XUẤT — các ngã rẽ còn chờ founder chốt, **CHƯA thi công**. Đây là hồ sơ khảo sát + thiết kế, không phải quyết định đã đóng.
**Người khảo sát/đề xuất:** phiên 20/08/2026 (đọc code, không đoán).
**Bám vào:** V7 Nhân sự/Chấm công (migration **#166** `20260819000166_v7_nhan_su_cham_cong.sql`, đã chạy thật). Thẻ design gốc: `design-system/man-nhan-su-cham-cong.html` (5 quyết định đã chốt).
**Ràng buộc gốc phải giữ:** bất biến 1 (chặn/tính ở CSDL, không tin client) · D1 (một sự thật một nơi) · D2 (chưa có code ghi thì chưa tạo cột) · hợp đồng tệp đính kèm #60 (bảng `attachments` + bucket `tenant-files`, "cấm tự chế") · các cổng kiểm tự động (mục 1.4).

---

## 0. TL;DR

Founder xin **2 việc**: (1) tiệm cài định vị để chấm công đúng chỗ; (2) chụp selfie khi chấm, ảnh tự gắn vị trí + thời gian.

Khảo sát cho thấy: **việc (1) đã dựng gần xong** trong V7 — bảng `attendance_punches` đã có `lat/lng/distance_m/out_of_range`, trigger tính cờ ngoài-vùng ở CSDL, toạ độ tiệm lưu trong `tenants.settings.workLocation`. Cái **chưa có**: bán kính cấu hình được (đang **cứng 300m** trong trigger), công tắc bật/tắt yêu cầu selfie, và **toàn bộ phần selfie** (chưa có cột ảnh nào trên lần chấm).

Đề xuất: **Phase 1 = định vị cấu hình được + selfie-làm-bằng-chứng + auto-tag bằng metadata bản ghi** — làm được ngay, tái dùng hạ tầng `attachments`/`tenant-files` đã có. **Phase 2 = face-matching ML** tách riêng, cần founder duyệt chi phí + luật đồng ý sinh trắc, **không** gộp vào đợt này.

---

## 1. Hiện trạng đo được (đọc code #166, `app/app/team/*`, migration #2/#60)

### 1.1 Định vị chấm công — ĐÃ CÓ, gần đủ

Bảng `public.attendance_punches` (migration #166) đã có sẵn:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `lat`, `lng` | `numeric(9,6)` | toạ độ client gửi lên khi chấm |
| `distance_m` | `integer` | **server tính** (haversine) từ toạ độ tiệm, KHÔNG nhận từ client |
| `out_of_range` | `boolean` | **trigger `attendance_set_flag()` quyết**, client gửi gì cũng bị ghi đè |
| `reason` | `text` | ngoài vùng thì CHECK constraint **bắt buộc** có lý do |
| `kind` | `text` | `in`/`out`; `punched_at`, `tenant_id`, `employee_id` |

- **Triết lý đã chốt (quyết định 1 của thẻ): GẮN CỜ, KHÔNG CHẶN.** Ngoài vùng → gắn cờ + hỏi lý do, vẫn cho chấm. Lý do ghi thẳng trong migration: "chặn cứng là ngày mất sóng GPS cả tiệm không ai chấm được — hỏng việc thật để chống một gian lận giả định".
- **Bán kính = 300m, HARDCODE** trong `attendance_set_flag()` (SQL) và lặp lại ở `WORK_RADIUS_M` (TS, `queries.ts`). Chưa cấu hình được theo tiệm.
- **Toạ độ tiệm** lưu ở `tenants.settings.workLocation` (jsonb `{lat,lng}`), đặt bằng nút "Lấy toạ độ" (`datViTriTiem`, chỉ owner/admin qua RLS `tenants_update`). Client (`punch-panel.tsx`) dùng `navigator.geolocation.getCurrentPosition`.
- **RLS #166:** nhân viên tự chấm cho CHÍNH MÌNH (`attendance_self_insert`), quản lý+ xem cả tiệm, nhân viên chỉ xem của mình. Kỳ bảng công đã chốt thì khoá cả sửa từng lần chấm (trigger `punch_locked_period_guard`).

⇒ Việc (1) của founder **phần lớn đã có**. Phần thêm: **bán kính cấu hình được + công tắc yêu cầu selfie theo tiệm.**

### 1.2 Hạ tầng tệp/ảnh — ĐÃ CÓ, PHẢI tái dùng

- Bucket **`tenant-files`** (private, migration #2) — RLS `storage.objects` theo `(storage.foldername(name))[1] = current_tenant_id()`. Object path quy ước: `{tenant_id}/...`.
- Bảng **`public.attachments`** (migration #60): chỉ mục đa hình (`entity_type`, `entity_id`, `path`, `content_type`, `size_bytes`, `uploaded_by`, `deleted_at`). Comment ghi rõ: *"Module mới cần đính kèm file PHẢI dùng bảng này, cấm tự chế."*
- Cách upload đã có mẫu: `supabase.storage.from('tenant-files').upload(path, file, {contentType})` → đọc lại bằng `createSignedUrl(path, 3600)` (xem `app/app/inbox/actions.ts:138`, `queries.ts:181`; `settings/industry/actions.ts`). Input ảnh mẫu: `accept="image/jpeg,image/png,image/webp"`.
- ⚠️ **Bẫy quyền:** SELECT của `attachments` sau bản vá #217 cho **owner/admin/manager/viewer đọc TẤT CẢ** tệp trong tiệm (nhánh vai đứng TRƯỚC, OR với nhánh theo bảng cha). Với selfie (PII nhạy), điều này **quá rộng** — xem ngã rẽ D.

### 1.3 `login_events` (việc #64) — KHÔNG tái dùng cho chấm công

`login_events` (migration #63) lưu vị trí đọc từ **header `x-vercel-ip-*`** (thành phố/tỉnh theo IP, miễn phí), **không phải GPS**. Độ chính xác cỡ thành phố — vô dụng cho bán kính 300m. Chấm công đã có GPS thật từ client, tốt hơn. ⇒ Chỉ **học pattern** (server tự ghi metadata, không tin client), không dùng lại bảng.

### 1.4 Cổng kiểm phải qua (đã đọc script)

- **`soat-tran-dem-ngam.mjs`:** `attendance_punches` NẰM trong `BANG_LON`. Mọi `.limit(N>1)` mới trên bảng này phải phân trang `.range()` **hoặc** khai `MIEN_TRU` kèm **con số đã đo**. (Hiện có 1 miễn trừ: `actions.ts:attendance_punches:2000` — lọc 1 người/1 tháng, đo cao nhất 54 lần, trần lý thuyết 124.)
- **`soat-ghi-im-lang.mjs`:** mọi `.update()/.delete()` phải **đếm dòng** (`.select('id')` rồi kiểm `length`) — RLS lọc mất dòng thì trả `error=null` im lặng.
- **`soat-insert-thieu-tenant.mjs`:** INSERT phải tự truyền `tenant_id` (các bảng #166 khai `not null` không default).
- **`rls-smoke.mjs` / `test-rls-isolation.mjs`:** cách ly tenant + vai.
- **`soat-cot-mo-coi.mjs`** (cột mồ côi), **`soat-the-design.mjs`/`soat-dong-bo-the.mjs`** (thẻ design ↔ i18n phải đồng bộ), **`soat-the-tren-dien-thoai.mjs`**, **`man-nhan-su-luong-smoke.mjs`**, typecheck, eslint.
- **`NEXT_PUBLIC_*` = lộ ra client.** Signed URL của selfie phải **ký ở server**, không nhúng token nào vào client bundle.
- **Migration mới:** timestamp prefix **> `20260820000225`** (bản mới nhất hiện tại). Ví dụ `20260821000226_...`.

---

## 2. Bốn ngã rẽ phải chốt (nêu rõ — KHÔNG chọn ngầm)

### Ngã rẽ A — "tự nhận diện khuôn mặt" nghĩa là gì?

| | (A1) Selfie-làm-bằng-chứng | (A2) Face-matching ML thật |
|---|---|---|
| Làm gì | Chụp mặt lúc chấm, lưu ảnh gắn thời gian + vị trí; người/quản lý xem lại | Máy khớp mặt↔hồ sơ nhân viên, tự xác nhận "đúng người" |
| Chi phí | ~0đ (chụp + upload, hạ tầng đã có) | Enroll mặt mỗi người + model/dịch vụ nhận diện (tự host hoặc trả phí/ảnh), lưu **template sinh trắc** |
| Rủi ro pháp lý | Thấp — vẫn là PII, cần consent + hạn lưu | **Cao** — dữ liệu sinh trắc, phải có **đồng ý sinh trắc riêng**, quyền rút, hạn xoá chặt |
| Rủi ro sai | Không có false-reject (người xem tự phán) | False-reject chặn người thật vào ca; false-accept mở đường gian lận mới |
| Độ chắc | Chắc chắn đúng, làm ngay | Cần founder quyết + spec riêng |

**Đề xuất: A1 cho Phase 1.** "Tự nhận diện" hiểu là **bằng chứng để người/hệ thống xem lại**, không phải máy tự khớp mặt. A2 = **Phase 2 tuỳ chọn**, tách **ADR riêng** vì kéo theo luật sinh trắc. Selfie của A1 chính là dữ liệu enroll sẵn nếu sau này bật A2 → không phí công.

### Ngã rẽ B — định vị: gắn cờ hay chặn; giới hạn tin cậy

Founder nói "chỉ chấm công **hợp lệ** khi ở đúng địa điểm". Có thể hiểu = **chặn**. Nhưng sản phẩm **hiện chốt gắn-cờ-không-chặn** (có lý do ghi trong migration #166).

- **(B1) Giữ gắn cờ** (đề xuất): thêm bán kính cấu hình + (tuỳ chọn) **bắt buộc selfie khi ngoài vùng**. "Hợp lệ" = trong vùng **và** có selfie; ngoài vùng vẫn chấm được nhưng bị gắn cờ + bắt lý do + bắt selfie → quản lý thấy ngay. Nhất quán với triết lý đã chốt, không hỏng ngày mất sóng.
- **(B2) Thêm "chế độ nghiêm" theo tiệm** (công tắc): ngoài vùng thì **chặn** trừ khi có lý do. Vẫn phải chừa lối mất-sóng, nếu không sập cả tiệm. Rủi ro: mở lại đúng tranh luận #166 đã đóng.

⚠️ **Giới hạn tin cậy — nói thẳng, không hứa hão:** toạ độ GPS do **client gửi**, có thể **giả** (fake-GPS app, DevTools). Server tính khoảng cách nhưng **không xác minh được toạ độ là thật**. Vì vậy **không hứa chống-gian-lận tuyệt đối**. Selfie + timestamp server + IP (đã có ở login) chỉ **nâng chi phí gian lận**, không triệt tiêu. Ai cần chắc tuyệt đối phải dùng thiết bị chấm công tại chỗ (ngoài phạm vi web-app).

**Đề xuất: B1** (giữ gắn cờ) + bán kính cấu hình + công tắc "yêu cầu selfie". Để **B2 là công tắc tương lai**, chỉ làm nếu founder thực sự muốn chặn.

### Ngã rẽ C — "ảnh tự động gắn định vị + thời gian": metadata hay watermark?

- **(C1) Metadata bản ghi** (đề xuất): server ghi `lat/lng/punched_at` vào chính dòng `attendance_punches` **lúc nhận** (đã làm sẵn cho vị trí/thời gian). Selfie liên kết dòng đó. Hiển thị "12:03 · 15m · Toạ độ X" **dựng lúc xem** từ bản ghi. Ưu: đúng nguồn, không sửa được ảnh mà không sửa bản ghi, nhẹ.
- **(C2) Watermark chồng chữ lên ảnh** (tuỳ chọn, Phase 1.5): vẽ thời gian/toạ độ **lên pixel** ảnh. Ưu: nhìn là thấy. Nhược: nặng (xử lý ảnh server/canvas client), **không đáng tin hơn** metadata (chữ trên ảnh cũng chèn được), và làm ảnh thành "tài liệu" khó xoá theo hạn lưu.

**Đề xuất: C1.** Nếu muốn dấu nhìn-thấy thì **render overlay lúc xem** từ metadata (không nướng vào pixel) — giữ ảnh gốc sạch để tôn trọng hạn xoá.

### Ngã rẽ D (kỹ thuật) — selfie lưu ở đâu: `attachments` (hợp đồng) hay cột trên `attendance_punches` (riêng tư)?

Đây là **xung đột thật** giữa hai luật của kho:

- **(D1) Dùng `attachments`** (`entity_type='attendance_punch'`, `entity_id=punch.id`): tôn trọng hợp đồng #60 "cấm tự chế". **Nhưng** SELECT #217 cho **viewer + manager đọc mọi tệp tiệm** → selfie mọi người bị lộ cho vai chỉ-xem. Muốn dùng D1 **bắt buộc** sửa policy #217 thêm nhánh riêng cho `attendance_punch` (chỉ self + manager+, **loại viewer**) — mà nhánh vai đứng trước OR nên phải **cấu trúc lại** policy, đụng vào migration nhạy.
- **(D2) Cột trên `attendance_punches`** (`selfie_path text`, `selfie_uploaded_at`, `selfie_content_type`): quyền xem selfie **thừa hưởng RLS của lần chấm** (nhân viên thấy của mình, quản lý+ thấy tiệm, **viewer không thấy** vì `attendance_select` không cấp viewer) — **đúng phạm vi riêng tư ngay, không phải sửa gì**. Object vẫn nằm trong `tenant-files`; signed URL chỉ ký ở server sau khi đọc được dòng punch. Nhược: "bẻ" nhẹ hợp đồng "phải dùng attachments".

**Đề xuất: D2 — cột trên `attendance_punches`.** Lý do: selfie chấm công **không phải tệp người dùng tự quản** (không có UI thư viện, không xoá tay) mà là **một trường gắn chặt vào sự kiện chấm**, với phạm vi xem hẹp theo từng nhân viên. Ràng buộc riêng-tư (biometric-adjacent PII) **quan trọng hơn** sự gọn của một bảng chỉ mục chung. Nếu tech-lead giữ hợp đồng attachments thì phải chấp nhận **sửa policy #217** (D1) — nêu ra để chọn, không quyết ngầm.

---

## 3. Lược đồ CSDL đề xuất (Phase 1)

Một migration mới, prefix > `20260820000225`.

### 3.1 Cấu hình định vị theo tiệm — bảng `attendance_settings`

Thay ô jsonb `tenants.settings.workLocation` bằng bảng có kiểu + RLS rõ (di trú toạ độ cũ sang):

```
create table public.attendance_settings (
  tenant_id      uuid primary key references public.tenants(id) on delete cascade,
  lat            numeric(9,6),
  lng            numeric(9,6),
  radius_m       integer not null default 300 check (radius_m between 20 and 5000),
  require_selfie boolean not null default false,
  -- (tuỳ B2) enforce_in_range boolean not null default false,
  updated_at     timestamptz not null default now()
);
-- RLS: đọc — mọi thành viên tiệm (client cần biết bán kính + có phải chụp selfie);
--      ghi — chỉ owner/admin (giống tenants_update). Đếm dòng khi update (soat-ghi-im-lang).
```

⚠️ **Bán kính phải ở server để trigger tính cờ.** `attendance_set_flag()` **đọc `radius_m` từ `attendance_settings`** (fallback 300) thay cho hằng cứng — giữ nguyên bất biến "cờ do máy quyết". `WORK_RADIUS_M` (TS) chỉ còn để **hiển thị**, không phải nguồn sự thật.

**Ghi chú cột sinh:** KHÔNG biến `out_of_range` thành cột `GENERATED` — nó phụ thuộc `radius_m` (cấu hình ngoài, đổi được), generated column không tham chiếu bảng khác được. Giữ **trigger** như #166.

### 3.2 Selfie trên lần chấm (đề xuất D2)

Thêm cột vào `attendance_punches`:

```
alter table public.attendance_punches
  add column selfie_path         text,      -- {tenant_id}/attendance/{punch_id}.jpg trong tenant-files
  add column selfie_content_type text,
  add column selfie_captured_at  timestamptz;  -- server ghi lúc nhận, = auto-tag thời gian (ngã rẽ C1)
-- CHECK (tuỳ B1): require_selfie bật thì selfie_path bắt buộc — nhưng ép ở
--   server action là đủ và mềm hơn; nếu ép ở CSDL phải join settings trong trigger.
```

- Auto-tag **vị trí + thời gian** = `lat/lng` (đã có) + `selfie_captured_at`/`punched_at` **do server ghi**, client không đặt được.
- Quyền xem selfie thừa hưởng `attendance_select` (#166) — **không thêm policy**.
- Nếu chọn D1 (attachments) thì bỏ 3 cột trên, dùng `entity_type='attendance_punch'` + **sửa policy #217**.

---

## 4. Riêng tư / pháp lý (bắt buộc, không để sau)

- **Consent:** lần đầu bật "yêu cầu selfie", hiện thông báo nhân viên **được chụp mặt để chấm công**; ghi mốc đồng ý. Nếu sau này bật Phase 2 (face-matching) → **đồng ý sinh trắc RIÊNG**, tách bạch, có quyền rút.
- **Hạn lưu ảnh:** selfie là bằng chứng ngắn hạn. Đề xuất **job dọn tự động** (pg_cron đã bật) xoá selfie sau *ví dụ* 90 ngày **hoặc** sau khi kỳ bảng công đã chốt + N ngày. Xoá cả object trong `tenant-files` lẫn cột path. (Founder chốt số ngày.)
- **Ai xem:** chính nhân viên (của mình) + quản lý/admin/owner. **Vai viewer KHÔNG xem selfie** (đề xuất D2 cho sẵn điều này).
- **Không đẩy ra client/log:** không log `lat/lng`, không log signed URL, không nhúng vào `NEXT_PUBLIC_*`. Signed URL **ký ở server, hạn ngắn** (≤1h như mẫu inbox).
- **Tối thiểu hoá:** chỉ lưu 1 ảnh/lần chấm, nén trước khi upload (giảm dung lượng + giảm chi tiết thừa).

---

## 5. Màn hình + i18n + thẻ design

- **Nhân viên chấm công** (`app/app/team/punch-panel.tsx`, đã có): thêm bước camera. Đề xuất Phase 1 dùng `<input type="file" accept="image/*" capture="user">` (đơn giản, chạy tốt trên mobile, không vướng quyền getUserMedia). Preview live bằng `getUserMedia` = Phase 1.5. Luồng: xin quyền vị trí (đã có) + chụp → nén → gửi kèm toạ độ → server upload + insert punch.
- **Cài đặt định vị cho chủ tiệm** (mở rộng vùng nút "Lấy toạ độ" hiện có, chỉ owner/admin): đặt toạ độ (đứng tại tiệm bấm), **thanh chọn bán kính**, **công tắc "yêu cầu selfie"**.
- **Quản lý xem lại** (danh sách "tuần này" đã hiện cờ/lý do/khoảng cách): thêm **thumbnail selfie** (signed URL, chỉ manager+). Không tự tải ảnh cho vai không được xem.
- **i18n:** thêm khoá `hr.punch.*` (selfie: nhắc chụp, đang tải, thiếu ảnh) + `hr.settings.*` (bán kính, yêu cầu selfie) trong **cả** `messages/vi.json` và `messages/en.json` — cổng `soat-dong-bo-the` bắt lệch.
- **Thẻ design:** cập nhật `design-system/man-nhan-su-cham-cong.html` (thêm ô selfie + ô cấu hình bán kính/công tắc) để cổng `soat-the-design` xanh. Token màu bám thẻ hiện có (stone: viền `#e7e5e4`, chữ mờ `#78716c`, nền `#fff`, bo `10px`), amber cho cờ, emerald cho trong-vùng (đã dùng ở `punch-panel`).

---

## 6. Kế hoạch theo giai đoạn + nghiệm thu

**Phase 1 — định vị cấu hình được + selfie-bằng-chứng + auto-tag (LÀM NGAY, rõ-ràng-đúng)**
1. Migration: `attendance_settings` (di trú toạ độ từ jsonb) + trigger đọc `radius_m` + 3 cột selfie. → *Nghiệm thu:* `rls-smoke` + `test-rls-isolation` xanh; đổi bán kính đo lại `out_of_range` đúng; kỳ đã chốt vẫn khoá.
2. Server action `chamCong` nhận file selfie → nén → `storage.upload('tenant-files', {tenant}/attendance/{id}.jpg)` → insert punch kèm path; **đếm dòng** mọi update. → *Nghiệm thu:* `soat-ghi-im-lang` + `soat-insert-thieu-tenant` + `soat-tran-dem-ngam` xanh.
3. Màn cài đặt (owner/admin) bán kính + công tắc selfie; đếm dòng update settings. → *Nghiệm thu:* vai staff/viewer bấm lưu ra 0 dòng → báo "forbidden", không báo xong.
4. Punch-panel chụp + gửi; danh sách quản lý hiện thumbnail (signed URL server). → *Nghiệm thu:* bấm tay trên mobile thật; viewer KHÔNG thấy selfie.
5. Consent + job dọn ảnh theo hạn (pg_cron). → *Nghiệm thu:* chèn ảnh quá hạn giả lập, job xoá cả object + path.
6. i18n vi/en + thẻ design. → *Nghiệm thu:* `soat-the-design`/`soat-dong-bo-the` + typecheck + eslint xanh.

**Phase 1.5 — tuỳ chọn nhẹ:** getUserMedia preview live; overlay thời gian/toạ độ lúc xem (không nướng pixel). *(chỉ làm nếu founder muốn đẹp hơn)*

**Phase 2 — face-matching ML (TUỲ CHỌN, cần founder quyết trước dòng code đầu):** enroll mặt/nhân viên, khớp lúc chấm. Kéo theo **đồng ý sinh trắc**, chi phí model/dịch vụ, xử lý false-reject. **Tách ADR riêng**, không gộp đợt này.

---

## 7. Việc cần làm khi ADOPT (đừng im lặng bỏ)

- Thêm 1 dòng vào bảng `docs/adr/README.md` (Danh sách) cho ADR-0028 — *chưa làm ở đợt khảo sát này vì ràng buộc "chỉ tạo 1 file".*
- Chốt các ngã rẽ A/B/C/D + số ngày hạn lưu ảnh trước khi mở migration đầu tiên.
- Migration prefix > `20260820000225`.
