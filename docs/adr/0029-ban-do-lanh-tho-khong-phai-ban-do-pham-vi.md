# ADR-0029 — Bản đồ nghiệp vụ 17 vùng là bản đồ LÃNH THỔ, không phải bản đồ PHẠM VI sản phẩm

**Trạng thái:** ĐÃ QUYẾT (22/08/2026).
**Vì sao viết:** một tài liệu mới **suýt âm thầm lật một điều kiện đã chốt trong ADR-0011**, mà
không ai phải ra quyết định nào và không có gì báo.
**Bám vào:** ADR-0011 (giá & trang công khai) · ADR-0012 (bản đồ 9 nhóm / mảng) ·
`lib/feature-registry.ts` · `04 Kế hoạch/Bản đồ nghiệp vụ chuẩn (22-08).md` trong vault.

> ### ⚠️ ĐÍNH CHÍNH NGAY TRONG NGÀY — founder 22/08
>
> Nguyên văn: *"luật kinh doanh đã chốt có thể sai, chỉ để tham khảo nhé."*
>
> ⇒ **Điều kiện mở bán của ADR-0011 và các con số giá kèm theo nay là THAM KHẢO, không phải
> luật cứng.** ADR này **không** nâng chúng lên thành luật; nó chỉ chặn một chuyện khác:
> **một tài liệu mới âm thầm đổi nghĩa của một điều kiện cũ mà không ai quyết.**
>
> Phần còn giá trị nguyên vẹn, bất kể luật kinh doanh đúng hay sai:
> - **Mục 2** — hai bản đồ đo hai thứ khác nhau, không thay nhau được.
> - **Mục 3** — cấm dùng 164 domain làm mẫu số cho phần trăm hoàn thành hay lời hứa với khách.
> - **Mục 6** — bài học về tham chiếu mềm.

---

## 1. Chuyện gì đã suýt xảy ra

Ngày 22/08 founder chốt một kiến trúc nghiệp vụ mới và một bản đồ được dựng theo nó:
**17 Business Area · 164 canonical domain · 325 mục**, nằm ở vault
`04 Kế hoạch/Bản đồ nghiệp vụ chuẩn (22-08).md`.

**ADR-0011 khoá điều kiện mở bán bằng câu này:**

> *"Khi đủ **TOÀN BỘ mảng của bản đồ năng lực đang có hiệu lực** (đo bằng lệnh trên
> `lib/feature-registry.ts`) ⇒ mở bán."*

Và ADR-0011 **cố ý viết cho nó tự đúng khi bản đồ đổi**:

> *"Khi bản đồ năng lực đổi số mảng lần nữa (ADR-0012 đã đổi 20 → 28 một lần) ⇒ **KHÔNG phải
> sửa điều kiện này** — nó cố ý viết theo 'toàn bộ' chứ không theo con số."*

Hôm nay `docs/adr/README.md` khai **31/31 mảng đã chạy thật ⇒ điều kiện đã đủ**.

⚠️ **Nếu "bản đồ năng lực đang có hiệu lực" được đọc là bản đồ 17 vùng, điều kiện tự lùi từ
"đã đủ" về "còn ~133 domain chưa có gì".** Không ai ra quyết định. Không có gì báo. Đúng cơ chế
tự-điều-chỉnh mà ADR-0011 thiết kế — chỉ là nó tự điều chỉnh sang một bản đồ **không phải bản
đồ nó đang nói tới**.

**Bản đồ mới có cố gỡ ngòi**, ở mục 10a: *"Bản đồ 164 Domain là cái hộp, không phải lời hứa sẽ
xây hết 164 cái."* **Câu đó không đủ hiệu lực.** README của thư mục này ghi thẳng: *"Đây là
tầng LUẬT — mâu thuẫn với kế hoạch thì ADR mới nhất thắng."* Một câu trong file kế hoạch không
đè được một điều kiện trong ADR.

---

## 2. Quyết định

**Cho mọi mục đích của ADR-0011 — kể cả và đặc biệt là điều kiện mở bán — cụm từ "bản đồ năng
lực đang có hiệu lực" vẫn là ADR-0012, đo bằng `lib/feature-registry.ts`. Không đổi.**

Hai bản đồ, hai câu hỏi khác nhau, **không thay thế nhau**:

| | ADR-0012 + `feature-registry.ts` | Bản đồ 17 vùng (vault) |
|---|---|---|
| Trả lời câu | **Sản phẩm iFan gồm những gì, và cái nào xong?** | **Một thứ nghiệp vụ mới thì nằm ở đâu?** |
| Đơn vị | mảng sản phẩm — thứ khách bấm vào | canonical business domain — thứ nghiệp vụ tồn tại ngoài đời |
| Số lượng | 9 nhóm / **31 mảng** | 17 vùng / **164 domain** |
| Máy đọc được | ✅ có, là mã nguồn | ❌ chưa, là tài liệu |
| Dùng cho | xếp đợt · nhãn trạng thái · trang `/tinh-nang` · **điều kiện mở bán** | chống bệnh "không biết nhét vào trục nào" |
| Ví von | **bản đồ NGÔI NHÀ đang xây** | **bản đồ THÀNH PHỐ** — biết có bao nhiêu khu đất, không hứa xây hết |

