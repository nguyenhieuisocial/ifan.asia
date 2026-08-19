# ADR-0025 — Quyền chạy hàm CSDL: phải ĐO, không được đọc câu lệnh rồi tin

**Ngày:** 19/08/2026 · **Trạng thái:** đã chốt, đã vá (migration #191, #196), cổng đã cắm (`soat-cua-cong-khai.mjs` LUẬT C)

---

## 1. Vì sao phải quyết, thay vì cứ làm

Trong **một ngày**, cùng một cơ chế cắn **hai lần**:

- **Sáng** — migration #190 thu quyền 6 hàm chạy nền. Đọc câu lệnh thì thấy đã thu. Cổng kiểm mới viết xong lại báo đỏ: `rls_auto_enable` **vẫn gọi được**. Phải viết thêm #191 để dứt.
- **Tối** — soát 123 hàm quyền-cao, ra **4 lỗ chéo tiệm THẬT**, đã chứng minh bằng cách làm thật rồi hoàn tác:

| Hàm | Người tiệm A làm được gì với tiệm B |
|---|---|
| `loyalty_config_get` | vai **Chỉ xem** đọc nguyên cấu hình điểm thưởng của B |
| `loyalty_settle_return` | **xoá 500 điểm** của khách tiệm B, và đọc được ví điểm của khách đó |
| `commission_sinh_cho_hop_dong` | hoa hồng **1.000.000đ** của nhân viên tiệm B về **0đ** |
| `commission_sinh_cho_don` | ghi thêm khoản hoa hồng vào tiệm B |

Cả 4 đều là **hàm nội bộ**: 0 lời gọi trong `app/`, `lib/`, `components/`. Quyền đó **chưa bao giờ được ai cố ý mở** — nó tự rơi vào.

Đường khai thác không phải lý thuyết: `my_tenants()` trả mã của **mọi tiệm mình TỪNG thuộc**, nên **nhân viên đã bị cho nghỉ** vẫn nhớ mã tiệm cũ, và 4 hàm trên không kiểm tư cách thành viên lấy một lần.

---

## 2. Nguyên nhân gốc — một hiểu nhầm, không phải bốn lần sơ ý

Postgres cấp `EXECUTE` cho `PUBLIC` trên **mọi hàm mới**. Supabase cho `anon`, `authenticated`, `service_role` thuộc `PUBLIC`. Khuôn mà cả kho đang viết:

```sql
revoke execute on function public.<ham>(...) from public, anon;
```

Câu này thu quyền của vai `public` và `anon` — **nhưng `authenticated` đã được cấp RIÊNG nên GIỮ NGUYÊN quyền**.

> **Đọc câu lệnh thì tưởng đã khoá. Đo mới ra sự thật.**

Rà lại toàn bộ migration: **51 tên hàm** viết theo đúng lối đó mà không cấp lại. Đo thật từng cái: 40 đã khoá sẵn · 9 là hàm trigger (Postgres tự chặn gọi thẳng, đã thử để chứng minh chứ không suy luận) · 1 không phải `security definer` · 1 đã xoá khỏi CSDL.

---

## 3. Quyết định

**① Nguồn sự thật về quyền là phép đo, không phải câu lệnh.**
Mọi khẳng định "hàm này đã khoá" phải đến từ `has_function_privilege(<vai>, oid, 'execute')`. Đọc `revoke` trong file migration **không được tính là bằng chứng**.

**② Cổng CI canh cả hai lớp.** `scripts/soat-cua-cong-khai.mjs`:
- **LUẬT A/B** — lớp `anon` (đã có từ trước)
- **LUẬT C** — lớp `authenticated`: mọi hàm `security definer` trong `public` mà `authenticated` gọi được **phải** có một chốt — lọc tiệm (`current_tenant_id()`), hoặc đòi khoá riêng, hoặc chốt theo `auth.uid()`/`is_platform_admin()` dùng để **kiểm**, hoặc khai trước kèm **lý do đọc hiểu được**.

Bằng chứng cổng không rỗng: thả 5 hàm của #196 vào tầm quét ⇒ **đỏ đúng cả 5, không đỏ oan cái nào**.

**③ Phép đo phải bọc mốc quay lui riêng cho từng phép kiểm.**
Lần đo đầu tiên của chính tôi **vô nghĩa**: một lệnh hỏng làm mọi lệnh sau đó trong cùng giao dịch báo "bị chặn" một cách giả tạo — trông y hệt "đã khoá thành công". Không có `savepoint` riêng thì không phân biệt được **bị chặn** với **giao dịch đã chết**.

**④ Mọi phép đo quyền phải có ĐỐI CHỨNG.**
Phải chứng minh kèm rằng một hàm ứng dụng **thật sự dùng** vẫn gọi được. Không có đối chứng thì "permission denied" có thể chỉ vì đã khoá sạch mọi thứ.

---

## 4. Các cách đã LOẠI

- **Tin vào câu `revoke` + soát tay khi review.** Đã thử suốt nhiều tuần — kết quả là 4 lỗ sống sót và một lần vá hụt (#190 → #191). Cách này đã được chứng minh là **không hoạt động ở đúng kho này**.
- **Cấm hẳn `security definer`.** Bất khả thi: kho dựa vào definer cho mọi hàm cần vượt RLS có kiểm soát.
- **Chỉ dựa vào RLS, không cần chốt trong hàm.** Sai: definer **bỏ qua** RLS — đó là lý do nó tồn tại.

---

## 5. Cổng này KHÔNG chứng minh được gì

Ghi ra để người sau không tin quá tay:

1. **Lọc một nửa.** Hàm lọc tiệm ở câu này nhưng để trống ở câu khác thì cổng vẫn xanh. Đúng hình dạng của `loyalty_settle_return` — **may là hàm đó không có chốt nào cả nên mới bị bắt**. Đây là chỗ mù nguy hiểm nhất.
2. **Không nhìn xuyên lời gọi hàm.** A gọi B đã kiểm đủ thì cổng vẫn coi A là trống ⇒ phải khai trước.
3. **Phân biệt "kiểm" với "ghi giá trị" bằng từ khoá gần nhất**, không phải phân tích cú pháp. Viết lắt léo là lừa được.

> Nói gọn: cổng bắt được kiểu **"quên hẳn"**, KHÔNG bắt được **"chốt sai"**.

Lớp "chốt sai" đã cắn ngay trong ngày ở chỗ khác — mã giảm giá và trả-bằng-điểm **đang chặn được phiếu hoàn nhưng chỉ nhờ tình cờ** (xem #200). Không cổng nào bắt được loại đó; chỉ có đo từng cửa.

---

## 6. Điều kiện xem lại

Quyết định này cần xem lại nếu:

- Supabase đổi cách cấp quyền mặc định cho vai mới ⇒ khuôn `revoke` và cả LUẬT C phải soát lại.
- Có nhu cầu cho `authenticated` gọi thẳng một hàm nội bộ ⇒ **không nới cổng**, mà bọc một hàm mới có chốt tiệm rồi cấp quyền cho hàm bọc đó.
- Ai đó dựng được phép phân tích cú pháp thật cho plpgsql ⇒ chỗ mù (1) và (3) ở mục 5 có thể bịt được.
