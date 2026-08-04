-- ============================================================
-- iFan.asia — Migration #12: Tiệm mẫu theo ngành (đợt 1)
-- Lý do (Benchmark 09 Cabinet Phần 2): tenant mới không được gặp màn hình
-- trống — chọn ngành lúc onboarding → nhận sẵn bộ TAG + CÂU TRẢ LỜI NHANH
-- theo ngành, "kéo về là chạy".
--
-- tenants.industry đã có từ migration #2 (text null) — ở đây chỉ THÊM
--   check constraint khóa 4 giá trị hợp lệ (null = chưa chọn).
-- quick_replies                  -- kho câu trả lời nhanh đợt 1 (title/content/sort_order).
--                                   Bản đầy đủ theo spec Inbox (canned_responses: shortcut "/",
--                                   scope cá nhân/chung, usage_count, attachments) = đợt 2.
-- seed_industry_template(text)   -- definer: set industry + seed tags & quick replies, idempotent.
--
-- LƯU Ý i18n: toàn bộ nội dung seed (tên tag, câu trả lời mẫu) là DỮ LIỆU
-- của tenant — cố ý viết tiếng Việt vì khách iFan là shop Việt. Đây KHÔNG
-- phải chuỗi giao diện; luật i18n vi+en parity chỉ áp cho UI strings.
-- Chuẩn theo migration #4/#11: policy bọc (select ...), definer set
-- search_path, revoke public trước khi grant đích danh.
-- ============================================================

-- ---------- tenants.industry: khóa bộ giá trị hợp lệ ----------

alter table public.tenants
  add constraint tenants_industry_check
  check (industry is null or industry in ('spa_clinic','education','retail_online','other'));

-- ---------- quick_replies ----------

