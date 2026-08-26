'use strict';

const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const EPS=1e-7;
const S={file:null,doc:null,shapes:[],parts:[],active:new Set(),groups:new Map(),mode:'original',nest:null};
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
function unionBox(items){const ps=[];for(const x of items){ps.push({x:x.bbox.minX,y:x.bbox.minY},{x:x.bbox.maxX,y:x.bbox.maxY})}return ps.length?box(ps):null}
function areaSigned(ps){let a=0;for(let i=0,j=ps.length-1;i<ps.length;j=i++)a+=ps[j].x*ps[i].y-ps[i].x*ps[j].y;return a/2}
function pip(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||EPS)+a.x)inside=!inside}return inside}
function center(b){return{x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2}}
function containsBox(a,b,tol=EPS){return a.minX<=b.minX+tol&&a.minY<=b.minY+tol&&a.maxX>=b.maxX-tol&&a.maxY>=b.maxY-tol}
function fm(n){return Number.isFinite(n)?n.toFixed(n>=100?0:1):'–'}
function svg(tag,attrs={}){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n}
function pts(ps){return ps.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ')}
function clear(){while(E.svg.firstChild)E.svg.removeChild(E.svg.firstChild)}

function verts(t){
  const out=[];if(!t)return out;
  const r=/V\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)\s+(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)/gi;
  let m;while((m=r.exec(t)))out.push({x:+m[1],y:+m[2]});return out;
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
function flatten(root){
  const defs=definitions(root),out=[],id={n:1},groupIds=new WeakMap();let nextGroup=1;
  S.groups.clear();
  const gid=node=>{if(!groupIds.has(node))groupIds.set(node,nextGroup++);return groupIds.get(node)};
  function walk(shape,parent,path){
    const type=shape.getAttribute('Type')||'',world=mul(parent,xf(shape));
    if(type==='Group'){
      const g=gid(shape),next=path.concat(g);S.groups.set(g,{id:g,depth:next.length});
      const ch=[...shape.children].find(n=>n.tagName==='Children');
      if(ch)for(const s of [...ch.children].filter(n=>n.tagName==='Shape'))walk(s,world,next);
      return;
    }
    let ps=[],closed=false;
    if(type==='Path'){
      const vi=shape.getAttribute('VertID'),pi=shape.getAttribute('PrimID');
      const vn=[...shape.children].find(n=>n.tagName==='VertList'),pn=[...shape.children].find(n=>n.tagName==='PrimList');
      const vt=vn?.textContent.trim()||(vi?defs.v.get(vi):'')||'',pt=pn?.textContent.trim()||(pi?defs.p.get(pi):'')||'';
      ps=verts(vt);closed=isClosedPath(pt);
    }else if(type==='Rect'){
      const w=+shape.getAttribute('W')||0,h=+shape.getAttribute('H')||0;
      ps=[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}];closed=true;
    }else return;
    ps=ps.map(p=>ap(world,p));if(ps.length<2)return;
    const b=box(ps),a=closed?Math.abs(areaSigned(ps)):0,cut=+shape.getAttribute('CutIndex');
    out.push({id:id.n++,type,cut,active:S.active.has(cut),closed,points:ps,bbox:b,area:a,groupPath:path.slice(),nearestGroup:path.length?path[path.length-1]:null});
  }
  for(const s of [...root.children].filter(n=>n.tagName==='Shape'))walk(s,I(),[]);
  return out;
}

