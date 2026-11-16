import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {export3D,exportCapabilities,createExportLabelTextures} from '../web/js/services/export-service.js';
import {zipFiles} from '../web/js/export/zip-artifact.js';
import {convert2DTo3D} from '../web/js/services/transfer-service.js';
const dependencyRoot=process.argv[2],require=createRequire(path.resolve(dependencyRoot,'package.json')),canvas=require('@napi-rs/canvas'),JSZip=require('jszip');
const read=async file=>JSON.parse(await fs.readFile(file)),createdAt='2026-11-15T00:00:00Z',write=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);};
const scene=await read('outputs/asset-preview/scene3d.json'),snapshot=JSON.stringify(scene);
const textures=await createExportLabelTextures(scene,{createCanvas:()=>canvas.createCanvas(512,512)});
const output=export3D(scene,{mode:'draft',filename:'twothreeD',createdAt,labelTextures:textures});
assert(output.success,JSON.stringify(output.diagnostics));assert.equal(JSON.stringify(scene),snapshot);
assert.deepEqual(output.summary,{nodes:510,groups:70,object_groups:69,meshes:440,triangles:19305,label_textures:0,materials:58,units:'mm',up_axis:'Z_UP',draft:true});
assert.equal(exportCapabilities().native_skp,false);assert.equal(exportCapabilities().n_gon,false);assert.equal(exportCapabilities().groups,true);
assert(output.files.every(f=>!f.path.endsWith('.json')&&!f.path.endsWith('.pdf')));
const archive=await JSZip.loadAsync(output.artifact.content,{checkCRC32:true});
assert.equal(Object.keys(archive.files).length,3);
for(const file of output.files){
  const bytes=await archive.file(file.path).async('uint8array');assert.deepEqual(bytes,typeof file.content==='string'?new TextEncoder().encode(file.content):file.content);
  if(file.path.endsWith('.png')){const image=await canvas.loadImage(bytes);assert.equal(image.width,512);assert.equal(image.height,512);}
}
assert((await archive.file('README.txt').async('string')).includes('可編輯初稿'));
const dae=await archive.file('model.dae').async('string');assert(dae.includes('meter="0.001"'));assert(dae.includes('<up_axis>Z_UP</up_axis>'));assert(!dae.includes('<matrix>'));assert(!dae.includes('/Users/'));
assert.deepEqual(export3D(scene,{mode:'draft',filename:'twothreeD',createdAt,labelTextures:textures}).artifact.content,output.artifact.content,'Fixed timestamp export is deterministic');
const rejects=(source,options,code)=>{const r=export3D(source,{createdAt,...options});assert.equal(r.success,false);assert.equal(r.artifact,null);assert.equal(r.diagnostics[0].code,code,JSON.stringify(r));};
rejects(scene,{},'E_PREVIEW_ONLY');rejects(scene,{mode:'draft',format:'skp'},'E_UNSUPPORTED_OUTPUT');rejects(null,{},'E_SCENE_REQUIRED');
for(const [edit,code]of [
  [s=>s.nodes.push(structuredClone(s.nodes[0])),'E_DUPLICATE_ID'],
  [s=>s.materials.push(structuredClone(s.materials[0])),'E_DUPLICATE_ID'],
  [s=>s.nodes[0].parent_id=s.nodes[0].id,'E_INVALID_HIERARCHY'],
  [s=>s.nodes[0].parent_id='missing','E_INVALID_HIERARCHY'],
  [s=>s.nodes.find(n=>n.mesh).mesh.faces[0].indices[0]=999999,'E_INVALID_GEOMETRY'],
  [s=>{const mesh=s.nodes.find(n=>n.mesh).mesh;for(const i of mesh.faces[0].indices)mesh.vertices_mm[i]=[0,0,0];},'E_INVALID_GEOMETRY'],
  [s=>s.nodes.find(n=>n.mesh).mesh.faces[0].material_id='missing','E_MATERIAL_MISSING'],
  [s=>s.nodes.find(n=>n.mesh).mesh.vertices_mm[0][0]=NaN,'E_SCHEMA'],
  [s=>s.nodes[0].name='bad\u0001name','E_XML_TEXT'],
  [s=>s.materials[0].texture_uri='https://example.com/texture.png','E_UNSUPPORTED_TEXTURE'],
]){const s=structuredClone(scene);edit(s);rejects(s,{mode:'draft',labelTextures:textures},code);}
const standalone=export3D(scene,{mode:'draft',container:'dae',filename:'twothreeD',createdAt});
assert(standalone.success,JSON.stringify(standalone.diagnostics));assert.equal(standalone.artifact.filename,'twothreeD-editable-draft.dae');
assert.equal(standalone.files.length,1);assert.equal(new TextDecoder().decode(standalone.artifact.content),dae);
assert(!dae.includes('<library_images>'));assert(!dae.includes('TEXCOORD'));assert(dae.includes('CC0-1.0'));
for(const source of scene.extensions.twothreeD.model_sources)assert(dae.includes(source.sha256),'Standalone DAE retains credits/hash');
const legacy=convert2DTo3D(await read('examples/floorplan2d.v6.sample.json')).scene;
const legacyTextures=await createExportLabelTextures(legacy,{createCanvas:()=>canvas.createCanvas(512,512)});
rejects(legacy,{mode:'draft'},'E_LABEL_TEXTURE_REQUIRED');
rejects(legacy,{mode:'draft',container:'dae',labelTextures:legacyTextures},'E_EXTERNAL_RESOURCES');
const badLabels=structuredClone(legacy);badLabels.nodes.find(n=>n.semantic.face_labels).semantic.face_labels.pop();
rejects(badLabels,{mode:'draft',labelTextures:legacyTextures},'E_INVALID_LABEL');
assert(export3D(legacy,{mode:'draft',labelTextures:legacyTextures}).success,'Legacy labels can still export complete ZIP');
await write('outputs/sketchup/'+standalone.artifact.filename,standalone.artifact.content);
assert.throws(()=>zipFiles([{path:'../escape',content:'bad'}]));assert.throws(()=>zipFiles([{path:'a',content:'a'},{path:'a',content:'b'}]));
const fixturePlan=await read('examples/floorplan2d.sample.json');
fixturePlan.levels[0].walls[0].height_mm=2800; // Independent exporter acceptance dimensions; app default remains 2500.
const fixture=convert2DTo3D(fixturePlan).scene;
assert(fixture);const plain=export3D(fixture,{createdAt});assert(plain.success,JSON.stringify(plain.diagnostics));
const escaped=structuredClone(fixture);escaped.nodes[0].name='牆 & <門> "測試"';assert(export3D(escaped,{createdAt}).success);
for(const [name,value]of Object.entries({'actual':output,'fixture':plain})){
  await write('outputs/sketchup/'+name+'/'+value.artifact.filename,value.artifact.content);
  for(const file of value.files)await write('outputs/sketchup/'+name+'/'+file.path,file.content);
}
await write('outputs/sketchup/fixture/scene3d.json',JSON.stringify(fixture));
await write('outputs/sketchup/twothreeD-editable-draft.zip',output.artifact.content);
for(const file of output.files)await write('outputs/sketchup/'+file.path,file.content);
await write('outputs/sketchup/export-summary.json',JSON.stringify(output.summary,null,2)+'\n');
console.log('PASS: DAE draft/validated export, 69 object groups, 440 meshes, no external images, materials/credits, CRC-checked ZIP, immutable deterministic output, invalid hierarchy/geometry/material/label rejection. ZIP bytes:',output.artifact.content.length);
