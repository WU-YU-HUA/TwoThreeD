import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseBoardDimensions,boardDimensionLabel,boardFootprint} from '../web/js/extraction/board-dimensions.js';
import {applyModelSources} from '../web/js/extraction/model-selection.js';
import {migrateFloorPlanV7ToV8} from '../web/js/contracts/migrations.js';
import {loadModelGeometry} from '../web/js/services/model-geometry-service.js';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
import {meshBounds} from '../web/js/geometry/model-fitting.js';
import {validateFloorPlanV8,validateReportV8,validateFloorPlanV7} from '../web/js/contracts/validators.generated.js';
import {buildSceneObject} from '../web/js/services/preview-service.js';
import {export3D} from '../web/js/services/export-service.js';
const read=async p=>JSON.parse(await fs.readFile(p));
const catalog=await read('web/config/model-assets.json');
const fetchImpl=async url=>{const b=await fs.readFile(url);return {ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
assert.deepEqual(parseBoardDimensions('Ｗ１４０ × Ｄ６５ × Ｈ１９３ cm'),{width_mm:1400,depth_mm:650,height_mm:1930,text:'Ｗ１４０ × Ｄ６５ × Ｈ１９３ cm',units:'cm'});
assert.equal(parseBoardDimensions('W1.3xD0.85xH1.76m').height_mm,1760);
assert.equal(parseBoardDimensions('w1300*d850*h1760mm').width_mm,1300);
for(const text of ['130','W140xD65xH193','W0xD65xH193cm','W140xH193cm','W99999xD65xH193cm','電視W140xD65xH193cm'])assert.equal(parseBoardDimensions(text),null);
const label={text:'白板',box:[100,100,120,110]},annotation={text:'W140xD65xH193cm',box:[80,80,140,90]};
assert.equal(boardDimensionLabel(label,[annotation]).dimensions.width_mm,1400);
assert.equal(boardDimensionLabel(label,[annotation,{...annotation,box:[80,120,140,130]}]),null,'Ambiguous labels must not be guessed');
assert.equal(boardDimensionLabel(label,[{...annotation,box:[200,80,260,90]}]),null,'Adjacent object dimensions must not be borrowed');
const face=box=>({box,ring:[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]],refs:[{source_id:box.join(',')}]}),panel=face([0,40,140,44]);
const footprint=boardFootprint(panel,[panel,face([10,0,14,65]),face([126,0,130,65])]);
assert.deepEqual(footprint.box,[0,0,140,65]);assert.equal(footprint.refs.length,3);assert(footprint.expanded_board_support);
const raw=await read('examples/floorplan2d.v6.sample.json'),template=raw.levels[0].furniture.find(o=>o.kind==='placeholder');
raw.levels[0].furniture=['whiteboard','electronic_whiteboard'].map((type,i)=>({...structuredClone(template),id:type,name:type,label_text:type,catalog_type_id:type,support_id:null,position_mm:[2000+i*2000,6000],boundary_mm:[[1800+i*2000,5800],[2200+i*2000,5800],[2200+i*2000,6200],[1800+i*2000,6200]],extensions:{labelled_dimensions:parseBoardDimensions(i?'W130xD85xH176cm':'W140xD65xH193cm')}}));
raw.levels[0].furniture.push({...structuredClone(template),id:'missing_model',name:'未知設備',label_text:'未知設備',catalog_type_id:'unclassified',support_id:null});
const snapshot=JSON.stringify(raw),plan=applyModelSources(raw,catalog);assert.equal(JSON.stringify(raw),snapshot);
assert(validateFloorPlanV8(plan),JSON.stringify(validateFloorPlanV8.errors));assert.equal(validateFloorPlanV7(plan),false);
const geometry=await loadModelGeometry(plan,catalog,{fetchImpl}),result=convert2DTo3D(plan,{mode:'preview'},geometry);
assert(result.scene,JSON.stringify(result.report));assert(validateReportV8(result.report));
const marker=plan.levels[0].furniture.find(o=>o.id==='missing_model'),cube=result.scene.nodes.find(n=>n.mesh&&n.source_2d_ids.includes(marker.id));
assert.equal(marker.template_id,'builtin.marker_cube.v1');assert.equal(cube.semantic.label_mode,'none');assert.equal(cube.semantic.face_labels,undefined);
assert.deepEqual(meshBounds([cube.mesh]).size,[400,400,400]);assert.equal(meshBounds([cube.mesh]).min[2],plan.levels[0].base_elevation_mm+100);
assert.deepEqual(result.scene.materials.find(m=>m.id===cube.mesh.faces[0].material_id).color_rgba,[.85,.16,.12,1]);
const rendered=buildSceneObject(result.scene,{createCanvas:()=>{throw new Error('Unlabelled markers must not create text textures');}});
let visibleCube;rendered.traverse(n=>{if(n.userData.nodeId===cube.id)visibleCube=n;});assert(visibleCube);assert.equal(visibleCube.geometry.groups.length,1);
const direct=export3D(result.scene,{mode:'draft',container:'dae'});assert(direct.success,JSON.stringify(direct.diagnostics));assert.equal(direct.summary.label_textures,0);
const invalidMarker=structuredClone(result.scene);invalidMarker.nodes.find(n=>n.id===cube.id).semantic.face_labels=[];
assert.throws(()=>buildSceneObject(invalidMarker),/純色方塊/);assert.equal(export3D(invalidMarker,{mode:'draft',container:'dae'}).success,false);
for(const [i,o]of plan.levels[0].furniture.filter(o=>o.kind==='model_object').entries()){
  assert.equal(o.fit_mode,'equipment_dimensions');assert.deepEqual(o.extensions.calibrated_outline_mm,raw.levels[0].furniture[i].boundary_mm);
  const parts=result.scene.nodes.filter(n=>n.mesh&&n.source_2d_ids.includes(o.id)),bounds=meshBounds(parts.map(n=>n.mesh)),expected=i?[1300,850,1760]:[1400,650,1930];
  expected.forEach((v,j)=>assert(Math.abs(bounds.size[j]-v)<.001));assert.equal(bounds.min[2],plan.levels[0].base_elevation_mm);
  assert.equal(result.scene.nodes.find(n=>n.id==='furniture_'+o.id).semantic.dimensions_source,'explicit_wdh_label');
}
for(const modify of [o=>delete o.extensions.labelled_dimensions,o=>o.extensions.labelled_dimensions.width_mm=1]){
  const source=structuredClone(raw);modify(source.levels[0].furniture[0]);const selected=applyModelSources(source,catalog);
  assert.equal(selected.levels[0].furniture[0].kind,'placeholder');assert(selected.diagnostics.some(d=>d.code==='W_MODEL_DIMENSIONS_REQUIRED'));
}
for(const modify of [o=>o.height_mm=null,o=>o.height_mm=0,o=>o.fit_mode='uniform_footprint',o=>o.support_id='missing']){
  const invalid=structuredClone(plan);modify(invalid.levels[0].furniture[0]);assert.equal(convert2DTo3D(invalid,{mode:'preview'},geometry).scene,null);
}
const legacy=await read('examples/floorplan2d.v7.sample.json'),legacyGeometry=await loadModelGeometry(legacy,catalog,{fetchImpl});
assert.deepEqual(convert2DTo3D(legacy,{mode:'preview'},legacyGeometry).scene,convert2DTo3D(migrateFloorPlanV7ToV8(legacy),{mode:'preview'},legacyGeometry).scene,'Migration cannot change geometry');
// Actual drawing verifies name/annotation association, stand extent and source references.
const actual=await read('outputs/asset-preview/floorplan2d.json');
for(const [type,expected]of [['whiteboard',[1400,650,1930]],['electronic_whiteboard',[1300,850,1760]]]){
  const object=actual.levels[0].furniture.find(o=>o.catalog_type_id===type);
  assert.deepEqual([object.width_mm,object.depth_mm,object.height_mm],expected);
  assert(object.source_refs.some(r=>r.method==='explicit_wdh_dimensions'));assert.equal(object.support_id,null);assert.equal(object.confirmed,false);
  const ys=object.extensions.calibrated_outline_mm.map(p=>p[1]);assert(Math.max(...ys)-Math.min(...ys)>600,'Stand depth is retained, not just the thin writing surface');
}
for(const [name,data]of [['floorplan2d',plan],['transfer-report',result.report]])await fs.writeFile(`examples/${name}.v8.sample.json`,JSON.stringify(data,null,2)+'\n');
console.log('PASS: explicit board W/D/H, Unicode/units, ambiguous and missing labels, stand footprint, v8 fixtures, exact geometry, invalid sizing/support, immutable input, v7 migration, actual PDF association.');
