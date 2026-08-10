import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng — iFan.asia",
  description:
    "Điều kiện dùng iFan.asia: tài khoản, thanh toán, dùng thử, dữ liệu thuộc về ai, và khi nào dịch vụ bị ngừng.",
};

const UPDATED = "06/08/2026";

const VI: LegalSection[] = [
  {
    heading: "iFan cung cấp gì",
    body: [
      "iFan.asia là phần mềm quản lý bán hàng chạy trên nền web: gom tin nhắn khách về một hộp thư chung, lưu hồ sơ khách, theo dõi cơ hội bán hàng và báo cáo doanh thu.",
      "Dịch vụ được cung cấp ở trạng thái đang vận hành thực tế. iFan cố gắng chạy liên tục nhưng không cam kết không bao giờ gián đoạn.",
    ],
  },
  {
    heading: "Tài khoản của bạn",
    body: [
      "Bạn chịu trách nhiệm giữ mật khẩu và mọi hoạt động xảy ra dưới tài khoản của mình. Nghi bị lộ thì đổi mật khẩu ngay trong phần Cài đặt → Tài khoản; thao tác đó tự đăng xuất mọi thiết bị khác.",
      "Bạn chịu trách nhiệm về những người bạn mời vào tiệm và quyền bạn cấp cho họ.",
      "Một tài khoản mở một tiệm. Cần thêm chi nhánh thì liên hệ iFan.",
    ],
  },
  {
    heading: "Dùng thử và thanh toán",
    body: [
      "Dùng thử 30 ngày, đủ tính năng, không cần thẻ. Hết hạn dùng thử mà chưa trả tiền thì tài khoản chuyển sang chế độ chỉ đọc — dữ liệu vẫn còn, bạn vẫn xuất ra được.",
      "Giá theo bảng giá công khai tại thời điểm bạn đăng ký. iFan báo trước ít nhất 30 ngày bằng email nếu đổi giá.",
      "Nâng gói giữa kỳ tính tiền theo số ngày còn lại. Hạ gói có hiệu lực từ kỳ tiếp theo.",
    ],
  },
  {
    heading: "Dữ liệu thuộc về ai",
    body: [
      "Dữ liệu khách hàng, tin nhắn, giao dịch bạn đưa vào iFan là TÀI SẢN CỦA BẠN. iFan chỉ giữ hộ và xử lý theo yêu cầu của bạn.",
      "Bạn lấy dữ liệu ra bất cứ lúc nào bằng chức năng xuất Excel có sẵn, không phải xin phép, không phải trả thêm tiền.",
      "iFan không dùng dữ liệu tiệm bạn để bán quảng cáo, không chia sẻ cho tiệm khác, không bán cho bên thứ ba.",
    ],
  },
  {
    heading: "Bạn không được làm gì",
    body: [
      "Gửi tin rác, tin lừa đảo, hoặc nội dung vi phạm pháp luật Việt Nam qua các kênh nối với iFan.",
      "Nhập dữ liệu cá nhân của người khác khi không có cơ sở hợp pháp để thu thập và sử dụng.",
      "Dò tìm lỗ hổng, phá hoại hệ thống, hoặc cố truy cập dữ liệu của tiệm khác. Nếu bạn phát hiện lỗ hổng, hãy báo cho iFan — iFan cảm ơn và không kiện.",
      "Bán lại hoặc cho thuê lại quyền dùng iFan khi chưa có thoả thuận riêng.",
    ],
  },
  {
    heading: "Ngừng dịch vụ",
    body: [
      "Bạn ngừng dùng lúc nào cũng được. Dữ liệu được giữ thêm 90 ngày để bạn lấy lại, sau đó xoá.",
      "iFan có thể ngừng phục vụ tài khoản vi phạm mục trên, sau khi đã báo trước và cho thời hạn khắc phục — trừ trường hợp vi phạm nghiêm trọng gây hại cho người dùng khác thì ngừng ngay.",
    ],
  },
  {
    heading: "Giới hạn trách nhiệm",
    body: [
      "iFan chịu trách nhiệm trong phạm vi số tiền bạn đã trả cho iFan trong 12 tháng gần nhất.",
      "iFan không chịu trách nhiệm cho thiệt hại gián tiếp như mất cơ hội kinh doanh hay mất lợi nhuận dự kiến.",
      "Các kênh bên ngoài (Zalo, Facebook, nhà mạng) do bên thứ ba vận hành. iFan không chịu trách nhiệm khi các kênh này gián đoạn hoặc thay đổi chính sách.",
    ],
  },
  {
    heading: "Luật áp dụng",
    body: [
      "Điều khoản này theo pháp luật Việt Nam. Tranh chấp ưu tiên giải quyết bằng thương lượng; không xong thì đưa ra toà án có thẩm quyền tại Việt Nam.",
      "Nếu iFan sửa điều khoản, iFan báo trước bằng email ít nhất 30 ngày. Bạn tiếp tục dùng sau ngày hiệu lực nghĩa là bạn đồng ý.",
    ],
  },
];

