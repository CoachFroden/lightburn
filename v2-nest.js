function renderOriginal(){
  S.mode='original';clear();if(!S.shapes.length)return;
  const b=box(S.shapes.flatMap(s=>s.points)),pad=Math.max(8,Math.max(b.width,b.height)*.03);
  E.svg.setAttribute('viewBox',`${b.minX-pad} ${b.minY-pad} ${b.width+2*pad} ${b.height+2*pad}`);
  const partByShape=new Map();for(const p of S.parts)for(const m of p.members)partByShape.set(m.id,p);
  for(const sh of S.shapes){
    const part=partByShape.get(sh.id);let cl='inactive';
    if(sh.active)cl=part&&part.rootId===sh.id?'outer':'inner';
    E.svg.appendChild(svg(sh.closed?'polygon':'polyline',{points:pts(sh.points),class:`shape ${cl}`,'data-shape-id':sh.id}));
  }
  const labels=S.parts.length<=80?S.parts:S.parts.slice().sort((a,b)=>b.area-a.area).slice(0,80);
  for(const p of labels){const t=svg('text',{x:(p.bbox.minX+p.bbox.maxX)/2,y:(p.bbox.minY+p.bbox.maxY)/2,class:'part-label'});t.textContent=p.id;E.svg.appendChild(t)}
  const grouped=S.parts.filter(p=>p.method==='group').length;
  E.title.textContent='Original plassering';
  E.note.textContent=S.parts.length?`${fm(b.width)} × ${fm(b.height)} mm · ${S.parts.length} deler · ${grouped} funnet fra LightBurn-grupper`:`${fm(b.width)} × ${fm(b.height)} mm tegneområde · klar for analyse`;
  E.sheets.textContent='–';E.usage.textContent='–';E.reset.disabled=true;
}
function listParts(){
  E.list.innerHTML='';E.count.textContent=S.parts.length;if(!S.parts.length){E.list.textContent='Ingen deler oppdaget.';return}
  const frag=document.createDocumentFragment();
  for(const p of S.parts){
    const r=document.createElement('div');r.className='part-row';
    const tag=p.method==='group'?'gruppe':`${p.inners.length} innv.`;
    r.innerHTML=`<span class="num">${p.id}</span><span><strong>${fm(p.bbox.width)} × ${fm(p.bbox.height)} mm</strong><br><span class="dims">ca. ${Math.round(p.material).toLocaleString('nb-NO')} mm²</span></span><span class="holes">${tag}</span>`;
    r.onclick=()=>highlight(p.id);frag.appendChild(r);
  }
  E.list.appendChild(frag);
}
function highlight(id){
  for(const n of E.svg.querySelectorAll('.shape'))n.classList.remove('highlight');
  if(S.mode==='original'){
    const p=S.parts.find(x=>x.id===id);if(!p)return;const ids=new Set(p.members.map(x=>x.id));
    for(const n of E.svg.querySelectorAll('.shape'))if(ids.has(+n.dataset.shapeId))n.classList.add('highlight');
  }else for(const n of E.svg.querySelectorAll(`[data-part-id="${id}"]`))n.classList.add('highlight');
}

