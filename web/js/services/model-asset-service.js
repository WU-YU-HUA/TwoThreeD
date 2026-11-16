// Model source lookup only. Extraction, Transfer and Preview remain independent.
// Obtaining an asset does not make its dimensions, placement or export confirmed.
const publicRoot=new URL('../../',import.meta.url);
export function validateModelAssets(catalog){
  if(catalog?.schema!=='ModelAssetCatalog'||catalog.schema_version!=='1.0.0'||!Array.isArray(catalog.assets)||!Array.isArray(catalog.types))throw new Error('模型來源表格式無效。');
  const ids=new Set(),types=new Set();
  for(const asset of catalog.assets){
    const provenance=asset.source_kind==='generated'
      ?asset.status==='generated'&&asset.source_url==='assets/models/generated/SOURCES.txt'&&asset.local_uri.startsWith('assets/models/generated/')&&asset.generation?.script==='scripts/generate-model-assets.mjs'&&asset.generation?.version==='1.0.0'
      :asset.status==='downloaded'&&/^https:\/\//.test(asset.source_url);
    if(!asset.id||ids.has(asset.id)||asset.format!=='glb'||!provenance||!/^assets\/models\/[A-Za-z0-9_/-]+\.glb$/.test(asset.local_uri)||asset.local_uri.includes('..')||asset.license!=='CC0-1.0'||!asset.author||!asset.attribution_text||!Number.isInteger(asset.bytes)||asset.bytes<=0||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('模型來源、授權、檔案路徑或校驗資料無效。');
    ids.add(asset.id);
  }
  for(const type of catalog.types){
    if(!type.type_id||types.has(type.type_id)||!['category_match','generic','variant_review','missing'].includes(type.match)||typeof type.runtime_enabled!=='boolean'||(type.asset_id===null?type.match!=='missing':!ids.has(type.asset_id)||type.match==='missing'))throw new Error('物件對應到無效的模型來源。');
    if(type.placement_variants&&(type.type_id!=='water_dispenser'||Object.keys(type.placement_variants).some(k=>k!=='on_support')||!ids.has(type.placement_variants.on_support)))throw new Error('模型放置款式參照無效。');
    if(type.dimension_policy!==undefined&&(type.dimension_policy!=='explicit_wdh'||!['whiteboard','electronic_whiteboard'].includes(type.type_id)))throw new Error('模型尺寸標示策略無效。');
    types.add(type.type_id);
  }
  return catalog;
}
export async function loadModelAssets({fetchImpl=fetch}={}){
  const response=await fetchImpl(new URL('config/model-assets.json',publicRoot));
  if(!response.ok)throw new Error('無法讀取模型來源表。');
  return validateModelAssets(await response.json());
}
export function getModelAsset(catalog,typeId,{placement='floor'}={}){
  validateModelAssets(catalog);
  if(!['floor','on_support'].includes(placement))throw new Error('模型放置方式無效。');
  const mapping=catalog.types.find(t=>t.type_id===typeId);
  if(!mapping)throw new Error('物件類型不在模型來源表中：'+typeId);
  const assetId=placement==='on_support'?(mapping.placement_variants?.on_support??mapping.asset_id):mapping.asset_id;
  const asset=assetId===null?null:catalog.assets.find(a=>a.id===assetId);
  return {mapping:structuredClone(mapping),asset:asset?structuredClone(asset):null,
    modelUrl:asset?new URL(asset.local_uri,publicRoot).href:null,
    citation:asset?.attribution_text||null};
}
export function getModelCredits(catalog,typeIds){
  const references=typeIds.map(typeId=>getModelAsset(catalog,typeId));
  return [...new Map(references.filter(r=>r.asset).map(r=>[r.asset.id,{asset_id:r.asset.id,author:r.asset.author,license:r.asset.license,license_url:r.asset.license_url,source_url:r.asset.source_url,text:r.citation}])).values()];
}
