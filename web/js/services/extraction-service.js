import {applyModelSources} from '../extraction/model-selection.js';
// Stage 2: source document -> preview/evidence, and later confirmed FloorPlan2D.
// Raw PDF/DXF objects stop here; diagnostic evidence is not the formal 2D IR.
import { extractDxfPreview } from '../dxf-preview.js';
import { MODEL_DEFAULTS } from '../contracts/model-defaults.js';
import { findHatchedRegions, findOfficePartitions, insidePolygon } from '../extraction/structure-analysis.js';
import { findHingedDoors } from '../extraction/door-analysis.js';
import { findFurniture } from '../extraction/furniture-analysis.js';
import { findTables } from '../extraction/table-analysis.js';
import { findCatalogObjects } from '../extraction/catalog-analysis.js';
import { validateObjectCatalog, classifyObjectName } from '../contracts/object-catalog.js';
import { analyzePdfPage, findRasterRegion, pdfObjects, summarizeObjects, objectEvidence, overlaps, isFrame } from '../plan-analysis.js';

export async function extractData(source, { pageNumber = 1, includeGeometry = false, rasterFallback = true } = {}) {
  if (source.format === 'pdf') {
    const page = await source.document.getPage(pageNumber);
    const analysis = await analyzePdfPage(source.document, page, { includeGeometry });
    if (!analysis.box && rasterFallback && typeof document !== 'undefined') {
      analysis.box = await findRasterRegion(page, analysis);
      if (analysis.box) analysis.method = 'whitespace';
    }
    return { format: 'pdf', pageNumber, page, analysis };
  }
  if (source.format === 'dxf') {
    const preview = extractDxfPreview(source.document);
    const mainPaths = preview.paths.filter(p => !isFrame(p.layer));
    const mainLabels = preview.labels.filter(p => !isFrame(p.layer));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of mainPaths) for (const [x, y] of path.points) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    Object.assign(preview, {
      originalPaths: preview.paths, originalLabels: preview.labels, originalBounds: preview.bounds,
      mainPaths, mainLabels, mainBounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : preview.bounds,
    });
    return { format: 'dxf', preview: dxfView(preview) };
  }
  throw Object.assign(new Error(`尚未實作 ${source.format} 的資料萃取。`), { code: 'E_UNSUPPORTED_EXTRACTION' });
}

export function dxfView(preview, main = true) {
  return { ...preview, paths: main ? preview.mainPaths : preview.originalPaths,
    labels: main ? preview.mainLabels : preview.originalLabels,
    bounds: main ? preview.mainBounds : preview.originalBounds };
}

export function getObjectSummary(extracted) {
  if (extracted.format === 'pdf') {
    const { analysis } = extracted, area = analysis.userBox || analysis.box;
    return area ? pdfObjects(analysis, area) : null;
  }
  if (extracted.format === 'dxf') {
    const d = extracted.preview, b = d.mainBounds;
    return summarizeObjects(d.originalLabels.map(label => ({ text: label.text, box: [...label.p, ...label.p] })),
      [b.minX, b.minY, b.maxX, b.maxY], d.mainPaths.map(p => p.layer));
  }
  throw Object.assign(new Error('尚未支援此資料的物件摘要。'), { code: 'E_UNSUPPORTED_EXTRACTION' });
}

const round = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
const union = boxes => boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);

