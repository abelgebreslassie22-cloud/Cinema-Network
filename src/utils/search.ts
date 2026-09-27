import { ContentItem } from '../types';
import { getMockContent } from '../data';

const STOPWORDS = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'of', 'and', 'or', 'to', 'for', 'with', 'by', 'is', 'it']);

export function rankAndFilterContent(items: any[], query: string, category?: string | null): any[] {
  if (!items || !Array.isArray(items)) return [];

  const cleanQ = (query || '').trim().toLowerCase();

  // 1. Filter by Category if provided and not "All"
  let filtered = items;
  if (category && category !== 'All') {
    const catNorm = category.trim().toLowerCase();
    filtered = items.filter(item => {
      const c = (item.category || '').trim().toLowerCase();
      const fmt = (item.format || '').trim().toLowerCase();
      const lang = (item.language || '').trim().toLowerCase();
      const gRaw = item.genres || [];
      const gList = Array.isArray(gRaw)
        ? gRaw.map((g: any) => String(g).toLowerCase())
        : [String(gRaw).toLowerCase()];

      if (catNorm === 'movies' || catNorm === 'movie') {
        return c === 'movie' || c === 'movies' || (c === 'indian' && fmt === 'movie');
      }
      if (catNorm === 'series' || catNorm === 'tv show' || catNorm === 'tv shows') {
        return c === 'series' || c === 'tv show' || c === 'tv shows' || (c === 'indian' && fmt === 'series');
      }
      if (catNorm === 'animation') {
        return c !== 'anime' && (c === 'animation' || gList.some(g => g.includes('animation')));
      }
      if (catNorm === 'anime') {
        return c === 'anime' || gList.some(g => g.includes('anime'));
      }
      if (catNorm === 'asian') {
        const asianLangs = ['ko', 'zh', 'cn', 'tw', 'ja', 'th', 'vi', 'id', 'ms', 'tl'];
        return c !== 'anime' && (c === 'asian drama' || c === 'asian' || asianLangs.includes(lang));
      }
      if (catNorm === 'indian') {
        const indianLangs = ['hi', 'te', 'ta', 'kn', 'ml', 'pa', 'gu', 'mr', 'bn', 'ur', 'or', 'as'];
        return c === 'indian' || item.isIndian === true || indianLangs.includes(lang);
      }
      return c === catNorm;
    });
  }

  if (!cleanQ) {
    return filtered;
  }

  // Sanitize query for matching
  const qAlphanum = cleanQ.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const qNoSpace = qAlphanum.replace(/\s+/g, '');
  const qTerms = qAlphanum.split(' ').filter(Boolean);
  if (qTerms.length === 0) {
    return filtered;
  }

  const sigTerms = qTerms.filter(t => !STOPWORDS.has(t) || qTerms.length === 1);
  const termsToUse = sigTerms.length > 0 ? sigTerms : qTerms;

  const scored: { item: any; score: number }[] = [];

  for (const item of filtered) {
    const title = (item.title || item.name || '').trim().toLowerCase();
    if (!title) continue;

    const titleAlpha = title.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const titleNoSpace = titleAlpha.replace(/\s+/g, '');

    const origTitle = (item.originalTitle || '').trim().toLowerCase();
    const origAlpha = origTitle.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const origNoSpace = origAlpha.replace(/\s+/g, '');

    const franchise = (item.franchise || item.franchiseName || '').trim().toLowerCase();
    const franchiseAlpha = franchise.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const franchiseNoSpace = franchiseAlpha.replace(/\s+/g, '');

    // Collect cast & director
    const castList: string[] = [];
    const extractCast = (v: any) => {
      if (!v) return;
      if (Array.isArray(v)) {
        v.forEach(x => {
          if (typeof x === 'string') castList.push(x.toLowerCase());
          else if (x && typeof x === 'object' && x.name) castList.push(String(x.name).toLowerCase());
        });
      } else if (typeof v === 'string') {
        v.split(',').forEach(s => castList.push(s.trim().toLowerCase()));
      }
    };
    extractCast(item.cast);
    extractCast(item.actorsData);
    extractCast(item.maleActors);
    extractCast(item.femaleActors);
    const castStr = castList.join(' ');
    const director = (item.director || '').trim().toLowerCase();
    const desc = (item.description || '').toLowerCase();

    const gRaw = item.genres || [];
    const genresList = Array.isArray(gRaw)
      ? gRaw.map((g: any) => String(g).toLowerCase().trim())
      : (typeof gRaw === 'string' ? gRaw.split(',').map((s: string) => s.trim().toLowerCase()) : []);
    const genresStr = genresList.join(' ');
    const yearStr = String(item.year || '');

    let score = 0;

    // 1. Full Title Matches
    if (title === cleanQ || titleAlpha === qAlphanum || titleNoSpace === qNoSpace) {
      score += 5000;
    } else if (title.startsWith(cleanQ) || titleAlpha.startsWith(qAlphanum) || titleNoSpace.startsWith(qNoSpace)) {
      score += 2500;
    } else if (titleAlpha.includes(qAlphanum) || (qNoSpace.length >= 4 && titleNoSpace.includes(qNoSpace))) {
      score += 1200;
    }

    if (origTitle && (origTitle === cleanQ || origAlpha === qAlphanum || origNoSpace === qNoSpace)) {
      score += 3000;
    } else if (origAlpha && (origAlpha.startsWith(qAlphanum) || origNoSpace.startsWith(qNoSpace))) {
      score += 1500;
    } else if (origAlpha && (origAlpha.includes(qAlphanum) || (qNoSpace.length >= 4 && origNoSpace.includes(qNoSpace)))) {
      score += 800;
    }

    if (franchise && (franchise === cleanQ || franchiseAlpha === qAlphanum || franchiseNoSpace === qNoSpace)) {
      score += 2500;
    } else if (franchiseAlpha && (franchiseAlpha.includes(qAlphanum) || (qNoSpace.length >= 4 && franchiseNoSpace.includes(qNoSpace)))) {
      score += 800;
    }

    // 2. Individual Term Matching
    let sigInTitle = 0;
    let sigInFranchise = 0;
    let sigInPeople = 0;
    let sigInGenreYear = 0;
    let sigInDesc = 0;

    for (const t of termsToUse) {
      if (titleAlpha.includes(t) || (origAlpha && origAlpha.includes(t))) {
        sigInTitle++;
        score += 200;
      } else if (franchiseAlpha && franchiseAlpha.includes(t)) {
        sigInFranchise++;
        score += 150;
      } else if (castStr.includes(t) || director.includes(t)) {
        sigInPeople++;
        score += 100;
      } else if (genresStr.includes(t) || yearStr === t) {
        sigInGenreYear++;
        score += 60;
      } else if (desc.includes(t)) {
        sigInDesc++;
        score += 10;
      }
    }

    const totalPrimaryMatches = sigInTitle + sigInFranchise + sigInPeople + sigInGenreYear;

    // 3. Multi-Term Strictness Rule
    if (termsToUse.length >= 2) {
      const matchRatio = totalPrimaryMatches / termsToUse.length;
      const isPhraseMatch = titleAlpha.includes(qAlphanum) ||
        (origAlpha && origAlpha.includes(qAlphanum)) ||
        (franchiseAlpha && franchiseAlpha.includes(qAlphanum)) ||
        (qNoSpace.length >= 4 && titleNoSpace.includes(qNoSpace));

      if (!isPhraseMatch && matchRatio < 0.75) {
        score = 0;
      } else {
        if (totalPrimaryMatches === termsToUse.length) {
          score += 800;
        }
        if (sigInTitle === termsToUse.length) {
          score += 1200;
        }
      }
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  // Sort by Score DESC, then Rating DESC, then Year DESC
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const rDiff = (Number(b.item.rating) || 0) - (Number(a.item.rating) || 0);
    if (Math.abs(rDiff) > 0.01) return rDiff;
    return (Number(b.item.year) || 0) - (Number(a.item.year) || 0);
  });

  return scored.map(s => s.item);
}

export function searchContent(query: string, category?: string | null, contentArray?: ContentItem[]): ContentItem[] {
  const items = contentArray || getMockContent();
  return rankAndFilterContent(items, query, category);
}

