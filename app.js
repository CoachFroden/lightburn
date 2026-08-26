(()=>{
'use strict';

const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const EPS=1e-7;
const S={file:null,doc:null,shapes:[],parts:[],active:new Set(),mode:'original',nest:null};
const E={
  file:$('fileInput'),drop:$('dropzone'),meta:$('fileMeta'),analyze:$('analyzeBtn'),nest:$('nestBtn'),reset:$('resetBtn'),
  w:$('sheetWidth'),h:$('sheetHeight'),margin:$('margin'),gap:$('gap'),rotate:$('allowRotate'),svg:$('preview'),empty:$('emptyState'),
  list:$('partsList'),count:$('partCount'),shape:$('shapeStat'),contour:$('contourStat'),parts:$('partsStat'),sheets:$('sheetsStat'),
  usage:$('usageStat'),title:$('viewTitle'),note:$('viewNote')
};

const I=()=>[1,0,0,1,0,0];
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
function mul(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
function ap(m,p){return{x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]}}
function xf(n){const x=[...n.children].find(c=>c.tagName==='XForm');if(!x)return I();const v=x.textContent.trim().split(/\s+/).map(Number);return v.length===6&&v.every(Number.isFinite)?v:I()}
function box(ps){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of ps){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}return{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY}}
function areaSigned(ps){let a=0;for(let i=0,j=ps.length-1;i<ps.length;j=i++)a+=ps[j].x*ps[i].y-ps[i].x*ps[j].y;return a/2}
function pip(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||EPS)+a.x)inside=!inside}return inside}
function containsBox(a,b){return a.minX<=b.minX+EPS&&a.minY<=b.minY+EPS&&a.maxX>=b.maxX-EPS&&a.maxY>=b.maxY-EPS}
function fm(n){return Number.isFinite(n)?n.toFixed(n>=100?0:1):'–'}
function svg(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n}
function pts(ps){return ps.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}
function clear(){while(E.svg.firstChild)E.svg.removeChild(E.svg.firstChild)}

function verts(t){
  const out=[];
  if(!t)return out;
  const r=/V\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)\s+(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)/gi;
  let m;while((m=r.exec(t)))out.push({x:+m[1],y:+m[2]});
  return out;
}
function definitions(root){
  const v=new Map(),p=new Map();
  for(const s of root.querySelectorAll('Shape')){
    const vi=s.getAttribute('VertID'),pi=s.getAttribute('PrimID');
    const vn=[...s.children].find(n=>n.tagName==='VertList'),pn=[...s.children].find(n=>n.tagName==='PrimList');
    if(vi&&vn?.textContent.trim()&&!v.has(vi))v.set(vi,vn.textContent.trim());
    if(pi&&pn?.textContent.trim()&&!p.has(pi))p.set(pi,pn.textContent.trim());
  }
  return{v,p};
}
function readCuts(root){
  S.active.clear();
  for(const c of [...root.children].filter(n=>n.tagName==='CutSetting')){
    const o={};for(const x of c.children)o[x.tagName]=x.getAttribute('Value');
    const i=+o.index;if(Number.isFinite(i)&&o.doOutput!=='0')S.active.add(i);
  }
}
function isClosedPath(primText){
  if(!primText)return false;
  if(/closed/i.test(primText))return true;
  return/(?:L|B)\d+\s+0(?:\s|$)/i.test(primText);
}
function walk(shape,parent,defs,out,id,groupDepth=0,topOwner=null){
  const type=shape.getAttribute('Type')||'';
  const world=mul(parent,xf(shape));
  const owner=topOwner||shape;
  if(type==='Group'){
    const ch=[...shape.children].find(n=>n.tagName==='Children');
    if(ch)for(const s of [...ch.children].filter(n=>n.tagName==='Shape'))walk(s,world,defs,out,id,groupDepth+1,owner);
    return;
  }
  let ps=[],closed=false;
  if(type==='Path'){
    const vi=shape.getAttribute('VertID'),pi=shape.getAttribute('PrimID');
    const vn=[...shape.children].find(n=>n.tagName==='VertList'),pn=[...shape.children].find(n=>n.tagName==='PrimList');
    const vt=vn?.textContent.trim()||(vi?defs.v.get(vi):'')||'';
    const pt=pn?.textContent.trim()||(pi?defs.p.get(pi):'')||'';
    ps=verts(vt);closed=isClosedPath(pt);
  }else if(type==='Rect'){
    const w=+shape.getAttribute('W')||0,h=+shape.getAttribute('H')||0;
    ps=[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}];closed=true;
  }else return;
  ps=ps.map(p=>ap(world,p));
  if(ps.length<2)return;
  const b=box(ps),a=closed?Math.abs(areaSigned(ps)):0,cut=+shape.getAttribute('CutIndex');
  out.push({id:id.n++,type,cut,active:S.active.has(cut),closed,points:ps,bbox:b,area:a,groupDepth,topOwner});
}
function flatten(root){
  const d=definitions(root),out=[],id={n:1};
  for(const s of [...root.children].filter(n=>n.tagName==='Shape'))walk(s,I(),d,out,id,0,s);
  return out;
}

