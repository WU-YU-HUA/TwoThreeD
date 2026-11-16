// Export-specific texture rasterization. No Preview or Three.js dependency.
export async function createExportLabelTextures(scene,{createCanvas=()=>document.createElement('canvas')}={}){
  const names=[...new Set(scene.nodes.flatMap(n=>(n.semantic?.face_labels||[]).map(l=>l.text)))].sort();
  const textures=new Map();
  for(const text of names){
    if(typeof text!=='string'||!text.trim()||text.length>1000)throw new Error('物件標籤文字無效或過長。');
    const canvas=createCanvas();canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法產生模型標名貼圖。');
    ctx.fillStyle='#e1eff8';ctx.fillRect(0,0,512,512);ctx.strokeStyle='#7196ae';ctx.lineWidth=10;ctx.strokeRect(15,15,482,482);
    const font=Math.max(12,Math.min(76,400/Math.ceil(Math.sqrt(Array.from(text).length)))),lines=[];
    ctx.font=`600 ${font}px "PingFang TC", "Heiti TC", "Microsoft JhengHei", "Noto Sans CJK TC", "Arial Unicode MS", sans-serif`;
    let line='';for(const char of text){if(ctx.measureText(line+char).width>440&&line){lines.push(line);line='';}line+=char;}if(line)lines.push(line);
    ctx.fillStyle='#173b52';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const [i,value]of lines.entries())ctx.fillText(value,256,256+(i-(lines.length-1)/2)*font*1.25,440);
    let data;
    if(typeof canvas.convertToBlob==='function')data=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
    else if(typeof canvas.toBlob==='function')data=new Uint8Array(await (await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('標籤 PNG 產生失敗。')),'image/png'))).arrayBuffer());
    else if(typeof canvas.toBuffer==='function')data=new Uint8Array(canvas.toBuffer('image/png'));
    else throw new Error('目前環境不能產生 PNG 貼圖。');
    textures.set(text,data);
  }
  return textures;
}
