// Cliente SQL local - substitui Supabase
// Usa localStorage para user_id anônimo e REST /api/items e /api/profile
export function getUserId(): string {
  let id = localStorage.getItem('xdx_user_id');
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    localStorage.setItem('xdx_user_id', id);
  }
  return id;
}

// Helper para saber se é app nativo (Capacitor) - usa URL absoluta
function getBaseUrl(): string {
  const isCapacitor = !!(window as any).Capacitor;
  return isCapacitor ? 'https://xdx-lovat.vercel.app' : '';
}

export async function fetchProfile(userId: string) {
  const res = await fetch(`${getBaseUrl()}/api/profile?id=${userId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function upsertProfile(userId: string, data: { full_name: string; phone: string }) {
  const res = await fetch(`${getBaseUrl()}/api/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: userId, ...data }),
  });
  return res.json();
}

export async function deleteProfile(userId: string) {
  const res = await fetch(`${getBaseUrl()}/api/profile?id=${userId}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchSessionItems(userId: string) {
  const res = await fetch(`${getBaseUrl()}/api/items?user_id=${userId}&is_session=true`);
  if (!res.ok) return [];
  const rows = await res.json();
  // normaliza is_session / is_abandoned de 0/1 para boolean, e snake_case para camel
  return rows.map((r: any) => ({
    ...r,
    is_session: !!r.is_session,
    is_abandoned: !!r.is_abandoned,
    rawText: r.raw_text,
    target_budget: r.target_budget,
    shelf_category: r.shelf_category,
  }));
}

export async function fetchHistoryItems(userId: string) {
  const res = await fetch(`${getBaseUrl()}/api/items?user_id=${userId}&is_session=false&limit=150`);
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r: any) => ({ ...r, is_session: !!r.is_session, is_abandoned: !!r.is_abandoned }));
}

export async function fetchLastPrice(userId: string, name: string) {
  const res = await fetch(`${getBaseUrl()}/api/items?user_id=${userId}&name=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function insertItem(item: any) {
  const res = await fetch(`${getBaseUrl()}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function updateItem(id: string, fields: any) {
  const res = await fetch(`${getBaseUrl()}/api/items?id=${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  return res.json();
}

export async function deleteItem(id: string) {
  const res = await fetch(`${getBaseUrl()}/api/items?id=${id}`, { method: 'DELETE' });
  return res.json();
}

export async function deleteSessionItems(userId: string) {
  const res = await fetch(`${getBaseUrl()}/api/items?user_id=${userId}&is_session=true`, { method: 'DELETE' });
  return res.json();
}

export async function finalizeSession(userId: string, tripId: string) {
  // usa PUT com finalize
  const res = await fetch(`${getBaseUrl()}/api/items?id=dummy`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, trip_id: tripId, finalize: true }),
  });
  // fallback: se o endpoint não suportar, faz via update direto no SQL via query?
  // Nossa API de items suporta finalize via PUT com user_id+trip_id
  return res.json();
}
