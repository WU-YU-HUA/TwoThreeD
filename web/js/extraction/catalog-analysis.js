// Associate object labels with measured furniture outlines before generating IR.
import {closedFaces,insidePolygon} from './structure-analysis.js';
import {classifyObjectName,normalizeObjectName,isIgnoredObjectName} from '../contracts/object-catalog.js';
import {boardDimensionLabel,boardFootprint} from './board-dimensions.js';
const hash=s=>{let h=2166136261;for(const c of s){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
const bounds=r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];
const center=b=>[(b[0]+b[2])/2,(b[1]+b[3])/2];
const boxArea=b=>(b[2]-b[0])*(b[3]-b[1]);
const contains=(a,b,tol=1e-5)=>a[0]<=b[0]+tol&&a[1]<=b[1]+tol&&a[2]>=b[2]-tol&&a[3]>=b[3]-tol;
const gap=(a,b)=>Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]));
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
const ignoredLabel=text=>/^(?:不更動|不更动|封門|封门)|隔間牆|隔间墙|OA.*(?:家具|傢俱)|辦公家具|办公家具|[區区間间室房]$/.test(text)||!/[\u3400-\u9fff]/u.test(text);
const relevant=path=>path.names.some(n=>/家具|傢俱|木作|櫃|柜|設備|设备|廚具|厨具|furniture|equipment|cabinet/i.test(n))&&!path.names.some(n=>/HATCH|填充|圖框|尺寸|標註/i.test(n));

