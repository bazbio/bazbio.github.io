// 피부·미용·의료기기 뉴스를 Google News RSS에서 수집해 news.json 생성
// GitHub Actions가 매일 아침 실행 (외부 패키지 불필요, Node 20+)
import { writeFileSync } from 'fs';

const QUERIES = [
  '피부과 레이저',
  '미용 의료기기',
  '에스테틱 피부미용',
  '보툴리눔 필러 스킨부스터',
];

const FEED = q =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:3d&hl=ko&gl=KR&ceid=KR:ko`;

function decode(s) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').trim();
}

function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const block = m[1];
    const pick = tag => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 's'));
      return mm ? decode(mm[1]) : '';
    };
    const title = pick('title');
    const link = pick('link');
    const pubDate = pick('pubDate');
    const source = pick('source') || '뉴스';
    if (!title || !link) continue;
    items.push({
      t: title.replace(new RegExp(`\\s*-\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), ''),
      u: link,
      s: source,
      d: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

const all = [];
for (const q of QUERIES) {
  try {
    const res = await fetch(FEED(q), { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) { console.error(`feed failed (${res.status}): ${q}`); continue; }
    all.push(...parseItems(await res.text()));
  } catch (e) {
    console.error(`feed error: ${q}`, e.message);
  }
}

// 제목 기준 중복 제거 (공백·기호 무시) 후 최신순 12건
const seen = new Set();
const items = all
  .sort((a, b) => new Date(b.d) - new Date(a.d))
  .filter(n => {
    const key = n.t.replace(/[\s\W]/g, '').slice(0, 40);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0, 12);

if (!items.length) {
  console.error('수집된 뉴스가 없어 news.json을 갱신하지 않습니다.');
  process.exit(1);
}

writeFileSync('news.json', JSON.stringify({ updated: new Date().toISOString(), items }, null, 1));
console.log(`news.json 갱신 완료: ${items.length}건`);
