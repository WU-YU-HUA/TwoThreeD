import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {validateFloorPlanV5,validateReportV5} from '../web/js/contracts/validators.generated.js';
import {migrateFloorPlanV4ToV5} from '../web/js/contracts/migrations.js';
import {area,meshIssue,polygonIssue} from '../web/js/geometry/model-geometry.js';
import {buildFurnitureParts} from '../web/js/geometry/furniture-templates.js';
import {findTables} from '../web/js/extraction/table-analysis.js';
import {insidePolygon,findOfficePartitions} from '../web/js/extraction/structure-analysis.js';

const plan=JSON.parse(await fs.readFile('examples/floorplan2d.v5.sample.json')),snapshot=JSON.stringify(plan),result=convert2DTo3D(plan);
assert.equal(result.report.status,'success',JSON.stringify(result.report));assert(validateFloorPlanV5(plan));assert(validateReportV5(result.report));assert.equal(JSON.stringify(plan),snapshot);assert.equal(result.report.metrics.tables,2);
function verifyTable(object,base=0){
  const parts=buildFurnitureParts(object,base),top=parts.find(p=>p.id==='tabletop').mesh;
  for(const part of parts)assert.equal(meshIssue(part.mesh),null);
  assert.equal(Math.max(...parts.flatMap(p=>p.mesh.vertices_mm.map(v=>v[2]))),base+900);
  assert(top.vertices_mm.every(p=>p[2]===base+860||p[2]===base+900));
  // Top triangulation must cover exactly the source area, with no triangles
  // over the central opening or the L-shaped chair recess.
  let topArea=0;
  for(const face of top.faces){
    const points=face.indices.map(i=>top.vertices_mm[i]);if(!points.every(p=>p[2]===base+900))continue;
    topArea+=area(points);const center=points.reduce((s,p)=>s.map((v,i)=>v+p[i]/points.length),[0,0]);
    assert(insidePolygon(center,object.boundary_mm));assert(!object.holes_mm.some(h=>insidePolygon(center,h)));
  }
  assert(Math.abs(topArea-area(object.boundary_mm)-object.holes_mm.reduce((s,h)=>s+area(h),0))<.1);
  for(const part of parts.filter(p=>p.id.startsWith('leg_')))for(const p of part.mesh.vertices_mm){
    assert(insidePolygon(p,object.boundary_mm));assert(!object.holes_mm.some(h=>insidePolygon(p,h)));assert(p[2]===base||p[2]===base+860);
  }
  return parts;
}
for(const object of plan.levels[0].furniture.filter(o=>o.kind==='table')){
  const parts=verifyTable(object,700);assert.equal(result.report.mapping.find(m=>m.source_2d_id===object.id).generated_node_ids.length,parts.length+1);
}
const rejects=(edit,code)=>{const p=structuredClone(plan);edit(p.levels[0].furniture.find(o=>o.kind==='table'));const r=convert2DTo3D(p);assert.equal(r.scene,null);assert(r.report.diagnostics.some(d=>d.code===code),JSON.stringify(r.report));};
rejects(t=>t.height_mm=0,'E_SCHEMA');rejects(t=>t.top_thickness_mm=900,'E_INVALID_FURNITURE');
rejects(t=>t.boundary_mm.reverse(),'E_INVALID_FURNITURE');rejects(t=>t.holes_mm=[[[9000,9000],[9000,9100],[9100,9100],[9100,9000]]],'E_INVALID_FURNITURE');
rejects(t=>t.template_id='unknown','E_INVALID_FURNITURE');rejects(t=>t.confirmed=false,'E_UNCONFIRMED_ELEMENT');rejects(t=>t.material_id='missing','E_MATERIAL_MISSING');
const old=JSON.parse(await fs.readFile('examples/floorplan2d.v4.sample.json')),beforeOld=JSON.stringify(old);
assert.deepEqual(convert2DTo3D(migrateFloorPlanV4ToV5(old)).scene,convert2DTo3D(old).scene);assert.equal(JSON.stringify(old),beforeOld);
await fs.writeFile('examples/transfer-report.v5.sample.json',JSON.stringify(result.report,null,2)+'\n');

