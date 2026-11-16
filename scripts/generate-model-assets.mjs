// Original generic appliance geometry. Rebuildable without Blender or an API.
// GLB uses metres, Y up, front +Z. The existing adapter handles IR conversion.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BoxGeometry,CylinderGeometry,TorusGeometry,Vector3,Box3} from '../web/vendor/three/three.module.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'web/assets/models/generated');
const colors={white:[.88,.91,.92,1],steel:[.52,.60,.64,1],dark:[.035,.055,.07,1],blue:[.04,.30,.46,1],red:[.72,.08,.055,1],green:[.10,.57,.36,1],glass:[.30,.58,.67,.22],cream:[.91,.85,.65,1],tea:[.32,.12,.035,1]};
let parts=[];
function add(name,geometry,material,position=[0,0,0],rotation=[0,0,0]){
  geometry.rotateX(rotation[0]);geometry.rotateY(rotation[1]);geometry.rotateZ(rotation[2]);geometry.translate(...position);
  parts.push({name,geometry,material});
}
const box=(name,size,position,material='white')=>add(name,new BoxGeometry(...size),material,position);
const cylinder=(name,radius,height,position,material='steel',rotation=[0,0,0],topRadius=radius)=>add(name,new CylinderGeometry(topRadius,radius,height,24),material,position,rotation);
const ring=(name,radius,tube,position,material='steel',rotation=[Math.PI/2,0,0])=>add(name,new TorusGeometry(radius,tube,6,24),material,position,rotation);
function feet(width,depth){for(const x of [-width/2,width/2])for(const z of [-depth/2,depth/2])box('rubber_foot',[.035,.025,.035],[x,.0125,z],'dark');}
function tap(name,x,y,z,color){
  cylinder(name+'_outlet',.012,.045,[x,y,z],'steel',[Math.PI/2,0,0]);
  cylinder(name+'_spout',.010,.025,[x,y-.012,z+.019],'steel');
  box(name+'_lever',[.025,.012,.035],[x,y+.024,z],color);
}
function grille(name,width,depth,position){
  box(name+'_tray',[width,.018,depth],position,'dark');
  for(let i=0;i<8;i++)box(name+'_bar_'+i,[width*.88,.004,.004],[position[0],position[1]+.011,position[2]+(i-3.5)*depth/9],'steel');
}
function standingBoard(width,depth,height,electronic=false){
  const panelHeight=electronic ? .84 : 1.04,panelCenter=height-.03-panelHeight/2,rail=electronic?'dark':'steel';
  for(const x of [-width/2+.065,width/2-.065]){
    box('stand_foot',[.055,.045,depth-.07],[x,.09,0],'steel');
    for(const z of [-depth/2+.035,depth/2-.035]){
      cylinder('caster',.035,.032,[x,.035,z],'dark',[0,0,Math.PI/2]);
      box('caster_fork',[.024,.045,.03],[x,.0725,z],'steel');
    }
    box('stand_upright',[.045,height-.20,.045],[x,(height-.20)/2+.10,0],'steel');
    cylinder('adjustment_knob',.022,.018,[x,.80,.035],'dark',[Math.PI/2,0,0]);
  }
  box('stand_crossbar',[width-.13,.035,.035],[0,.32,0],'steel');
  box('writing_panel',[width-.065,panelHeight,.035],[0,panelCenter,0],'white');
  for(const x of [-width/2+.02,width/2-.02])box('side_frame',[.04,panelHeight+.06,.06],[x,panelCenter,0],rail);
  for(const y of [height-.015,height-panelHeight-.045])box('horizontal_frame',[width,.03,.06],[0,y,0],rail);
  box('pen_tray',[width*.66,.018,.09],[0,height-panelHeight-.075,.035],'steel');
  for(const [i,color]of ['blue','red','dark'].entries())box('marker_'+i,[.115,.012,.012],[-.24+i*.14,height-panelHeight-.058,.045],color);
  if(electronic){
    box('control_panel',[.14,.09,.008],[width/2-.13,height-panelHeight+.04,.035],'dark');
    box('status_display',[.075,.022,.003],[width/2-.13,height-panelHeight+.06,.041],'green');
    cylinder('control_button',.009,.006,[width/2-.13,height-panelHeight+.02,.043],'blue',[Math.PI/2,0,0]);
  }
}

