export function displayLabel(value) {
  return ({대표승인:'대표님 승인',대표보완:'대표님 보완',대표승인자:'대표님 승인자'})[value] || value;
}

export function errorMessage(error) {
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError ||
      error instanceof SyntaxError || typeof error?.message !== 'string') {
    return '화면 정보를 확인하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.';
  }
  return error.message + (error.traceId ? ` (오류 확인 번호: ${error.traceId})` : '');
}
