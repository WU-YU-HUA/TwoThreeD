import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {validateFloorPlanV4,validateReportV4} from '../web/js/contracts/validators.generated.js';
import {migrateFloorPlanV3ToV4} from '../web/js/contracts/migrations.js';
import {meshIssue} from '../web/js/geometry/model-geometry.js';
import {buildFurnitureParts} from '../web/js/geometry/furniture-templates.js';
import {findFurniture} from '../web/js/extraction/furniture-analysis.js';

const plan=JSON.parse(await fs.readFile('examples/floorplan2d.v4.sample.json')),snapshot=JSON.stringify(plan),result=convert2DTo3D(plan);
assert.equal(result.report.status,'success',JSON.stringify(result.report));assert(validateFloorPlanV4(plan));assert(validateReportV4(result.report));assert.equal(JSON.stringify(plan),snapshot);
assert.equal(result.report.metrics.chairs,1);assert.equal(result.report.metrics.tall_cabinets,1);
for(const object of plan.levels[0].furniture){
  const parts=buildFurnitureParts(object,700),chair=object.kind==='chair';assert.equal(parts.length,chair?6:9);
  const angle=object.rotation_deg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const points=parts.flatMap(p=>{assert.equal(meshIssue(p.mesh),null);return p.mesh.vertices_mm;});
  for(const [x,y,z]of points){const dx=x-object.position_mm[0],dy=y-object.position_mm[1],lx=c*dx+s*dy,ly=-s*dx+c*dy;assert(Math.abs(lx)<=object.width_mm/2+1e-6);assert(Math.abs(ly)<=object.depth_mm/2+1e-6);assert(z>=700&&z<=700+object.height_mm);}
  assert.equal(Math.max(...points.map(p=>p[2])),700+object.height_mm);assert.equal(Math.min(...points.map(p=>p[2])),700);
  assert.equal(result.report.mapping.find(m=>m.source_2d_id===object.id).generated_node_ids.length,parts.length+1);
  if(chair){assert.equal(Math.max(...parts.find(p=>p.id==='seat').mesh.vertices_mm.map(p=>p[2])),1150);assert.equal(Math.max(...parts.find(p=>p.id==='back').mesh.vertices_mm.map(p=>p[2])),1550);}
  else assert(parts.some(p=>p.id==='door_left')&&parts.some(p=>p.id==='handle_0'));
}
const rejects=(edit,code)=>{const p=structuredClone(plan);edit(p);const r=convert2DTo3D(p);assert.equal(r.scene,null);assert(r.report.diagnostics.some(d=>d.code===code),JSON.stringify(r.report));};
rejects(p=>p.levels[0].furniture[0].width_mm=0,'E_SCHEMA');
rejects(p=>p.levels[0].furniture[0].seat_height_mm=850,'E_INVALID_FURNITURE');
rejects(p=>p.levels[0].furniture[0].template_id='unknown','E_INVALID_FURNITURE');
rejects(p=>p.levels[0].furniture[0].template_id='builtin.tall_cabinet.v1','E_INVALID_FURNITURE');
rejects(p=>p.levels[0].furniture[0].accent_material_id='missing','E_MATERIAL_MISSING');
rejects(p=>p.levels[0].furniture[0].confirmed=false,'E_UNCONFIRMED_ELEMENT');
rejects(p=>p.levels[0].furniture[0].id=p.levels[0].walls[0].id,'E_DUPLICATE_ID');
const old=JSON.parse(await fs.readFile('examples/floorplan2d.v3.sample.json')),original=JSON.stringify(old);
assert.deepEqual(convert2DTo3D(migrateFloorPlanV3ToV4(old)).scene,convert2DTo3D(old).scene);assert.equal(JSON.stringify(old),original);
await fs.writeFile('examples/transfer-report.v4.sample.json',JSON.stringify(result.report,null,2)+'\n');

