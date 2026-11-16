// Shared configuration and name rules. No PDF, renderer or exporter types.
export function validateObjectCatalog(catalog){
  if(catalog?.units!=='mm'||!Array.isArray(catalog.types)||!catalog.types.length||!Array.isArray(catalog.models)||!catalog.classification?.cabinet_keyword?.contains_any?.length)throw new Error('物件對應表格式無效。');
  const ids=new Set();
  for(const t of catalog.types){
    if(!/^[a-zA-Z0-9_.:-]+$/.test(t.id||'')||ids.has(t.id)||!Array.isArray(t.aliases)||!t.aliases.length||t.aliases.some(a=>typeof a!=='string'||!a.trim())||!['equipment','cabinet','furniture','fixture'].includes(t.category))throw new Error('物件對應表的類型或別名無效。');
    ids.add(t.id);
    if(t.model_id&&(t.category!=='cabinet'||!catalog.models.some(m=>m.id===t.model_id&&m.template_id==='builtin.cabinet.v1')))throw new Error('目前僅支援內建櫃體模型，無法載入指定模型：'+t.model_id);
  }
  for(const key of ['low','tall','general'])if(!Number.isFinite(catalog.cabinet_height_groups?.[key]?.height_mm)||!(catalog.cabinet_height_groups[key].height_mm>0))throw new Error('櫃子預設高度無效。');
  if(!catalog.cabinet_height_policy?.rules?.length||!catalog.cabinet_height_groups[catalog.cabinet_height_policy.fallback_height_group])throw new Error('櫃子高度規則缺失。');
  for(const rule of catalog.cabinet_height_policy?.rules||[])if(!catalog.cabinet_height_groups[rule.height_group]||!rule.contains_any?.length)throw new Error('櫃子高度規則無效。');
  const p=catalog.missing_model_policy;
  if(!Number.isFinite(p?.cube_edge_mm)||!(p.cube_edge_mm>0)||!Number.isFinite(p.hover_offset_mm)||p.hover_offset_mm<0||new Set(p.label_faces).size!==6)throw new Error('請先設定佔位方塊大小、浮高與六面文字。');
  if(!ids.has(catalog.classification.cabinet_keyword.fallback_type_id)||(catalog.scene_categories||[]).some(s=>s.type_ids.some(id=>!ids.has(id))))throw new Error('物件分類參照不存在的類型。');
  if(catalog.ignored_object_labels&&!catalog.ignored_object_labels.every(s=>typeof s==='string'&&s.trim()))throw new Error('忽略物件名稱設定無效。');
  return catalog;
}
export async function loadObjectCatalog(){
  const response=await fetch(new URL('../../config/object-catalog.json',import.meta.url));
  if(!response.ok)throw new Error('物件對應表載入失敗。');
  return validateObjectCatalog(await response.json());
}
export const normalizeObjectName=name=>name.normalize('NFKC').replace(/\s+/g,'').trim();
export const isIgnoredObjectName=(name,catalog)=>(catalog.ignored_object_labels||[]).some(label=>normalizeObjectName(label).toUpperCase()===normalizeObjectName(name).toUpperCase());
export function classifyObjectName(name,catalog){
  const normalized=normalizeObjectName(name),cabinet=catalog.classification.cabinet_keyword.contains_any.some(k=>normalized.includes(k));
  const matches=catalog.types.filter(t=>!cabinet||t.category==='cabinet').flatMap(t=>t.aliases.filter(a=>normalized.includes(normalizeObjectName(a))).map(a=>({type:t,length:normalizeObjectName(a).length}))).sort((a,b)=>b.length-a.length||a.type.id.localeCompare(b.type.id,'en'));
  const type=matches[0]?.type||(cabinet?catalog.types.find(t=>t.id===catalog.classification.cabinet_keyword.fallback_type_id):null);
  if(!type)return null;
  const policy=catalog.cabinet_height_policy,group=cabinet?(policy.rules.find(r=>r.contains_any.some(k=>normalized.includes(k)))?.height_group||policy.fallback_height_group):null;
  return {type_id:type.id,category:type.category,name,model_id:type.model_id,height_group:group,height_mm:group?catalog.cabinet_height_groups[group].height_mm:type.height_mm};
}
