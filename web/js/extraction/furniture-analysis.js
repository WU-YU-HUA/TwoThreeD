// Extraction evidence only: rounded chair glyphs and large X-marked cabinet
// rectangles. Source curves stop here; templates consume measured poses in mm.
import {closedFaces,insidePolygon} from './structure-analysis.js';
import {officeChairFront} from './office-chair-analysis.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const bounds=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const round=v=>Math.round(v*1e6)/1e6;
const hash=value=>{let h=2166136261;for(const c of value){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
const contained=(ring,box)=>ring.every(p=>p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]);
const excluded=n=>/hatch|填充|圖框|图框|尺寸|標註|dimension|frame|border|title/i.test(n);
function unpack(path){
  const points=[],lines=[];let previous=null,start=null,curves=0;
  for(const c of path.commands||[]){
    if(c.op==='move_to'){previous=start=c.points[0];points.push(previous);}
    else if(c.op==='line_to'&&previous){lines.push([previous,c.points[0]]);previous=c.points[0];points.push(previous);}
    else if(c.op==='close_path'&&previous&&start){lines.push([previous,start]);previous=start;}
    else if(c.op==='cubic_bezier_to'&&previous){
      const a=previous,[b,c1,d]=c.points;curves++;
      for(let i=1;i<=12;i++){const t=i/12,u=1-t;points.push(a.map((v,k)=>u**3*v+3*u*u*t*b[k]+3*u*t*t*c1[k]+t**3*d[k]));}previous=d;
    }else previous=null;
  }
  return {...path,points,lines:lines.filter(([a,b])=>distance(a,b)>1e-6),curves,box:path.box||bounds(points)};
}
function pose(points,front){
  const v=front,u=[v[1],-v[0]],xs=points.map(p=>dot(p,u)),ys=points.map(p=>dot(p,v)),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const project=([x,y])=>[round(u[0]*x+v[0]*y),round(u[1]*x+v[1]*y)];
  return {boundary:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(project),position:project([(x0+x1)/2,(y0+y1)/2]),width:x1-x0,depth:y1-y0,rotation_deg:round(Math.atan2(u[1],u[0])*180/Math.PI)};
}
const reference=(p,page,method)=>({source_id:`pdf:${page}:${p.sourceOperatorIndex}`,layer:p.names.join(' / '),page,method});

export function findFurniture(paths,box,{fingerprint='',pageNumber=1,mmPerSourceUnit=null,referenceGap=null,layoutCenter=[(box[0]+box[2])/2,(box[1]+box[3])/2]}={}){
  const objects=[],diagnostics=[];
  if(!(mmPerSourceUnit>0)||!(referenceGap>0))return {objects,diagnostics:[{code:'W_FURNITURE_SCALE_REQUIRED',message:'家具尺寸辨識需要有效的左上參考牆比例。'}]};
  const unique=new Map();for(const p of paths)if(p.commands?.length&&!p.names.some(excluded))unique.set(JSON.stringify([p.names,p.commands]),p);
  const unpacked=[...unique.values()].map(unpack).filter(p=>p.points.length),chairs=unpacked.filter(p=>p.names.some(n=>/活動家具|办公家具|辦公家具|furniture|chair|椅/i.test(n))),tolerance=referenceGap*.04;
  if(chairs.length>3000)throw new Error('家具線條過多，請縮小選區後重新萃取。');
  const parents=chairs.map((_,i)=>i),find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<chairs.length;i++)for(let j=0;j<i;j++){
    const a=chairs[i].box,b=chairs[j].box;
    if(Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]))<=tolerance)parents[find(i)]=find(j);
  }
  const groups=new Map();chairs.forEach((p,i)=>{const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
  let unresolved=0;
  for(const group of groups.values()){
    if(!group.some(p=>p.curves))continue;
    const points=group.flatMap(p=>p.points),lines=group.flatMap(p=>p.lines),curveCount=group.reduce((s,p)=>s+p.curves,0);
    if(!contained(points,box))continue;
    // Two nearly parallel sides and their perpendicular front distinguish this
    // rounded-seat/backrest glyph. Facing follows the front edge, including rotation.
    let frontLine=null;
    for(let i=0;lines.length===3&&curveCount>=6&&i<3;i++){
      const others=lines.filter((_,j)=>j!==i),unit=line=>line[1].map((v,k)=>(v-line[0][k])/distance(...line));
      if(Math.abs(dot(unit(others[0]),unit(others[1])))>.995&&Math.abs(dot(unit(lines[i]),unit(others[0])))<.03)frontLine=lines[i];
    }
    const office=!frontLine;
    if(office)frontLine=officeChairFront(group,tolerance);
    if(!frontLine){unresolved++;continue;}
    const [a,b]=frontLine,length=distance(a,b),normal=[-(b[1]-a[1])/length,(b[0]-a[0])/length];
    const midpoint=a.map((v,i)=>(v+b[i])/2),mean=points.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/points.length),[0,0]);
    if(dot(midpoint.map((v,i)=>v-mean[i]),normal)<0)normal.forEach((v,i)=>normal[i]=-v);
    const geometry=pose(points,normal),w=geometry.width*mmPerSourceUnit,d=geometry.depth*mmPerSourceUnit;
    if(w<250||w>1200||d<250||d>1200||w/d<.5||w/d>2){unresolved++;continue;}
    objects.push({id:'chair_'+hash(fingerprint+JSON.stringify([pageNumber,geometry.boundary])),kind:'chair',...geometry,holes:[],bbox:bounds(geometry.boundary),area_source_units2:geometry.width*geometry.depth,
      material:{kind:'chair_fabric',color:'#284f57',basis:'builtin_template_display',confirmed:false},confirmed:false,
      evidence:{method:office?'armrest_office_chair_symbol':'rounded_chair_symbol',pattern:'chair_symbol',boundary_layers:[...new Set(group.flatMap(p=>p.names))],classification_basis:office?'paired_closed_armrests_curved_back_and_front_edge':'rounded_back_and_three_seat_edges',curve_count:curveCount,...(office?{template_id:'builtin.office_chair.v1'}:{}),note:office?'依成對扶手、椅背曲線與座面前緣辨識；扶手與腳輪底座為簡化示意。':'依椅背弧線與座面三邊辨識位置及朝向；3D 款式採簡化模板。'},source_refs:group.map(p=>reference(p,pageNumber,office?'office_chair_symbol':'chair_symbol')).sort((a,b)=>a.source_id.localeCompare(b.source_id))});
  }
  if(unresolved)diagnostics.push({code:'W_FURNITURE_UNMATCHED',message:`${unresolved} 組家具曲線不符合目前椅子符號規則，未補猜測模型。`});

  const segments=[],diagonals=[];
  for(const p of unpacked)for(const [i,[a,b]]of p.lines.entries()){
    const dx=b[0]-a[0],dy=b[1]-a[1],ref={...reference(p,pageNumber,'cabinet_boundary'),source_id:`pdf:${pageNumber}:${p.sourceOperatorIndex}:${i}`};
    if(Math.abs(dx)<1e-5||Math.abs(dy)<1e-5){const axis=Math.abs(dy)<1e-5?0:1;segments.push({axis,fixed:(a[1-axis]+b[1-axis])/2,lo:Math.min(a[axis],b[axis]),hi:Math.max(a[axis],b[axis]),ref});}
    else if(p.names.some(n=>/木作|櫃|柜|cabinet|furniture|家具|鐵件/i.test(n)))diagonals.push({a,b,box:bounds([a,b]),slope:dx*dy,ref:{...ref,method:'cabinet_x_mark'}});
  }
  if(segments.length>3000||diagonals.length>3000)throw new Error('櫃體候選線條過多，請縮小選區後重新萃取。');
  const faces=closedFaces(segments,1e-5),seen=new Set();let small=0;
  for(let i=0;i<diagonals.length;i++)for(let j=0;j<i;j++){
    const a=diagonals[i],b=diagonals[j];if(a.slope*b.slope>=0||a.box.some((v,k)=>Math.abs(v-b.box[k])>tolerance*.5))continue;
    const [x0,y0,x1,y1]=a.box,short=Math.min(x1-x0,y1-y0),long=Math.max(x1-x0,y1-y0);
    if(short*mmPerSourceUnit<250||long*mmPerSourceUnit<450){small++;continue;}
    const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],candidate=faces.filter(f=>f.ring.length===4&&corners.every(p=>insidePolygon(p,f.ring,tolerance))&&f.box.every((v,k)=>Math.abs(v-a.box[k])<=short*.1+tolerance)&&f.area<short*long*1.4).sort((a,b)=>b.area-a.area)[0];
    if(!candidate||!contained(candidate.ring,box))continue;
    const boundary=candidate.ring.map(p=>p.map(round)),key=JSON.stringify(boundary);if(seen.has(key))continue;seen.add(key);
    const bounds2=bounds(boundary),cx=(bounds2[0]+bounds2[2])/2,cy=(bounds2[1]+bounds2[3])/2;
    const front=bounds2[2]-bounds2[0]<bounds2[3]-bounds2[1]?[layoutCenter[0]>cx?1:-1,0]:[0,layoutCenter[1]>cy?1:-1],geometry=pose(boundary,front);
    objects.push({id:'cabinet_'+hash(fingerprint+JSON.stringify([pageNumber,boundary])),kind:'tall_cabinet',...geometry,holes:[],bbox:bounds2,area_source_units2:candidate.area,
      material:{kind:'cabinet_wood',color:'#b28b60',basis:'user_large_x_cabinet_rule',confirmed:false},confirmed:false,
      evidence:{method:'closed_large_rectangle_with_x',pattern:'cabinet_x',boundary_layers:[...new Set(candidate.refs.map(r=>r.layer))],classification_basis:'user_large_x_is_tall_cabinet',orientation_basis:'front_towards_main_region_center',note:'大框內成對 X 線依使用者指定視為高櫃；櫃門朝主區中心為顯示推定。'},source_refs:[...candidate.refs,a.ref,b.ref]});
  }
  if(small)diagnostics.push({code:'W_SMALL_X_NOT_CABINET',message:'較小的 X 符號未當成大型高櫃，避免將鐵件或小配件放大。'});
  return {objects:objects.sort((a,b)=>b.bbox[3]-a.bbox[3]||a.bbox[0]-b.bbox[0]||a.id.localeCompare(b.id,'en')),diagnostics};
}
