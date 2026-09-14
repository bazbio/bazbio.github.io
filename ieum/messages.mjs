export function errorMessage(error) {
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError ||
      error instanceof SyntaxError || typeof error?.message !== 'string') {
    return '화면 정보를 확인하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.';
  }
  return error.message + (error.traceId ? ` (오류 확인 번호: ${error.traceId})` : '');
}
