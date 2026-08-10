import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Chính sách bảo mật — iFan.asia",
  description:
    "iFan.asia thu thập dữ liệu gì, lưu ở đâu, ai xem được và bạn lấy lại hoặc xoá bằng cách nào.",
};

const UPDATED = "06/08/2026";

/**
 * Chính sách bảo mật.
 *
 * BẮT BUỘC PHẢI CÓ, không phải cho đẹp: Zalo Official Account và Meta Business
 * đều đòi một đường dẫn chính sách bảo mật công khai mới xét duyệt ứng dụng —
 * thiếu là hồ sơ bị trả về.
 *
 * Mọi câu ở đây phải ĐÚNG với hệ thống thật. Viết hay mà sai sự thật thì tệ hơn
 * là không viết.
 */
const VI: LegalSection[] = [
  {
    heading: "iFan giữ dữ liệu gì của bạn",
    body: [
      "Dữ liệu tài khoản: email, tên hiển thị, mật khẩu đã mã hoá một chiều (iFan không đọc được mật khẩu của bạn, kể cả khi muốn).",
      "Dữ liệu tiệm bạn tự nhập hoặc phát sinh khi dùng: hồ sơ khách hàng, số điện thoại, tin nhắn hội thoại, ghi chú nội bộ, cơ hội bán hàng, số tiền giao dịch, hoạt động của nhân viên.",
      "Dữ liệu kỹ thuật tối thiểu để hệ thống chạy: thời điểm đăng nhập, địa chỉ IP dùng cho chốt chặn chống dò mật khẩu, nhật ký lỗi.",
      "iFan KHÔNG đặt mã theo dõi quảng cáo của bên thứ ba trong khu làm việc, và KHÔNG bán dữ liệu của bạn cho bất kỳ ai.",
    ],
  },
  {
    heading: "Dữ liệu nằm ở đâu",
    body: [
      "Cơ sở dữ liệu đặt tại Singapore (Supabase, hạ tầng Amazon Web Services vùng ap-southeast-1). Máy chủ chạy web đặt cùng vùng Singapore (Vercel).",
      "Toàn bộ đường truyền được mã hoá. Kết nối tới cơ sở dữ liệu dùng chứng chỉ ghim sẵn, không chấp nhận chứng chỉ lạ.",
    ],
  },
  {
    heading: "Ai xem được dữ liệu tiệm bạn",
    body: [
      "Chỉ những người bạn mời vào tiệm, và chỉ trong phạm vi vai trò bạn cấp. Nhân viên thường không xem được dữ liệu ngoài phần việc của họ.",
      "Cách ly giữa các tiệm được thực thi ở tầng cơ sở dữ liệu, không phải ở tầng giao diện — nghĩa là kể cả khi phần mềm có lỗi hiển thị thì tiệm A vẫn không đọc được dữ liệu tiệm B. Chốt này được kiểm tự động 178 phép mỗi lần cập nhật phần mềm.",
      "Đội ngũ iFan chỉ truy cập dữ liệu tiệm bạn khi bạn yêu cầu hỗ trợ và mô tả một sự cố cụ thể.",
    ],
  },
  {
    heading: "Dịch vụ bên thứ ba iFan có gửi dữ liệu sang",
    body: [
      "Zalo: khi bạn nối Zalo Official Account, tin nhắn đi và về giữa tiệm bạn và khách được truyền qua hệ thống Zalo theo đúng quy định của Zalo.",
      "Supabase và Vercel: lưu trữ và vận hành, như mục trên.",
      "Trợ lý AI: chỉ hoạt động khi bạn bật. Khi bật, nội dung hội thoại bạn chọn được gửi tới nhà cung cấp mô hình để sinh gợi ý. Nội dung này KHÔNG được dùng để huấn luyện mô hình.",
      "Ngoài các mục trên, iFan không gửi dữ liệu của bạn đi đâu khác.",
    ],
  },
  {
    heading: "Bạn có quyền gì",
    body: [
      "Tải về: xuất danh sách khách hàng ra Excel bất cứ lúc nào, ngay trong phần mềm.",
      "Sửa và xoá: sửa hoặc xoá từng hồ sơ trong phần mềm.",
      "Xoá toàn bộ: yêu cầu xoá sạch tiệm và mọi dữ liệu bên trong. iFan xử lý trong vòng 30 ngày và xác nhận lại bằng email.",
      "Rút lại: tắt trợ lý AI hoặc ngắt kênh Zalo bất cứ lúc nào, không cần lý do.",
    ],
  },
  {
    heading: "Giữ dữ liệu bao lâu",
    body: [
      "Trong suốt thời gian tiệm bạn còn hoạt động trên iFan.",
      "Sau khi bạn ngừng dùng: dữ liệu được giữ thêm 90 ngày để bạn đổi ý hoặc lấy lại, sau đó xoá.",
      "Nhật ký kỹ thuật (đăng nhập, lỗi) giữ tối đa 90 ngày.",
    ],
  },
  {
    heading: "Khi có sự cố rò rỉ",
    body: [
      "Nếu xảy ra rò rỉ dữ liệu ảnh hưởng tới tiệm bạn, iFan báo cho bạn bằng email trong vòng 72 giờ kể từ khi phát hiện, kèm phạm vi ảnh hưởng và việc bạn nên làm.",
    ],
  },
];

