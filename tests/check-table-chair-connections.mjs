import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {findFurniture} from '../web/js/extraction/furniture-analysis.js';
import {findTables} from '../web/js/extraction/table-analysis.js';
import {insidePolygon} from '../web/js/extraction/structure-analysis.js';
import {buildFurnitureParts} from '../web/js/geometry/furniture-templates.js';
import {area,meshIssue} from '../web/js/geometry/model-geometry.js';
const fixture=JSON.parse(await fs.readFile('tests/fixtures/table-chair-contact.json'));
const {paths,box,options,expected}=fixture;
const detect=(p=paths,overrides={})=>{
 const furniture=findFurniture(p,box,options).objects;
 return findTables(p,box,{...options,occupied:furniture,...overrides}).objects;
};
const before=JSON.stringify(paths),actual=detect();
assert.equal(actual.length,1,'Separate complete table/chair contours must survive coincident front edges');
assert.deepEqual(actual[0].boundary,expected[0].boundary);assert.deepEqual(actual[0].holes,expected[0].holes);
assert.deepEqual(actual[0].source_refs,expected[0].source_refs,'Chair sources must not become table geometry');
assert.equal(actual[0].evidence.chair_contacts.length,6);
assert.equal(JSON.stringify(paths),before);
assert.deepEqual(detect([...paths,...paths].reverse()),actual);
const table={kind:'table',template_id:'builtin.table.v1',boundary_mm:actual[0].boundary.map(p=>p.map(v=>v*options.mmPerSourceUnit)),holes_mm:actual[0].holes.map(h=>h.map(p=>p.map(v=>v*options.mmPerSourceUnit))),height_mm:900,top_thickness_mm:40,material_id:'wood',accent_material_id:'metal'};
const parts=buildFurnitureParts(table),top=parts.find(p=>p.id==='tabletop').mesh;
for(const part of parts)assert.equal(meshIssue(part.mesh),null);
let surface=0;
for(const face of top.faces){
 const points=face.indices.map(i=>top.vertices_mm[i]);if(!points.every(p=>p[2]===900))continue;
 surface+=area(points);const center=points.reduce((s,p)=>s.map((v,i)=>v+p[i]/points.length),[0,0]);
 assert(!table.holes_mm.some(h=>insidePolygon(center,h)),'No top face may cover the central hole');
}
assert(Math.abs(surface-area(table.boundary_mm)-table.holes_mm.reduce((s,h)=>s+area(h),0))<.1);
const without=id=>paths.filter(p=>p.sourceOperatorIndex!==id);
for(const id of [2283,2287]){
 const broken=detect(without(id));
 assert(!broken.some(o=>o.evidence.chair_contacts),'Missing outer arc cannot be rescued');
 assert(!broken.some(o=>insidePolygon([400.74,450],o.boundary)),'Missing outer arc cannot turn the hole into a table');
}
for(const id of [2309,2307,2305])assert.equal(detect(without(id)).length,0,`Missing chair edge ${id} must not be repaired with another object's line`);
assert.equal(detect(paths,{occupied:[]}).length,0,'No recognized chairs means no ownership exception');
assert.equal(detect(paths,{textItems:[{text:'冰箱',box:[430,400,440,410]}]}).length,0);
const stray={sourceOperatorIndex:9000,names:['木作'],commands:[{op:'move_to',points:[[471.6,480]]},{op:'line_to',points:[[530,480]]}]};
assert.equal(detect([...paths,stray]).length,0,'Unowned outgoing connection still rejects');
const unrelated={...stray,names:['其他線']};assert.equal(detect([...paths,unrelated]).length,0,'Other non-annotation layers still block the new exception');
const crossing={...stray,commands:[{op:'move_to',points:[[250,480]]},{op:'line_to',points:[[1000,480]]}]};
assert.equal(detect([...paths,crossing]).length,0,'A crossing without an endpoint on the table still rejects');
const rawChairs=findFurniture(paths,box,options).objects.filter(o=>o.kind==='chair');
assert.equal(detect(without(2305),{occupied:rawChairs}).length,0,'An old chair classification cannot replace a missing seat side');
assert.equal(detect(paths,{occupied:[...rawChairs,{...rawChairs[0],id:'ambiguous_owner'}]}).length,0,'Ambiguous source ownership rejects');
assert.equal(detect(paths,{occupied:rawChairs.map(o=>({...o,rotation_deg:o.rotation_deg+180}))}).length,0,'Chairs facing away reject');
assert.equal(findTables(paths,[350,320,460,590],{...options,occupied:rawChairs}).objects.length,0,'Crop cannot turn the hole into a table');
const borrowed=structuredClone(paths),side=borrowed.find(p=>p.sourceOperatorIndex===2281);
side.commands.splice(1,1,{op:'line_to',points:[[471.6,468.24]]},{op:'move_to',points:[[471.6,445.44]]},{op:'line_to',points:[[471.6,371.76]]});
assert(!detect(borrowed).some(o=>o.evidence.chair_contacts||o.holes.length),'A missing table interval cannot borrow the coincident chair front');
const shiftChair=(dx,dy)=>{
 const ids=new Set(rawChairs.find(c=>c.source_refs.some(r=>r.source_id==='pdf:1:2309')).source_refs.map(r=>Number(r.source_id.split(':')[2])));
 return paths.map(p=>ids.has(p.sourceOperatorIndex)?{...p,commands:p.commands.map(c=>({...c,points:c.points.map(([x,y])=>[x+dx,y+dy])}))}:p);
};
assert.equal(detect(shiftChair(.1,0)).length,0,'Nearby parallel edges without true overlap are insufficient');
assert.equal(detect(shiftChair(-3,0)).length,0,'A chair penetrating the table must not be rescued');
assert.equal(detect(paths,{...options,mmPerSourceUnit:100,occupied:rawChairs}).length,0,'Unreasonable table size cannot be rescued');
for(const degrees of [30,90,180]){
 const a=degrees*Math.PI/180,rotate=([x,y])=>[Math.cos(a)*x-Math.sin(a)*y,Math.sin(a)*x+Math.cos(a)*y];
 const rotated=paths.map(p=>({...p,commands:p.commands.map(c=>({...c,points:c.points.map(rotate)}))})),region=[-1000,-1000,1000,1000];
 const chairs=findFurniture(rotated,region,options).objects;
 const result=findTables(rotated,region,{...options,occupied:chairs}).objects;
 assert.equal(result.length,1,`Rotated contact ${degrees} degrees`);assert.equal(result[0].holes.length,1);assert.equal(result[0].evidence.chair_contacts.length,6);
}
console.log('PASS: six independent coincident chair/table edges; same complete table/hole/source refs; missing edges, unknown connections, ambiguous ownership, facing, labels, crop and order/dedup.');
