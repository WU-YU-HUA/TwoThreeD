import {fitModel,modelObjectIssue,surfaceIssue} from '../geometry/model-fitting.js';
import {placeholderIssue,buildPlaceholder} from '../geometry/placeholder-template.js';
// Stage 3: FloorPlan2D -> Scene3D + TransferReport. No file format or UI dependencies.
import { validateFloorPlan, validateFloorPlanV2, validateFloorPlanV3, validateFloorPlanV4, validateFloorPlanV5, validateFloorPlanV6, validateFloorPlanV7, validateFloorPlanV8, validateScene3D, validateProfile, validateReport, validateReportV2, validateReportV3, validateReportV4, validateReportV5, validateReportV6, validateReportV7, validateReportV8 } from '../contracts/validators.generated.js';
import { EPS, polygonIssue, extrudePolygon, wallBox, meshIssue } from '../geometry/model-geometry.js';
import {doorIssue,doorCollision} from '../geometry/door-geometry.js';
import {furnitureIssue,buildFurnitureParts,FURNITURE_TEMPLATES} from '../geometry/furniture-templates.js';

export function convert2DTo3D(plan, options = {}, modelScenes = {}) {
  const profile={schema:'TransferProfile',schema_version:'1.0.0',mode:'strict',wall_join_policy:'butt',...options};
  const v8=plan?.schema_version==='8.0.0',v7=v8||plan?.schema_version==='7.0.0',v6=v7||plan?.schema_version==='6.0.0',v5=v6||plan?.schema_version==='5.0.0',v4=v5||plan?.schema_version==='4.0.0',v3=v4||plan?.schema_version==='3.0.0',v2=v3||plan?.schema_version==='2.0.0',validatePlan=v8?validateFloorPlanV8:v7?validateFloorPlanV7:v6?validateFloorPlanV6:v5?validateFloorPlanV5:v4?validateFloorPlanV4:v3?validateFloorPlanV3:v2?validateFloorPlanV2:validateFloorPlan,validateTransferReport=v8?validateReportV8:v7?validateReportV7:v6?validateReportV6:v5?validateReportV5:v4?validateReportV4:v3?validateReportV3:v2?validateReportV2:validateReport;
  const report={schema:'TransferReport',schema_version:v8?'8.0.0':v7?'7.0.0':v6?'6.0.0':v5?'5.0.0':v4?'4.0.0':v3?'3.0.0':v2?'2.0.0':'1.0.0',status:'failed',mapping:[],diagnostics:[],metrics:{walls:0,openings:0,slabs:0,rooms:0,nodes:0,...(v2?{columns:0}:{}),...(v3?{doors:0}:{}),...(v4?{chairs:0,tall_cabinets:0}:{}),...(v5?{tables:0}:{}),...(v6?{cabinets:0,placeholders:0}:{}),...(v7?{asset_models:0}:{})},preview_only:profile.mode==='preview'};
  const add=(code,message,element_id=null,severity='error')=>report.diagnostics.push({severity,code,message,element_id});
  const failed=()=>({scene:null,report});
  const hasErrors=()=>report.diagnostics.some(d=>d.severity==='error');
  if(plan?.schema!=='FloorPlan2D'){add('E_FLOORPLAN_REQUIRED','需要已整理的 FloorPlan2D，不能直接轉換文字／圖層證據。');return failed();}
  if(!['1.0.0','2.0.0','3.0.0','4.0.0','5.0.0','6.0.0','7.0.0','8.0.0'].includes(plan.schema_version)){add('E_SCHEMA_VERSION','目前支援 FloorPlan2D@1.0.0／2.0.0／3.0.0／4.0.0／5.0.0／6.0.0／7.0.0／8.0.0。');return failed();}
  if(!validateProfile(profile)){add('E_SCHEMA','轉換設定不符合 TransferProfile@1.0.0。');return failed();}
  if(profile.wall_join_policy!=='butt'){add('E_UNSUPPORTED_OPTION','目前僅支援 butt 分段牆角接合。');return failed();}
  if(plan.source?.scale_verified!==true&&profile.mode==='strict'){add('E_SCALE_UNVERIFIED','比例尚未確認，不能正式轉換。');return failed();}
  if(!validatePlan(plan)){add('E_SCHEMA','2D 資料格式無效：'+validatePlan.errors.slice(0,3).map(e=>`${e.instancePath} ${e.message}`).join('；'));return failed();}
  const matrix=plan.source.source_to_model_3x3;
  if(!matrix||Math.abs(matrix[0]*matrix[4]-matrix[1]*matrix[3])<EPS||matrix[6]!==0||matrix[7]!==0||matrix[8]!==1){add('E_SCALE_UNVERIFIED','缺少有效的來源到毫米比例；預覽也不能猜測紙張點數等於毫米。');return failed();}
  if(!plan.source.scale_verified)add('W_SCALE_UNVERIFIED','目前依使用者指定的參考牆厚換算比例；參考牆的邊線配對仍待核對。',null,'warning');
  const ids=new Set(),materials=new Set(plan.materials.map(m=>m.id));
  const unique=object=>{if(ids.has(object.id))add('E_DUPLICATE_ID','重複的 ID：'+object.id,object.id);ids.add(object.id);};
  plan.materials.forEach(unique);
  const review=object=>{unique(object);if(!object.confirmed)add(profile.mode==='preview'?'W_UNCONFIRMED_ELEMENT':'E_UNCONFIRMED_ELEMENT','物件尚待人工核對。',object.id,profile.mode==='preview'?'warning':'error');};
  for(const diagnostic of plan.diagnostics){
    const d=structuredClone(diagnostic);
    if(profile.mode==='preview'&&d.code==='E_UNRESOLVED_ELEMENT'){d.code='W_UNRESOLVED_ELEMENT';d.severity='warning';}
    report.diagnostics.push(d);
  }
  for(const level of plan.levels){
    unique(level);const walls=new Map(level.walls.map(w=>[w.id,w]));
    for(const wall of level.walls){
      review(wall);
      if(wall.representation==='footprint'){
        const issue=polygonIssue(wall.boundary_mm,wall.holes_mm);if(issue)add('E_INVALID_POLYGON',issue,wall.id);
      }else if(Math.hypot(wall.end_mm[0]-wall.start_mm[0],wall.end_mm[1]-wall.start_mm[1])<EPS)add('E_WALL_ZERO_LENGTH','牆中心線長度不可為零。',wall.id);
      if(!materials.has(wall.material_id))add('E_MATERIAL_MISSING','牆面材質不存在。',wall.id);
    }
    for(const column of level.columns||[]){
      review(column);const issue=polygonIssue(column.boundary_mm,column.holes_mm);
      if(issue)add('E_INVALID_POLYGON',issue,column.id);
      if(!materials.has(column.material_id))add('E_MATERIAL_MISSING','柱體材質不存在。',column.id);
    }
    for(const door of level.doors||[]){
      review(door);const issue=doorIssue(door);if(issue)add('E_INVALID_DOOR',issue,door.id);
      if(!materials.has(door.material_id))add('E_MATERIAL_MISSING','門片材質不存在。',door.id);
    }
    for(const object of level.furniture||[]){
      review(object);if(object.kind==='model_object'){const issue=modelObjectIssue(object,level);if(issue)add('E_INVALID_FURNITURE',issue,object.id);if(!modelScenes[object.asset_id])add('E_MODEL_ASSET_MISSING','缺少已載入的模型幾何。',object.id);if(profile.mode==='strict')add('E_ASSET_PREVIEW_ONLY','外部模型尚未完成正式匯出驗收。',object.id);continue;}const issue=object.kind==='placeholder'?placeholderIssue(object,level):furnitureIssue(object);if(issue)add('E_INVALID_FURNITURE',issue,object.id);
      if(!materials.has(object.material_id)||(object.kind!=='placeholder'&&!materials.has(object.accent_material_id)))add('E_MATERIAL_MISSING','家具的主體或配件材質不存在。',object.id);
    }
    for(const opening of level.openings){
      review(opening);const wall=walls.get(opening.wall_id);
      if(!wall){add('E_WALL_MISSING','開口沒有同樓層的對應牆。',opening.id);continue;}
      if(wall.representation==='footprint'){add('E_OPENING_WALL_REPRESENTATION','多邊形牆的開口定位尚未支援，不能略過門窗直接填滿。',opening.id);continue;}
      const length=Math.hypot(wall.end_mm[0]-wall.start_mm[0],wall.end_mm[1]-wall.start_mm[1]);
      if(opening.offset_from_start_mm+opening.width_mm>length+EPS||opening.sill_height_mm+opening.height_mm>wall.height_mm+EPS)add('E_OPENING_OUT_OF_BOUNDS','開口超出牆體範圍。',opening.id);
    }
    for(let i=0;i<level.openings.length;i++)for(let j=0;j<i;j++){
      const a=level.openings[i],b=level.openings[j];if(a.wall_id!==b.wall_id)continue;
      if(Math.min(a.offset_from_start_mm+a.width_mm,b.offset_from_start_mm+b.width_mm)-Math.max(a.offset_from_start_mm,b.offset_from_start_mm)>EPS&&Math.min(a.sill_height_mm+a.height_mm,b.sill_height_mm+b.height_mm)-Math.max(a.sill_height_mm,b.sill_height_mm)>EPS)add('E_OPENING_OVERLAP','同一面牆上的開口互相重疊。',a.id);
    }
    for(const object of [...level.slabs,...level.rooms]){
      review(object);const issue=polygonIssue(object.boundary_mm,object.holes_mm);
      if(issue)add('E_INVALID_POLYGON',issue,object.id);
      if(object.material_id&&!materials.has(object.material_id))add('E_MATERIAL_MISSING','地板材質不存在。',object.id);
    }
  }
  if(hasErrors())return failed();
  for(const level of plan.levels)for(const door of level.doors||[]){
    const collision=doorCollision(door,level);
    if(collision)add('E_DOOR_BLOCKED','門片開啟或關閉位置與牆柱重疊，須先處理真實開口：'+collision,door.id);
  }
  if(hasErrors())return failed();
  const nodes=[],outputMaterials=structuredClone(plan.materials),assetCredits=new Map(),mapping=new Map(),sort=items=>[...items].sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const record=(source,nodeId,method)=>{let entry=mapping.get(source);if(!entry){entry={source_2d_id:source,generated_node_ids:[],method};mapping.set(source,entry);}if(!entry.generated_node_ids.includes(nodeId))entry.generated_node_ids.push(nodeId);};
  const group=(id,name,parent_id,source_2d_ids,semantic)=>{nodes.push({id,name,kind:'group',parent_id,source_2d_ids,mesh:null,semantic,editable:true});};
  const solid=(id,name,parent_id,source_2d_ids,mesh,semantic)=>{const issue=meshIssue(mesh);if(issue)throw new Error(issue);nodes.push({id,name,kind:'mesh',parent_id,source_2d_ids,mesh,semantic,editable:true});};
  const footprint=(object,category,level,parent)=>{
    const groupId=category+'_'+object.id,solidId='solid_'+object.id,sources=[object.id];
    const semantic={category,[category+'_id']:object.id,representation:'footprint',height_mm:object.height_mm,...(category==='door'?{kind:object.kind,placement:object.placement,hinge_mm:[...object.hinge_mm],closed_end_mm:[...object.closed_end_mm]}:{})};
    group(groupId,object.name||object.id,parent,sources,semantic);
    solid(solidId,object.name||object.id,groupId,sources,extrudePolygon(object.boundary_mm,object.holes_mm||[],level.base_elevation_mm,level.base_elevation_mm+object.height_mm,object.material_id),{...semantic,category:category==='door'?'door_leaf':category+'_solid'});
    record(object.id,groupId,'solid');record(object.id,solidId,'solid');
  };
  try{
    for(const level of sort(plan.levels)){
      const levelNode='level_'+level.id;
      group(levelNode,level.name||level.id,null,[level.id],{category:'level',base_elevation_mm:level.base_elevation_mm});
      record(level.id,levelNode,'group');
      for(const wall of sort(level.walls)){
        if(wall.representation==='footprint'){footprint(wall,'wall',level,levelNode);report.metrics.walls++;continue;}
        const openings=sort(level.openings.filter(o=>o.wall_id===wall.id)),wallNode='wall_'+wall.id;
        const sources=[wall.id,...openings.map(o=>o.id)],length=Math.hypot(wall.end_mm[0]-wall.start_mm[0],wall.end_mm[1]-wall.start_mm[1]);
        group(wallNode,wall.name||wall.id,levelNode,sources,{category:'wall',wall_id:wall.id,thickness_mm:wall.thickness_mm,height_mm:wall.height_mm,opening_ids:openings.map(o=>o.id)});
        record(wall.id,wallNode,'solid');for(const opening of openings)record(opening.id,wallNode,'cut');
        const xs=[...new Set([0,length,...openings.flatMap(o=>[o.offset_from_start_mm,o.offset_from_start_mm+o.width_mm])])].sort((a,b)=>a-b);
        for(let i=0;i<xs.length-1;i++){
          const x0=xs[i],x1=xs[i+1],mid=(x0+x1)/2;if(x1-x0<EPS)continue;
          const cuts=openings.filter(o=>mid>o.offset_from_start_mm&&mid<o.offset_from_start_mm+o.width_mm).sort((a,b)=>a.sill_height_mm-b.sill_height_mm);
          let z=0;const spans=[];
          for(const opening of cuts){if(opening.sill_height_mm-z>EPS)spans.push([z,opening.sill_height_mm]);z=opening.sill_height_mm+opening.height_mm;}
          if(wall.height_mm-z>EPS)spans.push([z,wall.height_mm]);
          for(const [j,[z0,z1]]of spans.entries()){
            const nodeId=`solid_${wall.id}_${i}_${j}`;
            solid(nodeId,(wall.name||wall.id)+` 區段 ${i+1}.${j+1}`,wallNode,sources,wallBox(wall,level.base_elevation_mm,x0,x1,z0,z1),{category:'wall_segment',wall_id:wall.id,opening_ids:openings.map(o=>o.id)});
            record(wall.id,nodeId,'solid');for(const opening of openings)record(opening.id,nodeId,'cut');
          }
        }
        report.metrics.walls++;report.metrics.openings+=openings.length;
      }
      for(const column of sort(level.columns||[])){footprint(column,'column',level,levelNode);report.metrics.columns++;}
      for(const door of sort(level.doors||[])){footprint(door,'door',level,levelNode);report.metrics.doors++;}
      for(const object of sort(level.furniture||[])){
        const id='furniture_'+object.id,sources=[object.id];
        if(object.kind==='model_object'){
          const assetScene=modelScenes[object.asset_id],built=fitModel(object,level,assetScene),asset=assetScene.extensions.model_asset;
          for(const material of built.materials){const old=outputMaterials.find(m=>m.id===material.id);if(old&&JSON.stringify(old)!==JSON.stringify(material))throw new Error('模型材質 ID 衝突。');if(!old)outputMaterials.push(structuredClone(material));}
          const semantic={category:'model_object',role:object.role,asset_id:object.asset_id,catalog_type_id:object.catalog_type_id,support_id:object.support_id,fit_mode:object.fit_mode,rotation_deg:object.rotation_deg,target_width_mm:object.width_mm,target_depth_mm:object.depth_mm,dimensions_mm:built.dimensions_mm,scale:built.scale,bottom_mm:built.bottom_mm,dimensions_source:object.fit_mode==='equipment_dimensions'?'explicit_wdh_label':'calibrated_object_outline',orientation_confirmed:false,citation:asset.citation};
          group(id,object.name||object.id,levelNode,sources,semantic);record(object.id,id,'solid');
          for(const part of built.parts){const nodeId='solid_'+object.id+'_'+part.id,issue=surfaceIssue(part.mesh);if(issue)throw new Error(issue);nodes.push({id:nodeId,name:(object.name||object.id)+' / '+part.name,kind:'mesh',parent_id:id,source_2d_ids:sources,mesh:part.mesh,semantic:{category:'asset_surface',asset_id:object.asset_id,role:object.role},editable:true});record(object.id,nodeId,'solid');}
          assetCredits.set(asset.id,structuredClone(asset));report.metrics.asset_models++;
          if(object.role!=='equipment')report.metrics[object.role==='cabinet'?'cabinets':'tall_cabinets']++;
          if(built.overhang)add('W_MODEL_SUPPORT_OVERHANG','「'+object.name+'」的模型輪廓超出承載檯面或跨越孔洞，保留圖面位置待核對。',object.id,'warning');
          continue;
        }
        if(object.kind==='placeholder'){
          const built=buildPlaceholder(object,level),nodeId='solid_'+object.id+'_cube';
          const semantic={category:'equipment_placeholder',catalog_type_id:object.catalog_type_id,support_id:object.support_id,quantity:object.quantity,cube_edge_mm:object.cube_edge_mm,hover_mm:object.hover_mm,representation:'symbolic_cube',label_text:object.label_text};
          group(id,object.name||object.label_text,levelNode,sources,semantic);record(object.id,id,'solid');
          solid(nodeId,object.label_text,id,sources,built.mesh,{...semantic,...(built.face_labels?{face_labels:built.face_labels}:{label_mode:'none'})});record(object.id,nodeId,'solid');report.metrics.placeholders++;continue;
        }
        group(id,object.name||object.id,levelNode,sources,{category:'furniture',kind:object.kind,template_id:object.template_id,asset_source:FURNITURE_TEMPLATES[object.template_id].source,height_mm:object.height_mm,...(object.kind==='table'?{top_thickness_mm:object.top_thickness_mm}:{rotation_deg:object.rotation_deg})});record(object.id,id,'solid');
        for(const part of buildFurnitureParts(object,level.base_elevation_mm)){
          const nodeId=`solid_${object.id}_${part.id}`;
          solid(nodeId,(object.name||object.id)+' / '+part.id,id,sources,part.mesh,{category:'furniture_part',kind:object.kind,part:part.id,template_id:object.template_id});record(object.id,nodeId,'solid');
        }
        report.metrics[object.kind==='chair'?'chairs':object.kind==='table'?'tables':object.kind==='cabinet'?'cabinets':'tall_cabinets']++;
      }
      for(const slab of sort(level.slabs)){
        const id='slab_'+slab.id,top=level.base_elevation_mm+slab.top_elevation_mm;
        solid(id,slab.name||slab.id,levelNode,[slab.id],extrudePolygon(slab.boundary_mm,slab.holes_mm,top-slab.thickness_mm,top,slab.material_id),{category:'slab',slab_id:slab.id,thickness_mm:slab.thickness_mm});record(slab.id,id,'solid');report.metrics.slabs++;
      }
      for(const room of sort(level.rooms)){const id='room_'+room.id;group(id,room.name||room.id,levelNode,[room.id],{category:'room'});record(room.id,id,'derived');report.metrics.rooms++;}
    }
  }catch(error){add('E_INVALID_GEOMETRY',error.message);return failed();}
  if(!nodes.some(n=>n.mesh)){add('E_EMPTY_MODEL','沒有可轉換的牆體、柱體或地板。');return failed();}
  if(report.metrics.walls>1)add('W_BUTT_JOINS','牆體以獨立分段接合；牆角接縫與重疊面仍需核對。',null,'warning');
  if(assetCredits.size)add('W_ASSET_PREVIEW','外部模型依自身外框估算尺寸，方向與款式仍待核對；使用來源預設姿態與簡化純色材質。',null,'warning');
  report.mapping=[...mapping.values()].sort((a,b)=>a.source_2d_id.localeCompare(b.source_2d_id,'en'));
  report.metrics.nodes=nodes.length;report.status='success';
  const scene={schema:'Scene3D',schema_version:'1.0.0',units:'mm',materials:structuredClone(sort(outputMaterials)),nodes,extensions:{twothreeD:{preview_only:report.preview_only,source_filename:plan.source.filename,source_sha256:plan.source.sha256||null,scope:plan.extensions?.twothreeD?.scope||'confirmed_model',...(assetCredits.size?{model_sources:[...assetCredits.values()]}:{})}}};
  if(!validateScene3D(scene)||!validateTransferReport(report)){report.status='failed';add('E_INTERNAL_CONTRACT','轉換結果未通過 Scene3D／TransferReport Schema。');return failed();}
  return {scene,report};
}

