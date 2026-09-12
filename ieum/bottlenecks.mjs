export function createBottlenecks({el,button,api,refresh,open}) {
  let filter={부서ID:null,담당자ID:null,지연만:false,검색:null};
  const duration=seconds=>seconds<60?'1분 미만':seconds<3600?`${Math.floor(seconds/60)}분`:seconds<86400?`${Math.floor(seconds/3600)}시간`:`${Math.floor(seconds/86400)}일 ${Math.floor(seconds%86400/3600)}시간`;
  function select(form,label,items,value){const wrap=el('label',label),input=el('select');input.setAttribute('aria-label',label);input.append(new Option('전체',''),...items.map(x=>new Option(x.이름,x.ID)));input.value=value||'';wrap.append(input);form.append(wrap);return input;}
  function group(title,rows,key){const box=el('section',null,'detail-card');box.append(el('h2',title));if(!rows.length){box.append(el('p','해당하는 대기 업무가 없습니다.','hint'));return box;}
    const table=el('table',null,'bottleneck-table'),head=el('thead'),tr=el('tr');for(const name of ['대상','대기','지연','최장 체류'])tr.append(el('th',name));head.append(tr);const body=el('tbody');
    for(const r of rows){const row=el('tr'),name=el('td');name.append(button(r.이름,'text-button',()=>{filter={...filter,[key]:r.ID};refresh();}));row.append(name,el('td',r.미처리),el('td',r.지연),el('td',duration(r.최장담당초)));body.append(row);}table.append(head,body);box.append(table);return box;
  }
  async function render(){
    const data=await api('read',{종류:'병목현황',...filter,한도:50}),box=el('div',null,'bottleneck-dashboard');
    const form=el('form',null,'bottleneck-filters'),department=select(form,'병목 부서',data.필터부서,filter.부서ID),person=select(form,'병목 담당자',data.필터담당자,filter.담당자ID);
    const searchLabel=el('label','업무·작업 검색'),search=el('input');search.type='search';search.maxLength=100;search.setAttribute('aria-label','업무·작업 검색');search.value=filter.검색||'';search.placeholder='업무 또는 마일스톤 제목';searchLabel.append(search);form.append(searchLabel);
    const lateLabel=el('label','기한 초과만','check-label'),late=el('input');late.type='checkbox';late.checked=filter.지연만;late.setAttribute('aria-label','기한 초과만');lateLabel.append(late);form.append(lateLabel);
    const submit=el('button','현황 조회','primary');submit.type='submit';form.append(submit,button('필터 초기화','text-button',()=>{filter={부서ID:null,담당자ID:null,지연만:false,검색:null};refresh();}));
    form.addEventListener('submit',e=>{e.preventDefault();filter={부서ID:department.value||null,담당자ID:person.value||null,지연만:late.checked,검색:search.value.trim()||null};refresh();});box.append(form);
    const metrics=el('div',null,'bottleneck-metrics');for(const [label,value] of [['현재 처리 차례',`${data.집계.미처리}건`],['기한을 넘긴 차례',`${data.집계.지연}건`],['관련 업무',`${data.집계.업무}건`],['가장 긴 담당 체류',duration(data.집계.최장담당초)]]){const card=el('div');card.append(el('p',label,'info-label'),el('strong',value));metrics.append(card);}box.append(metrics);
    box.append(el('p',`열람 가능한 업무의 현재 담당 기준 · ${new Date(data.기준시각).toLocaleString('ko-KR')} 조회. 담당 체류와 행동 기한 초과를 구분하며, 최종 일정의 지연을 예측한 값은 아닙니다.`,'hint'));
    const groups=el('div',null,'bottleneck-groups');groups.append(group('부서별 대기',data.부서별,'부서ID'),group('담당자별 대기',data.담당자별,'담당자ID'));box.append(groups);
    const list=el('section',null,'bottleneck-list');list.append(el('h2','처리가 필요한 차례'));
    if(data.생략건수)list.append(el('p',`처리기한이 빠른 50건을 표시합니다. ${data.생략건수}건은 필터로 범위를 좁혀 확인하세요. 위 집계는 필터에 맞는 전체 건수입니다.`,'notice'));
    if(!data.항목.length)list.append(el('p','필터에 해당하는 차례가 없습니다.','empty'));
    for(const a of data.항목){const card=el('article',null,'detail-card bottleneck-item');card.dataset.actionId=a.행동ID;const head=el('div',null,'card-top');head.append(el('span',a.종류,'badge'),el('span',a.기한초과?`기한 초과 ${duration(a.기한초과초)}`:'기한 내',`badge ${a.기한초과?'late':'neutral'}`));
      card.append(head,button(a.제목,'bottleneck-title',()=>open(a.업무ID)));if(a.마일스톤제목)card.append(el('p',a.마일스톤제목,'plan-state'));
      if(a.미팅대기)card.append(el('p','미팅 결론·후속 업무 대기','notice'));
      if(a.미팅안건)card.append(el('p',a.미팅후속내용||a.미팅안건,'plan-state'));
      card.append(el('p',`${a.담당부서.이름} · ${a.담당자.표시명}`),el('p',`현재 담당 체류 ${duration(a.현담당체류초)} · 행동 발생 후 ${duration(a.행동대기초)}`,'hint'),el('p',`처리기한 ${new Date(a.처리기한).toLocaleString('ko-KR')}`,'hint'));
      if(a.후속작업.length){const follow=el('ul');for(const m of a.후속작업)follow.append(el('li',`${m.부서명} · ${m.제목} · ${m.담당자명}`));card.append(el('p',`영향받는 미완료 후속 작업 ${a.후속작업.length}건`,'plan-state'),follow);}list.append(card);
    }box.append(list);return box;
  }
  return {render};
}
