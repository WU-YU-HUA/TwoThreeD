import { OPS, Util } from '../vendor/pdfjs/build/pdf.mjs';

// Evidence for a review interface, not a semantic FloorPlan2D contract.
export const isFrame = name => /圖框|图框|圖簽|图签|標題欄|标题栏|title.?block|border|frame|sheet.?info/i.test(name||'');
const isAnnotation = name => /尺寸|標註|标注|dimension|^dim$|hatch|^0$|^labels?$|^text$/i.test(name||'');
const isBuilding = name => /牆|墙|門|门|窗|家具|木作|地坪|廚|厨|鐵件|铁件|wall|door|window|furniture|floor|fitting/i.test(name||'');
const union = boxes => boxes.length ? boxes.reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])],[Infinity,Infinity,-Infinity,-Infinity]) : null;
export const overlaps=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
export const containsCenter=(box,area)=>(box[0]+box[2])/2>=area[0]&&(box[0]+box[2])/2<=area[2]&&(box[1]+box[3])/2>=area[1]&&(box[1]+box[3])/2<=area[3];
export function transformBox(box,matrix){const points=[[box[0],box[1]],[box[0],box[3]],[box[2],box[1]],[box[2],box[3]]].map(p=>{Util.applyTransform(p,matrix);return p;});return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
export function normalizeBox(box){return [Math.min(box[0],box[2]),Math.min(box[1],box[3]),Math.max(box[0],box[2]),Math.max(box[1],box[3])];}
function pad(box,page){const p=Math.min(page[2]-page[0],page[3]-page[1])*.018;return [Math.max(page[0],box[0]-p),Math.max(page[1],box[1]-p),Math.min(page[2],box[2]+p),Math.min(page[3],box[3]+p)];}

export async function analyzePdfPage(pdf,page,{includeGeometry=false}={}){
  const [config,operatorList,text]=await Promise.all([pdf.getOptionalContentConfig(),page.getOperatorList(),page.getTextContent()]);
  const groups=Object.fromEntries(config),hiddenIds=new Set(Object.entries(groups).filter(([,g])=>isFrame(g.name)).map(([id])=>id));
  for(const id of hiddenIds)config.setVisibility(id,false);
  const paths=[],matrixStack=[],marked=[];let matrix=[1,0,0,1,0,0];
  for(let i=0;i<operatorList.fnArray.length;i++){
    const fn=operatorList.fnArray[i],args=operatorList.argsArray[i];
    if(fn===OPS.save)matrixStack.push([...matrix]);
    else if(fn===OPS.restore)matrix=matrixStack.pop()||[1,0,0,1,0,0];
    else if(fn===OPS.transform)matrix=Util.transform(matrix,args);
    else if(fn===OPS.paintFormXObjectBegin){matrixStack.push([...matrix]);if(args[0])matrix=Util.transform(matrix,args[0]);}
    else if(fn===OPS.paintFormXObjectEnd)matrix=matrixStack.pop()||[1,0,0,1,0,0];
    else if(fn===OPS.beginMarkedContentProps)marked.push(args[0]==='OC'?args[1]:null);
    else if(fn===OPS.beginMarkedContent)marked.push(null);
    else if(fn===OPS.endMarkedContent)marked.pop();
    else if(fn===OPS.constructPath&&args[2]&&args[0]!==OPS.endPath){
      const oc=marked.filter(Boolean),ids=oc.flatMap(g=>g.ids||(g.id?[g.id]:[]));
      if(ids.some(id=>hiddenIds.has(id))||oc.some(g=>!config.isVisible(g)))continue;
      const box=transformBox(args[2],matrix);if(!box.every(Number.isFinite))continue;
      const layerIds=ids.filter(id=>groups[id]);
      const path={box,layerIds,names:layerIds.map(id=>groups[id].name)};
      if(includeGeometry){
        path.sourceOperatorIndex=i;
        path.paint=Object.keys(OPS).find(key=>OPS[key]===args[0])||'unknown';
        path.commands=[];
        const raw=args[1]?.[0];
        if(!ArrayBuffer.isView(raw)&&!Array.isArray(raw))throw new Error('向量路徑已被轉成繪圖快取，請從新讀入的 PDF 匯出。');
        for(let j=0;j<raw.length;){
          const op=raw[j++],count=op===2?3:op===3?0:op===0||op===1?1:-1;
          if(count<0)throw new Error(`未知向量繪圖指令：${op}`);
          const points=[];
          for(let k=0;k<count;k++){const p=[raw[j++],raw[j++]];Util.applyTransform(p,matrix);if(!p.every(Number.isFinite))throw new Error('向量路徑包含無效座標。');points.push(p);}
          path.commands.push({op:['move_to','line_to','cubic_bezier_to','close_path'][op],points});
        }
      }
      paths.push(path);
    }
  }
  const textItems=text.items.filter(item=>'str'in item&&item.str.trim()).map(item=>{
    const [a,b,c,d,x,y]=item.transform,advance=Math.hypot(a,b)||1,height=Math.hypot(c,d)||item.height||1;
    const dx=a/advance*item.width,dy=b/advance*item.width,vx=c/height*item.height,vy=d/height*item.height;
    return {text:item.str,box:union([[x,y,x,y],[x+dx,y+dy,x+dx,y+dy],[x+vx,y+vy,x+vx,y+vy],[x+dx+vx,y+dy+vy,x+dx+vx,y+dy+vy]])};
  });
  const anchors=paths.filter(p=>p.names.some(isBuilding));
  let box=null,method='manual';
  if(anchors.length){box=pad(union(anchors.map(p=>p.box)),page.view);method='layers';}
  else if(hiddenIds.size&&paths.length){box=pad(union(paths.filter(p=>!p.names.every(isAnnotation)).map(p=>p.box))||union(paths.map(p=>p.box)),page.view);method='layers';}
  return {box,method,userBox:null,paths,textItems,groups,config,hiddenCount:hiddenIds.size,pageBox:page.view};
}

// Conservative whitespace fallback for PDFs without meaningful optional-content layers.
// Only split at a large, empty horizontal gap; otherwise request manual selection.
export async function findRasterRegion(page,analysis){
  const viewport=page.getViewport({scale:Math.min(1,800/page.getViewport({scale:1}).width),rotation:page.rotate});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  await page.render({canvasContext:ctx,viewport,optionalContentConfigPromise:Promise.resolve(analysis.config)}).promise;
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height,rows=[];
  for(let y=0;y<h;y++){let count=0;for(let x=Math.floor(w*.08);x<w*.92;x++){const i=(y*w+x)*4;if(data[i]+data[i+1]+data[i+2]<640)count++;}rows.push(count);}
  const bands=[];let start=-1;
  for(let y=0;y<=h;y++){if(y<h&&rows[y]>2){if(start<0)start=y;}else if(start>=0){bands.push([start,y-1]);start=-1;}}
  const merged=[];for(const band of bands){const prev=merged.at(-1);if(prev&&band[0]-prev[1]<h*.035)prev[1]=band[1];else merged.push([...band]);}
  const candidates=merged.filter(([a,b])=>b-a>h*.25&&a<h*.6&&b<h*.9);
  if(candidates.length!==1)return null;
  const [y0,y1]=candidates[0];let x0=w,x1=0;
  for(let y=y0;y<=y1;y++)for(let x=Math.floor(w*.06);x<w*.94;x++){const i=(y*w+x)*4;if(data[i]+data[i+1]+data[i+2]<640){x0=Math.min(x0,x);x1=Math.max(x1,x);}}
  if(x1-x0<w*.15)return null;
  const a=viewport.convertToPdfPoint(x0,y0),b=viewport.convertToPdfPoint(x1,y1);
  return pad(normalizeBox([...a,...b]),page.view);
}

const patterns=[
  ['空間',/會議區|会议区|辦公區|办公区|茶水間|茶水间|會議室|会议室|辦公室|办公室|廚房|厨房|客廳|客厅|臥室|卧室|浴室|陽台|阳台|儲藏室|储藏室|STUDIO|MEETING|STORAGE/gi],
  ['牆體與開口',/(?:新[做作]|原有)?隔間牆|(?:新[做作]|原有)?隔间墙|封門(?:\(不出入\))?|封门|玻璃隔間|玻璃隔间|防火門|防火门/gi],
  ['家具與收納',/(?:新[做作])?OA辦公家具|(?:新[做作])?OA办公家具|(?:新[做作])?系統半高櫃|(?:新[做作])?系统半高柜|(?:新[做作])?系統高櫃|(?:新[做作])?系统高柜|(?:原有)?事務鐵櫃|(?:原有)?事务铁柜|(?:新[做作])?茶水櫃|小檔案櫃|雨傘架|會議桌|辦公桌|沙發|沙发|書櫃|衣櫃/gi],
  ['設備',/電子白板|电子白板|白板|印表機|打印机|碎紙機|影印機|電鍋(?:\s*[Xx×]\s*\d+)?|飲水機|烘碗機|冰箱|海報機|洗手台|水槽|冷氣|空調/gi],
];
export function objectEvidence(textItems,area){
  const evidence=[];
  for(const [category,pattern]of patterns)for(const item of textItems.filter(item=>containsCenter(item.box,area)))for(const match of item.text.matchAll(pattern))evidence.push({category,name:match[0].trim(),sourceText:item.text,box:item.box});
  return evidence;
}
export function summarizeObjects(textItems,area,layerNames=[]){
  const inside=textItems.filter(item=>containsCenter(item.box,area));const categories=[];
  for(const [title,pattern]of patterns){const found=new Map();for(const item of inside){for(const match of item.text.matchAll(pattern)){const name=match[0].trim();found.set(name,(found.get(name)||0)+1);}}if(found.size)categories.push({title,items:[...found].map(([name,count])=>({name,count}))});}
  const layers=[...new Set(layerNames)].filter(name=>name&&!isFrame(name)&&!isAnnotation(name));
  return {categories,layers,matchedLabels:categories.reduce((sum,category)=>sum+category.items.reduce((n,item)=>n+item.count,0),0)};
}

export function pdfObjects(analysis,area){
  const layers=analysis.paths.filter(path=>overlaps(path.box,area)).flatMap(path=>path.names);
  return summarizeObjects(analysis.textItems,area,layers);
}