/** Extract on a fresh PDF page with includeGeometry:true, before the first render. */
export async function extractInspection(source, extracted) {
  if (source.format !== 'pdf' || extracted.format !== 'pdf') {
    throw Object.assign(new Error('目前 JSON 向量證據輸出只支援 PDF。'), { code: 'E_UNSUPPORTED_INSPECTION' });
  }
  const { page, pageNumber } = extracted;
  const analysis = { ...extracted.analysis, box: extracted.analysis.userBox || extracted.analysis.box };
  if (!analysis.box) throw Object.assign(new Error('未找到可信的主要圖面範圍；需先確認選區再輸出。'), { code: 'E_REGION_UNCONFIRMED' });
  if (analysis.paths.some(p => !p.commands)) throw Object.assign(new Error('萃取時需啟用 includeGeometry，並在 PDF 首次繪製前擷取向量。'), { code: 'E_VECTOR_EVIDENCE_MISSING' });
  const fingerprint = source.sha256;
  const id = async (kind, value) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint + JSON.stringify(value)));
    return kind + '_' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('').slice(0, 16);
  };
  const summary=pdfObjects(analysis,analysis.box),evidence=objectEvidence(analysis.textItems,analysis.box);
  // Hatching remains useful as structural evidence; dimensions and the title frame are omitted.
  const selectedNames=new Set(summary.layers);
  const paths=analysis.paths.filter(p=>overlaps(p.box,analysis.box)&&p.names.some(name=>selectedNames.has(name)||/^hatch$/i.test(name)));
  const sourceLayers=await Promise.all([...new Set(paths.flatMap(p=>p.names))].sort().map(async name=>{
    const refs=Object.entries(analysis.groups).filter(([,g])=>g.name===name).map(([key])=>key);
    const entries=paths.filter(p=>p.names.includes(name));
    return {id:await id('layer',refs),name,role:selectedNames.has(name)?'object_category':'structural_hatching',source_group_ids:refs,source_page:pageNumber,bbox_pdf_pt:round(union(entries.map(p=>p.box))),drawing_path_count:entries.length,physical_object_count:null,confirmed:false};
  }));
  const layerByName=new Map(sourceLayers.map(layer=>[layer.name,layer.id]));
  const labels=await Promise.all(evidence.map(async item=>({id:await id('label',[pageNumber,item.category,item.name,item.box]),category:item.category,name:item.name,source_text:item.sourceText,source_page:pageNumber,bbox_pdf_pt:round(item.box),position_meaning:'文字標示的範圍，不是物件的外框或中心',physical_object_id:null,confirmed:false})));
  const vectorPaths=await Promise.all(paths.map(async p=>({id:await id('path',[pageNumber,p.sourceOperatorIndex]),source_page:pageNumber,source_operator_index:p.sourceOperatorIndex,layer_ids:p.names.map(name=>layerByName.get(name)).filter(Boolean),bbox_pdf_pt:round(p.box),paint:p.paint,commands_pdf_pt:round(p.commands),semantic_object_id:null})));
  const plan={
    schema:'Plan2DInspection',schema_version:'0.1.0',status:'needs_calibration_and_object_recognition',
    description:'從原始 PDF 主要選區擷取的 2D 證據；尚未形成正式 FloorPlan2D。',
    source:{filename:source.filename,sha256:fingerprint,page_count:source.document.numPages,exported_pages:[pageNumber],page_bbox_pdf_pt:page.view,pdf_user_unit:page.userUnit,pdf_rotation_degrees:page.rotate},
    coordinates:{units:'pdf_pt',origin:'原始 PDF 頁面座標原點',x_axis:'right',y_axis:'up',bbox_order:['min_x','min_y','max_x','max_y'],path_points:'已套用 PDF 繪圖矩陣；全部為原始頁面座標，不再重複變換'},
    calibration:{scale_verified:false,method:'reference_wall_thickness_ratio',reference_wall:{kind:'exterior_wall',proposed_thickness_mm:200,source:'user_proposed_reference',boundary_points_pdf_pt:null,measured_gap_pdf_pt:null,confirmed:false},model_mm_per_pdf_pt:null,source_to_model_3x3:null,wall_thickness_formula:'wall_gap_pdf_pt / reference_wall_gap_pdf_pt * 200',note:'PDF 點數表示紙張座標，不能直接當成建築毫米；尚未校正。'},
    model_defaults:{wall_height_mm:2500,wall_height_source:'user_default',note:'牆高為使用者指定預設值，不是從 PDF 量得；厚度須依選定外牆的 200 mm 參考比例計算。'},
    main_region:{method:analysis.userBox?'manual':analysis.method==='layers'?'optional_content_layers':analysis.method,bbox_pdf_pt:round(analysis.box),confirmed:false,excluded_content:['圖框','標題欄','公司與日期等頁面資訊','純尺寸標示'],clipping_policy:'以路徑包圍盒相交選取完整來源路徑，不切斷跨界路徑'},
    summary:{object_layer_categories:summary.layers.length,structural_auxiliary_layers:sourceLayers.filter(layer=>layer.role==='structural_hatching').length,object_label_occurrences:labels.length,vector_paths:vectorPaths.length,physical_object_count:null,label_counts:summary.categories},
    unresolved_model_geometry:{walls:null,openings:null,slabs:null,rooms:null,furniture:null,note:'null 表示尚未辨識，不表示圖面沒有這類物件。'},
    diagnostics:[{code:'E_SCALE_UNVERIFIED',message:'使用者提出外牆 200 mm 作為參考；尚未選定並確認該外牆的兩側邊線。'},{code:'E_UNRESOLVED_ELEMENT',message:'圖層類別、文字標示與向量路徑尚未配對成獨立牆、門窗、家具。'},{code:'W_LABEL_COUNT_ONLY',message:'標示次數不是實際物件數；不能將文字外框當成家具外框。'}],
    layers:sourceLayers,object_labels:labels,
    vector_geometry:{file:'plan2d.geometry.json',path_count:vectorPaths.length,units:'pdf_pt',note:'完整向量指令較多，另存於附檔；這些線條尚未組成建築語意物件。'}
  };
  const geometry={schema:'Plan2DVectorEvidence',schema_version:'0.1.0',source_pdf_sha256:fingerprint,coordinates:plan.coordinates,main_region:plan.main_region,vector_paths:vectorPaths};
  return { plan, geometry };
}

