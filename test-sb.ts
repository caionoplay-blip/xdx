import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log("Signing in...");
  const { data: authData, error: authErr } = await supabase.auth.signInAnonymously();
  if (authErr) return console.error("Auth Err:", authErr);
  const uid = authData.user.id;
  console.log("User:", uid);

  console.log("Upserting profile...");
  const { error: profErr } = await supabase.from('profiles').upsert({ id: uid, full_name: "Test User", phone: "123" });
  console.log("Prof Err:", profErr || "Success");

  console.log("Inserting item...");
  const { data: insData, error: insErr } = await supabase.from('items').insert({
    name: "Test item", price: 10, quantity: 1, user_id: uid
  }).select();
  console.log("Ins Err:", insErr || "Success", insData);

  if (!insErr && insData?.length > 0) {
    const isSessionVal = insData[0].is_session;
    console.log("is_session default is:", isSessionVal);

    console.log("Updating item...");
    const { data: upData, error: upErr } = await supabase.from('items')
      .update({ is_session: false, trip_id: "test-trip" })
      .eq('user_id', uid)
      .eq('is_session', true).select();
    console.log("Up Err:", upErr || "Success", upData);
  }
}
test();
