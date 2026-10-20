export function displayLabel(value) {
  return ({대표승인:'대표님 승인',대표보완:'대표님 보완',대표승인자:'대표님 승인자',대표대리:'대표님 대리 승인'})[value] || value;
}

// 대표님은 소속 부서 대신 직함으로 표시한다. ID가 오면 ID로, 이름만 오는 응답은 이름으로 대조한다.
const executives = new Map([['1d1509f4-7974-4537-8ea4-b8a7a787a421', '이성헌']]);
function executive(name, id) {
  return id ? executives.get(id) : [...executives.values()].find(n => n === name);
}

export function personName(name, id) {
  const title = name && executive(name, id);
  return title ? `${title} 대표님` : name;
}

export function personLabel(name, department, id) {
  return executive(name, id) ? personName(name, id) : [name, department].filter(Boolean).join(' · ');
}

export function departmentPerson(department, name, id) {
  return executive(name, id) ? personName(name, id) : [department, name].filter(Boolean).join(' · ');
}

export function personCall(name, id, space = ' ') {
  return executive(name, id) ? personName(name, id) : `${name}${space}님`;
}

export function errorMessage(error) {
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError ||
      error instanceof SyntaxError || typeof error?.message !== 'string') {
    return '화면 정보를 확인하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.';
  }
  return error.message + (error.traceId ? ` (오류 확인 번호: ${error.traceId})` : '');
}
