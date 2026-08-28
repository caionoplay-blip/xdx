import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queries } from './_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const userId = (req.query.user_id as string) || (req.body?.user_id as string) || '';

    if (req.method === 'GET') {
      const is_session = req.query.is_session as string;
      const name = req.query.name as string;
      const limit = parseInt((req.query.limit as string) || '150', 10);

      if (name && userId) {
        // última price
        const row = queries.getLastPrice(userId, name);
        return res.status(200).json(row || null);
      }

      if (!userId) return res.status(400).json({ error: 'user_id obrigatório' });

      if (is_session === 'true' || is_session === '1') {
        const rows = queries.getSessionItems(userId);
        return res.status(200).json(rows);
      }
      if (is_session === 'false' || is_session === '0') {
        const rows = queries.getHistoryItems(userId, limit);
        return res.status(200).json(rows);
      }
      // sem filtro, retorna sessão
      const rows = queries.getSessionItems(userId);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // pode ser {items: []} ou single item
      if (Array.isArray(body.items)) {
        const ids: string[] = [];
        for (const it of body.items) {
          const id = queries.insertItem(it);
          ids.push(id);
        }
        return res.status(200).json({ ids });
      }
      const id = queries.insertItem(body);
      return res.status(200).json({ id });
    }

    if (req.method === 'PUT') {
      const id = (req.query.id as string) || (req.body?.id as string);
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const fields = req.body || {};
      delete fields.id;
      // suporta finalize: { trip_id, finalize: true, user_id }
      if (fields.finalize && fields.trip_id && userId) {
        queries.finalizeSession(userId, fields.trip_id);
        return res.status(200).json({ ok: true });
      }
      queries.updateItem(id, fields);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (id) {
        queries.deleteItem(id);
        return res.status(200).json({ ok: true });
      }
      // delete session items: DELETE /api/items?user_id=xxx&is_session=true
      if (userId && (req.query.is_session === 'true' || req.query.is_session === '1')) {
        queries.deleteSessionItems(userId);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'id ou user_id+is_session obrigatório' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (e: any) {
    console.error('[items API]', e);
    return res.status(500).json({ error: e.message });
  }
}