const definitions=[
  {type:'whiteboard',name:'一般白板（支架式）',description:'帶腳輪與支架的白板，含板框、筆槽與高度調整旋鈕；原型 W140×D65×H193 cm。',build(){standingBoard(1.4,.65,1.93);}},
  {type:'electronic_whiteboard',name:'電子白板（支架式）',description:'帶支架的電子白板示意，含控制面板與筆槽；原型 W130×D85×H176 cm，非特定產品或螢幕技術。',build(){standingBoard(1.3,.85,1.76,true);}},
  {type:'dish_dryer',name:'檯上烘碗機',description:'雙層烘碗機：透明門、碗盤架、控制鈕與散熱口。',build(){
    feet(.50,.35);box('base',[.60,.065,.45],[0,.0575,0]);
    box('back',[.60,.45,.025],[0,.315,-.2125],'steel');
    for(const x of [-.286,.286])box('side',[.028,.45,.45],[x,.315,0]);
    box('roof',[.60,.045,.45],[0,.5575,0]);
    box('control_strip',[.60,.055,.027],[0,.5075,.215],'dark');
    cylinder('timer',.018,.012,[.225,.5075,.234],'steel',[Math.PI/2,0,0]);
    for(const [i,color]of ['green','red'].entries())cylinder('indicator_'+i,.004,.007,[.15+i*.025,.51,.232],color,[Math.PI/2,0,0]);
    for(const y of [.17,.35]){
      for(let i=0;i<9;i++)box('rack_bar',[.52,.006,.006],[0,y,-.16+i*.039],'steel');
      for(const x of [-.245,.245])box('rack_rail',[.008,.008,.34],[x,y,0],'steel');
    }
    for(let i=0;i<5;i++)cylinder('plate_'+i,.085,.009,[-.19+i*.085,.255,0],'white',[0,0,Math.PI/2]);
    for(const x of [-.15,.04,.19]){
      cylinder('cup',.035,.075,[x,.393,0],'white');ring('cup_rim',.032,.004,[x,.433,0],'steel');
    }
    box('glass_door',[.53,.365,.006],[0,.285,.229],'glass');
    for(const x of [-.274,.274])box('door_frame',[.018,.385,.014],[x,.285,.23],'steel');
    for(const y of [.096,.474])box('door_frame',[.55,.014,.014],[0,y,.23],'steel');
    box('door_handle',[.018,.155,.025],[.235,.285,.252],'dark');
    for(let i=0;i<6;i++)box('vent',[.065,.005,.003],[-.20+i*.08,.055,.227],'dark');
  }},
  {type:'cup_sealer',name:'飲料杯封口機',description:'杯用封膜機：上方膜捲、封口壓頭、滑動杯架與控制面板；非袋口封口機。',build(){
    feet(.24,.29);box('base',[.32,.055,.39],[0,.0525,0],'steel');
    box('rear_column',[.27,.37,.11],[0,.255,-.14],'blue');
    for(const x of [-.125,.125])box('side_column',[.025,.28,.08],[x,.22,-.045],'steel');
    box('sealing_head',[.29,.065,.23],[0,.3925,.015],'blue');
    cylinder('heated_ring',.063,.016,[0,.352,.065],'dark');
    box('cup_drawer',[.21,.023,.25],[0,.11,.07],'steel');
    cylinder('cup_holder',.057,.020,[0,.133,.085],'dark');
    cylinder('sample_cup',.043,.16,[0,.223,.085],'cream',[0,0,0],.055);
    ring('cup_lip',.054,.003,[0,.304,.085],'white');
    box('drawer_handle',[.13,.022,.03],[0,.108,.207],'dark');
    for(const x of [-.13,.13])box('roll_bracket',[.018,.135,.035],[x,.477,-.06],'steel');
    cylinder('film_roll',.070,.235,[0,.510,-.06],'cream',[0,0,Math.PI/2]);
    cylinder('film_spindle',.017,.30,[0,.510,-.06],'dark',[0,0,Math.PI/2]);
    box('film_feed',[.18,.105,.002],[0,.435,.011],'cream');
    box('control_panel',[.115,.04,.005],[.05,.3975,.133],'dark');
    box('display',[.046,.018,.002],[.03,.400,.137],'green');
    for(const x of [.07,.092])cylinder('button',.006,.004,[x,.40,.138],'red',[Math.PI/2,0,0]);
  }},
  {type:'tea_brewer',name:'檯上煮茶機',description:'茶用萃煮設備示意：上層濾茶槽、下層出茶容器、出茶嘴與時間／溫度控制；非咖啡機或製茶揉捻機。',build(){
    feet(.34,.34);box('base',[.43,.065,.43],[0,.0575,0],'steel');
    box('heating_column',[.40,.47,.14],[0,.325,-.145],'steel');
    cylinder('tea_vessel',.125,.27,[0,.265,.015],'steel');
    cylinder('vessel_lid',.134,.024,[0,.412,.015],'dark');
    cylinder('brew_basket',.122,.155,[0,.501,.015],'steel',[0,0,0],.145);
    cylinder('brew_lid',.150,.020,[0,.590,.015],'dark');
    cylinder('lid_knob',.024,.026,[0,.613,.015],'dark');
    for(const x of [-.165,.165]){
      box('basket_handle',[.058,.023,.035],[x,.525,.015],'dark');
      box('vessel_handle',[.035,.065,.045],[x*.87,.32,.015],'dark');
    }
    tap('tea_tap',0,.19,.164,'red');
    grille('drip_tray',.23,.095,[0,.095,.16]);
    box('control_panel',[.17,.04,.006],[0,.055,.218],'dark');
    box('control_display',[.085,.020,.004],[-.025,.058,.223],'green');
    for(const x of [.038,.065])cylinder('control_key',.007,.006,[x,.053,.228],'blue',[Math.PI/2,0,0]);
    box('sight_gauge',[.012,.17,.008],[.08,.28,.137],'dark');
    for(let i=0;i<5;i++)box('gauge_tick',[.025,.003,.003],[.08,.21+i*.032,.143],'white');
  }},
  {type:'water_dispenser_countertop',name:'檯上飲水機',description:'無桶檯上飲水機：冷／熱雙出水口、內凹接水區、滴水盤；由桌／櫃承載時使用。',build(){
    feet(.24,.23);box('base',[.33,.045,.35],[0,.0475,0]);
    box('back',[.33,.43,.12],[0,.285,-.115]);
    for(const x of [-.148,.148])box('side',[.034,.43,.29],[x,.285,-.015]);
    box('top',[.33,.13,.32],[0,.465,-.015]);
    box('recess_back',[.255,.28,.006],[0,.235,-.051],'dark');
    box('control_strip',[.27,.045,.008],[0,.449,.150],'dark');
    for(const [x,color]of [[-.07,'red'],[.07,'blue']]){
      cylinder('temperature_button',.013,.008,[x,.45,.160],color,[Math.PI/2,0,0]);
      tap(color+'_tap',x,.375,.09,color);
    }
    grille('drip_tray',.26,.18,[0,.083,.055]);
    for(let i=0;i<6;i++)box('side_vent',[.002,.005,.072],[.166,.17+i*.018,-.08],'dark');
  }},
];

