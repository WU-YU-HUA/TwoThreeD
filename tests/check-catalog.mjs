import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {classifyObjectName,validateObjectCatalog} from '../web/js/contracts/object-catalog.js';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {validateFloorPlanV6,validateReportV6,validateScene3D} from '../web/js/contracts/validators.generated.js';
import {migrateFloorPlanV5ToV6} from '../web/js/contracts/migrations.js';
import {buildSceneObject} from '../web/js/services/preview-service.js';
import {meshIssue} from '../web/js/geometry/model-geometry.js';
import {findCatalogObjects} from '../web/js/extraction/catalog-analysis.js';
import {findTables} from '../web/js/extraction/table-analysis.js';
import {export3D} from '../web/js/services/export-service.js';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const catalog=validateObjectCatalog(await read('web/config/object-catalog.json'));
assert.equal(catalog.types.length,54);
for(const type of catalog.types)for(const alias of type.aliases){
  assert.equal(classifyObjectName('新做 '+alias,catalog).type_id,type.id,alias);
}
for(const [name,height]of [['小衣櫃',900],['矮高櫃',900],['高櫃',2100],['衣櫃',2100],['系統半高櫃',1500],['半高櫃',1500],['茶水櫃',1500],['冰箱櫃',1500]])assert.equal(classifyObjectName(name,catalog).height_mm,height);
assert.equal(classifyObjectName('新作 ＯＡ 辦公傢俱',catalog),null);
assert.equal(classifyObjectName('咖啡廳',catalog),null,'Scene names never spawn equipment');
const rectangle={sourceOperatorIndex:1,names:['家具'],commands:[{op:'move_to',points:[[0,0]]},...[[1800,0],[1800,900],[0,900],[0,0]].map(p=>({op:'line_to',points:[p]}))]},region=[-1,-1,2000,1000];
for(const type of catalog.types){
  const options={catalog,mmPerSourceUnit:1,referenceGap:200,textItems:[{text:type.name,box:[500,200,700,400]}],namedObjectPredicate:text=>!!classifyObjectName(text,catalog)};
  assert.equal(findTables([rectangle],region,options).objects.length,0,'Named objects must not become empty-frame tables: '+type.name);
  const found=findCatalogObjects([rectangle],region,options).objects;assert.equal(found.length,1,type.name);assert.equal(found[0].catalog_type_id,type.id);
}
for(const edit of [c=>c.missing_model_policy.cube_edge_mm=0,c=>c.missing_model_policy.hover_offset_mm=-1,c=>c.types[0].model_id='not_loaded',c=>c.types.push(c.types[0]),c=>c.cabinet_height_groups.general.height_mm=Infinity]){
  const copy=structuredClone(catalog);edit(copy);assert.throws(()=>validateObjectCatalog(copy));
}
const [input,dependencyRoot]=process.argv.slice(2),require=createRequire(path.resolve(dependencyRoot,'package.json')),canvas=require('@napi-rs/canvas');
const canvasOptions={createCanvas:()=>canvas.createCanvas(512,512)};
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData});
const fixture=await read('examples/floorplan2d.v6.sample.json'),snapshot=JSON.stringify(fixture),golden=convert2DTo3D(fixture);
assert(validateFloorPlanV6(fixture),JSON.stringify(validateFloorPlanV6.errors));assert.equal(golden.report.status,'success',JSON.stringify(golden.report));assert(validateReportV6(golden.report));assert(validateScene3D(golden.scene));assert.equal(JSON.stringify(fixture),snapshot);
const cube=golden.scene.nodes.find(n=>n.mesh&&n.semantic.category==='equipment_placeholder');
assert.equal(cube.mesh.faces.length,6);assert.equal(cube.semantic.face_labels.length,6);assert.equal(Math.min(...cube.mesh.vertices_mm.map(p=>p[2])),1600);assert.equal(Math.max(...cube.mesh.vertices_mm.map(p=>p[2])),2000);assert.equal(meshIssue(cube.mesh),null);
for(const face of cube.mesh.faces){
  const [a,b,c]=face.indices.map(i=>cube.mesh.vertices_mm[i]),u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const center=face.indices.reduce((p,i)=>p.map((x,j)=>x+cube.mesh.vertices_mm[i][j]/4),[0,0,0]);assert(normal.reduce((s,x,i)=>s+x*(center[i]-[8000,6000,1800][i]),0)>0,'Every label face points outward');
}
const preview=buildSceneObject(golden.scene,canvasOptions);let renderedCube;preview.traverse(n=>{if(n.userData.nodeId===cube.id)renderedCube=n;});
assert.equal(renderedCube.geometry.groups.length,6);assert.equal(renderedCube.geometry.attributes.uv.count,36);
for(const g of renderedCube.geometry.groups)assert(renderedCube.material[g.materialIndex].map?.isCanvasTexture);
assert.equal(renderedCube.parent.userData.nodeId,cube.parent_id,'All six labels belong to one independently replaceable object');
const rejects=(edit,code)=>{const p=structuredClone(fixture);edit(p,p.levels[0].furniture.find(o=>o.kind==='placeholder'));const r=convert2DTo3D(p);assert.equal(r.scene,null);assert(r.report.diagnostics.some(d=>d.code===code),JSON.stringify(r.report));};
rejects((p,o)=>o.support_id='missing','E_INVALID_FURNITURE');
rejects((p,o)=>o.support_id=o.id,'E_INVALID_FURNITURE');
rejects((p,o)=>o.position_mm=[-5000,-5000],'E_INVALID_FURNITURE');
rejects((p,o)=>o.material_id='missing','E_MATERIAL_MISSING');
rejects((p,o)=>o.cube_edge_mm=0,'E_SCHEMA');
rejects((p,o)=>o.hover_mm=-1,'E_SCHEMA');
rejects((p,o)=>{const host=p.levels[0].furniture.find(f=>f.kind==='table'&&f.holes_mm.length),hole=host.holes_mm[0];o.support_id=host.id;o.position_mm=hole.reduce((v,p)=>v.map((n,i)=>n+p[i]/hole.length),[0,0]);const [x,y]=o.position_mm;o.boundary_mm=[[x-10,y-10],[x+10,y-10],[x+10,y+10],[x-10,y+10]];},'E_INVALID_FURNITURE');
const badLabel=structuredClone(golden.scene);badLabel.nodes.find(n=>n.id===cube.id).semantic.face_labels.pop();assert.throws(()=>buildSceneObject(badLabel,canvasOptions),/六面/);
const floor=structuredClone(fixture);floor.levels[0].base_elevation_mm=700;floor.levels[0].furniture.find(o=>o.kind==='placeholder').support_id=null;
assert.equal(Math.min(...convert2DTo3D(floor).scene.nodes.find(n=>n.id===cube.id).mesh.vertices_mm.map(p=>p[2])),800);
const old=await read('examples/floorplan2d.v5.sample.json');assert.deepEqual(convert2DTo3D(old).scene,convert2DTo3D(migrateFloorPlanV5ToV6(old)).scene);
await fs.writeFile('examples/transfer-report.v6.sample.json',JSON.stringify(golden.report,null,2)+'\n');

