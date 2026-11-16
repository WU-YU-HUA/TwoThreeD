// PDF evidence only. Empty furniture faces become tables by the user's rule.
// Smooth closed curves retain their actual outline and nested openings.
import {closedFaces,insidePolygon,joinAdjacent} from './structure-analysis.js';
import {resolveTableChairContacts} from './table-chair-connections.js';
const area=r=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const bounds=r=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const round=n=>Math.round(n*1e6)/1e6;
const hash=s=>{let h=2166136261;for(const c of s){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
const canonical=ring=>{
  let r=ring.filter((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-8;}).map(p=>p.map(round));
  if(area(r)<0)r.reverse();let first=0;for(let i=1;i<r.length;i++)if(r[i][0]<r[first][0]||r[i][0]===r[first][0]&&r[i][1]<r[first][1])first=i;
  return [...r.slice(first),...r.slice(0,first)];
};
const contained=(ring,box)=>ring.every(p=>p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]);
const pointSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return distance(p,[a[0]+t*dx,a[1]+t*dy]);};
const strictlyInside=(p,r,tol)=>insidePolygon(p,r)&&r.every((a,i)=>pointSegment(p,a,r[(i+1)%r.length])>tol);
function edgesFor(path,page,scale){
  const edges=[];let prev=null,start=null;
  for(const [i,c]of (path.commands||[]).entries()){
    if(c.op==='move_to'){prev=start=c.points[0];continue;}
    if(!prev)continue;
    let points,curve=false;
    if(c.op==='line_to')points=[prev,c.points[0]];
    else if(c.op==='close_path'&&start)points=[prev,start];
    else if(c.op==='cubic_bezier_to'){
      curve=true;const [a,b,d]=c.points;
      // Adaptive subdivision: control polygon distance from chord <= 0.5 mm.
      points=[prev];const mid=(a,b)=>a.map((v,k)=>(v+b[k])/2);
      const sample=(p,a,b,d,depth=0)=>{
        if(depth>=12||Math.max(pointSegment(a,p,d),pointSegment(b,p,d))*scale<=.5){points.push(d);return;}
        const pa=mid(p,a),ab=mid(a,b),bd=mid(b,d),pab=mid(pa,ab),abd=mid(ab,bd),m=mid(pab,abd);
        sample(p,pa,pab,m,depth+1);sample(m,abd,bd,d,depth+1);
      };sample(prev,a,b,d);
    }else{prev=null;continue;}
    prev=points.at(-1);if(distance(points[0],prev)<1e-7)continue;
    edges.push({points,curve,ref:{source_id:`pdf:${page}:${path.sourceOperatorIndex}:${i}`,layer:path.names.join(' / '),page,method:'table_outline'}});
  }return edges;
}

// Follow the smoothest continuation at a curve/straight seam. Radial panel
// seams turn 90 degrees and are not mistaken for the outer/inner oval edges.
// Only endpoint quantization gaps <= tolerance are joined; missing arcs fail.
function curvedLoops(edges,tolerance){
  const vertices=[],edgeMap=new Map();
  const vertex=p=>{let id=vertices.findIndex(v=>distance(v.p,p)<=tolerance);if(id<0){id=vertices.length;vertices.push({p,edges:[]});}return id;};
  for(const edge of [...edges].sort((a,b)=>JSON.stringify(a.points).localeCompare(JSON.stringify(b.points),'en'))){
    const a=vertex(edge.points[0]),b=vertex(edge.points.at(-1));if(a===b)continue;
    const key=[a,b].sort((a,b)=>a-b).join(':')+':'+Number(edge.curve);if(edgeMap.has(key))continue;
    const e={...edge,a,b,points:[vertices[a].p,...edge.points.slice(1,-1),vertices[b].p]};edgeMap.set(key,e);vertices[a].edges.push(e);vertices[b].edges.push(e);
  }
  const loops=new Map(),directed=(e,v)=>e.a===v?e.points:[...e.points].reverse();
  for(const initial of edgeMap.values()){
    if(!initial.curve)continue;
    let edge=initial,v=initial.a;const ring=[],refs=[],seen=new Set();let closed=false;
    for(let steps=0;steps<=edgeMap.size;steps++){
      if(seen.has(v)){closed=v===initial.a&&edge===initial;break;}seen.add(v);
      const pts=directed(edge,v);ring.push(...pts.slice(0,-1));refs.push(edge.ref);
      const end=pts.at(-1),last=pts.at(-2),heading=Math.atan2(end[1]-last[1],end[0]-last[0]);v=edge.a===v?edge.b:edge.a;
      const choices=vertices[v].edges.filter(e=>e!==edge).map(e=>{const p=directed(e,v)[1],delta=Math.atan2(p[1]-end[1],p[0]-end[0])-heading;return {e,turn:Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))};}).sort((a,b)=>a.turn-b.turn);
      if(!choices.length||choices.length>1&&choices[1].turn-choices[0].turn<.01)break;
      edge=choices[0].e;
    }
    if(closed&&ring.length>=12&&Math.abs(area(ring))>tolerance*tolerance){const boundary=canonical(ring);loops.set(JSON.stringify(boundary),{ring:boundary,refs});}
  }return [...loops.values()];
}

