// Raw drawing preview only. This is not the semantic FloorPlan2D adapter.
const TAU = Math.PI * 2;
const identity = [1, 0, 0, 1, 0, 0];
const finite = n => typeof n === 'number' && Number.isFinite(n);
const point = (p, m) => [m[0] * p.x + m[2] * p.y + m[4], m[1] * p.x + m[3] * p.y + m[5]];
function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function arcPoints(center, rx, ry, start, end, angle = 0) {
  let span = end - start;
  while (span < 0) span += TAU;
  if (span > TAU) span = TAU;
  const count = Math.max(8, Math.ceil(span * 28));
  return Array.from({length:count+1}, (_,i) => {
    const t = start + span*i/count, x=rx*Math.cos(t), y=ry*Math.sin(t);
    return {x:center.x+x*Math.cos(angle)-y*Math.sin(angle), y:center.y+x*Math.sin(angle)+y*Math.cos(angle)};
  });
}
function polyline(vertices, closed) {
  const points=[];
  for (let i=0;i<vertices.length;i++) {
    const a=vertices[i], b=vertices[(i+1)%vertices.length];
    points.push(a);
    if ((!closed && i===vertices.length-1) || !a.bulge || !b) continue;
    const dx=b.x-a.x, dy=b.y-a.y, chord=Math.hypot(dx,dy), bulge=a.bulge;
    if (!chord || !finite(bulge)) continue;
    const cx=(a.x+b.x)/2-dy*(1-bulge*bulge)/(4*bulge);
    const cy=(a.y+b.y)/2+dx*(1-bulge*bulge)/(4*bulge);
    const radius=Math.hypot(a.x-cx,a.y-cy), start=Math.atan2(a.y-cy,a.x-cx), span=4*Math.atan(bulge);
    const count=Math.max(4,Math.ceil(Math.abs(span)*28));
    for(let j=1;j<count;j++) {const t=start+span*j/count;points.push({x:cx+radius*Math.cos(t),y:cy+radius*Math.sin(t)});}
  }
  return points;
}
export function extractDxfPreview(data) {
  const paths=[], labels=[], unsupported={}, counts={}, layers={}, warnings=new Set();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,visited=0;
  function include(p) {
    if(!finite(p[0])||!finite(p[1])||Math.abs(p[0])>1e12||Math.abs(p[1])>1e12) throw new Error('圖面含有無效或過大的座標，無法預覽。');
    minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);
  }
  function drawEntities(entities, matrix=identity, depth=0, inheritedLayer='0', stack=[]) {
    for (const entity of entities) {
      if(++visited>100000) throw new Error('圖元展開超過 100,000 個，請拆分圖面後再試。');
      const type=entity.type, layer=entity.layer==='0'?inheritedLayer:(entity.layer||inheritedLayer);
      const layerData=data.tables?.layer?.layers?.[layer];
      if(entity.visible===false||layerData?.visible===false||layerData?.frozen===true||entity.inPaperSpace) continue;
      counts[type]=(counts[type]||0)+1;layers[layer]=(layers[layer]||0)+1;
      if(entity.extrusionDirection && (entity.extrusionDirection.x || entity.extrusionDirection.y || entity.extrusionDirection.z<0)) {
        warnings.add('部分圖元使用非標準 OCS 座標，已略過，預覽可能不完整。');unsupported[type]=(unsupported[type]||0)+1;continue;
      }
      let vertices=[],closed=false;
      if(type==='LINE') vertices=entity.vertices||[];
      else if(type==='LWPOLYLINE'||type==='POLYLINE') {closed=!!entity.shape;vertices=polyline(entity.vertices||[],closed);}
      else if(type==='CIRCLE') {vertices=arcPoints(entity.center,entity.radius,entity.radius,0,TAU);closed=true;}
      else if(type==='ARC') vertices=arcPoints(entity.center,entity.radius,entity.radius,entity.startAngle,entity.endAngle);
      else if(type==='ELLIPSE') {const major=entity.majorAxisEndPoint,r=Math.hypot(major.x,major.y);vertices=arcPoints(entity.center,r,r*entity.axisRatio,entity.startAngle??0,entity.endAngle??TAU,Math.atan2(major.y,major.x));}
      else if(type==='SOLID'||type==='3DFACE') {vertices=entity.points||entity.vertices||[];if(vertices.length===4 && type==='SOLID') vertices=[vertices[0],vertices[1],vertices[3],vertices[2]];closed=true;}
      else if(type==='TEXT'||type==='MTEXT') {
        const pos=entity.startPoint||entity.position;if(!pos) continue;
        const p=point(pos,matrix);include(p);
        const height=(entity.textHeight||entity.height||2.5)*Math.hypot(matrix[0],matrix[1]);
        const content=String(entity.text||'').replace(/\\P/g,'\n').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'');
        if(content) {labels.push({p,height,layer,text:content,angle:(entity.rotation||0)*Math.PI/180+Math.atan2(matrix[1],matrix[0])});include([p[0]+height*content.length*.6,p[1]+height]);}
        if(type==='MTEXT') warnings.add('多行文字採簡化排版顯示。');
        continue;
      } else if(type==='INSERT'||type==='DIMENSION') {
        const name=entity.name||entity.block, block=data.blocks?.[name];
        if(!block||depth>=16||stack.includes(name)) {unsupported[type]=(unsupported[type]||0)+1;continue;}
        const a=(entity.rotation||0)*Math.PI/180,sx=entity.xScale??1,sy=entity.yScale??1;
        const origin=block.position||{x:0,y:0},pos=entity.position||{x:0,y:0};
        const rows=Math.max(1,entity.rowCount||1),columns=Math.max(1,entity.columnCount||1);
        if(rows*columns>10000) throw new Error('圖塊陣列過大，請拆分圖面後再試。');
        for(let row=0;row<rows;row++) for(let column=0;column<columns;column++) {
          const m=[sx*Math.cos(a),sx*Math.sin(a),-sy*Math.sin(a),sy*Math.cos(a),pos.x,pos.y];
          m[4]-=m[0]*origin.x+m[2]*origin.y;m[5]-=m[1]*origin.x+m[3]*origin.y;
          m[4]+=column*(entity.columnSpacing||0)*Math.cos(a)-row*(entity.rowSpacing||0)*Math.sin(a);
          m[5]+=column*(entity.columnSpacing||0)*Math.sin(a)+row*(entity.rowSpacing||0)*Math.cos(a);
          drawEntities(block.entities||[],multiply(matrix,m),depth+1,layer,[...stack,name]);
        }
        continue;
      } else {unsupported[type]=(unsupported[type]||0)+1;continue;}
      if(!vertices.length) continue;
      const points=vertices.map(p=>point(p,matrix));points.forEach(include);paths.push({points,closed,layer});
    }
  }
  drawEntities(data.entities);
  if(!paths.length&&!labels.length) throw new Error('此 DXF 沒有目前可顯示的圖元。支援線段、折線、圓弧、圓、橢圓、文字與一般圖塊。');
  if(Object.keys(unsupported).length) warnings.add('未顯示的圖元：'+Object.entries(unsupported).map(([k,v])=>`${k} × ${v}`).join('、')+'。');
  const units={0:'未指定',1:'英吋',2:'英呎',4:'毫米',5:'公分',6:'公尺',7:'公里',8:'微英吋',9:'密耳',10:'碼'};
  const unitCode=data.header?.$INSUNITS??0;
  return {paths,labels,bounds:{minX,minY,maxX,maxY},counts,layers,warnings:[...warnings],total:data.entities.length,units:units[unitCode]||`單位代碼 ${unitCode}`,unitCode,version:data.header?.$ACADVER||'未知'};
}
export function drawDxf(ctx, model, width, height) {
  const b=model.bounds,spanX=Math.max(b.maxX-b.minX,1),spanY=Math.max(b.maxY-b.minY,1);
  const padding=60,scale=Math.min((width-padding*2)/spanX,(height-padding*2)/spanY);
  const x0=(width-spanX*scale)/2, y0=(height-spanY*scale)/2;
  const xy=p=>[x0+(p[0]-b.minX)*scale,y0+(b.maxY-p[1])*scale];
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.lineWidth=1.15;ctx.strokeStyle='#435444';ctx.lineJoin='round';
  for(const path of model.paths) {
    ctx.beginPath();path.points.forEach((p,i)=>{const[x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});if(path.closed)ctx.closePath();ctx.stroke();
  }
  ctx.fillStyle='#687860';
  for(const label of model.labels) {const[x,y]=xy(label.p),size=Math.max(4,label.height*scale);ctx.save();ctx.translate(x,y);ctx.rotate(-label.angle);ctx.font=`${size}px sans-serif`;label.text.split('\n').forEach((line,i)=>ctx.fillText(line,0,i*size*1.25));ctx.restore();}
}
