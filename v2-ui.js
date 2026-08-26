function settings(){return{w:+E.w.value,h:+E.h.value,margin:Math.max(0,+E.margin.value||0),gap:Math.max(0,+E.gap.value||0),rotate:E.rotate.checked}}
function validSettings(s){return Number.isFinite(s.w)&&Number.isFinite(s.h)&&s.w>0&&s.h>0&&s.margin*2<s.w&&s.margin*2<s.h}
function setBusy(kind,busy,label){const btn=kind==='analyze'?E.analyze:E.nest;if(!btn)return;if(!btn.dataset.label)btn.dataset.label=btn.textContent;btn.disabled=busy||!S.file||(kind==='nest'&&!S.parts.length);btn.textContent=busy?label:btn.dataset.label}
async function analyze(){
  if(!S.shapes.length)return;setBusy('analyze',true,'Analyserer …');E.nest.disabled=true;E.note.textContent='Leser LightBurn-grupper og konturer …';await nextFrame();
  try{S.parts=await detectParts(S.shapes);E.parts.textContent=S.parts.length;listParts();renderOriginal();E.nest.disabled=!S.parts.length}
  catch(err){console.error(err);E.note.textContent='Analysen stoppet på grunn av en feil.'}
  finally{setBusy('analyze',false,'Analyserer …')}
}
async function doNest(){
  const s=settings();if(!validSettings(s)){alert('Kontroller platestørrelse og kantmargin.');return}
  setBusy('nest',true,'Beregner …');E.analyze.disabled=true;E.note.textContent='Beregner plassering …';await nextFrame();
  try{renderNest(nesting(S.parts,s),s)}catch(err){console.error(err);E.note.textContent='Plasseringen stoppet på grunn av en feil.'}
  finally{setBusy('nest',false,'Beregner …');E.analyze.disabled=false}
}
async function loadFile(file){
  if(!file)return;S.file=file;S.parts=[];S.nest=null;E.empty.style.display='none';E.note.textContent='Leser LightBurn-filen …';await nextFrame();
  try{
    const text=await file.text(),doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Ugyldig XML');
    const root=doc.documentElement;if(root.tagName!=='LightBurnProject')throw new Error('Filen ser ikke ut som et LightBurn-prosjekt');
    S.doc=doc;readCuts(root);S.shapes=flatten(root);
    const activeClosed=S.shapes.filter(x=>x.active&&x.closed&&x.points.length>=3&&x.area>.01).length;
    E.meta.textContent=`${file.name} · ${(file.size/1024).toFixed(1)} kB · LightBurn ${root.getAttribute('AppVersion')||'ukjent'} · ${S.groups.size} grupper`;
    E.shape.textContent=S.shapes.length;E.contour.textContent=activeClosed;E.parts.textContent='–';E.count.textContent='0';E.list.textContent='Klikk «Analyser deler» for å finne fysiske deler.';
    E.analyze.disabled=false;E.nest.disabled=true;E.reset.disabled=true;renderOriginal();
  }catch(err){console.error(err);S.file=null;S.shapes=[];S.parts=[];E.meta.textContent=`Kunne ikke lese filen: ${err.message}`;E.note.textContent='Velg en gyldig .lbrn2-fil.';E.analyze.disabled=true;E.nest.disabled=true}
}

E.file?.addEventListener('change',e=>loadFile(e.target.files?.[0]));
E.drop?.addEventListener('dragover',e=>{e.preventDefault();E.drop.classList.add('drag')});
E.drop?.addEventListener('dragleave',()=>E.drop.classList.remove('drag'));
E.drop?.addEventListener('drop',e=>{e.preventDefault();E.drop.classList.remove('drag');const f=e.dataTransfer?.files?.[0];if(f)loadFile(f)});
E.analyze?.addEventListener('click',analyze);
E.nest?.addEventListener('click',doNest);
E.reset?.addEventListener('click',renderOriginal);