/** Diagnostic planning only; independent example geometry is explicitly labelled. */
export async function create3DProposal(plan) {
  if (plan?.schema !== 'Plan2DInspection' || plan.schema_version !== '0.1.0') {
    throw Object.assign(new Error('3D 規劃需要 Plan2DInspection@0.1.0。'), { code: 'E_INSPECTION_REQUIRED' });
  }
  const fingerprint = plan.source.sha256, sourceLayers = plan.layers;
  const id = async (kind, value) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint + JSON.stringify(value)));
    return kind + '_' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('').slice(0, 16);
  };
  const recipes={
    '原有牆':{target:'wall',method:'extrude_centerline',requires:['centerline_mm','thickness_mm','height_mm','joined_endpoints','openings']},
    '門':{target:'door_opening',method:'cut_host_wall_then_optional_door_asset',requires:['host_wall_id','offset_mm','width_mm','height_mm','door_swing']},
    '窗':{target:'window_opening',method:'cut_host_wall_then_optional_window_asset',requires:['host_wall_id','offset_mm','width_mm','height_mm','sill_height_mm']},
    '平面地坪':{target:'slab',method:'extrude_polygon_downward',requires:['boundary_mm','holes_mm','thickness_mm','top_elevation_mm']},
    '活動家具':{target:'furniture',method:'place_confirmed_asset',requires:['individual_object_type','footprint_mm','position_mm','rotation_degrees','height_mm','asset_id']},
    '木作':{target:'cabinet_or_partition',method:'confirm_type_then_parametric_geometry_or_asset',requires:['individual_object_type','footprint_mm','height_mm','material_id']},
    '廚具設備':{target:'equipment',method:'place_confirmed_asset',requires:['individual_object_type','position_mm','dimensions_mm','asset_id']},
    '鐵件':{target:'metalwork',method:'manual_review_then_parametric_geometry',requires:['individual_object_type','geometry_mm','material_id']}
  };
  const plannedGroups=await Promise.all(sourceLayers.filter(layer=>layer.role==='object_category').map(async layer=>({id:await id('planned_group',layer.id),name:layer.name,source_inspection_layer_ids:[layer.id],instances:null,confirmed:false,planned_action:recipes[layer.name]||{target:'unknown',method:'manual_review',requires:['object_type','geometry_mm']}})));

  const nodes=[];
  const boxMesh=(x,y,z,w,d,h,material)=>({vertices_mm:[[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z],[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(indices=>({indices,material_id:material}))});
  const group=(nodeId,name,source,semantic)=>nodes.push({id:nodeId,name,kind:'group',parent_id:null,source_2d_ids:source,mesh:null,semantic,editable:true});
  const mesh=(nodeId,name,parent,source,dimensions,material,semantic)=>nodes.push({id:nodeId,name,kind:'mesh',parent_id:parent,source_2d_ids:source,mesh:boxMesh(...dimensions,material),semantic,editable:true});
  group('example_node_wall','示例牆體',['example_wall'],{wall_id:'example_wall',thickness_mm:200,height_mm:2500,opening_ids:['example_door']});
  mesh('example_node_wall_left','門洞左側','example_node_wall',['example_wall'],[0,-100,0,1000,200,2500],'example_wall_paint',{category:'wall_segment'});
  mesh('example_node_wall_right','門洞右側','example_node_wall',['example_wall'],[1900,-100,0,3100,200,2500],'example_wall_paint',{category:'wall_segment'});
  mesh('example_node_wall_header','門洞上緣','example_node_wall',['example_wall','example_door'],[1000,-100,2100,900,200,400],'example_wall_paint',{category:'wall_segment',opening_id:'example_door'});
  mesh('example_node_floor','示例地板',null,['example_slab'],[0,0,-100,5000,3000,100],'example_floor',{category:'slab',thickness_mm:100});
  group('example_node_chair','示例簡化椅子',['example_chair'],{category:'furniture',asset_id:null,representation:'procedural_placeholder',placement_example:{position_mm:[2500,1500,0],rotation_z_degrees:0},note:'位置已寫入子網格世界座標；不得再次套用 placement_example。'});
  mesh('example_node_chair_seat','椅座','example_node_chair',['example_chair'],[2250,1250,430,500,500,40],'example_chair_material',{category:'chair_seat'});
  mesh('example_node_chair_back','椅背','example_node_chair',['example_chair'],[2250,1710,470,500,40,430],'example_chair_material',{category:'chair_back'});
  for(const [index,x,y]of [[1,2270,1270],[2,2685,1270],[3,2270,1685],[4,2685,1685]])mesh(`example_node_chair_leg_${index}`,`椅腳 ${index}`,'example_node_chair',['example_chair'],[x,y,0,35,35,430],'example_chair_material',{category:'chair_leg'});
  const mappings=['example_wall','example_door','example_slab','example_chair'].map(source=>({source_2d_id:source,generated_node_ids:nodes.filter(node=>node.source_2d_ids.includes(source)).map(node=>node.id),method:source==='example_door'?'cut':source==='example_chair'?'group':'solid'}));
  const proposal={
    schema:'Scene3DProposal',schema_version:'0.1.0',status:'planning_only',source_2d_file:'plan2d.inspection.json',source_pdf_sha256:fingerprint,
    description:'列出此圖面預計生成的物件類型，並附獨立的 3D 格式範例。尚未從此 PDF 生成正式 Scene3D。',
    actual_scene3d:null,export_ready:false,model_defaults:plan.model_defaults,calibration_reference:plan.calibration.reference_wall,expected_contract:{schema:'Scene3D',schema_version:'1.0.0',units:'mm',axes:{x:'right',y:'forward_in_plan',z:'up'},handedness:'right',mesh_coordinates:'world',parent_id_meaning:'hierarchy_only'},
    blockers:plan.diagnostics.slice(0,2),planned_object_groups:plannedGroups,
    asset_policy:{selection:'需確認家具類型、位置、方向與尺寸後，選擇具再散布權的模型',default_asset_id:null,missing_asset:'顯示簡化物件並清楚標示；不可聲稱已還原原家具',mesh_contract:'模型的位移、旋轉與縮放需烘焙到世界座標 vertices_mm，再交給 Exporter'},
    format_example:{
      example_only:true,derived_from_uploaded_pdf:false,notice:'以下為獨立格式示例，牆高採使用者指定的 2500 mm；其餘位置及尺寸仍為示例，不能視為原圖辨識成果。未經正式 Schema 或 SketchUp 匯入驗收。',
      example_source_objects:[
        {id:'example_wall',kind:'wall',start_mm:[0,0],end_mm:[5000,0],thickness_mm:200,height_mm:2500},
        {id:'example_door',kind:'door_opening',wall_id:'example_wall',offset_from_start_mm:1000,width_mm:900,height_mm:2100,sill_height_mm:0},
        {id:'example_slab',kind:'slab',boundary_mm:[[0,0],[5000,0],[5000,3000],[0,3000]],thickness_mm:100,top_elevation_mm:0},
        {id:'example_chair',kind:'furniture_format_proposal',dimensions_mm:[500,500,900],position_mm:[2500,1500,0],note:'家具的正式 FloorPlan2D 欄位仍待設計。'}
      ],
      scene3d:{schema:'Scene3D',schema_version:'1.0.0',units:'mm',materials:[{id:'example_wall_paint',name:'牆面',color_rgba:[0.9,0.9,0.87,1]},{id:'example_floor',name:'地板',color_rgba:[0.65,0.55,0.4,1]},{id:'example_chair_material',name:'簡化椅子',color_rgba:[0.25,0.35,0.3,1]}],nodes},
      source_to_node_mapping:mappings
    }
  };
  return structuredClone(proposal);
}
