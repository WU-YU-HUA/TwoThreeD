// Pure millimetre geometry shared by Transfer and its tests. No renderer types.
import {validateScene3D} from '../contracts/validators.generated.js';
import {polygonIssue} from './model-geometry.js';
// Boundary-inclusive containment; tolerance is expressed in model millimetres.
function insidePolygon(point,ring,epsilon=1e-5){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length&&Math.abs(dx*(point[1]-a[1])-dy*(point[0]-a[0]))/length<=epsilon&&point[0]>=Math.min(a[0],b[0])-epsilon&&point[0]<=Math.max(a[0],b[0])+epsilon&&point[1]>=Math.min(a[1],b[1])-epsilon&&point[1]<=Math.max(a[1],b[1])+epsilon)return true;
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

export function meshBounds(meshes){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const mesh of meshes)for(const p of mesh.vertices_mm)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  return {min,max,size:max.map((v,i)=>v-min[i])};
}
export function surfaceIssue(mesh){
  if(!mesh?.vertices_mm?.length||!mesh.faces?.length||mesh.vertices_mm.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))return '模型頂點無效。';
  for(const f of mesh.faces){
    if(f.indices.length!==3||new Set(f.indices).size!==3||f.indices.some(i=>!Number.isInteger(i)||i<0||i>=mesh.vertices_mm.length))return '模型三角形索引無效。';
    const [a,b,c]=f.indices.map(i=>mesh.vertices_mm[i]),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-8)return '模型包含退化三角形。';
  }
  return null;
}
export function validateModelScene(scene,assetId){
  if(!validateScene3D(scene)||scene.extensions?.model_asset?.id!==assetId)throw new Error('模型幾何契約或素材 ID 無效。');
  const mats=new Set(scene.materials.map(m=>m.id)),ids=new Set();
  if(mats.size!==scene.materials.length)throw new Error('模型材質 ID 重複。');
  for(const n of scene.nodes){
    if(ids.has(n.id)||n.parent_id!==null||n.kind!=='mesh'||!n.mesh)throw new Error('素材必須是已展開座標的獨立網格。');ids.add(n.id);
    const issue=surfaceIssue(n.mesh);if(issue)throw new Error(issue);
    if(n.mesh.faces.some(f=>!mats.has(f.material_id)))throw new Error('模型材質參照缺失。');
  }
  const b=meshBounds(scene.nodes.map(n=>n.mesh));
  if(b.size.some(n=>!Number.isFinite(n)||n<=0)||Math.abs(b.min[2])>.001||Math.abs(b.min[0]+b.max[0])>.001||Math.abs(b.min[1]+b.max[1])>.001)throw new Error('素材必須以毫米表示、XY 置中且底部為零。');
  return b;
}
export function hostFootprint(host){
  if(host.boundary_mm)return host.boundary_mm;
  const a=host.rotation_deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),w=host.width_mm/2,d=host.depth_mm/2;
  return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,y])=>[host.position_mm[0]+c*x-s*y,host.position_mm[1]+s*x+c*y]);
}
export function modelObjectIssue(o,level){
  const issue=polygonIssue(o.boundary_mm,o.holes_mm);if(issue)return issue;
  if(![o.width_mm,o.depth_mm,o.rotation_deg,...o.position_mm].every(Number.isFinite)||o.width_mm<=0||o.depth_mm<=0)return '模型框線尺寸無效。';
  if(o.holes_mm.length||o.boundary_mm.length!==4)return '目前外部模型只支援無孔洞的矩形物件框。';
  const angle=o.rotation_deg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  for(const [x,y]of o.boundary_mm){const dx=x-o.position_mm[0],dy=y-o.position_mm[1];if(Math.abs(Math.abs(c*dx+s*dy)-o.width_mm/2)>.01||Math.abs(Math.abs(-s*dx+c*dy)-o.depth_mm/2)>.01)return '模型尺寸與來源外框不一致。';}
  if(!insidePolygon(o.position_mm,o.boundary_mm)||o.holes_mm.some(h=>insidePolygon(o.position_mm,h)))return '模型定位點不在物件輪廓內。';
  const validEquipment=o.fit_mode==='uniform_footprint'?o.height_mm===null:o.fit_mode==='equipment_dimensions'&&Number.isFinite(o.height_mm)&&o.height_mm>0;
  if(o.role==='equipment'?!validEquipment:(o.fit_mode!=='cabinet_dimensions'||!(o.height_mm>0)||o.support_id!==null))return '模型尺寸策略與設備／櫃體角色不符。';
  if(o.support_id===null)return null;
  const host=level.furniture.find(h=>h.id===o.support_id);
  if(!host||host.id===o.id||!(host.height_mm>0)||!(['table','cabinet','tall_cabinet'].includes(host.kind)||(host.kind==='model_object'&&['cabinet','tall_cabinet'].includes(host.role)&&host.support_id===null)))return '模型承載物必須是同樓層有效桌／櫃，不能缺失或循環。';
  if(!insidePolygon(o.position_mm,hostFootprint(host))||(host.holes_mm||[]).some(h=>insidePolygon(o.position_mm,h)))return '模型定位點不在指定承載物的有效檯面。';
  return null;
}
export function fitModel(o,level,scene){
  const issue=modelObjectIssue(o,level);if(issue)throw new Error(issue);
  const b=validateModelScene(scene,o.asset_id),uniform=Math.min(o.width_mm/b.size[0],o.depth_mm/b.size[1]);
  const scale=o.fit_mode==='uniform_footprint'?[uniform,uniform,uniform]:[o.width_mm/b.size[0],o.depth_mm/b.size[1],o.height_mm/b.size[2]];
  const host=o.support_id===null?null:level.furniture.find(h=>h.id===o.support_id),bottom=level.base_elevation_mm+(host?.height_mm||0);
  const angle=o.rotation_deg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),[cx,cy]=o.position_mm;
  const transform=([x,y,z])=>[cx+c*x*scale[0]-s*y*scale[1],cy+s*x*scale[0]+c*y*scale[1],bottom+z*scale[2]];
  const parts=scene.nodes.map(n=>({id:n.id,name:n.name,mesh:{vertices_mm:n.mesh.vertices_mm.map(transform),faces:structuredClone(n.mesh.faces)}}));
  const dimensions=b.size.map((v,i)=>v*scale[i]);
  const corners=[[-dimensions[0]/2,-dimensions[1]/2],[dimensions[0]/2,-dimensions[1]/2],[dimensions[0]/2,dimensions[1]/2],[-dimensions[0]/2,dimensions[1]/2]].map(([x,y])=>{
    return [cx+c*x-s*y,cy+s*x+c*y];
  });
  if(corners.some(p=>!insidePolygon(p,o.boundary_mm)))throw new Error('縮放模型超出來源外框。');
  const overhang=!!host&&(corners.some(p=>!insidePolygon(p,hostFootprint(host)))||(host.holes_mm||[]).some(h=>h.some(p=>insidePolygon(p,corners))||corners.some(p=>insidePolygon(p,h))));
  return {parts,materials:scene.materials,dimensions_mm:dimensions,scale,bottom_mm:bottom,overhang};
}
