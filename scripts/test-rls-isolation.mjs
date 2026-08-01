#!/usr/bin/env node
/**
 * Test cách ly RLS — quality gate bắt buộc chạy mỗi deploy (Quy hoạch mục C, gate chung #1).
 * Kịch bản: tạo 2 tenant + 2 user, user tenant A truy vấn dữ liệu tenant B => PHẢI ra 0 dòng.
 *
 * Cần env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (chỉ trong CI secret / local).
 * Khi thiếu env (repo mới clone, CI chưa cấu hình): SKIP với cảnh báo — "chạy rỗng cũng phải xanh".
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.warn('[rls-test] SKIP: thiếu SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(0);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const failures = [];

async function makeUserWithTenant(label) {
  const email = `rls-test-${label}-${stamp}@test.ifan.asia`;
  const password = `Rls!${stamp}${label}`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) throw new Error(`createUser ${label}: ${cErr.message}`);
  const userId = created.user.id;

  // Tạo tenant + membership bằng service role (bỏ qua RLS như backend thật)
  const { data: tenant, error: tErr } = await admin.from('tenants')
    .insert({ name: `RLS Test ${label} ${stamp}`, slug: `rls-${label}-${stamp}` })
    .select().single();
  if (tErr) throw new Error(`insert tenant ${label}: ${tErr.message}`);
  const { error: mErr } = await admin.from('tenant_members')
    .insert({ tenant_id: tenant.id, user_id: userId, role: 'owner' });
  if (mErr) throw new Error(`insert member ${label}: ${mErr.message}`);

  // Đăng nhập bằng client thường (JWT hook phải nhét tenant_id vào app_metadata)
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`signIn ${label}: ${sErr.message}`);
  return { client, tenant, userId };
}

function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS ${name}`);
  else { console.error(`  FAIL ${name} ${detail}`); failures.push(name); }
}

try {
  console.log('[rls-test] Dựng 2 tenant + 2 user...');
  const A = await makeUserWithTenant('a');
  const B = await makeUserWithTenant('b');

  console.log('[rls-test] Kiểm tra cách ly:');
  // 1. A đọc bảng tenants: chỉ thấy tenant của mình
  const { data: tA } = await A.client.from('tenants').select('id');
  check('A chỉ thấy đúng 1 tenant của mình', tA?.length === 1 && tA[0].id === A.tenant.id, JSON.stringify(tA));

  // 2. A truy vấn thẳng tenant B theo id => 0 dòng
  const { data: cross } = await A.client.from('tenants').select('id').eq('id', B.tenant.id);
  check('A đọc tenant B = 0 dòng', (cross ?? []).length === 0, JSON.stringify(cross));

  // 3. A đọc members của B => 0 dòng
  const { data: mCross } = await A.client.from('tenant_members').select('user_id').eq('tenant_id', B.tenant.id);
  check('A đọc members tenant B = 0 dòng', (mCross ?? []).length === 0, JSON.stringify(mCross));

  // 4. A không sửa được tenant B
  const { data: uCross } = await A.client.from('tenants').update({ name: 'hacked' }).eq('id', B.tenant.id).select();
  check('A sửa tenant B = 0 dòng bị sửa', (uCross ?? []).length === 0, JSON.stringify(uCross));

  // 5. A đọc domain_events của B => 0 dòng
  const { data: eCross } = await A.client.from('domain_events').select('id').eq('tenant_id', B.tenant.id);
  check('A đọc events tenant B = 0 dòng', (eCross ?? []).length === 0, JSON.stringify(eCross));

  // Dọn dẹp
  await admin.from('tenants').delete().in('id', [A.tenant.id, B.tenant.id]);
  await admin.auth.admin.deleteUser(A.userId);
  await admin.auth.admin.deleteUser(B.userId);

  if (failures.length) {
    console.error(`[rls-test] THẤT BẠI: ${failures.length} kiểm tra fail — CẤM DEPLOY.`);
    process.exit(1);
  }
  console.log('[rls-test] TẤT CẢ PASS — cách ly tenant an toàn.');
} catch (e) {
  console.error('[rls-test] LỖI:', e.message);
  process.exit(1);
}