export function catalogFaces(paths,pageNumber,mmPerUnit,referenceGap){
  const segments=[];
  for(const p of paths.filter(relevant)){
    let prev=null,start=null;
    for(const [i,c]of (p.commands||[]).entries()){
      if(c.op==='move_to'){prev=start=c.points[0];continue;}
      const end=c.op==='line_to'?c.points[0]:c.op==='close_path'?start:null;
      if(prev&&end){const dx=end[0]-prev[0],dy=end[1]-prev[1];if(Math.hypot(dx,dy)>1e-5&&(Math.abs(dx)<1e-5||Math.abs(dy)<1e-5)){const axis=Math.abs(dy)<1e-5?0:1;segments.push({axis,fixed:(prev[1-axis]+end[1-axis])/2,lo:Math.min(prev[axis],end[axis]),hi:Math.max(prev[axis],end[axis]),ref:{source_id:`pdf:${pageNumber}:${p.sourceOperatorIndex}:${i}`,page:pageNumber,layer:p.names.join(' / '),method:'labelled_object_boundary'}});}}
      prev=end;
    }
  }
  if(segments.length>4000)throw new Error('物件邊框過多，請縮小選區後重新萃取。');
  const groups=new Map(),dashed=[];
  for(const s of segments){const key=s.axis+':'+s.fixed.toFixed(5);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
  for(const group of groups.values()){
    const lines=[...new Map(group.map(s=>[s.lo.toFixed(5)+':'+s.hi.toFixed(5),s])).values()].sort((a,b)=>a.lo-b.lo);
    let run=[];
    const flush=()=>{
      const gaps=run.slice(1).map((s,i)=>s.lo-run[i].hi).filter(g=>g>1e-5);
      if(run.length>=3&&gaps.length>=2&&gaps.every(g=>g<=referenceGap*.5)&&run.every(s=>s.hi-s.lo>Math.max(...gaps)*.8)){
        const refs=run.map(s=>s.ref);dashed.push({...run[0],lo:run[0].lo,hi:Math.max(...run.map(s=>s.hi)),ref:{...run[0].ref,method:'repeated_dash_boundary',source_id:refs.map(r=>r.source_id).join('+')}});
      }run=[];
    };
    for(const s of lines){if(run.length&&(s.lo-run.at(-1).hi>referenceGap*.5||s.lo<run.at(-1).hi-1e-5))flush();run.push(s);}flush();
  }
  const faces=[...closedFaces(segments,1e-5),...closedFaces(dashed,1e-5).map(f=>({...f,dashed:true}))];
  return faces.filter(f=>f.ring.length===4&&Math.min(f.box[2]-f.box[0],f.box[3]-f.box[1])*mmPerUnit>=20&&Math.max(f.box[2]-f.box[0],f.box[3]-f.box[1])*mmPerUnit<=6000);
}

export function findCatalogObjects(paths,box,{catalog,textItems=[],occupied=[],fingerprint='',pageNumber=1,mmPerSourceUnit,referenceGap,layoutCenter=center(box)}={}){
  const objects=[],updates=[],diagnostics=[];
  if(!(mmPerSourceUnit>0))return {objects,updates,diagnostics};
  const faces=catalogFaces(paths,pageNumber,mmPerSourceUnit,referenceGap).filter(f=>contains(box,f.box)),labels=textItems.filter(t=>contains(box,t.box)&&!isIgnoredObjectName(t.text,catalog)&&!ignoredLabel(normalizeObjectName(t.text))).map(t=>({...t,classification:classifyObjectName(t.text,catalog)}));
  const seen=new Set(),assignedCabinets=[];
  const ref=t=>({source_id:`pdf:${pageNumber}:text:${hash(JSON.stringify([t.text,t.box]))}`,page:pageNumber,method:'object_name_label'});
  const pick=(t,allowAdjacent)=>{
    const candidates=faces.filter(f=>t.classification?.category!=='cabinet'||!f.dashed&&Math.min(f.box[2]-f.box[0],f.box[3]-f.box[1])*mmPerSourceUnit>=100);
    const point=center(t.box),matches=candidates.filter(f=>insidePolygon(point,f.ring));
    if(!matches.length&&allowAdjacent){
      const maxGap=Math.max(referenceGap*.8,Math.min(t.box[2]-t.box[0],t.box[3]-t.box[1])*2);
      matches.push(...candidates.filter(f=>gap(f.box,t.box)<=maxGap&&((point[0]>=f.box[0]&&point[0]<=f.box[2])||(point[1]>=f.box[1]&&point[1]<=f.box[3]))));
      matches.sort((a,b)=>gap(a.box,t.box)-gap(b.box,t.box)||a.area-b.area);
    }else matches.sort((a,b)=>a.area-b.area);
    let f=matches[0];if(!f)return null;
    // Close inset frames often describe the same object. Retain its outer frame.
    const tolerance=Math.min(f.box[2]-f.box[0],f.box[3]-f.box[1])*.1;
    f=candidates.filter(outer=>!!outer.dashed===!!f.dashed&&contains(outer.box,f.box)&&outer.box.every((v,i)=>Math.abs(v-f.box[i])<=tolerance)).sort((a,b)=>b.area-a.area)[0]||f;
    return f;
  };
  const build=(t,f,kind)=>{
    const boundary=rectangle(f.box).map(p=>p.map(v=>Math.round(v*1e6)/1e6)),b=bounds(boundary),name=t.text.trim();
    return {id:`${kind}_`+hash(fingerprint+JSON.stringify([pageNumber,boundary,name])),kind,object_name:name,catalog_type_id:t.classification?.type_id||'unclassified',boundary,holes:[],bbox:b,position:center(b),area_source_units2:boxArea(b),confirmed:false,
      material:{kind:kind==='cabinet'?'cabinet_wood':'equipment_marker',color:kind==='cabinet'?'#b28b60':'#d7e6ee',basis:'catalog_display_default',confirmed:false},
      evidence:{method:'text_with_furniture_outline',pattern:'none',boundary_layers:[...new Set(f.refs.map(r=>r.layer))],classification_basis:t.classification?'catalog_name_match':'unclassified_text_inside_object_frame',label_text:name},source_refs:[...f.refs,ref(t)]};
  };
  for(const t of labels.filter(t=>t.classification?.category==='cabinet')){
    const f=pick(t,true);if(!f){diagnostics.push({code:'W_OBJECT_OUTLINE_MISSING',message:`「${t.text}」找不到可配對的物件邊框。`});continue;}
    const previous=occupied.find(o=>['tall_cabinet','cabinet'].includes(o.kind)&&o.bbox.every((v,i)=>Math.abs(v-f.box[i])<=referenceGap*.15));
    if(previous){updates.push({id:previous.id,object_name:t.text.trim(),catalog_type_id:t.classification.type_id,height_mm:t.classification.height_mm,height_group:t.classification.height_group,source_refs:[...previous.source_refs,ref(t)]});continue;}
    if(occupied.some(o=>o.kind!=='table'&&f.ring.every(p=>insidePolygon(p,o.boundary)&&!o.holes.some(h=>insidePolygon(p,h)))))continue;
    const key=JSON.stringify(f.box);if(seen.has(key))continue;seen.add(key);
    const o=build(t,f,'cabinet'),b=o.bbox,front=b[2]-b[0]<b[3]-b[1]?[layoutCenter[0]>o.position[0]?1:-1,0]:[0,layoutCenter[1]>o.position[1]?1:-1];
    o.rotation_deg=front[0]===1?-90:front[0]===-1?90:front[1]===1?0:180;
    o.width=front[0]!==0?b[3]-b[1]:b[2]-b[0];o.depth=front[0]!==0?b[2]-b[0]:b[3]-b[1];
    o.height_mm=t.classification.height_mm;o.height_group=t.classification.height_group;
    objects.push(o);assignedCabinets.push(o);
  }
  const supportCandidates=[...assignedCabinets,...occupied.filter(o=>['table','tall_cabinet','cabinet'].includes(o.kind))];
  for(const t of labels.filter(t=>t.classification?.category!=='cabinet')){
    let f=pick(t,!!t.classification);if(!f){if(t.classification)diagnostics.push({code:'W_OBJECT_OUTLINE_MISSING',message:`「${t.text}」找不到可配對的物件邊框，未生成模型。`});continue;}
    const board=['whiteboard','electronic_whiteboard'].includes(t.classification?.type_id);
    if(board)f=boardFootprint(f,faces);
    if(occupied.some(o=>o.kind!=='table'&&f.ring.every(p=>insidePolygon(p,o.boundary)&&!o.holes.some(h=>insidePolygon(p,h))))||assignedCabinets.some(o=>o.bbox.every((v,i)=>Math.abs(v-f.box[i])<1e-4))){
      if(/機|机|鍋|锅|器/.test(t.text))diagnostics.push({code:'W_OBJECT_OUTLINE_MISSING',message:`「${t.text}」未配到獨立設備框，保留文字待核對，未猜測個別位置。`});continue;
    }
    // Text inside an already recognized desk is a desk annotation, not equipment.
    if(occupied.some(o=>o.kind==='table'&&o.boundary.every(p=>insidePolygon(p,f.ring))))continue;
    if(!t.classification&&(Math.max(f.box[2]-f.box[0],f.box[3]-f.box[1])*mmPerSourceUnit>3000||/家具|傢俱/.test(t.text)))continue;
    const key=JSON.stringify(f.box);if(seen.has(key))continue;seen.add(key);
    const o=build(t,f,'placeholder'),hosts=supportCandidates.filter(host=>host.area_source_units2>o.area_source_units2*1.05&&insidePolygon(o.position,host.boundary)&&!host.holes.some(h=>insidePolygon(o.position,h))).sort((a,b)=>a.area_source_units2-b.area_source_units2);
    if(board){
      const annotated=boardDimensionLabel(t,textItems.filter(item=>contains(box,item.box)));
      if(annotated){o.evidence.labelled_dimensions=annotated.dimensions;o.source_refs.push({...ref(annotated.item),method:'explicit_wdh_dimensions'});}
      if(f.expanded_board_support)o.evidence.includes_stand_footprint=true;
    }
    o.support_id=hosts[0]?.id||null;o.quantity=Number(normalizeObjectName(t.text).match(/[xX×](\d+)$/)?.[1]||1);
    o.cube_edge_mm=catalog.missing_model_policy.cube_edge_mm;o.hover_mm=catalog.missing_model_policy.hover_offset_mm;
    o.evidence.support_basis=hosts.length?'contained_in_named_support':'no_enclosing_support';
    if(f.dashed)o.evidence.boundary_pattern='repeated_dashes';
    if(hosts.length&&!o.boundary.every(p=>insidePolygon(p,hosts[0].boundary)))diagnostics.push({code:'W_SUPPORT_OVERHANG',message:`「${t.text}」跨越承載櫃邊界，依中心所在檯面放置，位置待核對。`});
    if(!t.classification)diagnostics.push({code:'W_UNCLASSIFIED_OBJECT',message:`「${t.text}」不在物件字典，以原名方塊標記，類型待核對。`});
    if(o.quantity>1)diagnostics.push({code:'W_AGGREGATE_OBJECT',message:`「${t.text}」以一個標名方塊代表整組；個別位置尚未分離。`});
    objects.push(o);
  }
  return {objects,updates,diagnostics};
}
