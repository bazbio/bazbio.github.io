// 게시판: 교육자료를 호수별로 모아 본다. 글은 메일 자동 확인이 올리고, 관리자는 화면에서 직접 올리거나 고칠 수 있다.
// 본문은 자료이므로 DOM에 글자로만 넣는다.

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

const MAX_PDF_BYTES = 30 * 1024 * 1024;

/** What is wrong with a chosen file, in the reader's words, or null. The server proves the stored file again. */
export function pdfProblem({ name, size, head }) {
  if (!/\.pdf$/i.test(name)) return 'PDF 파일만 올릴 수 있습니다.';
  if (size > MAX_PDF_BYTES) return 'PDF는 30MB까지 올릴 수 있습니다.';
  if (size < 5 || head !== '%PDF-') return 'PDF 파일이 아니거나 손상되었습니다.';
  return null;
}

/** The number a new post is offered: one past the newest, whatever gaps deleted posts left. */
export const nextIssue = posts => Math.max(0, ...posts.map(post => post.issue)) + 1;

/** Today in Korea, as the date field wants it. */
export const koreanToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

/** Newest issue first, the same order the server gives. */
const inOrder = posts => [...posts].sort((a, b) => b.issue - a.issue);

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

// Kept between renders, because the app redraws the whole page: a reader stays on the post they opened, and a form
// keeps its words and its chosen file. A save or a deletion outlives the screen that began it, so it reports to the
// screen that is there when it ends.
let cachedPosts = null, openId = null, form = null, removing = null, screen = null;
// Raised by every list request and every write: a list asked for before a write says nothing about after it.
let listTurn = 0;

const INTERRUPTED = '서버 연결이 끊겼습니다. 다시 시도해 주세요.';
/** A cut connection, a timeout or a server error says nothing about whether the work was done. */
const interrupted = error => error?.name === 'AbortError' || error?.name === 'TimeoutError' || error instanceof TypeError;
const unknownResult = error => interrupted(error) || error?.code >= 500;
const reason = (error, fallback) => (unknownResult(error) ? INTERRUPTED : error?.message || fallback);
const SAVE_TRIES = 3;

function merge(saved, replacedId) {
  listTurn++;
  if (cachedPosts) cachedPosts = inOrder([...cachedPosts.filter(item => item.id !== replacedId && item.id !== saved.id), saved]);
}

