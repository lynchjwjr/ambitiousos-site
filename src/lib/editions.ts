/**
 * Fetches all newsletter editions by:
 * 1. Getting all post URLs from the Substack sitemap (guaranteed to have all 66+)
 * 2. Fetching OG metadata from each post page in batches
 * 3. Falling back to RSS for recent editions if sitemap scraping fails
 */

export interface Edition {
  title: string;
  cleanTitle: string;
  slug: string;
  date: string;
  isoDate: string;
  link: string;
  description: string;
  image: string;
}

const SUBSTACK_BASE = 'https://www.readingambitiously.com';

function decodeEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function cleanEditionTitle(rawTitle: string): string {
  return rawTitle.replace(/^Reading Ambitiously\s+\d+[\.\-]\d+[\.\-]\d+\s*[-–—]\s*/, '');
}

function slugFromUrl(url: string): string {
  return url.split('/').pop()?.replace(/\?.*$/, '') || '';
}

/**
 * Fetch OG metadata from a single Substack post page
 */
async function fetchPageMeta(url: string): Promise<{
  title: string;
  description: string;
  image: string;
  publishedTime: string;
} | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AmbitiousOS-SiteBuilder/1.0' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/)
      ?.[1] || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/)
      ?.[1] || '';
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/)
      ?.[1] || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:description"/)
      ?.[1] || '';
    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/)
      ?.[1] || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:image"/)
      ?.[1] || '';
    const publishedTime = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]*)"/)
      ?.[1] || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="article:published_time"/)
      ?.[1] || '';

    return {
      title: decodeEntities(ogTitle),
      description: decodeEntities(ogDesc),
      image: ogImage,
      publishedTime,
    };
  } catch {
    return null;
  }
}

/**
 * Process URLs in batches to avoid overwhelming Substack
 */
async function fetchInBatches<T>(
  items: string[],
  fn: (url: string) => Promise<T>,
  batchSize = 10,
): Promise<(T | null)[]> {
  const results: (T | null)[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0) await new Promise(r => setTimeout(r, 500));
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Get all post URLs from the Substack sitemap
 */
async function getPostUrlsFromSitemap(): Promise<string[]> {
  const res = await fetch(`${SUBSTACK_BASE}/sitemap.xml`);
  const xml = await res.text();

  // Extract all URLs that contain /p/ (post pages)
  const urlMatches = xml.match(/<loc>([^<]*\/p\/[^<]*)<\/loc>/g) || [];
  return urlMatches.map(match =>
    match.replace(/<\/?loc>/g, '')
  );
}

/**
 * Main function: fetch all editions with full metadata
 */
export async function fetchAllEditions(): Promise<Edition[]> {
  let postUrls: string[] = [];

  try {
    postUrls = await getPostUrlsFromSitemap();
    console.log(`[editions] Found ${postUrls.length} posts in sitemap`);
  } catch (e) {
    console.warn('[editions] Failed to fetch sitemap:', e);
  }

  if (postUrls.length === 0) {
    console.warn('[editions] Sitemap returned no posts, falling back to RSS');
    return fetchFromRss();
  }

  // Fetch OG metadata for all posts in batches of 10
  const metaResults = await fetchInBatches(postUrls, fetchPageMeta, 10);

  const editions: Edition[] = [];

  for (let i = 0; i < postUrls.length; i++) {
    const url = postUrls[i];
    const meta = metaResults[i];
    const urlSlug = slugFromUrl(url);

    if (!meta || !meta.title) {
      // Fallback: derive what we can from the URL
      console.warn(`[editions] Could not fetch metadata for ${url}`);
      editions.push({
        title: urlSlug.replace(/-/g, ' '),
        cleanTitle: urlSlug.replace(/^reading-ambitiously-/, '').replace(/-/g, ' '),
        slug: urlSlug,
        date: '',
        isoDate: '',
        link: url,
        description: '',
        image: '',
      });
      continue;
    }

    let date = '';
    let isoDate = meta.publishedTime || '';
    if (isoDate) {
      try {
        const d = new Date(isoDate);
        date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {}
    }

    const cleanTitle = cleanEditionTitle(meta.title);

    editions.push({
      title: meta.title,
      cleanTitle: cleanTitle || meta.title,
      slug: urlSlug,
      date,
      isoDate,
      link: url,
      description: meta.description,
      image: meta.image,
    });
  }

  // Sort by date descending (newest first)
  editions.sort((a, b) => {
    if (!a.isoDate && !b.isoDate) return 0;
    if (!a.isoDate) return 1;
    if (!b.isoDate) return -1;
    return new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime();
  });

  console.log(`[editions] Successfully fetched ${editions.length} editions`);
  return editions;
}

/**
 * RSS fallback — only gets ~20 most recent editions
 */
async function fetchFromRss(): Promise<Edition[]> {
  try {
    const res = await fetch(`${SUBSTACK_BASE}/feed`);
    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    return items.map((item) => {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        || item.match(/<title>(.*?)<\/title>/)?.[1]
        || 'Untitled';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1]
        || SUBSTACK_BASE;
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s)?.[1]
        || item.match(/<description>(.*?)<\/description>/s)?.[1]
        || '';
      const image = item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || '';

      let date = pubDate;
      let isoDate = '';
      try {
        const d = new Date(pubDate);
        date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        isoDate = d.toISOString();
      } catch {}

      const cleanTitle = decodeEntities(cleanEditionTitle(title));
      const urlSlug = slugFromUrl(link);

      let excerpt = decodeEntities(description.replace(/<[^>]+>/g, '').trim());
      if (excerpt.length > 200) {
        excerpt = excerpt.slice(0, 200).replace(/\s+\S*$/, '') + '…';
      }

      return {
        title: decodeEntities(title),
        cleanTitle,
        slug: urlSlug,
        date,
        isoDate,
        link,
        description: excerpt,
        image,
      };
    });
  } catch (e) {
    console.warn('[editions] RSS fallback also failed:', e);
    return [];
  }
}
