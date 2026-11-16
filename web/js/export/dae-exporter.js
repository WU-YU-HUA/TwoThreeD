// Scene3D -> COLLADA 1.4.1. Only serialization/triangulation, no model inference.
import {validateScene3D} from '../contracts/validators.generated.js';
import earcut,{deviation} from '../../vendor/earcut/earcut.js';
import {polygonIssue,area} from '../geometry/model-geometry.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const xml=value=>{
  const text=String(value);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text))fail('E_XML_TEXT','名稱或標籤含有無效 XML 字元。');
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
};
const number=value=>{if(!Number.isFinite(value))fail('E_INVALID_GEOMETRY','模型座標不是有限數值。');return Object.is(value,-0)?'0':String(value);};
// COLLADA 1.4.1 declares name as NCName, unlike a general display string.
const name=value=>{xml(value);const safe=String(value).normalize('NFKC').replace(/[^A-Za-z0-9_\u3400-\u9fff.-]/g,'_');return /^[A-Za-z_\u3400-\u9fff]/.test(safe)?safe:'object_'+safe;};
const values=items=>items.map(number).join(' ');

function triangulate(vertices,face){
  const indices=face.indices;
  if(new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))fail('E_INVALID_GEOMETRY','模型面的索引無效。');
  const points=indices.map(i=>vertices[i]),normal=[0,0,0];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];normal[0]+=(a[1]-b[1])*(a[2]+b[2]);normal[1]+=(a[2]-b[2])*(a[0]+b[0]);normal[2]+=(a[0]-b[0])*(a[1]+b[1]);}
  const length=Math.hypot(...normal);if(length<1e-8)fail('E_INVALID_GEOMETRY','模型面退化或沒有面積。');
  for(let i=0;i<3;i++)normal[i]/=length;
  if(points.some(p=>Math.abs(normal.reduce((s,n,i)=>s+n*(p[i]-points[0][i]),0))>.01))fail('E_INVALID_GEOMETRY','不支援非平面的多邊形面。');
  const axes=normal.map(Math.abs),omit=axes.indexOf(Math.max(...axes)),projected=points.map(p=>p.filter((_,i)=>i!==omit));
  const check=area(projected)<0?[...projected].reverse():projected,issue=polygonIssue(check,[]);if(issue)fail('E_INVALID_GEOMETRY',issue);
  let triangles=indices.length===3?[0,1,2]:earcut(projected.flat());
  if(triangles.length!==(indices.length-2)*3||deviation(projected.flat(),null,2,triangles)>1e-7)fail('E_INVALID_GEOMETRY','模型面無法完整三角化。');
  triangles=Array.from({length:triangles.length/3},(_,i)=>{
    const t=triangles.slice(i*3,i*3+3),[a,b,c]=t.map(j=>points[j]),u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.hypot(...cross)<1e-8)fail('E_INVALID_GEOMETRY','三角化產生退化面。');
    if(cross.reduce((s,n,j)=>s+n*normal[j],0)<0)t.reverse();return t;
  });
  return {normal,triangles};
}
function source(id,data,stride,parameters){return `<source id="${id}"><float_array id="${id}_array" count="${data.length}">${values(data)}</float_array><technique_common><accessor source="#${id}_array" count="${data.length/stride}" stride="${stride}">${parameters.map(name=>`<param name="${name}" type="float"/>`).join('')}</accessor></technique_common></source>`;}

