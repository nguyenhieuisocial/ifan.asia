#!/usr/bin/env node
/**
 * CỔNG: tài sản & thiết bị — hai trục tách rời, một lượt giao đang mở.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ═══════════════════════════════════════════════════════════════════
 * Cụm này có ba chỗ hỏng IM LẶNG — không chỗ nào báo lỗi khi sai:
 *
 *   ① "ĐANG GIAO" BỊ NHÉT THÀNH MỘT TRẠNG THÁI NGANG HÀNG VỚI "HỎNG". Đây là
 *      lỗi dễ tái phát nhất, vì nó nghe rất hợp lý: thêm một giá trị vào danh
 *      sách tình trạng là xong. Nhưng cái giường *đang giao cho phòng 2 mà vừa
 *      gãy chân* chỉ mang được MỘT nhãn — và ta mất đúng thông tin cần nhất.
 *      Chỗ giao PHẢI suy từ sổ bàn giao còn mở, không lưu song song trên
 *      `assets`. Hai chỗ cùng nhớ một sự thật thì sớm muộn cũng lệch nhau.
 *
 *   ② MỘT TÀI SẢN CÓ HAI LƯỢT GIAO CÙNG MỞ. Hai quản lý cùng bấm "giao máy
 *      xông" trên hai máy là chuyện thường. Nếu chỉ kiểm ở màn thì cả hai lượt
 *      đều thấy máy đang rảnh, cả hai ghi được, và sổ bàn giao nói cái máy
 *      đang nằm ở hai chỗ. Lúc mất đồ thì không ai chịu trách nhiệm — đúng thứ
 *      mà cả bảng bàn giao sinh ra để tránh.
 *
 *   ③ LƯỢT BÀN GIAO TRỎ SANG TÀI SẢN / NHÂN VIÊN CỦA TIỆM KHÁC. RLS chỉ kiểm
 *      `tenant_id` của chính dòng đang ghi, KHÔNG nhìn sang bảng cha. Không có
 *      chốt thì tiệm A ghi được lượt giao gắn vào máy của tiệm B và RLS cho qua.
 *
 * ⚠️ MỌI PHÉP GHI Ở ĐÂY ĐỀU TRONG MỘT GIAO DỊCH RỒI ROLLBACK. Cổng chạy trên
 *   ĐÚNG kho dữ liệu của khách thật.
 *
 * Chạy: node scripts/tai-san-smoke.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* CI cấp biến qua secrets */
  }
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { ca: readFileSync("supabase/supabase-ca.crt", "utf8"), rejectUnauthorized: true },
});
await c.connect();
// Cổng kiểm chạy trên ĐÚNG kho dữ liệu của khách thật — một lượt kiểm treo sẽ
// giữ khoá và chặn cả việc áp bản vá khẩn. (luật 1 của soat-ky-luat-bo-kiem)
await c.query("set lock_timeout = '10s'");
await c.query("set statement_timeout = '60s'");

let dat = 0;
let truot = 0;
const kiem = (ten, ok, ghi = "") => {
  console.log(`${ok ? "  ĐẠT  " : "  TRƯỢT"}  ${ten}${ghi ? " — " + ghi : ""}`);
  if (ok) dat += 1;
  else truot += 1;
};

