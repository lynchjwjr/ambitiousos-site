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
let fetchPromise: Promise<void> | null = null;

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

/** Fetch both entities and stats in one go, before rate limits are consumed */
async function ensureData(): Promise<void> {
  if (cachedEntities && cachedStats) return;
  if (!fetchPromise) {
    fetchPromise = (async () => {
      try {
        const [entitiesRes, statsRes] = await Promise.all([
          fetchWithRetry(`${API_BASE}/api/graph/entities`),
          fetchWithRetry(`${API_BASE}/api/graph/stats`),
        ]);
        if (entitiesRes.ok) {
          cachedEntities = await entitiesRes.json();
          console.log(`[graph] Fetched ${cachedEntities!.length} entities`);
        }
        if (statsRes.ok) {
          cachedStats = await statsRes.json();
          console.log(`[graph] Fetched stats`);
        }
      } catch (e) {
        console.warn('[graph] Failed to fetch graph data:', e);
      }
    })();
  }
  await fetchPromise;
}

export async function getEntities(): Promise<Entity[]> {
  await ensureData();
  return cachedEntities || [];
}

export async function getStats(): Promise<GraphStats | null> {
  await ensureData();
  return cachedStats || null;
}
