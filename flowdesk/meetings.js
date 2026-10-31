export const MEETING_SOURCE_URL = ''; // The selected mailbox is supplied by monitor.sourceUrl.

const ICON_PATHS = {
  document: 'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2',
  external: 'M14 3h7v7M10 14 21 3M10 4H4v16h16v-6',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 7v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  warning: 'm12 3 10 18H2zM12 9v5M12 17h.1',
  user: 'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21v-3a8 8 0 0 1 16 0v3',
  link: 'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
};

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined && text !== null) result.textContent = String(text);
  return result;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.document);
  svg.append(path);
  return svg;
}

function button(label, className, handler, iconName) {
  const result = element('button', `mc-button ${className || ''}`.trim());
  result.type = 'button';
  if (iconName) result.append(icon(iconName));
  result.append(element('span', '', label));
  if (handler) result.addEventListener('click', handler);
  return result;
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['erp.bazbiomedic.com', 'mail.google.com'].includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') ? url.href : MEETING_SOURCE_URL;
  } catch { return MEETING_SOURCE_URL; }
}

function sourceLink(label, href, className = '') {
  const link = element('a', `mc-button ${className}`.trim());
  const safe = safeSourceUrl(href);
  if (!safe) return element('span', 'mc-source-pending', '원문 링크 미확인');
  link.href = safe;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(icon('external'), element('span', '', label));
  return link;
}

function dateText(value, withTime = false) {
  if (!value) return '아직 없음';
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value);
  if (Number.isNaN(parsed.getTime())) return '날짜 확인 필요';
  return parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

function statusInfo(monitor) {
  const status = String(monitor?.status || 'unconfigured');
  if (status === 'needs_source') return { tone: 'attention', label: '메일 본문 연결 확인 중', detail: monitor.details || '회의록 메일 본문에 접근할 수 있는지 확인한 후 자동 등록을 시작합니다.' };
  if (['needs_login', 'login_required', 'auth_required'].includes(status)) return { tone: 'attention', label: '메일함 로그인 필요', detail: '선택한 메일함의 연결 또는 로그인 상태를 확인해 주세요.' };
  if (['error', 'failed', 'unreachable', 'disconnected', 'blocked', 'unavailable'].includes(status)) return { tone: 'error', label: '메일 확인 연결 필요', detail: monitor.error || monitor.details || '수신 메일을 확인하지 못했습니다. 메일함 연결 상태를 확인해 주세요.' };
  if (['running', 'checking'].includes(status)) return { tone: 'progress', label: '회의록 메일 확인 중', detail: '새로 받은 회의록 메일과 처리 이력을 대조하고 있습니다.' };
  if (['success', 'ok', 'ready', 'connected', 'idle', 'no_change'].includes(status)) return { tone: 'success', label: '최근 확인 완료', detail: monitor.details || '새 회의록 메일이 확인되면 실행 과제를 등록합니다.' };
  if (status === 'registered') return { tone: 'success', label: '최근 업무 등록 완료', detail: monitor.details || '최근 처리한 회의록 메일의 실행 과제를 업무로 등록했습니다.' };
  if (status === 'review') return { tone: 'attention', label: '확인이 필요한 항목 있음', detail: monitor.details || '담당자 또는 실행 내용을 확인한 뒤 업무로 등록할 수 있습니다.' };
  if (status === 'baseline') return { tone: 'neutral', label: '기준 이력 저장 완료', detail: monitor.details || '이전 메일을 처리 기준으로 기록했습니다. 기준 이력에서는 업무를 새로 생성하지 않았습니다.' };
  if (status === 'paused') return { tone: 'neutral', label: '확인 일시 중지', detail: '등록된 업무와 이전 처리 이력은 계속 확인할 수 있습니다.' };
  return { tone: 'neutral', label: '수신 메일함 연결 확인 중', detail: '회의록을 받는 메일함과 발신자 조건이 확인되면 자동 등록을 시작합니다.' };
}

const itemStatuses = {
  registered: ['등록 완료', 'success'], review: ['검토 필요', 'attention'], dismissed: ['등록 제외', 'neutral'], unchanged: ['기존 항목', 'neutral'], baseline: ['기준 이력', 'neutral'],
};