// Conservative wall hypotheses: pair parallel boundaries ONLY on named wall layers.
// Other layers and unpaired lines remain diagnostics; the result is never auto-confirmed.
const wallLayer = name => /牆|墙|(?:^|[_ -])walls?(?:$|[_ -])/i.test(name);
const annotationLayer = name => /圖框|frame|border|title|尺寸|dimension|^dim$|^hatch$|^0$|^labels?$|^text$/i.test(name);
const stableKey = value => { let h=2166136261;for(const c of value){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36); };
const dot = (p,u) => p[0]*u[0]+p[1]*u[1];
const pointIn = (p,box) => p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3];

export function prepareWallCandidates(source, extracted) {
  const segments=[],layers=new Set();let box,pageNumber=extracted.pageNumber||1,curved=0;
  const add=(a,b,layer,sourceId)=>{
    if(!a||!b||!a.every(Number.isFinite)||!b.every(Number.isFinite))return;
    if(!pointIn(a,box)||!pointIn(b,box))return; // Never extend a wall beyond a manual crop.
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-7)return;
    if(a[0]>b[0]+1e-7||(Math.abs(a[0]-b[0])<1e-7&&a[1]>b[1]))[a,b]=[b,a];
    segments.push({a,b,layer,sourceId,u:[(b[0]-a[0])/length,(b[1]-a[1])/length],length,used:[]});
  };
  if(extracted.format==='pdf'){
    const analysis=extracted.analysis;box=analysis.userBox||analysis.box;
    if(!box)return {walls:[],layers:[],unmodeledLayers:[],box:null,pageNumber,unpairedSegments:0,curvedPaths:0};
    for(const path of analysis.paths){
      if(!overlaps(path.box,box))continue;for(const name of path.names)if(!annotationLayer(name))layers.add(name);
      const layer=path.names.find(wallLayer);if(!layer)continue;
      if(!path.commands)throw new Error('需重新讀取圖面，才能取得可建模的向量牆線。');
      if(path.commands.some(c=>c.op==='cubic_bezier_to')){curved++;continue;}
      let start=null,previous=null,index=0;
      for(const command of path.commands){
        if(command.op==='move_to'){start=command.points[0];previous=start;}
        else if(command.op==='line_to'){add(previous,command.points[0],layer,`pdf:${pageNumber}:${path.sourceOperatorIndex}:${index++}`);previous=command.points[0];}
        else if(command.op==='close_path'){add(previous,start,layer,`pdf:${pageNumber}:${path.sourceOperatorIndex}:${index++}`);previous=start;}
      }
    }
  }else if(extracted.format==='dxf'){
    const preview=extracted.preview,b=preview.mainBounds;box=[b.minX,b.minY,b.maxX,b.maxY];
    for(const [i,path]of preview.originalPaths.entries()){
      if(!annotationLayer(path.layer))layers.add(path.layer);if(!wallLayer(path.layer))continue;
      for(let j=0;j<path.points.length-1;j++)add(path.points[j],path.points[j+1],path.layer,`dxf:${i}:${j}`);
      if(path.closed)add(path.points.at(-1),path.points[0],path.layer,`dxf:${i}:close`);
    }
  }else throw new Error('目前自動牆線配對支援向量 PDF 與 DXF。');
  const span=Math.max(box[2]-box[0],box[3]-box[1]),pairs=[];
  // Bound quadratic work and fail explicitly instead of freezing on large drawings.
  if(segments.length>2500)throw new Error('牆線超過 2,500 段，請先縮小主要選區再建模。');
  for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){
    const a=segments[i],b=segments[j];if(a.layer!==b.layer||Math.abs(dot(a.u,b.u)-1)>1e-6)continue;
    const u=a.u,n=[-u[1],u[0]],ha=dot(a.a,n),hb=dot(b.a,n),gap=Math.abs(ha-hb);
    if(gap<span*1e-5||gap>span*.04)continue;
    const aa=dot(a.a,u),ab=dot(a.b,u),ba=dot(b.a,u),bb=dot(b.b,u),lo=Math.max(aa,ba),hi=Math.min(ab,bb);
    if(hi-lo<Math.max(gap*4,span*.015))continue;
    pairs.push({a,b,u,n,h:(ha+hb)/2,gap,lo,hi,start:Math.abs(aa-ba)<=gap*2?(aa+ba)/2:lo,end:Math.abs(ab-bb)<=gap*2?(ab+bb)/2:hi});
  }
  pairs.sort((a,b)=>a.gap-b.gap||(b.hi-b.lo)-(a.hi-a.lo)||a.a.sourceId.localeCompare(b.a.sourceId,'en'));
  const walls=[];
  for(const pair of pairs){
    const {a,b,u,n,h,gap,lo,hi}=pair;
    if([a,b].some(s=>s.used.some(([l,r])=>Math.min(r,hi)-Math.max(l,lo)>span*1e-6)))continue;
    a.used.push([lo,hi]);b.used.push([lo,hi]);
    const start=[u[0]*pair.start+n[0]*h,u[1]*pair.start+n[1]*h],end=[u[0]*pair.end+n[0]*h,u[1]*pair.end+n[1]*h];
    const id='wall_'+stableKey(source.sha256+JSON.stringify([pageNumber,a.layer,start,end,gap]));
    walls.push({id,layer:a.layer,start,end,gap,source_refs:[a,b].map(s=>({source_id:s.sourceId,layer:s.layer,page:pageNumber,method:'parallel_boundary_hypothesis'}))});
  }
  walls.sort((a,b)=>b.start[1]-a.start[1]||a.start[0]-b.start[0]||a.id.localeCompare(b.id,'en'));
  // Highest wall midpoint first, leftmost midpoint for ties. Stable in source XY,
  // so rotating the preview cannot silently change the calibration reference.
  const highest=walls.length?Math.max(...walls.map(w=>(w.start[1]+w.end[1])/2)):0;
  const upperLeft=[...walls].filter(w=>highest-(w.start[1]+w.end[1])/2<span*.005)
    .sort((a,b)=>(a.start[0]+a.end[0])-(b.start[0]+b.end[0])||a.id.localeCompare(b.id,'en'))[0];
  return {walls,referenceWallId:upperLeft?.id||null,layers:[...layers],unmodeledLayers:[...layers].filter(name=>!wallLayer(name)),box,pageNumber,
    unpairedSegments:segments.filter(s=>!s.used.length).length,curvedPaths:curved};
}