const EN: LegalSection[] = [
  {
    heading: "What iFan provides",
    body: [
      "iFan.asia is web-based business software: it gathers customer messages into one shared inbox, keeps customer records, tracks deals and reports revenue.",
      "The service is provided as it actually runs. iFan works to stay up continuously but does not promise it will never be interrupted.",
    ],
  },
  {
    heading: "Your account",
    body: [
      "You are responsible for keeping your password safe and for everything done under your account. If you suspect it has leaked, change it in Settings → Account; doing so signs you out on every other device.",
      "You are responsible for the people you invite into your shop and the permissions you grant them.",
      "One account opens one shop. Contact iFan if you need additional branches.",
    ],
  },
  {
    heading: "Trial and payment",
    body: [
      "A 30-day trial, full features, no card required. If the trial ends without payment the account becomes read-only — your data stays and you can still export it.",
      "Pricing follows the public price list at the time you sign up. iFan gives at least 30 days' email notice before any price change.",
      "Upgrades mid-cycle are charged pro-rata for the remaining days. Downgrades take effect from the next cycle.",
    ],
  },
  {
    heading: "Who owns the data",
    body: [
      "The customer records, messages and transactions you put into iFan are YOUR PROPERTY. iFan only holds and processes them on your instruction.",
      "You can take your data out at any time using the built-in Excel export — no permission needed, no extra charge.",
      "iFan does not use your shop's data to sell advertising, does not share it with other shops, and does not sell it to third parties.",
    ],
  },
  {
    heading: "What you must not do",
    body: [
      "Send spam, fraudulent messages, or content that breaks Vietnamese law through channels connected to iFan.",
      "Enter other people's personal data without a lawful basis to collect and use it.",
      "Probe for vulnerabilities, disrupt the system, or attempt to reach another shop's data. If you find a vulnerability, tell iFan — you will be thanked, not sued.",
      "Resell or sublicense access to iFan without a separate agreement.",
    ],
  },
  {
    heading: "Ending the service",
    body: [
      "You may stop at any time. Data is kept for a further 90 days so you can retrieve it, then deleted.",
      "iFan may stop serving an account that breaches the section above, after notice and a chance to fix it — except for severe breaches that harm other users, which are stopped immediately.",
    ],
  },
  {
    heading: "Limits of liability",
    body: [
      "iFan's liability is limited to the amount you have paid iFan in the preceding 12 months.",
      "iFan is not liable for indirect losses such as lost business opportunities or expected profits.",
      "External channels (Zalo, Facebook, carriers) are run by third parties. iFan is not responsible when they go down or change their policies.",
    ],
  },
  {
    heading: "Governing law",
    body: [
      "These terms are governed by Vietnamese law. Disputes are settled by negotiation first; failing that, by a competent court in Vietnam.",
      "If iFan changes these terms, it gives at least 30 days' email notice. Continuing to use the service after the effective date means you accept them.",
    ],
  },
];

export default async function TermsPage() {
  const locale = await getLocale();
  const vi = locale === "vi";
  return (
    <LegalPage
      title={vi ? "Điều khoản sử dụng" : "Terms of Service"}
      updatedAt={UPDATED}
      intro={
        vi
          ? "Đây là thoả thuận giữa tiệm bạn và iFan.asia. Viết bằng tiếng người, không cài chữ nhỏ. Có chỗ nào không rõ thì hỏi trước khi trả tiền."
          : "This is the agreement between your shop and iFan.asia. Written in plain language, with no fine print. If anything is unclear, ask before you pay."
      }
      sections={vi ? VI : EN}
    />
  );
}
