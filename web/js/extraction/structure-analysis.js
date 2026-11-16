// Extraction-only geometry: closed orthogonal outlines supported by repeated hatch strokes.
// This module returns source-coordinate evidence, not FloorPlan2D or render objects.
const area = ring => ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const bounds = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const median = values => {const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0;};
const hash = value => {let h=2166136261;for(const c of value){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
const excluded = name => /圖框|图框|尺寸|標註|标注|frame|border|title|dimension|^dim$|^text$|^labels?$/i.test(name);
const hatchLayer = name => /hatch|填充|填線|填线|剖面/i.test(name);
export function insidePolygon(point, ring, epsilon=1e-7) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length&&Math.abs(dx*(point[1]-a[1])-dy*(point[0]-a[0]))/length<=epsilon&&point[0]>=Math.min(a[0],b[0])-epsilon&&point[0]<=Math.max(a[0],b[0])+epsilon&&point[1]>=Math.min(a[1],b[1])-epsilon&&point[1]<=Math.max(a[1],b[1])+epsilon)return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function pathSegments(path) {
  const result=[];let previous=null,start=null;
  for(const command of path.commands||[]){
    if(command.op==='move_to')previous=start=command.points[0];
    else if(command.op==='line_to'){if(previous)result.push([previous,command.points[0]]);previous=command.points[0];}
    else if(command.op==='close_path'){if(previous&&start)result.push([previous,start]);previous=start;}
    else previous=null; // Curves must never be silently replaced by straight chords.
  }
  return result;
}
function simplify(ring,epsilon){
  const reduced=ring.filter((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>epsilon*epsilon;});
  if(!reduced.length)return [];
  let first=0;for(let i=1;i<reduced.length;i++)if(reduced[i][0]<reduced[first][0]||(reduced[i][0]===reduced[first][0]&&reduced[i][1]<reduced[first][1]))first=i;
  return [...reduced.slice(first),...reduced.slice(0,first)];
}

// Node crossings, T junctions and overlapping segments before walking bounded faces.
// There is no gap bridging: a missing boundary remains unresolved.
export function closedFaces(segments,epsilon){
  const snap=n=>Math.round(n/epsilon),pointKeys=new Map(),edges=new Map();
  for(const s of segments)s.cuts=[s.lo,s.hi];
  for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){
    const a=segments[i],b=segments[j];
    if(a.axis===b.axis){
      if(Math.abs(a.fixed-b.fixed)>epsilon)continue;
      for(const v of [b.lo,b.hi])if(v>a.lo&&v<a.hi)a.cuts.push(v);
      for(const v of [a.lo,a.hi])if(v>b.lo&&v<b.hi)b.cuts.push(v);
    }else if(b.fixed>=a.lo-epsilon&&b.fixed<=a.hi+epsilon&&a.fixed>=b.lo-epsilon&&a.fixed<=b.hi+epsilon){a.cuts.push(b.fixed);b.cuts.push(a.fixed);}
  }
  const vertex=p=>{const key=p.map(snap).join(',');if(!pointKeys.has(key))pointKeys.set(key,{key,p:p.map(v=>snap(v)*epsilon),neighbors:new Set()});return key;};
  for(const s of segments){
    const cuts=[...new Set(s.cuts.map(snap))].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
      const p=v=>s.axis===0?[v,s.fixed]:[s.fixed,v];
      const a=vertex(p(cuts[i-1]*epsilon)),b=vertex(p(cuts[i]*epsilon));if(a===b)continue;
      const key=[a,b].sort().join('|');if(!edges.has(key))edges.set(key,{a,b,refs:new Map()});edges.get(key).refs.set(s.ref.source_id,s.ref);
      pointKeys.get(a).neighbors.add(b);pointKeys.get(b).neighbors.add(a);
    }
  }
  // Remove dangling annotation/furniture lines; they cannot bound an area.
  const queue=[...pointKeys.values()].filter(v=>v.neighbors.size<2);
  while(queue.length){const v=queue.pop();for(const key of v.neighbors){const n=pointKeys.get(key);n.neighbors.delete(v.key);if(n.neighbors.size===1)queue.push(n);}v.neighbors.clear();}
  for(const v of pointKeys.values())v.ordered=[...v.neighbors].sort((a,b)=>{const p=pointKeys.get(a).p,q=pointKeys.get(b).p;return Math.atan2(p[1]-v.p[1],p[0]-v.p[0])-Math.atan2(q[1]-v.p[1],q[0]-v.p[0]);});
  const visited=new Set(),faces=[];
  for(const vertex of pointKeys.values())for(const neighbor of vertex.ordered){
    if(visited.has(vertex.key+'|'+neighbor))continue;
    let a=vertex.key,b=neighbor;const keys=[],refs=new Map();
    for(let step=0;step<=edges.size*2;step++){
      const key=a+'|'+b;if(visited.has(key))break;visited.add(key);keys.push(a);
      for(const [id,ref]of edges.get([a,b].sort().join('|')).refs)refs.set(id,ref);
      const v=pointKeys.get(b),next=v.ordered[(v.ordered.indexOf(a)+v.ordered.length-1)%v.ordered.length];a=b;b=next;
    }
    if(a!==vertex.key||b!==neighbor||new Set(keys).size!==keys.length)continue;
    const rawRing=keys.map(key=>pointKeys.get(key).p),ring=simplify(rawRing,epsilon),size=area(ring);
    if(size>epsilon*epsilon)faces.push({ring,rawRing,area:size,box:bounds(ring),refs:[...refs.values()]});
  }
  return faces;
}
function repeatedPattern(strokes,epsilon){
  const groups=new Map();
  for(const stroke of strokes){
    const [a,b]=stroke.points,angle=(Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI)%Math.PI,key=Math.round(angle/(Math.PI/12));
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({...stroke,angle});
  }
  const directions=[];
  for(const group of groups.values()){
    const angle=median(group.map(s=>s.angle)),normal=[-Math.sin(angle),Math.cos(angle)];
    const offsets=group.map(s=>s.points[0][0]*normal[0]+s.points[0][1]*normal[1]).sort((a,b)=>a-b),distinct=[];
    for(const v of offsets)if(!distinct.length||v-distinct.at(-1)>epsilon*3)distinct.push(v);
    if(distinct.length<3)continue;
    const gaps=distinct.slice(1).map((v,i)=>v-distinct[i]),spacing=median(gaps);
    if(spacing<=epsilon*3||gaps.filter(g=>Math.abs(g-spacing)<spacing*.35).length/gaps.length<.65)continue;
    directions.push({angle_degrees:angle*180/Math.PI,spacing,estimated_area:group.reduce((n,s)=>n+s.length,0)*spacing,count:distinct.length});
  }
  return directions;
}

