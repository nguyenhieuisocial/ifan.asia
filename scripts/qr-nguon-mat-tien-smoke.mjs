#!/usr/bin/env node
/**
 * Cổng chống tái phát cho QR GẮN NGUỒN Ở FORM MẶT TIỀN (migration #201).
 *
 * VÌ SAO CÓ BỘ NÀY. Mã QR có HAI cửa đi về: hộp chat trên web của tiệm (đã nối
 * ở #57) và form nhận khách trên trang mặt tiền `/t/[slug]` (nối ở #201). Cửa
 * thứ hai hụt suốt từ 05/08: mọi khách mới bị gán cứng nguồn 'Form/Landing',
 * nên tiệm dán mã ngoài cửa rồi KHÔNG BAO GIỜ biết mã nào mang khách tới. Đây
 * là kiểu hỏng im lặng tệ nhất — báo cáo quy kết nguồn vẫn ra số, chỉ là số sai,
 * và chủ tiệm dùng số ấy để quyết chi tiền quảng cáo.
 *
 * Bốn luật phải đứng vững, kiểm CẢ HAI CHIỀU:
 *   1. Mã hợp lệ + đúng tiệm + đang bật ⇒ khách MỚI nhận `source_id` của mã.
 *   2. Mã lạ / sai tiệm / đã tắt / sai khuôn ⇒ VẪN NHẬN KHÁCH, nguồn về
 *      'Form/Landing', TUYỆT ĐỐI không ném lỗi. Khách đang muốn để lại số —
 *      chặn họ vì một tham số hỏng trên URL là đổi lead thật lấy phép kiểm
 *      hình thức.
 *   3. Khách CŨ ⇒ `source_id` KHÔNG bị đụng. Nguồn là dấu của LẦN ĐẦU khách
 *      tới; mã quét sau không được ghi đè.
 *   4. ĐỐI CHỨNG: không truyền mã ⇒ hành vi y hệt bản #94.
 *
 * Chạy trong MỘT transaction rồi ROLLBACK — không để lại dữ liệu trên CSDL thật.
 * Cần env SUPABASE_DB_URL (CI truyền vào, xem .github/workflows/ci.yml).
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GOC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// Chạy TAY thì đọc .env.local; trên CI biến đã có sẵn và file đó KHÔNG tồn tại.
if (!process.env.SUPABASE_DB_URL) {
  try {
    for (const d of readFileSync(path.join(GOC, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = d.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* không có .env.local là bình thường trên CI */
  }
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (env hoặc .env.local).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    ca: readFileSync(path.join(GOC, "supabase", "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  },
});
await c.connect();

let n = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  n++;
  console.log(`${cond ? "  PASS" : "  FAIL"} ${n} ${name}${cond ? "" : " — " + detail}`);
  if (!cond) fail++;
};
// Lỗi trong transaction làm ABORT cả transaction ⇒ mỗi phép thử một savepoint.
let spN = 0;
const thu = async (fn) => {
  const sp = `sp_thu_${++spN}`;
  await c.query(`savepoint ${sp}`);
  try {
    const v = await fn();
    await c.query(`release savepoint ${sp}`);
    return { ok: true, v };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    return { ok: false, e: e.message };
  }
};

