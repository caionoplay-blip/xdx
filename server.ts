import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Helper para B2B: Inferir prateleira/categoria (Consistente com o Dashboard)
function inferCategory(name: string): string {
  const n = (name || '').toLowerCase();
  if (['leite','queijo','iogurte','manteiga','requeijão','nata'].some(k => n.includes(k))) return 'Laticínios';
  if (['carne','frango','peixe','linguiça','bacon','presunto','bife'].some(k => n.includes(k))) return 'Carnes';
  if (['suco','refrigerante','água','cerveja','vinho','energético'].some(k => n.includes(k))) return 'Bebidas';
  if (['detergente','sabão','amaciante','desinfetante','alvejante','limpador'].some(k => n.includes(k))) return 'Limpeza';
  if (['shampoo','creme','desodorante','sabonete','pasta','escova'].some(k => n.includes(k))) return 'Higiene';
  if (['arroz','feijão','macarrão','farinha','aveia','milho'].some(k => n.includes(k))) return 'Grãos/Massas';
  if (['biscoito','bolacha','chocolate','doce','sorvete'].some(k => n.includes(k))) return 'Snacks/Doces';
  if (['pão','bolo','torta','croissant','bisnaguinha'].some(k => n.includes(k))) return 'Padaria';
  return 'Outros';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API de Escaneamento (Servidor) - Mantido para proteger a chave Gemini
  app.post("/api/scan", async (req, res) => {
    try {
      const { image } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

      if (!apiKey) {
        console.error("API Key missing on server");
        return res.status(500).json({ error: "Chave de API não configurada no servidor." });
      }

    const imageData = image.includes('base64,') ? image.split('base64,')[1] : image;
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = (supabaseUrl && serviceKey) ? createClient(supabaseUrl, serviceKey) : null;

    async function saveToDatabase(name: string, price: number, engine: string): Promise<string | null> {
      if (!supabaseAdmin) return null;
      try {
        const { data, error } = await supabaseAdmin.from('items').insert([{
          name,
          price,
          quantity: 1,
          store_name: "Local Dev (DaaS)",
          is_session: true,
          is_abandoned: true, // Começa como abandonado (Inteligência B2B)
          shelf_category: inferCategory(name),
          raw_text: `Local-Engine: ${engine}`
        }]).select('id').single();
        
        if (error || !data) {
          console.error("[DB-LOCAL-ERROR]", error?.message || "Sem retorno de ID");
          return null;
        }
        
        console.log(`[DB-LOCAL] Scan salvo (${data.id}): ${name}`);
        return data.id;
      } catch (e) {
        console.error("[DB-LOCAL-CRASH]", e);
        return null;
      }
    }

    async function tryDirectScan(model: string) {
      console.log(`[DIRETO-LOCAL] Chamando: ${model}`);
      const cleanKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').replace(/[^\x00-\x7F]/g, "").trim();
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `Você é um especialista em leitura de etiquetas. 
              Siga este processo (Cadeia de Pensamento):
              1. Analise toda a imagem em busca de preços e nomes.
              2. Se a letra estiver difícil (manuscrito), procure padrões numéricos.
              3. Extraia NOME e PREÇO.
              4. Retorne APENAS JSON: {"name": "string", "price": "string"}` },
              { inlineData: { mimeType: "image/jpeg", data: imageData } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(JSON.stringify(data.error || data));
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      return text;
    }

    async function tryOpenAIScan() {
      if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI Key missing locally");
      console.log(`[OPENAI-LOCAL] Ativando Motor de Emergência Direto...`);
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Você é um especialista em leitura de etiquetas. Extraia NOME e PREÇO. Retorne APENAS o JSON: {\"name\": \"string\", \"price\": \"string\"}." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageData}` } }
            ]
          }],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data.error || data));
      return data.choices[0].message.content || "{}";
    }

    let lastInsertedId: string | null = null;
    let engineUsed = "";
    
    // SEQUÊNCIA DE RESGATE LOCAL (QUADRI-MOTOR)
    try {
      resultText = await tryDirectScan("gemini-1.5-flash");
      engineUsed = "1.5-FLASH";
      
      if (resultText.includes('"price": "0"') || resultText.includes('"price": ""')) {
        throw new Error("RETRY_FOR_QUALITY");
      }
      
      const parsed = JSON.parse(resultText.match(/\{[\s\S]*\}/)?.[0] || "{}");
      lastInsertedId = await saveToDatabase(parsed.name, parseFloat(String(parsed.price).replace(/[^\d.]/g, "")) || 0, engineUsed);
    } catch (e1: any) {
      console.warn(`[FALLBACK-LOCAL] Falhou motor principal, tentando 8B...`);
      try {
        resultText = await tryDirectScan("gemini-1.5-flash-8b");
        engineUsed = "1.5-FLASH-8B";
        const parsed = JSON.parse(resultText.match(/\{[\s\S]*\}/)?.[0] || "{}");
        lastInsertedId = await saveToDatabase(parsed.name, parseFloat(String(parsed.price).replace(/[^\d.]/g, "")) || 0, engineUsed);
      } catch (e2: any) {
        console.warn(`[FALLBACK-LOCAL] 8B falhou, indo para 2.0...`);
        try {
          resultText = await tryDirectScan("gemini-2.0-flash");
          engineUsed = "2.0-FLASH";
          const parsed = JSON.parse(resultText.match(/\{[\s\S]*\}/)?.[0] || "{}");
          lastInsertedId = await saveToDatabase(parsed.name, parseFloat(String(parsed.price).replace(/[^\d.]/g, "")) || 0, engineUsed);
        } catch (e3: any) {
          console.warn(`[FALLBACK-LOCAL] Gemini Exaurido, acionando OPENAI (Failsafe)...`);
          try {
            resultText = await tryOpenAIScan();
            engineUsed = "GPT-4O-MINI";
            const parsed = JSON.parse(resultText);
            lastInsertedId = await saveToDatabase(parsed.name, parseFloat(String(parsed.price).replace(/[^\d.]/g, "")) || 0, engineUsed);
          } catch (e4: any) {
            throw new Error(`Exaustão Local Total: ${e1.message} | ${e2.message} | ${e3.message} | ${e4.message}`);
          }
        }
      }
    }

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    const textToParse = jsonMatch ? jsonMatch[0] : "{}";
    const parsed = JSON.parse(textToParse);
    
    let rawPrice = String(parsed.price || "0");
    const cleanedPrice = rawPrice
      .replace(/[oO]/g, "0")
      .replace(/R\$/, "")
      .replace(",", ".")
      .replace(/[^\d.]/g, "")
      .trim();
    
    parsed.price = parseFloat(cleanedPrice) || 0;
    parsed.engine = engineUsed;
    parsed.id = lastInsertedId; // Devolve o ID para o App poder atualizar depois

    res.status(200).json(parsed);

  } catch (error: any) {
    console.error("Erro no servidor local:", error);
    res.status(500).json({ error: error.message });
  }
});

  // Health check and Debug
  app.get("/api/health", (req, res) => {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV || "development",
      hasKey: !!key,
      version: "3.0-b2c"
    });
  });

  // API do Admin (Local) - Habilita o Dashboard no ambiente de desenvolvimento
  app.post("/api/admin", async (req, res) => {
    try {
      const { adminToken, action } = req.body || {};
      const secret = (process.env.ADMIN_SECRET || '').replace(/[^\x00-\x7F]/g, "").trim();
      const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/[^\x00-\x7F]/g, "").trim();
      const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/[^\x00-\x7F]/g, "").trim();

      if (!secret || !serviceKey || !supabaseUrl) {
        return res.status(500).json({ error: "Configuração incompleta no .env local (ADMIN_SECRET ou SERVICE_ROLE_KEY faltando)." });
      }

      if (!adminToken || adminToken !== secret) {
        return res.status(401).json({ error: "Senha de administrador incorreta." });
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // --- Lógica Completa de Admin para o Local ---
      if (action === 'overview') {
        const [itemsRes, usersRes, sessionsRes] = await Promise.all([
          supabaseAdmin.from('items').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('items').select('user_id').neq('user_id', null),
          supabaseAdmin.from('items').select('trip_id, price, quantity, target_budget, is_session')
        ]);
        
        let activeSessions = 0;
        const tripsMap = new Map();
        (sessionsRes.data || []).forEach((item: any) => {
          if (item.is_session) activeSessions++;
          if (item.trip_id) {
            const t = tripsMap.get(item.trip_id) || { total: 0, budget: item.target_budget || 0 };
            t.total += (item.price * (item.quantity || 1));
            tripsMap.set(item.trip_id, t);
          }
        });

        const totalScans = itemsRes.count || 0;
        const uniqueUsers = new Set((usersRes.data || []).map((r: any) => r.user_id)).size;

        let totalEconomized = 0;
        tripsMap.forEach(({ total, budget }) => {
          if (budget > 0) totalEconomized += (budget - total);
        });

        return res.json({
          totalScans,
          uniqueUsers,
          totalTrips: tripsMap.size,
          activeSessions,
          totalEconomized: Math.round(totalEconomized * 100) / 100,
          avgScansPerTrip: tripsMap.size > 0 ? Math.round((totalScans / tripsMap.size) * 10) / 10 : 0
        });
      }

      if (action === 'timeline') {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data } = await supabaseAdmin.from('items').select('created_at').gte('created_at', since.toISOString());
        const counts: any = {};
        (data || []).forEach((i:any) => { const d = i.created_at.slice(0,10); counts[d] = (counts[d]||0)+1; });
        const result = [];
        for(let i=29; i>=0; i--) { const d = new Date(); d.setDate(d.getDate()-i); const k = d.toISOString().slice(0,10); result.push({date:k, scans:counts[k]||0}); }
        return res.json(result);
      }

      if (action === 'stores') {
        const { data } = await supabaseAdmin.from('items').select('store_name').not('store_name', 'is', null);
        const counts: any = {};
        (data || []).forEach((i:any) => { const s = i.store_name?.trim() || 'Desconhecido'; counts[s] = (counts[s]||0)+1; });
        const sorted = Object.entries(counts).sort((a:any,b:any)=>b[1]-a[1]).slice(0,15).map(([store, scans])=>({store, scans}));
        return res.json(sorted);
      }

      if (action === 'avgByCategory') {
        const { data } = await supabaseAdmin.from('items').select('shelf_category, price, quantity, is_abandoned').gt('price',0);
        const cats: any = {};
        (data || []).forEach((i:any) => {
          const c = i.shelf_category || 'Outros';
          if(!cats[c]) cats[c] = { prices:[], scanCount:0, abandonCount:0 };
          if(i.is_abandoned) cats[c].abandonCount++;
          else { cats[c].prices.push(i.price); cats[c].scanCount++; }
        });
        const result = Object.entries(cats).map(([category, c]:any) => ({
          category,
          avgPrice: c.prices.length ? c.prices.reduce((a:any,b:any)=>a+b,0)/c.prices.length : 0,
          scanCount: c.scanCount,
          abandonmentRate: (c.scanCount+c.abandonCount) > 0 ? Math.round((c.abandonCount/(c.scanCount+c.abandonCount))*100) : 0,
          avgBasket: 0, storeCount: 1
        })).sort((a,b)=>b.scanCount - a.scanCount);
        return res.json(result);
      }

      // Outras ações retornam vazio no local para não sobrecarregar
      return res.json([]);

    } catch (error: any) {
      console.error("Erro no Admin local:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Servir o Dashboard Admin (Local)
  app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
  });

  // Servir arquivos estáticos da pasta admin (css, js, etc)
  app.use("/admin", express.static(path.join(__dirname, "public", "admin")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Server Error:", err);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno. Tente novamente."
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
