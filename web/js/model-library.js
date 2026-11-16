// Asset review page orchestration; rendering remains in Preview Service.
import {loadModelAssets} from './services/model-asset-service.js';
import {loadModelGeometry} from './services/model-geometry-service.js';
import {createScenePreview} from './services/preview-service.js';
import {export3D} from './services/export-service.js';
import {loadAppearanceProfiles,readModelColors,saveModelColors,applyModelColors,isModelColorStorageEvent} from './services/model-appearance-service.js';
import {mountModelColorControls} from './model-color-controls.js';
const container=document.getElementById('models'),previews=[];
try{
  const catalog=await loadModelAssets();
  const profiles=await loadAppearanceProfiles(),records=[];let modelColors=readModelColors(profiles);
  const renderRecord=(record,preserveView=false)=>{
    record.currentScene=applyModelColors(record.baseScene,profiles,modelColors);
    const display=structuredClone(record.currentScene);for(const n of display.nodes)if(n.mesh)n.mesh.vertices_mm=n.mesh.vertices_mm.map(([x,y,z])=>[-x,-y,z]);
    record.preview.show(display,{preserveView});record.controls?.refresh(modelColors);
  };
  const changeColor=(id,hex)=>{
    const next={...readModelColors(profiles),...modelColors};if(hex===null)delete next[id];else next[id]=hex;
    modelColors=next;const saved=saveModelColors(next);for(const record of records)renderRecord(record,true);
    return {warning:saved?null:'已套用；瀏覽器無法儲存配色，下次開啟需重新設定。'};
  };
  const floorId=catalog.types.find(t=>t.type_id==='water_dispenser').asset_id;
  const assets=[...catalog.assets.filter(a=>a.source_kind==='generated'),catalog.assets.find(a=>a.id===floorId)];
  for(const asset of assets){
    const card=document.createElement('article'),view=document.createElement('div'),details=document.createElement('div');
    view.className='preview';details.className='details';
    const title=document.createElement('h2');title.textContent=asset.source_kind==='generated'?asset.name:'落地飲水機（既有模型）';
    const description=document.createElement('p');description.textContent=asset.generation?.description||'沒有桌／櫃承載時使用此款，含上方水桶。';
    const status=document.createElement('p');status.className='status';status.textContent='載入模型中…';
    const actions=document.createElement('div');actions.className='actions';
    const glb=document.createElement('a');glb.textContent='下載原始 GLB';glb.href=asset.local_uri;glb.download='';actions.append(glb);
    details.append(title,description,status,actions);card.append(view,details);container.append(card);
    try{
      const modelScenes=await loadModelGeometry({levels:[{furniture:[{kind:'model_object',asset_id:asset.id}]}]},catalog);
      const source=modelScenes[asset.id],groupId='asset_group';
      const scene={...source,nodes:[{id:groupId,name:title.textContent,kind:'group',parent_id:null,source_2d_ids:[asset.id],mesh:null,semantic:{category:'equipment'},editable:true},...source.nodes.map(n=>({...n,parent_id:groupId}))],extensions:{...source.extensions,twothreeD:{preview_only:true,source_filename:asset.name,model_sources:[source.extensions.model_asset]}}};
      // Display the front in the shared preview's default camera; export untouched coordinates.
      const preview=createScenePreview(view,message=>{status.textContent=message;}),record={baseScene:scene,preview,currentScene:null,controls:null};
      records.push(record);renderRecord(record);previews.push(preview);
      const profile=profiles.find(p=>p.asset_id===asset.id);
      if(profile){const controls=document.createElement('div');details.append(controls);record.controls=mountModelColorControls(controls,{profiles:[profile],colors:modelColors,onChange:changeColor});}
      status.textContent=`${source.nodes.length} 個零件 · ${source.nodes.reduce((sum,n)=>sum+n.mesh.faces.length,0).toLocaleString()} 個三角面 · ${asset.source_kind==='generated'?'原創 CC0':'外部 CC0'}`;
      const dae=document.createElement('a');dae.href='#';dae.textContent='下載 DAE';actions.append(dae);
      dae.addEventListener('click',event=>{
        event.preventDefault();
        const result=export3D(record.currentScene,{mode:'draft',container:'dae',filename:asset.name});
        if(!result.success){status.textContent=result.diagnostics[0].message;return;}
        const url=URL.createObjectURL(new Blob([result.artifact.content],{type:result.artifact.mimeType})),link=document.createElement('a');link.href=url;link.download=result.artifact.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
    }catch(error){status.textContent='模型無法載入：'+error.message;}
  }
  window.addEventListener('storage',event=>{if(isModelColorStorageEvent(event)){modelColors=readModelColors(profiles);for(const record of records)renderRecord(record,true);}});
}catch(error){container.textContent='無法讀取模型表：'+error.message;}
window.addEventListener('pagehide',()=>previews.forEach(p=>p.dispose()),{once:true});
