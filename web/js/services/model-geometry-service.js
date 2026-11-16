// Adapter for the curated self-contained GLB subset. The output is portable
// local Scene3D, never a Three.js scene. Transfer does not read source formats.
import {Matrix4,Vector3,Quaternion} from '../../vendor/three/three.module.js';
import {meshBounds,surfaceIssue,validateModelScene} from '../geometry/model-fitting.js';
import {validateModelAssets} from './model-asset-service.js';
const components={5120:['getInt8',1,127],5121:['getUint8',1,255],5122:['getInt16',2,32767],5123:['getUint16',2,65535],5125:['getUint32',4,4294967295],5126:['getFloat32',4,1]};

export function decodeModelGLB(buffer,asset){
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<20||bytes.length>25*1024*1024||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw new Error('GLB 檔頭或長度無效。');
  let gltf,bin,offset=12;
  while(offset<bytes.length){if(offset+8>bytes.length)throw new Error('GLB 區塊不完整。');const n=view.getUint32(offset,true),type=view.getUint32(offset+4,true);if(offset+8+n>bytes.length)throw new Error('GLB 區塊越界。');const chunk=bytes.subarray(offset+8,offset+8+n);if(type===0x4e4f534a)gltf=JSON.parse(new TextDecoder().decode(chunk));if(type===0x004e4942)bin=chunk;offset+=8+n;}
  if(!gltf||!bin||gltf.asset?.version!=='2.0'||(gltf.buffers||[]).length!==1||gltf.buffers[0].uri||gltf.buffers[0].byteLength>bin.length)throw new Error('需要自包含 GLB 2。');
  if((gltf.extensionsRequired||[]).some(e=>e!=='KHR_mesh_quantization')||gltf.images?.length||gltf.skins?.length)throw new Error('此模型需要尚未支援的貼圖、蒙皮或擴充。');
  const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),nodes=[],materials=[],materialMap=new Map();let removedDegenerate=0;
  const accessor=(index,type)=>{
    const a=gltf.accessors?.[index],v=gltf.bufferViews?.[a?.bufferView],component=components[a?.componentType],count=type==='VEC3'?3:1;
    if(!a||!v||!component||a.type!==type||a.sparse||v.buffer!==0||!Number.isInteger(a.count)||a.count<1||a.count>100000)throw new Error('不支援的模型頂點／索引排列。');
    const [get,size,max]=component,stride=v.byteStride||size*count,start=(v.byteOffset||0)+(a.byteOffset||0),end=(v.byteOffset||0)+v.byteLength;
    if(stride<size*count||start<0||end>bin.length||start+(a.count-1)*stride+size*count>end)throw new Error('模型頂點／索引超出資料範圍。');
    if(type==='SCALAR'&&(![5121,5123,5125].includes(a.componentType)||a.normalized))throw new Error('模型索引必須是無號整數。');
    return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,j)=>{let value=data[get](start+i*stride+j*size,true);if(a.normalized)value=Math.max(-1,value/max);if(!Number.isFinite(value))throw new Error('模型包含非有限數值。');return value;}));
  };
  const material=(index)=>{
    const key=index??'default';if(materialMap.has(key))return materialMap.get(key);
    const source=index===undefined?{}:gltf.materials?.[index];if(!source)throw new Error('模型材質不存在。');
    if(source.pbrMetallicRoughness?.baseColorTexture||source.normalTexture||source.emissiveTexture||source.occlusionTexture)throw new Error('模型需要貼圖，不可略過。');
    const color=source.pbrMetallicRoughness?.baseColorFactor||[1,1,1,1],id=asset.id+'_mat_'+key;
    if(color.length!==4||color.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('模型顏色無效。');
    materials.push({id,name:source.name||String(key),color_rgba:[...color]});materialMap.set(key,id);return id;
  };
  const visit=(index,parent,chain)=>{
    const n=gltf.nodes?.[index];if(!n||chain.has(index)||n.skin!==undefined||n.weights?.length)throw new Error('模型節點循環或包含未支援的變形。');
    const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1]))),world=parent.clone().multiply(local);
    if(!world.elements.every(Number.isFinite)||Math.abs(world.determinant())<1e-18)throw new Error('模型節點變換無效。');
    if(n.mesh!==undefined){
      const m=gltf.meshes?.[n.mesh];if(!m?.primitives?.length)throw new Error('模型網格不存在。');
      for(const p of m.primitives){
        if((p.mode??4)!==4||p.targets?.length||p.attributes.COLOR_0!==undefined)throw new Error('目前模型只支援無變形、單色三角形面。');
        const vertices_mm=accessor(p.attributes.POSITION,'VEC3').map(xyz=>{const v=new Vector3(...xyz).applyMatrix4(world);return [v.x*1000,-v.z*1000,v.y*1000];});
        const indices=p.indices===undefined?vertices_mm.map((_,i)=>i):accessor(p.indices,'SCALAR').flat();if(indices.length%3)throw new Error('模型三角形數量無效。');
        const material_id=material(p.material),faces=[];
        for(let i=0;i<indices.length;i+=3){
          const triangle=indices.slice(i,i+3);if(triangle.some(i=>!Number.isInteger(i)||i<0||i>=vertices_mm.length))throw new Error('模型三角形索引越界。');
          const [a,b,c]=triangle.map(i=>vertices_mm[i]),u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
          if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-8){removedDegenerate++;continue;}
          if(world.determinant()<0)triangle.reverse();faces.push({indices:triangle,material_id});if(gltf.materials?.[p.material]?.doubleSided)faces.push({indices:[...triangle].reverse(),material_id});
        }
        if(!faces.length)continue;
        const mesh={vertices_mm,faces},issue=surfaceIssue(mesh);if(issue)throw new Error(issue);
        nodes.push({id:'part_'+nodes.length,name:n.name||m.name||'模型零件',kind:'mesh',parent_id:null,source_2d_ids:[asset.id],mesh,semantic:{category:'asset_surface'},editable:true});
      }
    }
    for(const child of n.children||[])visit(child,world,new Set([...chain,index]));
  };
  const roots=gltf.scenes?.[gltf.scene??0]?.nodes;if(!roots?.length)throw new Error('模型缺少預設場景。');
  for(const root of roots)visit(root,new Matrix4(),new Set());
  const b=meshBounds(nodes.map(n=>n.mesh)),cx=(b.min[0]+b.max[0])/2,cy=(b.min[1]+b.max[1])/2;
  for(const n of nodes)n.mesh.vertices_mm=n.mesh.vertices_mm.map(([x,y,z])=>[x-cx,y-cy,z-b.min[2]]);
  const scene={schema:'Scene3D',schema_version:'1.0.0',units:'mm',materials,nodes,extensions:{model_asset:{id:asset.id,sha256:asset.sha256,citation:asset.attribution_text,source_url:asset.source_url,license:asset.license,pose:'authored_default',has_animations:!!gltf.animations?.length,appearance:'base_color_flat_surfaces',front_direction:'unverified',removed_zero_area_triangles:removedDegenerate}}};
  validateModelScene(scene,asset.id);return scene;
}

export async function loadModelGeometry(plan,catalog,{fetchImpl=fetch}={}){
  validateModelAssets(catalog);
  const wanted=[...new Set(plan.levels.flatMap(l=>l.furniture.filter(o=>o.kind==='model_object').map(o=>o.asset_id)))];
  const entries=await Promise.all(wanted.map(async id=>{
    const asset=catalog.assets.find(a=>a.id===id);if(!asset)throw new Error('找不到指定素材：'+id);
    const response=await fetchImpl(new URL('../../'+asset.local_uri,import.meta.url));if(!response.ok)throw new Error('模型載入失敗：'+asset.name);
    const buffer=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
    if(buffer.byteLength!==asset.bytes||digest!==asset.sha256)throw new Error('模型檔案校驗失敗：'+asset.name);
    return [id,decodeModelGLB(buffer,asset)];
  }));
  return Object.fromEntries(entries);
}
