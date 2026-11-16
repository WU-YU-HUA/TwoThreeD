// Small standards-based ZIP writer (stored entries). No server or dependency.
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=data=>{let c=0xffffffff;for(const byte of data)c=table[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function header(length){const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);return {bytes,u16:(o,v)=>view.setUint16(o,v,true),u32:(o,v)=>view.setUint32(o,v,true)};}
export function zipFiles(files){
  if(!files.length||files.length>65535)throw new Error('ZIP 檔案數量無效。');
  const names=new Set(),locals=[],centrals=[];let offset=0,centralSize=0;
  for(const file of files){
    if(!/^[A-Za-z0-9_./-]+$/.test(file.path)||file.path.startsWith('/')||file.path.split('/').some(p=>!p||p==='.'||p==='..')||names.has(file.path))throw new Error('ZIP 資產路徑無效或重複。');names.add(file.path);
    const name=encoder.encode(file.path),data=typeof file.content==='string'?encoder.encode(file.content):file.content;
    if(!(data instanceof Uint8Array)||data.length>0xffffffff)throw new Error('ZIP 資產內容無效。');
    const crc=crc32(data),local=header(30),central=header(46);
    local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x800);local.u16(12,33);local.u32(14,crc);local.u32(18,data.length);local.u32(22,data.length);local.u16(26,name.length);
    central.u32(0,0x02014b50);central.u16(4,20);central.u16(6,20);central.u16(8,0x800);central.u16(14,33);central.u32(16,crc);central.u32(20,data.length);central.u32(24,data.length);central.u16(28,name.length);central.u32(42,offset);
    locals.push(local.bytes,name,data);centrals.push(central.bytes,name);offset+=30+name.length+data.length;centralSize+=46+name.length;
  }
  if(offset+centralSize+22>0xffffffff)throw new Error('模型超出 ZIP32 大小限制。');
  const end=header(22);end.u32(0,0x06054b50);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,centralSize);end.u32(16,offset);
  const output=new Uint8Array(offset+centralSize+22);let cursor=0;for(const part of [...locals,...centrals,end.bytes]){output.set(part,cursor);cursor+=part.length;}return output;
}