await c.query("begin");
try {
  // Mỗi phép ghi thử đều bọc trong savepoint riêng. Không có savepoint thì lỗi
  // đầu tiên làm hỏng cả giao dịch, mọi phép sau trượt theo, và ta đọc sai chỗ
  // hỏng thật.
  let stt = 0;
  /** Phép ghi PHẢI bị chặn — trả về MÃ LỖI THẬT (hoặc null nếu lọt) để báo. */
  const phaiChan = async (viec) => {
    const sp = `sp${(stt += 1)}`;
    await c.query(`savepoint ${sp}`);
    try {
      await viec();
      await c.query(`rollback to savepoint ${sp}`);
      return null;
    } catch (e) {
      await c.query(`rollback to savepoint ${sp}`);
      return e.code ?? "?";
    }
  };
  /** Phép ghi PHẢI được — trả về null nếu qua, hoặc lý do thật nếu bị chặn. */
  const phaiDuoc = async (viec) => {
    const sp = `sp${(stt += 1)}`;
    await c.query(`savepoint ${sp}`);
    try {
      await viec();
      await c.query(`release savepoint ${sp}`);
      return null;
    } catch (e) {
      await c.query(`rollback to savepoint ${sp}`);
      return `${e.code ?? "?"} ${e.message}`;
    }
  };

  // ── ① Hai trục tách rời: lược đồ không có chỗ lưu "đang giao cho ai" ──
  const { rows: bang } = await c.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('assets', 'asset_assignments')`);
  kiem("hai bảng assets + asset_assignments đã có", bang.length === 2, bang.map((x) => x.table_name).join(" · "));

  // Cột kiểu `dang_giao`/`nguoi_giu` trên `assets` là cách hỏng phổ biến nhất:
  // nó khiến chỗ giao được nhớ ở HAI nơi, và nơi nào cũng có lúc đúng.
  const { rows: cotThua } = await c.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name in ('dang_giao', 'nguoi_giu', 'assigned_to')`);
  kiem(
    "assets KHÔNG có cột 'đang giao cho ai' (suy từ sổ bàn giao)",
    cotThua.length === 0,
    cotThua.length ? `có cột thừa: ${cotThua.map((x) => x.column_name).join(", ")}` : "",
  );

  const { rows: [ tiem ] } = await c.query(`select id from public.tenants where slug = 'demo-spa-huong-sen'`);
  if (!tiem) throw new Error("không thấy tiệm mẫu demo-spa-huong-sen");

  const taoTaiSan = async (tenantId, ma = null, ten = "Máy xông (đo thử)") => {
    const { rows: [ a ] } = await c.query(
      `insert into public.assets (tenant_id, ten, ma) values ($1, $2, $3) returning id`,
      [tenantId, ten, ma],
    );
    return a.id;
  };
  const themLuotGiao = ({ tenantId = tiem.id, assetId, employeeId = null, boPhan = null }) =>
    c.query(
      `insert into public.asset_assignments (tenant_id, asset_id, employee_id, bo_phan)
       values ($1, $2, $3, $4)`,
      [tenantId, assetId, employeeId, boPhan],
    );

  // ── ② Bộ tình trạng là bộ ĐÓNG, và "đang dùng" không nằm trong đó ──
  // Nếu phép này lọt thì trục vật lý đã bị pha trộn với trục bàn giao, và cả
  // thiết kế ở trên mất nghĩa — dù màn hình vẫn chạy bình thường.
  const maTinhTrang = await phaiChan(() =>
    c.query(
      `insert into public.assets (tenant_id, ten, tinh_trang) values ($1, 'Giường (đo thử)', 'dang_dung')`,
      [tiem.id],
    ),
  );
  kiem(
    "tình trạng 'dang_dung' bị CHẶN (chỉ có dung_duoc/dang_sua/hong/da_thanh_ly)",
    maTinhTrang === "23514",
    maTinhTrang === "23514" ? "23514 ràng buộc tình trạng" : `LỌT — mã trả về: ${maTinhTrang ?? "ghi được"}`,
  );

  // ── ③ Chỉ mục "một lượt giao đang mở" ──────────────────────────────
  const { rows: [ chiMuc ] } = await c.query(`
    select count(*) n from pg_indexes
    where schemaname = 'public' and indexname = 'asset_mot_luot_giao_dang_mo'`);
  kiem("có chỉ mục 'một tài sản một lượt giao đang mở'", Number(chiMuc.n) === 1);

  /**
   * ⚠️ CỔNG TỰ LO DỮ LIỆU CỦA NÓ, không dựa vào nhân sự có sẵn.
   *
   *   Bản đầu đòi tiệm demo phải sẵn có nhân viên, và ném lỗi nếu không. Chạy
   *   được suốt trên kho cũ — vì nhân sự tiệm demo ở đó được tạo bằng tay từ
   *   lâu. Ngày 22/08 tách kho riêng cho cổng kiểm thì CI đỏ ngay: **không
   *   script nào dựng lại được nhân sự tiệm demo** — bộ gieo nhân sự CỐ Ý bỏ
   *   qua tiệm này ("tiệm đó đã xong").
   *
   *   Đó là một phép kiểm dựa vào thứ chỉ tồn tại ở đúng một nơi. Cùng họ với
   *   ràng buộc sống ngoài sổ và hai bộ gieo hỏng tìm được cùng ngày: **thứ chỉ
   *   lộ ra khi có người thử dựng lại từ đầu.**
   *
   *   Toàn bộ phép đo nằm trong một giao dịch và luôn rollback, nên tự tạo một
   *   nhân viên ở đây không để lại gì.
   */
  let { rows: [ nv ] } = await c.query(
    `select id from public.employees where tenant_id = $1 order by full_name limit 1`,
    [tiem.id],
  );
  if (!nv) {
    const { rows: [ moi ] } = await c.query(
      `insert into public.employees (tenant_id, full_name) values ($1, 'Nhân viên đo thử') returning id`,
      [tiem.id],
    );
    nv = moi;
  }

  // ── ④ Giao lần hai khi lượt một chưa thu hồi ───────────────────────
  const tsGiao = await taoTaiSan(tiem.id);
  await themLuotGiao({ assetId: tsGiao, employeeId: nv.id });
  const maGiaoKep = await phaiChan(() => themLuotGiao({ assetId: tsGiao, boPhan: "Phòng 2" }));
  kiem(
    "lượt giao thứ hai khi lượt một CHƯA thu hồi bị CHẶN",
    maGiaoKep === "23505",
    maGiaoKep === "23505"
      ? "23505 chỉ mục duy nhất"
      : `LỌT — sổ bàn giao sẽ nói cái máy đang ở hai chỗ (mã: ${maGiaoKep ?? "ghi được"})`,
  );

  // ── ⑤ Thu hồi xong thì giao lại được ───────────────────────────────
  // Chốt ở ④ chỉ đúng khi nó KHÔNG khoá cứng tài sản mãi mãi. Thiếu phép này
  // thì một lỗi "giao một lần rồi thôi" sẽ đi qua cổng mà không ai thấy.
  await c.query(
    `update public.asset_assignments set thu_hoi_luc = now()
     where asset_id = $1 and thu_hoi_luc is null`,
    [tsGiao],
  );
  const loiGiaoLai = await phaiDuoc(() => themLuotGiao({ assetId: tsGiao, boPhan: "Phòng 2" }));
  kiem(
    "thu hồi xong thì giao lại ĐƯỢC",
    loiGiaoLai === null,
    loiGiaoLai ? `tài sản bị khoá vĩnh viễn — ${loiGiaoLai}` : "",
  );

  // ── ⑥ Giao cho MỘT NGƯỜI hoặc MỘT CHỖ, đúng một trong hai ──────────
  // Ghi cả hai thì lúc mất đồ có hai người cùng bị chỉ tên; không ghi cái nào
  // thì không ai chịu trách nhiệm. Cả hai kiểu đều phải chặn ở CSDL.
  const tsAiGiu = await taoTaiSan(tiem.id, null, "Tủ mát (đo thử)");
  const maCaHai = await phaiChan(() =>
    themLuotGiao({ assetId: tsAiGiu, employeeId: nv.id, boPhan: "Phòng 2" }),
  );
  kiem(
    "lượt giao ghi CẢ nhân viên lẫn bộ phận bị CHẶN",
    maCaHai === "23514",
    maCaHai === "23514" ? "23514 asset_assignments_giao_cho_ai" : `LỌT — mã: ${maCaHai ?? "ghi được"}`,
  );
  const maKhongAi = await phaiChan(() => themLuotGiao({ assetId: tsAiGiu }));
  kiem(
    "lượt giao KHÔNG ghi ai nhận cũng bị CHẶN",
    maKhongAi === "23514",
    maKhongAi === "23514" ? "23514 asset_assignments_giao_cho_ai" : `LỌT — mã: ${maKhongAi ?? "ghi được"}`,
  );

  // ── ⑦ Chốt chéo tiệm cho tài sản ───────────────────────────────────
  // Cố ý TỰ TẠO tài sản cho tiệm khác ngay trong giao dịch này (rồi rollback),
  // thay vì đi tìm dữ liệu sẵn có: bảng `assets` mới dựng, tiệm nào cũng có
  // thể đang rỗng, và một cổng "chưa đo được" thì bằng không có cổng.
  const { rows: [ tiemKhac ] } = await c.query(
    `select id from public.tenants where id <> $1 order by slug limit 1`,
    [tiem.id],
  );
  if (!tiemKhac) throw new Error("kho chỉ có một tiệm — không đo được chốt chéo tiệm");
  const tsTiemKhac = await taoTaiSan(tiemKhac.id, null, "Máy của tiệm khác (đo thử)");
  const maCheoTaiSan = await phaiChan(() =>
    themLuotGiao({ assetId: tsTiemKhac, employeeId: nv.id }),
  );
  kiem(
    "lượt giao tiệm A trỏ vào TÀI SẢN tiệm B bị CHẶN",
    maCheoTaiSan === "23514",
    maCheoTaiSan === "23514"
      ? "23514 chốt chéo tiệm"
      : `LỌT — tiệm này tham chiếu sang dữ liệu tiệm khác (mã: ${maCheoTaiSan ?? "ghi được"})`,
  );

  // ── ⑧ Chốt chéo tiệm cho nhân viên ─────────────────────────────────
  // Đường rò thứ hai, cùng lớp bệnh: tài sản đúng tiệm nhưng người nhận thì
  // không. RLS cũng không thấy đường này.
  let { rows: [ nvTiemKhac ] } = await c.query(
    `select id from public.employees where tenant_id <> $1 order by full_name limit 1`,
    [tiem.id],
  );
  if (!nvTiemKhac) {
    const { rows: [ moi ] } = await c.query(
      `insert into public.employees (tenant_id, full_name) values ($1, 'Nhân viên tiệm khác (đo thử)')
       returning id`,
      [tiemKhac.id],
    );
    nvTiemKhac = moi;
  }
  const tsChoNguoiLa = await taoTaiSan(tiem.id, null, "Máy sấy (đo thử)");
  const maCheoNhanVien = await phaiChan(() =>
    themLuotGiao({ assetId: tsChoNguoiLa, employeeId: nvTiemKhac.id }),
  );
  kiem(
    "lượt giao tiệm A trỏ vào NHÂN VIÊN tiệm B bị CHẶN",
    maCheoNhanVien === "23514",
    maCheoNhanVien === "23514"
      ? "23514 chốt chéo tiệm"
      : `LỌT — người nhận là người của tiệm khác (mã: ${maCheoNhanVien ?? "ghi được"})`,
  );

  // ── ⑨ Mã dán lên máy: duy nhất TRONG tiệm, không phải toàn hệ thống ──
  // Trùng mã trong cùng tiệm ⇒ quét mã ra hai cái máy, sổ tài sản vô dụng.
  // Nhưng chặn trùng giữa các tiệm thì tiệm sau không đặt nổi mã "TS-01" chỉ
  // vì tiệm khác đã dùng — đó là rò rỉ dữ liệu giữa các tiệm ở dạng nhẹ.
  const maDan = `TS-DO-THU-${Date.now()}`;
  await taoTaiSan(tiem.id, maDan);
  const maTrungTrongTiem = await phaiChan(() => taoTaiSan(tiem.id, maDan));
  kiem(
    "trùng mã tài sản TRONG cùng một tiệm bị CHẶN",
    maTrungTrongTiem === "23505",
    maTrungTrongTiem === "23505" ? "23505 chỉ mục duy nhất theo tiệm" : `LỌT — mã: ${maTrungTrongTiem ?? "ghi được"}`,
  );
  const loiTrungKhacTiem = await phaiDuoc(() => taoTaiSan(tiemKhac.id, maDan));
  kiem(
    "hai tiệm KHÁC nhau dùng cùng một mã thì ĐƯỢC",
    loiTrungKhacTiem === null,
    loiTrungKhacTiem ? `mã bị khoá toàn hệ thống — ${loiTrungKhacTiem}` : "",
  );
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\nTổng: ĐẠT ${dat} · TRƯỢT ${truot}`);
process.exit(truot ? 1 : 0);