/** Provisional FloorPlan2D from the CURRENT drawing. No invented floor/furniture. */
export function buildWallPlan(source,candidates,{referenceWallId=candidates.referenceWallId,referenceThicknessMm=MODEL_DEFAULTS.reference_wall_thickness_mm,wallHeightMm=MODEL_DEFAULTS.wall_height_mm}={}) {
  const reference=candidates.walls.find(w=>w.id===referenceWallId);
  if(!reference)throw new Error('請選擇一面已配對的參考牆。');
  if(!Number.isFinite(referenceThicknessMm)||referenceThicknessMm<=0||!Number.isFinite(wallHeightMm)||wallHeightMm<=0)throw new Error('牆厚與牆高必須大於零。');
  const scale=referenceThicknessMm/reference.gap,[ox,oy]=candidates.box;
  const mm=p=>p.map((v,i)=>Math.round((v-(i===0?ox:oy))*scale*1e6)/1e6);
  const diagnostics=[];
  if(candidates.unmodeledLayers.length)diagnostics.push({severity:'error',code:'E_UNRESOLVED_ELEMENT',element_id:null,message:'尚未建模的圖層：'+candidates.unmodeledLayers.join('、')+'。門窗與家具不會被猜測成牆。'});
  if(candidates.unpairedSegments||candidates.curvedPaths)diagnostics.push({severity:'warning',code:'W_UNPAIRED_WALL_EVIDENCE',element_id:null,message:`牆圖層仍有 ${candidates.unpairedSegments} 段未配對線及 ${candidates.curvedPaths} 組曲線，請核對是否漏牆或包含柱體。`});
  return {schema:'FloorPlan2D',schema_version:'1.0.0',units:'mm',
    source:{filename:source.filename,format:source.format,sha256:source.sha256,scale_verified:false,
      source_to_model_3x3:[scale,0,-ox*scale,0,scale,-oy*scale,0,0,1],
      extensions:{calibration:{method:'reference_wall_thickness_ratio',reference_wall_rule:reference.id===candidates.referenceWallId?'user_default_upper_left':'manual_selection',reference_wall_id:reference.id,reference_thickness_mm:referenceThicknessMm,dimension_source:'user_default',measured_gap_source_units:reference.gap,reference_geometry_confirmed:false,confirmed:false}}},
    materials:[{id:'wall_paint',name:'待核對牆體',color_rgba:[.72,.78,.68,1]}],diagnostics,
    levels:[{id:'level_'+candidates.pageNumber,name:'圖面第 '+candidates.pageNumber+' 頁',base_elevation_mm:0,
      walls:candidates.walls.map((wall,index)=>({id:wall.id,name:`候選牆 ${index+1} · ${wall.layer}`,start_mm:mm(wall.start),end_mm:mm(wall.end),thickness_mm:wall.gap*scale,height_mm:wallHeightMm,alignment:'center',material_id:'wall_paint',confirmed:false,confidence:.5,source_refs:wall.source_refs})),
      openings:[],slabs:[],rooms:[]}],extensions:{twothreeD:{scope:'wall_candidates_only',wall_height_source:'user_default',requires_review:true,model_defaults:{...MODEL_DEFAULTS,reference_wall_thickness_mm:referenceThicknessMm,wall_height_mm:wallHeightMm},pending_opening_defaults:true}}};
}

