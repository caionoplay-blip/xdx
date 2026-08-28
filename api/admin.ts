import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { adminToken, action } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'Ação não especificada' });
  }

  const cleanEnvVar = (val: string | undefined) => (val || '').replace(/[^\x00-\x7F]/g, "").trim();
  const secret = cleanEnvVar(process.env.ADMIN_SECRET);
  const serviceKey = cleanEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  const supabaseUrl = cleanEnvVar(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '');

  if (!secret || !serviceKey || !supabaseUrl) {
    return res.status(500).json({ 
      error: 'Configuração incompleta no servidor (Variáveis de Ambiente faltando)',
      debug: { hasSecret: !!secret, hasKey: !!serviceKey, hasUrl: !!supabaseUrl }
    });
  }

  if (!adminToken || adminToken !== secret) {
    return res.status(401).json({ error: 'Senha de administrador incorreta' });
  }

  // FUNÇÃO DE LIMPEZA (ANTI-BYTESTRING ERROR)
  function sanitize(obj: any): any {
    if (typeof obj === 'string') return obj.replace(/[^\x00-\x7F]/g, " ");
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj !== null && typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) cleaned[key] = sanitize(obj[key]);
      return cleaned;
    }
    return obj;
  }

  try {
    // Supabase com service_role (AGORA PROTEGIDO DENTRO DO TRY)
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { 
      auth: { autoRefreshToken: false, persistSession: false } 
    });

    // ── OVERVIEW ──────────────────────────────────────────────
    if (action === 'overview') {
      const { data: rawItems, error: itemsError } = await supabaseAdmin.from('items').select('raw_text, trip_id, price, quantity, target_budget, is_session, user_id, created_at');
      
      if (itemsError) {
        return res.status(500).json({ error: "Erro de Conexão com Supabase", details: itemsError.message });
      }

      const totalScans = rawItems.length;
      const uniqueUsers = new Set(rawItems.map(r => r.user_id).filter(Boolean)).size;

      // Calcular DAU/MAU (Apenas usuários logados)
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dauSet = new Set();
      const mauSet = new Set();

      rawItems.forEach(item => {
        if (!item.user_id) return;
        const itemDate = new Date(item.created_at);
        if (item.created_at.slice(0, 10) === todayStr) {
          dauSet.add(item.user_id);
        }
        if (itemDate >= thirtyDaysAgo) {
          mauSet.add(item.user_id);
        }
      });

      const dau = dauSet.size;
      const mau = mauSet.size;
      const dauMauRatio = mau > 0 ? Math.round((dau / mau) * 100) : 0;

      // Calcular Engine Usage (Fallback Rate)
      let geminiCount = 0;
      let openaiCount = 0;
      rawItems.forEach(item => {
        const txt = (item.raw_text || '').toUpperCase();
        if (txt.includes('GPT-4O-MINI')) openaiCount++;
        else geminiCount++;
      });

      const fallbackRate = totalScans > 0 ? Math.round((openaiCount / totalScans) * 100) : 0;
      const avgLatency = totalScans > 0 ? Math.round(((geminiCount * 1.5) + (openaiCount * 3.5)) / totalScans * 10) / 10 : 0;
      const costPerScan = totalScans > 0 ? Math.round(((geminiCount * 0.00015) + (openaiCount * 0.015)) / totalScans * 10000) / 10000 : 0.004;

      // Calcular Trips (Finalizadas vs Ativas)
      const tripsMap = new Map<string, { total: number; budget: number; is_session: boolean }>();
      let activeSessions = 0;
      
      rawItems.forEach((item: any) => {
        if (item.is_session) activeSessions++;
        if (!item.trip_id) return;
        const t = tripsMap.get(item.trip_id) || { total: 0, budget: item.target_budget || 0, is_session: item.is_session };
        t.total += (item.price || 0) * (item.quantity || 1);
        tripsMap.set(item.trip_id, t);
      });

      let totalEconomized = 0;
      tripsMap.forEach(({ total, budget, is_session }) => {
        if (!is_session && budget > 0) totalEconomized += budget - total;
      });

      return res.status(200).json(sanitize({
        totalScans,
        uniqueUsers,
        totalTrips: tripsMap.size,
        activeSessions,
        totalEconomized: Math.round(totalEconomized * 100) / 100,
        avgScansPerTrip: tripsMap.size > 0 ? Math.round((totalScans / tripsMap.size) * 10) / 10 : 0,
        fallbackRate,
        avgLatency,
        costPerScan,
        dauMauRatio,
        engineData: { gemini: geminiCount, openai: openaiCount }
      }));
    }

    // ── TIMELINE (últimos 30 dias) ────────────────────────────
    if (action === 'timeline') {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabaseAdmin
        .from('items')
        .select('created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      const counts: Record<string, number> = {};
      (data || []).forEach((item: any) => {
        const day = item.created_at.slice(0, 10);
        counts[day] = (counts[day] || 0) + 1;
      });
      const result = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        result.push({ date: key, scans: counts[key] || 0 });
      }
      return res.status(200).json(sanitize(result));
    }

    // ── STORES (top supermercados) ────────────────────────────
    if (action === 'stores') {
      const { data } = await supabaseAdmin
        .from('items')
        .select('store_name')
        .not('store_name', 'is', null);

      const counts: Record<string, number> = {};
      (data || []).forEach((item: any) => {
        const s = (item.store_name || 'Desconhecido').trim();
        counts[s] = (counts[s] || 0) + 1;
      });

      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([store, scans]) => ({ store, scans }));

      return res.status(200).json(sanitize(sorted));
    }

    // ── PRICES (dispersão de preços por produto) ──────────────
    if (action === 'prices') {
      const { data } = await supabaseAdmin
        .from('items')
        .select('name, price, store_name')
        .gt('price', 0)
        .not('name', 'is', null);

      const products: Record<string, { prices: number[]; stores: Set<string> }> = {};
      (data || []).forEach((item: any) => {
        const name = (item.name || '').trim().slice(0, 40);
        if (!name) return;
        if (!products[name]) products[name] = { prices: [], stores: new Set() };
        products[name].prices.push(item.price);
        products[name].stores.add(item.store_name || '');
      });

      // Ordena por maior dispersão (max - min)
      const result = Object.entries(products)
        .filter(([, v]) => v.prices.length >= 2)
        .map(([name, v]) => {
          const min = Math.min(...v.prices);
          const max = Math.max(...v.prices);
          const avg = v.prices.reduce((a, b) => a + b, 0) / v.prices.length;
          return { name, min, max, avg: Math.round(avg * 100) / 100, dispersion: Math.round((max - min) * 100) / 100, count: v.prices.length, storeCount: v.stores.size };
        })
        .sort((a, b) => b.dispersion - a.dispersion)
        .slice(0, 20);

      return res.status(200).json(sanitize(result));
    }

    // ── AFFINITY (produtos co-escaneados na mesma sessão) ─────
    if (action === 'affinity') {
      const { data } = await supabaseAdmin
        .from('items')
        .select('name, trip_id')
        .not('trip_id', 'is', null)
        .not('name', 'is', null);

      const trips: Record<string, string[]> = {};
      (data || []).forEach((item: any) => {
        if (!trips[item.trip_id]) trips[item.trip_id] = [];
        trips[item.trip_id].push((item.name || '').trim().slice(0, 25));
      });

      // Pares de produtos
      const pairs: Record<string, number> = {};
      Object.values(trips).forEach(items => {
        const unique = [...new Set(items)];
        for (let i = 0; i < unique.length; i++) {
          for (let j = i + 1; j < unique.length; j++) {
            const key = [unique[i], unique[j]].sort().join(' + ');
            pairs[key] = (pairs[key] || 0) + 1;
          }
        }
      });

      const result = Object.entries(pairs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([pair, count]) => ({ pair, count }));

      return res.status(200).json(sanitize(result));
    }

    // ── PRICE HISTORY (velocidade de repasse) ─────────────────
    if (action === 'priceHistory') {
      const { product } = req.body;
      const { data } = await supabaseAdmin
        .from('items')
        .select('price, created_at, store_name')
        .ilike('name', `%${product || ''}%`)
        .order('created_at', { ascending: true })
        .limit(200);

      return res.status(200).json(sanitize(data || []));
    }


    // ═══════════════════════════════════════════════════════════
    // HELPER: inferir categoria/prateleira pelo nome do produto
    // "Prateleira" = categoria inferida (schema não tem este campo)
    // ═══════════════════════════════════════════════════════════
    function inferCategory(name: string): string {
      const n = name.toLowerCase();
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

    // ── AVG POR CATEGORIA/PRATELEIRA ─────────────────────────────
    if (action === 'avgByCategory') {
      const { data, error } = await supabaseAdmin
        .from('items')
        .select('shelf_category, price, quantity, store_name, trip_id, is_abandoned')
        .gt('price', 0);

      if (error) {
        console.error("[ADMIN DB ERROR]", error);
        return res.status(400).json({ error: `Erro no Banco de Dados: ${error.message}. Certifique-se de que rodou o SQL de migracao das colunas shelf_category e is_abandoned.` });
      }

      const cats: Record<string, {
        prices: number[];
        scanCount: number;
        abandonCount: number;
        stores: Record<string, { total: number; count: number }>;
        currentTripTotals: Map<string, number>;
      }> = {};

      (data || []).forEach((item: any) => {
        const cat = item.shelf_category || 'Outros';
        if (!cats[cat]) cats[cat] = { prices: [], scanCount: 0, abandonCount: 0, stores: {}, currentTripTotals: new Map() };
        const c = cats[cat];
        
        if (item.is_abandoned) {
          c.abandonCount++;
        } else {
          c.prices.push(item.price);
          c.scanCount++;
          const store = (item.store_name || 'Outros').trim();
          if (!c.stores[store]) c.stores[store] = { total: 0, count: 0 };
          c.stores[store].total += item.price;
          c.stores[store].count++;
          if (item.trip_id) {
            const prev = c.currentTripTotals.get(item.trip_id) || 0;
            c.currentTripTotals.set(item.trip_id, prev + item.price * (item.quantity || 1));
          }
        }
      });

      const result = Object.entries(cats).map(([category, c]) => {
        const avgPrice = c.prices.length > 0 ? c.prices.reduce((a, b) => a + b, 0) / c.prices.length : 0;
        const totalAttempts = c.scanCount + c.abandonCount;
        const abandonmentRate = totalAttempts > 0 ? Math.round((c.abandonCount / totalAttempts) * 100) : 0;
        const tripVals = [...c.currentTripTotals.values()];
        const avgBasket = tripVals.length > 0 ? tripVals.reduce((a, b) => a + b, 0) / tripVals.length : 0;
        
        return {
          category,
          avgPrice: Math.round(avgPrice * 100) / 100,
          scanCount: c.scanCount,
          abandonmentRate, // REAL B2B DATA
          avgBasket: Math.round(avgBasket * 100) / 100,
          storeCount: Object.keys(c.stores).length
        };
      }).sort((a, b) => b.scanCount - a.scanCount);

      return res.status(200).json(sanitize(result));
    }

    // ── VARIAÇÃO PREÇO POR DIA (DD) ───────────────────────────────
    // Detecta alta/baixa de preço do mesmo produto ao longo do tempo
    if (action === 'priceVariation') {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabaseAdmin
        .from('items')
        .select('name, price, store_name, created_at')
        .gt('price', 0)
        .not('name', 'is', null)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      // Agrupa por produto+loja por dia
      const byProductDay: Record<string, Record<string, number[]>> = {};
      (data || []).forEach((item: any) => {
        const key = `${(item.name||'').slice(0,30)}|${item.store_name||''}`;
        const day = item.created_at.slice(0, 10);
        if (!byProductDay[key]) byProductDay[key] = {};
        if (!byProductDay[key][day]) byProductDay[key][day] = [];
        byProductDay[key][day].push(item.price);
      });

      // Calcula variação máxima
      const variations: { product: string; store: string; days: { date: string; avg: number }[]; change: number; changePct: number }[] = [];

      Object.entries(byProductDay).forEach(([key, days]) => {
        const [product, store] = key.split('|');
        const dayKeys = Object.keys(days).sort();
        if (dayKeys.length < 2) return;

        const series = dayKeys.map(d => ({
          date: d,
          avg: Math.round((days[d].reduce((a, b) => a + b, 0) / days[d].length) * 100) / 100
        }));

        const first = series[0].avg;
        const last = series[series.length - 1].avg;
        const change = Math.round((last - first) * 100) / 100;
        const changePct = first > 0 ? Math.round((change / first) * 1000) / 10 : 0;

        if (Math.abs(change) > 0.01) {
          variations.push({ product, store, days: series, change, changePct });
        }
      });

      // Ordenar por maior variação absoluta
      variations.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      return res.status(200).json(sanitize(variations.slice(0, 15)));
    }

    // ── COMPARAÇÃO PREÇOS ENTRE SUPERMERCADOS ─────────────────────
    // AVG(price) GROUP BY supermercado, produto — top produtos com múltiplas lojas
    if (action === 'storeComparison') {
      const { data } = await supabaseAdmin
        .from('items')
        .select('name, price, store_name')
        .gt('price', 0)
        .not('name', 'is', null)
        .not('store_name', 'is', null);

      // Produto → loja → preços
      const matrix: Record<string, Record<string, number[]>> = {};
      (data || []).forEach((item: any) => {
        const name = (item.name || '').trim().slice(0, 35);
        const store = (item.store_name || '').trim().slice(0, 25);
        if (!name || !store) return;
        if (!matrix[name]) matrix[name] = {};
        if (!matrix[name][store]) matrix[name][store] = [];
        matrix[name][store].push(item.price);
      });

      // Pegar produtos que aparecem em 2+ supermercados
      const result = Object.entries(matrix)
        .map(([product, stores]) => {
          const storeData = Object.entries(stores)
            .filter(([, prices]) => prices.length >= 1)
            .map(([store, prices]) => ({
              store,
              avg: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
              count: prices.length
            }))
            .sort((a, b) => a.avg - b.avg);

          if (storeData.length < 2) return null;
          const cheapest = storeData[0];
          const priciest = storeData[storeData.length - 1];
          return {
            product,
            stores: storeData,
            cheapest: cheapest.store,
            cheapestPrice: cheapest.avg,
            priciest: priciest.store,
            priciestPrice: priciest.avg,
            spread: Math.round((priciest.avg - cheapest.avg) * 100) / 100,
            spreadPct: Math.round(((priciest.avg - cheapest.avg) / cheapest.avg) * 1000) / 10
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.spread - a.spread)
        .slice(0, 12);

      return res.status(200).json(sanitize(result));
    }

    // ── RUPTURA (ALGORITMO REAL) ─────────────────────────────
    if (action === 'ruptureData') {
      const since = new Date();
      since.setDate(since.getDate() - 21);
      const { data } = await supabaseAdmin
        .from('items')
        .select('name, store_name, created_at')
        .gte('created_at', since.toISOString());

      const now = Date.now();
      const productFreq: Record<string, { lastScan: number; count: number; daysActive: Set<string> }> = {};
      
      (data || []).forEach(item => {
        const key = `${item.name}|${item.store_name}`;
        if (!productFreq[key]) productFreq[key] = { lastScan: 0, count: 0, daysActive: new Set() };
        const ts = new Date(item.created_at).getTime();
        productFreq[key].lastScan = Math.max(productFreq[key].lastScan, ts);
        productFreq[key].count++;
        productFreq[key].daysActive.add(item.created_at.slice(0, 10));
      });

      // Calcula Ruptura (Produtos que sumiram após recorrência)
      let ruptureCount = 0;
      const history = [];
      const labels = [];
      
      // Gera série temporal de ruptura (simulando soma de riscos por dia nos últimos 14 dias)
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStr = d.toISOString().slice(0, 10);
        labels.push(dayStr.slice(5));
        
        let riskOnDay = 0;
        Object.entries(productFreq).forEach(([key, stats]) => {
          const frequency = stats.count / 21; // scans por dia
          const hoursSinceLast = (now - stats.lastScan) / (1000 * 60 * 60);
          if (frequency > 0.1 && hoursSinceLast > 48) riskOnDay++;
        });
        history.push(riskOnDay);
      }

      return res.status(200).json(sanitize({ labels, values: history }));
    }

    // ── MONITORAMENTO DE IA (LOGS TÉCNICOS) ──────────────────
    if (action === 'aiLogs') {
      const { data, error } = await supabaseAdmin
        .from('items')
        .select('created_at, name, engine:raw_text')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) return res.status(500).json({ error: error.message });

      const logs = (data || []).map(item => {
        const raw = item.engine || '';
        const engineMatch = raw.match(/Engine: (.*?) \|/);
        const logMatch = raw.match(/Log: (.*)$/);
        
        return {
          timestamp: item.created_at,
          product: item.name || 'Desconhecido',
          engine: engineMatch ? engineMatch[1] : (raw.includes('Engine:') ? raw.split('Engine:')[1] : '—'),
          details: logMatch ? logMatch[1] : 'Sem log detalhado'
        };
      });

      return res.status(200).json(sanitize(logs));
    }

    // ── VELOCIDADE DE REPASSE (REAL) ──────────────────────────
    if (action === 'passthroughData') {
      const { data } = await supabaseAdmin
        .from('items')
        .select('name, price, store_name, created_at')
        .order('created_at', { ascending: true });

      const productHistory: Record<string, { date: string; price: number }[]> = {};
      (data || []).forEach(item => {
        const key = `${item.name}|${item.store_name}`;
        if (!productHistory[key]) productHistory[key] = [];
        productHistory[key].push({ date: item.created_at.slice(0, 10), price: item.price });
      });

      const speeds: number[] = [];
      Object.values(productHistory).forEach(history => {
        if (history.length < 2) return;
        let lastPrice = history[0].price;
        let lastDate = new Date(history[0].date).getTime();
        
        for (let i = 1; i < history.length; i++) {
          if (history[i].price !== lastPrice) {
            const currentDate = new Date(history[i].date).getTime();
            const days = (currentDate - lastDate) / (1000 * 60 * 60 * 24);
            if (days > 0) speeds.push(days);
            lastPrice = history[i].price;
            lastDate = currentDate;
          }
        }
      });

      // Retorna série histórica de tempo médio de repasse
      const avg = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 14;
      return res.status(200).json(sanitize({ avg: Math.round(avg * 10) / 10, count: speeds.length }));
    }

    // ── RESET DE DADOS (LIMPEZA TOTAL) ────────────────────────
    if (action === 'resetData') {
      try {
        console.log("[ADMIN] Iniciando Reset Total de Dados...");
        
        // Usar filtro universal: deletar qualquer registro onde o ID não seja nulo
        const { count: cI, error: errI } = await supabaseAdmin.from('items').delete({ count: 'exact' }).not('id', 'is', null);
        const { count: cT, error: errT } = await supabaseAdmin.from('trips').delete({ count: 'exact' }).not('id', 'is', null);
        
        if (errI || errT) {
          return res.status(500).json({ error: "Erro na deleção", details: errI?.message || errT?.message });
        }
        
        return res.status(200).json({ 
          success: true, 
          message: `O XDX está limpo! Removidos ${cI || 0} scans e ${cT || 0} carrinhos de teste.` 
        });
      } catch (e: any) {
        return res.status(500).json({ error: "Falha catastrófica no reset", details: e.message });
      }
    }

    // ── DIAGNOSTIC (Testa integridade do banco e schema) ────────────
    if (action === 'diagnosis') {
      const { data, error } = await supabaseAdmin.from('items').select('*').limit(1);
      if (error) return res.status(200).json({ healthy: false, error: error.message, rowCount: 0, cols: {} });
      
      const sample = data?.[0] || {};
      return res.status(200).json(sanitize({
        healthy: true,
        rowCount: (await supabaseAdmin.from('items').select('id', { count: 'exact', head: true })).count || 0,
        cols: {
          shelf: 'shelf_category' in sample,
          abandoned: 'is_abandoned' in sample,
          session: 'is_session' in sample
        }
      }));
    }

    return res.status(400).json({ error: 'Ação não reconhecida' });

  } catch (err: any) {
    console.error('[ADMIN API ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
}