export function mountPosts(root, { apiRequest, toast, canUpload = false, owner = null, retryDelayMs = 3000, fetchImpl = (...args) => window.fetch(...args) }) {
  const controller = new AbortController();
  let destroyed = false;
  // A draft is its writer's: it outlasts an expired session, not a change of person.
  if (form && form.owner !== owner) form = null;
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

  /** Sends a chosen PDF to storage and returns what the server needs to know about it. */
  async function sendFile(job, chosen, say) {
    say('파일을 확인하고 있습니다.');
    const tooBig = pdfProblem({ name: chosen.name, size: chosen.size, head: '%PDF-' });
    if (tooBig) throw new Error(tooBig);
    let bytes;
    // The file may have moved or changed since it was chosen, and the form keeps it across screens.
    try { bytes = new Uint8Array(await chosen.arrayBuffer()); }
    catch { job.file = null; throw new Error('파일을 읽지 못했습니다. 파일을 다시 골라 주세요.'); }
    const problem = pdfProblem({ name: chosen.name, size: bytes.length, head: String.fromCharCode(...bytes.subarray(0, 5)) });
    if (problem) throw new Error(problem);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const file = { name: chosen.name, size: bytes.length, sha256: [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    say('파일을 올리고 있습니다.');
    const ready = await apiRequest('/api/admin/board-file', 'POST', { file });
    if (ready.stored) return file;
    if (new URL(ready.uploadUrl).protocol !== 'https:') throw new Error('Unexpected upload address');
    let response;
    try { response = await fetchImpl(ready.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: bytes }); }
    catch { throw new Error('파일을 올리지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); }
    if (!response.ok) throw new Error('파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return file;
  }

  function finishSave(job, saved, fileLeft) {
    merge(saved, job.post?.id);
    openId = saved.id;
    if (form === job) form = null;
    toast(fileLeft ? '글은 저장했지만 이전 PDF를 지우지 못했습니다.' : job.post ? '게시글을 고쳤습니다.' : '게시판에 올렸습니다.');
    screen?.draw();
  }

  function failSave(job, text) {
    job.saving = false;
    job.message = text;
    job.error = true;
    // The form is kept for the return, and whoever has left still hears of it.
    if (screen) screen.draw(); else toast('#' + job.sent.issue + ' 저장 실패: ' + text);
  }

  /** The same save sent again is safe: the server recognises its key. So a lost answer is resolved by asking again, not by guessing. */
  async function sendSave(payload, say) {
    for (let attempt = 1; ; attempt++) {
      try { return await apiRequest('/api/admin/board-save', 'POST', payload); }
      catch (error) {
        if (!unknownResult(error) || attempt === SAVE_TRIES) throw error;
        say('저장 결과를 확인하고 있습니다.');
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  async function submit(job) {
    if (job.saving) return;
    // Taken once: what is sent is what the form showed when the button was pressed.
    const sent = { ...job.values, issue: Number(job.values.issue) }, chosen = job.file, words = JSON.stringify(sent) + (chosen?.name ?? '');
    // Pressed again with the same words after an unknown end, it is the same save.
    if (job.keyFor !== words) { job.key = crypto.randomUUID(); job.keyFor = words; }
    Object.assign(job, { saving: true, sent, error: false, message: '' });
    listTurn++;
    const say = text => { job.message = text; screen?.draw(); };
    let saving = false, result;
    try {
      // Told before the file travels. The server decides again, against posts this page has not seen.
      if (cachedPosts.some(item => item.issue === sent.issue && item.id !== job.post?.id)) throw new Error('#' + sent.issue + '은 이미 있습니다. 호수를 바꾸거나 그 글을 수정해 주세요.');
      const file = chosen ? await sendFile(job, chosen, say) : null;
      say('글을 저장하고 있습니다.');
      saving = true;
      result = await sendSave({ saveKey: job.key, postId: job.post?.id ?? null, base: job.post?.stamp ?? null, issue: sent.issue, title: sent.title, publishedDate: sent.day, body: sent.body, ...(file ? { file } : {}) }, say);
    } catch (error) {
      failSave(job, saving && unknownResult(error) ? '저장됐는지 확인하지 못했습니다. 잠시 뒤 다시 눌러 주세요. 같은 글이 두 번 올라가지는 않습니다.' : reason(error, '저장하지 못했습니다.'));
      return;
    }
    finishSave(job, result.post, result.fileLeft);
  }

  /** A form for a new post, or for the one given. Its words live in form, so a redraw or a detour loses nothing. */
  function formView() {
    const job = form, { post, values } = job;
    page.replaceChildren();
    const field = (label, control, hint) => {
      const wrap = element('label', 'post-field');
      wrap.append(element('span', 'post-field-label', label), control);
      if (hint) wrap.append(element('span', 'post-field-hint', hint));
      return wrap;
    };
    const bound = (control, key) => {
      control.value = values[key];
      control.addEventListener('input', () => { values[key] = control.value; });
      return control;
    };
    const input = (type, key, attributes = {}) => bound(Object.assign(element('input'), { type, ...attributes }), key);
    const issue = input('number', 'issue', { min: 1, max: 9999, step: 1, required: true });
    const day = input('date', 'day', { required: true });
    const title = input('text', 'title', { maxLength: 200, required: true });
    const body = bound(Object.assign(element('textarea'), { rows: 12, maxLength: 50000 }), 'body');
    const pdf = Object.assign(element('input'), { type: 'file', accept: 'application/pdf,.pdf', required: !post && !job.file });
    const fileHint = element('span', 'post-field-hint');
    const showFile = () => { fileHint.textContent = job.file ? '고른 파일: ' + job.file.name : post ? '지금 파일: ' + post.file.name + ' · 바꿀 때만 고르세요.' : 'PDF 1개, 30MB까지'; };
    pdf.addEventListener('change', () => { job.file = pdf.files[0] ?? job.file; showFile(); });
    showFile();
    const pdfField = field('PDF', pdf);
    pdfField.append(fileHint);
    const pair = element('div', 'post-field-pair');
    pair.append(field('호수', issue), field('날짜', day));
    const message = element('p', job.error ? 'post-form-message error' : 'post-form-message', job.message);
    message.setAttribute('role', 'status');
    const cancel = button('취소', 'post-action', () => { form = null; draw(); load(); });
    const save = element('button', 'post-action primary', post ? '저장' : '올리기');
    save.type = 'submit';
    const actions = element('div', 'post-form-actions');
    actions.append(cancel, save);
    // A fieldset locks every control at once while the form is on its way.
    const fields = element('fieldset', 'post-fields');
    fields.disabled = job.saving;
    fields.append(pair, field('제목', title), field('본문 (선택)', body, '■로 시작하는 줄은 소제목, - 로 시작하는 줄은 목록으로 보입니다.'), pdfField, message, actions);
    const shell = element('form', 'post-form');
    shell.append(fields);
    shell.addEventListener('submit', event => { event.preventDefault(); return submit(job); });
    const heading = element('div', 'post-heading');
    heading.append(element('h2', '', post ? '#' + post.issue + ' 수정' : '자료 올리기'));
    page.append(heading, shell);
    return post ? title : issue;
  }

  function openForm(post) {
    form = { owner, post, file: null, saving: false, error: false, message: '', values: { issue: String(post?.issue ?? nextIssue(cachedPosts)), day: post?.publishedDate ?? koreanToday(), title: post?.title ?? '', body: post?.body ?? '' } };
    formView().focus();
  }

  async function remove(post) {
    if (removing) return;
    const fromMail = post.fromMail ? ' 메일로 다시 보내기 전에는 올라오지 않습니다.' : '';
    if (!window.confirm('#' + post.issue + ' 「' + post.title + '」을 삭제할까요? PDF도 함께 지워집니다.' + fromMail)) return;
    removing = post.id;
    listTurn++;
    draw();
    try {
      const result = await apiRequest('/api/admin/board-remove', 'POST', { postId: post.id, base: post.stamp });
      toast(result.fileLeft ? '글은 지웠지만 PDF 파일을 지우지 못했습니다.' : '게시글을 삭제했습니다.');
      listTurn++;
      if (cachedPosts) cachedPosts = cachedPosts.filter(item => item.id !== post.id);
      if (openId === post.id) openId = null;
      removing = null;
      screen?.draw();
    } catch (error) {
      removing = null;
      toast(reason(error, '삭제하지 못했습니다.'));
      screen?.draw();
      screen?.load();
    }
  }

  function listView(posts) {
    page.replaceChildren();
    const heading = element('div', 'post-heading post-heading-row');
    const words = element('div');
    words.append(element('h2', '', 'AI 인사이트'), element('p', '', '경영혁신실 교육자료입니다. 메일로 배포되면 자동으로 올라옵니다.'));
    heading.append(words);
    if (canUpload) heading.append(button('자료 올리기', 'post-action primary', () => openForm(null)));
    page.append(heading);
    if (!posts.length) { page.append(element('div', 'post-empty', '아직 올라온 자료가 없습니다.')); return; }
    const list = element('div', 'post-list');
    for (const post of posts) {
      const row = button('', 'post-row', () => { openId = post.id; draw(); });
      const main = element('span', 'post-row-main');
      main.append(element('span', 'post-row-title', post.title), element('span', 'post-row-meta', [dayText(post.publishedDate), post.author].filter(Boolean).join(' · ')));
      row.append(element('span', 'post-issue', '#' + post.issue), main, element('span', 'post-file-tag', 'PDF'));
      list.append(row);
    }
    page.append(list);
  }

  function detailView(post) {
    page.replaceChildren();
    const back = button('목록', 'post-back', () => { openId = null; draw(); });
    const head = element('header', 'post-detail-head');
    head.append(element('div', 'post-kicker', post.board + ' #' + post.issue), element('h2', '', post.title), element('div', 'post-row-meta', [dayText(post.publishedDate), post.author].filter(Boolean).join(' · ')));
    const file = element('div', 'post-file');
    const name = element('div', 'post-file-name');
    name.append(element('strong', '', post.file.name), element('span', '', sizeText(post.file.size)));
    file.append(name, button('PDF 열기', 'post-action primary', () => openFile(post, false)), button('내려받기', 'post-action', () => openFile(post, true)));
    page.append(back, head, file, bodyView(post));
    if (canUpload) {
      const manage = element('div', 'post-manage');
      const edit = button('수정', 'post-action', () => openForm(post)), drop = button('삭제', 'post-action danger', () => remove(post));
      edit.disabled = drop.disabled = !!removing;
      manage.append(edit, drop);
      page.append(manage);
    }
  }

  function draw() {
    if (destroyed || !cachedPosts) return;
    if (form) { formView(); return; }
    const post = cachedPosts.find(item => item.id === openId);
    if (post) detailView(post); else { openId = null; listView(cachedPosts); }
  }

  async function load() {
    if (!cachedPosts) page.replaceChildren(element('div', 'post-empty', '자료를 불러오고 있습니다.'));
    else draw();
    const turn = ++listTurn;
    try {
      const { posts } = await apiRequest('/api/board', 'GET', undefined, controller.signal);
      if (destroyed || turn !== listTurn) return;
      const first = !cachedPosts, changed = JSON.stringify(posts) !== JSON.stringify(cachedPosts);
      cachedPosts = posts;
      // A form being typed in is left alone, and the list waits behind it. One waiting for the list is drawn now.
      if (first || (changed && !form)) draw();
    } catch (error) {
      if (destroyed || error.name === 'AbortError' || turn !== listTurn) return;
      if (cachedPosts) { toast(error.message || '게시판을 새로 불러오지 못했습니다.'); return; }
      const failed = element('div', 'post-empty');
      failed.append(element('p', '', error.message || '게시판을 불러오지 못했습니다.'), button('다시 시도', 'post-action', load));
      page.replaceChildren(failed);
    }
  }

  const here = { draw, load };
  screen = here;
  load();
  return { destroy() { destroyed = true; if (screen === here) screen = null; controller.abort(); page.remove(); } };
}

/** Called when the session ends, so one member's list is never shown to the next. A draft goes by its owner. */
export function forgetPosts() { cachedPosts = null; openId = null; removing = null; listTurn++; }
