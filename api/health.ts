import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cleanEnvVar = (val: string | undefined) => (val || '').replace(/[^\x00-\x7F]/g, "").trim();
  
  const geminiKey = cleanEnvVar(process.env.GEMINI_API_KEY || process.env.API_KEY);
  
  // 1. Testar Gemini
  let geminiStatus = 'not_tested';
  let geminiError = '';
  if (geminiKey) {
    const tests = [
      { v: 'v1beta', m: 'gemini-1.5-flash' },
      { v: 'v1', m: 'gemini-1.5-flash' },
      { v: 'v1beta', m: 'gemini-1.5-flash-8b' }
    ];
    
    // Teste 0: Listar modelos (para ver se a chave tem acesso à API)
    try {
      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      if (listResp.ok) {
        const listData = await listResp.json();
        geminiError = `ListModels OK (${listData.models?.length || 0} models found). `;
      } else {
        geminiError = `ListModels failed: ${listResp.status} | `;
      }
    } catch (e: any) { geminiError = `ListModels Crash: ${e.message} | `; }

    for (const t of tests) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/${t.v}/models/${t.m}:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] })
        });
        if (resp.ok) {
          geminiStatus = 'ok';
          geminiError += `Success with ${t.m} on ${t.v}`;
          break;
        } else {
          try {
            const errBody = await resp.json();
            geminiError += `| ${t.m}@${t.v}: ${resp.status} (${errBody.error?.message || 'No msg'}) `;
          } catch {
            geminiError += `| ${t.m}@${t.v}: ${resp.status} `;
          }
        }
      } catch (e: any) { geminiError += `| ${t.m}@${t.v}: ${e.message} `; }
    }
    if (geminiStatus !== 'ok') geminiStatus = 'error';
  }

  // 2. Testar SQL (SQLite via better-sqlite3)
  let dbStatus = 'not_tested';
  let dbError = '';
  try {
    const { getDatabase } = await import('./_lib/db.js');
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) as c FROM items').get() as any;
    dbStatus = 'ok';
    dbError = `items: ${row.c}`;
  } catch (e: any) { dbStatus = 'error'; dbError = e.message; }

  const getFragment = (val: string) => val ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}` : 'none';

  res.status(200).json({
    status: "ok",
    diagnostics: {
      gemini: { 
        status: geminiStatus, 
        fragment: getFragment(geminiKey),
        error: geminiError || undefined 
      },
      sql: { 
        status: dbStatus, 
        error: dbError || undefined 
      }
    },
    version: "4.0-sql-v1"
  });
}
