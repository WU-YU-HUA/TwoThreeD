import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {findFurniture} from '../web/js/extraction/furniture-analysis.js';
import {buildFurnitureParts} from '../web/js/geometry/furniture-templates.js';
import {meshIssue} from '../web/js/geometry/model-geometry.js';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {buildSceneObject} from '../web/js/services/preview-service.js';
import {export3D} from '../web/js/services/export-service.js';
const fixture=JSON.parse(await fs.readFile('tests/fixtures/office-chair-symbol.json'));
const opts={mmPerSourceUnit:20,referenceGap:10},region=[-1000,-1000,1000,1000];
const chairs=paths=>findFurniture(paths,region,opts).objects.filter(o=>o.kind==='chair');
const before=JSON.stringify(fixture),found=chairs(fixture.paths);
assert.equal(found.length,1);assert.equal(found[0].evidence.template_id,'builtin.office_chair.v1');
assert.equal(found[0].rotation_deg,fixture.expected.rotation_deg);
assert(Math.abs(found[0].width-fixture.expected.width_source)<1e-6);
assert(Math.abs(found[0].depth-fixture.expected.depth_source)<1e-6);
assert.deepEqual(chairs([...fixture.paths,...fixture.paths].reverse()),found);
assert.equal(JSON.stringify(fixture),before);
const transform=(angle,scale=1)=>fixture.paths.map(p=>({...p,commands:p.commands.map(cmd=>({...cmd,points:cmd.points.map(([x,y])=>[scale*(Math.cos(angle)*x-Math.sin(angle)*y)+100,scale*(Math.sin(angle)*x+Math.cos(angle)*y)-50])}))}));
for(const degrees of [30,90,180,270]){
 const result=chairs(transform(degrees*Math.PI/180));assert.equal(result.length,1);
 const angle=result[0].rotation_deg*Math.PI/180;
 assert(Math.abs(-Math.sin(angle)+Math.cos(degrees*Math.PI/180))<1e-6);
 assert(Math.abs(Math.cos(angle)+Math.sin(degrees*Math.PI/180))<1e-6);
}
assert.equal(chairs(transform(0,.1)).length,0,'Tiny symbols must fail chair dimensions');
const arms=fixture.paths.filter(p=>p.commands.filter(c=>c.op==='line_to').length===5);
assert.equal(arms.length,2);
assert.equal(chairs(fixture.paths.filter(p=>p!==arms[0])).length,0,'A single armrest is insufficient');
const open=structuredClone(fixture.paths);open.find(p=>p.sourceOperatorIndex===arms[0].sourceOperatorIndex).commands.pop();
assert.equal(chairs(open).length,0,'An open armrest must fail');
const asymmetric=structuredClone(fixture.paths);asymmetric.find(p=>p.sourceOperatorIndex===arms[0].sourceOperatorIndex).commands.forEach(c=>c.points.forEach(p=>p[0]+=15));
assert.equal(chairs(asymmetric).length,0,'Unaligned unrelated boxes must fail');
assert.equal(chairs(fixture.paths.filter(p=>!p.commands.some(c=>c.op==='cubic_bezier_to'))).length,0);
assert.equal(chairs([...fixture.paths,{sourceOperatorIndex:99,names:['活動家具'],commands:[{op:'move_to',points:[[0,10]]},{op:'line_to',points:[[20,25]]}]}]).length,0,'Extra attached lines must not pass');
assert.equal(findFurniture(fixture.paths,[5,5,30,30],opts).objects.length,0);

