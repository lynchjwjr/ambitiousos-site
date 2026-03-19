/**
 * Shared graph data fetcher — ensures entities and stats are fetched once
 * during the build, then reused across all pages (explore hub + entity detail).
 */

const API_BASE = 'https://ra-os-api.fly.dev';

export interface Entity {
  slug: string;
  name: string;
  type: string;
  mention_count: number;
  edition_count: number;
}

export interface GraphStats {
  entity_count: number;
  edge_count: number;
  by_type: Record<string, number>;
  enriched_doc_count: number;
}

let cachedEntities: Entity[] | null = null;
let cachedStats: GraphStats | null = null;

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res;
      console.warn(`[graph] ${url} returned ${res.status} (attempt ${i + 1}/${retries})`);
    } catch (e) {
      console.warn(`[graph] ${url} failed (attempt ${i + 1}/${retries}):`, e);
    }
    if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
  }
  return new Response('[]', { status: 503 });
}

export async function getEntities(): Promise<Entity[]> {
  if (cachedEntities) return cachedEntities;

  try {
    const res = await fetchWithRetry(`${API_BASE}/api/graph/entities`);
    if (res.ok) {
      cachedEntities = await res.json();
      console.log(`[graph] Fetched ${cachedEntities!.length} entities`);
    }
  } catch (e) {
    console.warn('[graph] Failed to fetch entities:', e);
  }

  return cachedEntities || [];
}

export async function getStats(): Promise<GraphStats | null> {
  if (cachedStats) return cachedStats;

  try {
    const res = await fetchWithRetry(`${API_BASE}/api/graph/stats`);
    if (res.ok) {
      cachedStats = await res.json();
    }
  } catch (e) {
    console.warn('[graph] Failed to fetch stats:', e);
  }

  return cachedStats || null;
}