function encodeGLB(name,modelParts){
  const gltf={asset:{version:'2.0',generator:'twothreeD original appliance generator 1.0.0',copyright:'CC0-1.0'},scene:0,scenes:[{name,nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
  const chunks=[],materials=new Map(),bounds=new Box3();let offset=0,vertices=0,triangles=0;
  function attribute(array,type,target){
    const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=gltf.bufferViews.length;
    gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target});chunks.push(data);offset+=data.length;
    const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
    const stride=type==='VEC3'?3:1,accessor={bufferView:view,componentType:array instanceof Float32Array?5126:5125,count:array.length/stride,type};
    if(type==='VEC3'){
      accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<array.length;i++) {accessor.min[i%3]=Math.min(accessor.min[i%3],array[i]);accessor.max[i%3]=Math.max(accessor.max[i%3],array[i]);}
    }
    gltf.accessors.push(accessor);return gltf.accessors.length-1;
  }
  for(const {name,geometry,material}of modelParts){
    if(!materials.has(material)){
      const rgba=colors[material];materials.set(material,gltf.materials.length);
      gltf.materials.push({name:material,pbrMetallicRoughness:{baseColorFactor:rgba,metallicFactor:0,roughnessFactor:.65},...(rgba[3]<1?{alphaMode:'BLEND'}:{})});
    }
    const position=geometry.attributes.position.array,normal=geometry.attributes.normal.array,indices=new Uint32Array(geometry.index?geometry.index.array:Array.from({length:position.length/3},(_,i)=>i));
    for(let i=0;i<position.length;i+=3)bounds.expandByPoint(new Vector3(...position.slice(i,i+3)));
    const primitive={attributes:{POSITION:attribute(position,'VEC3',34962),NORMAL:attribute(normal,'VEC3',34962)},indices:attribute(indices,'SCALAR',34963),material:materials.get(material),mode:4};
    gltf.scenes[0].nodes.push(gltf.nodes.length);gltf.nodes.push({name,mesh:gltf.meshes.length});gltf.meshes.push({name,primitives:[primitive]});
    vertices+=position.length/3;triangles+=indices.length/3;geometry.dispose();
  }
  gltf.buffers[0].byteLength=offset;
  const json=Buffer.from(JSON.stringify(gltf)),jsonPadding=Buffer.alloc((4-json.length%4)%4,32),jsonChunk=Buffer.concat([json,jsonPadding]),bin=Buffer.concat(chunks);
  const header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+bin.length,8);
  jh.writeUInt32LE(jsonChunk.length);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);
  const size=bounds.getSize(new Vector3());
  return {bytes:Buffer.concat([header,jh,jsonChunk,bh,bin]),mesh_count:gltf.meshes.length,inspection:{method:'generated_and_measured_positions',vertices,triangles,unique_mesh_triangles:triangles,bounds_m:{min:bounds.min.toArray(),max:bounds.max.toArray()},dimensions_mm:{width:size.x*1000,height:size.y*1000,depth:size.z*1000},visual_review:false}};
}

