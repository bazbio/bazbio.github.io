// The invite dialog's "볼 수 있는 범위": the whole workspace, or one or more chosen projects.
// The server takes at most 20 project ids (hosted/flowdesk-api/handler.mjs invite()).
export const MAX_INVITE_PROJECTS = 20;

export function inviteScopeMarkup(projects, esc) {
  return `<fieldset class="form-field scope-field"><legend>볼 수 있는 범위</legend>`
    + `<label class="scope-option"><input type="radio" name="scope" value="all"> 전체 업무와 회의록 (경영혁신실)</label>`
    + `<label class="scope-option"><input type="radio" name="scope" value="projects"> 선택한 프로젝트만 <small>여러 개 고를 수 있습니다</small></label>`
    + `<div class="scope-projects">${projects.map(p => `<label class="scope-option"><input type="checkbox" name="project" value="${esc(p.id)}"> ${esc(p.name)}</label>`).join('')}</div>`
    + `</fieldset>`;
}

/** Keeps the two choices apart: ticking a project picks "선택한 프로젝트만", picking the whole workspace clears the projects. */
export function bindInviteScope(form) {
  form.addEventListener('change', event => {
    const input = event.target;
    if (input.name === 'project' && input.checked) form.querySelector('input[name="scope"][value="projects"]').checked = true;
    if (input.name === 'scope' && input.value === 'all') for (const box of form.querySelectorAll('input[name="project"]')) box.checked = false;
  });
}

/** null is the whole workspace; otherwise the chosen project ids in the order shown. Anything else is refused. */
export function readInviteScope(formData, projects) {
  const scope = formData.get('scope'), chosen = formData.getAll('project');
  const known = new Set(projects.map(p => p.id)), picked = projects.map(p => p.id).filter(id => chosen.includes(id));
  if (scope === 'all') {
    if (chosen.length) throw new Error('전체를 고르면 프로젝트를 따로 고르지 않습니다. 둘 중 하나만 선택해 주세요.');
    return null;
  }
  if (scope !== 'projects' && !chosen.length) throw new Error('볼 수 있는 범위를 선택해 주세요.');
  if (chosen.some(id => !known.has(id))) throw new Error('목록에 없는 프로젝트가 있습니다. 창을 다시 열어 선택해 주세요.');
  if (!picked.length) throw new Error('볼 수 있는 프로젝트를 하나 이상 선택해 주세요.');
  if (picked.length > MAX_INVITE_PROJECTS) throw new Error(`프로젝트는 ${MAX_INVITE_PROJECTS}개까지 고를 수 있습니다.`);
  return picked;
}

/** The confirmation line after an invite: which projects the new member will see. */
export function inviteScopeLabel(projectIds, projects) {
  if (!Array.isArray(projectIds)) return '전체 업무와 회의록';
  return projectIds.map(id => projects.find(p => p.id === id)?.name ?? id).join(', ');
}