const EN: LegalSection[] = [
  {
    heading: "What iFan holds",
    body: [
      "Account data: email, display name, and a one-way hash of your password (iFan cannot read your password, even if it wanted to).",
      "Your shop's data, whether you enter it or it arises from use: customer records, phone numbers, conversation messages, internal notes, deals, transaction amounts, staff activity.",
      "The minimum technical data needed to run: sign-in times, IP addresses used for brute-force protection, error logs.",
      "iFan places no third-party advertising trackers inside the workspace, and never sells your data.",
    ],
  },
  {
    heading: "Where the data lives",
    body: [
      "The database is in Singapore (Supabase, on Amazon Web Services ap-southeast-1). The web servers run in the same Singapore region (Vercel).",
      "All traffic is encrypted. Database connections use a pinned certificate and reject unknown ones.",
    ],
  },
  {
    heading: "Who can see your shop's data",
    body: [
      "Only the people you invite, and only within the role you grant. Regular staff cannot see data outside their own work.",
      "Isolation between shops is enforced in the database itself, not in the interface — so even a display bug in the software cannot let shop A read shop B's data. This is verified by 178 automated checks on every software update.",
      "The iFan team accesses your data only when you ask for support and describe a specific problem.",
    ],
  },
  {
    heading: "Third parties data may reach",
    body: [
      "Zalo: once you connect a Zalo Official Account, messages between your shop and your customers travel through Zalo's systems under Zalo's own rules.",
      "Supabase and Vercel: storage and hosting, as above.",
      "AI assistant: off until you turn it on. When on, the conversation content you select is sent to the model provider to generate suggestions. That content is NOT used to train models.",
      "Beyond the above, iFan sends your data nowhere else.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Export: download your customer list to Excel at any time, from inside the product.",
      "Correct and delete: edit or delete any record in the product.",
      "Delete everything: request full deletion of your shop and all data inside it. iFan completes this within 30 days and confirms by email.",
      "Withdraw: turn off the AI assistant or disconnect Zalo at any time, no reason needed.",
    ],
  },
  {
    heading: "How long data is kept",
    body: [
      "For as long as your shop is active on iFan.",
      "After you stop: data is kept for a further 90 days in case you change your mind or need it back, then deleted.",
      "Technical logs (sign-ins, errors) are kept for at most 90 days.",
    ],
  },
  {
    heading: "If there is a breach",
    body: [
      "If a data breach affects your shop, iFan notifies you by email within 72 hours of discovery, with the scope of the impact and what you should do.",
    ],
  },
];

export default async function PrivacyPage() {
  const locale = await getLocale();
  const vi = locale === "vi";
  return (
    <LegalPage
      title={vi ? "Chính sách bảo mật" : "Privacy Policy"}
      updatedAt={UPDATED}
      intro={
        vi
          ? "Dữ liệu khách hàng là tài sản của tiệm bạn, không phải của iFan. Trang này nói thẳng iFan giữ gì, để ở đâu, ai xem được và bạn lấy lại bằng cách nào — không có chữ nhỏ."
          : "Your customer data belongs to your shop, not to iFan. This page states plainly what iFan holds, where it sits, who can see it, and how you get it back — no fine print."
      }
      sections={vi ? VI : EN}
    />
  );
}
