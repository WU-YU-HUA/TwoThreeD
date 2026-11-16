// Built-in editable furniture templates. Pure mm geometry, shared by every
// Scene3D consumer; no renderer, source-format or exporter dependencies.
import {extrudePolygon} from './model-geometry.js';
import {tableIssue,buildTableParts} from './table-template.js';
import {buildOfficeChairParts} from './office-chair-template.js';

export const FURNITURE_TEMPLATES=Object.freeze({
  'builtin.chair.v1':Object.freeze({kind:'chair',name:'簡化四腳椅',source:'project_parametric_geometry'}),
  'builtin.office_chair.v1':Object.freeze({kind:'chair',name:'扶手辦公椅',source:'project_parametric_geometry'}),
  'builtin.tall_cabinet.v1':Object.freeze({kind:'tall_cabinet',name:'簡化雙門高櫃',source:'project_parametric_geometry'}),
  'builtin.cabinet.v1':Object.freeze({kind:'cabinet',name:'可調高度簡化櫃體',source:'project_parametric_geometry'}),
  'builtin.table.v1':Object.freeze({kind:'table',name:'輪廓桌面與桌腳',source:'project_parametric_geometry'}),
});

export function furnitureIssue(object){
  const template=FURNITURE_TEMPLATES[object.template_id];
  if(!template||template.kind!==object.kind)return '家具模板不存在或類型不符。';
  if(object.kind==='chair'&&object.seat_height_mm>=object.height_mm)return '椅座高度必須低於椅背總高。';
  if(object.kind==='table')return tableIssue(object);
  return null;
}

export function buildFurnitureParts(object,base=0){
  const issue=furnitureIssue(object);if(issue)throw new Error(issue);
  if(object.kind==='table')return buildTableParts(object,base);
  const {width_mm:w,depth_mm:d,height_mm:h,material_id:body,accent_material_id:accent}=object,parts=[];
  const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const box=(id,ring,z0,z1,material=body)=>parts.push({id,mesh:extrudePolygon(ring,[],z0,z1,material)});
  if(object.template_id==='builtin.office_chair.v1'){
    parts.push(...buildOfficeChairParts(object));
  }else if(object.kind==='chair'){
    const seat=object.seat_height_mm,t=Math.min(60,seat*.15,w*.1,d*.1),backT=Math.min(50,d*.1),leg=Math.min(40,w*.08,d*.08);
    const x=w/2,y0=-d/2+backT,y1=d/2,r=Math.min(w,d)*.08;
    // Chamfered corners keep the seat readable without a texture dependency.
    box('seat',[[-x+r,y0],[x-r,y0],[x,y0+r],[x,y1-r],[x-r,y1],[-x+r,y1],[-x,y1-r],[-x,y0+r]],seat-t,seat);
    box('back',rectangle(-w*.46,-d/2,w*.46,-d/2+backT),seat-t,h);
    for(const [i,cx]of [-w*.35,w*.35].entries())for(const [j,cy]of [-d*.30,d*.32].entries())box(`leg_${i}_${j}`,rectangle(cx-leg/2,cy-leg/2,cx+leg/2,cy+leg/2),0,seat-t,accent);
  }else{
    const t=Math.min(18,w*.04,d*.06,h*.02),plinth=Math.min(80,h*.05),gap=Math.min(3,w*.003);
    box('left',rectangle(-w/2,-d/2,-w/2+t,d/2),0,h);
    box('right',rectangle(w/2-t,-d/2,w/2,d/2),0,h);
    box('bottom',rectangle(-w/2+t,-d/2,w/2-t,d/2),plinth,plinth+t);
    box('top',rectangle(-w/2+t,-d/2,w/2-t,d/2),h-t,h);
    box('back',rectangle(-w/2+t,-d/2,w/2-t,-d/2+t),plinth+t,h-t);
    box('door_left',rectangle(-w/2+t,d/2-t,-gap/2,d/2),plinth+t,h-t);
    box('door_right',rectangle(gap/2,d/2-t,w/2-t,d/2),plinth+t,h-t);
    // Inset handles stay inside the measured footprint and have a separate material.
    const handleW=Math.min(12,w*.015),handleH=Math.min(160,h*.1);
    for(const [i,cx]of [-w*.04,w*.04].entries())box('handle_'+i,rectangle(cx-handleW/2,d/2-t*.2,cx+handleW/2,d/2),h*.48-handleH/2,h*.48+handleH/2,accent);
  }
  const angle=object.rotation_deg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),[px,py]=object.position_mm;
  for(const part of parts)part.mesh.vertices_mm=part.mesh.vertices_mm.map(([x,y,z])=>[px+c*x-s*y,py+s*x+c*y,base+z]);
  return parts;
}
