// Source-independent selection/measurement. No binary assets or rendering here.
import {migrateFloorPlanV6ToV7} from '../contracts/migrations.js';
import {validateModelAssets} from '../services/model-asset-service.js';
import {parseBoardDimensions} from './board-dimensions.js';
import {MODEL_DEFAULTS} from '../contracts/model-defaults.js';

export function applyModelSources(input,catalog){
  validateModelAssets(catalog);
  const plan=migrateFloorPlanV6ToV7(input),types=new Map(catalog.types.map(t=>[t.type_id,t]));
  const assets=new Map(catalog.assets.map(a=>[a.id,a]));
  for(const level of plan.levels){
    const original=new Map(level.furniture.map(o=>[o.id,o]));
    level.furniture=level.furniture.map(o=>{
      if(!['placeholder','cabinet','tall_cabinet'].includes(o.kind))return o;
      const typeId=o.catalog_type_id||(o.kind==='tall_cabinet'?'tall_cabinet':null),mapping=types.get(typeId);
      // Support IDs already come from the measured table/cabinet relationship.
      // Preserve bad references for Transfer to reject; never silently drop to floor.
      const onSupport=o.support_id!==null&&o.support_id!==undefined;
      const selectedId=onSupport?(mapping?.placement_variants?.on_support??mapping?.asset_id):mapping?.asset_id,asset=assets.get(selectedId);
      if(!catalog.runtime_enabled||!mapping?.runtime_enabled||!asset||o.quantity>1){
        if(o.kind==='placeholder')plan.diagnostics.push({severity:'warning',code:'W_MODEL_FALLBACK',element_id:o.id,message:`「${o.name}」保留標名方塊：${o.quantity>1?'整組設備尚未拆分個別位置':mapping?.notes||'尚無對應模型'}。`});
        return o;
      }
      if(mapping.dimension_policy==='explicit_wdh'){
        const labelled=o.extensions?.labelled_dimensions,dimensions=parseBoardDimensions(labelled?.text);
        if(!dimensions||['width_mm','depth_mm','height_mm'].some(k=>dimensions[k]!==labelled[k])){
          plan.diagnostics.push({severity:'warning',code:'W_MODEL_DIMENSIONS_REQUIRED',element_id:o.id,message:`「${o.name}」需要可明確配對且含單位的 W／D／H 尺寸，暫保留標名方塊。`});return o;
        }
        const [x,y]=o.position_mm,w=dimensions.width_mm,d=dimensions.depth_mm;
        return {id:o.id,name:o.name,kind:'model_object',role:'equipment',asset_id:asset.id,catalog_type_id:typeId,fit_mode:'equipment_dimensions',position_mm:[x,y],rotation_deg:0,width_mm:w,depth_mm:d,height_mm:dimensions.height_mm,boundary_mm:[[x-w/2,y-d/2],[x+w/2,y-d/2],[x+w/2,y+d/2],[x-w/2,y+d/2]],holes_mm:[],support_id:o.support_id,confirmed:o.confirmed,confidence:o.confidence,source_refs:structuredClone(o.source_refs),extensions:{dimensions_source:'explicit_wdh_label',labelled_dimensions:structuredClone(dimensions),calibrated_outline_mm:structuredClone(o.boundary_mm),height_source:'explicit_wdh_label',orientation_basis:'drawing_axes_estimate',asset_match:mapping.match,source_template_id:o.template_id}};
      }
      const equipment=o.kind==='placeholder',host=original.get(o.support_id),rotation=equipment?(host?.rotation_deg??0):o.rotation_deg;
      const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[cx,cy]=o.position_mm;
      const boundary=o.boundary_mm||[[-o.width_mm/2,-o.depth_mm/2],[o.width_mm/2,-o.depth_mm/2],[o.width_mm/2,o.depth_mm/2],[-o.width_mm/2,o.depth_mm/2]].map(([x,y])=>[cx+c*x-s*y,cy+s*x+c*y]);
      const local=boundary.map(([x,y])=>[c*(x-cx)+s*(y-cy),-s*(x-cx)+c*(y-cy)]);
      const width=Math.max(...local.map(p=>p[0]))-Math.min(...local.map(p=>p[0])),depth=Math.max(...local.map(p=>p[1]))-Math.min(...local.map(p=>p[1]));
      return {id:o.id,name:o.name,kind:'model_object',role:equipment?'equipment':o.kind,asset_id:asset.id,catalog_type_id:typeId,
        fit_mode:equipment?'uniform_footprint':'cabinet_dimensions',position_mm:[...o.position_mm],rotation_deg:rotation,
        width_mm:width,depth_mm:depth,height_mm:equipment?null:o.height_mm,boundary_mm:structuredClone(boundary),holes_mm:structuredClone(o.holes_mm||[]),support_id:equipment?o.support_id:null,
        confirmed:o.confirmed,confidence:o.confidence,source_refs:structuredClone(o.source_refs),
        extensions:{dimensions_source:'calibrated_object_outline',height_source:equipment?'asset_uniform_scale':o.extensions?.height_source||'user_default',orientation_basis:equipment?(host?.rotation_deg!==undefined?'support_orientation_estimate':'drawing_axes_estimate'):'source_cabinet_orientation_estimate',asset_match:mapping.match,source_template_id:o.template_id,...(mapping.placement_variants?{placement_variant:onSupport?'on_support':'floor',placement_basis:'extracted_support_id'}:{})}};
    });
  }
  plan.extensions={...plan.extensions,model_sizing:{method:'own_footprint',equipment_fit:'uniform_contain',cabinet_fit:'measured_width_depth_user_height',clearance_factor:1}};
  if(plan.levels.some(l=>l.furniture.some(o=>o.fit_mode==='equipment_dimensions'))){plan.schema_version='8.0.0';plan.extensions.model_sizing.labelled_equipment_fit='explicit_wdh';}
  const markers=plan.levels.flatMap(l=>l.furniture).filter(o=>o.kind==='placeholder');
  if(markers.length){
    plan.schema_version='8.0.0';
    for(const marker of markers){marker.template_id='builtin.marker_cube.v1';marker.extensions={...marker.extensions,appearance:'red_unlabelled_cube'};}
    const materialIds=new Set(markers.map(o=>o.material_id));
    plan.materials=plan.materials.map(m=>materialIds.has(m.id)?{...m,name:'缺少模型的紅色方塊',color_rgba:[...MODEL_DEFAULTS.missing_model_color_rgba]}:m);
    plan.diagnostics=plan.diagnostics.map(d=>({...d,message:d.message.replaceAll('標名方塊','紅色方塊')}));
  }
  plan.diagnostics=plan.diagnostics.map(d=>d.code==='E_UNRESOLVED_ELEMENT'?{...d,message:'椅子與桌子採簡化模板；可用外部模型依物件框線比例配置。缺項及款式待核對者保留紅色方塊，方塊不是實物尺寸；門框、過樑、窗、地板及其他未辨識物件仍待補齊。'}:d);
  return plan;
}
