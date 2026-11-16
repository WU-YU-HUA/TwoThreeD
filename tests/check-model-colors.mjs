import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeHex,hexToLinearRgba,validateAppearanceProfiles,readModelColors,saveModelColors,applyModelColors} from '../web/js/services/model-appearance-service.js';
import {loadModelGeometry} from '../web/js/services/model-geometry-service.js';
import {buildSceneObject} from '../web/js/services/preview-service.js';
import {export3D} from '../web/js/services/export-service.js';
const read=async p=>JSON.parse(await fs.readFile(p));
const catalog=await read('web/config/model-assets.json'),profiles=validateAppearanceProfiles(await read('web/config/model-appearance.json'));
assert.equal(profiles.length,6);assert.equal(normalizeHex(' #3a7ca5 '),'#3A7CA5');
assert.deepEqual(hexToLinearRgba('#FFFFFF'),[1,1,1,1]);assert.deepEqual(hexToLinearRgba('#000000'),[0,0,0,1]);
assert(Math.abs(hexToLinearRgba('#808080')[0]-.21586050011389926)<1e-12);
for(const input of ['red','#fff','123456','#12GG00',null])assert.throws(()=>normalizeHex(input));
const memory={value:null,getItem(){return this.value;},setItem(_,v){this.value=v;}},palette=Object.fromEntries(profiles.map(p=>[p.asset_id,'#3A7CA5']));
assert(saveModelColors(palette,memory));assert.deepEqual(readModelColors(profiles,memory),palette);
memory.value='{';assert.deepEqual(readModelColors(profiles,memory),{});
memory.value=JSON.stringify({[profiles[0].asset_id]:'invalid','unknown':'#FF0000',[profiles[1].asset_id]:'#abcdef'});assert.deepEqual(readModelColors(profiles,memory),{[profiles[1].asset_id]:'#ABCDEF'});
assert.equal(saveModelColors(palette,{setItem(){throw new Error('blocked');}}),false);
const fetchImpl=async url=>{const b=await fs.readFile(url);return{ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
const scenes=await loadModelGeometry({levels:[{furniture:profiles.map(p=>({kind:'model_object',asset_id:p.asset_id}))}]},catalog,{fetchImpl});
await fs.mkdir('outputs/color-preview',{recursive:true});
for(const profile of profiles){
  const source=scenes[profile.asset_id],snapshot=JSON.stringify(source),colored=applyModelColors(source,profiles,palette);
  const firstPart=source.nodes.find(n=>profile.part_names.includes(n.name)),firstColor=source.materials.find(m=>m.id===firstPart.mesh.faces[0].material_id).color_rgba;
  const srgb=n=>Math.round((n<=.0031308?12.92*n:1.055*n**(1/2.4)-.055)*255).toString(16).padStart(2,'0');
  assert.equal('#'+firstColor.slice(0,3).map(srgb).join('').toUpperCase(),profile.default_hex,'Picker default represents the original primary material');
  assert.equal(JSON.stringify(source),snapshot,'Source GLBs/IR must not be modified');
  let changed=0,protectedParts=0;
  const resultMat=new Map(colored.materials.map(m=>[m.id,m]));
  for(const [i,node]of colored.nodes.entries()){
    const original=source.nodes[i];assert.deepEqual(node.mesh.vertices_mm,original.mesh.vertices_mm);assert.deepEqual(node.mesh.faces.map(f=>f.indices),original.mesh.faces.map(f=>f.indices));
    if(profile.part_names.includes(node.name)){
      changed++;for(const face of node.mesh.faces)assert.deepEqual(resultMat.get(face.material_id).color_rgba.slice(0,3),hexToLinearRgba('#3A7CA5').slice(0,3));
    }else{protectedParts++;assert.deepEqual(node,original,'Glass, metal accessories, writing panels, dishes, knobs and buttons keep materials');}
  }
  assert(changed>0&&protectedParts>0);assert(profile.part_names.every(name=>source.nodes.some(n=>n.name===name)));
  assert.deepEqual(applyModelColors(source,profiles,{}),source,'Reset restores exact original materials and geometry');
  const group={id:'model',name:profile.name,kind:'group',parent_id:null,source_2d_ids:[profile.asset_id],mesh:null,semantic:{category:'equipment'},editable:true};
  const exportedScene={...colored,nodes:[group,...colored.nodes.map(n=>({...n,parent_id:'model'}))],extensions:{...colored.extensions,twothreeD:{...colored.extensions.twothreeD,preview_only:true,model_sources:[source.extensions.model_asset]}}};
  const exported=export3D(exportedScene,{mode:'draft',container:'dae',filename:profile.name,createdAt:'2026-11-16T00:00:00Z'});
  assert(exported.success,JSON.stringify(exported.diagnostics));assert.equal(exported.summary.label_textures,0);
  const xml=new TextDecoder().decode(exported.artifact.content);assert(xml.includes('#3A7CA5'));assert(xml.includes(hexToLinearRgba('#3A7CA5').slice(0,3).join(' ')));
  await fs.writeFile('outputs/color-preview/'+profile.asset_id.split('.').at(-1)+'.dae',exported.artifact.content);
  const rendered=buildSceneObject(exportedScene);let painted=0;
  rendered.traverse(n=>{if(n.isMesh)for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(Math.abs(m.color.r-hexToLinearRgba('#3A7CA5')[0])<1e-10)painted++;});assert(painted>0);
}
const actual=await read('outputs/asset-preview/scene3d.json'),actualBefore=JSON.stringify(actual),custom=applyModelColors(actual,profiles,palette);
assert.equal(JSON.stringify(actual),actualBefore);assert.deepEqual(custom.nodes.map(n=>[n.id,n.parent_id,n.source_2d_ids,n.mesh?.vertices_mm]),actual.nodes.map(n=>[n.id,n.parent_id,n.source_2d_ids,n.mesh?.vertices_mm]));
const markerIds=actual.nodes.filter(n=>n.semantic.category==='equipment_placeholder').map(n=>n.id);
for(const id of markerIds)assert.deepEqual(custom.nodes.find(n=>n.id===id),actual.nodes.find(n=>n.id===id),'Missing-model red markers stay red');
// All instances of one asset share the override, other kinds stay unchanged.
const two=structuredClone(actual),one=two.nodes.find(n=>n.mesh&&n.semantic.asset_id==='twothreeD.generated.whiteboard'&&n.name.endsWith(' / side_frame'));
two.nodes.push({...structuredClone(one),id:'second_board_frame'});const both=applyModelColors(two,profiles,{'twothreeD.generated.whiteboard':'#FF8800'});
assert.equal(both.nodes.find(n=>n.id===one.id).mesh.faces[0].material_id,both.nodes.at(-1).mesh.faces[0].material_id);
assert.throws(()=>applyModelColors(actual,profiles,{'unknown':'#FF0000'}));assert.throws(()=>applyModelColors(actual,profiles,{[profiles[0].asset_id]:'red'}));
const whole=export3D(custom,{mode:'draft',container:'dae',filename:'color-preview',createdAt:'2026-11-16T00:00:00Z'});assert(whole.success);await fs.writeFile('outputs/color-preview/whole-plan.dae',whole.artifact.content);
console.log('PASS: 6 body/frame color profiles; HEX/sRGB, storage/failure, immutable geometry, protected materials, all same-kind instances, reset, Preview colors and standalone DAE sources/colors.');
