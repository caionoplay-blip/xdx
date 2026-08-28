import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log("Signing in...");
  const { data: authData, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr) return console.log("Auth Error:", authErr);
  const uid = authData.user.id;
  console.log("UID:", uid);

  // 1. Profile UPSERT
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: uid,
    full_name: "Test Name",
    phone: "99999"
  });
  console.log("Profile Upsert Error?", profErr ? profErr : "success");

  // 2. Insert item
  const { data: insData, error: insErr } = await supabase.from('items').insert({
    name: "Apple Test",
    price: 1.0,
    quantity: 1,
    user_id: uid,
    store_name: "Test Store"
  }).select('*');
  console.log("Item Insert Error?", insErr ? insErr : "success");
  if (!insData || insData.length === 0) return console.log("No data returned on insert. is is_session default true?");
  console.log("Inserted item is_session:", insData[0].is_session);

  // 3. Update to finalize
  const { data: upData, error: upErr } = await supabase.from('items')
    .update({ is_session: false, trip_id: "test-xyz" })
    .eq('user_id', uid)
    .eq('is_session', true)
    .select('*');
  
  console.log("Item Update Error?", upErr ? upErr : "success");
  console.log("Updated data:", upData);

  // 4. Fetch recent
  const { data: fetchD } = await supabase.from('items')
    .select('*')
    .eq('user_id', uid)
    .eq('is_session', false);
  console.log("Fetched items count:", fetchD?.length);

  // cleanup
  await supabase.from('items').delete().eq('user_id', uid);
}

test();
