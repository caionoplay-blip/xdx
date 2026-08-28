import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queries } from './_lib/db';

// Helper para B2B: Inferir prateleira/categoria (Consistente com o Dashboard)
function inferCategory(name: string): string {
  const n = (name || '').toLowerCase();
  if (['leite','queijo','iogurte','manteiga','requeijão','nata','creme de leite'].some(k => n.includes(k))) return 'Laticínios';
  if (['carne','frango','peixe','linguiça','bacon','presunto','bife','costela','alcatra','patinho'].some(k => n.includes(k))) return 'Carnes';
  if (['suco','refrigerante','água','cerveja','vinho','energético','coca','pepsi','guaraná'].some(k => n.includes(k))) return 'Bebidas';
  if (['detergente','sabão','amaciante','desinfetante','alvejante','limpador','multiuso'].some(k => n.includes(k))) return 'Limpeza';
  if (['shampoo','creme','desodorante','sabonete','pasta de dente','condicionador'].some(k => n.includes(k))) return 'Higiene';
  if (['arroz','feijão','macarrão','farinha','aveia','milho','lentilha','grão'].some(k => n.includes(k))) return 'Grãos/Massas';
  if (['biscoito','bolacha','chocolate','doce','sorvete','bala','barra'].some(k => n.includes(k))) return 'Doces/Snacks';
  if (['pão','bolo','torta','croissant','bisnaguinha'].some(k => n.includes(k))) return 'Padaria';
  if (['tomate','batata','cebola','alface','brócolis','cenoura','banana','maçã','laranja'].some(k => n.includes(k))) return 'Hortifrúti';
  if (['óleo','azeite','vinagre','molho','tempero','sal ','pimenta','extrato'].some(k => n.includes(k))) return 'Condimentos';
  return 'Outros';
}

// ── Rate limiting por IP ──────────────────────────────────────
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 15;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

// ── Cache anti-duplicata (90s por hash de imagem) ─────────────
// Evita cobrar 2x quando usuário toca o botão rapidamente ou
// o app reprocessa a mesma foto. Econômico e sem risco de dado desatualizado.
const scanCache = new Map<string, { result: any; expiresAt: number }>();
const CACHE_TTL = 90 * 1000; // 90 segundos

function getCacheKey(imageData: string): string {
  // Usa os primeiros 120 chars do base64 como fingerprint da imagem
  return imageData.slice(0, 120);
}

function getFromCache(key: string): any | null {
  const entry = scanCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { scanCache.delete(key); return null; }
  return entry.result;
}