export function joinAdjacent(a,b){
  const edges=new Map();let shared=0;
  for(const ring of [a,b])for(let i=0;i<ring.length;i++){
    const p=ring[i],q=ring[(i+1)%ring.length],key=p.join(',')+'|'+q.join(','),reverse=q.join(',')+'|'+p.join(',');
    if(edges.has(reverse)){edges.delete(reverse);shared++;}else edges.set(key,[p,q]);
  }
  if(!shared)return null;
  const next=new Map();for(const [p,q]of edges.values()){const key=p.join(',');if(next.has(key))return null;next.set(key,q);}
  const start=edges.values().next().value[0],ring=[start];let p=next.get(start.join(','));
  while(p&&p.join(',')!==start.join(',')&&ring.length<=edges.size){ring.push(p);p=next.get(p.join(','));}
  return p&&ring.length===edges.size?ring:null; // Reject holes/branching boundaries, never fill them in.
}

function clipStrokes(strokes,ring,holes,epsilon){
  const box=bounds(ring),result=[];
  for(const [sourceIndex,stroke]of strokes.entries()){
    const [a,b]=stroke.points,dx=b[0]-a[0],dy=b[1]-a[1];
    if(Math.max(a[0],b[0])<box[0]||Math.min(a[0],b[0])>box[2]||Math.max(a[1],b[1])<box[1]||Math.min(a[1],b[1])>box[3])continue;
    const cuts=[0,1];
    for(const boundary of [ring,...holes])for(let i=0;i<boundary.length;i++){
      const p=boundary[i],q=boundary[(i+1)%boundary.length],ex=q[0]-p[0],ey=q[1]-p[1],det=dx*ey-dy*ex;if(Math.abs(det)<epsilon*epsilon)continue;
      const t=((p[0]-a[0])*ey-(p[1]-a[1])*ex)/det,u=((p[0]-a[0])*dy-(p[1]-a[1])*dx)/det;
      if(t>0&&t<1&&u>=-1e-8&&u<=1+1e-8)cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);
    const at=t=>[a[0]+dx*t,a[1]+dy*t];
    for(let i=1;i<cuts.length;i++){
      const lo=cuts[i-1],hi=cuts[i],mid=at((lo+hi)/2),length=stroke.length*(hi-lo);
      if(length<=epsilon||!insidePolygon(mid,ring,epsilon)||holes.some(h=>insidePolygon(mid,h)))continue;
      result.push({...stroke,sourceIndex,points:[at(lo),at(hi)],length});
    }
  }
  return result;
}