/** Review-only structural evidence. A column footprint is never disguised as a wall. */
export function extractStructure(source,extracted,{wallCandidates=prepareWallCandidates(source,extracted),catalog=null}={}) {
  if(catalog)validateObjectCatalog(catalog);
  const page=extracted.pageNumber||1,box=wallCandidates.box;
  const reference=wallCandidates.walls.find(w=>w.id===wallCandidates.referenceWallId);
  const result={schema:'Plan2DStructureEvidence',schema_version:'0.1.0',status:'needs_review',
    source:{filename:source.filename,format:source.format,sha256:source.sha256,page},
    coordinates:{units:source.format==='pdf'?'pdf_pt':'dxf_source_unit',x_axis:'right',y_axis:'up',region:box},
    rules:{hatched_material:'concrete',unhatched_wall_material:'light_partition',light_partition_display:'light_wood_board',basis:'user_drawing_convention',automatic_confirmation:false},
    calibration:null,objects:[],summary:{concrete_columns:0,concrete_walls:0,light_partitions:0,unclassified:0},diagnostics:[]};
  if(catalog)result.catalog_version=catalog.catalog_version;
  if(!box){result.diagnostics.push({code:'E_REGION_UNCONFIRMED',message:'尚未取得主要圖面範圍。'});return result;}
  let hatched={regions:[],hatch_strokes:0,unassigned_hatch_strokes:0,partial_regions:0,unassigned_source_refs:[]};
  if(source.format==='pdf'){
    if(extracted.analysis.paths.some(p=>!p.commands))throw new Error('結構萃取需要完整向量資料，請重新讀入 PDF。');
    hatched=findHatchedRegions(extracted.analysis.paths,box,{fingerprint:source.sha256,pageNumber:page});
  }else result.diagnostics.push({code:'W_HATCH_UNSUPPORTED',message:'DXF 填充圖元尚未納入此辨識流程，目前僅列出牆圖層平行線候選。'});
  result.objects.push(...hatched.regions);
  for(const wall of wallCandidates.walls){
    // Hatch evidence wins. Avoid duplicating a concrete footprint as a light wall.
    const samples=[.01,.25,.5,.75,.99].map(t=>wall.start.map((v,i)=>v+(wall.end[i]-v)*t));
    if(hatched.regions.some(region=>samples.some(p=>insidePolygon(p,region.boundary)&&!region.holes.some(h=>insidePolygon(p,h)))))continue;
    const dx=wall.end[0]-wall.start[0],dy=wall.end[1]-wall.start[1],length=Math.hypot(dx,dy),n=[-dy/length*wall.gap/2,dx/length*wall.gap/2];
    const boundary=[wall.start.map((v,i)=>v-n[i]),wall.end.map((v,i)=>v-n[i]),wall.end.map((v,i)=>v+n[i]),wall.start.map((v,i)=>v+n[i])];
    result.objects.push({id:'structure_'+wall.id,kind:'wall',boundary,holes:[],bbox:union(boundary.map(p=>[...p,...p])),area_source_units2:length*wall.gap,
      material:{kind:'light_partition',color:'#c5a576',basis:'user_unhatched_wall_rule',confirmed:false},confirmed:false,
      evidence:{method:'named_wall_parallel_boundaries',pattern:'none',hatch_strokes:0,boundary_layers:[wall.layer],classification_basis:'parallel_wall_candidate',note:'無填充牆線暫按輕隔間顯示，並非已確認的實際材質。'},source_refs:wall.source_refs});
  }
  if(source.format==='pdf'){
    const doors=findHingedDoors(extracted.analysis.paths,box,{fingerprint:source.sha256,pageNumber:page,textItems:extracted.analysis.textItems});
    result.objects.push(...doors.objects);result.diagnostics.push(...doors.diagnostics);
    result.objects.push(...findOfficePartitions(extracted.analysis.paths,box,{fingerprint:source.sha256,pageNumber:page,textItems:extracted.analysis.textItems,solidRegions:hatched.regions}));
    const layoutBox=extracted.analysis.box||box;
    const furniture=findFurniture(extracted.analysis.paths,box,{fingerprint:source.sha256,pageNumber:page,mmPerSourceUnit:reference?MODEL_DEFAULTS.reference_wall_thickness_mm/reference.gap:null,referenceGap:reference?.gap,layoutCenter:[(layoutBox[0]+layoutBox[2])/2,(layoutBox[1]+layoutBox[3])/2]});
    result.objects.push(...furniture.objects);result.diagnostics.push(...furniture.diagnostics);
    const tables=findTables(extracted.analysis.paths,box,{fingerprint:source.sha256,pageNumber:page,mmPerSourceUnit:reference?MODEL_DEFAULTS.reference_wall_thickness_mm/reference.gap:null,referenceGap:reference?.gap,textItems:extracted.analysis.textItems,occupied:result.objects,namedObjectPredicate:catalog?text=>!!classifyObjectName(text,catalog):undefined});
    result.objects.push(...tables.objects);result.diagnostics.push(...tables.diagnostics);
    if(catalog){
      const named=findCatalogObjects(extracted.analysis.paths,box,{catalog,textItems:extracted.analysis.textItems,occupied:result.objects,fingerprint:source.sha256,pageNumber:page,mmPerSourceUnit:reference?MODEL_DEFAULTS.reference_wall_thickness_mm/reference.gap:null,referenceGap:reference?.gap,layoutCenter:[(layoutBox[0]+layoutBox[2])/2,(layoutBox[1]+layoutBox[3])/2]});
      for(const update of named.updates){
        const object=result.objects.find(o=>o.id===update.id);Object.assign(object,update);
        if(update.height_group!=='tall')object.kind='cabinet';
      }
      result.objects.push(...named.objects);result.diagnostics.push(...named.diagnostics);
    }
  }else{
    result.diagnostics.push({code:'W_DOOR_EXTRACTION_UNSUPPORTED',message:'DXF 門扇語意配對尚未實作；未把弧線直接當成門。'});
    result.diagnostics.push({code:'W_FURNITURE_EXTRACTION_UNSUPPORTED',message:'DXF 椅子、高櫃與桌子辨識尚未實作，目前家具模板配對先支援向量 PDF。'});
  }
  result.objects.sort((a,b)=>b.bbox[3]-a.bbox[3]||a.bbox[0]-b.bbox[0]||a.id.localeCompare(b.id,'en'));
  if(reference){
    const scale=MODEL_DEFAULTS.reference_wall_thickness_mm/reference.gap,project=p=>p.map((v,i)=>Math.round((v-box[i])*scale*1e6)/1e6);
    result.calibration={method:'upper_left_reference_wall',reference_wall_id:reference.id,reference_thickness_mm:MODEL_DEFAULTS.reference_wall_thickness_mm,mm_per_source_unit:scale,source_to_model_3x3:[scale,0,-box[0]*scale,0,scale,-box[1]*scale,0,0,1],verified:false};
    for(const object of result.objects){
      object.boundary_mm=object.boundary.map(project);object.holes_mm=object.holes.map(h=>h.map(project));
      if(object.kind==='door'){object.hinge_mm=project(object.hinge);object.closed_end_mm=project(object.closed_end);}
      if(['chair','tall_cabinet','cabinet'].includes(object.kind)){object.position_mm=project(object.position);object.width_mm=object.width*scale;object.depth_mm=object.depth*scale;}
      if(object.kind==='placeholder')object.position_mm=project(object.position);
    }
  }else result.diagnostics.push({code:'E_REFERENCE_WALL_MISSING',message:'未找到可配對的左上參考牆；保留來源輪廓，不以柱寬代替 20 cm 牆厚。'});
  const counts={wall:0,column:0,unclassified:0};
  for(const object of result.objects){
    const type=object.material.kind==='light_partition'?'light_partition':object.kind;
    counts[type]=(counts[type]||0)+1;
    object.label=(type==='column'?'柱 C':type==='wall'?'水泥牆 W':type==='light_partition'?(object.evidence.method==='labelled_oa_closed_parallel_strips'?'辦公屏風 L':'輕隔間 L'):type==='door'?'門 D':type==='chair'?'椅子 CH':type==='tall_cabinet'?'高櫃 CB':type==='table'?'桌子 T':type==='cabinet'?'櫃子 NC':type==='placeholder'?'設備 E':'待分類 U')+counts[type]+(object.object_name?' · '+object.object_name:'');
  }
  result.summary={concrete_columns:counts.column,concrete_walls:counts.wall,light_partitions:counts.light_partition||0,doors:counts.door||0,chairs:counts.chair||0,tall_cabinets:counts.tall_cabinet||0,tables:counts.table||0,...(catalog?{cabinets:counts.cabinet||0,placeholders:counts.placeholder||0}:{}),unclassified:counts.unclassified,hatch_strokes:hatched.hatch_strokes,unassigned_hatch_strokes:hatched.unassigned_hatch_strokes,partial_regions:hatched.partial_regions};
  if(hatched.unassigned_hatch_strokes)result.diagnostics.push({code:'W_UNASSIGNED_HATCH',message:`仍有 ${hatched.unassigned_hatch_strokes} 段填充線未歸入完整輪廓。`,source_refs:hatched.unassigned_source_refs});
  if(hatched.partial_regions)result.diagnostics.push({code:'W_PARTIAL_STRUCTURE',message:`${hatched.partial_regions} 個填充區域跨出選區，未截斷成新的構件。`});
  result.diagnostics.push({code:'W_STRUCTURE_REVIEW_ONLY',message:'牆／柱與材質皆為待核對候選，可建立 3D 初稿供檢視。'});
  return round(result);
}

