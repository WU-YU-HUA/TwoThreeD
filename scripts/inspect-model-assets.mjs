// Inspect actual stored GLB positions and node transforms, without rendering or
// applying animations. Useful for checking downloaded sources before integration.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3,Quaternion,Box3} from '../web/vendor/three/three.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'web/config/model-assets.json');
const manifest=JSON.parse(await fs.readFile(manifestPath));
const component={5120:['getInt8',1,127],5121:['getUint8',1,255],5122:['getInt16',2,32767],5123:['getUint16',2,65535],5125:['getUint32',4,4294967295],5126:['getFloat32',4,1]};
for(const asset of manifest.assets){
  const bytes=await fs.readFile(path.join(root,'web',asset.local_uri));
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error(asset.id+': invalid GLB header');
  let offset=12,gltf,bin;
  while(offset<bytes.length){const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(offset+8+size>bytes.length)throw Error('Invalid chunk');const chunk=bytes.subarray(offset+8,offset+8+size);if(type===0x4e4f534a)gltf=JSON.parse(chunk.toString());if(type===0x004e4942)bin=chunk;offset+=8+size;}
  if(!gltf||!bin||offset!==bytes.length)throw Error(asset.id+': missing chunks');
  const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),bounds=new Box3();let vertices=0,triangles=0;
  const visit=(index,parent,chain)=>{
    if(chain.has(index)||!gltf.nodes[index])throw Error('Invalid scene hierarchy');
    const node=gltf.nodes[index],local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation||[0,0,0])),new Quaternion(...(node.rotation||[0,0,0,1])),new Vector3(...(node.scale||[1,1,1]))),world=parent.clone().multiply(local),next=new Set([...chain,index]);
    if(node.mesh!==undefined)for(const primitive of gltf.meshes[node.mesh].primitives){
      const a=gltf.accessors[primitive.attributes.POSITION],view=gltf.bufferViews[a.bufferView];
      if(a.type!=='VEC3'||a.sparse||view.buffer!==0||!component[a.componentType])throw Error('Unsupported position layout');
      const [getter,size,max]=component[a.componentType],stride=view.byteStride||size*3,start=(view.byteOffset||0)+(a.byteOffset||0);
      for(let i=0;i<a.count;i++){
        const xyz=[];for(let j=0;j<3;j++){const byte=start+i*stride+j*size;if(byte+size>(view.byteOffset||0)+view.byteLength)throw Error('Position leaves buffer view');let v=data[getter](byte,true);if(a.normalized)v=Math.max(v/max,-1);xyz.push(v);}
        const point=new Vector3(...xyz).applyMatrix4(world);if(!point.toArray().every(Number.isFinite))throw Error('Nonfinite position');bounds.expandByPoint(point);vertices++;
      }
      if((primitive.mode??4)!==4)throw Error('Expected triangle mesh');
      const count=primitive.indices===undefined?a.count:gltf.accessors[primitive.indices].count;if(count%3)throw Error('Invalid triangle count');triangles+=count/3;
    }
    for(const child of node.children||[])visit(child,world,next);
  };
  for(const index of gltf.scenes[gltf.scene??0].nodes)visit(index,new Matrix4(),new Set());
  const size=bounds.getSize(new Vector3()).toArray();if(!vertices||!triangles||size.some(v=>v<=0||!Number.isFinite(v)))throw Error(asset.id+': empty geometry');
  const uniqueMeshTriangles=gltf.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((n,p)=>n+gltf.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
  asset.inspection={method:'decoded_positions_and_default_scene_transforms',vertices,triangles,unique_mesh_triangles:uniqueMeshTriangles,bounds_m:{min:bounds.min.toArray(),max:bounds.max.toArray()},dimensions_mm:{width:size[0]*1000,height:size[1]*1000,depth:size[2]*1000},visual_review:false};
}
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log('PASS:',manifest.assets.length,'GLB meshes decoded; embedded geometry, transforms and nonzero native bounds verified.');
