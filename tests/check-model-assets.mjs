import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {validateModelAssets,loadModelAssets,getModelAsset,getModelCredits} from '../web/js/services/model-asset-service.js';
const catalog=JSON.parse(await fs.readFile('web/config/model-assets.json'));
const objects=JSON.parse(await fs.readFile('web/config/object-catalog.json'));
assert.equal(validateModelAssets(catalog),catalog);assert.equal(catalog.assets.length,52);assert.equal(catalog.types.length,54);
assert.equal(catalog.assets.filter(a=>a.source_kind==='generated').length,6);
assert.deepEqual(catalog.types.map(t=>t.type_id).sort(),objects.types.map(t=>t.id).sort());
assert.deepEqual(objects.asset_sources,{catalog_uri:'model-assets.json',purpose:'preview_asset_selection',runtime_selection_enabled:true});
for(const type of objects.types){
  const mapping=catalog.types.find(t=>t.type_id===type.id);
  assert.equal(type.reference_asset_id,mapping.asset_id,'Object references resolve to the curated source');
  assert.equal(type.model_id,mapping.active_model_id,'Source acquisition preserves current template selection');
}
assert.deepEqual(catalog.types.filter(t=>!t.asset_id),[]);
assert.equal(catalog.types.filter(t=>t.runtime_enabled).length,43);
assert(catalog.types.filter(t=>t.runtime_enabled).every(t=>['category_match','generic'].includes(t.match)&&catalog.assets.find(a=>a.id===t.asset_id).embedded_image_count===0),'Only supported, matching assets may be selected');
assert.equal(catalog.runtime_enabled,true);
const total={bytes:0,meshes:0,ai_declared:0};
for(const asset of catalog.assets){
  const bytes=await fs.readFile('web/'+asset.local_uri);
  assert.equal(bytes.length,asset.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n));
  assert.equal(doc.asset.version,'2.0');assert(doc.meshes.length>0);assert.equal(doc.meshes.length,asset.mesh_count);
  for(const resource of [...doc.buffers,...(doc.images||[])])assert.equal(resource.uri,undefined,'Every model is self-contained');
  assert.equal(asset.license,'CC0-1.0');assert.equal(asset.attribution_required,false);assert(asset.attribution_text.includes(asset.author));assert(asset.attribution_text.includes(asset.source_url));
  assert(asset.inspection.triangles>0);assert(Object.values(asset.inspection.dimensions_mm).every(v=>v>0&&Number.isFinite(v)));
  if(asset.provider_stats)assert.equal(asset.inspection.unique_mesh_triangles,asset.provider_stats.triangles,'Unique geometry matches provider metadata; repeated mesh instances are counted separately');
  total.bytes+=bytes.length;total.meshes+=asset.mesh_count;total.ai_declared+=asset.ai_generated===true?1:0;
}
const before=JSON.stringify(catalog),ref=getModelAsset(catalog,'printer');
assert(ref.modelUrl.endsWith(ref.asset.local_uri));assert.equal(ref.mapping.match,'category_match');assert(ref.citation.includes('CC0'));
assert(getModelAsset(catalog,'dish_dryer').modelUrl.endsWith('/generated/dish_dryer.glb'));assert.equal(getModelAsset(catalog,'water_dispenser').mapping.match,'category_match');
assert.equal(getModelCredits(catalog,['workbench','prep_table','dish_dryer']).length,2,'Shared models have one citation; original models retain their own');
ref.asset.name='changed';ref.mapping.notes='changed';assert.equal(JSON.stringify(catalog),before,'Lookup cannot mutate catalog');
assert.throws(()=>getModelAsset(catalog,'not_in_catalog'));
for(const edit of [c=>c.assets[0].local_uri='../../outside.glb',c=>c.assets[0].license='unknown',c=>c.assets[0].sha256='bad',c=>c.types[0].asset_id='missing',c=>c.assets.push(c.assets[0]),c=>c.types.push(c.types[0])]){const copy=structuredClone(catalog);edit(copy);assert.throws(()=>validateModelAssets(copy));}
let requested;
assert.deepEqual(await loadModelAssets({fetchImpl:async url=>{requested=String(url);return{ok:true,json:async()=>structuredClone(catalog)};}}),catalog);assert(requested.endsWith('/config/model-assets.json'));
await assert.rejects(loadModelAssets({fetchImpl:async()=>({ok:false})}));
console.log('PASS: 54 type references, 46 external + 6 original CC0 GLBs, hashes, buffers, native geometry, source credits, immutable lookup and failure cases.',JSON.stringify(total));