function representativePoints(sh){
  const p=sh.points,n=p.length;
  if(!n)return[];
  const idx=[0,Math.floor(n/4),Math.floor(n/2),Math.floor(3*n/4)];
  const c={x:(sh.bbox.minX+sh.bbox.maxX)/2,y:(sh.bbox.minY+sh.bbox.maxY)/2};
  const out=[];
  for(const i of idx){const q=p[Math.min(n-1,i)];out.push({x:q.x*.999+c.x*.001,y:q.y*.999+c.y*.001});}
  return out;
}
function insideShape(inner,outer){
  if(!containsBox(outer.bbox,inner.bbox))return false;
  const samples=representativePoints(inner);
  let hits=0;for(const p of samples)if(pip(p,outer.points))hits++;
  return hits>=Math.max(1,Math.ceil(samples.length/2));
}
async function detectParts(shapes){
  const cs=shapes.filter(s=>s.active&&s.closed&&s.points.length>=3&&s.area>.01).sort((a,b)=>a.area-b.area);
  const parent=new Map();
  for(let i=0;i<cs.length;i++){
    const inn=cs[i];let best=null;
    for(let j=i+1;j<cs.length;j++){
      const out=cs[j];
      if(!containsBox(out.bbox,inn.bbox))continue;
      if(best&&out.area>=best.area)continue;
      if(insideShape(inn,out))best=out;
    }
    if(best)parent.set(inn.id,best.id);
    if(i%30===29)await nextFrame();
  }
  const by=new Map(cs.map(x=>[x.id,x]);
  const rootOf=id=>{const seen=new Set();while(parent.has(id)&&!seen.has(id)){seen.add(id);id=parent.get(id)}return id};
  const groups=new Map();
  for(const c of cs){const r=rootOf(c.id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(c)}
  const parts=[...groups].map(([rid,m])=>{
    const outer=by.get(rid),inners=m.filter(x=>x.id!==rid);
    const holes=inners.filter(x=>parent.get(x.id)===rid);
    return{rootId:rid,outer,inners,members:m,bbox:outer.bbox,area:outer.area,material:Math.max(0,outer.area-holes.reduce((s,x)=>s+x.area,0))};
  }).sort((a,b)=>b.area-a.area).map((p,i)=>({...p,id:i+1}));
  return parts;
}

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
  const labels=S.parts.length<=60?S.parts:S.parts.slice().sort((a,b)=>b.area-a.area).slice(0,60);
  for(const p of labels){
    const t=svg('text',{x:(p.bbox.minX+p.bbox.maxX)/2,y:(p.bbox.minY+p.bbox.maxY)/2,class:'part-label'});t.textContent=p.id;E.svg.appendChild(t);
  }
  E.title.textContent='Original plassering';
  E.note.textContent=S.parts.length?`${fm(b.width)} × ${fm(b.height)} mm tegneområde · ${S.parts.length} sannsynlige deler${S.parts.length>60?' · viser etikett på 60 største':''}`:`${fm(b.width)} × ${fm(b.height)} mm tegneområde · klar for analyse`;
  E.sheets.textContent='–';E.usage.textContent='–';E.reset.disabled=true;
}
function listParts(){
  E.list.innerHTML='';E.count.textContent=S.parts.length;
  if(!S.parts.length){E.list.textContent='Ingen deler oppdaget.';return}
  const frag=document.createDocumentFragment();
  for(const p of S.parts){
    const r=document.createElement('div');r.className='part-row';
    r.innerHTML=`<span class="num">${p.id}</span><span><strong>${fm(p.bbox.width)} × ${fm(p.bbox.height)} mm</strong><br><span class="dims">ca. ${Math.round(p.material).toLocaleString('nb-NO')} mm²</span></span><span class="holes">${p.inners.length} innv.</span>`;
    r.onclick=()=>highlight(p.id);frag.appendChild(r);
  }
  E.list.appendChild(frag);
}
function highlight(id){
  for(const n of E.svg.querySelectorAll('.shape'))n.classList.remove('highlight');
  if(S.mode==='original'){
    const p=S.parts.find(x=>x.id===id);if(!p)return;const ids=new Set(p.members.map(x=>x.id));
    for(const n of E.svg.querySelectorAll('.shape'))if(ids.has(+n.dataset.shapeId))n.classList.add('highlight');
  }else{
    for(const n of E.svg.querySelectorAll(`[data-part-id="${id}"]`))n.classList.add('highlight');
  }
}

function rectContains(a,b){return a.x<=b.x+EPS&&a.y<=b.y+EPS&&a.x+a.w>=b.x+b.w-EPS&&a.y+a.h>=b.y+b.h-EPS}
function intersects(a,b){return !(b.x>=a.x+a.w-EPS||b.x+b.w<=a.x+EPS||b.y>=a.y+a.h-EPS||b.y+b.h<=a.y+EPS)}
function splitFree(free,used){
  if(!intersects(free,used))return[free];
  const out=[];
  if(used.x>free.x+EPS)out.push({x:free.x,y:free.y,w:used.x-free.x,h:free.h});
  if(used.x+used.w<free.x+free.w-EPS)out.push({x:used.x+used.w,y:free.y,w:free.x+free.w-(used.x+used.w),h:free.h});
  if(used.y>free.y+EPS)out.push({x:free.x,y:free.y,w:free.w,h:used.y-free.y});
  if(used.y+used.h<free.y+free.h-EPS)out.push({x:free.x,y:used.y+used.h,w:free.w,h:free.y+free.h-(used.y+used.h)});
  return out.filter(r=>r.w>EPS&&r.h>EPS);
}
function pruneFree(rects){
  const out=[];
  for(let i=0;i<rects.length;i++){
    let contained=false;
    for(let j=0;j<rects.length;j++){if(i!==j&&rectContains(rects[j],rects[i])){contained=true;break}}
    if(!contained)out.push(rects[i]);
  }
  return out;
}
function findRect(part,free,s){
  const base=[{w:part.bbox.width,h:part.bbox.height,rot:false}];
  if(s.rotate&&Math.abs(part.bbox.width-part.bbox.height)>EPS)base.push({w:part.bbox.height,h:part.bbox.width,rot:true});
  let best=null;
  for(const o of base){
    const pw=o.w+s.gap,ph=o.h+s.gap;
    for(let i=0;i<free.length;i++){
      const f=free[i];if(pw>f.w+EPS||ph>f.h+EPS)continue;
      const short=Math.min(f.w-pw,f.h-ph),long=Math.max(f.w-pw,f.h-ph);
      const score=short*1e6+long*1e3+f.y*10+f.x;
      if(!best||score<best.score)best={i,x:f.x,y:f.y,w:pw,h:ph,actualW:o.w,actualH:o.h,rot:o.rot,score};
    }
  }
  return best;
}
function placeRect(sheet,part,s){
  const hit=findRect(part,sheet.free,s);if(!hit)return null;
  const used={x:hit.x,y:hit.y,w:hit.w,h:hit.h};
  const next=[];for(const f of sheet.free)next.push(...splitFree(f,used));sheet.free=pruneFree(next);
  const q={part,rot:hit.rot,x:hit.x,y:hit.y,bbox:{minX:hit.x,minY:hit.y,maxX:hit.x+hit.actualW,maxY:hit.y+hit.actualH,width:hit.actualW,height:hit.actualH}};
  sheet.placed.push(q);return q;
}
function packOrder(parts,s,cmp){
  const usableW=s.w-2*s.margin+s.gap,usableH=s.h-2*s.margin+s.gap;
  const sheets=[],overflow=[];
  for(const part of parts.slice().sort(cmp)){
    const fits=(part.bbox.width<=usableW+EPS&&part.bbox.height<=usableH+EPS)||(s.rotate&&part.bbox.height<=usableW+EPS&&part.bbox.width<=usableH+EPS);
    if(!fits){overflow.push(part);continue}
    let placed=false;
    for(const sh of sheets){if(placeRect(sh,part,s)){placed=true;break}}
    if(!placed){
      const sh={free:[{x:s.margin,y:s.margin,w:usableW,h:usableH}],placed:[]};
      placeRect(sh,part,s);sheets.push(sh);
    }
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
  const base=part.bbox;
  let ps=m.points.map(p=>({x:p.x-base.minX,y:p.y-base.minY}));
  if(!rot)return ps;
  const outer=part.outer.points.map(p=>({x:p.x-base.minX,y:p.y-base.minY})).map(p=>({x:-p.y,y:p.x})),ob=box(outer);
  return ps.map(p=>({x:-p.y-ob.minX,y:p.x-ob.minY}));
}
function translate(ps,x,y){return ps.map(p=>({x:p.x+x,y:p.y+y}))}
function renderNest(r,s){
  S.mode='nest';S.nest=r;clear();
  const sg=18,totalH=Math.max(s.h,r.sheets.length*s.h+Math.max(0,r.sheets.length-1)*sg);
  E.svg.setAttribute('viewBox',`-8 -8 ${s.w+16} ${totalH+16}`);
  r.sheets.forEach((sh,si)=>{
    const oy=si*(s.h+sg);E.svg.appendChild(svg('rect',{x:0,y:oy,width:s.w,height:s.h,rx:1.5,class:'sheet'}));
    const lab=svg('text',{x:4,y:oy+9,class:'sheet-label'});lab.textContent=`Plate ${si+1} · ${s.w} × ${s.h} mm`;E.svg.appendChild(lab);
    for(const q of sh){
      for(const m of q.part.members){
        const pp=translate(memberLocal(m,q.part,q.rot),q.x,q.y+oy),cl=m.id===q.part.rootId?'outer':'inner';
        E.svg.appendChild(svg('polygon',{points:pts(pp),class:`shape ${cl}`,'data-part-id':q.part.id}));
      }
      const t=svg('text',{x:(q.bbox.minX+q.bbox.maxX)/2,y:(q.bbox.minY+q.bbox.maxY)/2+oy,class:'part-label'});t.textContent=`${q.part.id}${q.rot?'↻':''}`;E.svg.appendChild(t);
    }
  });
  const outerArea=S.parts.reduce((n,p)=>n+p.area,0),cap=Math.max(1,r.sheets.length)*s.w*s.h;
  E.sheets.textContent=r.sheets.length;E.usage.textContent=`${Math.min(100,100*outerArea/cap).toFixed(1)} %`;
  E.title.textContent='Rask plassering';
  E.note.textContent=r.overflow.length?`${r.overflow.length} del(er) er større enn platen`:`${r.sheets.length} plate${r.sheets.length===1?'':'r'} · stabil rektangel-nesting (kontur-nesting kommer i neste trinn)`;
  E.reset.disabled=false;
}

function settings(){
  return{w:+E.w.value,h:+E.h.value,margin:Math.max(0,+E.margin.value||0),gap:Math.max(0,+E.gap.value||0),rotate:E.rotate.checked};
}
function validSettings(s){return Number.isFinite(s.w)&&Number.isFinite(s.h)&&s.w>0&&s.h>0&&s.margin*2<s.w&&s.margin*2<s.h}
function setBusy(kind,busy,label){
  const btn=kind==='analyze'?E.analyze:E.nest;if(!btn)return;
  if(!btn.dataset.label)btn.dataset.label=btn.textContent;
  btn.disabled=busy||!S.file||(kind==='nest'&&!S.parts.length);
  btn.textContent=busy?label:btn.dataset.label;
}
async function analyze(){
  if(!S.shapes.length)return;
  setBusy('analyze',true,'Analyserer …');E.nest.disabled=true;E.note.textContent='Analyserer lukkede konturer …';
  await nextFrame();
  try{
    S.parts=await detectParts(S.shapes);E.parts.textContent=S.parts.length;listParts();renderOriginal();E.nest.disabled=!S.parts.length;
  }catch(err){console.error(err);E.note.textContent='Analysen stoppet på grunn av en feil.'}
  finally{setBusy('analyze',false,'Analyserer …')}
}
async function doNest(){
  const s=settings();if(!validSettings(s)){alert('Kontroller platestørrelse og kantmargin.');return}
  setBusy('nest',true,'Beregner …');E.analyze.disabled=true;E.note.textContent='Beregner en rask, stabil plassering …';
  await nextFrame();
  try{const r=nesting(S.parts,s);renderNest(r,s)}
  catch(err){console.error(err);E.note.textContent='Plasseringen stoppet på grunn av en feil.'}
  finally{setBusy('nest',false,'Beregner …');E.analyze.disabled=false}
}
async function loadFile(file){
  if(!file)return;
  S.file=file;S.parts=[];S.nest=null;E.empty.style.display='none';E.note.textContent='Leser LightBurn-filen …';
  await nextFrame();
  try{
    const text=await file.text(),doc=new DOMParser().parseFromString(text,'application/xml');
    if(doc.querySelector('parsererror'))throw new Error('Ugyldig XML');
    const root=doc.documentElement;if(root.tagName!=='LightBurnProject')throw new Error('Filen ser ikke ut som et LightBurn-prosjekt');
    S.doc=doc;readCuts(root);S.shapes=flatten(root);
    const activeClosed=S.shapes.filter(x=>x.active&&x.closed&&x.points.length>=3&&x.area>.01).length;
    E.meta.textContent=`${file.name} · ${(file.size/1024).toFixed(1)} kB · LightBurn ${root.getAttribute('AppVersion')||'ukjent'}`;
    E.shape.textContent=S.shapes.length;E.contour.textContent=activeClosed;E.parts.textContent='–';E.count.textContent='0';E.list.textContent='Klikk «Analyser deler» for å finne fysiske deler.';
    E.analyze.disabled=false;E.nest.disabled=true;E.reset.disabled=true;renderOriginal();
  }catch(err){
    console.error(err);S.file=null;S.shapes=[];S.parts=[];E.meta.textContent=`Kunne ikke lese filen: ${err.message}`;E.note.textContent='Velg en gyldig .lbrn2-fil.';E.analyze.disabled=true;E.nest.disabled=true;
  }
}

E.file?.addEventListener('change',e=>loadFile(e.target.files?.[0]));
E.drop?.addEventListener('dragover',e=>{e.preventDefault();E.drop.classList.add('drag')});
E.drop?.addEventListener('dragleave',()=>E.drop.classList.remove('drag'));
E.drop?.addEventListener('drop',e=>{e.preventDefault();E.drop.classList.remove('drag');const f=e.dataTransfer?.files?.[0];if(f)loadFile(f)});
E.analyze?.addEventListener('click',analyze);
E.nest?.addEventListener('click',doNest);
E.reset?.addEventListener('click',renderOriginal);

})();