**Nói ngắn:** một bản đồ đo *phạm vi sản phẩm*, một bản đồ đo *lãnh thổ nghiệp vụ*. Trộn hai
thứ thì hoặc iFan không bao giờ đủ điều kiện bán, hoặc bản đồ lãnh thổ bị bóp cho vừa phạm vi
sản phẩm — cả hai đều hỏng.

---

## 3. Cấm

- ⛔ **Cấm dùng số 164 domain (hay bất kỳ con số nào của bản đồ 17 vùng) làm mẫu số cho bất kỳ
  điều kiện, phần trăm hoàn thành, hay lời hứa nào với khách.** Mẫu số của "xong bao nhiêu
  phần trăm" là `feature-registry.ts`.
- ⛔ **Cấm đưa số 164 / 17 / 325 lên bất kỳ trang công khai nào.** Đây là mở rộng của lệnh cấm
  đã có ở ADR-0011 §5 và ADR-0012 §8 (*"không in số tổng '130 tính năng' ở đâu cả"*) — lý do y
  hệt: con số đếm được không phải lời hứa dùng được.
- ⛔ **Cấm hạ một mảng đang `ready` trong `feature-registry.ts` xuống chỉ vì bản đồ 17 vùng cho
  thấy domain tương ứng còn thiếu module.** Hai thang đo khác nhau.
- ⛔ **Cấm chép danh sách domain từ vault vào mã nguồn** cho tới khi domain đó lên `Canonical`
  theo RULE 96 — tức có **Hợp đồng Domain đủ 17 mục** và **mã định danh bất biến**. Hôm nay
  **cả 164 domain đều đang ở `Proposed`**.

---

## 4. Bản đồ 17 vùng ĐƯỢC dùng vào việc gì

Không phải viết ADR này để vô hiệu hoá nó. Nó có bốn việc thật:

1. **Chỗ đặt cho thứ mới.** Bệnh cũ: thêm "quản lý nhà cung cấp" thì không biết nhét vào trục
   nào trong 8 trục. Nay mọi thứ có đúng một chỗ.
2. **Phát hiện engine bị nhân bản.** Nó bắt được **Case Engine đã có 6 bản rời rạc** — thứ
   không luật nào trong kho bắt được, vì cả RULE 62 lẫn bất biến 13 đều không gọi tên nó.
3. **Chỉ ra vùng trống có thật.** Bốn vùng chưa có gì (chiến lược · an toàn & bền vững · an
   ninh mạng · hành chính) — biết trước còn hơn phát hiện lúc khách hỏi.
4. **Làm móng cho 22 sổ đăng ký của RULE 91** — cây domain là sổ số 2 trong 22.

---

## 5. Điều kiện xem lại

Mở lại ADR này khi **một trong hai** điều sau xảy ra:

- **`feature-registry.ts` được thay bằng thứ khác** làm nguồn phạm vi sản phẩm. Lúc đó phải sửa
  cả ADR-0011 lẫn ADR này trong cùng một lượt, không sửa lẻ.
- **Bản đồ 17 vùng trở thành máy đọc được** (có sổ đăng ký domain trong mã, có hợp đồng, có mã
  định danh bất biến) **và** có ≥1 domain lên `Canonical`. Lúc đó hai bản đồ bắt đầu chồng lấn
  thật, và phải quyết cái nào nuôi cái nào — chứ không để chúng tự đá nhau.

---

## 6. Bài học ghi lại

**Một điều kiện viết theo kiểu "tự đúng khi tài liệu đổi" là con dao hai lưỡi.** ADR-0011 cố ý
viết *"toàn bộ mảng của bản đồ đang có hiệu lực"* thay vì một con số, để khỏi phải sửa mỗi lần
bản đồ đổi — và đó là quyết định đúng, nó đã sống qua một lần đổi 20 → 28 → 31 mà không cần
đụng tới.

Nhưng nó gắn số phận của một điều kiện **kinh doanh** vào cụm từ **"bản đồ đang có hiệu lực"** —
và cụm từ đó không hề nói *bản đồ NÀO*. Ngày ai đó dựng một bản đồ thứ hai, tử tế hơn, chi tiết
hơn, do chính founder chốt, thì điều kiện kia lặng lẽ đổi nghĩa.

> **Luật rút ra: một điều kiện tham chiếu tới "tài liệu X đang có hiệu lực" thì phải ghi rõ X là
> file nào.** Tham chiếu mềm tiết kiệm được công sửa, nhưng đổi lại nó **im lặng khi nghĩa của
> nó đổi** — và im lặng là thứ đắt nhất trong kho này.