const evidence=JSON.parse(await fs.readFile('outputs/json-preview/plan2d.geometry.json')),inspection=JSON.parse(await fs.readFile('outputs/json-preview/plan2d.inspection.json')),names=new Map(inspection.layers.map(l=>[l.id,l.name]));
const paths=evidence.vector_paths.map(p=>({sourceOperatorIndex:p.source_operator_index,names:p.layer_ids.map(id=>names.get(id)),commands:p.commands_pdf_pt,box:p.bbox_pdf_pt}));
const structure=JSON.parse(await fs.readFile('outputs/extraction/plan2d.structure.json')),box=evidence.main_region.bbox_pdf_pt;
const options={fingerprint:evidence.source_pdf_sha256,mmPerSourceUnit:200/9.72,referenceGap:9.72,textItems:inspection.object_labels.map(t=>({text:t.source_text,box:t.bbox_pdf_pt})),occupied:structure.objects.filter(o=>o.kind!=='table')};
const original=JSON.stringify(paths),found=findTables(paths,box,options).objects;assert.equal(JSON.stringify(paths),original);assert.equal(found.length,5);
const oa=found.filter(o=>!o.holes.length),oval=found.find(o=>o.holes.length);assert.equal(oa.length,4);assert(oa.every(o=>o.boundary.length===6&&o.bbox[0]>630));
assert(oval.boundary.length>40);assert.equal(oval.holes.length,1);assert(insidePolygon([471,457],oval.holes[0]));
for(const table of found){
  assert.equal(polygonIssue(table.boundary,table.holes),null);assert(table.source_refs.length>0);
  verifyTable({kind:'table',template_id:'builtin.table.v1',boundary_mm:table.boundary.map(p=>p.map(v=>v*options.mmPerSourceUnit)),holes_mm:table.holes.map(h=>h.map(p=>p.map(v=>v*options.mmPerSourceUnit))),height_mm:900,top_thickness_mm:40,material_id:'wood',accent_material_id:'metal'});
}
for(const p of [[710,550],[710,440],[710,340],[710,230]])assert(!oa.some(o=>insidePolygon(p,o.boundary)),'Chair recesses remain empty');
assert.deepEqual(findTables([...paths,...paths].reverse(),box,options).objects.map(o=>o.id).sort(),found.map(o=>o.id).sort());
assert.equal(findTables(paths,[450,350,500,560],options).objects.length,0,'Cropping the outer table cannot turn its hole into a table');
const cropped=findTables(paths,[660,510,760,630],options).objects;assert.equal(cropped.length,1);assert.equal(cropped[0].id,oa[0].id);
assert.equal(findTables(paths,box,{...options,mmPerSourceUnit:null}).objects.length,0);
assert.equal(findTables(paths.filter(p=>p.sourceOperatorIndex!==2764),box,options).objects.filter(o=>o.holes.length).length,0,'Missing outer arc cannot form a ring table');
assert(!findTables(paths.filter(p=>p.sourceOperatorIndex!==2764),box,options).objects.some(o=>insidePolygon([471,457],o.boundary)),'An incomplete outer curve cannot turn the inner opening into a filled table');
const rectangle={sourceOperatorIndex:1,names:['家具'],commands:[{op:'move_to',points:[[0,0]]},...[[1800,0],[1800,900],[0,900],[0,0]].map(p=>({op:'line_to',points:[p]}))]};
const simple={mmPerSourceUnit:1,referenceGap:200};
assert.equal(findTables([rectangle],[-1,-1,2000,1000],simple).objects.length,1,'An unlabelled empty furniture rectangle is a table');
assert.equal(findTables([rectangle],[-1,-1,2000,1000],{...simple,textItems:[{text:'冰箱',box:[500,200,700,400]}]}).objects.length,0);
const diagonal={sourceOperatorIndex:2,names:['HATCH'],commands:[{op:'move_to',points:[[0,0]]},{op:'line_to',points:[[1800,900]]}]};
assert.equal(findTables([rectangle,diagonal],[-1,-1,2000,1000],simple).objects.length,0,'Filled outlines are not empty tables');

// The new office rule accepts any office label, with material evidence taking
// precedence. It does not lower unrelated concrete walls or every empty box.
const officeOptions={...options,textItems:options.textItems.map(t=>/OA/.test(t.text)?{...t,text:'辦公'}:t)};
const screens=findOfficePartitions(paths,box,officeOptions);assert.equal(screens.length,1);assert.equal(screens[0].evidence.semantic_type,'office_screen');assert(screens[0].evidence.area_labels.includes('辦公'));
assert.equal(findOfficePartitions(paths,box,{...officeOptions,textItems:officeOptions.textItems.map(t=>({...t,text:'會議'}))}).length,0);
const solid={boundary:screens[0].boundary,holes:[]};assert.equal(findOfficePartitions(paths,box,{...officeOptions,solidRegions:[solid]}).length,0,'Concrete evidence overrides office screen interpretation');
const filledOffice=Array.from({length:45},(_,i)=>({sourceOperatorIndex:10000+i,names:['HATCH'],commands:[{op:'move_to',points:[[630,190+i*10]]},{op:'line_to',points:[[760,200+i*10]]}]}));
assert.equal(findOfficePartitions([...paths,...filledOffice],box,officeOptions).length,0,'Filled office faces cannot become hollow screens');
const wallPlan=JSON.parse(await fs.readFile('outputs/structure-preview/floorplan2d.json')),screen=wallPlan.levels[0].walls.find(w=>w.extensions.semantic_type==='office_screen');
assert.equal(screen.height_mm,1200);assert(wallPlan.levels[0].walls.filter(w=>w.id!==screen.id).every(w=>w.height_mm===2500));assert(wallPlan.levels[0].columns.every(c=>c.height_mm===2500));
console.log('PASS: four L desks + one oval ring, 900 mm tops, preserved recesses/holes, supported legs, source mapping, exclusions/crop/dedup, v5 validation and v4 migration; office-label screens 1200 mm with concrete precedence.');