export function serializeDae(scene,{labelTextures=new Map(),draft=false,createdAt=new Date().toISOString()}={}){
  if(!validateScene3D(scene))fail('E_SCHEMA','Scene3D 格式無效：'+validateScene3D.errors?.[0]?.message);
  if(!Number.isFinite(Date.parse(createdAt)))fail('E_EXPORT_OPTIONS','匯出日期無效。');
  const records=new Map(),materialIds=new Set(),materials=[],images=[],files=[],geometry=[],prepared=new Map();
  for(const [i,m]of scene.materials.entries()){
    if(materialIds.has(m.id))fail('E_DUPLICATE_ID','模型材質 ID 重複。');materialIds.add(m.id);
    if(m.texture_uri)fail('E_UNSUPPORTED_TEXTURE','尚未支援來源材質外部貼圖；不會省略後假裝成功。');
    materials.push({sourceId:m.id,id:'material_'+i,name:m.name,color:m.color_rgba});
  }
  for(const n of scene.nodes){if(records.has(n.id))fail('E_DUPLICATE_ID','模型物件 ID 重複。');records.set(n.id,n);}
  for(const n of scene.nodes){
    const chain=new Set([n.id]);let p=n.parent_id;
    while(p!==null){if(!records.has(p)||chain.has(p))fail('E_INVALID_HIERARCHY','模型群組參照缺失或循環。');chain.add(p);p=records.get(p).parent_id;}
    if(n.kind==='group'&&n.mesh!==null||n.kind==='mesh'&&!n.mesh)fail('E_INVALID_GEOMETRY','物件類型與網格不一致。');
  }
  const labelNames=[...new Set(scene.nodes.flatMap(n=>(n.semantic?.face_labels||[]).map(l=>l.text)))].sort(),labelMaterials=new Map();
  for(const [i,text]of labelNames.entries()){
    if(typeof text!=='string'||!text.trim())fail('E_INVALID_LABEL','物件標籤文字無效。');
    const data=labelTextures.get(text),signature=[137,80,78,71,13,10,26,10];
    if(!(data instanceof Uint8Array)||data.length<33||signature.some((v,i)=>data[i]!==v))fail('E_LABEL_TEXTURE_REQUIRED','缺少有效的標籤 PNG：'+text);
    const path=`textures/label_${i+1}.png`,imageId='label_image_'+i,id='label_material_'+i;
    files.push({path,content:data});images.push({id:imageId,path});materials.push({id,name:text,imageId});labelMaterials.set(text,id);
  }
  const bySource=new Map(materials.filter(m=>m.sourceId).map(m=>[m.sourceId,m.id]));
  let triangleCount=0,meshCount=0;
  for(const [nodeIndex,n]of scene.nodes.entries()){
    if(!n.mesh)continue;meshCount++;
    const {vertices_mm:vertices,faces}=n.mesh,labels=new Map();
    for(const label of n.semantic?.face_labels||[]){
      if(!Number.isInteger(label.face_index)||!faces[label.face_index]||faces[label.face_index].indices.length!==4||labels.has(label.face_index)||!labelMaterials.has(label.text))fail('E_INVALID_LABEL','標籤面索引、文字或四邊形無效。');labels.set(label.face_index,label.text);
    }
    if(n.semantic?.category==='equipment_placeholder'){
      if(n.semantic.label_mode==='none'){
        if(n.semantic.face_labels!==undefined||faces.length!==6)fail('E_INVALID_LABEL','純色方塊必須保留六個面且不含文字貼圖。');
      }else if(labels.size!==6||faces.length!==6)fail('E_INVALID_LABEL','標名方塊必須保存六面的標籤。');
    }
    const id='geometry_'+nodeIndex,normals=[],batches=new Map();
    for(const [faceIndex,face]of faces.entries()){
      if(!materialIds.has(face.material_id))fail('E_MATERIAL_MISSING','模型面參照不存在的材質。');
      const {normal,triangles}=triangulate(vertices,face),label=labels.get(faceIndex),mat=label===undefined?bySource.get(face.material_id):labelMaterials.get(label);
      const key=mat+':'+Number(label!==undefined);if(!batches.has(key))batches.set(key,{material:mat,textured:label!==undefined,indices:[],count:0});const batch=batches.get(key);
      const normalIndex=normals.length/3;normals.push(...normal);
      for(const triangle of triangles)for(const local of triangle){batch.indices.push(face.indices[local],normalIndex);if(batch.textured)batch.indices.push(local);}
      batch.count+=triangles.length;triangleCount+=triangles.length;
    }
    const sources=source(id+'_positions',vertices.flat(),3,['X','Y','Z'])+source(id+'_normals',normals,3,['X','Y','Z'])+(labels.size?source(id+'_uv',[0,0,1,0,1,1,0,1],2,['S','T']):'');
    const primitives=[...batches.values()].map(b=>`<triangles material="${b.material}" count="${b.count}"><input semantic="VERTEX" source="#${id}_vertices" offset="0"/><input semantic="NORMAL" source="#${id}_normals" offset="1"/>${b.textured?`<input semantic="TEXCOORD" source="#${id}_uv" offset="2" set="0"/>`:''}<p>${b.indices.join(' ')}</p></triangles>`).join('');
    geometry.push(`<geometry id="${id}" name="${name(n.name||n.id)}"><mesh>${sources}<vertices id="${id}_vertices"><input semantic="POSITION" source="#${id}_positions"/></vertices>${primitives}</mesh></geometry>`);
    prepared.set(n.id,{id,batches:[...batches.values()]});
  }
  if(!meshCount)fail('E_EMPTY_MODEL','模型沒有可匯出的網格。');
  const effects=materials.map(m=>{
    const fx=m.id+'_effect',params=m.imageId?`<newparam sid="surface"><surface type="2D"><init_from>${m.imageId}</init_from></surface></newparam><newparam sid="sampler"><sampler2D><source>surface</source><wrap_s>CLAMP</wrap_s><wrap_t>CLAMP</wrap_t><minfilter>LINEAR</minfilter><magfilter>LINEAR</magfilter></sampler2D></newparam>`:'';
    const diffuse=m.imageId?'<texture texture="sampler" texcoord="UVSET0"/>':`<color>${values(m.color)}</color>`,alpha=m.imageId?1:m.color[3];
    return `<effect id="${fx}"><profile_COMMON>${params}<technique sid="common"><lambert><emission><color>0 0 0 1</color></emission><ambient><color>0 0 0 1</color></ambient><diffuse>${diffuse}</diffuse><transparent opaque="A_ONE"><color>1 1 1 ${number(alpha)}</color></transparent><transparency><float>1</float></transparency></lambert></technique></profile_COMMON></effect>`;
  }).join('');
  const children=new Map();for(const n of scene.nodes){if(!children.has(n.parent_id))children.set(n.parent_id,[]);children.get(n.parent_id).push(n);}
  const nodeIds=new Map(scene.nodes.map((n,i)=>[n.id,'node_'+i]));
  const renderNode=n=>{
    const p=prepared.get(n.id),instance=p?`<instance_geometry url="#${p.id}"><bind_material><technique_common>${p.batches.map(b=>`<instance_material symbol="${b.material}" target="#${b.material}">${b.textured?'<bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/>':''}</instance_material>`).join('')}</technique_common></bind_material></instance_geometry>`:'';
    return `<node id="${nodeIds.get(n.id)}" name="${name(n.name||n.id)}" type="NODE">${instance}${(children.get(n.id)||[]).map(renderNode).join('')}<extra><technique profile="TWOTHREED"><source_node_id>${xml(n.id)}</source_node_id><original_name>${xml(n.name||n.id)}</original_name><source_2d_ids>${xml(JSON.stringify(n.source_2d_ids))}</source_2d_ids><semantic>${xml(JSON.stringify(n.semantic))}</semantic></technique></extra></node>`;
  };
  const document=`<?xml version="1.0" encoding="utf-8"?>\n<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><contributor><authoring_tool>twothreeD</authoring_tool><comments>${draft?'Editable draft; source recognition and dimensions require review.':'Scene3D export.'}</comments></contributor><created>${xml(createdAt)}</created><modified>${xml(createdAt)}</modified><unit name="millimeter" meter="0.001"/><up_axis>Z_UP</up_axis></asset>${images.length?`<library_images>${images.map(i=>`<image id="${i.id}"><init_from>${i.path}</init_from></image>`).join('')}</library_images>`:''}<library_effects>${effects}</library_effects><library_materials>${materials.map(m=>`<material id="${m.id}" name="${name(m.name)}"><instance_effect url="#${m.id}_effect"/></material>`).join('')}</library_materials><library_geometries>${geometry.join('')}</library_geometries><library_visual_scenes><visual_scene id="scene" name="twothreeD${draft?'_Editable_draft':''}">${(children.get(null)||[]).map(renderNode).join('')}</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene><extra><technique profile="TWOTHREED"><draft>${draft}</draft><source_metadata>${xml(JSON.stringify(scene.extensions?.twothreeD||{}))}</source_metadata></technique></extra></COLLADA>\n`;
  return {document,files,summary:{nodes:scene.nodes.length,groups:scene.nodes.filter(n=>n.kind==='group').length,object_groups:scene.nodes.filter(n=>n.kind==='group'&&n.semantic.category!=='level').length,meshes:meshCount,triangles:triangleCount,label_textures:images.length,materials:materials.length,units:'mm',up_axis:'Z_UP',draft}};
}
