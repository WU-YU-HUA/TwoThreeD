import {buildFurnitureParts} from '../web/js/geometry/furniture-templates.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {validateFloorPlanV2,validateFloorPlanV5,validateScene3D,validateReportV2,validateReportV5} from '../web/js/contracts/validators.generated.js';
import {migrateFloorPlanV1ToV2} from '../web/js/contracts/migrations.js';
import {meshIssue,area} from '../web/js/geometry/model-geometry.js';

const plan=JSON.parse(await fs.readFile('examples/floorplan2d.v2.sample.json'));
const expected=JSON.parse(await fs.readFile('examples/structure-transfer.expected.json'));
const volume=mesh=>mesh.faces.reduce((sum,face)=>{const a=mesh.vertices_mm[face.indices[0]];for(let i=1;i<face.indices.length-1;i++){const b=mesh.vertices_mm[face.indices[i]],c=mesh.vertices_mm[face.indices[i+1]];sum+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return sum;},0);
const snapshot=JSON.stringify(plan),result=convert2DTo3D(plan);
assert.equal(result.report.status,'success',JSON.stringify(result.report));assert(validateFloorPlanV2(plan));assert(validateScene3D(result.scene));assert(validateReportV2(result.report));
assert.equal(result.report.metrics.walls,expected.walls);assert.equal(result.report.metrics.columns,expected.columns);
assert.equal(JSON.stringify(plan),snapshot);assert.deepEqual(convert2DTo3D(plan),result);
const meshes=result.scene.nodes.filter(n=>n.mesh);assert.equal(meshes.length,expected.mesh_count);assert.equal(result.scene.nodes.length-meshes.length,expected.group_count);
for(const mesh of meshes){assert.equal(meshIssue(mesh.mesh),null);assert(Math.abs(volume(mesh.mesh)-expected.volume_mm3[mesh.source_2d_ids[0]])<1);}
const L=meshes.find(m=>m.source_2d_ids[0]==='wall_L');
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
for(const f of L.mesh.faces.filter(f=>f.indices.every(i=>L.mesh.vertices_mm[i][2]===2500))){
  const p=f.indices.map(i=>L.mesh.vertices_mm[i]),signs=p.map((a,i)=>cross(a,p[(i+1)%p.length],[1000,1500]));
  assert(!(signs.every(s=>s>=0)||signs.every(s=>s<=0)),'L-shaped void must not be filled by a roof triangle');
}
for(const sourceId of Object.keys(expected.volume_mm3)){const mapping=result.report.mapping.find(m=>m.source_2d_id===sourceId);assert.equal(mapping.generated_node_ids.length,2);}
const rejects=(edit,code)=>{const copy=structuredClone(plan);edit(copy);const result=convert2DTo3D(copy);assert.equal(result.scene,null);assert(result.report.diagnostics.some(d=>d.code===code),JSON.stringify(result.report));};
rejects(p=>p.levels[0].columns[0].confirmed=false,'E_UNCONFIRMED_ELEMENT');
rejects(p=>p.levels[0].columns[0].height_mm=0,'E_SCHEMA');
rejects(p=>p.levels[0].columns[0].material_id='missing','E_MATERIAL_MISSING');
rejects(p=>p.levels[0].columns[0].id=p.levels[0].walls[0].id,'E_DUPLICATE_ID');
rejects(p=>p.levels[0].columns[0].boundary_mm=[[0,0],[100,100],[0,100],[100,0]],'E_INVALID_POLYGON');
rejects(p=>p.levels[0].walls[0].holes_mm=[[[0,0],[0,100],[100,100],[100,0]]],'E_INVALID_POLYGON');
rejects(p=>p.levels[0].openings.push({id:'opening',kind:'door',wall_id:'wall_L',offset_from_start_mm:0,width_mm:100,height_mm:2100,sill_height_mm:0,confirmed:true,confidence:1,source_refs:[]}),'E_OPENING_WALL_REPRESENTATION');
const elevated=structuredClone(plan);elevated.levels[0].base_elevation_mm=700;elevated.source.source_to_model_3x3=[20,0,100,0,20,100,0,0,1];
const raised=convert2DTo3D(elevated);assert.equal(raised.report.status,'success');const vertices=raised.scene.nodes.filter(n=>n.mesh).flatMap(n=>n.mesh.vertices_mm);
assert.equal(Math.min(...vertices.map(v=>v[2])),700);assert.equal(Math.max(...vertices.map(v=>v[2])),3200);assert.equal(Math.max(...vertices.map(v=>v[0])),4500,'No double application of source transform');
const withHole=structuredClone(plan);withHole.levels[0].columns[0].holes_mm=[[[4100,1100],[4100,1200],[4200,1200],[4200,1100]]];
const holeScene=convert2DTo3D(withHole);assert.equal(holeScene.report.status,'success');assert(Math.abs(volume(holeScene.scene.nodes.find(n=>n.mesh&&n.semantic.category==='column_solid').mesh)-725000000)<1);
const old=JSON.parse(await fs.readFile('examples/floorplan2d.sample.json')),oldSnapshot=JSON.stringify(old),upgraded=migrateFloorPlanV1ToV2(old);
assert.equal(JSON.stringify(old),oldSnapshot);assert.deepEqual(convert2DTo3D(old).scene,convert2DTo3D(upgraded).scene,'V1 migration preserves exact Scene3D');
await fs.writeFile('examples/transfer-report.v2.sample.json',JSON.stringify(result.report,null,2)+'\n');

const [input,dependencyRoot]=process.argv.slice(2),require=createRequire(path.resolve(dependencyRoot,'package.json')),canvas=require('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData,DxfParser:createRequire(import.meta.url)('../web/vendor/dxf-parser/dist/dxf-parser.js')});
const {readFile}=await import('../web/js/services/file-reader-service.js');
const {extractData,extractStructure,buildStructurePlan}=await import('../web/js/services/extraction-service.js');
const {buildSceneObject}=await import('../web/js/services/preview-service.js');
const {export3D}=await import('../web/js/services/export-service.js');
for(const filename of [input,'web/assets/sample-plan.dxf']){
  const source=await readFile(new File([await fs.readFile(filename)],path.basename(filename)),{pdfOptions:{useSystemFonts:true}});
  try{
    const extracted=await extractData(source,{includeGeometry:true,rasterFallback:false}),structure=extractStructure(source,extracted),structureSnapshot=JSON.stringify(structure),plan=buildStructurePlan(source,structure),result=convert2DTo3D(plan,{mode:'preview'});
    assert.equal(result.report.status,'success',JSON.stringify(result.report));assert(validateFloorPlanV5(plan));assert(validateReportV5(result.report));
    assert.equal(JSON.stringify(structure),structureSnapshot);assert.equal(result.report.metrics.walls,source.format==='pdf'?8:7);assert.equal(result.report.metrics.columns,source.format==='pdf'?6:0);
    const structural=structure.objects.filter(o=>!['chair','tall_cabinet','table'].includes(o.kind)),chairs=plan.levels[0].furniture.filter(o=>o.kind==='chair'),cabinets=plan.levels[0].furniture.filter(o=>o.kind==='tall_cabinet'),expectedMeshes=structural.length+plan.levels[0].furniture.reduce((sum,o)=>sum+buildFurnitureParts(o).length,0);
    assert.equal(result.scene.nodes.filter(n=>n.mesh).length,expectedMeshes);
    assert.equal(result.report.metrics.chairs,source.format==='pdf'?18:0);assert.equal(result.report.metrics.tall_cabinets,source.format==='pdf'?12:0);
    for(const object of structural){
      const mesh=result.scene.nodes.find(n=>n.mesh&&n.source_2d_ids.includes(object.id));assert(mesh);assert.equal(meshIssue(mesh.mesh),null);
      const height=object.kind==='door'?2100:object.evidence.semantic_type==='office_screen'?1200:2500;
      const expectedVolume=(area(object.boundary_mm)+object.holes_mm.reduce((n,h)=>n+area(h),0))*height;
      assert(Math.abs(volume(mesh.mesh)-expectedVolume)<1,'Exact source footprint volume');
      assert(mesh.mesh.vertices_mm.every(v=>v[2]===0||v[2]===height));
      assert(mesh.mesh.faces.every(f=>f.material_id===(object.material.kind==='door_wood'?'door_wood':object.material.kind==='concrete'?'concrete':'light_wood')));
      assert.equal(result.report.mapping.find(m=>m.source_2d_id===object.id).generated_node_ids.length,2);
    }
    for(const object of plan.levels[0].furniture){
      const parts=result.scene.nodes.filter(n=>n.mesh&&n.source_2d_ids.includes(object.id)),chair=object.kind==='chair';
      assert.equal(parts.length,buildFurnitureParts(object).length);assert(object.source_refs.length);
      assert.equal(Math.max(...parts.flatMap(p=>p.mesh.vertices_mm.map(v=>v[2]))),chair?850:object.kind==='table'?900:2100);
      if(chair)assert.equal(Math.max(...parts.find(p=>p.semantic.part==='seat').mesh.vertices_mm.map(v=>v[2])),450);
      assert.equal(result.report.mapping.find(m=>m.source_2d_id===object.id).generated_node_ids.length,parts.length+1);
    }
    const rendered=buildSceneObject(result.scene);let renderedMeshes=0;rendered.traverse(n=>{if(n.isMesh)renderedMeshes++;});assert.equal(renderedMeshes,expectedMeshes);
    assert.equal(convert2DTo3D(plan).report.status,'failed');assert.equal(export3D(result.scene).diagnostics[0].code,'E_PREVIEW_ONLY');
    assert.throws(()=>buildStructurePlan({...source,sha256:'different'},structure));assert.throws(()=>buildStructurePlan(source,{...structure,calibration:null}));
    if(source.format==='pdf'){
      await fs.mkdir('outputs/structure-preview',{recursive:true});
      for(const [name,value]of [['floorplan2d',plan],['scene3d',result.scene],['transfer-report',result.report]])await fs.writeFile(`outputs/structure-preview/${name}.json`,JSON.stringify(value,null,2)+'\n');
    }
    console.log(JSON.stringify({format:source.format,...result.report.metrics,meshes:renderedMeshes,preview_only:result.report.preview_only}));
  }finally{await source.dispose();}
}
console.log('PASS: v2 column/concave-wall geometry, real PDF 51 objects / 267 solids, DXF, material/height/source mapping, holes, validation, v1 migration compatibility and independent Preview.');