create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  content text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, title) -- neo idempotent cho seed (on conflict do nothing)
);
create index quick_replies_tenant_idx on public.quick_replies (tenant_id, sort_order);
alter table public.quick_replies enable row level security;
-- Bảng cấu hình (mẫu tags/pipelines migration #4): đọc mọi member, ghi owner/admin/manager
create policy quick_replies_select on public.quick_replies for select
  using (tenant_id = (select public.current_tenant_id()));
create policy quick_replies_manage on public.quick_replies for all
  using (tenant_id = (select public.current_tenant_id())
         and (select public.app_role()) in ('owner','admin','manager'))
  with check (tenant_id = (select public.current_tenant_id())
              and (select public.app_role()) in ('owner','admin','manager'));
create trigger quick_replies_touch before update on public.quick_replies
  for each row execute function public.touch_updated_at();

-- ---------- seed_industry_template ----------
-- Owner/admin (nhóm được sửa tenants theo policy tenants_update) chọn ngành:
-- set tenants.industry + seed tags & quick replies theo ngành.
-- Idempotent: on conflict (tenant_id, name/title) do nothing — gọi lần 2
-- không nhân bản; tag/câu mẫu tenant đã tự sửa không bị ghi đè.

create or replace function public.seed_industry_template(p_industry text) returns void
language plpgsql
security definer set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no_tenant_context';
  end if;
  if public.app_role() not in ('owner','admin') then
    raise exception 'forbidden';
  end if;
  if p_industry not in ('spa_clinic','education','retail_online','other') then
    raise exception 'invalid_industry';
  end if;

  update public.tenants set industry = p_industry where id = v_tenant;

  -- TAGS theo ngành (dữ liệu tenant — tiếng Việt theo thiết kế, xem đầu file)
  insert into public.tags (tenant_id, name)
  select v_tenant, t
  from unnest(
    case p_industry
      when 'spa_clinic'    then array['Chăm da','Triệt lông','Gói liệu trình','Đặt lịch','Tái khám','Khách VIP','Hỏi giá','Khiếu nại']
      when 'education'     then array['Học thử','Đăng ký khóa','Phụ huynh','Học phí','Khai giảng','Tư vấn lộ trình','Bảo lưu','Học viên cũ']
      when 'retail_online' then array['Hỏi giá','Chốt đơn','Giao hàng','Đổi trả','Sỉ/CTV','Hết hàng chờ về','Khách thân thiết','Khiếu nại']
      else                      array['Khách mới','Khách quen','Hỏi giá','Cần theo dõi','Khiếu nại']
    end
  ) as t
  on conflict (tenant_id, name) do nothing;

  -- QUICK REPLIES theo ngành (giọng shop Việt tự nhiên; [ngoặc vuông] = chỗ điền tay)
  if p_industry = 'spa_clinic' then
    insert into public.quick_replies (tenant_id, title, content, sort_order) values
      (v_tenant, 'Chào khách mới', 'Dạ em chào chị! Cảm ơn chị đã nhắn tin cho spa ạ. Chị đang quan tâm dịch vụ nào để em tư vấn mình luôn nha 🌸', 1),
      (v_tenant, 'Báo lịch trống', 'Dạ bên em còn trống khung [giờ] ngày [ngày] chị nha. Chị chốt khung nào để em giữ chỗ cho mình ạ?', 2),
      (v_tenant, 'Nhắc lịch hẹn', 'Dạ em nhắc lịch hẹn của chị vào [giờ] ngày [ngày] nha. Chị đến sớm 5-10 phút để được phục vụ chu đáo ạ. Nếu bận đột xuất, chị báo em sớm giúp em nhé!', 3),
      (v_tenant, 'Báo giá dịch vụ', 'Dạ dịch vụ [tên dịch vụ] bên em giá [giá] ạ. Hiện đang có ưu đãi [ưu đãi] cho khách đặt lịch trong tuần này, chị tranh thủ nha!', 4),
      (v_tenant, 'Hỏi thăm sau buổi làm', 'Dạ sau buổi [dịch vụ] hôm trước, da mình có ổn không chị ơi? Có gì lạ chị nhắn em liền để bên em hỗ trợ kịp thời nha. Chúc chị ngày mới xinh đẹp 💕', 5),
      (v_tenant, 'Nhắc buổi tiếp theo trong gói', 'Dạ chị ơi, mình sắp tới buổi tiếp theo trong gói liệu trình rồi ạ. Chị sắp xếp ghé trong tuần này để đạt hiệu quả tốt nhất nha, em giữ lịch giúp chị nhé?', 6)
    on conflict (tenant_id, title) do nothing;
  elsif p_industry = 'education' then
    insert into public.quick_replies (tenant_id, title, content, sort_order) values
      (v_tenant, 'Chào phụ huynh / học viên', 'Dạ em chào anh/chị! Cảm ơn anh/chị đã quan tâm đến trung tâm ạ. Anh/chị đang tìm khóa học cho bé hay cho mình để em tư vấn đúng lộ trình nha?', 1),
      (v_tenant, 'Mời học thử', 'Dạ trung tâm có buổi học thử miễn phí vào [ngày, giờ] ạ. Anh/chị cho em xin tên và độ tuổi của học viên để em xếp lớp phù hợp nha.', 2),
      (v_tenant, 'Báo học phí + ưu đãi', 'Dạ học phí khóa [tên khóa] là [số tiền] cho [số buổi] buổi ạ. Đăng ký trước [ngày] được ưu đãi [ưu đãi], anh/chị tham khảo giúp em nha.', 3),
      (v_tenant, 'Thông báo khai giảng', 'Dạ lớp [tên lớp] khai giảng ngày [ngày], lịch học [thứ, giờ] ạ. Lớp còn [số] chỗ, anh/chị giữ chỗ sớm giúp em nha.', 4),
      (v_tenant, 'Nhắc đóng học phí', 'Dạ em xin phép nhắc học phí [đợt] của học viên [tên] ạ. Anh/chị sắp xếp hoàn tất trước [ngày] giúp trung tâm nha. Em cảm ơn ạ!', 5),
      (v_tenant, 'Hỏi thăm sau buổi học đầu', 'Dạ hôm nay [tên học viên] học buổi đầu, bé có thích lớp không anh/chị? Có góp ý gì anh/chị cứ nhắn em để thầy cô điều chỉnh cho phù hợp ạ.', 6)
    on conflict (tenant_id, title) do nothing;
  elsif p_industry = 'retail_online' then
    insert into public.quick_replies (tenant_id, title, content, sort_order) values
      (v_tenant, 'Chào khách + hỏi nhu cầu', 'Dạ shop chào mình ạ! Mình quan tâm mẫu nào, gửi giúp shop hình hoặc mã sản phẩm để em kiểm tra giá và tồn cho nhanh nha 💛', 1),
      (v_tenant, 'Báo giá + xin thông tin lên đơn', 'Dạ mẫu này giá [giá], còn đủ size/màu mình nha. Mình để lại tên + SĐT + địa chỉ, em lên đơn liền cho kịp chuyến hàng hôm nay ạ.', 2),
      (v_tenant, 'Xác nhận đơn', 'Dạ em xác nhận đơn của mình: [sản phẩm] - [giá], giao tới [địa chỉ]. Mình kiểm tra giúp em thông tin đúng chưa để em chuyển đóng gói luôn nha. Cảm ơn mình đã ủng hộ shop ạ!', 3),
      (v_tenant, 'Báo phí ship + thời gian giao', 'Dạ phí ship về [khu vực] là [phí], dự kiến [số] ngày nhận hàng ạ. Đơn từ [mức tiền] được freeship, mình gom thêm cho lợi ship nha 😉', 4),
      (v_tenant, 'Hướng dẫn đổi trả', 'Dạ shop hỗ trợ đổi/trả trong [số] ngày với hàng còn tag, chưa qua sử dụng ạ. Mình quay video lúc mở hàng để được hỗ trợ nhanh nhất nếu có lỗi nha.', 5),
      (v_tenant, 'Báo chính sách sỉ/CTV', 'Dạ shop có chính sách sỉ/CTV từ [số lượng] sản phẩm, chiết khấu tới [%]. Mình để lại SĐT/Zalo, em gửi bảng sỉ chi tiết cho mình tham khảo nha!', 6)
    on conflict (tenant_id, title) do nothing;
  else
    insert into public.quick_replies (tenant_id, title, content, sort_order) values
      (v_tenant, 'Chào khách', 'Dạ em chào anh/chị! Cảm ơn anh/chị đã nhắn tin ạ. Anh/chị cần hỗ trợ gì để em tư vấn mình luôn nha?', 1),
      (v_tenant, 'Báo giá', 'Dạ [sản phẩm/dịch vụ] bên em giá [giá] ạ. Anh/chị cần thêm thông tin gì em gửi chi tiết luôn nha.', 2),
      (v_tenant, 'Xin phép phản hồi sau', 'Dạ em đã nhận thông tin của anh/chị. Em kiểm tra và phản hồi mình trong ít phút nữa, anh/chị chờ em xíu nha. Em cảm ơn ạ!', 3),
      (v_tenant, 'Cảm ơn sau mua', 'Dạ cảm ơn anh/chị đã tin tưởng ủng hộ ạ. Trong quá trình sử dụng có gì cần hỗ trợ, anh/chị cứ nhắn em bất cứ lúc nào nha!', 4),
      (v_tenant, 'Xin đánh giá', 'Dạ nếu hài lòng với dịch vụ, anh/chị cho bên em xin một đánh giá 5 sao để ủng hộ tinh thần đội ngũ nha. Em cảm ơn anh/chị nhiều ạ!', 5)
    on conflict (tenant_id, title) do nothing;
  end if;
end $$;

revoke execute on function public.seed_industry_template(text) from public, anon;
grant execute on function public.seed_industry_template(text) to authenticated;