const plan=JSON.parse(await fs.readFile('examples/floorplan2d.v4.sample.json'));
plan.levels[0].furniture=plan.levels[0].furniture.filter(o=>o.kind==='chair');
const chair=plan.levels[0].furniture[0];Object.assign(chair,{name:'扶手辦公椅',template_id:'builtin.office_chair.v1',width_mm:650,depth_mm:650,rotation_deg:30,position_mm:[500,800],seat_height_mm:450,height_mm:850});
plan.levels[0].base_elevation_mm=700;
const parts=buildFurnitureParts(chair,700);assert.equal(parts.length,24);
for(const part of parts)assert.equal(meshIssue(part.mesh),null,part.id);
const points=parts.flatMap(p=>p.mesh.vertices_mm),a=chair.rotation_deg*Math.PI/180;
for(const [x,y,z]of points){
 const dx=x-chair.position_mm[0],dy=y-chair.position_mm[1];
 assert(Math.abs(Math.cos(a)*dx+Math.sin(a)*dy)<=325+1e-6);
 assert(Math.abs(-Math.sin(a)*dx+Math.cos(a)*dy)<=325+1e-6);
 assert(z>=700-1e-6&&z<=1550+1e-6);
}
const zTop=id=>Math.max(...parts.find(p=>p.id===id).mesh.vertices_mm.map(p=>p[2]));
assert.equal(zTop('seat'),1150);assert.equal(zTop('back'),1550);
assert.equal(zTop('armrest_left'),1350);assert.equal(zTop('armrest_right'),1350);
assert.equal(parts.filter(p=>p.id.startsWith('caster_')&&!p.id.includes('stem')).length,5);
const result=convert2DTo3D(plan);assert.equal(result.report.status,'success',JSON.stringify(result.report.diagnostics));
assert.equal(result.report.mapping.find(m=>m.source_2d_id===chair.id).generated_node_ids.length,25);
const rendered=buildSceneObject(result.scene);assert(rendered.getObjectByProperty('name',chair.name));
const dae=export3D(result.scene,{container:'dae',createdAt:'2026-11-17T00:00:00Z'});assert(dae.success,JSON.stringify(dae));
assert(new TextDecoder().decode(dae.artifact.content).includes('armrest_left'));
await fs.mkdir('.local/office-chair',{recursive:true});
// Isolated display fixture for visual QA: same template, origin, no unrelated objects.
const solo=structuredClone(plan);Object.assign(solo.levels[0],{walls:[],columns:[],doors:[],slabs:[],rooms:[],openings:[],base_elevation_mm:0});
Object.assign(solo.levels[0].furniture[0],{position_mm:[0,0],rotation_deg:0});
const soloScene=convert2DTo3D(solo).scene,soloDae=export3D(soloScene,{container:'dae',createdAt:'2026-11-17T00:00:00Z'});
assert(soloDae.success,JSON.stringify(soloDae));
await fs.writeFile('.local/office-chair/office-chair.dae',soloDae.artifact.content);
await fs.writeFile('.local/office-chair/scene.json',JSON.stringify(soloScene));
console.log('PASS: armrest symbol rotations/dedup, damaged/ambiguous/tiny/cropped exclusions; 24 closed model parts, 450/850 mm heights, 650 mm armrests, 5 casters, source mapping, Three.js and DAE.');

const [pdf,dependencyRoot]=process.argv.slice(2);
if(pdf){
 const require=createRequire(path.resolve(dependencyRoot,'package.json')),canvas=require('@napi-rs/canvas');
 Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData});
 const {readFile}=await import('../web/js/services/file-reader-service.js');
 const {extractData,prepareWallCandidates,extractStructure,buildStructurePlan}=await import('../web/js/services/extraction-service.js');
 const {loadModelGeometry}=await import('../web/js/services/model-geometry-service.js');
 const source=await readFile(new File([await fs.readFile(pdf)],path.basename(pdf)));
 try{
  const extracted=await extractData(source,{includeGeometry:true}),candidates=prepareWallCandidates(source,extracted);
  const catalog=JSON.parse(await fs.readFile('web/config/object-catalog.json')),models=JSON.parse(await fs.readFile('web/config/model-assets.json'));
  const structure=extractStructure(source,extracted,{wallCandidates:candidates,catalog});
  assert.equal(structure.summary.chairs,17);assert.equal(structure.summary.tables,9,'Table fixes are explicitly outside this change');
  const offices=structure.objects.filter(o=>o.evidence.template_id==='builtin.office_chair.v1');assert.equal(offices.length,3);assert(offices.every(o=>Math.abs(o.rotation_deg-90)<1e-6));
  const actual=buildStructurePlan(source,structure,{modelCatalog:models});
  assert.equal(actual.levels[0].furniture.filter(o=>o.template_id==='builtin.chair.v1').length,14);
  const fetchImpl=async url=>{const bytes=await fs.readFile(url);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
  const assets=await loadModelGeometry(actual,models,{fetchImpl}),converted=convert2DTo3D(actual,{mode:'preview'},assets);
  assert.equal(converted.report.status,'success',JSON.stringify(converted.report.diagnostics));
  assert.equal(converted.report.metrics.chairs,17);buildSceneObject(converted.scene);
  const exported=export3D(converted.scene,{mode:'draft',container:'dae'});assert(exported.success,JSON.stringify(exported));
  await fs.writeFile('.local/office-chair/actual.dae',exported.artifact.content);
  console.log('PASS: new PDF → 14 legacy chairs + 3 armrest chairs facing the desks → full Scene3D and standalone DAE; tables unchanged (9, including known tiny-symbol false positives).');
 }finally{await source.dispose();}
}
