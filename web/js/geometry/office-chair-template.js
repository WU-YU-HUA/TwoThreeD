// Original parametric office chair; local millimetres, front +Y, up +Z.
// Armrest/base/caster styling is illustrative; footprint and seat/back heights
// come from the same public chair contract as the legacy four-leg chair.
import {extrudePolygon} from './model-geometry.js';

export function buildOfficeChairParts(object){
  const {width_mm:w,depth_mm:d,height_mm:h,seat_height_mm:seat,material_id:body,accent_material_id:metal}=object;
  const parts=[],s=Math.min(w,d),t=Math.min(60,seat*.15,s*.1),armZ=seat+(h-seat)*.5;
  const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  const add=(id,ring,z0,z1,material=body)=>parts.push({id,mesh:extrudePolygon(ring,[],z0,z1,material)});
  const circle=(cx,cy,r,n=16)=>Array.from({length:n},(_,i)=>[cx+r*Math.cos(i*2*Math.PI/n),cy+r*Math.sin(i*2*Math.PI/n)]);
  const x=w*.37,y0=-d*.36,y1=d*.47,r=s*.07;
  add('seat',[[-x+r,y0],[x-r,y0],[x,y0+r],[x,y1-r],[x-r,y1],[-x+r,y1],[-x,y1-r],[-x,y0+r]],seat-t,seat);
  add('back',rect(-w*.37,-d*.5,w*.37,-d*.42),seat-t,h);
  for(const [side,sign]of [['left',-1],['right',1]]){
    const cx=sign*w*.44,half=w*.045,post=Math.min(24,w*.035,d*.04);
    add('armrest_'+side,rect(cx-half,-d*.28,cx+half,d*.29),armZ-Math.min(35,(h-seat)*.1),armZ);
    add('arm_support_'+side,rect(cx-post/2,-post/2,cx+post/2,post/2),seat-t,armZ-Math.min(10,(h-seat)*.05),metal);
    add('arm_bracket_'+side,rect(Math.min(cx,sign*w*.3),-post/2,Math.max(cx,sign*w*.3),post/2),seat-t,seat-t/2,metal);
  }
  const wheelR=Math.min(35,s*.055,seat*.07),radius=s*.39,baseZ=wheelR*2,beam=s*.045;
  add('lift_column',circle(0,0,s*.04),baseZ,seat-t,metal);
  for(let i=0;i<5;i++){
    const a=i*2*Math.PI/5-Math.PI/2,u=[Math.cos(a),Math.sin(a)],v=[-u[1],u[0]];
    const project=(r,q)=>[u[0]*r+v[0]*q,u[1]*r+v[1]*q];
    add('base_spoke_'+i,[project(0,-beam/2),project(radius,-beam/2),project(radius,beam/2),project(0,beam/2)],baseZ,baseZ+Math.min(30,seat*.06),metal);
    const [cx,cy]=project(radius,0),width=wheelR*.75;
    // Rotate a closed cylinder so its axle lies tangential to the five-star base.
    const wheel=extrudePolygon(circle(0,0,wheelR),[],-width/2,width/2,metal);
    wheel.vertices_mm=wheel.vertices_mm.map(([r,z,q])=>[cx+u[0]*r+v[0]*q,cy+u[1]*r+v[1]*q,wheelR-z]);
    parts.push({id:'caster_'+i,mesh:wheel});
    add('caster_stem_'+i,circle(cx,cy,Math.min(12,s*.02)),wheelR,baseZ+5,metal);
  }
  return parts;
}
