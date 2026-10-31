const SESSION_KEY = 'flowdesk.auth.v1';
const PRIVATE_CACHE_KEY = 'flowdesk.workspace.v1';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const failure = (message, code = 401) => Object.assign(new Error(message), {code});
const MAIL_RETRY_KEY='flowdesk.mail.retryUntil';
export function mailRetrySeconds(error){
  const header=Number(error.retryAfter),match=String(error.message??'').match(/after\s+(\d+)\s+seconds?/i);
  const seconds=header>0?header:match?Number(match[1]):0;
  return Number.isFinite(seconds)&&seconds>0?Math.min(3600,Math.ceil(seconds)):0;
}

/** Auth owns the signed-in identity; workspace data never enters persistent storage in hosted mode. */
export async function createAuthClient(root) {
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  let config, configurationError;
  try {
    const response = await fetch(new URL('./config.json', import.meta.url), {cache:'no-store'});
    if (!response.ok) throw new Error('앱 연결 설정을 불러오지 못했습니다.');
    config = await response.json();
    if (!['local','hosted'].includes(config.mode) || (!loopback && config.mode !== 'hosted')) throw new Error('공용 앱 연결 설정이 필요합니다.');
    if (config.mode === 'hosted' && (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.supabaseUrl || '') || typeof config.publishableKey !== 'string' || !config.publishableKey)) throw new Error('로그인 서버 설정을 확인할 수 없습니다.');
  } catch (error) { config = {mode:loopback?'local':'hosted'}; configurationError = error.message; }
  const hosted = config.mode === 'hosted';
  let session = null, member = null, epoch = 0, refreshing = null, onSignedIn, onLocked;
  const pending = new Set();
  const clearPrivateCache = () => { try { localStorage.removeItem(PRIVATE_CACHE_KEY); } catch {} };
  const saveSession = value => {
    session = value ? {...value, expires_at:value.expires_at || Math.floor(Date.now()/1000) + Number(value.expires_in || 0)} : null;
    try { if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); else sessionStorage.removeItem(SESSION_KEY); } catch {}
  };
  function lock(message = '') {
    epoch++; pending.forEach(controller => controller.abort()); pending.clear(); member = null; saveSession(null); clearPrivateCache();
    onLocked?.(); showLogin(message);
  }
  function layout(title, description, content = '') {
    root.className = 'auth-shell';
    root.innerHTML = `<main class="auth-card"><a class="auth-brand" href="https://bazbio.github.io/">BAZ <span>Flowdesk</span></a><div class="auth-kicker">경영혁신실 · 팀 워크스페이스</div><h1>${escapeHtml(title)}</h1><p class="auth-description">${escapeHtml(description)}</p>${content}<p class="auth-message" role="status" aria-live="polite"></p><div class="auth-footer">초대된 멤버만 업무와 회의록을 확인할 수 있습니다.</div></main>`;
  }
  const notice = (message, error = false) => { const el = root.querySelector('.auth-message'); if (el) {el.textContent = message; el.classList.toggle('error', error);} };
  async function parse(response) {
    let data; try {data = await response.json();} catch {throw failure('서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.', response.status || 503);}
    if (!response.ok) {const error = failure(data.error?.message || data.error || data.msg || data.message || '요청을 처리하지 못했습니다.', response.status); error.reason = data.error_code || data.code; error.retryAfter=response.headers.get('retry-after'); error.result = data; throw error;}
    return data;
  }
  async function authFetch(path, method, body, accessToken) {
    return parse(await fetch(config.supabaseUrl + '/auth/v1/' + path, {
      method, cache:'no-store', headers:{apikey:config.publishableKey, 'Content-Type':'application/json', ...(accessToken?{Authorization:'Bearer '+accessToken}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000),
    }));
  }
  async function refresh() {
    if (!session?.refresh_token) throw failure('다시 로그인해 주세요.');
    if (!refreshing) {const generation = epoch; refreshing = authFetch('token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token})
      .then(value => {if(generation!==epoch)throw failure('로그인 계정이 변경되었습니다.'); saveSession(value);})
      .catch(error => {if(generation===epoch)lock('로그인이 만료되었습니다. 다시 로그인해 주세요.'); throw error;})
      .finally(() => {refreshing=null;});}
    return refreshing;
  }
  async function request(path, method = 'GET', body, signal, retry = true) {
    if (!hosted) {
      const response = await fetch(path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json','x-flowdesk-client':'workspace'}:{},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal || AbortSignal.timeout(15000)});
      return parse(response);
    }
    if (!session) throw failure('로그인 후 사용할 수 있습니다.');
    const generation = epoch;
    if (session.expires_at < Date.now()/1000 + 60) await refresh();
    if (generation!==epoch || !session) throw failure('로그인 계정이 변경되었습니다.');
    const controller = new AbortController(); pending.add(controller);
    const cancel = () => controller.abort(); signal?.addEventListener('abort',cancel,{once:true});
    const timeout = setTimeout(cancel,20000);
    try {
      const response = await fetch(config.supabaseUrl + '/functions/v1/flowdesk-api', {
        method:'POST',cache:'no-store',headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({path,method,...(body===undefined?{}:{body})}),signal:controller.signal,
      });
      if(generation!==epoch)throw failure('로그인 계정이 변경되었습니다.');
      if(response.status===401 && retry){await refresh();return request(path,method,body,signal,false);}
      if(response.status===401){lock('로그인이 만료되었습니다. 다시 로그인해 주세요.');throw failure('다시 로그인해 주세요.');}
      if(response.status===403 && !path.startsWith('/api/admin/') && !path.startsWith('/api/auth/')){lock('워크스페이스 접근 권한이 없습니다. 관리자에게 확인해 주세요.');throw failure('워크스페이스 접근 권한이 없습니다.',403);}
      const result=await parse(response);
      if(generation!==epoch)throw failure('로그인 계정이 변경되었습니다.');
      return result;
    } finally {clearTimeout(timeout);pending.delete(controller);signal?.removeEventListener('abort',cancel);}
  }
  async function enter() {
    const generation = epoch;
    const result = await request('/api/session');
    if(generation!==epoch)throw failure('로그인 계정이 변경되었습니다.');
    if(result.authentication){if(!result.authentication.freshEmail){lock('이메일 인증 링크를 다시 받아 주세요.');return;}showPassword(result.authentication.configured);return;}
    if(!result.member?.id || !result.member?.name)throw failure('워크스페이스 멤버 정보를 확인하지 못했습니다.',403);
    member = result.member;
    root.className = 'app-shell';
    await onSignedIn?.();
  }
  function errorText(error) {
    if(error.code===403)return '경영혁신실 초대 명단에 없는 계정입니다. 관리자에게 초대를 요청해 주세요.';
    if(error.code===400 || error.code===422)return '이메일과 비밀번호 또는 초대 링크를 확인해 주세요.';
    if(error.code===429)return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    return error.message?.includes('Failed to fetch')?'로그인 서버에 연결하지 못했습니다. 연결 상태를 확인해 주세요.':error.message || '로그인하지 못했습니다.';
  }
  function showLogin(message = '') {
    layout('회사 이메일로 인증하세요', '1단계 · 회사 메일의 인증 링크를 확인한 뒤, 2단계에서 숫자 4자리 비밀번호를 입력합니다.',
      '<form id="flowdesk-login"><label>회사 이메일<input type="email" name="email" autocomplete="username" placeholder="name@bazbiomedic.com" required></label><button type="submit" class="auth-primary">인증 메일 받기</button></form>');
    notice(message,Boolean(message));
    const form=root.querySelector('form');
    const button=form.querySelector('[type=submit]');let retryUntil=0,timer;
    try{const saved=Number(localStorage.getItem(MAIL_RETRY_KEY));if(saved>Date.now()&&saved<=Date.now()+3600000)retryUntil=saved;}catch{}
    const tick=()=>{
      if(form.isConnected===false){clearInterval(timer);return;}
      const remaining=Math.max(0,Math.ceil((retryUntil-Date.now())/1000));
      button.disabled=remaining>0;button.textContent=remaining?`재발송까지 ${remaining}초`:'인증 메일 받기';
      if(!remaining)clearInterval(timer);
    };
    const cooldown=seconds=>{retryUntil=Date.now()+seconds*1000;try{localStorage.setItem(MAIL_RETRY_KEY,String(retryUntil));}catch{}clearInterval(timer);tick();timer=setInterval(tick,1000);};
    if(retryUntil>Date.now())cooldown(Math.ceil((retryUntil-Date.now())/1000));
    form.addEventListener('submit',async event=>{
      event.preventDefault();const field=form.elements.email;if(!field.reportValidity())return;
      if(retryUntil>Date.now())return;
      const address=field.value.trim().toLowerCase();
      if(!/^[^\s@]+@bazbiomedic\.com$/.test(address)){notice('회사 이메일(@bazbiomedic.com)을 입력해 주세요.',true);return;}
      button.disabled=true;
      try{await authFetch('otp?redirect_to='+encodeURIComponent(config.redirectUrl || new URL('./',location.href).href),'POST',{email:address,create_user:false});cooldown(60);notice('등록된 계정이면 인증 메일이 발송됩니다. 가장 최근 메일의 Sign in 링크를 열어 주세요. 이메일 인증 뒤 10분 안에 4자리 비밀번호를 입력하면 됩니다.');}
      catch(error){
        const seconds=error.code===429?mailRetrySeconds(error):0;
        if(seconds)cooldown(seconds);
        notice(error.code===429?(seconds?`재발송 제한입니다. ${seconds}초 뒤 다시 요청할 수 있습니다. 이미 받은 가장 최근 인증 메일의 Sign in 링크를 먼저 확인해 주세요.`:'인증 메일 발송 한도에 도달했습니다. 이미 받은 가장 최근 메일의 Sign in 링크를 확인해 주세요. 계속 제한되면 관리자에게 문의해 주세요.'):'인증 메일을 보내지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.',true);
      }
      finally{tick();}
    });
  }
  function showPassword(configured=false) {
    layout(configured?'4자리 비밀번호를 입력하세요':'4자리 비밀번호를 설정하세요',configured?'2단계 · 이메일 인증을 완료했습니다.':'회사 이메일 인증을 완료했습니다. Flowdesk에서 사용할 숫자 4자리를 설정하세요.',
      '<form id="flowdesk-password"><label>숫자 4자리<input type="password" name="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="'+(configured?'current-password':'new-password')+'" required></label>'+(configured?'':'<label>비밀번호 확인<input type="password" name="confirmation" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" required></label>')+'<button type="submit" class="auth-primary">'+(configured?'확인하고 시작하기':'비밀번호 저장하고 시작하기')+'</button><button type="button" class="auth-secondary" id="flowdesk-cancel">로그인 화면으로</button></form>');
    const form=root.querySelector('form');
    form.addEventListener('submit',async event=>{
      event.preventDefault();const fields=new FormData(form),pin=String(fields.get('password'));
      if(!/^[0-9]{4}$/.test(pin)){notice('숫자 4자리를 입력해 주세요.',true);return;}
      if(!configured&&pin!==fields.get('confirmation')){notice('비밀번호가 일치하지 않습니다.',true);return;}
      const button=form.querySelector('[type=submit]');button.disabled=true;const generation=epoch;
      try{await request('/api/auth/pin','POST',{operation:configured?'verify':'enroll',pin});if(generation!==epoch)return;form.reset();await enter();}
      catch(error){if(generation===epoch)notice(error.message,true);}finally{button.disabled=false;}
    });
    root.querySelector('#flowdesk-cancel').onclick=()=>logout();
  }
  function showConnectionError(message, retry) {
    if(!session)return showLogin(message);
    layout('업무 서버 연결을 확인해 주세요',message,'<button class="auth-primary" id="flowdesk-retry">다시 연결</button><button class="auth-secondary" id="flowdesk-signout">로그아웃</button>');
    root.querySelector('#flowdesk-retry').onclick=retry;
    root.querySelector('#flowdesk-signout').onclick=()=>logout();
  }
  async function logout() {
    const old=session?.access_token;
    if(old)try{await request('/api/auth/revoke','POST',{});}catch{}
    lock();
    if(old)try{await authFetch('logout?scope=local','POST',undefined,old);}catch{}
  }
  async function start(signedIn, locked) {
    onSignedIn=signedIn;onLocked=locked;
    if(!hosted)return signedIn();
    clearPrivateCache();
    const hash=new URLSearchParams(location.hash.slice(1));
    const authHash=hash.has('access_token')||hash.has('token_hash')||hash.has('error')||hash.has('error_description');
    if(authHash)history.replaceState(null,'',location.pathname+location.search);
    if(configurationError){layout('앱 연결 설정이 필요합니다',configurationError);return;}
    if(hash.has('error'))return showLogin('초대 또는 로그인 링크가 만료되었습니다. 로그인 링크를 다시 요청해 주세요.');
    if(hash.has('token_hash')) {
      const type=hash.get('type');
      if(!['invite','recovery','email','magiclink'].includes(type))return showLogin('초대 또는 로그인 링크 형식을 확인해 주세요.');
      layout('초대 링크를 확인하고 있습니다','이메일 인증을 확인합니다.');
      try {saveSession(await authFetch('verify','POST',{token_hash:hash.get('token_hash'),type}));}
      catch {return showLogin('초대 또는 로그인 링크가 만료되었거나 이미 사용되었습니다. 관리자에게 새 링크를 요청해 주세요.');}

    } else if(hash.get('access_token') && hash.get('refresh_token')) {
      saveSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in')||3600)});

    } else {
      try{const saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(saved?.access_token&&saved?.refresh_token)saveSession(saved);}catch{saveSession(null);}
    }
    if(!session)return showLogin();
    layout('워크스페이스를 열고 있습니다','계정과 초대 권한을 확인합니다.');
    try {await enter();}catch(error){lock(errorText(error));}
  }
  return {hosted,request,start,logout,showConnectionError,get member(){return member;},get generation(){return epoch;}};
}