function setCache(key: string, result: any) {
  // Limpar entradas expiradas periodicamente para não vazar memória
  if (scanCache.size > 200) {
    const now = Date.now();
    scanCache.forEach((v, k) => { if (now > v.expiresAt) scanCache.delete(k); });
  }
  scanCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- CONFIGURAÇÃO DE CORS ---
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Em produção, você pode restringir isso
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Segurança: apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Rate limiting por IP
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto e tente novamente.' });
  }

  // Validação de payload
  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Imagem inválida ou ausente.' });
  }

  // Limite de tamanho: máx 5MB em base64
  if (image.length > 7 * 1024 * 1024) {
    return res.status(413).json({ error: 'Imagem muito grande. Máximo 5MB.' });
  }

  try {
    const cleanEnvVar = (val: string | undefined) => (val || '').replace(/[^\x00-\x7F]/g, "").trim();
    const apiKey = cleanEnvVar(process.env.GEMINI_API_KEY || process.env.API_KEY || '');
    const openaiKey = cleanEnvVar(process.env.OPENAI_API_KEY || '');

    // Extrair base64 se vier com prefixo data:image/jpeg;base64,
    const imageData = image.includes('base64,') ? image.split('base64,')[1] : image;

    async function saveToDatabase(name: string, price: number, engine: string, _log?: string): Promise<string | null> {
      try {
        const id = queries.insertItem({
          name,
          price,
          quantity: 1,
          store_name: "Mercado XDX (SQL)",
          is_session: true,
          is_abandoned: true,
          shelf_category: inferCategory(name),
          raw_text: `Engine: ${engine}`,
          user_id: 'system', // scan automático sem usuário, usado só para analytics
        });
        console.log("[SQL] Scan salvo ID:", id);
        return id;
      } catch (e) {
        console.error("[SQL CRASH]", e);
        return null;
      }
    }

    async function tryDirectScan(model: string, version: string = 'v1beta') {
      console.log(`[DIRETO] Chamando: ${model} (${version})`);
      const response = await fetch(`https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `VOCÊ É UM SCANNER DE PREÇOS DE SUPERMERCADO DE ALTA PRECISÃO. 
Analise a imagem da etiqueta de preço e extraia:
1. "name": Nome completo do produto (inclua marca e peso/volume se houver na etiqueta). Ex: "Picanha Fatiada Swift 1kg"
2. "price": O valor em reais (use apenas números e ponto decimal). 
3. "is_weight_based": true se for produto de balança/açougue (ex: carnes, frutas por kg).
4. "estimated_weight_g": Se for carne ou produto pesado, tente ler o peso em gramas impresso na etiqueta.

REGRAS CRÍTICAS:
- Se houver dois preços (Normal vs Oferta/Clube), use o MENOR (Oferta).
- Ignore códigos de barras e datas.
- Foque no número com maior fonte se houver dúvida.

Retorne APENAS um JSON puro: {"name": "...", "price": 0.00, "is_weight_based": false, "estimated_weight_g": 0}` },
              { inlineData: { mimeType: "image/jpeg", data: imageData } }
            ]
          }],
          generationConfig: {
            // Removendo responseMimeType para evitar erros em alguns endpoints v1
            temperature: 0.1,
            topP: 0.95,
          }
        })
      });

        if (!response.ok) {
          try {
            const errBody = await response.json();
            console.error(`[ERRO ${version}] ${model}:`, errBody);
            throw new Error(`API ${version} ${model} falhou: ${errBody.error?.message || response.status}`);
          } catch {
            throw new Error(`API ${version} ${model} falhou: ${response.status}`);
          }
        }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    }

    async function tryOpenAIScan() {
      if (!openaiKey) throw new Error("OpenAI Key missing");
      console.log(`[OPENAI] Ativando Motor de Emergência...`);
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Você é um scanner de preços. Extraia o nome do produto (com marca) e o preço em JSON: {\"name\": \"...\", \"price\": 0.00, \"is_weight_based\": true/false, \"estimated_weight_g\": 0}. Se for carne/balança, marque is_weight_based como true." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageData}` } }
            ]
          }],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error("OpenAI falhou");
      return data.choices[0].message.content || "{}";
    }

    function parseResult(text: string) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const textToParse = jsonMatch ? jsonMatch[0] : "{}";
      return JSON.parse(textToParse);
    }

    function normalizePrice(raw: any): number {
      const rawPrice = String(raw || "0");
      const cleaned = rawPrice
        .replace(/[oO]/g, "0")
        .replace(/R\$/, "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
        .trim();
      return parseFloat(cleaned) || 0;
    }

    let resultText = '';
    const lastInsertedId: string | null = null;
    let engineUsed = "";
    let bestResult: any = null;
    let enginesLog: string[] = [];

    // ══════════════════════════════════════════
    // MOTOR 1 — Gemini 1.5 Flash (Tentativa Híbrida: v1 -> v1beta)
    // ══════════════════════════════════════════
    const modelTries = [
      { v: 'v1beta', m: 'gemini-1.5-flash' },
      { v: 'v1beta', m: 'gemini-1.5-flash-latest' },
      { v: 'v1', m: 'gemini-1.5-flash' },
      { v: 'v1beta', m: 'gemini-1.5-flash-8b' },
      { v: 'v1beta', m: 'gemini-pro-vision' },
      { v: 'v1beta', m: 'gemini-pro' }
    ];
    
    for (const t of modelTries) {
      try {
        if (!apiKey) {
          enginesLog.push(`Gemini: SEM_CHAVE`);
          break;
        }
        resultText = await tryDirectScan(t.m, t.v);
        const parsed = parseResult(resultText);
        const price = normalizePrice(parsed.price);
        
        if (price > 0 && parsed.name) {
          const insertedId = await saveToDatabase(parsed.name, price, `${t.m.toUpperCase()}`, enginesLog.join(' | '));
          const result = { ...parsed, price, id: insertedId, engine: `${t.m.toUpperCase()}` };
          return res.status(200).json(result);
        }
        if (parsed.name) {
          bestResult = { ...parsed, price, engine: `${t.m.toUpperCase()}` };
          enginesLog.push(`${t.m}: PREÇO_ZERO`);
        } else {
          enginesLog.push(`${t.m}: JSON_INVALIDO`);
        }
      } catch (e: any) {
        // Log detalhado para o Dashboard
        const errorMsg = e.message.includes('429') ? 'QUOTA_EXCEDIDA' : 
                         e.message.includes('401') ? 'CHAVE_INVALIDA' : 
                         e.message.includes('403') ? 'REGIAO_BLOQUEADA' : `ERRO_${e.message.slice(0, 10)}`;
        enginesLog.push(`${t.m}: ${errorMsg}`);
        console.warn(`[FALLBACK] ${t.m} falhou: ${e.message}`);
      }
    }

    // ══════════════════════════════════════════
    // MOTOR 3 — OpenAI GPT-4o-mini (PAGO / ELITE)
    // ══════════════════════════════════════════
    if (openaiKey) {
      try {
        resultText = await tryOpenAIScan();
        const parsed = parseResult(resultText);
        const price = normalizePrice(parsed.price);
        if (parsed.name || price > 0) {
          const insertedId = await saveToDatabase(parsed.name || "Produto", price, 'GPT-4O-MINI', enginesLog.join(' | '));
          const result = { ...parsed, price, id: insertedId, engine: 'GPT-4O-MINI' };
          return res.status(200).json(result);
        }
        enginesLog.push(`OpenAI: JSON_VAZIO`);
      } catch (e3: any) {
        enginesLog.push(`OpenAI: ERRO_${e3.message.slice(0, 20)}`);
      }
    } else {
      enginesLog.push(`OpenAI: SEM_CHAVE`);
    }

    // Se temos ao menos o nome identificado, retorna para o usuário corrigir o preço manualmente
    if (bestResult) {
      return res.status(200).json({ ...bestResult, debug: enginesLog.join(' | ') });
    }

    res.status(500).json({ 
      error: "Falha total na identificação", 
      debug: enginesLog.join(' | ') 
    });

  } catch (error: any) {
    console.error("Erro Final Scanner:", error.message);
    res.status(500).json({ error: error.message, debug: "CRASH_EXTERNO" });
  }
}