const {readFile}=await import('../web/js/services/file-reader-service.js');
const {extractData,extractStructure,buildStructurePlan}=await import('../web/js/services/extraction-service.js');
const source=await readFile(new File([await fs.readFile(input)],path.basename(input)),{pdfOptions:{useSystemFonts:true}});
try{
  const extracted=await extractData(source,{includeGeometry:true,rasterFallback:false});
  const structure=extractStructure(source,extracted,{catalog}),evidenceSnapshot=JSON.stringify(structure),plan=buildStructurePlan(source,structure),planSnapshot=JSON.stringify(plan),result=convert2DTo3D(plan,{mode:'preview'});
  assert(validateFloorPlanV6(plan),JSON.stringify(validateFloorPlanV6.errors));assert.equal(result.report.status,'success',JSON.stringify(result.report));assert(validateReportV6(result.report));
  assert.equal(JSON.stringify(structure),evidenceSnapshot);assert.equal(JSON.stringify(plan),planSnapshot);
  const furniture=plan.levels[0].furniture,cabinets=furniture.filter(o=>o.kind==='cabinet'),markers=furniture.filter(o=>o.kind==='placeholder');
  console.log(JSON.stringify({summary:structure.summary,metrics:result.report.metrics,markers:markers.map(o=>({name:o.label_text,support:o.support_id})),warnings:structure.diagnostics.filter(d=>/OBJECT|SUPPORT/.test(d.code))}));
  assert.equal(cabinets.length,6);assert.equal(markers.length,12);assert.equal(structure.objects.length,69);
  assert.equal(cabinets.find(o=>o.name.includes('小檔案櫃')).height_mm,900);
  assert(cabinets.filter(o=>!o.name.includes('小')).every(o=>o.height_mm===1500));
  const tea=cabinets.find(o=>o.name.includes('茶水櫃'));
  for(const name of ['飲水機','烘碗機']){const o=markers.find(o=>o.label_text===name);assert.equal(o.support_id,tea.id);}
  assert.equal(markers.filter(o=>o.label_text==='印表機'&&o.support_id).length,3);
  assert.equal(furniture.filter(o=>o.kind==='table').length,5);assert.equal(furniture.filter(o=>o.kind==='chair').length,18);
  for(const o of markers){
    const n=result.scene.nodes.find(n=>n.mesh&&n.source_2d_ids.includes(o.id));assert.equal(meshIssue(n.mesh),null);assert.equal(n.semantic.face_labels.length,6);assert(n.semantic.face_labels.every(l=>l.text===o.label_text));
    const support=furniture.find(f=>f.id===o.support_id),z=(support?.height_mm||0)+100;
    assert.equal(Math.min(...n.mesh.vertices_mm.map(p=>p[2])),z);assert.equal(Math.max(...n.mesh.vertices_mm.map(p=>p[2])),z+400);
    assert.equal(result.report.mapping.find(m=>m.source_2d_id===o.id).generated_node_ids.length,2);
  }
  const rendered=buildSceneObject(result.scene,canvasOptions);let meshes=0;rendered.traverse(n=>{if(n.isMesh)meshes++;});assert.equal(meshes,333);assert.equal(result.scene.nodes.length,403);
  assert.equal(export3D(result.scene).diagnostics[0].code,'E_PREVIEW_ONLY');assert.equal(convert2DTo3D(plan).report.status,'failed');
  // Reordering source evidence cannot move or duplicate catalog instances.
  const legacy=extractStructure(source,extracted),options={catalog,textItems:extracted.analysis.textItems,occupied:legacy.objects,fingerprint:source.sha256,pageNumber:1,mmPerSourceUnit:structure.calibration.mm_per_source_unit,referenceGap:200/structure.calibration.mm_per_source_unit};
  const a=findCatalogObjects(extracted.analysis.paths,structure.coordinates.region,options),b=findCatalogObjects([...extracted.analysis.paths].reverse(),structure.coordinates.region,{...options,textItems:[...options.textItems].reverse()});
  assert.deepEqual(a.objects.map(o=>o.id).sort(),b.objects.map(o=>o.id).sort());
  const duplicates=findCatalogObjects([...extracted.analysis.paths,...extracted.analysis.paths],structure.coordinates.region,{...options,textItems:[...options.textItems,...options.textItems]});
  assert.deepEqual(a.objects.map(o=>o.id).sort(),duplicates.objects.map(o=>o.id).sort());
  const first=a.objects[0],cropped=findCatalogObjects(extracted.analysis.paths,[first.bbox[0]+1,first.bbox[1]+1,first.bbox[2]-1,first.bbox[3]-1],options);
  assert(!cropped.objects.some(o=>o.id===first.id),'A clipped source frame must not turn into a whole object');
  assert(!a.diagnostics.some(d=>d.message.includes('電鍋')),'User-excluded rice cookers must not generate review warnings');
  assert(!a.objects.some(o=>o.object_name.includes('電鍋')));
  await fs.mkdir('outputs/structure-preview',{recursive:true});await fs.mkdir('outputs/extraction',{recursive:true});
  for(const [name,value]of [['floorplan2d',plan],['scene3d',result.scene],['transfer-report',result.report]])await fs.writeFile(`outputs/structure-preview/${name}.json`,JSON.stringify(value,null,2)+'\n');
  await fs.writeFile('outputs/extraction/plan2d.structure.json',JSON.stringify(structure,null,2)+'\n');
  console.log('PASS: 54 catalog types, cabinet precedence, v6 migration, semantic failure cases, 69 source objects / 333 meshes / 403 nodes, support elevation, six-face labels, independent groups and export gates.');
}finally{await source.dispose();}
