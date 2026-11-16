import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {applyModelSources} from '../web/js/extraction/model-selection.js';
import {decodeModelGLB,loadModelGeometry} from '../web/js/services/model-geometry-service.js';
import {fitModel,meshBounds,validateModelScene,surfaceIssue} from '../web/js/geometry/model-fitting.js';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {migrateFloorPlanV6ToV7} from '../web/js/contracts/migrations.js';
import {validateFloorPlanV7,validateScene3D,validateReportV7} from '../web/js/contracts/validators.generated.js';
import {buildSceneObject} from '../web/js/services/preview-service.js';

const read=async p=>JSON.parse(await fs.readFile(p)),catalog=await read('web/config/model-assets.json');
const fetchImpl=async url=>{const b=await fs.readFile(url);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const close=(a,b,epsilon=1e-5)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
// Independent known dimensions check: rotation and elevation cannot hide in a
// comparison between two calls to the same fitting implementation.
const knownVertices=[[-100,-50,0],[100,-50,0],[100,50,0],[-100,50,0],[-100,-50,300],[100,-50,300],[100,50,300],[-100,50,300]];
const knownFaces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].flatMap(([a,b,c,d])=>[[a,b,c],[a,c,d]]).map(indices=>({indices,material_id:'known_color'}));
const knownScene={schema:'Scene3D',schema_version:'1.0.0',units:'mm',materials:[{id:'known_color',name:'Known',color_rgba:[.5,.5,.5,1]}],nodes:[{id:'box',name:'Box',kind:'mesh',parent_id:null,source_2d_ids:['known'],mesh:{vertices_mm:knownVertices,faces:knownFaces},semantic:{},editable:true}],extensions:{model_asset:{id:'known'}}};
const knownObject={id:'object',role:'equipment',asset_id:'known',fit_mode:'uniform_footprint',position_mm:[5000,3000],rotation_deg:90,width_mm:600,depth_mm:400,height_mm:null,boundary_mm:[[4800,2700],[5200,2700],[5200,3300],[4800,3300]],holes_mm:[],support_id:null};
const knownFit=fitModel(knownObject,{base_elevation_mm:700,furniture:[]},knownScene),knownBounds=meshBounds(knownFit.parts.map(p=>p.mesh));
assert.deepEqual(knownFit.scale,[3,3,3]);[4850,2700,700].forEach((v,i)=>close(knownBounds.min[i],v));[5150,3300,1600].forEach((v,i)=>close(knownBounds.max[i],v));
assert.throws(()=>fitModel({...knownObject,width_mm:700},{base_elevation_mm:0,furniture:[]},knownScene),/外框/);
let decoded=0;
for(const asset of catalog.assets.filter(a=>a.scene_integration==='preview_candidate')){
  const scene=decodeModelGLB(await fs.readFile('web/'+asset.local_uri),asset),bounds=validateModelScene(scene,asset.id);
  [asset.inspection.dimensions_mm.width,asset.inspection.dimensions_mm.depth,asset.inspection.dimensions_mm.height].forEach((v,i)=>close(bounds.size[i],v,.01));
  assert(scene.nodes.every(n=>surfaceIssue(n.mesh)===null));decoded++;
}
assert.equal(decoded,41);
for(const asset of catalog.assets.filter(a=>a.embedded_image_count)){const bytes=await fs.readFile('web/'+asset.local_uri);assert.throws(()=>decodeModelGLB(bytes,asset));}

const legacy=await read('examples/floorplan2d.v6.sample.json');
assert.deepEqual(convert2DTo3D(legacy).scene,convert2DTo3D(migrateFloorPlanV6ToV7(legacy)).scene,'Migration alone never changes geometry');
const seed=structuredClone(legacy),marker=seed.levels[0].furniture.find(o=>o.kind==='placeholder');
marker.catalog_type_id='printer';marker.name=marker.label_text='印表機';
const before=JSON.stringify(seed),plan=applyModelSources(seed,catalog);assert.equal(JSON.stringify(seed),before);
assert(validateFloorPlanV7(plan),JSON.stringify(validateFloorPlanV7.errors));
const geometry=await loadModelGeometry(plan,catalog,{fetchImpl}),snapshot=JSON.stringify({plan,geometry});
const result=convert2DTo3D(plan,{mode:'preview'},geometry);assert.equal(result.report.status,'success',JSON.stringify(result.report.diagnostics));assert(validateScene3D(result.scene));assert(validateReportV7(result.report));assert.equal(JSON.stringify({plan,geometry}),snapshot);
const equipment=plan.levels[0].furniture.find(o=>o.kind==='model_object'&&o.role==='equipment'),built=fitModel(equipment,plan.levels[0],geometry[equipment.asset_id]);
close(built.scale[0],built.scale[1]);close(built.scale[1],built.scale[2]);assert(built.dimensions_mm[0]<=equipment.width_mm+.001&&built.dimensions_mm[1]<=equipment.depth_mm+.001);
close(Math.max(built.dimensions_mm[0]/equipment.width_mm,built.dimensions_mm[1]/equipment.depth_mm),1); // no 0.9 factor
const host=plan.levels[0].furniture.find(o=>o.id===equipment.support_id);close(meshBounds(built.parts.map(p=>p.mesh)).min[2],plan.levels[0].base_elevation_mm+host.height_mm);
for(const o of plan.levels[0].furniture.filter(o=>o.kind==='model_object'&&o.role!=='equipment')){
  const fitted=fitModel(o,plan.levels[0],geometry[o.asset_id]);[o.width_mm,o.depth_mm,o.height_mm].forEach((v,i)=>close(fitted.dimensions_mm[i],v));
}
const moved=structuredClone(plan);moved.levels[0].base_elevation_mm+=700;
close(fitModel(moved.levels[0].furniture.find(o=>o.id===equipment.id),moved.levels[0],geometry[equipment.asset_id]).bottom_mm,built.bottom_mm+700);
const floor=structuredClone(equipment);floor.support_id=null;close(fitModel(floor,plan.levels[0],geometry[floor.asset_id]).bottom_mm,plan.levels[0].base_elevation_mm);
for(const edit of [o=>o.width_mm=0,o=>o.depth_mm=NaN,o=>o.height_mm=200,o=>o.support_id='missing',o=>o.support_id=o.id,o=>o.position_mm=[-100000,-100000],o=>o.asset_id='unloaded']){
  const p=structuredClone(plan);edit(p.levels[0].furniture.find(o=>o.id===equipment.id));assert.equal(convert2DTo3D(p,{mode:'preview'},geometry).scene,null);
}
assert.equal(convert2DTo3D(plan,{mode:'strict'},geometry).scene,null);
assert.equal(convert2DTo3D(plan,{mode:'preview'},{}).scene,null);
await assert.rejects(loadModelGeometry(plan,catalog,{fetchImpl:async()=>({ok:false})}));
await assert.rejects(loadModelGeometry(plan,catalog,{fetchImpl:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(24)})}));
await fs.writeFile('examples/floorplan2d.v7.sample.json',JSON.stringify(plan,null,2)+'\n');
await fs.writeFile('examples/transfer-report.v7.sample.json',JSON.stringify(result.report,null,2)+'\n');

