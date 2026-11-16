// Format-independent geometry. No source file parsers, DOM, Three.js or exporters.
import earcut, { deviation } from '../../vendor/earcut/earcut.js';
export const EPS = 1e-7;
export const area = ring => ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const onSegment = (a,b,p) => Math.abs(cross(a,b,p)) < EPS && p[0]>=Math.min(a[0],b[0])-EPS && p[0]<=Math.max(a[0],b[0])+EPS && p[1]>=Math.min(a[1],b[1])-EPS && p[1]<=Math.max(a[1],b[1])+EPS;
function intersects(a,b,c,d) {
  const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
  return (x*y < -EPS && z*w < -EPS) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
}
function inside(p,ring) {
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if(onSegment(a,b,p))return false;
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
function ringsTouch(a,b) {
  return a.some((p,i)=>b.some((q,j)=>intersects(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));
}
export function polygonIssue(outer, holes = []) {
  for(const [index,ring] of [outer,...holes].entries()) {
    if(Math.abs(area(ring))<EPS || (index===0?area(ring)<=0:area(ring)>=0))return '外環須逆時針，洞環須順時針且具有面積。';
    for(let i=0;i<ring.length;i++) {
      if(Math.hypot(ring[i][0]-ring[(i+1)%ring.length][0],ring[i][1]-ring[(i+1)%ring.length][1])<EPS)return '多邊形包含重複頂點或零長度邊。';
      for(let j=i+1;j<ring.length;j++) {
        if(j===i+1 || (i===0&&j===ring.length-1))continue;
        if(intersects(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length]))return '多邊形邊界自交或接觸。';
      }
    }
  }
  for(let i=0;i<holes.length;i++) {
    if(!inside(holes[i][0],outer)||ringsTouch(outer,holes[i]))return '洞環超出或接觸外環。';
    for(let j=0;j<i;j++)if(ringsTouch(holes[i],holes[j])||inside(holes[i][0],holes[j])||inside(holes[j][0],holes[i]))return '洞環互相重疊、接觸或包覆。';
  }
  return null;
}

export function extrudePolygon(outer,holes,zBottom,zTop,material) {
  const rings=[outer,...holes],points=rings.flat(),holeIndices=[];
  let offset=outer.length; for(const hole of holes){holeIndices.push(offset);offset+=hole.length;}
  const flat=points.flat(),triangles=earcut(flat,holeIndices,2),n=points.length;
  if(!triangles.length||deviation(flat,holeIndices,2,triangles)>1e-6)throw new Error('輪廓三角化的面積不一致。');
  const vertices_mm=[...points.map(p=>[...p,zBottom]),...points.map(p=>[...p,zTop])],faces=[];
  const add=indices=>faces.push({indices,material_id:material});
  for(let i=0;i<triangles.length;i+=3){
    const t=triangles.slice(i,i+3);if(cross(...t.map(k=>points[k]))<0)t.reverse();
    add(t.map(k=>k+n));add([...t].reverse());
  }
  offset=0;
  for(const ring of rings){for(let i=0;i<ring.length;i++){const a=offset+i,b=offset+(i+1)%ring.length;add([a,b,b+n,a+n]);}offset+=ring.length;}
  return {vertices_mm,faces};
}

export function wallBox(wall,base,x0,x1,z0,z1) {
  const length=Math.hypot(wall.end_mm[0]-wall.start_mm[0],wall.end_mm[1]-wall.start_mm[1]);
  const ux=(wall.end_mm[0]-wall.start_mm[0])/length,uy=(wall.end_mm[1]-wall.start_mm[1])/length,t=wall.thickness_mm/2;
  const vertices_mm=[[x0,-t,z0],[x1,-t,z0],[x1,t,z0],[x0,t,z0],[x0,-t,z1],[x1,-t,z1],[x1,t,z1],[x0,t,z1]]
    .map(([x,y,z])=>[wall.start_mm[0]+ux*x-uy*y,wall.start_mm[1]+uy*x+ux*y,base+z]);
  return {vertices_mm,faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(indices=>({indices,material_id:wall.material_id}))};
}

// Generated solids must be closed, nondegenerate and have outward orientation.
export function meshIssue(mesh) {
  const edges=new Map();let volume=0;
  for(const face of mesh.faces) {
    if(new Set(face.indices).size!==face.indices.length||face.indices.some(i=>!Number.isInteger(i)||i<0||i>=mesh.vertices_mm.length))return '網格面索引無效。';
    const a=mesh.vertices_mm[face.indices[0]];let faceArea=0;
    for(let i=1;i<face.indices.length-1;i++) {
      const b=mesh.vertices_mm[face.indices[i]],c=mesh.vertices_mm[face.indices[i+1]],u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      faceArea+=Math.hypot(...normal)/2;
      volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    }
    if(faceArea<EPS)return '網格含有退化面。';
    for(let i=0;i<face.indices.length;i++) {
      const a=face.indices[i],b=face.indices[(i+1)%face.indices.length],key=[Math.min(a,b),Math.max(a,b)].join(':');
      const edge=edges.get(key)||{count:0,balance:0};edge.count++;edge.balance+=a<b?1:-1;edges.set(key,edge);
    }
  }
  if([...edges.values()].some(e=>e.count!==2||e.balance!==0))return '網格沒有形成封閉且方向一致的實體。';
  return volume>EPS?null:'網格體積或法線方向無效。';
}
