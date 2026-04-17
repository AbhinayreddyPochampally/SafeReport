/**
 * SafeReport — Create HO demo user
 *
 * Creates the Supabase Auth user `ho@safereport.demo` with password `SafeDemo2026!`
 * and links a matching row in `ho_users`, then backfills actor_user_id on
 * seeded ho_actions.
 *
 * Run AFTER schema.sql + seed.sql.
 *
 *   tsx scripts/create-ho-user.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const EMAIL = 'ho@safereport.demo';
const PASSWORD = 'SafeDemo2026!';
const DISPLAY_NAME = 'Demo HO Officer';

async function main() {
  console.log(`Creating Supabase Auth user: ${EMAIL}`);

  // 1. Create auth user (email_confirm = true → no email verification needed)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  let userId: string | undefined = created?.user?.id;

  if (createErr) {
    // Already exists — fetch it
    if (createErr.message?.includes('already') || createErr.message?.includes('registered')) {
      console.log('User already exists. Looking up...');
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (listErr) throw listErr;
      const existing = list.users.find(u => u.email === EMAIL);
      if (!existing) throw new Error(`Could not find existing user ${EMAIL}`);
      userId = existing.id;
    } else {
      throw createErr;
    }
  }

  if (!userId) throw new Error('No user id after creation');
  console.log(`✓ Auth user id: ${userId}`);

  // 2. Upsert into ho_users profile table
  const { error: profileErr } = await admin
    .from('ho_users')
    .upsert({ user_id: userId, display_name: DISPLAY_NAME, role: 'safety_officer' });
  if (profileErr) throw profileErr;
  console.log(`✓ Linked ho_users profile`);

  // 3. Backfill seeded ho_actions that have null actor
  const { error: backfillErr, count } = await admin
    .from('ho_actions')
    .update({ actor_user_id: userId })
    .is('actor_user_id', null)
    .select('id', { count: 'exact', head: true });
  if (backfillErr) throw backfillErr;
  console.log(`✓ Backfilled ${count ?? 0} ho_actions with actor_user_id`);

  console.log('\nDone. Sign in at /ho/login with:');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
