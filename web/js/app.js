import {loadModelAssets} from './services/model-asset-service.js';
import {loadModelGeometry} from './services/model-geometry-service.js';
import {loadAppearanceProfiles,readModelColors,saveModelColors,applyModelColors,isModelColorStorageEvent} from './services/model-appearance-service.js';
import {mountModelColorControls} from './model-color-controls.js';
import {export3D,createExportLabelTextures} from './services/export-service.js';
import { readFile, validateFile, supportedInputExtensions } from './services/file-reader-service.js';
import { extractData, dxfView, getObjectSummary, prepareWallCandidates, buildStructurePlan, extractStructure } from './services/extraction-service.js';
import { convert2DTo3D } from './services/transfer-service.js';
import { loadObjectCatalog } from './contracts/object-catalog.js';
import { MODEL_DEFAULTS } from './contracts/model-defaults.js';
import { drawDxf } from './dxf-preview.js';
import { normalizeBox } from './plan-analysis.js';
const $=id=>document.getElementById(id), stage=$('stage'), canvas=$('drawing'), paper=$('paper');
const state={source:null,kind:null,file:null,pdf:null,dxf:null,page:1,rotation:0,width:0,height:0,zoom:1,x:0,y:0,token:0,renderID:0,task:null,busy:false,analysis:null,analyses:new Map(),main:true,crop:null,selecting:false,fullWidth:0,fullHeight:0,viewport:null};
const modeling={key:null,candidates:null,structure:null,revision:0,converting:false,exporting:false,failure:null,plan:null,scene:null,baseScene:null,report:null};
let scenePreview=null,objectCatalog=null,modelCatalog=null;
let appearanceProfiles=null,modelColors={},colorControls=null;
$('file-input').accept=supportedInputExtensions().map(extension=>'.'+extension).join(',');
let renderTimer,toastTimer,drag=null,dragDepth=0;
const fmt=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:1}).format(n);
const bytes=n=>n<1024*1024?`${fmt(n/1024)} KB`:`${fmt(n/1024/1024)} MB`;
function notify(message){$('toast-text').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,12000);}
function busy(on,label='正在讀取圖面…'){state.busy=on;$('busy').hidden=!on;$('busy-label').textContent=label;updateButtons();}
function updateButtons(){const off=!state.kind||state.busy;for(const id of ['fit','zoom-in','zoom-out','text-toggle','main-view','full-view']) $(id).disabled=off;$('rotate').disabled=off||state.kind!=='pdf';$('previous-page').disabled=off||state.page<=1;$('next-page').disabled=off||state.page>=(state.pdf?.numPages||1);$('page-select').disabled=off;$('select-region').disabled=off||state.kind!=='pdf';updateModelControls();}
function applyTransform(){paper.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.zoom})`;$('zoom-label').textContent=`${Math.round(state.zoom*100)}%`;}
function fit(){if(!state.width)return;state.zoom=Math.min((stage.clientWidth-48)/state.width,(stage.clientHeight-58)/state.height);state.zoom=Math.max(.02,Math.min(state.zoom,4));state.x=(stage.clientWidth-state.width*state.zoom)/2;state.y=(stage.clientHeight-state.height*state.zoom)/2;applyTransform();scheduleRender();}
function zoom(factor,px=stage.clientWidth/2,py=stage.clientHeight/2){if(!state.kind||state.busy)return;const next=Math.max(.02,Math.min(8,state.zoom*factor)),ratio=next/state.zoom;state.x=px-(px-state.x)*ratio;state.y=py-(py-state.y)*ratio;state.zoom=next;applyTransform();scheduleRender();}
function scheduleRender(){clearTimeout(renderTimer);renderTimer=setTimeout(()=>render().catch(handleRenderError),140);}
function handleRenderError(error){if(error?.name==='RenderingCancelledException')return;console.error(error);notify('圖面顯示失敗：'+(error.message||'請重新匯入檔案'));}
async function cancelRender(){state.renderID++;const previous=state.task;state.task=null;if(previous){previous.cancel();try{await previous.promise;}catch{}}}
async function render(){
  if(!state.kind||!state.width)return;
  const token=state.token,renderID=++state.renderID;
  const previous=state.task;
  if(previous){previous.cancel();try{await previous.promise;}catch{}}
  if(token!==state.token||renderID!==state.renderID)return;
  const density=Math.min(Math.max(state.zoom*(window.devicePixelRatio||1),1),4,Math.sqrt(16000000/(state.width*state.height)));
  canvas.width=Math.max(1,Math.round(state.width*density));canvas.height=Math.max(1,Math.round(state.height*density));
  canvas.style.width=`${state.width}px`;canvas.style.height=`${state.height}px`;paper.style.width=`${state.width}px`;paper.style.height=`${state.height}px`;
  const context=canvas.getContext('2d',{alpha:false});
  if(state.kind==='pdf'){
    const page=await state.pdf.getPage(state.page);
    if(token!==state.token||renderID!==state.renderID)return;
    const viewport=page.getViewport({scale:1,rotation:(page.rotate+state.rotation)%360});
    const crop=state.crop||[0,0,viewport.width,viewport.height];
    const task=page.render({canvasContext:context,viewport,transform:[density,0,0,density,-crop[0]*density,-crop[1]*density],background:'#ffffff',...(state.main&&state.analysis?{optionalContentConfigPromise:Promise.resolve(state.analysis.config)}:{})});state.task=task;
    try{await task.promise;}finally{if(state.task===task)state.task=null;}
  } else {context.setTransform(density,0,0,density,0,0);drawDxf(context,state.dxf,state.width,state.height);}
  if(token===state.token&&renderID===state.renderID)renderWallOverlay();
}
async function clearDocument(){
  ++state.token;clearTimeout(renderTimer);invalidateModel();modeling.key=null;modeling.candidates=null;modeling.structure=null;refreshModelUI();await cancelRender();
  const source=state.source;state.source=null;state.pdf=null;
  if(source){try{await source.dispose();}catch{}}
  Object.assign(state,{kind:null,file:null,dxf:null,page:1,rotation:0,width:0,height:0,zoom:1,x:0,y:0,analysis:null,analyses:new Map(),main:true,crop:null,selecting:false,fullWidth:0,fullHeight:0,viewport:null});
  paper.hidden=true;$('empty-state').hidden=false;stage.classList.remove('has-document');$('stage-hint').hidden=true;
  $('file-card').hidden=true;$('file-placeholder').hidden=false;$('page-controls').hidden=true;$('diagnostics').hidden=true;
  $('view-title').textContent='主要平面圖';$('region-status').textContent='匯入後自動尋找主要圖面';$('crop-selection').hidden=true;stage.classList.remove('selecting');$('select-region').textContent='框選範圍';updateViewModes();$('meta-format').textContent='—';$('meta-count-label').textContent='頁面數量';$('meta-count').textContent='—';$('meta-dim-label').textContent='頁面尺寸';$('meta-dim').textContent='—';$('meta-scale').textContent='尚未校正';
  $('read-detail').textContent='等待檔案匯入';$('read-check').textContent='1';$('read-check').classList.remove('done');$('status-dot').classList.remove('ready');$('status-text').textContent='準備好接收你的圖面';$('footer-type').textContent='PDF / DXF';$('zoom-label').textContent='100%';$('file-input').value='';busy(false);
}
function updateInfo(){
  const file=state.file,type=state.kind.toUpperCase();
  $('file-placeholder').hidden=true;$('file-card').hidden=false;$('file-name').textContent=file.name;$('file-name').title=file.name;$('file-size').textContent=bytes(file.size);$('file-badge').textContent=type;$('meta-format').textContent=type;$('view-title').textContent=file.name;$('footer-type').textContent=type;
  $('status-text').textContent='圖面已讀取 · 結構候選待核對';$('status-dot').classList.add('ready');$('read-check').textContent='✓';$('read-check').classList.add('done');$('read-detail').textContent='已在本機顯示檔案內容';
  if(state.kind==='pdf'){$('meta-count-label').textContent='頁面數量';$('meta-count').textContent=`${state.pdf.numPages} 頁`;$('meta-dim-label').textContent='紙張尺寸';$('meta-dim').textContent=`${fmt(state.fullWidth*25.4/72)} × ${fmt(state.fullHeight*25.4/72)} mm`;$('page-controls').hidden=false;$('page-total').textContent=`/ ${state.pdf.numPages} 頁`;$('page-select').value=String(state.page);}
  else {$('meta-count-label').textContent='原始圖元';$('meta-count').textContent=`${fmt(state.dxf.total)} 個`;$('meta-dim-label').textContent='CAD 宣告單位';$('meta-dim').textContent=state.dxf.units;$('meta-scale').textContent=modeling.structure?.calibration?'左上牆 20 cm · 自動換算':'尚無參考牆';if(state.dxf.warnings.length){$('diagnostics').hidden=false;$('diagnostics').textContent=state.dxf.warnings.join('\n');}}
}
async function showPdfPage(pageNumber,reset=true){
  if(!state.pdf)return;const token=state.token;busy(true,'正在顯示 PDF 頁面…');
  try{
    await cancelRender();state.page=pageNumber;const page=await state.pdf.getPage(pageNumber);if(token!==state.token)return;
    if(!state.analyses.has(pageNumber)){
      const {analysis}=await extractData(state.source,{pageNumber,includeGeometry:true});
      if(token!==state.token)return;state.analyses.set(pageNumber,analysis);
    }
    state.analysis=state.analyses.get(pageNumber);
    const vp=page.getViewport({scale:1,rotation:(page.rotate+state.rotation)%360});state.viewport=vp;state.fullWidth=vp.width;state.fullHeight=vp.height;
    const region=state.analysis.userBox||state.analysis.box;
    state.crop=state.main&&region?normalizeBox(vp.convertToViewportRectangle(region)):null;
    state.width=state.crop?state.crop[2]-state.crop[0]:vp.width;state.height=state.crop?state.crop[3]-state.crop[1]:vp.height;
    refreshModelCandidates();if(reset)fit();clearTimeout(renderTimer);await render();if(token!==state.token)return;updateInfo();updateViewModes();
  }
  finally{if(token===state.token)busy(false);}
}
let importQueue=Promise.resolve();
function importFile(file){
  // Serialize loads so worker destruction cannot reset a newer document.
  if(!file)return;
  importQueue=importQueue.then(()=>loadFile(file)).catch(error=>{console.error(error);notify('無法讀取檔案，請再試一次。');});
  return importQueue;
}
async function loadFile(file){
  try{validateFile(file);}catch(error){notify(error.message);return;}
  setWorkspace('2d');
  await clearDocument();const token=state.token;busy(true);
  try{
    objectCatalog ||= await loadObjectCatalog();
    if(token!==state.token)return;
    const source=await readFile(file);
    if(token!==state.token){await source.dispose();return;}
    state.source=source;state.file=file;state.kind=source.format;
    if(source.format==='pdf'){
      const doc=source.document;state.pdf=doc;
      $('page-select').replaceChildren();for(let i=1;i<=doc.numPages;i++){const option=document.createElement('option');option.value=String(i);option.textContent=String(i);$('page-select').append(option);}
      await showPdfPage(1);
    }else{
      const extracted=await extractData(source);state.dxf=extracted.preview;refreshModelCandidates();
      state.width=1400;state.height=1000;fit();clearTimeout(renderTimer);await render();updateInfo();updateViewModes();
    }
    if(token!==state.token)return;$('empty-state').hidden=true;paper.hidden=false;stage.classList.add('has-document');$('stage-hint').hidden=false;busy(false);stage.focus({preventScroll:true});
  }catch(error){if(token!==state.token)return;console.error(error);await clearDocument();notify(`無法讀取圖面：${error.message||'檔案可能損壞，請重新匯出後再試。'}`);}
  finally{if(token===state.token)busy(false);}
}

function updateViewModes(){
  $('main-view').classList.toggle('selected',state.main);$('full-view').classList.toggle('selected',!state.main);
  if(!state.kind)return;
  $('stage-hint').textContent=state.selecting?'拖曳框選主要圖面 · Esc 取消':'拖曳移動 · 滾輪縮放 · F 符合視窗';
  if(state.selecting){$('region-status').textContent='拖曳框選平面圖 · Esc 取消';return;}
  if(!state.main){$('region-status').textContent='完整原圖 · 物件清單仍依主要選區';return;}
  if(state.kind==='dxf'){$('region-status').textContent='已排除圖框圖層';return;}
  $('region-status').textContent=state.analysis?.userBox?'使用手動選取範圍':state.analysis?.method==='layers'?'已依圖層聚焦平面圖':state.analysis?.box?'自動範圍 · 可手動調整':'請框選主要平面圖';
}
function applyDxfView(){if(state.dxf)state.dxf=dxfView(state.dxf,state.main);}
function exitSelection(){state.selecting=false;drag=null;stage.classList.remove('selecting');$('crop-selection').hidden=true;$('select-region').textContent='框選範圍';}
function selectionPoint(event){const r=stage.getBoundingClientRect();return [Math.max(0,Math.min(state.fullWidth,(event.clientX-r.left-state.x)/state.zoom)),Math.max(0,Math.min(state.fullHeight,(event.clientY-r.top-state.y)/state.zoom))];}
function drawSelection(a,b){const box=normalizeBox([...a,...b]),el=$('crop-selection');el.hidden=false;Object.assign(el.style,{left:`${box[0]}px`,top:`${box[1]}px`,width:`${box[2]-box[0]}px`,height:`${box[3]-box[1]}px`});}
function finishSelection(a,b){if(Math.abs(a[0]-b[0])<20||Math.abs(a[1]-b[1])<20){$('crop-selection').hidden=true;notify('選取範圍太小，請拖曳框選完整的平面圖。');return;}const x=state.viewport.convertToPdfPoint(...a),y=state.viewport.convertToPdfPoint(...b);state.analysis.userBox=normalizeBox([...x,...y]);exitSelection();state.main=true;showPdfPage(state.page).catch(handleRenderError);}
for(const [id,main]of [['main-view',true],['full-view',false]])$(id).addEventListener('click',()=>{exitSelection();state.main=main;if(state.kind==='pdf')showPdfPage(state.page).catch(handleRenderError);else{applyDxfView();fit();render().catch(handleRenderError);updateViewModes();}});
$('select-region').addEventListener('click',async()=>{if(state.selecting){exitSelection();state.main=true;await showPdfPage(state.page);return;}state.main=false;state.selecting=true;await showPdfPage(state.page);stage.classList.add('selecting');$('select-region').textContent='取消框選';updateViewModes();stage.focus({preventScroll:true});});

document.querySelectorAll('[data-open-file]').forEach(button=>button.addEventListener('click',()=>$('file-input').click()));
$('file-input').addEventListener('change',event=>importFile(event.target.files[0]));
$('clear').addEventListener('click',()=>{importQueue=importQueue.then(clearDocument);});
$('fit').addEventListener('click',fit);$('zoom-in').addEventListener('click',()=>zoom(1.2));$('zoom-out').addEventListener('click',()=>zoom(1/1.2));
$('rotate').addEventListener('click',()=>{state.rotation=(state.rotation+90)%360;showPdfPage(state.page).catch(handleRenderError);});
$('previous-page').addEventListener('click',()=>showPdfPage(state.page-1).catch(handleRenderError));$('next-page').addEventListener('click',()=>showPdfPage(state.page+1).catch(handleRenderError));$('page-select').addEventListener('change',event=>showPdfPage(Number(event.target.value)).catch(handleRenderError));
$('dismiss-toast').addEventListener('click',()=>$('toast').hidden=true);
stage.addEventListener('wheel',event=>{if(!state.kind)return;event.preventDefault();const box=stage.getBoundingClientRect();zoom(Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.002),event.clientX-box.left,event.clientY-box.top);},{passive:false});
stage.addEventListener('pointerdown',event=>{if(!state.kind||state.busy||event.button!==0)return;if(state.selecting){const p=selectionPoint(event);drag={selection:true,start:p};stage.setPointerCapture(event.pointerId);drawSelection(p,p);return;}drag={x:event.clientX,y:event.clientY,originX:state.x,originY:state.y};stage.setPointerCapture(event.pointerId);stage.classList.add('is-dragging');});
stage.addEventListener('pointermove',event=>{if(!drag)return;if(drag.selection){drawSelection(drag.start,selectionPoint(event));return;}state.x=drag.originX+event.clientX-drag.x;state.y=drag.originY+event.clientY-drag.y;applyTransform();});
stage.addEventListener('pointerup',event=>{if(drag?.selection){const a=drag.start,b=selectionPoint(event);drag=null;finishSelection(a,b);}else drag=null;stage.classList.remove('is-dragging');});
for(const name of ['pointercancel','lostpointercapture'])stage.addEventListener(name,()=>{drag=null;stage.classList.remove('is-dragging');});
stage.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.selecting){exitSelection();state.main=true;showPdfPage(state.page).catch(handleRenderError);return;}if(event.key.toLowerCase()==='f'){event.preventDefault();fit();}else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.2);}else if(event.key==='-'){event.preventDefault();zoom(1/1.2);}});
for(const name of ['dragenter','dragover','dragleave','drop'])window.addEventListener(name,event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
stage.addEventListener('dragenter',event=>{if(event.dataTransfer?.types.includes('Files')){dragDepth++;$('drop-overlay').hidden=false;}});
stage.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});
stage.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});
stage.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;const files=event.dataTransfer?.files;if(files?.length>1)notify('一次顯示一份圖面，已讀取第一個檔案。');if(files?.[0])importFile(files[0]);});
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.kind&&!state.busy)fit();},180);}).observe(stage);
$('demo').addEventListener('click',async()=>{try{const response=await fetch('./assets/sample-plan.dxf');if(!response.ok)throw new Error();await importFile(new File([await response.text()],'範例・小型工作室.dxf',{type:'application/dxf'}));}catch{notify('範例載入失敗，請從本機伺服器開啟網站。');}});
$('text-toggle').addEventListener('click',()=>{
  if(!state.kind)return;
  $('content-dialog').showModal();$('content-title').textContent='主要圖面 · 物件清單';
  $('content-description').textContent='只整理選定平面圖中的圖層與物件標示，排除圖框、日期、公司資訊和尺寸文字。';
  const summary=getObjectSummary(state.kind==='pdf'?{format:'pdf',analysis:state.analysis}:{format:'dxf',preview:state.dxf});
  renderObjectSummary(summary);
});
function renderObjectSummary(summary){
  const root=$('content-objects');root.replaceChildren();
  const addText=(text,cls)=>{const node=document.createElement('div');node.className=cls;node.textContent=text;root.append(node);};
  if(!summary){addText('尚未確認主要圖面範圍，請先使用「框選範圍」選取平面設計圖。','object-empty');return;}
  function section(title,items,counts){const wrapper=document.createElement('section');wrapper.className='object-section';const h=document.createElement('h3');h.textContent=title;wrapper.append(h);const chips=document.createElement('div');chips.className='object-chips';for(const item of items){const chip=document.createElement('span');chip.className='object-chip';chip.textContent=item.name;if(counts){const n=document.createElement('small');n.textContent=`${item.count} 處標示`;chip.append(n);}chips.append(chip);}wrapper.append(chips);root.append(wrapper);}
  if(summary.layers.length)section('圖層中的物件類別',summary.layers.map(name=>({name})),false);
  for(const category of summary.categories)section(category.title,category.items,true);
  if(!summary.layers.length&&!summary.categories.length)addText('選區內沒有可直接分類的圖層或物件文字。掃描圖與未標示的家具仍需要後續影像／幾何辨識。','object-empty');
  addText('以上依圖層與文字標示整理；標示次數不等於實際物件數。椅子等未標示的圖形尚未分割為獨立物件。','object-note');
}
$('close-dialog').addEventListener('click',()=>$('content-dialog').close());
$('content-dialog').addEventListener('click',event=>{if(event.target===$('content-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
if(location.protocol==='file:')notify('請使用「啟動圖面工作室.command」開啟本機網站，PDF 模組需要 HTTP 伺服器。');

// Orchestration only: extraction -> transfer -> independent preview service.
function updateModelControls(){
  const off=!state.kind||state.busy||modeling.converting,hasStructures=!!modeling.structure?.objects.some(o=>['wall','column','door','chair','tall_cabinet','table','cabinet','placeholder'].includes(o.kind));
  $('convert-3d').disabled=off||!hasStructures||!modeling.structure?.calibration;
  $('structure-overlay-toggle').disabled=off||!modeling.structure?.objects.length;
  const ready=!!(modeling.scene&&scenePreview&&!modeling.converting&&!state.busy);
  $('view-3d').disabled=!ready;$('scene-tab-status').textContent=ready?'可查看':modeling.converting?'轉換中':modeling.failure?'未完成':'待轉換';
  $('view-3d').title=ready?'查看本次圖面的 3D 初稿':modeling.failure?'轉換未完成，請查看下方原因':'成功轉換後即可查看 3D';
  $('conversion-status').hidden=!modeling.converting;
  for(const id of ['scene-fit','scene-png'])$(id).disabled=!ready;
  $('scene-export').disabled=!ready||modeling.exporting;
  $('scene-export').textContent=modeling.exporting?'正在產生 DAE…':'下載 DAE 編輯初稿';
  $('convert-label').textContent=modeling.converting?'正在建立模型…':modeling.scene?'重新產生 3D 預覽':modeling.failure?'重試產生 3D 預覽':'產生 3D 預覽';
}
function invalidateModel(){
  modeling.revision++;modeling.converting=false;modeling.exporting=false;modeling.failure=null;modeling.scene=null;modeling.baseScene=null;modeling.plan=null;modeling.report=null;
  colorControls=null;$('model-color-controls').replaceChildren();$('model-color-panel').hidden=true;
  $('export-status').textContent='下載單一 DAE 檔，在 SketchUp「檔案 → 匯入」選擇即可；缺少模型以無字紅色方塊顯示。';
  if(scenePreview){scenePreview.dispose();scenePreview=null;}
  $('model-error').hidden=true;setWorkspace('2d');updateModelControls();
}
function refreshModelCandidates(){
  if(!state.source)return;
  const region=state.kind==='pdf'?state.analysis.userBox||state.analysis.box:null;
  const key=JSON.stringify([state.source.sha256,state.page,region]);if(modeling.key===key)return;
  invalidateModel();modeling.key=key;
  try{
    const extracted=state.kind==='pdf'?{format:'pdf',analysis:state.analysis,pageNumber:state.page}:{format:'dxf',preview:state.dxf};
    modeling.candidates=prepareWallCandidates(state.source,extracted);
    modeling.structure=extractStructure(state.source,extracted,{wallCandidates:modeling.candidates,catalog:objectCatalog});
  }catch(error){modeling.candidates=null;modeling.structure=null;$('model-error').textContent=error.message;$('model-error').hidden=false;}
  refreshModelUI();
}
function refreshModelUI(){
  const walls=modeling.candidates?.walls||[],structure=modeling.structure;
  $('wall-pair-status').textContent=structure?`已整理 ${structure.objects.length} 個結構與家具候選，待核對`:'等待讀取圖面';
  $('model-status').textContent=walls.length?'比例已自動換算，可將柱、隔間、門片與家具產生為 3D 初稿。':'';
  $('meta-scale').textContent=structure?.calibration?'左上牆 20 cm · 自動換算':'尚無參考牆';
  $('structure-status').textContent=structure?`已萃取 ${structure.objects.length} 個物件候選，請對照原圖核對。`:'讀入圖面後，依填充紋理與輪廓整理結構。';
  $('structure-counts').hidden=!structure;$('structure-details').hidden=!structure;
  $('structure-counts').replaceChildren();$('structure-list').replaceChildren();
  if(structure){
    for(const [name,count]of [['柱',structure.summary.concrete_columns],['水泥牆區',structure.summary.concrete_walls],['輕隔間',structure.summary.light_partitions],['門片',structure.summary.doors||0],['椅子',structure.summary.chairs||0],['櫃子',(structure.summary.tall_cabinets||0)+(structure.summary.cabinets||0)],['桌子',structure.summary.tables||0],['具名設備',structure.summary.placeholders||0]]){const item=document.createElement('div'),strong=document.createElement('strong'),label=document.createElement('span');strong.textContent=count;label.textContent=name;item.append(strong,label);$('structure-counts').append(item);}
    for(const object of structure.objects){const li=document.createElement('li');li.textContent=`${object.label} · ${object.kind==='placeholder'?`設備候選 · ${object.support_id?'檯面上':'地面'}`:object.kind==='cabinet'?`名稱＋框線 · 櫃高 ${fmt(object.height_mm/10)} cm`:object.kind==='table'?(object.holes.length?'曲線桌面＋中央留空':'空白家具框桌面'):object.kind==='chair'?'座面邊線＋椅背弧線':object.kind==='tall_cabinet'?'封閉大框＋X 標記':object.kind==='door'?'弧線＋門片輪廓':object.evidence.method==='labelled_oa_closed_parallel_strips'?'辦公標示＋無填充隔板 · 屏風 120 cm':object.evidence.pattern==='crosshatch'?'網格填充':object.evidence.pattern==='diagonal'?'斜線填充':'無填充平行牆線'}${object.boundary.length>4?' · 轉折輪廓':''}`;$('structure-list').append(li);}
    $('structure-diagnostics').textContent=structure.diagnostics.map(d=>d.message).join(' ');
  }else $('structure-diagnostics').textContent='';
  updateModelControls();renderWallOverlay();
}
function renderWallOverlay(){
  const overlay=$('wall-overlay');overlay.replaceChildren();const objects=modeling.structure?.objects||[];
  const hidden=!objects.length||state.selecting||!$('structure-overlay-toggle').checked;overlay.toggleAttribute('hidden',hidden);if(hidden||!state.width)return;
  overlay.setAttribute('viewBox',`0 0 ${state.width} ${state.height}`);overlay.setAttribute('width',state.width);overlay.setAttribute('height',state.height);
  const project=p=>{
    if(state.kind==='pdf'){const xy=state.viewport.convertToViewportPoint(...p);return [xy[0]-(state.crop?.[0]||0),xy[1]-(state.crop?.[1]||0)];}
    const b=state.dxf.bounds,sx=Math.max(b.maxX-b.minX,1),sy=Math.max(b.maxY-b.minY,1),scale=Math.min((state.width-120)/sx,(state.height-120)/sy);
    return [(state.width-sx*scale)/2+(p[0]-b.minX)*scale,(state.height-sy*scale)/2+(b.maxY-p[1])*scale];
  };
  const svg=(tag,attributes)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,value);return node;};
  for(const object of objects){
    const color=object.kind==='placeholder'?'#367fa3':object.kind==='cabinet'?'#a8763c':object.kind==='table'?'#b69450':object.kind==='chair'?'#284f57':object.kind==='tall_cabinet'?'#a8763c':object.kind==='door'?'#9b683b':object.kind==='column'?'#526e90':object.material.kind==='light_partition'?'#aa793a':object.kind==='wall'?'#4c7464':'#a35d6b';
    const path=[object.boundary,...object.holes].map(ring=>'M '+ring.map(p=>project(p).join(' ')).join(' L ')+' Z').join(' ');
    overlay.append(svg('path',{d:path,fill:object.material.color,'fill-opacity':.3,stroke:color,'stroke-width':2,'fill-rule':'evenodd'}));
    let edge=0;for(let i=1;i<object.boundary.length;i++){const p=object.boundary[i],q=object.boundary[(i+1)%object.boundary.length],a=object.boundary[edge],b=object.boundary[(edge+1)%object.boundary.length];if(Math.hypot(q[0]-p[0],q[1]-p[1])>Math.hypot(b[0]-a[0],b[1]-a[1]))edge=i;}
    const a=object.boundary[edge],b=object.boundary[(edge+1)%object.boundary.length],position=object.kind==='column'?[(object.bbox[0]+object.bbox[2])/2,(object.bbox[1]+object.bbox[3])/2]:a.map((v,i)=>(v+b[i])/2),[x,y]=project(position);
    const label=svg('text',{x:x+6,y:y-6,style:`fill:${color}`});label.textContent=object.label.split(' ').at(-1);overlay.append(label);
  }
  const reference=modeling.candidates?.walls.find(w=>w.id===modeling.candidates.referenceWallId);
  if(reference){const [x1,y1]=project(reference.start),[x2,y2]=project(reference.end);overlay.append(svg('line',{x1,y1,x2,y2,stroke:'#bc6b20','stroke-width':4,opacity:.8}));const label=svg('text',{x:(x1+x2)/2,y:(y1+y2)/2+20,class:'reference'});label.textContent='20 cm 參考';overlay.append(label);}

}
function setWorkspace(mode){
  if(mode==='3d'&&(!modeling.scene||!scenePreview||modeling.converting))return;
  const is3D=mode==='3d';$('plan-workspace').hidden=is3D;$('scene-workspace').hidden=!is3D;
  for(const [id,selected]of [['view-2d',!is3D],['view-3d',is3D]]){$(id).classList.toggle('selected',selected);$(id).setAttribute('aria-pressed',String(selected));}
  if(is3D){scenePreview.resize();scenePreview.fit();}else if(state.kind)fit();
}
function previewError(message){
  invalidateModel();showConversionFailure(message,'顯示 3D 預覽');
}
function showConversionFailure(error,step){
  const reason=(typeof error==='string'?error:error?.message)?.trim()||'未取得詳細原因，請重新嘗試；若再次失敗，請提供這份圖檔以便檢查。';
  modeling.failure=`3D 預覽未完成（${step}）：${reason}`;
  $('model-error').textContent=modeling.failure;$('model-error').hidden=false;
  $('model-status').textContent='這次轉換未完成，原因顯示於產生預覽按鈕下方。';
  updateModelControls();$('model-error').focus({preventScroll:true});$('model-error').scrollIntoView({block:'nearest'});
}
async function convertCurrentPlan(){
  if($('convert-3d').disabled)return;
  invalidateModel();const revision=modeling.revision,token=state.token;
  modeling.converting=true;updateModelControls();
  let step='準備轉換';
  const progress=message=>{step=message;$('conversion-status').textContent=message+'…';$('model-status').textContent=message+'…';};
  progress(step);
  const current=()=>revision===modeling.revision&&token===state.token;
  let viewer=null;
  try{
    await new Promise(resolve=>requestAnimationFrame(resolve));if(!current())return;
    progress('讀取模型設定');
    modelCatalog ||= await loadModelAssets();if(!current())return;
    appearanceProfiles ||= await loadAppearanceProfiles();if(!current())return;
    modelColors=readModelColors(appearanceProfiles);
    progress('整理圖面物件');
    const plan=buildStructurePlan(state.source,modeling.structure,{modelCatalog});
    progress('載入物件模型');
    const modelScenes=await loadModelGeometry(plan,modelCatalog);if(!current())return;
    progress('建立 3D 幾何');
    const result=convert2DTo3D(plan,{mode:'preview'},modelScenes);
    if(!result.scene||result.report.status!=='success')throw new Error(result.report.diagnostics.filter(d=>d.severity==='error').map(d=>d.message).join('；')||'轉換失敗。');
    progress('顯示 3D 預覽');
    const {createScenePreview}=await import('./services/preview-service.js');if(!current())return;
    viewer=createScenePreview($('scene-stage'),message=>{if(scenePreview===viewer||current())previewError(message);});
    const coloredScene=applyModelColors(result.scene,appearanceProfiles,modelColors);
    viewer.show(coloredScene);if(!current()){viewer.dispose();return;}
    scenePreview=viewer;modeling.plan=plan;modeling.baseScene=result.scene;modeling.scene=coloredScene;modeling.report=result.report;modeling.converting=false;
    const usedIds=new Set(result.scene.extensions?.twothreeD?.model_sources?.map(a=>a.id)||[]),usedProfiles=appearanceProfiles.filter(p=>usedIds.has(p.asset_id));
    $('model-color-panel').hidden=!usedProfiles.length;
    colorControls=mountModelColorControls($('model-color-controls'),{profiles:usedProfiles,colors:modelColors,onChange:(id,hex)=>{
      const next={...readModelColors(appearanceProfiles),...modelColors};if(hex===null)delete next[id];else next[id]=hex;
      updateSceneColors(next);const saved=saveModelColors(next);$('model-color-status').textContent=saved?'已套用並記住配色；同款模型與下載 DAE 一起更新。':'已套用配色；瀏覽器無法儲存，下次開啟需重新設定。';
    }});
    $('scene-message').hidden=true;$('scene-source').textContent=state.file.name+` · 第 ${state.page} 頁`;
    const count=result.report.metrics.walls,columns=result.report.metrics.columns||0,doors=result.report.metrics.doors||0,chairs=result.report.metrics.chairs||0,cabinets=(result.report.metrics.tall_cabinets||0)+(result.report.metrics.cabinets||0),tables=result.report.metrics.tables||0,markers=result.report.metrics.placeholders||0,models=result.report.metrics.asset_models||0;$('scene-summary').textContent=`本次圖面 · ${columns} 柱 · ${count} 牆區 · ${doors} 門 · ${chairs} 椅 · ${cabinets} 櫃 · ${tables} 桌 · ${markers} 紅色方塊 · ${models} 物件套用模型 · 毫米制`;
    $('scene-notes').replaceChildren();
    for(const text of [`牆高 ${fmt(MODEL_DEFAULTS.wall_height_mm/10)} cm`,`參考牆厚 ${fmt(MODEL_DEFAULTS.reference_wall_thickness_mm/10)} cm`,`門高 ${fmt(MODEL_DEFAULTS.door_height_mm/10)} cm`,`椅座 ${fmt(MODEL_DEFAULTS.chair_seat_height_mm/10)}／椅背 ${fmt(MODEL_DEFAULTS.chair_height_mm/10)} cm`,'櫃高 90／150／210 cm','紅色方塊 40 cm · 浮高 10 cm',`桌高 ${fmt(MODEL_DEFAULTS.table_height_mm/10)} cm`,`辦公屏風 ${fmt(MODEL_DEFAULTS.office_screen_height_mm/10)} cm`,'設備依自身圖框等比例縮放','支架白板依圖上完整寬深高','櫃體依圖框寬深＋預設高度','模型放在承載檯面，方塊保留浮高','比例與物件尚待核對']){const span=document.createElement('span');span.textContent=text;$('scene-notes').append(span);}
    $('scene-diagnostics').replaceChildren();
    for(const diagnostic of result.report.diagnostics.filter(d=>d.code!=='W_UNCONFIRMED_ELEMENT')){const li=document.createElement('li');li.textContent=diagnostic.message;$('scene-diagnostics').append(li);}
    $('model-status').textContent=`已轉換 ${columns} 柱、${count} 牆區、${doors} 門、${chairs} 椅、${cabinets} 櫃、${tables} 桌及 ${markers} 紅色方塊；${models} 個物件已套用模型，可切換 3D 預覽。`;
    updateModelControls();setWorkspace('3d');
  }catch(error){
    try{viewer?.dispose();}catch(cleanupError){console.error(cleanupError);}
    if(!current())return;console.error('3D 預覽未完成：'+step,error);
    scenePreview=null;modeling.scene=null;modeling.baseScene=null;modeling.report=null;modeling.plan=null;
    colorControls=null;$('model-color-controls').replaceChildren();$('model-color-panel').hidden=true;
    showConversionFailure(error,step);
  }finally{if(current()){modeling.converting=false;updateModelControls();}}
}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('structure-overlay-toggle').addEventListener('change',renderWallOverlay);
$('convert-3d').addEventListener('click',convertCurrentPlan);
$('view-2d').addEventListener('click',()=>setWorkspace('2d'));
$('view-3d').addEventListener('click',()=>setWorkspace('3d'));
$('scene-fit').addEventListener('click',()=>scenePreview?.fit());
$('scene-png').addEventListener('click',async()=>{if(!scenePreview||!modeling.scene)return;try{downloadBlob(await scenePreview.png(),'twothreeD-structure-preview.png');}catch(error){notify(error.message);}});
$('scene-export').addEventListener('click',async()=>{
  if(!modeling.scene||modeling.exporting||$('scene-export').disabled)return;
  const scene=modeling.scene,revision=modeling.revision,filename=state.file?.name||'twothreeD';
  modeling.exporting=true;updateModelControls();$('export-status').textContent='正在產生單一 DAE 模型…';
  try{
    const labelTextures=await createExportLabelTextures(scene);if(revision!==modeling.revision)return;
    const output=export3D(scene,{format:'dae',mode:'draft',container:'dae',filename,labelTextures});
    if(!output.success)throw new Error(output.diagnostics.map(d=>d.message).join('；'));
    if(revision!==modeling.revision)return;
    downloadBlob(new Blob([output.artifact.content],{type:output.artifact.mimeType}),output.artifact.filename);
    $('export-status').textContent=`已下載可編輯初稿（${output.summary.object_groups} 個物件群組）。可直接在 SketchUp 的「檔案 → 匯入」選擇此 DAE 檔；圖面尺寸與辨識仍待核對。`;
  }catch(error){if(revision===modeling.revision){$('export-status').textContent='下載未完成：'+error.message;notify(error.message);}}
  finally{if(revision===modeling.revision){modeling.exporting=false;updateModelControls();}}
});
updateModelControls();

function updateSceneColors(colors){
  if(!modeling.baseScene||!scenePreview)return;
  const next=applyModelColors(modeling.baseScene,appearanceProfiles,colors);
  scenePreview.show(next,{preserveView:true});modeling.scene=next;modelColors=colors;
  modeling.revision++;modeling.exporting=false;updateModelControls();
  $('export-status').textContent='配色已更新；請重新下載 DAE，檔案會包含目前顏色。';
}
window.addEventListener('storage',event=>{
  if(!appearanceProfiles||!modeling.baseScene||!isModelColorStorageEvent(event))return;
  try{updateSceneColors(readModelColors(appearanceProfiles));colorControls?.refresh(modelColors);$('model-color-status').textContent='已同步模型庫的配色。';}catch(error){notify(error.message);}
});
