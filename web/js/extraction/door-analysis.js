// PDF extraction evidence only. Match a circular swing to a thin, closed leaf
// on a named door layer; curves alone and closed/blocked door symbols are not doors.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const area=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;
const bounds=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const contained=(points,box)=>points.every(p=>p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]);
const hash=value=>{let h=2166136261;for(const c of value){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
const doorLayer=name=>/(?:^|[_ -])doors?(?:$|[_ -])|^(?:門|门|門扇|门扇|門片|平面門)$/i.test(name);
const blocked=text=>/封門|封门|不出入|封閉|封闭|blocked|sealed/i.test(text);

function leafRectangle(path){
  const ring=[];let closed=false;
  for(const command of path.commands||[]){
    if(command.op==='move_to'){if(ring.length)return null;ring.push(command.points[0]);}
    else if(command.op==='line_to')ring.push(command.points[0]);
    else if(command.op==='close_path')closed=true;
    else return null;
  }
  if(ring.length>1&&distance(ring[0],ring.at(-1))<1e-5){ring.pop();closed=true;}
  if(!closed||ring.length!==4)return null;
  const lengths=ring.map((p,i)=>distance(p,ring[(i+1)%4]));
  if(Math.min(...lengths)<1e-5||Math.max(...lengths)/Math.min(...lengths)<8)return null;
  for(let i=0;i<4;i++){
    const a=ring[i],b=ring[(i+1)%4],c=ring[(i+2)%4];
    if(Math.abs((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))>lengths[i]*lengths[(i+1)%4]*1e-5)return null;
  }
  if(area(ring)<0)ring.reverse();
  let first=0;for(let i=1;i<ring.length;i++)if(ring[i][0]<ring[first][0]||(ring[i][0]===ring[first][0]&&ring[i][1]<ring[first][1]))first=i;
  return {ring:[...ring.slice(first),...ring.slice(0,first)],width:Math.max(...lengths),thickness:Math.min(...lengths),path};
}
function swingArc(path){
  const points=[];let previous=null;
  for(const command of path.commands||[]){
    if(command.op==='move_to'){if(points.length)return null;previous=command.points[0];points.push(previous);}
    else if(command.op==='cubic_bezier_to'&&previous){
      const [b,c,d]=command.points,a=previous;
      for(let i=1;i<=12;i++){const t=i/12,u=1-t;points.push(a.map((v,k)=>u*u*u*v+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]));}
      previous=d;
    }else return null;
  }
  if(points.length<10)return null;
  const a=points[0],b=points[Math.floor(points.length/2)],c=points.at(-1);
  const u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),det=2*(u[0]*v[1]-u[1]*v[0]);
  if(Math.abs(det)<1e-8)return null;
  const uu=u[0]**2+u[1]**2,vv=v[0]**2+v[1]**2;
  const center=[a[0]+(uu*v[1]-vv*u[1])/det,a[1]+(u[0]*vv-v[0]*uu)/det],radius=distance(center,a);
  if(points.some(p=>Math.abs(distance(center,p)-radius)>radius*.02))return null;
  const angle=Math.acos(Math.max(-1,Math.min(1,((a[0]-center[0])*(c[0]-center[0])+(a[1]-center[1])*(c[1]-center[1]))/radius**2)))*180/Math.PI;
  if(angle<70||angle>110)return null;
  return {path,points,center,radius,ends:[a,c]};
}

export function findHingedDoors(paths,box,{fingerprint='',pageNumber=1,textItems=[]}={}){
  const named=paths.filter(p=>p.names?.some(doorLayer)),leaves=named.map(leafRectangle).filter(Boolean),arcs=named.map(swingArc).filter(Boolean);
  const objects=[],diagnostics=[],used=new Set();
  for(const arc of arcs){
    const matches=[];
    for(const leaf of leaves){
      if(Math.abs(leaf.width-arc.radius)>arc.radius*.04)continue;
      for(let i=0;i<4;i++)for(const j of [(i+1)%4,(i+3)%4]){
        const hinge=leaf.ring[i],tip=leaf.ring[j];if(distance(hinge,tip)<leaf.width*.99)continue;
        // CAD exports may approximate a quarter swing with multiple Beziers;
        // allow a small radius-relative centre error, still require a matching tip.
        const centerError=distance(hinge,arc.center);if(centerError>arc.radius*.03)continue;
        for(let k=0;k<2;k++){
          const tipError=distance(tip,arc.ends[k]);if(tipError>leaf.thickness*.5)continue;
          matches.push({leaf,hinge,closedEnd:arc.ends[1-k],score:centerError+tipError});
        }
      }
    }
    matches.sort((a,b)=>a.score-b.score);const match=matches[0];
    if(!match||!contained([...arc.points,...match.leaf.ring],box)){
      if(contained(arc.points,box))diagnostics.push({code:'W_DOOR_UNMATCHED',message:'有門圖層弧線未配對到完整門片，未產生猜測模型。'});
      continue;
    }
    const {leaf,hinge,closedEnd}=match;
    const center=hinge.map((v,i)=>(v+closedEnd[i])/2);
    if(textItems.some(t=>blocked(t.text)&&distance(center,[(t.box[0]+t.box[2])/2,(t.box[1]+t.box[3])/2])<leaf.width*.7))continue;
    const id='door_'+hash(fingerprint+JSON.stringify([pageNumber,leaf.ring]));if(used.has(id))continue;used.add(id);
    const ref=(path,method)=>({source_id:`pdf:${pageNumber}:${path.sourceOperatorIndex}`,layer:path.names.join(' / '),page:pageNumber,method});
    objects.push({id,kind:'door',boundary:leaf.ring,holes:[],bbox:bounds(leaf.ring),area_source_units2:area(leaf.ring),hinge,closed_end:closedEnd,
      material:{kind:'door_wood',color:'#9b683b',basis:'schematic_wood_door_display',confirmed:false},confirmed:false,
      evidence:{method:'door_layer_swing_arc_and_leaf',pattern:'door_swing',boundary_layers:leaf.path.names,swing_radius_source_units:arc.radius,classification_basis:'matching_hinge_radius_and_leaf',note:'門片位置、厚度與開啟方向來自圖面；木色是顯示預設，門框與過樑尚未建模。'},
      source_refs:[ref(leaf.path,'door_leaf_outline'),ref(arc.path,'door_swing_arc')]});
  }
  for(const text of textItems.filter(t=>blocked(t.text)&&contained([[t.box[0],t.box[1]],[t.box[2],t.box[3]]],box)))diagnostics.push({code:'W_BLOCKED_DOOR',message:`「${text.text}」未當成可出入門片；封閉方式仍待確認。`});
  return {objects,diagnostics};
}