export function findHatchedRegions(paths,box,{fingerprint='',pageNumber=1}={}){
  // Fixed PDF-point precision keeps IDs stable when the user changes the crop.
  const epsilon=1e-5,boundaries=[],strokes=[],seen=new Set();
  for(const path of paths){
    if(path.names.some(excluded)||!path.commands)continue;
    const isHatch=path.names.some(hatchLayer),layer=path.names.join(' / ');
    for(const [index,[a,b]]of pathSegments(path).entries()){
      if(![...a,...b].every(Number.isFinite))continue;
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<=epsilon)continue;
      const ref={source_id:`pdf:${pageNumber}:${path.sourceOperatorIndex}:${index}`,layer,page:pageNumber,method:isHatch?'hatch_stroke':'closed_boundary'};
      if(isHatch){
        const key=[a.join(','),b.join(',')].sort().join('|');if(seen.has(key))continue;seen.add(key);
        strokes.push({points:[a,b],length,ref});
      }else if(Math.abs(dx)<=epsilon||Math.abs(dy)<=epsilon){
        const axis=Math.abs(dy)<=epsilon?0:1;
        boundaries.push({axis,fixed:(a[1-axis]+b[1-axis])/2,lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis]),ref});
      }
    }
  }
  if(boundaries.length>3000||strokes.length>12000)throw new Error('結構線條過多，請縮小選區後重新萃取。');
  const faces=closedFaces(boundaries,epsilon),regions=[],used=new Set();let partial=0;
  for(const face of faces){
    const enclosed=faces.filter(other=>other!==face&&other.area<face.area&&other.ring.every(p=>insidePolygon(p,face.ring,-epsilon))&&other.ring.every(p=>!face.ring.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<epsilon)));
    // Disconnected nested outlines bound holes. Touching faces from the noded
    // graph are adjacent patches, so require their boxes to be strictly inside.
    face.holes=enclosed.filter(other=>other.box[0]>face.box[0]+epsilon&&other.box[1]>face.box[1]+epsilon&&other.box[2]<face.box[2]-epsilon&&other.box[3]<face.box[3]-epsilon)
      .filter(other=>!enclosed.some(parent=>parent!==other&&parent.area>other.area&&other.ring.every(p=>insidePolygon(p,parent.ring)))).map(other=>other.ring);
    face.filledArea=face.area-face.holes.reduce((sum,h)=>sum+area(h),0);
  }
  for(const face of faces.sort((a,b)=>a.area-b.area)){
    const matches=clipStrokes(strokes,face.ring,face.holes,epsilon);
    const pattern=repeatedPattern(matches,epsilon);if(!pattern.length)continue;
    const coverage=median(pattern.map(p=>p.estimated_area))/face.filledArea;
    if(coverage<.65||coverage>1.5)continue; // A few diagonal lines inside a large frame are not a fill.
    if(face.ring.some(p=>p[0]<box[0]-epsilon||p[0]>box[2]+epsilon||p[1]<box[1]-epsilon||p[1]>box[3]+epsilon)){partial++;continue;}
    const [x0,y0,x1,y1]=face.box,width=x1-x0,height=y1-y0,ratio=Math.max(width,height)/Math.min(width,height),occupancy=face.area/(width*height);
    const kind=face.holes.length?'unclassified':ratio>=3||occupancy<.35?'wall':ratio<=2&&occupancy>.85&&pattern.length>1?'column':'unclassified';
    const boundary=face.ring.map(p=>p.map(n=>Math.round(n*1e6)/1e6));
    regions.push({_rawRing:face.rawRing,id:'structure_'+hash(fingerprint+JSON.stringify([pageNumber,boundary])),kind,boundary,holes:face.holes.map(h=>[...h].reverse()),bbox:face.box,area_source_units2:face.filledArea,
      material:{kind:'concrete',color:'#969b98',basis:'user_hatch_material_rule',confirmed:false},confirmed:false,
      evidence:{method:'closed_outline_with_repeated_hatch',pattern:pattern.length>1?'crosshatch':'diagonal',hatch_strokes:matches.length,coverage_ratio:coverage,boundary_layers:[...new Set(face.refs.map(r=>r.layer))],classification_basis:kind==='wall'?'elongated_or_thin_bent_footprint':kind==='column'?'compact_footprint':'ambiguous_footprint'},
      source_refs:[...face.refs,...matches.map(s=>s.ref)]});
  }
  // An unrelated line crossing a filled partition can split a face. Rejoin only
  // compatible wall patches; compact column footprints stay separate from walls.
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
    const a=regions[i],b=regions[j];
    if(a.holes.length||b.holes.length||a.kind==='column'||b.kind==='column'||(a.kind!=='wall'&&b.kind!=='wall')||a.evidence.pattern!==b.evidence.pattern)continue;
    const ring=joinAdjacent(a._rawRing,b._rawRing);if(!ring)continue;
    a._rawRing=ring;a.boundary=simplify(ring,epsilon).map(p=>p.map(n=>Math.round(n*1e6)/1e6));a.bbox=bounds(ring);a.area_source_units2=area(ring);a.kind='wall';
    a.source_refs=[...new Map([...a.source_refs,...b.source_refs].map(r=>[r.source_id,r])).values()];a.evidence.boundary_layers=[...new Set([...a.evidence.boundary_layers,...b.evidence.boundary_layers])];
    a.evidence.classification_basis='elongated_or_thin_bent_footprint';regions.splice(j,1);j=i;
  }
  used.clear();
  for(const region of regions){
    const matches=clipStrokes(strokes,region.boundary,region.holes,epsilon);for(const s of matches)used.add(s.sourceIndex);
    region.source_refs=[...new Map([...region.source_refs,...matches.map(s=>s.ref)].map(r=>[r.source_id,r])).values()];
    region.evidence.hatch_strokes=matches.length;region.evidence.coverage_ratio=median(repeatedPattern(matches,epsilon).map(p=>p.estimated_area))/region.area_source_units2;
    region.id='structure_'+hash(fingerprint+JSON.stringify([pageNumber,region.boundary]));delete region._rawRing;
  }
  regions.sort((a,b)=>b.bbox[3]-a.bbox[3]||a.bbox[0]-b.bbox[0]||a.id.localeCompare(b.id,'en'));
  return {regions,unassigned_hatch_strokes:strokes.length-used.size,unassigned_source_refs:strokes.filter((s,i)=>!used.has(i)).map(s=>s.ref),partial_regions:partial,hatch_strokes:strokes.length};
}