export function findTables(paths,box,{fingerprint='',pageNumber=1,mmPerSourceUnit=null,referenceGap=null,textItems=[],occupied=[],namedObjectPredicate=()=>false}={}){
  if(!(mmPerSourceUnit>0)||!(referenceGap>0))return {objects:[],diagnostics:[{code:'W_TABLE_SCALE_REQUIRED',message:'桌面辨識需要有效的參考牆比例。'}]};
  const eligible=p=>p.names.some(n=>/家具|傢俱|furniture|table|desk|桌|木作/i.test(n))&&!p.names.some(n=>/hatch|填充|圖框|尺寸|標註|frame|dimension/i.test(n));
  const unique=new Map();for(const p of paths)if(p.commands?.length)unique.set(JSON.stringify([p.names,p.commands]),p);
  const selected=[...unique.values()].filter(eligible),edges=selected.flatMap(p=>edgesFor(p,pageNumber,mmPerSourceUnit)),allEdges=[...unique.values()].filter(p=>!p.names.some(n=>/尺寸|標註|dimension|frame|圖框/i.test(n))).flatMap(p=>edgesFor(p,pageNumber,mmPerSourceUnit));
  if(edges.length>4000)throw new Error('桌面候選線條過多，請縮小選區後重新萃取。');
  const tolerance=Math.min(.2,referenceGap*.025),center=r=>{const b=bounds(r);return[(b[0]+b[2])/2,(b[1]+b[3])/2];};
  const overlapsKnown=ring=>occupied.some(o=>strictlyInside(center(ring),o.boundary,tolerance)||strictlyInside(center(o.boundary),ring,tolerance));
  const nonTableLabels=textItems.filter(t=>namedObjectPredicate(t.text)||/櫃|柜|白板|機|机|冰箱|爐|炉|烘碗|飲水|饮水|電鍋|电锅|雨傘|雨伞|設備/i.test(t.text.normalize('NFKC')));
  const labelledOther=ring=>nonTableLabels.some(t=>insidePolygon([(t.box[0]+t.box[2])/2,(t.box[1]+t.box[3])/2],ring));
  const loops=curvedLoops(edges,tolerance);
  const contains=(a,b)=>area(a.ring)>area(b.ring)&&b.ring.every(p=>strictlyInside(p,a.ring,tolerance));
  const outwardConnections=(ring,source=edges)=>source.filter(e=>[e.points[0],e.points.at(-1)].some(p=>ring.some((a,i)=>pointSegment(p,a,ring[(i+1)%ring.length])<=tolerance))&&e.points.some(p=>!insidePolygon(p,ring,tolerance)));
  // Establish nesting before crop filtering: an inner opening must never turn
  // into a standalone filled table when its outer outline crosses the crop.
  const curves=loops.filter(f=>!loops.some(p=>p!==f&&contains(p,f))).map(f=>({...f,holes:loops.filter(h=>contains(f,h)&&!loops.some(p=>p!==f&&p!==h&&contains(f,p)&&contains(p,h))).map(h=>h.ring.slice().reverse())}));
  const segments=edges.filter(e=>!e.curve).flatMap(e=>{const [a,b]=e.points,dx=b[0]-a[0],dy=b[1]-a[1];if(Math.abs(dx)>1e-5&&Math.abs(dy)>1e-5)return[];const axis=Math.abs(dy)<1e-5?0:1;return[{axis,fixed:(a[1-axis]+b[1-axis])/2,lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis]),ref:e.ref}];});
  let faces=closedFaces(segments,1e-5).filter(f=>{
    const w=(f.box[2]-f.box[0])*mmPerSourceUnit,d=(f.box[3]-f.box[1])*mmPerSourceUnit;
    if(Math.min(w,d)<300||Math.max(w,d)>6000||Math.max(w,d)/Math.min(w,d)>8||!contained(f.ring,box)||overlapsKnown(f.ring)||labelledOther(f.ring)||curves.some(c=>f.ring.every(p=>insidePolygon(p,c.ring,tolerance))))return false;
    // Empty means no internal hatch/X/symbol/other outline, not merely no text.
    return !allEdges.some(e=>e.points.slice(1).some((p,i)=>strictlyInside([(p[0]+e.points[i][0])/2,(p[1]+e.points[i][1])/2],f.ring,tolerance)));
  });
  for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
    const a=faces[i],b=faces[j],ring=joinAdjacent(a.rawRing,b.rawRing);if(!ring)continue;
    a.rawRing=ring;a.ring=canonical(ring);a.refs.push(...b.refs);faces.splice(j,1);j=i;
  }
  const acceptedCurves=[];
  for(const f of curves){
    if(!contained(f.ring,box)||overlapsKnown(f.ring)||labelledOther(f.ring))continue;
    if(!outwardConnections(f.ring).length){acceptedCurves.push({...f,curved:true});continue;}
    // Keep the old acceptance path unchanged. A rejected curve can only be
    // rescued if each outline closes independently and all outgoing contacts
    // have an unambiguous, separately drawn chair front coincident with it.
    const outlines=[f,...loops.filter(l=>f.holes.some(h=>JSON.stringify(canonical(h))===JSON.stringify(l.ring)))];
    const tablePaths=new Set(outlines.flatMap(l=>l.refs.map(r=>r.source_id.split(':').slice(0,3).join(':'))));
    const tableEdges=edges.filter(e=>tablePaths.has(e.ref.source_id.split(':').slice(0,3).join(':')));
    const ownLoops=curvedLoops(tableEdges,tolerance);
    if(outlines.some(l=>!ownLoops.some(o=>JSON.stringify(o.ring)===JSON.stringify(l.ring))))continue;
    const contacts=resolveTableChairContacts({ring:f.ring,tableEdges,connections:outwardConnections(f.ring,allEdges),edges:allEdges,crossingEdges:edges,occupied,tolerance,scale:mmPerSourceUnit});
    if(contacts)acceptedCurves.push({...f,curved:true,chairContacts:contacts});
  }
  const objects=[...acceptedCurves,...faces].map(f=>{
    const boundary=canonical(f.ring),holes=(f.holes||[]).map(h=>canonical(h).reverse()),refs=new Map(f.refs.map(r=>[r.source_id,r]));
    // Include inner-loop evidence so the opening can be traced back to the PDF.
    for(const hole of holes)for(const loop of loops)if(JSON.stringify(canonical(hole))===JSON.stringify(loop.ring))for(const r of loop.refs)refs.set(r.source_id,r);
    return {id:'table_'+hash(fingerprint+JSON.stringify([pageNumber,boundary,holes])),kind:'table',boundary,holes,bbox:bounds(boundary),area_source_units2:area(boundary)+holes.reduce((s,h)=>s+area(h),0),confirmed:false,
      material:{kind:'table_wood',color:'#dec99d',basis:'user_empty_furniture_outline_rule',confirmed:false},
      evidence:{method:f.curved?'closed_curved_table_outline':'empty_closed_furniture_faces',pattern:'none',boundary_layers:[...new Set([...refs.values()].map(r=>r.layer))],classification_basis:'user_empty_outline_is_table',note:f.curved?'保留曲線桌面與內部留空。':'空白家具框視為桌面；相鄰桌面合併，保留凹角。',...(f.chairContacts?{connection_basis:'independent_closed_contours_with_coincident_edges',chair_contacts:f.chairContacts}:{})},
      source_refs:[...refs.values()].sort((a,b)=>a.source_id.localeCompare(b.source_id,'en'))};
  });
  return {objects:objects.sort((a,b)=>b.bbox[3]-a.bbox[3]||a.bbox[0]-b.bbox[0]||a.id.localeCompare(b.id,'en')),diagnostics:[]};
}
