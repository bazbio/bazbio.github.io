/** Browser-local data model. Import/export always passes through schema validation. */
export const STORAGE_KEY = 'flowdesk.workspace.v1';
const PRIORITIES = ['high', 'medium', 'low'];
const STATUSES = ['todo', 'doing', 'done'];
const HEALTH = ['', 'on_track', 'at_risk', 'off_track'];
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createInitialState() {
  const createdAt = '2026-10-31T00:00:00.000Z';
  const entries = [
    ['작업 1', 'me', '2026-10-31', '2026-11-03', 'low', 'on_track'],
    ['작업 2', 'me', '2026-11-02', '2026-11-04', 'medium', 'at_risk'],
    ['작업 3', '', '2026-11-03', '2026-11-05', 'high', 'off_track'],
  ];
  return {
    version: 1,
    activeProjectId: 'p-launch',
    projects: [{ id: 'p-launch', name: '유영환 님의 첫 번째 프로젝트', color: '#d9d9d9', description: '' }],
    sections: [
      { id: 's-todo', projectId: 'p-launch', name: '할 일' },
      { id: 's-doing', projectId: 'p-launch', name: '수행 중' },
      { id: 's-done', projectId: 'p-launch', name: '완료' },
    ],
    tasks: entries.map(([title, assignee, startDate, dueDate, priority, health], index) => ({
      id: `task-${index + 1}`, projectId: 'p-launch', sectionId: 's-todo',
      title, assignee, startDate, dueDate, priority, status: 'todo', health, description: '', createdAt,
      subtasks: [],
      comments: [],
    })),
    members: [
      { id: 'me', name: '유영환', initials: '유영', color: '#ffc5bf' },
    ],
    profile: { name: '유영환', initials: '유영' },
  };
}

function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, '올바른 객체가 필요합니다.');
  if (Object.keys(value).some(key => BAD_KEYS.has(key))) fail(path, '허용되지 않는 속성이 있습니다.');
  return value;
}
function text(value, path, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(path, `올바른 문자열이 필요합니다(최대 ${max}자).`);
  return value;
}
function id(value, path) {
  text(value, path, 120, true);
  if (!/^[A-Za-z0-9_-]+$/.test(value) || BAD_KEYS.has(value)) fail(path, 'ID 형식이 올바르지 않습니다.');
  return value;
}
function color(value, path) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) fail(path, '6자리 HEX 색상이 필요합니다.');
  return value;
}
function list(value, path, max) {
  if (!Array.isArray(value) || value.length > max) fail(path, `최대 ${max}개의 항목이 필요합니다.`);
  return value;
}
function unique(items, path) {
  const seen = new Set();
  items.forEach(item => { if (seen.has(item.id)) fail(path, '중복된 ID가 있습니다.'); seen.add(item.id); });
  return items;
}
function date(value, path) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(path, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(path, '존재하지 않는 날짜입니다.');
  return value;
}
function timestamp(value, path) {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) fail(path, '올바른 기록 시간이 필요합니다.');
  return value;
}
function choice(value, values, path) {
  if (!values.includes(value)) fail(path, '허용되지 않는 값입니다.');
  return value;
}

function taskSource(value, path) {
  if (value === undefined || value === null) return undefined;
  const item = record(value, path);
  let url;
  try { url = new URL(item.url); } catch { fail(path, '원문 링크가 올바르지 않습니다.'); }
  if (url.protocol !== 'https:' || !['erp.bazbiomedic.com', 'mail.google.com'].includes(url.hostname) || url.username || url.password) fail(path, '허용되지 않는 원문 링크입니다.');
  return {
    meetingKey: text(item.meetingKey, path, 300, true),
    itemKey: text(item.itemKey, path, 300, true),
    url: url.href,
    title: text(item.title, path, 500, true),
    meetingDate: date(item.meetingDate, path),
    excerpt: text(item.excerpt, path, 10000, true),
    importedAt: timestamp(item.importedAt, path),
  };
}

