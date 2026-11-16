// Format-independent door poses and positive-area collision checks, in millimetres.
import earcut from '../../vendor/earcut/earcut.js';
import {EPS,polygonIssue,wallBox} from './model-geometry.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

export function doorIssue(door){
  const ring=door.boundary_mm,issue=polygonIssue(ring);if(issue)return issue;
  if(ring.length!==4)return '目前門片須為四角矩形輪廓。';
  for(let i=0;i<4;i++){
    const a=ring[i],b=ring[(i+1)%4],c=ring[(i+2)%4],u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-b[k]);
    if(Math.abs(u[0]*v[0]+u[1]*v[1])>distance(a,b)*distance(b,c)*1e-5)return '門片輪廓不是矩形。';
  }
  const index=ring.findIndex(p=>distance(p,door.hinge_mm)<1e-4);if(index<0)return '門軸必須位於門片角點。';
  const widths=[distance(ring[index],ring[(index+1)%4]),distance(ring[index],ring[(index+3)%4])];
  const width=Math.max(...widths),thickness=Math.min(...widths);
  if(width<thickness*5)return '門片長寬比例無法辨識開啟方向。';
  if(Math.abs(distance(door.hinge_mm,door.closed_end_mm)-width)>Math.max(1,width*.01))return '關閉位置與門片寬度不一致。';
  return null;
}

export function doorPoses(door){
  const ring=door.boundary_mm,hinge=door.hinge_mm,index=ring.findIndex(p=>distance(p,hinge)<1e-4);
  const adjacent=[ring[(index+1)%4],ring[(index+3)%4]],tip=adjacent.sort((a,b)=>distance(b,hinge)-distance(a,hinge))[0];
  const angle=Math.atan2(door.closed_end_mm[1]-hinge[1],door.closed_end_mm[0]-hinge[0])-Math.atan2(tip[1]-hinge[1],tip[0]-hinge[0]);
  const c=Math.cos(angle),s=Math.sin(angle);
  return [ring,ring.map(p=>{const x=p[0]-hinge[0],y=p[1]-hinge[1];return [hinge[0]+c*x-s*y,hinge[1]+s*x+c*y];})];
}

function triangles(boundary,holes=[]){
  const points=[boundary,...holes].flat(),indices=[];let n=boundary.length;
  for(const hole of holes){indices.push(n);n+=hole.length;}
  const mesh=earcut(points.flat(),indices,2),result=[];
  for(let i=0;i<mesh.length;i+=3)result.push(mesh.slice(i,i+3).map(j=>points[j]));
  return result;
}
function trianglesOverlap(a,b){
  for(const triangle of [a,b])for(let i=0;i<3;i++){
    const p=triangle[i],q=triangle[(i+1)%3],length=distance(p,q),axis=[(p[1]-q[1])/length,(q[0]-p[0])/length];
    const project=ring=>ring.map(p=>p[0]*axis[0]+p[1]*axis[1]),pa=project(a),pb=project(b);
    if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=EPS)return false;
  }
  return true;
}
export function polygonsOverlap(a,b,holes=[]){
  const ta=triangles(a),tb=triangles(b,holes);return ta.some(x=>tb.some(y=>trianglesOverlap(x,y)));
}

export function doorCollision(door,level){
  const poses=doorPoses(door);
  for(const object of [...level.walls,...(level.columns||[])]){
    let footprints=[];
    if(object.boundary_mm)footprints=[{boundary:object.boundary_mm,holes:object.holes_mm}];
    else{
      const length=distance(object.start_mm,object.end_mm),openings=level.openings.filter(o=>o.wall_id===object.id);
      const xs=[...new Set([0,length,...openings.flatMap(o=>[o.offset_from_start_mm,o.offset_from_start_mm+o.width_mm])])].sort((a,b)=>a-b);
      for(let i=1;i<xs.length;i++){
        const mid=(xs[i-1]+xs[i])/2;
        if(openings.some(o=>mid>o.offset_from_start_mm&&mid<o.offset_from_start_mm+o.width_mm&&o.sill_height_mm===0&&o.height_mm>=Math.min(door.height_mm,object.height_mm)))continue;
        footprints.push({boundary:wallBox(object,0,xs[i-1],xs[i],0,1).vertices_mm.slice(0,4).map(p=>p.slice(0,2)),holes:[]});
      }
    }
    if(footprints.some(f=>poses.some(p=>polygonsOverlap(p,f.boundary,f.holes))))return object.id;
  }
  return null;
}