// OA furniture symbols contain thin, hollow border strips as well as large desk
// surfaces. The user identifies the strips as partitions. Seed only at labelled
// OA desks, then follow connected thin faces; never extrude the desk surface.
export function findOfficePartitions(paths,box,{fingerprint='',pageNumber=1,textItems=[],solidRegions=[]}={}){
  const labels=textItems.filter(t=>/辦公|办公|OA.*(?:家具|傢俱|傢具|屏風)/i.test(t.text.normalize('NFKC')));
  if(!labels.length)return [];
  const epsilon=1e-5,segments=[];
  for(const path of paths){
    if(!path.names.some(n=>/家具|傢俱|屏風|屏风|隔間|furniture|(?:^|[_ -])OA(?:$|[_ -])/i.test(n))||path.names.some(excluded))continue;
    for(const [i,[a,b]]of pathSegments(path).entries()){
      const dx=b[0]-a[0],dy=b[1]-a[1];if(Math.hypot(dx,dy)<epsilon||Math.abs(dx)>epsilon&&Math.abs(dy)>epsilon)continue;
      const axis=Math.abs(dy)<=epsilon?0:1;
      segments.push({axis,fixed:(a[1-axis]+b[1-axis])/2,lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis]),ref:{source_id:`pdf:${pageNumber}:${path.sourceOperatorIndex}:${i}`,layer:path.names.join(' / '),page:pageNumber,method:'office_panel_boundary'}});
    }
  }
  if(segments.length>3000)throw new Error('辦公區隔板線條過多，請縮小選區後重試。');
  const hatchStrokes=paths.filter(p=>p.names.some(hatchLayer)).flatMap(p=>pathSegments(p).map(points=>({points,length:distance(...points)})));
  const faces=closedFaces(segments,epsilon).filter(f=>{
    const center=[(f.box[0]+f.box[2])/2,(f.box[1]+f.box[3])/2];
    return !solidRegions.some(r=>insidePolygon(center,r.boundary)&&!r.holes.some(h=>insidePolygon(center,h)))&&!clipStrokes(hatchStrokes,f.ring,[],epsilon).length;
  });
  const anchors=labels.map(t=>faces.filter(f=>insidePolygon([(t.box[0]+t.box[2])/2,(t.box[1]+t.box[3])/2],f.ring)).sort((a,b)=>a.area-b.area)[0]).filter(Boolean);
  const thin=faces.filter(f=>{const w=f.box[2]-f.box[0],h=f.box[3]-f.box[1];return Math.max(w,h)/Math.min(w,h)>=8&&!anchors.includes(f);});
  const sharesEdge=(a,b)=>a.rawRing.some((p,i)=>{const q=a.rawRing[(i+1)%a.rawRing.length];return b.rawRing.some((r,j)=>{const s=b.rawRing[(j+1)%b.rawRing.length];return distance(p,s)<epsilon&&distance(q,r)<epsilon;});});
  const seeds=thin.filter(f=>anchors.some(a=>sharesEdge(f,a)));if(!seeds.length)return [];
  const thickness=median(seeds.map(f=>Math.min(f.box[2]-f.box[0],f.box[3]-f.box[1])));
  const caps=faces.filter(f=>!anchors.includes(f)&&Math.max(f.box[2]-f.box[0],f.box[3]-f.box[1])<=thickness*2);
  const candidates=[...new Set([...thin,...caps])],selected=new Set(seeds),queue=[...seeds];
  while(queue.length){const face=queue.shift();for(const other of candidates)if(!selected.has(other)&&sharesEdge(face,other)){selected.add(other);queue.push(other);}}
  const regions=[...selected].map(f=>({...f,rawRing:[...f.rawRing],refs:[...f.refs]}));
  for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++){
    const a=regions[i],b=regions[j],merged=joinAdjacent(a.rawRing,b.rawRing);if(!merged)continue;
    a.rawRing=merged;a.refs.push(...b.refs);regions.splice(j,1);j=i;
  }
  const result=[];
  for(const region of regions){
    const boundary=simplify(region.rawRing,epsilon).map(p=>p.map(v=>Math.round(v*1e6)/1e6));
    if(boundary.some(p=>p[0]<box[0]||p[0]>box[2]||p[1]<box[1]||p[1]>box[3]))continue;
    result.push({id:'office_partition_'+hash(fingerprint+JSON.stringify([pageNumber,boundary])),kind:'wall',boundary,holes:[],bbox:bounds(boundary),area_source_units2:area(boundary),
      material:{kind:'light_partition',color:'#c5a576',basis:'user_oa_parallel_panel_rule',confirmed:false},confirmed:false,
      evidence:{method:'labelled_oa_closed_parallel_strips',pattern:'none',semantic_type:'office_screen',area_labels:labels.filter(t=>anchors.some(a=>sharesEdge(region,a)&&insidePolygon([(t.box[0]+t.box[2])/2,(t.box[1]+t.box[3])/2],a.ring))).map(t=>t.text),boundary_layers:[...new Set(region.refs.map(r=>r.layer))],classification_basis:'office_label_and_unfilled_thin_closed_faces',note:'辦公標示旁無填充的空心隔板視為辦公屏風；實體填充優先排除，保留桌面與座位區。'},
      source_refs:[...new Map(region.refs.map(r=>[r.source_id,r])).values()]});
  }
  return result.sort((a,b)=>b.bbox[3]-a.bbox[3]||a.bbox[0]-b.bbox[0]||a.id.localeCompare(b.id,'en'));
}

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