/** Return a fresh, allow-listed state or throw. Never retain imported object references. */
export function validateImport(data) {
  const source = record(data, '데이터');
  if (source.version !== 1) fail('버전', '지원하지 않는 데이터 버전입니다.');
  const projects = unique(list(source.projects, '프로젝트', 100).map((value, index) => {
    const path = `프로젝트 ${index + 1}`; const item = record(value, path);
    return { id: id(item.id, path), name: text(item.name, path, 160, true), color: color(item.color, path), description: text(item.description, path, 20000) };
  }), '프로젝트');
  if (!projects.length) fail('프로젝트', '하나 이상의 프로젝트가 필요합니다.');
  const projectIds = new Set(projects.map(project => project.id));
  const activeProjectId = id(source.activeProjectId, '선택된 프로젝트');
  if (!projectIds.has(activeProjectId)) fail('선택된 프로젝트', '존재하지 않는 프로젝트입니다.');
  const members = unique(list(source.members, '멤버', 200).map((value, index) => {
    const path = `멤버 ${index + 1}`; const item = record(value, path);
    return { id: id(item.id, path), name: text(item.name, path, 120, true), initials: text(item.initials, path, 8, true), color: color(item.color, path) };
  }), '멤버');
  const memberIds = new Set(members.map(member => member.id));
  const profileItem = record(source.profile, '프로필');
  const profile = { name: text(profileItem.name, '프로필 이름', 120, true), initials: text(profileItem.initials, '프로필 이니셜', 8, true) };
  const sections = unique(list(source.sections, '섹션', 1000).map((value, index) => {
    const path = `섹션 ${index + 1}`; const item = record(value, path);
    const projectId = id(item.projectId, path);
    if (!projectIds.has(projectId)) fail(path, '연결된 프로젝트가 없습니다.');
    return { id: id(item.id, path), projectId, name: text(item.name, path, 160, true) };
  }), '섹션');
  const projectsWithSections = new Set(sections.map(section => section.projectId));
  for (const project of projects) {
    if (!projectsWithSections.has(project.id)) fail('프로젝트 섹션', `“${project.name}”에 하나 이상의 섹션이 필요합니다.`);
  }
  const sectionMap = new Map(sections.map(section => [section.id, section]));
  const tasks = unique(list(source.tasks, '작업', 10000).map((value, index) => {
    const path = `작업 ${index + 1}`; const item = record(value, path);
    const projectId = id(item.projectId, path); const sectionId = id(item.sectionId, path);
    if (!projectIds.has(projectId) || sectionMap.get(sectionId)?.projectId !== projectId) fail(path, '프로젝트와 섹션의 연결이 올바르지 않습니다.');
    const assignee = text(item.assignee, `${path} 담당자`, 120);
    if (assignee && !memberIds.has(assignee)) fail(path, '존재하지 않는 담당자입니다.');
    const subtasks = unique(list(item.subtasks, `${path} 하위 작업`, 500).map((value, subIndex) => {
      const subPath = `${path} 하위 작업 ${subIndex + 1}`; const sub = record(value, subPath);
      if (typeof sub.done !== 'boolean') fail(subPath, '완료 여부가 올바르지 않습니다.');
      return { id: id(sub.id, subPath), title: text(sub.title, subPath, 500, true), done: sub.done };
    }), `${path} 하위 작업`);
    const comments = unique(list(item.comments, `${path} 메모`, 1000).map((value, commentIndex) => {
      const commentPath = `${path} 메모 ${commentIndex + 1}`; const comment = record(value, commentPath);
      return { id: id(comment.id, commentPath), text: text(comment.text, commentPath, 10000, true), createdAt: timestamp(comment.createdAt, commentPath), ...(comment.authorId === undefined ? {} : { authorId: id(comment.authorId, `${commentPath} 작성자`), authorName: text(comment.authorName, `${commentPath} 작성자 이름`, 120, true) }) };
    }), `${path} 메모`);
    const startDate = date(item.startDate === undefined ? '' : item.startDate, `${path} 시작일`);
    const dueDate = date(item.dueDate, `${path} 마감일`);
    if (startDate && dueDate && startDate > dueDate) fail(`${path} 일정`, '시작일은 마감일보다 늦을 수 없습니다.');
    return {
      id: id(item.id, path), projectId, sectionId,
      title: text(item.title, `${path} 제목`, 500, true), assignee,
      startDate, dueDate,
      priority: choice(item.priority, PRIORITIES, `${path} 우선순위`),
      status: choice(item.status, STATUSES, `${path} 상태`),
      health: choice(item.health === undefined ? '' : item.health, HEALTH, `${path} 진행 상태`),
      description: text(item.description, `${path} 설명`, 20000),
      subtasks, comments, createdAt: timestamp(item.createdAt, `${path} 생성 시간`),
      ...(item.source ? { source: taskSource(item.source, `${path} 회의록 근거`) } : {}),
    };
  }), '작업');
  return { version: 1, activeProjectId, projects, sections, tasks, members, profile };
}

export function loadState(storage) {
  loadState.lastError = null;
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) throw new Error('이 환경에서는 브라우저 저장소를 사용할 수 없습니다.');
    const raw = target.getItem(STORAGE_KEY);
    if (raw === null) return createInitialState();
    if (raw.length > 12_000_000) throw new Error('저장된 데이터가 허용 크기를 초과했습니다.');
    return validateImport(JSON.parse(raw));
  } catch (error) {
    loadState.lastError = error instanceof Error ? error : new Error(String(error));
    return createInitialState();
  }
}
loadState.lastError = null;

export function saveState(state, storage) {
  const clean = validateImport(state);
  const target = storage ?? globalThis.localStorage;
  if (!target) throw new Error('브라우저 저장소를 사용할 수 없어 변경 사항을 저장하지 못했습니다.');
  try { target.setItem(STORAGE_KEY, JSON.stringify(clean)); }
  catch (cause) { throw new Error('브라우저 저장소가 가득 찼거나 사용할 수 없어 저장하지 못했습니다. JSON 내보내기로 데이터를 보관해 주세요.', { cause }); }
  return clean;
}

export function filterTasks(state, options = {}) {
  const { projectId, query = '', status = 'all', assignee = 'all', priority = 'all', sort = '', onlyMine = false } = options;
  const needle = String(query).trim().toLocaleLowerCase('ko');
  const memberMap = new Map(state.members.map(member => [member.id, member.name]));
  const mine = state.members.find(member => member.id === 'me')?.id ?? state.members.find(member => member.name === state.profile.name)?.id;
  const result = state.tasks.filter(task => {
    if (projectId && task.projectId !== projectId) return false;
    if (onlyMine && (!mine || task.assignee !== mine)) return false;
    if (status === 'incomplete' && task.status === 'done') return false;
    if (status !== 'all' && status !== 'incomplete' && status && task.status !== status) return false;
    if (assignee !== 'all' && assignee !== undefined && task.assignee !== assignee) return false;
    if (priority !== 'all' && priority && task.priority !== priority) return false;
    return !needle || [task.title, task.description, memberMap.get(task.assignee) || ''].some(value => value.toLocaleLowerCase('ko').includes(needle));
  });
  if (sort === 'due' || sort === 'dueDate') result.sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
  else if (sort === 'priority') result.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
  else if (sort === 'name') result.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  else if (sort === 'created') result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}
