import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { convert2DTo3D } from '../web/js/services/transfer-service.js';
import { validateFloorPlan, validateScene3D, validateReport } from '../web/js/contracts/validators.generated.js';
import { meshIssue } from '../web/js/geometry/model-geometry.js';
const plan=JSON.parse(await fs.readFile('examples/floorplan2d.sample.json','utf8'));
const expected=JSON.parse(await fs.readFile('examples/transfer.expected.json','utf8'));
const rejects=(edit,code,profile={})=>{const p=structuredClone(plan);edit(p);const r=convert2DTo3D(p,profile);assert.equal(r.scene,null);assert(r.report.diagnostics.some(d=>d.code===code),JSON.stringify(r.report.diagnostics));};
rejects(p=>p.source.scale_verified=false,'E_SCALE_UNVERIFIED');
rejects(p=>p.levels[0].walls[0].end_mm=[0,0],'E_WALL_ZERO_LENGTH');
rejects(p=>p.levels[0].walls[0].material_id='missing','E_MATERIAL_MISSING');
rejects(p=>p.levels[0].walls[0].confirmed=false,'E_UNCONFIRMED_ELEMENT');
rejects(p=>p.levels[0].openings[0].offset_from_start_mm=4900,'E_OPENING_OUT_OF_BOUNDS');
rejects(p=>p.levels[0].openings[1].offset_from_start_mm=1200,'E_OPENING_OVERLAP');
rejects(p=>p.levels[0].openings[0].wall_id='missing','E_WALL_MISSING');
rejects(p=>p.levels[0].slabs[0].boundary_mm=[[0,0],[5000,3000],[5000,0],[0,3000]],'E_INVALID_POLYGON');
rejects(p=>p.levels[0].slabs[0].holes_mm=[[[6000,0],[6000,100],[6100,100],[6100,0]]],'E_INVALID_POLYGON');
rejects(p=>p.levels[0].walls[0].id=p.levels[0].id,'E_DUPLICATE_ID');
rejects(()=>{},'E_UNSUPPORTED_OPTION',{wall_join_policy:'miter'});
const snapshot=JSON.stringify(plan),result=convert2DTo3D(plan);
assert.equal(result.report.status,'success',JSON.stringify(result.report.diagnostics));
assert(validateFloorPlan(plan));assert(validateScene3D(result.scene));assert(validateReport(result.report));
assert.equal(JSON.stringify(plan),snapshot);assert.deepEqual(convert2DTo3D(plan),result,'IDs and geometry are deterministic');
const volume=mesh=>mesh.faces.reduce((sum,face)=>{const a=mesh.vertices_mm[face.indices[0]];for(let i=1;i<face.indices.length-1;i++){const b=mesh.vertices_mm[face.indices[i]],c=mesh.vertices_mm[face.indices[i+1]];sum+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return sum;},0);
let wallVolume=0,floorVolume=0;
for(const n of result.scene.nodes.filter(n=>n.mesh)){
  assert.equal(meshIssue(n.mesh),null);
  if(n.semantic.category==='slab')floorVolume+=volume(n.mesh);else wallVolume+=volume(n.mesh);
  if(n.semantic.category==='wall_segment'){
    const xs=n.mesh.vertices_mm.map(v=>v[0]),zs=n.mesh.vertices_mm.map(v=>v[2]);
    for(const o of plan.levels[0].openings){const overlap=Math.min(Math.max(...xs),o.offset_from_start_mm+o.width_mm)-Math.max(Math.min(...xs),o.offset_from_start_mm);const vertical=Math.min(Math.max(...zs),o.sill_height_mm+o.height_mm)-Math.max(Math.min(...zs),o.sill_height_mm);assert(overlap<=1e-6||vertical<=1e-6,'Opening must contain no solid volume');}
  }
}
assert(Math.abs(wallVolume-expected.wall_volume_mm3)<1);assert(Math.abs(floorVolume-expected.floor_volume_mm3)<1);
for(const id of expected.source_ids)assert(result.report.mapping.find(m=>m.source_2d_id===id)?.generated_node_ids.length);
const elevated=structuredClone(plan);elevated.source.source_to_model_3x3=[20,0,100,0,20,200,0,0,1];elevated.levels[0].base_elevation_mm=700;
const raised=convert2DTo3D(elevated);assert.equal(raised.report.status,'success');
const v=raised.scene.nodes.filter(n=>n.mesh).flatMap(n=>n.mesh.vertices_mm);assert.equal(Math.max(...v.map(p=>p[0])),5000);assert.equal(Math.max(...v.map(p=>p[2])),3200);
const angled=structuredClone(plan);angled.levels[0].walls[0].end_mm=[3000,4000];assert.equal(convert2DTo3D(angled).report.status,'success');
const hole=structuredClone(plan);hole.levels[0].slabs[0].holes_mm=[[[1000,1000],[1000,2000],[2000,2000],[2000,1000]]];
const cutFloor=convert2DTo3D(hole);assert.equal(cutFloor.report.status,'success',JSON.stringify(cutFloor.report));assert(Math.abs(volume(cutFloor.scene.nodes.find(n=>n.semantic.category==='slab').mesh)-1400000000)<1);
const draft=structuredClone(plan);draft.source.scale_verified=false;draft.levels[0].walls[0].confirmed=false;
const preview=convert2DTo3D(draft,{mode:'preview'});assert.equal(preview.report.status,'success');assert.equal(preview.report.preview_only,true);assert.equal(preview.scene.extensions.twothreeD.preview_only,true);
await fs.writeFile('examples/scene3d.sample.json',JSON.stringify(result.scene,null,2)+'\n');
await fs.writeFile('examples/transfer-report.sample.json',JSON.stringify(result.report,null,2)+'\n');
console.log('PASS: schemas, failure gates, wall/door/window solids, exact volumes, floor hole, rotated wall, elevation, source mapping, immutable deterministic conversion, draft flags.');
