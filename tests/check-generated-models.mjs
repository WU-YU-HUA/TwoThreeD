import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadModelGeometry} from '../web/js/services/model-geometry-service.js';
import {validateModelAssets,getModelAsset} from '../web/js/services/model-asset-service.js';
import {applyModelSources} from '../web/js/extraction/model-selection.js';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {meshBounds} from '../web/js/geometry/model-fitting.js';
import {serializeDae} from '../web/js/export/dae-exporter.js';
import {zipFiles} from '../web/js/export/zip-artifact.js';
const read=async p=>JSON.parse(await fs.readFile(p)),catalog=await read('web/config/model-assets.json');
validateModelAssets(catalog);
const assets=catalog.assets.filter(a=>a.source_kind==='generated');assert.equal(assets.length,6);
const fetchImpl=async url=>{const b=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const geometry=await loadModelGeometry({levels:[{furniture:assets.map(a=>({kind:'model_object',asset_id:a.id}))}]},catalog,{fetchImpl});
const expected={whiteboard:[1400,650,1930],electronic_whiteboard:[1300,850,1760],dish_dryer:[600,489.5,580],cup_sealer:[320,417,580],tea_brewer:[430,446,626],water_dispenser_countertop:[332,350,530]};
const pack=[];await fs.mkdir('outputs/generated-models',{recursive:true});
for(const asset of assets){
  const model=geometry[asset.id],key=asset.id.split('.').at(-1),bounds=meshBounds(model.nodes.map(n=>n.mesh));
  expected[key].forEach((n,i)=>assert(Math.abs(bounds.size[i]-n)<.01,`${key}: ${bounds.size} != ${expected[key]}`));
  assert.equal(model.extensions.model_asset.removed_zero_area_triangles,0);
  assert.equal(model.nodes.length,asset.mesh_count);
  for(const node of model.nodes){
    const edges=new Map(),vertexKey=i=>node.mesh.vertices_mm[i].map(v=>Math.round(v*10000)).join(',');
    for(const face of node.mesh.faces)for(let i=0;i<3;i++){
      const a=vertexKey(face.indices[i]),b=vertexKey(face.indices[(i+1)%3]),id=a<b?a+'|'+b:b+'|'+a;
      const edge=edges.get(id)||{count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(id,edge);
    }
    assert([...edges.values()].every(e=>e.count===2&&e.direction===0),`${key}: part is not a closed oriented surface`);
    const volume=node.mesh.faces.reduce((sum,f)=>{const [a,b,c]=f.indices.map(i=>node.mesh.vertices_mm[i]);return sum+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;},0);
    assert(volume>0,`${key}/${node.name}: inward or zero-volume part`);
  }
  const group={id:'model',name:asset.name,kind:'group',parent_id:null,source_2d_ids:[asset.id],mesh:null,semantic:{category:'equipment'},editable:true};
  const scene={...model,nodes:[group,...model.nodes.map(n=>({...n,parent_id:group.id}))],extensions:{twothreeD:{preview_only:true,model_sources:[model.extensions.model_asset]}}};
  const dae=serializeDae(scene,{draft:true,createdAt:'2026-11-15T00:00:00Z'});assert.equal(dae.summary.object_groups,1);assert.equal(dae.summary.triangles,asset.inspection.triangles);
  pack.push({path:`glb/${key}.glb`,content:new Uint8Array(await fs.readFile('web/'+asset.local_uri))},{path:`dae/${key}.dae`,content:dae.document});
  await fs.writeFile(`outputs/generated-models/${key}.dae`,dae.document);
}
// Selection uses detected support, not just a room label or screen position.
const seed=await read('examples/floorplan2d.v6.sample.json'),marker=seed.levels[0].furniture.find(o=>o.kind==='placeholder');
marker.catalog_type_id='water_dispenser';marker.name=marker.label_text='飲水機';
const countertopId='twothreeD.generated.water_dispenser_countertop',floorId=getModelAsset(catalog,'water_dispenser').asset.id;
assert.equal(getModelAsset(catalog,'water_dispenser',{placement:'on_support'}).asset.id,countertopId);
const find=p=>p.levels[0].furniture.find(o=>o.id===marker.id);
assert(marker.support_id);const supported=applyModelSources(seed,catalog);assert.equal(find(supported).asset_id,countertopId);assert.equal(find(supported).extensions.placement_variant,'on_support');
for(const supportKind of ['cabinet','table']){
  const raw=structuredClone(seed),sourceObject=find(raw),host=raw.levels[0].furniture.find(o=>o.id===sourceObject.support_id);
  if(supportKind==='table'){
    const template=structuredClone(seed.levels[0].furniture.find(o=>o.kind==='table'));
    Object.assign(template,{id:host.id,boundary_mm:sourceObject.boundary_mm.map(([x,y])=>[sourceObject.position_mm[0]+(x-sourceObject.position_mm[0])*3,sourceObject.position_mm[1]+(y-sourceObject.position_mm[1])*3]),holes_mm:[],height_mm:900});
    raw.levels[0].furniture[raw.levels[0].furniture.indexOf(host)]=template;
  }
  const p=applyModelSources(raw,catalog),object=find(p);assert.equal(object.asset_id,countertopId);
  const modelScenes=await loadModelGeometry(p,catalog,{fetchImpl}),converted=convert2DTo3D(p,{mode:'preview'},modelScenes);
  assert(converted.scene,JSON.stringify(converted.report.diagnostics));
  const parts=converted.scene.nodes.filter(n=>n.mesh&&n.source_2d_ids.includes(object.id));
  assert.equal(meshBounds(parts.map(n=>n.mesh)).min[2],p.levels[0].base_elevation_mm+p.levels[0].furniture.find(o=>o.id===object.support_id).height_mm);
}
const floor=structuredClone(seed);find(floor).support_id=null;
const floorPlan=applyModelSources(floor,catalog);assert.equal(find(floorPlan).asset_id,floorId);assert.equal(find(floorPlan).extensions.placement_variant,'floor');
const floorGeometry=await loadModelGeometry(floorPlan,catalog,{fetchImpl}),floorResult=convert2DTo3D(floorPlan,{mode:'preview'},floorGeometry);assert(floorResult.scene);
assert.equal(meshBounds(floorResult.scene.nodes.filter(n=>n.mesh&&n.source_2d_ids.includes(marker.id)).map(n=>n.mesh)).min[2],floorPlan.levels[0].base_elevation_mm);
const invalid=structuredClone(supported);find(invalid).support_id='missing';
assert.equal(convert2DTo3D(invalid,{mode:'preview'},await loadModelGeometry(invalid,catalog,{fetchImpl})).scene,null,'Bad support must not fall back to floor');
for(const type of ['dish_dryer','cup_sealer','tea_brewer']){
  const p=structuredClone(seed);find(p).catalog_type_id=type;const selected=applyModelSources(p,catalog);assert.equal(find(selected).asset_id,'twothreeD.generated.'+type);
  const result=convert2DTo3D(selected,{mode:'preview'},await loadModelGeometry(selected,catalog,{fetchImpl}));assert(result.scene,JSON.stringify(result.report.diagnostics));
}
for(const edit of [c=>c.types.find(t=>t.type_id==='water_dispenser').placement_variants.on_support='missing',c=>c.assets.find(a=>a.source_kind==='generated').source_url='../../outside',c=>c.assets.find(a=>a.source_kind==='generated').status='downloaded']){const c=structuredClone(catalog);edit(c);assert.throws(()=>validateModelAssets(c));}
pack.push({path:'SOURCES.txt',content:await fs.readFile('web/assets/models/generated/SOURCES.txt','utf8')},{path:'generate-model-assets.mjs',content:await fs.readFile('scripts/generate-model-assets.mjs','utf8')},{path:'README.txt',content:'twothreeD 原創設備模型\n\nglb/：Three.js 等支援 GLB 的工具使用。\ndae/：SketchUp 桌面版匯入，每款有一個頂層物件群組。\n模型已含純色材質，烘碗機含透明門，沒有外部貼圖。\n這些為通用外觀，不是製造尺寸；一般設備依圖框等比配置；兩款支架白板依明確 W/D/H 標示配置。\n生成腳本需放回本專案 scripts/ 執行，使用專案附帶的 Three.js。\n原創模型 CC0-1.0；來源及生成方式見 SOURCES.txt。\n尚未在 SketchUp 實機驗收。\n'});
await fs.writeFile('outputs/generated-models/twothreeD-original-appliances.zip',zipFiles(pack));
console.log('PASS: 6 original GLBs, known bounds, outward closed parts, no degenerate triangles, standalone DAE groups; dispenser table/cabinet/floor selection and elevation; invalid support rejection; all 3 gaps integrated.');