/** Convert structural evidence to millimetre v5/v6, or v7 with modelCatalog.
 * No 3D geometry is generated here. The same IDs/footprints are consumed by Transfer.
 */
export function buildStructurePlan(source,structure,{modelCatalog=null}={}){
  if(structure?.schema!=='Plan2DStructureEvidence'||structure.schema_version!=='0.1.0')throw new Error('需要目前圖面的結構萃取結果。');
  if(structure.source.sha256!==source.sha256||structure.source.format!==source.format)throw new Error('結構萃取結果與目前圖面不一致，請重新讀檔。');
  const calibration=structure.calibration;
  if(!calibration||!Number.isFinite(calibration.mm_per_source_unit)||calibration.mm_per_source_unit<=0||!calibration.source_to_model_3x3)throw new Error('找不到左上參考牆，無法換算柱與牆的毫米尺寸。');
  const walls=[],columns=[],doors=[],furniture=[],diagnostics=structure.diagnostics.map(d=>({severity:'warning',code:d.code,message:d.message,element_id:null}));
  for(const object of structure.objects){
    if(!['wall','column','door','chair','tall_cabinet','table','cabinet','placeholder'].includes(object.kind)){
      diagnostics.push({severity:'error',code:'E_UNRESOLVED_ELEMENT',message:'此構件類型仍待核對，尚未生成 3D。',element_id:object.id});continue;
    }
    if(!object.boundary_mm||!object.holes_mm)throw new Error('構件缺少毫米輪廓，請重新萃取。');
    if(object.kind==='placeholder'){
      furniture.push({id:object.id,name:object.object_name,kind:'placeholder',template_id:'builtin.labeled_cube.v1',catalog_type_id:object.catalog_type_id,label_text:object.object_name,position_mm:[...object.position_mm],boundary_mm:structuredClone(object.boundary_mm),holes_mm:structuredClone(object.holes_mm),cube_edge_mm:object.cube_edge_mm,hover_mm:object.hover_mm,support_id:object.support_id,quantity:object.quantity,material_id:'equipment_marker',confirmed:false,confidence:.6,source_refs:structuredClone(object.source_refs),extensions:{representation:'symbolic_cube',dimensions_source:'user_marker_default',support_basis:object.evidence.support_basis,...(object.evidence.labelled_dimensions?{labelled_dimensions:structuredClone(object.evidence.labelled_dimensions)}:{})}});continue;
    }
    if(object.kind==='table'){
      furniture.push({id:object.id,name:object.label,kind:'table',template_id:'builtin.table.v1',boundary_mm:structuredClone(object.boundary_mm),holes_mm:structuredClone(object.holes_mm),height_mm:MODEL_DEFAULTS.table_height_mm,top_thickness_mm:MODEL_DEFAULTS.table_top_thickness_mm,material_id:'table_wood',accent_material_id:'furniture_metal',confirmed:false,confidence:.7,source_refs:structuredClone(object.source_refs),extensions:{height_source:'user_default',top_thickness_source:'display_default',support_style_source:'display_default',template_source:'project_parametric_geometry',material_basis:object.material.basis}});continue;
    }
    if(['chair','tall_cabinet','cabinet'].includes(object.kind)){
      if(!object.position_mm||!(object.width_mm>0)||!(object.depth_mm>0))throw new Error('家具缺少有效的毫米定位與尺寸。');
      const chair=object.kind==='chair';
      furniture.push({id:object.id,name:object.label,kind:object.kind,template_id:chair?'builtin.chair.v1':object.kind==='cabinet'?'builtin.cabinet.v1':'builtin.tall_cabinet.v1',position_mm:[...object.position_mm],rotation_deg:object.rotation_deg,width_mm:object.width_mm,depth_mm:object.depth_mm,height_mm:chair?MODEL_DEFAULTS.chair_height_mm:(object.height_mm||MODEL_DEFAULTS.tall_cabinet_height_mm),...(chair?{seat_height_mm:MODEL_DEFAULTS.chair_seat_height_mm}:object.kind==='cabinet'?{catalog_type_id:object.catalog_type_id,height_group:object.height_group}:{}),material_id:chair?'chair_fabric':'cabinet_wood',accent_material_id:'furniture_metal',confirmed:false,confidence:.7,source_refs:structuredClone(object.source_refs),extensions:{height_source:'user_default',template_source:'project_parametric_geometry',orientation_basis:object.evidence.orientation_basis||'chair_front_edge',material_basis:object.material.basis}});continue;
    }
    if(object.kind==='door'){
      if(!object.hinge_mm||!object.closed_end_mm||object.material.kind!=='door_wood')throw new Error('門片缺少毫米定位或顯示材質。');
      doors.push({id:object.id,name:object.label,confirmed:false,confidence:.8,source_refs:structuredClone(object.source_refs),kind:'hinged',placement:'existing_gap',boundary_mm:structuredClone(object.boundary_mm),hinge_mm:[...object.hinge_mm],closed_end_mm:[...object.closed_end_mm],height_mm:MODEL_DEFAULTS.door_height_mm,material_id:'door_wood',extensions:{height_source:'user_default_door_height',material_basis:object.material.basis}});continue;
    }
    if(!['concrete','light_partition'].includes(object.material.kind))throw new Error('構件材質尚未定義，不能猜測顯示材質。');
    const screen=object.evidence.semantic_type==='office_screen'&&object.material.kind==='light_partition';
    const element={id:object.id,name:object.label,confirmed:false,confidence:.7,source_refs:structuredClone(object.source_refs),
      boundary_mm:structuredClone(object.boundary_mm),holes_mm:structuredClone(object.holes_mm),height_mm:screen?MODEL_DEFAULTS.office_screen_height_mm:MODEL_DEFAULTS.wall_height_mm,
      material_id:object.material.kind==='concrete'?'concrete':'light_wood',extensions:{height_source:screen?'user_default_office_screen_height':'user_default_wall_height',material_basis:object.material.basis,...(screen?{semantic_type:'office_screen',area_labels:object.evidence.area_labels}: {})}};
    if(object.kind==='column')columns.push(element);else walls.push({...element,representation:'footprint'});
  }
  diagnostics.push({severity:'error',code:'E_UNRESOLVED_ELEMENT',message:'已辨識的椅子、高櫃與桌子採簡化模板；桌板厚度、桌腳款式與櫃門朝向為顯示預設。具名設備使用浮空標名方塊，非實際設備尺寸；水槽等未建模細節仍待補齊。門框、過樑、窗、地板及其他未辨識家具尚未建模，材質為顯示預設。',element_id:null});
  const plan={schema:'FloorPlan2D',schema_version:structure.catalog_version?'6.0.0':'5.0.0',units:'mm',
    source:{filename:source.filename,format:source.format,sha256:source.sha256,scale_verified:false,source_to_model_3x3:[...calibration.source_to_model_3x3],extensions:{calibration:structuredClone(calibration)}},
    materials:[{id:'concrete',name:'水泥構件',color_rgba:[150/255,155/255,152/255,1]},{id:'light_wood',name:'淺木色板材輕隔間',color_rgba:[197/255,165/255,118/255,1]},{id:'door_wood',name:'木色門片（示意）',color_rgba:[155/255,104/255,59/255,1]},{id:'chair_fabric',name:'深藍綠椅面',color_rgba:[40/255,79/255,87/255,1]},{id:'furniture_metal',name:'深灰金屬配件',color_rgba:[.13,.15,.16,1]},{id:'cabinet_wood',name:'淺木色高櫃',color_rgba:[178/255,139/255,96/255,1]},{id:'table_wood',name:'淺木色桌面',color_rgba:[222/255,201/255,157/255,1]},...(structure.catalog_version?[{id:'equipment_marker',name:'設備標名方塊（非實際尺寸）',color_rgba:[215/255,230/255,238/255,1]}]:[])],
    levels:[{id:'level_'+structure.source.page,name:'圖面第 '+structure.source.page+' 頁',base_elevation_mm:0,walls,columns,doors,furniture,openings:[],slabs:[],rooms:[]}],diagnostics,
    extensions:{twothreeD:{scope:'structure_and_furniture_candidates',requires_review:true,...(structure.catalog_version?{catalog_version:structure.catalog_version}:{}),model_defaults:{...MODEL_DEFAULTS},pending_window_defaults:true}}};
  return modelCatalog&&structure.catalog_version?applyModelSources(plan,modelCatalog):plan;
}