function representativePoints(sh){
  const p=sh.points,n=p.length;if(!n)return[];
  const idx=[0,Math.floor(n/4),Math.floor(n/2),Math.floor(3*n/4)],c=center(sh.bbox),out=[];
  for(const i of idx){const q=p[Math.min(n-1,i)];out.push({x:q.x*.999+c.x*.001,y:q.y*.999+c.y*.001})}return out;
}
function insideShape(inner,outer){
  if(!containsBox(outer.bbox,inner.bbox,0.25))return false;
  const samples=representativePoints(inner);let hits=0;for(const p of samples)if(pip(p,outer.points))hits++;
  return hits>=Math.max(1,Math.ceil(samples.length/2));
}
function makePart(outer,members,inners,method,groupId=null){
  const directHoles=inners||[];
  return{rootId:outer.id,outer,inners:directHoles,members:[...new Map(members.map(x=>[x.id,x])).values()],bbox:outer.bbox,area:outer.area,material:Math.max(0,outer.area-directHoles.reduce((s,x)=>s+x.area,0)),method,groupId};
}
function groupCandidates(shapes){
  const map=new Map();
  for(const sh of shapes)for(const g of sh.groupPath){if(!map.has(g))map.set(g,[]);map.get(g).push(sh)}
  return [...map.entries()].map(([gid,members])=>({gid,members,depth:S.groups.get(gid)?.depth||0})).sort((a,b)=>b.depth-a.depth||a.members.length-b.members.length);
}
function partLikeGroup(candidate,consumed){
  const activeClosed=candidate.members.filter(x=>x.active&&x.closed&&x.points.length>=3&&x.area>.01&&!consumed.has(x.id));
  if(!activeClosed.length)return null;
  if(activeClosed.some(x=>consumed.has(x.id)))return null;
  const outer=activeClosed.slice().sort((a,b)=>(b.bbox.width*b.bbox.height)-(a.bbox.width*a.bbox.height)||b.area-a.area)[0];
  if(activeClosed.length===1){
    const meaningful=candidate.members.length>1||candidate.depth>1;
    if(!meaningful)return null;
    return{outer,activeClosed};
  }
  const tol=Math.max(0.5,Math.min(3,Math.max(outer.bbox.width,outer.bbox.height)*0.01));
  let bboxHits=0,centerHits=0;
  for(const s of activeClosed){
    if(containsBox(outer.bbox,s.bbox,tol))bboxHits++;
    if(containsBox(outer.bbox,{minX:center(s.bbox).x,minY:center(s.bbox).y,maxX:center(s.bbox).x,maxY:center(s.bbox).y},tol))centerHits++;
  }
  const ratio=bboxHits/activeClosed.length;
  const union=unionBox(activeClosed);
  const unionFits=union&&containsBox(outer.bbox,union,tol);
  if((unionFits&&ratio>=0.8)||ratio>=0.92||centerHits/activeClosed.length>=0.95)return{outer,activeClosed};
  return null;
}
async function geometryParts(shapes,consumed){
  const cs=shapes.filter(s=>s.active&&s.closed&&s.points.length>=3&&s.area>.01&&!consumed.has(s.id)).sort((a,b)=>a.area-b.area);
  const parent=new Map();
  for(let i=0;i<cs.length;i++){
    const inn=cs[i];let best=null;
    for(let j=i+1;j<cs.length;j++){
      const out=cs[j];if(!containsBox(out.bbox,inn.bbox,0.25))continue;if(best&&out.area>=best.area)continue;
      if(insideShape(inn,out))best=out;
    }
    if(best)parent.set(inn.id,best.id);if(i%30===29)await nextFrame();
  }
  const by=new Map(cs.map(x=>[x.id,x])),depthMemo=new Map();
  function depth(id){if(depthMemo.has(id))return depthMemo.get(id);let d=0,cur=id,seen=new Set();while(parent.has(cur)&&!seen.has(cur)){seen.add(cur);cur=parent.get(cur);d++}depthMemo.set(id,d);return d}
  const parts=[];
  for(const outer of cs){
    if(depth(outer.id)%2!==0)continue;
    const holes=cs.filter(x=>parent.get(x.id)===outer.id&&depth(x.id)%2===1);
    const members=[outer,...holes];parts.push(makePart(outer,members,holes,'geometry'));
  }
  return parts;
}
async function detectParts(shapes){
  const consumed=new Set(),parts=[];
  for(const c of groupCandidates(shapes)){
    const hit=partLikeGroup(c,consumed);if(!hit)continue;
    const activeIds=new Set(hit.activeClosed.map(x=>x.id));
    if(hit.activeClosed.some(x=>consumed.has(x.id)))continue;
    const inner=hit.activeClosed.filter(x=>x.id!==hit.outer.id);
    const members=c.members.filter(x=>activeIds.has(x.id)||!x.active||!x.closed);
    parts.push(makePart(hit.outer,members,inner,'group',c.gid));
    for(const x of hit.activeClosed)consumed.add(x.id);
  }
  const fallback=await geometryParts(shapes,consumed);parts.push(...fallback);
  parts.sort((a,b)=>b.area-a.area).forEach((p,i)=>p.id=i+1);
  return parts;
}