await fs.mkdir(directory,{recursive:true});
const catalogPath=path.join(root,'web/config/model-assets.json'),catalog=JSON.parse(await fs.readFile(catalogPath));
const objectPath=path.join(root,'web/config/object-catalog.json'),objects=JSON.parse(await fs.readFile(objectPath));
if(!objects.types.some(t=>t.id==='electronic_whiteboard')){
  const base=objects.types.find(t=>t.id==='whiteboard');
  objects.types.push({...base,id:'electronic_whiteboard',name:'電子白板',aliases:['電子白板','电子白板'],reference_asset_id:null});
  for(const category of objects.scene_categories||[])if(category.type_ids.includes('whiteboard'))category.type_ids.push('electronic_whiteboard');
  objects.catalog_version='0.3.0';
  catalog.types.push({type_id:'electronic_whiteboard',name:'電子白板',asset_id:null,match:'missing',notes:'',active_model_id:null,runtime_enabled:false,pending:[]});
}
for(const definition of definitions){
  parts=[];definition.build();const result=encodeGLB(definition.name,parts),id='twothreeD.generated.'+definition.type;
  const source='assets/models/generated/SOURCES.txt',asset={id,name:definition.name,format:'glb',local_uri:`assets/models/generated/${definition.type}.glb`,bytes:result.bytes.length,sha256:createHash('sha256').update(result.bytes).digest('hex'),source_kind:'generated',source_url:source,download_url:null,author:'twothreeD',license:'CC0-1.0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',attribution_required:false,attribution_text:`${definition.name} — twothreeD original procedural model — CC0-1.0 — ${source}`,modifications:'Original generic geometry; no third-party mesh or product branding.',ai_generated:true,ai_model:'Coding assistant authored procedural geometry',source_up_axis:'Y',source_units:'m',front_axis:'+Z',status:'generated',scene_integration:'preview_candidate',generation:{script:'scripts/generate-model-assets.mjs',version:'1.0.0',description:definition.description},gltf_extensions_required:[],gltf_extensions_used:[],embedded_image_count:0,mesh_count:result.mesh_count,inspection:result.inspection};
  await fs.writeFile(path.join(root,'web',asset.local_uri),result.bytes);
  const index=catalog.assets.findIndex(a=>a.id===id);
  if(index<0)catalog.assets.push(asset);
  else{if(catalog.assets[index].sha256===asset.sha256)asset.inspection.visual_review=catalog.assets[index].inspection?.visual_review===true;catalog.assets[index]=asset;}
  if(definition.type!=='water_dispenser_countertop'){
    const mapping=catalog.types.find(t=>t.type_id===definition.type);Object.assign(mapping,{asset_id:id,match:'generic',notes:definition.description+' 原創通用示意，並非產品精確規格。',runtime_enabled:true,pending:['實際款式與正面方向核對','Windows SketchUp 匯出／編輯驗收']});
    if(['whiteboard','electronic_whiteboard'].includes(definition.type))mapping.dimension_policy='explicit_wdh';
    objects.types.find(t=>t.id===definition.type).reference_asset_id=id;
  }
  console.log(definition.type,result.bytes.length,'bytes;',result.mesh_count,'parts;',result.inspection.triangles,'triangles');
}
const dispenser=catalog.types.find(t=>t.type_id==='water_dispenser');
Object.assign(dispenser,{match:'category_match',runtime_enabled:true,placement_variants:{on_support:'twothreeD.generated.water_dispenser_countertop'},notes:'有桌／櫃承載時使用自產檯上款；沒有承載物時使用既有落地桶裝款。承載與正面方向仍依圖面估計。'});
catalog.assets.find(a=>a.id===dispenser.asset_id).scene_integration='preview_candidate';
catalog.description='外部與原創模型來源表。純色模型依圖框配置；飲水機依桌／櫃承載關係選擇檯上或落地款。';
await fs.writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
await fs.writeFile(objectPath,JSON.stringify(objects,null,2)+'\n');
await fs.writeFile(path.join(directory,'SOURCES.txt'),[
  'twothreeD original appliance models / 原創設備模型','',
  'Models: '+definitions.map(d=>d.type+'.glb').join(', '),
  'Author: twothreeD; procedural geometry authored with a coding assistant.',
  'License: CC0-1.0 — https://creativecommons.org/publicdomain/zero/1.0/',
  'To the extent possible under law, the author dedicates these original model assets to the public domain under CC0 1.0.',
  'No third-party model meshes, product logos or product specifications were copied.',
  'These are generic layout illustrations, not manufacturer CAD or functional appliance designs.',
  'Units: metres; Y up; front +Z. Appliance size comes from calibrated drawing footprints; standing boards use explicit drawing W/D/H labels.',
  'Rebuild: node scripts/generate-model-assets.mjs (uses bundled Three.js primitive geometry, MIT).',
  'Generator source is included in the project; geometry and parts can be edited and regenerated.',
  '',...definitions.map(d=>d.type+': '+d.description),'',
].join('\n'));
const creditsPath=path.join(root,'web/assets/models/CREDITS.md');
const priorCredits=(await fs.readFile(creditsPath,'utf8')).split('\n## Original procedural models')[0].trimEnd();
await fs.writeFile(creditsPath,priorCredits+'\n\n## Original procedural models\n\n'+
  'Original generic equipment by twothreeD, dedicated under CC0-1.0. Created as procedural geometry with a coding assistant; no third-party mesh or product branding is copied. Rebuild with `node scripts/generate-model-assets.mjs`. Source details: [SOURCES.txt](generated/SOURCES.txt).\n\n'+
  catalog.assets.filter(a=>a.source_kind==='generated').map(a=>`- ${a.name} — twothreeD — CC0-1.0\n  - Local: \`generated/${a.id.split('.').at(-1)}.glb\`; SHA-256: \`${a.sha256}\`.`).join('\n')+'\n');