/**
 * Render the meeting automation center into a caller-owned container.
 * Call destroy() before removing/replacing the container.
 * Callbacks: onTask(taskId), onChanged(), toast(message).
 * Returns { refresh(): Promise<void>, destroy(), ready: Promise<void> }.
 */
export function mountMeetingCenter(container, options = {}) {
  if (!(container instanceof Element)) throw new TypeError('회의록 화면을 표시할 요소가 필요합니다.');
  let members = Array.isArray(options.members) ? options.members : [];
  let data = { meetings: [], monitor: {} };
  let destroyed = false;
  let loading = true;
  let error = '';
  let activeTab = 'review';
  let editing = null;
  let busy = false;
  let requestId = 0;
  let abort = null;
  container.classList.add('meeting-center');
  const announce = message => options.toast?.(message);

  async function api(url, payload, signal) {
    if(options.apiRequest)return options.apiRequest(url,payload===undefined?'GET':'POST',payload,signal);
    let response;
    try {
      response = await fetch(url, payload === undefined ? { credentials: 'same-origin', cache: 'no-store', signal } : {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json', 'x-flowdesk-client': 'workspace' },
        body: JSON.stringify(payload),
      });
    } catch (reason) {
      if (reason.name === 'AbortError') throw reason;
      throw new Error('자동 등록 서버에 연결할 수 없습니다. 앱 서버가 실행 중인지 확인해 주세요.');
    }
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('자동 등록 서버 연결이 필요합니다. 정적 미리보기에서는 처리 이력을 읽을 수 없습니다.');
    const result = await response.json();
    if (!response.ok) { const failure = new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `요청을 처리하지 못했습니다 (${response.status}).`); failure.code = result.code; throw failure; }
    return result;
  }

  async function refresh({ quiet = false } = {}) {
    if (destroyed) return;
    const id = ++requestId;
    abort?.abort();
    abort = new AbortController();
    if (!quiet) { loading = true; render(); }
    try {
      const incoming = await api('/api/meetings', undefined, abort.signal);
      if (destroyed || id !== requestId) return;
      if (!Array.isArray(incoming.meetings) || !incoming.monitor || typeof incoming.monitor !== 'object') throw new Error('처리 이력 응답의 형식을 확인할 수 없습니다.');
      data = { meetings: incoming.meetings, monitor: incoming.monitor };
      if (Array.isArray(incoming.members)) members = incoming.members;
      error = '';
    } catch (reason) {
      if (destroyed || id !== requestId || reason.name === 'AbortError') return;
      error = reason.message;
    } finally {
      if (!destroyed && id === requestId) { loading = false; if (!editing) render(); }
    }
  }

  function badge(label, tone = 'neutral') { return element('span', `mc-badge mc-${tone}`, label); }
  function reviewItems() {
    return data.meetings.flatMap(meeting => (Array.isArray(meeting.items) ? meeting.items : []).filter(item => item.status === 'review').map(item => ({ meeting, item })));
  }

  function titleBlock() {
    const head = element('div', 'mc-page-heading');
    const description = element('div');
    description.append(element('span', 'mc-eyebrow', '경영혁신실 · 주간 미팅'), element('h1', '', '회의록에서 실행까지'), element('p', '', '받은 회의록 메일의 할 일을 담당자별 업무로 연결합니다.'));
    const actions = element('div', 'mc-heading-actions');
    const refreshButton = button('처리 이력 새로고침', 'mc-secondary', () => refresh(), 'refresh');
    refreshButton.disabled = loading || busy || Boolean(editing);
    actions.append(refreshButton);
    if (safeSourceUrl(data.monitor.sourceUrl)) actions.append(sourceLink('메일함 열기', data.monitor.sourceUrl, 'mc-primary'));
    else actions.append(element('span', 'mc-source-pending', '수신 메일함 연결 확인 중'));
    head.append(description, actions);
    return head;
  }

  function flow() {
    const card = element('section', 'mc-flow', null);
    card.setAttribute('aria-label', '회의록 자동 등록 흐름');
    const steps = [ ['document', '회의록 메일 확인', '새로 받은 정기 미팅 회의록'], ['check', '할 일 추출', '실행 내용과 기한을 정리'], ['user', '담당자 매칭', '명확한 담당자에게 배정'], ['arrow', '자동 등록', '원문과 함께 업무로 연결'] ];
    steps.forEach(([name, label, detail], index) => {
      const step = element('div', 'mc-flow-step');
      const mark = element('span', 'mc-flow-icon'); mark.append(icon(name));
      const words = element('div'); words.append(element('span', 'mc-step-number', `0${index + 1}`), element('strong', '', label), element('small', '', detail));
      step.append(mark, words);
      card.append(step);
      if (index < steps.length - 1) { const arrow = element('span', 'mc-flow-arrow'); arrow.append(icon('arrow')); card.append(arrow); }
    });
    return card;
  }

  function monitorCard() {
    const state = data.monitor.status === 'review' && reviewItems().length === 0
      ? { tone: 'success', label: '검토 처리 완료', detail: '현재 검토할 항목이 없습니다. 최근 메일 확인 시점은 아래에서 확인할 수 있습니다.' }
      : statusInfo(data.monitor);
    const row = element('section', 'mc-monitor');
    const status = element('div', 'mc-monitor-state');
    const glyph = element('span', `mc-status-icon mc-${state.tone}`); glyph.append(icon(state.tone === 'success' ? 'check' : state.tone === 'attention' || state.tone === 'error' ? 'warning' : 'clock'));
    const words = element('div'); words.append(element('strong', '', state.label), element('p', '', String(state.detail).slice(0,1000)));
    status.append(glyph, words);
    const schedule = element('div', 'mc-monitor-detail');
    const scheduleHeading = element('div', 'mc-schedule-heading');
    scheduleHeading.append(element('span', '', '확인 시간'), badge(data.monitor.automationStatus === 'ACTIVE' ? '예약 활성' : '예약 설정 확인 중', data.monitor.automationStatus === 'ACTIVE' ? 'success' : 'neutral'));
    schedule.append(scheduleHeading, element('strong', '', '매주 금요일 13:00–20:00'), element('small', '', '매시간 · 한국 시간 (Asia/Seoul)'));
    const checked = element('div', 'mc-monitor-detail'); checked.append(element('span', '', '마지막 확인 시도'), element('strong', '', dateText(data.monitor.lastCheckedAt, true)), element('small', '', data.monitor.lastCheckedAt ? '연결 및 처리 확인 시점' : '첫 확인을 기다리고 있습니다'));
    row.append(status, schedule, checked);
    return row;
  }

  function sourceCriteria() {
    const section = element('section', 'mc-source-criteria');
    section.setAttribute('aria-label', '회의록 메일 등록 기준');
    const heading = element('div', 'mc-criteria-heading');
    heading.append(icon('document'), element('strong', '', '회의록 메일 등록 기준'));
    const grid = element('dl', 'mc-criteria-grid');
    const rules = [
      ['확인할 메일함', '받은메일함'],
      ['제목 형식', data.monitor.subjectPattern || '[회의록] 경영혁신실 미팅 (YYYY.MM.DD)'],
      ['보낸 사람 표시 이름', data.monitor.senderDisplayName || '유영환'],
    ];
    rules.forEach(([label, value]) => { const row = element('div'); row.append(element('dt', '', label), element('dd', '', value)); grid.append(row); });
    section.append(heading, grid, element('p', 'mc-criteria-exclusions', '보낸메일함은 제외합니다. 같은 메일의 PDF 사본은 별도 업무로 중복 등록하지 않습니다.'));
    return section;
  }

  function stats() {
    const allItems = data.meetings.flatMap(m => Array.isArray(m.items) ? m.items : []);
    const entries = [ ['회의록에서 등록한 업무', new Set(allItems.map(i => i.taskId).filter(Boolean)).size, '개', 'success'], ['검토가 필요한 항목', reviewItems().length, '개', 'attention'], ['처리한 회의록', data.meetings.filter(m => m.status !== 'baseline').length, '건', 'neutral'] ];
    const grid = element('div', 'mc-stat-grid');
    entries.forEach(([label, count, unit, tone]) => {
      const card = element('div', `mc-stat-card mc-stat-${tone}`);
      const value = element('div', 'mc-stat-value'); value.append(element('strong', '', count), element('span', '', unit));
      card.append(element('span', 'mc-stat-label', label), value);
      grid.append(card);
    });
    return grid;
  }

  function evidence(meeting, item) {
    const details = element('details', 'mc-evidence');
    details.append(element('summary', '', '메일 본문 근거 보기'));
    details.append(element('blockquote', '', item.evidence || '저장된 원문 근거가 없습니다.'));
    const line = element('div', 'mc-evidence-footer'); line.append(element('span', '', meeting.title || '회의록 메일'), sourceLink('원문 열기', meeting.url, 'mc-link-button'));
    details.append(line);
    return details;
  }

  function field(labelText, control, optional) {
    const label = element('label', 'mc-field');
    label.append(element('span', '', labelText + (optional ? ' · 선택' : '')), control);
    return label;
  }

  function reviewEditor(meeting, item) {
    const form = element('form', 'mc-review-form');
    const title = element('input'); title.name = 'title'; title.required = true; title.maxLength = 500; title.value = item.title || '';
    const assignee = element('select'); assignee.name = 'assigneeId'; assignee.required = true;
    const empty = element('option', '', '담당자를 선택해 주세요'); empty.value = ''; assignee.append(empty);
    members.forEach(member => { const option = element('option', '', member.name); option.value = member.id; option.selected = member.id === (item.approvedAssigneeId || item.assigneeId) || (member.name === item.assigneeName && members.filter(m => m.name === item.assigneeName).length === 1); assignee.append(option); });
    const due = element('input'); due.type = 'date'; due.name = 'dueDate'; due.value = /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate || '') ? item.dueDate : '';
    const pair = element('div', 'mc-field-pair'); pair.append(field('담당자', assignee), field('마감일', due, true));
    const controls = element('div', 'mc-review-form-actions');
    const cancel = button('취소', 'mc-secondary', () => { editing = null; render(); });
    const save = button('업무로 등록', 'mc-primary', null, 'check'); save.type = 'submit';
    controls.append(cancel, save);
    const hint = element('p', 'mc-field-hint', members.length ? '선택한 담당자의 업무 목록에 등록됩니다.' : '프로젝트 개요에서 멤버를 먼저 추가한 후 다시 확인해 주세요.');
    form.append(field('실행할 업무', title), pair, hint, controls);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !title.value.trim() || !assignee.value) return;
      save.disabled = cancel.disabled = true;
      await resolveReview(meeting, item, 'register', { assigneeId: assignee.value, title: title.value.trim(), dueDate: due.value });
      if (!destroyed && form.isConnected) save.disabled = cancel.disabled = false;
    });
    return form;
  }

  async function resolveReview(meeting, item, decision, edits = {}) {
    if (busy) return;
    busy = true;
    try {
      await api('/api/meetings/review', { meetingKey: meeting.key, itemKey: item.key, expectedFingerprint: item.fingerprint, decision, ...edits });
      if (destroyed) return;
      editing = null;
      await refresh();
      announce(decision === 'register' ? '회의록 항목을 업무로 등록했습니다.' : '이 항목을 자동 등록 대상에서 제외했습니다.');
      try { await options.onChanged?.(); } catch { announce('업무 목록을 새로고침하면 변경 사항이 반영됩니다.'); }
    } catch (reason) { if (!destroyed) { if((reason.reason ?? reason.code) === 'ITEM_CHANGED') { editing = null; await refresh(); } announce(reason.message); } }
    finally { busy = false; if (!destroyed && !editing) render(); }
  }

  function reviewCard(meeting, item) {
    const card = element('article', 'mc-review-card');
    const head = element('div', 'mc-review-head');
    const labels = element('div', 'mc-item-heading'); labels.append(badge('검토 필요', 'attention'), element('span', 'mc-item-source', `${dateText(meeting.meetingDate)} · ${meeting.title || '회의록 메일'}`));
    head.append(labels);
    card.append(head, element('h3', '', item.title || '제목 확인 필요'));
    const meta = element('div', 'mc-item-meta');
    meta.append(element('span', '', `개인 담당자: ${item.assigneeName || '미확정'}`), element('span', '', item.dueDate ? `마감일: ${dateText(item.dueDate)}` : '마감일 미확정'));
    card.append(meta, element('p', 'mc-review-reason', item.reason || '담당자 또는 실행 내용을 확인해 주세요.'), evidence(meeting, item));
    if (editing?.meetingKey === meeting.key && editing?.itemKey === item.key) card.append(reviewEditor(meeting, item));
    else {
      const controls = element('div', 'mc-review-actions');
      const skip = button('등록 제외', 'mc-quiet', () => resolveReview(meeting, item, 'dismiss'));
      const edit = button('확인 후 등록', 'mc-secondary', () => { editing = { meetingKey: meeting.key, itemKey: item.key }; render(); container.querySelector('.mc-review-form input')?.focus(); }, 'arrow');
      skip.disabled = edit.disabled = busy;
      controls.append(skip, edit); card.append(controls);
    }
    return card;
  }

  function emptyReview() {
    const empty = element('div', 'mc-empty');
    const mark = element('span', 'mc-empty-icon'); mark.append(icon('check'));
    empty.append(mark, element('h3', '', '검토할 항목이 없습니다'), element('p', '', data.meetings.length ? '명확한 항목은 업무로 등록하고, 확인이 필요한 항목은 여기에 모읍니다.' : '새 회의록 메일에서 담당자가 모호하거나 내용이 달라진 항목을 여기에 모읍니다.'));
    return empty;
  }

  function ledgerItem(meeting, item) {
    const row = element('div', 'mc-ledger-item');
    const content = element('div', 'mc-ledger-item-main');
    const heading = element('div', 'mc-item-heading');
    const [label, tone] = itemStatuses[item.status] || ['상태 확인', 'neutral'];
    heading.append(badge(label, tone), element('strong', '', item.title || '제목 없음'));
    const meta = element('div', 'mc-item-meta'); meta.append(element('span', '', item.approvedAssigneeName || item.assigneeName || '개인 담당자 미확정'), element('span', '', item.dueDate ? dateText(item.dueDate) : '마감일 미확정'));
    content.append(heading, meta);
    if (item.reason) content.append(element('p', 'mc-ledger-reason', item.reason));
    content.append(evidence(meeting, item));
    row.append(content);
    if (item.taskId && typeof options.onTask === 'function') row.append(button('업무 열기', 'mc-link-button', () => options.onTask(item.taskId), 'arrow'));
    if (item.status === 'review') row.append(button('검토하기', 'mc-link-button', () => { activeTab = 'review'; editing = { meetingKey: meeting.key, itemKey: item.key }; render(); container.querySelector('.mc-review-form input')?.focus(); }, 'arrow'));
    return row;
  }

  function ledger() {
    const list = element('div', 'mc-ledger');
    const meetings = [...data.meetings].sort((a, b) => String(b.processedAt || b.meetingDate || '').localeCompare(String(a.processedAt || a.meetingDate || '')));
    if (!meetings.length) {
      const empty = element('div', 'mc-empty'); const mark = element('span', 'mc-empty-icon'); mark.append(icon('document'));
      empty.append(mark, element('h3', '', '아직 처리한 회의록이 없습니다'), element('p', '', '수신 메일 확인이 완료되면 회의록 메일과 등록 결과를 이곳에서 볼 수 있습니다.'));
      list.append(empty); return list;
    }
    meetings.forEach(meeting => {
      const details = element('details', 'mc-ledger-meeting');
      const summary = element('summary');
      const mark = element('span', 'mc-ledger-icon'); mark.append(icon('document'));
      const content = element('div', 'mc-ledger-summary'); content.append(element('strong', '', meeting.title || '제목 없는 회의록 메일'), element('span', '', `${dateText(meeting.meetingDate)} · ${dateText(meeting.processedAt, true)} 처리`));
      const sender = typeof meeting.sender === 'string' ? meeting.sender : meeting.sender?.name || meeting.sender?.address;
      if (sender) content.append(element('span', 'mc-mail-sender', `보낸 사람: ${sender}`));
      const counts = element('div', 'mc-ledger-counts');
      if (meeting.status === 'baseline') counts.append(badge('기준 이력', 'neutral'));
      else {
        const items = Array.isArray(meeting.items) ? meeting.items : [];
        counts.append(badge(`등록 ${new Set(items.map(i => i.taskId).filter(Boolean)).size}`, 'success'));
        const pending = items.filter(i => i.status === 'review').length;
        if (pending) counts.append(badge(`검토 ${pending}`, 'attention'));
      }
      summary.append(mark, content, counts);
      details.append(summary);
      const body = element('div', 'mc-ledger-body');
      const heading = element('div', 'mc-ledger-body-heading'); heading.append(element('p', '', meeting.status === 'baseline' ? '자동화 시작 전의 회의록입니다. 이 기록에서는 업무를 새로 생성하지 않았습니다.' : '기존 업무의 진행 상황은 회의록 수정으로 덮어쓰지 않습니다.'), sourceLink('원문 메일', meeting.url, 'mc-link-button'));
      body.append(heading);
      (Array.isArray(meeting.items) ? meeting.items : []).forEach(item => body.append(ledgerItem(meeting, item)));
      if (!meeting.items?.length && meeting.status !== 'baseline') body.append(element('p', 'mc-no-items', '새로 등록할 실행 과제가 없었습니다.'));
      details.append(body); list.append(details);
    });
    return list;
  }

  function render() {
    if (destroyed) return;
    const fragment = document.createDocumentFragment();
    fragment.append(titleBlock(), flow());
    if (error) {
      const failure = element('div', 'mc-connection-error'); failure.setAttribute('role', 'alert');
      const words = element('div'); words.append(element('strong', '', '자동 등록 서버 연결 필요'), element('p', '', error));
      failure.append(icon('warning'), words, button('다시 확인', 'mc-secondary', () => refresh()));
      fragment.append(failure);
    }
    fragment.append(monitorCard(), sourceCriteria(), stats());
    const section = element('section', 'mc-results');
    const tabs = element('div', 'mc-result-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '회의록 처리 결과');
    [['review', '검토 필요', reviewItems().length], ['history', '처리 이력', data.meetings.length]].forEach(([key, label, count]) => {
      const tab = button(label, `mc-result-tab ${activeTab === key ? 'is-active' : ''}`, () => { activeTab = key; editing = null; render(); });
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(activeTab === key));
      tab.append(element('span', 'mc-tab-count', count)); tabs.append(tab);
    });
    const results = element('div', 'mc-results-body'); results.setAttribute('role', 'tabpanel');
    results.setAttribute('aria-label', activeTab === 'review' ? '검토 필요 항목' : '회의록 처리 이력');
    if (loading && !data.meetings.length) { const loadingText = element('div', 'mc-loading', '처리 이력을 불러오고 있습니다…'); loadingText.setAttribute('role', 'status'); results.append(loadingText); }
    else if (activeTab === 'history') results.append(ledger());
    else { const pending = reviewItems(); if (!pending.length) results.append(emptyReview()); else pending.forEach(({ meeting, item }) => results.append(reviewCard(meeting, item))); }
    section.append(tabs, results); fragment.append(section);
    const note = element('div', 'mc-footnote'); note.append(icon('link'), element('p', '', '회의록 메일의 원문 근거와 등록 결과를 함께 기록합니다. 동일한 메일을 다시 확인해도 같은 업무를 중복 생성하지 않습니다.'));
    fragment.append(note);
    container.replaceChildren(fragment);
  }

  render();
  const ready = refresh();
  const timer = setInterval(() => { if (!destroyed && !editing && !busy && document.visibilityState !== 'hidden' && container.isConnected) refresh({ quiet: true }); }, 30000);
  return {
    ready,
    refresh,
    get isEditing() { return Boolean(editing); },
    destroy() { destroyed = true; abort?.abort(); clearInterval(timer); },
  };
}
