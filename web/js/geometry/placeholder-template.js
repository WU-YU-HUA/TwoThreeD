import {polygonIssue} from './model-geometry.js';
import {hostFootprint} from './model-fitting.js';
function inside(p,ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
export function placeholderIssue(object,level){
  const issue=polygonIssue(object.boundary_mm,object.holes_mm);if(issue)return issue;
  if(!inside(object.position_mm,object.boundary_mm)||object.holes_mm.some(h=>inside(object.position_mm,h)))return '設備定位點不在來源物件輪廓內。';
  if(object.support_id===null)return null;
  const host=level.furniture.find(o=>o.id===object.support_id);
  if(!host||!(['cabinet','tall_cabinet','table'].includes(host.kind)||(host.kind==='model_object'&&['cabinet','tall_cabinet'].includes(host.role)&&host.support_id===null)))return '設備必須指向同樓層的桌子或櫃子，不能缺少承載物或循環參照。';
  let boundary=host.boundary_mm,holes=host.holes_mm||[];
  if(!boundary)boundary=hostFootprint(host);
  if(!inside(object.position_mm,boundary)||holes.some(h=>inside(object.position_mm,h)))return '設備定位點不在指定承載物的有效檯面上。';
  return null;
}
export function buildPlaceholder(object,level){
  const issue=placeholderIssue(object,level);if(issue)throw new Error(issue);
  const host=object.support_id===null?null:level.furniture.find(o=>o.id===object.support_id);
  const z=level.base_elevation_mm+(host?.height_mm||0)+object.hover_mm,e=object.cube_edge_mm/2,[x,y]=object.position_mm;
  const vertices_mm=[[x-e,y-e,z],[x+e,y-e,z],[x+e,y+e,z],[x-e,y+e,z],[x-e,y-e,z+2*e],[x+e,y-e,z+2*e],[x+e,y+e,z+2*e],[x-e,y+e,z+2*e]];
  const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(indices=>({indices,material_id:object.material_id}));
  return {mesh:{vertices_mm,faces},...(object.template_id==='builtin.marker_cube.v1'?{}:{face_labels:faces.map((_,face_index)=>({face_index,text:object.label_text}))})};
}