// ── THÁO CHỐT: chứng minh ca kiểm KHÔNG RỖNG ────────────────────────────────
// Một ca xanh không phân biệt được với một ca không kiểm gì cả. Hai chốt của
// #201 phải THẤY ĐỎ được theo yêu cầu:
//
//   THAO_CHOT=bo-gan-nguon  node scripts/qr-nguon-mat-tien-smoke.mjs
//   THAO_CHOT=cheo-tiem     node scripts/qr-nguon-mat-tien-smoke.mjs
//
// Đọc CHÍNH file migration, thay đúng một chỗ, nạp đè hàm bên trong transaction
// của bộ kiểm (rồi rollback ⇒ CSDL thật không đổi). KHÔNG chép thân hàm vào
// đây — chép là có ngày bản chép và bản thật lệch nhau, và khi đó phép tháo
// chốt chứng minh nhầm một hàm không ai chạy. Khuôn lấy từ voucher-diem-smoke.
const THAO_CHOT = process.env.THAO_CHOT ?? "";
const NGUON = {
  file: "20260819000201_qr_gan_nguon_form_mat_tien.sql",
  moc: "create function public.storefront_submit_lead(",
  ket: "$$;",
};
const CHOT = {
  // Bỏ HẲN khối tra mã ⇒ khách mới lại rơi về 'Form/Landing' như trước #201.
  // Ca 1 phải ĐỎ.
  "bo-gan-nguon": {
    thay: [[
      `if v_qr ~ '^[a-z0-9]{8,16}$' then
      select q.source_id into v_source
        from public.qr_codes q
        where q.code = v_qr
          and q.tenant_id = v_tenant.id  -- mã tiệm khác KHÔNG gắn chéo
          and q.is_active;`,
      `if false then`,
    ]],
  },
  // Bỏ chốt "mã phải thuộc ĐÚNG tiệm của trang này". Ca "sai tiệm" phải ĐỎ. Đây
  // là lỗ CHÉO TIỆM — cùng họ với 4 lỗ đã sống nhiều tuần ở #196.
  //
  // ⚠️ ĐIỀU PHÉP THÁO CHỐT NÀY DẠY RA, ghi lại vì nó đổi cách đọc ca kiểm: gắn
  // nguồn chéo tiệm được canh bằng HAI lớp ĐỘC LẬP — ① điều kiện `q.tenant_id =
  // v_tenant.id` ngay trong câu tra mã · ② một chốt sẵn có ở CSDL cấm
  // `contacts.source_id` trỏ sang tiệm khác. Tháo ① thì dữ liệu KHÔNG lệch tiệm
  // (② đỡ), nhưng hàm NÉM LỖI ⇒ khách bị chặn không để lại được số. Nói cách
  // khác ① không phải để chống rò rỉ mà để giữ đúng luật "mềm": mã sai tiệm phải
  // bị bỏ qua trong im lặng, chứ không được biến thành lỗi đập vào mặt khách.
  // Vì thế ca "sai tiệm" soi CẢ HAI vế — vẫn nhận khách, VÀ nguồn về Form/Landing.
  "cheo-tiem": {
    thay: [["and q.tenant_id = v_tenant.id  -- mã tiệm khác KHÔNG gắn chéo\n", ""]],
  },
};
function sqlDaThaoChot() {
  const cap = CHOT[THAO_CHOT];
  if (!cap) {
    console.error(`THAO_CHOT không hợp lệ: ${THAO_CHOT}. Chọn: ${Object.keys(CHOT).join(" · ")}`);
    process.exit(2);
  }
  const { file, moc, ket } = { ...NGUON, ...cap };
  const nguon = readFileSync(path.join(GOC, "supabase", "migrations", file), "utf8");
  const dau = nguon.indexOf(moc);
  const cuoi = nguon.indexOf(ket, dau);
  if (dau < 0 || cuoi < 0) {
    console.error(`Không tìm thấy thân hàm "${moc}" trong ${file}.`);
    process.exit(2);
  }
  // `create` → `create or replace`: hàm đã tồn tại sẵn trong CSDL, bản tháo chốt
  // chỉ nạp đè trong transaction rồi rollback.
  let ham = nguon.slice(dau, cuoi + ket.length).replace(moc, "create or replace " + moc.slice("create ".length));
  for (const [tim, doi] of cap.thay) {
    if (!ham.includes(tim)) {
      console.error(`Không tìm thấy chỗ cần tháo:\n${tim}`);
      process.exit(2);
    }
    ham = ham.replace(tim, () => doi);
  }
  return ham;
}

