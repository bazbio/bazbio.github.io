// 카드를 끄는 동안에는 마우스 휠이 듣지 않고, 브라우저 기본 자동 스크롤은 영역 끝 몇 픽셀에서만 움직인다.
// 그래서 끄는 위치가 스크롤 영역 가장자리(또는 그 바깥)에 있으면 화면을 직접 굴려, 안 보이는 칸·위치까지 옮길 수 있게 한다.
const ZONE={y:96,x:56},MIN_SPEED=240,MAX_SPEED=1400,MOVE_BEFORE_SCROLL=8;

// 초당 몇 픽셀로 굴릴지. 음수는 위·왼쪽, 양수는 아래·오른쪽, 0은 가운데라 그대로 둔다.
export function edgeSpeed(pos,start,end,zone){
  const reach=Math.min(zone,(end-start)/3);
  if(!(reach>0))return 0;
  const depth=pos<start+reach?(pos-start-reach)/reach:pos>end-reach?(pos-end+reach)/reach:0;
  if(!depth)return 0;
  const power=Math.min(Math.abs(depth),1);
  return Math.sign(depth)*(MIN_SPEED+(MAX_SPEED-MIN_SPEED)*power*power);
}

// 카드에서 가장 가까운, 그 방향으로 실제 넘치는 스크롤 영역을 고른다. 보드는 세로와 가로의 영역이 다르다.
export function findScroller(el,axis,styleOf=getComputedStyle){
  const [content,visible,overflow]=axis==='y'?['scrollHeight','clientHeight','overflowY']:['scrollWidth','clientWidth','overflowX'];
  for(let n=el?.parentElement;n;n=n.parentElement)if(n[content]>n[visible]+1&&/auto|scroll/.test(styleOf(n)[overflow]))return n;
  return null;
}

// 끌기를 시작하면 부르고, 돌려받은 함수로 멈춘다. 렌더링으로 카드가 사라지면 dragend가 오지 않으므로 스스로도 멈춘다.
export function startDragScroll(source,startX,startY,{doc=document,frame=requestAnimationFrame,cancel=cancelAnimationFrame,styleOf=getComputedStyle}={}){
  const axes=[['y','scrollTop','top','bottom'],['x','scrollLeft','left','right']].map(([axis,offset,from,to])=>({axis,offset,from,to,el:findScroller(source,axis,styleOf)})).filter(a=>a.el);
  let pointer=null,moved=false,last=0,timer=0,stopped=false;
  const onOver=e=>{pointer={x:e.clientX,y:e.clientY};moved||=Math.hypot(pointer.x-startX,pointer.y-startY)>=MOVE_BEFORE_SCROLL};
  const onLeave=e=>{if(!e.relatedTarget)pointer=null};
  const stop=()=>{if(stopped)return;stopped=true;cancel(timer);doc.removeEventListener('dragover',onOver);doc.removeEventListener('dragleave',onLeave)};
  const tick=now=>{
    if(stopped)return;
    if(!source.isConnected)return stop();
    const seconds=Math.min(Math.max(now-last,0),50)/1000;last=now;
    if(pointer&&moved)for(const a of axes){const box=a.el.getBoundingClientRect(),speed=edgeSpeed(pointer[a.axis],box[a.from],box[a.to],ZONE[a.axis]);if(speed)a.el[a.offset]+=speed*seconds}
    timer=frame(tick);
  };
  doc.addEventListener('dragover',onOver);doc.addEventListener('dragleave',onLeave);
  timer=frame(t=>{last=t;tick(t)});
  return stop;
}
