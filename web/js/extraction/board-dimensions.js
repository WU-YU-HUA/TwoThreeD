// Match explicit W/D/H furniture labels. Never infer units from nearby numbers.
export function parseBoardDimensions(text){
  if(typeof text!=='string')return null;
  const normalized=text.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  const match=normalized.match(/^w(\d+(?:\.\d+)?)[x×*]d(\d+(?:\.\d+)?)[x×*]h(\d+(?:\.\d+)?)(mm|cm|m)$/);
  if(!match)return null;
  const factor={mm:1,cm:10,m:1000}[match[4]],values=match.slice(1,4).map(Number).map(v=>v*factor);
  if(values.some(v=>!Number.isFinite(v)||v<=0||v>10000))return null;
  return {width_mm:values[0],depth_mm:values[1],height_mm:values[2],text,units:match[4]};
}
const gap=(a,b)=>Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]));
export function boardDimensionLabel(label,textItems){
  const center=(label.box[0]+label.box[2])/2,height=label.box[3]-label.box[1];
  const candidates=textItems.map(item=>({item,dimensions:parseBoardDimensions(item.text)})).filter(({item,dimensions})=>dimensions&&center>=item.box[0]&&center<=item.box[2]&&gap(item.box,label.box)<=height*5).sort((a,b)=>gap(a.item.box,label.box)-gap(b.item.box,label.box));
  // Two full nearby labels are ambiguous; don't silently pick one.
  return candidates.length===1?candidates[0]:null;
}
export function boardFootprint(face,faces){
  const w=face.box[2]-face.box[0],d=face.box[3]-face.box[1];
  if(Math.max(w,d)/Math.min(w,d)<5)return face;
  const horizontal=w>d,length=Math.max(w,d),candidates=faces.filter(f=>f!==face&&gap(f.box,face.box)<1e-5&&Math.max(f.box[2]-f.box[0],f.box[3]-f.box[1])<length*.9&&
    (horizontal?(f.box[3]-f.box[1])>(f.box[2]-f.box[0])*3:(f.box[2]-f.box[0])>(f.box[3]-f.box[1])*3));
  if(candidates.length<2)return face;
  const all=[face,...candidates],box=[Math.min(...all.map(f=>f.box[0])),Math.min(...all.map(f=>f.box[1])),Math.max(...all.map(f=>f.box[2])),Math.max(...all.map(f=>f.box[3]))];
  const ring=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]];
  const refs=[...new Map(all.flatMap(f=>f.refs).map(r=>[r.source_id,r])).values()];
  return {...face,box,ring,area:(box[2]-box[0])*(box[3]-box[1]),refs,expanded_board_support:true};
}