// Actual source → extraction → model selection → transfer → renderer, not saved IR.
const [input,dependencyRoot]=process.argv.slice(2),require=createRequire(path.resolve(dependencyRoot,'package.json')),canvas=require('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData});
const {readFile}=await import('../web/js/services/file-reader-service.js');
const {extractData,prepareWallCandidates,extractStructure,buildStructurePlan}=await import('../web/js/services/extraction-service.js');
const file=new File([await fs.readFile(input)],path.basename(input),{type:'application/pdf'}),source=await readFile(file);
try{
  const extracted=await extractData(source,{includeGeometry:true}),candidates=await prepareWallCandidates(source,extracted),objects=await read('web/config/object-catalog.json');
  const structure=extractStructure(source,extracted,{wallCandidates:candidates,catalog:objects}),actual=buildStructurePlan(source,structure,{modelCatalog:catalog});
  const assets=await loadModelGeometry(actual,catalog,{fetchImpl}),output=convert2DTo3D(actual,{mode:'preview'},assets);
  assert.equal(output.report.status,'success',JSON.stringify(output.report));assert.equal(output.report.metrics.asset_models,28);assert.equal(output.report.metrics.placeholders,2);assert.equal(output.report.metrics.cabinets,6);assert.equal(output.report.metrics.tall_cabinets,12);
  assert.equal(actual.levels[0].furniture.filter(o=>o.kind==='model_object'&&o.role==='equipment').length,10);
  const rendered=buildSceneObject(output.scene,{createCanvas:()=>canvas.createCanvas(512,512)});let meshCount=0;
  rendered.traverse(o=>{if(o.isMesh){meshCount++;if(o.userData.nodeId?.includes('part_'))assert(o.geometry.groups.length<=2,'Imported monochrome primitive uses batched draw calls');}});
  assert.equal(meshCount,output.scene.nodes.filter(n=>n.mesh).length);
  const dimensions=[];
  for(const object of actual.levels[0].furniture.filter(o=>o.kind==='model_object')){
    const group=output.scene.nodes.find(n=>n.id==='furniture_'+object.id),parts=output.scene.nodes.filter(n=>n.parent_id===group.id&&n.mesh);
    assert(parts.length>0);assert(output.report.mapping.find(m=>m.source_2d_id===object.id).generated_node_ids.includes(group.id));assert(parts.every(n=>n.source_2d_ids.includes(object.id)));
    const fit=fitModel(object,actual.levels[0],assets[object.asset_id]);close(meshBounds(parts.map(n=>n.mesh)).min[2],fit.bottom_mm);
    dimensions.push({id:object.id,name:object.name,role:object.role,frame_width_mm:object.width_mm,frame_depth_mm:object.depth_mm,model_dimensions_mm:fit.dimensions_mm,bottom_mm:fit.bottom_mm,support_id:object.support_id});
  }
  assert(output.report.diagnostics.some(d=>d.code==='W_MODEL_SUPPORT_OVERHANG'));
  const dispenser=actual.levels[0].furniture.find(o=>o.name==='飲水機');
  assert.equal(dispenser.asset_id,'twothreeD.generated.water_dispenser_countertop');assert(dispenser.support_id,'Use the countertop variant on the measured cabinet');
  assert(actual.levels[0].furniture.some(o=>o.name==='烘碗機'&&o.asset_id==='twothreeD.generated.dish_dryer'&&o.support_id));
  await fs.mkdir('outputs/asset-preview',{recursive:true});
  for(const [name,data]of Object.entries({floorplan2d:actual,scene3d:output.scene,'transfer-report':output.report,dimensions}))await fs.writeFile('outputs/asset-preview/'+name+'.json',JSON.stringify(data,null,2)+'\n');
  console.log('PASS: 41 decoded assets; v7 migration; uniform fit / cabinet dimensions / support and floor heights; invalid inputs and integrity failures; actual PDF → 28 models, 2 placeholders, '+meshCount+' meshes / '+output.scene.nodes.length+' nodes.');
}finally{await source.dispose();}
