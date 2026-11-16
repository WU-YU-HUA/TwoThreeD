// Appearance only: portable Scene3D materials, never source geometry or a renderer.
const storageKey='twothreeD.model-colors.v1';
export function normalizeHex(value){
  if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value.trim()))throw new Error('請輸入六位 HEX 色碼，例如 #3A7CA5。');
  return value.trim().toUpperCase();
}
export function hexToLinearRgba(hex){
  const text=normalizeHex(hex),linear=n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4;
  return [1,3,5].map(i=>linear(parseInt(text.slice(i,i+2),16)/255)).concat(1);
}
export function validateAppearanceProfiles(data){
  if(data?.version!=='1.0.0'||!Array.isArray(data.profiles))throw new Error('模型配色設定格式無效。');
  const ids=new Set();
  for(const p of data.profiles){
    if(!/^twothreeD\.generated\.[a-z_]+$/.test(p.asset_id)||ids.has(p.asset_id)||!p.name||!p.region||!Array.isArray(p.part_names)||!p.part_names.length||p.part_names.some(n=>typeof n!=='string'||!n))throw new Error('模型配色範圍無效。');
    normalizeHex(p.default_hex);ids.add(p.asset_id);
  }
  return data.profiles;
}
export async function loadAppearanceProfiles({fetchImpl=fetch}={}){
  const response=await fetchImpl(new URL('../../config/model-appearance.json',import.meta.url));
  if(!response.ok)throw new Error('無法讀取模型配色設定。');return validateAppearanceProfiles(await response.json());
}
export function readModelColors(profiles,storage){
  try{
    const data=JSON.parse((storage??globalThis.localStorage)?.getItem(storageKey)||'{}'),result={};
    for(const p of profiles)if(data[p.asset_id]!==undefined){try{result[p.asset_id]=normalizeHex(data[p.asset_id]);}catch{}}
    return result;
  }catch{return {};}
}
export function saveModelColors(colors,storage){
  const normalized=Object.fromEntries(Object.entries(colors).map(([id,hex])=>[id,normalizeHex(hex)]));
  try{const target=storage??globalThis.localStorage;if(!target)return false;target.setItem(storageKey,JSON.stringify(normalized));return true;}catch{return false;}
}
export function isModelColorStorageEvent(event){return event.key===storageKey||event.key===null;}
export function applyModelColors(source,profiles,colors){
  const result=structuredClone(source),byAsset=new Map(profiles.map(p=>[p.asset_id,p])),materials=new Map(result.materials.map(m=>[m.id,m])),applied={};
  for(const [id,hex]of Object.entries(colors)){if(!byAsset.has(id))throw new Error('模型尚未定義可改色範圍：'+id);normalizeHex(hex);}
  for(const node of result.nodes){
    if(!node.mesh)continue;
    const assetId=node.semantic?.asset_id||source.extensions?.model_asset?.id,profile=byAsset.get(assetId),hex=colors[assetId];
    if(!profile||!hex||!profile.part_names.some(name=>node.name===name||node.name.endsWith(' / '+name)))continue;
    for(const face of node.mesh.faces){
      const original=materials.get(face.material_id);if(!original)throw new Error('配色物件的材質不存在。');
      const id=original.id+'__body_color';
      if(!materials.has(id)){const color={id,name:profile.name+' '+profile.region+' '+normalizeHex(hex),color_rgba:[...hexToLinearRgba(hex).slice(0,3),original.color_rgba[3]]};materials.set(id,color);result.materials.push(color);}
      face.material_id=id;
    }
    applied[assetId]={hex:normalizeHex(hex),region:profile.region,part_names:[...profile.part_names]};
  }
  if(Object.keys(applied).length){result.extensions={...result.extensions,twothreeD:{...result.extensions?.twothreeD,model_colors:applied}};}
  return result;
}
