import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queries, getDatabase } from './_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const id = (req.query.id as string) || (req.body?.id as string) || '';

    if (req.method === 'GET') {
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const row = queries.getProfile(id);
      return res.status(200).json(row || null);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body || {};
      const pid = body.id || id;
      if (!pid) return res.status(400).json({ error: 'id obrigatório' });
      const full_name = body.full_name || '';
      const phone = body.phone || '';
      // cria se não existe
      queries.createProfile(pid);
      if (full_name || phone) {
        queries.upsertProfile(pid, full_name, phone);
      }
      const row = queries.getProfile(pid);
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      // apaga profile e todos items do usuário
      queries.deleteProfile(id);
      getDatabase().prepare('DELETE FROM items WHERE user_id = ?').run(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (e: any) {
    console.error('[profile API]', e);
    return res.status(500).json({ error: e.message });
  }
}