function rectContains(a,b){return a.x<=b.x+EPS&&a.y<=b.y+EPS&&a.x+a.w>=b.x+b.w-EPS&&a.y+a.h>=b.y+b.h-EPS}
function intersects(a,b){return !(b.x>=a.x+a.w-EPS||b.x+b.w<=a.x+EPS||b.y>=a.y+a.h-EPS||b.y+b.h<=a.y+EPS)}
function splitFree(free,used){
  if(!intersects(free,used))return[free];const out=[];
  if(used.x>free.x+EPS)out.push({x:free.x,y:free.y,w:used.x-free.x,h:free.h});
  if(used.x+used.w<free.x+free.w-EPS)out.push({x:used.x+used.w,y:free.y,w:free.x+free.w-(used.x+used.w),h:free.h});
  if(used.y>free.y+EPS)out.push({x:free.x,y:free.y,w:free.w,h:used.y-free.y});
  if(used.y+used.h<free.y+free.h-EPS)out.push({x:free.x,y:used.y+used.h,w:free.w,h:free.y+free.h-(used.y+used.h)});
  return out.filter(r=>r.w>EPS&&r.h>EPS);
}
function pruneFree(rects){
  const out=[];for(let i=0;i<rects.length;i++){let contained=false;for(let j=0;j<rects.length;j++){if(i!==j&&rectContains(rects[j],rects[i])){contained=true;break}}if(!contained)out.push(rects[i])}return out;
}
function findRect(part,free,s){
  const base=[{w:part.bbox.width,h:part.bbox.height,rot:false}];
  if(s.rotate&&Math.abs(part.bbox.width-part.bbox.height)>EPS)base.push({w:part.bbox.height,h:part.bbox.width,rot:true});
  let best=null;
  for(const o of base){const pw=o.w+s.gap,ph=o.h+s.gap;for(let i=0;i<free.length;i++){const f=free[i];if(pw>f.w+EPS||ph>f.h+EPS)continue;const short=Math.min(f.w-pw,f.h-ph),long=Math.max(f.w-pw,f.h-ph),score=short*1e6+long*1e3+f.y*10+f.x;if(!best||score<best.score)best={i,x:f.x,y:f.y,w:pw,h:ph,actualW:o.w,actualH:o.h,rot:o.rot,score}}}
  return best;
}
function placeRect(sheet,part,s){
  const hit=findRect(part,sheet.free,s);if(!hit)return null;const used={x:hit.x,y:hit.y,w:hit.w,h:hit.h},next=[];
  for(const f of sheet.free)next.push(...splitFree(f,used));sheet.free=pruneFree(next);
  const q={part,rot:hit.rot,x:hit.x,y:hit.y,bbox:{minX:hit.x,minY:hit.y,maxX:hit.x+hit.actualW,maxY:hit.y+hit.actualH,width:hit.actualW,height:hit.actualH}};sheet.placed.push(q);return q;
}
function packOrder(parts,s,cmp){
  const usableW=s.w-2*s.margin+s.gap,usableH=s.h-2*s.margin+s.gap,sheets=[],overflow=[];
  for(const part of parts.slice().sort(cmp)){
    const fits=(part.bbox.width<=usableW+EPS&&part.bbox.height<=usableH+EPS)||(s.rotate&&part.bbox.height<=usableW+EPS&&part.bbox.width<=usableH+EPS);
    if(!fits){overflow.push(part);continue}let placed=false;
    for(const sh of sheets){if(placeRect(sh,part,s)){placed=true;break}}
    if(!placed){const sh={free:[{x:s.margin,y:s.margin,w:usableW,h:usableH}],placed:[]};placeRect(sh,part,s);sheets.push(sh)}
  }
  const height=sheets.reduce((sum,sh)=>sum+(sh.placed.length?Math.max(...sh.placed.map(p=>p.bbox.maxY)):0),0);
  return{sheets:sheets.map(x=>x.placed),overflow,height};
}
function nesting(parts,s){
  const orders=[
    (a,b)=>b.area-a.area,
    (a,b)=>Math.max(b.bbox.width,b.bbox.height)-Math.max(a.bbox.width,a.bbox.height)||b.area-a.area,
    (a,b)=>b.bbox.height-a.bbox.height||b.area-a.area,
    (a,b)=>b.bbox.width-a.bbox.width||b.area-a.area
  ];
  return orders.map(c=>packOrder(parts,s,c)).sort((a,b)=>a.overflow.length-b.overflow.length||a.sheets.length-b.sheets.length||a.height-b.height)[0];
}
function memberLocal(m,part,rot){
  const base=part.bbox;let ps=m.points.map(p=>({x:p.x-base.minX,y:p.y-base.minY}));if(!rot)return ps;
  const outer=part.outer.points.map(p=>({x:p.x-base.minX,y:p.y-base.minY})).map(p=>({x:-p.y,y:p.x})),ob=box(outer);
  return ps.map(p=>({x:-p.y-ob.minX,y:p.x-ob.minY}));
}
function translate(ps,x,y){return ps.map(p=>({x:p.x+x,y:p.y+y}))}
function renderNest(r,s){
  S.mode='nest';S.nest=r;clear();const sg=18,totalH=Math.max(s.h,r.sheets.length*s.h+Math.max(0,r.sheets.length-1)*sg);
  E.svg.setAttribute('viewBox',`-8 -8 ${s.w+16} ${totalH+16}`);
  r.sheets.forEach((sh,si)=>{
    const oy=si*(s.h+sg);E.svg.appendChild(svg('rect',{x:0,y:oy,width:s.w,height:s.h,rx:1.5,class:'sheet'}));
    const lab=svg('text',{x:4,y:oy+9,class:'sheet-label'});lab.textContent=`Plate ${si+1} · ${s.w} × ${s.h} mm`;E.svg.appendChild(lab);
    for(const q of sh){
      for(const m of q.part.members){const pp=translate(memberLocal(m,q.part,q.rot),q.x,q.y+oy),cl=!m.active?'inactive':m.id===q.part.rootId?'outer':'inner';E.svg.appendChild(svg(m.closed?'polygon':'polyline',{points:pts(pp),class:`shape ${cl}`,'data-part-id':q.part.id}))}
      const t=svg('text',{x:(q.bbox.minX+q.bbox.maxX)/2,y:(q.bbox.minY+q.bbox.maxY)/2+oy,class:'part-label'});t.textContent=`${q.part.id}${q.rot?'↻':''}`;E.svg.appendChild(t);
    }
  });
  const outerArea=S.parts.reduce((n,p)=>n+p.area,0),cap=Math.max(1,r.sheets.length)*s.w*s.h;
  E.sheets.textContent=r.sheets.length;E.usage.textContent=`${Math.min(100,100*outerArea/cap).toFixed(1)} %`;E.title.textContent='Rask plassering';
  E.note.textContent=r.overflow.length?`${r.overflow.length} del(er) er større enn platen`:`${r.sheets.length} plate${r.sheets.length===1?'':'r'} · gruppebevisst rektangel-nesting`;
  E.reset.disabled=false;
}
