// Renderer-independent, world-XY tabletop with separate editable supports.
import {area,polygonIssue,extrudePolygon} from './model-geometry.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function edgeDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return distance(p,[a[0]+t*dx,a[1]+t*dy]);}

export function tableIssue(object){
  if(object.top_thickness_mm>=object.height_mm)return '桌板厚度必須小於桌面高度。';
  return polygonIssue(object.boundary_mm,object.holes_mm);
}

export function buildTableParts(object,base=0){
  const issue=tableIssue(object);if(issue)throw new Error(issue);
  const {boundary_mm:ring,holes_mm:holes,height_mm:h,top_thickness_mm:t}=object;
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),short=Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
  const leg=Math.min(50,short*.08),inset=Math.min(130,short*.2),candidates=[];
  const fits=p=>inside(p,ring)&&!holes.some(r=>inside(p,r))&&[ring,...holes].every(r=>r.every((a,i)=>edgeDistance(p,a,r[(i+1)%r.length])>leg/Math.sqrt(2)+1));
  let perimeter=0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],length=distance(a,b),dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length;perimeter+=length;
    const count=Math.max(1,Math.ceil(length/150));
    for(let j=0;j<count;j++){const u=(j+.5)/count,p=[a[0]+(b[0]-a[0])*u-dy*inset,a[1]+(b[1]-a[1])*u+dx*inset];if(fits(p))candidates.push(p);}
  }
  if(candidates.length<3)throw new Error('桌面過窄或形狀尚不支援安全放置示意桌腳。');
  candidates.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const supports=[candidates[0]],count=Math.min(12,Math.max(4,Math.ceil(perimeter/1800)));
  while(supports.length<count){
    let best=null,separation=leg*3;
    for(const p of candidates){const d=Math.min(...supports.map(q=>distance(p,q)));if(d>separation){best=p;separation=d;}}
    if(!best)break;supports.push(best);
  }
  if(supports.length<3||Math.abs(area(supports.slice(0,3)))<leg*leg)throw new Error('無法在桌面內建立有效的支撐配置。');
  const parts=[{id:'tabletop',mesh:extrudePolygon(ring,holes,base+h-t,base+h,object.material_id)}];
  supports.forEach(([x,y],i)=>parts.push({id:'leg_'+i,mesh:extrudePolygon([[x-leg/2,y-leg/2],[x+leg/2,y-leg/2],[x+leg/2,y+leg/2],[x-leg/2,y+leg/2]],[],base,base+h-t,object.accent_material_id)}));
  return parts;
}