await c.query("begin");
await c.query("set local lock_timeout = '10s'");
try {
  if (THAO_CHOT) {
    await c.query(sqlDaThaoChot());
    console.log(`⚠️ ĐANG THÁO CHỐT "${THAO_CHOT}" — bộ kiểm PHẢI ĐỎ ở ca tương ứng.`);
  }

  const stamp = Date.now();
  // ── Dựng HAI tiệm: A là tiệm của trang mặt tiền, B để thử mã chéo tiệm ──
  const mkTiem = async (nhan) => {
    const {
      rows: [t],
    } = await c.query(`insert into public.tenants (name, slug) values ($1,$2) returning id, slug`, [
      `Tiem QR ${nhan}`,
      `qr-nguon-${nhan}-${stamp}`,
    ]);
    const nguonCua = {};
    for (const ten of ["Form/Landing", "Zalo", "Tờ rơi tháng 8"]) {
      const {
        rows: [s],
      } = await c.query(
        `insert into public.lead_sources (tenant_id, name, is_system) values ($1,$2,$3) returning id`,
        [t.id, ten, ten === "Form/Landing"],
      );
      nguonCua[ten] = s.id;
    }
    await c.query(
      `insert into public.tenant_storefront (tenant_id, storefront_enabled, lead_form_enabled)
         values ($1, true, true)`,
      [t.id],
    );
    return { ...t, nguon: nguonCua };
  };
  const A = await mkTiem("a");
  const B = await mkTiem("b");

  const mkMa = async (tiem, code, nguonId, batTat = true) => {
    await c.query(
      `insert into public.qr_codes (tenant_id, code, name, source_id, target_url, is_active)
         values ($1,$2,$3,$4,'https://ifan.asia/t/x',$5)`,
      [tiem.id, code, `Ma ${code}`, nguonId, batTat],
    );
    return code;
  };
  const MA_A = await mkMa(A, "toroi8a" + String(stamp).slice(-4), A.nguon["Tờ rơi tháng 8"]);
  const MA_A_TAT = await mkMa(A, "datat88a" + String(stamp).slice(-4), A.nguon["Zalo"], false);
  const MA_B = await mkMa(B, "toroi8b" + String(stamp).slice(-4), B.nguon["Tờ rơi tháng 8"]);

  /**
   * Gửi form như khách vãng lai. IP riêng cho MỖI lượt: chốt chống lụt là
   * 5 lượt/giờ trên mỗi (tiệm, IP) — dùng chung một IP thì ca thứ sáu đỏ vì lý
   * do không liên quan gì tới mã QR.
   */
  let luot = 0;
  const guiForm = (slug, ten, sdt, ma) => {
    luot += 1;
    return thu(async () =>
      (
        await c.query(
          `select public.storefront_submit_lead($1,$2,$3,$4,$5,'{}'::jsonb,$6) as v`,
          [slug, `tok-${stamp}-${luot}`, `ip-${stamp}-${luot}`, ten, sdt, ma],
        )
      ).rows[0].v,
    );
  };
  const nguonCua = async (tiem, e164) =>
    (
      await c.query(`select source_id from public.contacts where tenant_id=$1 and phone_e164=$2`, [
        tiem.id,
        e164,
      ])
    ).rows[0]?.source_id ?? null;

  // ── CA 1 — mã hợp lệ ⇒ khách MỚI nhận nguồn của mã ─────────────────────────
  {
    const r = await guiForm(A.slug, "Chi Lan", "0912000001", MA_A);
    check("mã QR hợp lệ ⇒ nhận khách bình thường", r.ok && r.v?.duplicate === false, JSON.stringify(r));
    const src = await nguonCua(A, "+84912000001");
    check(
      "mã QR hợp lệ ⇒ khách MỚI mang đúng nguồn CỦA MÃ (không phải Form/Landing)",
      src === A.nguon["Tờ rơi tháng 8"],
      `source=${src} · mong đợi=${A.nguon["Tờ rơi tháng 8"]} · Form/Landing=${A.nguon["Form/Landing"]}`,
    );
  }

  // ── CA 2 — mã hỏng ở BỐN kiểu ⇒ vẫn nhận khách, nguồn về Form/Landing ─────
  // Cả bốn đi chung một vòng vì kết cục phải Y HỆT nhau: đó chính là điều cần
  // chứng minh (không kiểu hỏng nào được đối xử khác, và không kiểu nào ném lỗi).
  {
    const caHong = [
      ["mã KHÔNG CÓ THẬT", "khongcoma123", "0912000002"],
      ["mã của TIỆM KHÁC", MA_B, "0912000003"],
      ["mã ĐÃ TẮT", MA_A_TAT, "0912000004"],
      ["mã SAI KHUÔN (ký tự lạ + quá ngắn)", "aB!$#", "0912000005"],
    ];
    for (const [nhan, ma, sdt] of caHong) {
      const r = await guiForm(A.slug, `Khach ${nhan}`, sdt, ma);
      check(`${nhan} ⇒ VẪN NHẬN KHÁCH, không ném lỗi`, r.ok && r.v?.duplicate === false, JSON.stringify(r));
      const src = await nguonCua(A, "+84" + sdt.slice(1));
      check(
        `${nhan} ⇒ nguồn về 'Form/Landing' (bỏ qua im lặng)`,
        src === A.nguon["Form/Landing"],
        `source=${src} · Form/Landing=${A.nguon["Form/Landing"]}`,
      );
    }
  }

  // ── CA 3 — khách CŨ ⇒ source_id KHÔNG bị đổi ──────────────────────────────
  {
    await c.query(
      `insert into public.contacts (tenant_id, full_name, phone, phone_e164, source_id)
         values ($1,'Chi Cu','0912000006','+84912000006',$2)`,
      [A.id, A.nguon["Zalo"]],
    );
    const r = await guiForm(A.slug, "Chi Cu", "0912000006", MA_A);
    check(
      "khách CŨ + mã hợp lệ ⇒ vẫn nhận, và hàm biết là khách cũ",
      r.ok && r.v?.duplicate === false && r.v?.matched_existing === true,
      JSON.stringify(r),
    );
    const src = await nguonCua(A, "+84912000006");
    check(
      "khách CŨ + mã hợp lệ ⇒ nguồn CŨ không bị mã ghi đè",
      src === A.nguon["Zalo"],
      `source=${src} · phải giữ Zalo=${A.nguon["Zalo"]}`,
    );

    // Khách cũ CHƯA có nguồn: #201 CỐ Ý không điền hộ. Ghi rõ ở đây vì đây là
    // chỗ #201 khác `qr_attribute_contact` (hàm cũ điền khi `source_id is null`)
    // — nhánh khách cũ của #94 được giữ NGUYÊN VĂN, mã chỉ tác động lên khách
    // MỚI. Ca này để cố định quyết định đó, không phải để khoe hành vi.
    await c.query(
      `insert into public.contacts (tenant_id, full_name, phone, phone_e164, source_id)
         values ($1,'Chi Trong','0912000007','+84912000007',null)`,
      [A.id],
    );
    await guiForm(A.slug, "Chi Trong", "0912000007", MA_A);
    const srcTrong = await nguonCua(A, "+84912000007");
    check(
      "khách CŨ chưa có nguồn ⇒ #201 KHÔNG điền hộ (nhánh khách cũ giữ nguyên văn #94)",
      srcTrong === null,
      `source=${srcTrong} · mong đợi null`,
    );
  }

  // ── CA 4 — ĐỐI CHỨNG: không truyền mã ⇒ y hệt bản #94 ─────────────────────
  {
    const rNull = await guiForm(A.slug, "Khach Khong Ma", "0912000008", null);
    check("ĐỐI CHỨNG (p_qr_code = null) ⇒ nhận khách bình thường", rNull.ok && rNull.v?.duplicate === false, JSON.stringify(rNull));
    check(
      "ĐỐI CHỨNG (p_qr_code = null) ⇒ nguồn 'Form/Landing' y hệt trước #201",
      (await nguonCua(A, "+84912000008")) === A.nguon["Form/Landing"],
    );

    // Gọi 6 THAM SỐ — đúng cách tầng web bản cũ và rls-smoke đang gọi. Đổi chữ
    // ký hàm mà làm gãy lời gọi cũ là hỏng thẳng form nhận khách đang chạy.
    const r6 = await thu(async () =>
      (
        await c.query(
          `select public.storefront_submit_lead($1,$2,$3,'Khach 6 Tham So','0912000009','{}'::jsonb) as v`,
          [A.slug, `tok-${stamp}-cu`, `ip-${stamp}-cu`],
        )
      ).rows[0].v,
    );
    check("ĐỐI CHỨNG: lời gọi 6 THAM SỐ (bản cũ) vẫn chạy", r6.ok && r6.v?.duplicate === false, JSON.stringify(r6));
    check(
      "ĐỐI CHỨNG: lời gọi 6 tham số ⇒ nguồn 'Form/Landing' y hệt trước",
      (await nguonCua(A, "+84912000009")) === A.nguon["Form/Landing"],
    );
  }

  console.log(
    fail === 0
      ? `[qr-nguon-mat-tien-smoke] ${n}/${n} PASS — mã QR gắn đúng nguồn ở form mặt tiền, mã hỏng không chặn khách, không để lại dữ liệu.`
      : `[qr-nguon-mat-tien-smoke] HỎNG ${fail}/${n} ca — xem dòng FAIL ở trên.`,
  );
} finally {
  await c.query("rollback");
  await c.end();
}
process.exit(fail === 0 ? 0 : 1);