const evidence=JSON.parse(await fs.readFile('outputs/json-preview/plan2d.geometry.json')),inspection=JSON.parse(await fs.readFile('outputs/json-preview/plan2d.inspection.json')),names=new Map(inspection.layers.map(l=>[l.id,l.name]));
const paths=evidence.vector_paths.map(p=>({sourceOperatorIndex:p.source_operator_index,names:p.layer_ids.map(id=>names.get(id)),commands:p.commands_pdf_pt,box:p.bbox_pdf_pt}));
const box=evidence.main_region.bbox_pdf_pt,options={fingerprint:evidence.source_pdf_sha256,mmPerSourceUnit:200/9.72,referenceGap:9.72,layoutCenter:[(box[0]+box[2])/2,(box[1]+box[3])/2]};
const before=JSON.stringify(paths),found=findFurniture(paths,box,options),chairs=found.objects.filter(o=>o.kind==='chair'),cabinets=found.objects.filter(o=>o.kind==='tall_cabinet');
assert.equal(JSON.stringify(paths),before);assert.equal(chairs.length,18);assert.equal(cabinets.length,12);assert.equal(new Set(found.objects.map(o=>o.id)).size,30);
assert.equal(chairs.filter(o=>o.position[0]>650).length,4);assert.equal(cabinets.filter(o=>o.position[0]<400).length,4);assert.equal(cabinets.filter(o=>o.position[0]>800).length,8);
for(const chair of chairs){
  const angle=chair.rotation_deg*Math.PI/180,front=[-Math.sin(angle),Math.cos(angle)];
  if(chair.position[0]>650)assert(front[1]>.99,'OA chairs face the desks');
  else assert(front[0]*(471-chair.position[0])+front[1]*(457-chair.position[1])>0,'Conference chairs face the table');
  assert(chair.width*options.mmPerSourceUnit>500&&chair.width*options.mmPerSourceUnit<750);
}
assert(cabinets.every(o=>o.position[0]<400?o.rotation_deg===-90:o.rotation_deg===90));
assert(cabinets.some(o=>Math.abs(o.width-52.32)<1e-4&&Math.abs(o.depth-29.4)<1e-4),'Use outer cabinet outline, not inset X frame');
const reversed=findFurniture([...paths,...paths].reverse(),box,options);
assert.deepEqual(reversed.objects.map(o=>o.id).sort(),found.objects.map(o=>o.id).sort(),'IDs stable under order and duplicate paths');
assert.equal(findFurniture(paths,box,{...options,mmPerSourceUnit:null}).objects.length,0);
assert.equal(findFurniture(paths.filter(p=>!p.commands.some(c=>c.op==='cubic_bezier_to')),box,options).objects.filter(o=>o.kind==='chair').length,0,'Straight furniture boxes are not chairs');
const noX=paths.map(p=>({...p,commands:p.commands.filter((c,i)=>{if(c.op!=='line_to')return true;const previous=p.commands[i-1]?.points?.at(-1),end=c.points[0];return !previous||Math.abs(end[0]-previous[0])<1e-6||Math.abs(end[1]-previous[1])<1e-6;})}));
assert.equal(findFurniture(noX,box,options).objects.filter(o=>o.kind==='tall_cabinet').length,0,'Boxes without complete X marks are not high cabinets');
const crop=findFurniture(paths,[700,530,750,580],options);assert.equal(crop.objects.length,1);assert(found.objects.some(o=>o.id===crop.objects[0].id));
assert.equal(findFurniture(paths,[720,540,730,560],options).objects.length,0,'Clipped chair does not become a smaller new chair');
assert(found.diagnostics.some(d=>d.code==='W_SMALL_X_NOT_CABINET'));
console.log('PASS: 18 chairs / 12 high cabinets, chair directions, large-X rule, source dimensions, crop/order/dedup stability; v4 schemas, editable parts, materials/heights, invalid geometry gates and v3 migration.');
