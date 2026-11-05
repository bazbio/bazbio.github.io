// 게시판: 메일로 배포된 교육자료를 호수별로 모아 본다. 글은 메일 자동 확인이 올리며, 화면은 읽기만 한다.
// 메일 본문은 자료이므로 DOM에 글자로만 넣는다.

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined && text !== null) result.textContent = String(text);
  return result;
}

function button(label, className, handler) {
  const result = element('button', className, label);
  result.type = 'button';
  result.addEventListener('click', handler);
  return result;
}

const dayText = value => value.replaceAll('-', '.');
const sizeText = bytes => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

/** A line's text with its https addresses as links that leave this page. */
export function inlineParts(line) {
  const parts = [];
  let last = 0;
  // Korean particles and full-width marks follow addresses directly, so only address characters are taken.
  // A Korean path is taken when it starts a segment; a bracket stays when its pair is inside the address.
  for (const match of line.matchAll(/https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+(?:(?<=\/)[가-힣A-Za-z0-9\-._~%()]+)*/g)) {
    let address = match[0].replace(/[.,;:!?]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']']]) while (address.endsWith(close) && address.split(close).length > address.split(open).length) address = address.slice(0, -1).replace(/[.,;:!?]+$/, '');
    if (match.index > last) parts.push({ text: line.slice(last, match.index) });
    parts.push({ url: address });
    last = match.index + address.length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts;
}

/** The stored mail text as headings (■), bullets (-) and paragraphs. */
export function bodyBlocks(body) {
  const blocks = [];
  for (const line of body.split('\n').filter(Boolean)) {
    if (line.startsWith('■')) blocks.push({ type: 'heading', text: line.replace(/^■\s*/, '') });
    else if (/^-\s/.test(line)) {
      if (blocks.at(-1)?.type !== 'list') blocks.push({ type: 'list', items: [] });
      blocks.at(-1).items.push(line.replace(/^-\s+/, ''));
    } else blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}

function inline(target, line) {
  for (const part of inlineParts(line)) {
    if (part.text !== undefined) { target.append(part.text); continue; }
    const link = element('a', '', part.url);
    link.href = part.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    target.append(link);
  }
  return target;
}

function bodyView(post) {
  const body = element('div', 'post-body');
  for (const block of bodyBlocks(post.body)) {
    if (block.type === 'heading') body.append(element('h3', '', block.text));
    else if (block.type === 'paragraph') body.append(inline(element('p'), block.text));
    else {
      const list = element('ul');
      for (const item of block.items) list.append(inline(element('li'), item));
      body.append(list);
    }
  }
  return body;
}

// Kept between renders: the app redraws the whole page, and a reader stays on the post they opened.
let cachedPosts = null, openId = null;

export function mountPosts(root, { apiRequest, toast }) {
  const controller = new AbortController();
  let destroyed = false;
  const page = element('div', 'post-page');
  root.append(page);

  async function openFile(post, download) {
    // A tab opened after waiting for the server would be blocked, so it is opened by the click itself.
    const tab = download ? null : window.open('about:blank', '_blank');
    if (!download && !tab) { toast('브라우저가 새 창을 막았습니다. 팝업을 허용해 주세요.'); return; }
    try {
      const { url } = await apiRequest('/api/board/file', 'POST', { postId: post.id, download });
      if (new URL(url).protocol !== 'https:') throw new Error('Unexpected file address');
      if (tab) { tab.opener = null; tab.location.href = url; } else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toast(error.message || 'PDF를 열지 못했습니다.');
    }
  }

  function listView(posts) {
    page.replaceChildren();
    const heading = element('div', 'post-heading');
    heading.append(element('h2', '', 'AI 인사이트'), element('p', '', '경영혁신실 교육자료입니다. 메일로 배포되면 자동으로 올라옵니다.'));
    page.append(heading);
    if (!posts.length) { page.append(element('div', 'post-empty', '아직 올라온 자료가 없습니다.')); return; }
    const list = element('div', 'post-list');
    for (const post of posts) {
      const row = button('', 'post-row', () => { openId = post.id; draw(); });
      const main = element('span', 'post-row-main');
      main.append(element('span', 'post-row-title', post.title), element('span', 'post-row-meta', [dayText(post.publishedDate), post.author].filter(Boolean).join(' · ')));
      row.append(element('span', 'post-issue', `#${post.issue}`), main, element('span', 'post-file-tag', 'PDF'));
      list.append(row);
    }
    page.append(list);
  }

  function detailView(post) {
    page.replaceChildren();
    const back = button('목록', 'post-back', () => { openId = null; draw(); });
    const head = element('header', 'post-detail-head');
    head.append(element('div', 'post-kicker', `${post.board} #${post.issue}`), element('h2', '', post.title), element('div', 'post-row-meta', [dayText(post.publishedDate), post.author].filter(Boolean).join(' · ')));
    const file = element('div', 'post-file');
    const name = element('div', 'post-file-name');
    name.append(element('strong', '', post.file.name), element('span', '', sizeText(post.file.size)));
    file.append(name, button('PDF 열기', 'post-action primary', () => openFile(post, false)), button('내려받기', 'post-action', () => openFile(post, true)));
    page.append(back, head, file, bodyView(post));
  }

  function draw() {
    if (destroyed || !cachedPosts) return;
    const post = cachedPosts.find(item => item.id === openId);
    if (post) detailView(post); else { openId = null; listView(cachedPosts); }
  }

  async function load() {
    if (!cachedPosts) page.replaceChildren(element('div', 'post-empty', '자료를 불러오고 있습니다.'));
    else draw();
    try {
      const { posts } = await apiRequest('/api/board', 'GET', undefined, controller.signal);
      if (destroyed) return;
      const changed = JSON.stringify(posts) !== JSON.stringify(cachedPosts);
      cachedPosts = posts;
      if (changed) draw();
    } catch (error) {
      if (destroyed || error.name === 'AbortError') return;
      if (cachedPosts) { toast(error.message || '게시판을 새로 불러오지 못했습니다.'); return; }
      const failed = element('div', 'post-empty');
      failed.append(element('p', '', error.message || '게시판을 불러오지 못했습니다.'), button('다시 시도', 'post-action', load));
      page.replaceChildren(failed);
    }
  }

  load();
  return { destroy() { destroyed = true; controller.abort(); page.remove(); } };
}

/** Called when the signed-in member changes, so one member's list is never shown to the next. */
export function forgetPosts() { cachedPosts = null; openId = null; }
