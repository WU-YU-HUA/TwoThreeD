// An additional symbol family, evaluated only after the legacy chair rule fails.
// A pair of closed, slim armrests must flank the curved seat/back and front edge.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const unit=([a,b])=>b.map((v,i)=>(v-a[i])/distance(a,b));

export function officeChairFront(group,tolerance){
  const arms=group.filter(p=>!p.curves&&p.lines.length>=4&&p.lines.length<=6&&
    p.commands.filter(c=>c.op==='move_to').length===1&&
    distance(p.lines[0][0],p.lines.at(-1)[1])<=tolerance);
  if(arms.length!==2)return null;
  const rest=group.filter(p=>!arms.includes(p)),lines=rest.flatMap(p=>p.lines);
  if(lines.length!==1||rest.reduce((n,p)=>n+p.curves,0)<6)return null;
  const front=lines[0],u=unit(front),v=[-u[1],u[0]],points=group.flatMap(p=>p.points);
  const extent=points=>{
    const x=points.map(p=>dot(p,u)),y=points.map(p=>dot(p,v));
    return {x0:Math.min(...x),x1:Math.max(...x),y0:Math.min(...y),y1:Math.max(...y)};
  };
  const full=extent(points),w=full.x1-full.x0,d=full.y1-full.y0,cx=(full.x0+full.x1)/2;
  if(!(w>0&&d>0)||distance(...front)<w*.35||distance(...front)>w*.9)return null;
  const measured=arms.map(p=>extent(p.points)).sort((a,b)=>a.x0-b.x0);
  for(const arm of arms){
    const longest=[...arm.lines].sort((a,b)=>distance(...b)-distance(...a))[0];
    if(Math.abs(dot(unit(longest),u))>.03)return null;
    const b=extent(arm.points),width=b.x1-b.x0,depth=b.y1-b.y0;
    if(width<w*.04||width>w*.25||depth<d*.35||depth>d*.9)return null;
  }
  const [left,right]=measured;
  if(left.x1>cx-w*.2||right.x0<cx+w*.2)return null;
  if(Math.abs((left.x0+left.x1+right.x0+right.x1)/2-2*cx)>w*.12)return null;
  if(Math.abs((left.x1-left.x0)-(right.x1-right.x0))>w*.08)return null;
  const overlap=Math.min(left.y1,right.y1)-Math.max(left.y0,right.y0);
  if(overlap<Math.max(left.y1-left.y0,right.y1-right.y0)*.8)return null;
  // The front must sit beyond both armrests, with the back curves on the other side.
  const frontY=dot(front[0],v),near=Math.min(full.y1-frontY,frontY-full.y0);
  if(near>d*.12||Math.min(Math.abs(frontY-left.y0),Math.abs(frontY-left.y1))<d*.05)return null;
  return front;
}
