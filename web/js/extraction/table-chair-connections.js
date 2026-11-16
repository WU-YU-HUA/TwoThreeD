// Resolve a contact only from two independently drawn contours. Never remove
// source edges, fill a missing table edge, or infer ownership from proximity.
import {insidePolygon} from './structure-analysis.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const pathId=ref=>ref.source_id.split(':').slice(0,3).join(':');
function projection(p,a,b){
  const v=b.map((n,i)=>n-a[i]),length=distance(a,b);
  const t=length?Math.max(0,Math.min(1,dot(p.map((n,i)=>n-a[i]),v)/(length*length))):0;
  return {distance:distance(p,a.map((n,i)=>n+t*v[i])),along:t*length};
}
const boundaryDistance=(p,ring)=>Math.min(...ring.map((a,i)=>projection(p,a,ring[(i+1)%ring.length]).distance));
const strictlyInside=(p,ring,tol)=>insidePolygon(p,ring)&&boundaryDistance(p,ring)>tol;
function crossesInterior(edge,ring,tolerance){
  if(!edge.points.some(p=>!insidePolygon(p,ring,tolerance)))return false;
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  for(let i=1;i<edge.points.length;i++){
    const a=edge.points[i-1],b=edge.points[i],v=b.map((n,k)=>n-a[k]),cuts=[0,1];
    for(let j=0;j<ring.length;j++){
      const c=ring[j],d=ring[(j+1)%ring.length],w=d.map((n,k)=>n-c[k]),delta=c.map((n,k)=>n-a[k]),denom=cross(v,w);
      if(Math.abs(denom)<1e-12)continue;
      const t=cross(delta,w)/denom,u=cross(delta,v)/denom;
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
      const t=(cuts[j-1]+cuts[j])/2;
      if(strictlyInside(a.map((n,k)=>n+v[k]*t),ring,tolerance))return true;
    }
  }
  return false;
}

// A seat edge must have a return route through its own glyph. Endpoints may
// meet the interior of a backrest curve; split those contacts in this local
// graph only. The existing PDF quantization tolerance is not enlarged.
function hasOwnReturnRoute(front,edges,tolerance){
  const vertices=[];
  const vertex=p=>{
    let i=vertices.findIndex(v=>distance(v.p,p)<=tolerance);
    if(i<0){i=vertices.length;vertices.push({p,links:new Set()});}return i;
  };
  const ends=new Map(edges.map(e=>[e,[vertex(e.points[0]),vertex(e.points.at(-1))]]));
  const [start,end]=ends.get(front);if(start===end)return false;
  for(const edge of edges){
    if(edge===front)continue;
    const hits=[];
    for(let i=0;i<vertices.length;i++){
      let offset=0,best=null;
      for(let j=1;j<edge.points.length;j++){
        const a=edge.points[j-1],b=edge.points[j],hit=projection(vertices[i].p,a,b);
        if(hit.distance<=tolerance&&(!best||hit.distance<best.distance))best={distance:hit.distance,along:offset+hit.along};
        offset+=distance(a,b);
      }
      if(best)hits.push({i,along:best.along});
    }
    hits.sort((a,b)=>a.along-b.along||a.i-b.i);
    for(let i=1;i<hits.length;i++){
      const a=hits[i-1].i,b=hits[i].i;vertices[a].links.add(b);vertices[b].links.add(a);
    }
  }
  const seen=new Set([start]),pending=[start];
  while(pending.length){const i=pending.pop();for(const next of vertices[i].links)if(!seen.has(next)){if(next===end)return true;seen.add(next);pending.push(next);}}
  return false;
}

export function resolveTableChairContacts({ring,tableEdges,connections,edges,crossingEdges,occupied,tolerance,scale}){
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),w=(Math.max(...xs)-Math.min(...xs))*scale,d=(Math.max(...ys)-Math.min(...ys))*scale;
  // Apply the existing rectangular-table size limits to newly rescued curves.
  if(Math.min(w,d)<300||Math.max(w,d)>6000||Math.max(w,d)/Math.min(w,d)>8)return null;
  const owners=new Map();
  for(const object of occupied)for(const id of new Set((object.source_refs||[]).map(pathId))){
    if(!owners.has(id))owners.set(id,[]);owners.get(id).push(object);
  }
  if(tableEdges.some(e=>owners.has(pathId(e.ref))))return null;
  const tablePaths=new Set(tableEdges.map(e=>pathId(e.ref)));
  // Use the existing furniture-layer scope for interior crossings. Generic
  // drawing layers may contain dimension ticks crossing a furniture boundary.
  if(crossingEdges.some(e=>!tablePaths.has(pathId(e.ref))&&crossesInterior(e,ring,tolerance)))return null;
  // Also inspect nearby chairs without a touching endpoint. A seat moved
  // through the table must not disappear from the contact checks.
  if(edges.some(e=>owners.get(pathId(e.ref))?.some(o=>o.kind==='chair')&&
    e.points.some(p=>strictlyInside(p,ring,tolerance))))return null;
  const chairs=new Set();
  for(const edge of connections){
    const found=owners.get(pathId(edge.ref));
    if(found?.length!==1||found[0].kind!=='chair'||!['rounded_chair_symbol','armrest_office_chair_symbol'].includes(found[0].evidence?.method))return null;
    chairs.add(found[0]);
  }
  const contacts=[];
  for(const chair of chairs){
    const owned=edges.filter(e=>owners.get(pathId(e.ref))?.includes(chair));
    if(!owned.length||owned.some(e=>owners.get(pathId(e.ref)).length!==1))return null;
    const a=chair.rotation_deg*Math.PI/180,normal=[-Math.sin(a),Math.cos(a)];
    if(!chair.position||!Number.isFinite(a)||!(chair.width>0)||!(chair.depth>0))return null;
    if(insidePolygon(chair.position,ring)||owned.some(e=>e.points.some(p=>strictlyInside(p,ring,tolerance))))return null;
    const front=owned.filter(e=>{
      if(e.curve)return false;
      const [p,q]=[e.points[0],e.points.at(-1)],length=distance(p,q),mid=p.map((n,i)=>(n+q[i])/2);
      return length>=chair.width*.35&&Math.abs(dot(q.map((n,i)=>(n-p[i])/length),normal))<.03&&
        Math.abs(dot(mid.map((n,i)=>n-chair.position[i]),normal)-chair.depth/2)<=tolerance;
    });
    if(front.length!==1)return null;
    const seat=front[0],p=seat.points[0],q=seat.points.at(-1),mid=p.map((n,i)=>(n+q[i])/2);
    // Both independent straight segments must cover the same interval. Nearby
    // parallel lines or a point-only touch are insufficient evidence.
    const supports=tableEdges.filter(e=>!e.curve&&pathId(e.ref)!==pathId(seat.ref)&&
      [p,q].every(v=>projection(v,e.points[0],e.points.at(-1)).distance<=1e-5));
    if(!supports.length||!hasOwnReturnRoute(seat,owned,tolerance))return null;
    if(!strictlyInside(mid.map((v,i)=>v+normal[i]*tolerance*4),ring,tolerance)||
      insidePolygon(mid.map((v,i)=>v-normal[i]*tolerance*4),ring))return null;
    contacts.push({chair_id:chair.id,chair_front_source:seat.ref.source_id,
      table_edge_sources:supports.map(e=>e.ref.source_id).sort(),
      connection_sources:connections.filter(e=>owners.get(pathId(e.ref))?.[0]===chair).map(e=>e.ref.source_id).sort()});
  }
  return contacts.length?contacts.sort((a,b)=>a.chair_id.localeCompare(b.chair_id,'en')):null;
}
