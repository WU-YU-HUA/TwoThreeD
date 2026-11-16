// Presentation adapter: Scene3D JSON -> Three.js. Never changes the model JSON.
import * as THREE from '../../vendor/three/three.module.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';

function faceTriangles(vertices, indices) {
  if (!Array.isArray(indices) || indices.length < 3 || new Set(indices).size !== indices.length ||
      indices.some(i => !Number.isInteger(i) || i < 0 || i >= vertices.length)) throw new Error('3D 面的頂點索引無效。');
  const points = indices.map(i => new THREE.Vector3(...vertices[i]));
  const normal = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  if (normal.lengthSq() < 1e-12) throw new Error('3D 面沒有有效面積。');
  normal.normalize();
  if (points.some(p => Math.abs(p.clone().sub(points[0]).dot(normal)) > 0.01)) throw new Error('預覽不支援非平面的多邊形。');
  const axes = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  const omit = axes.indexOf(Math.max(...axes));
  const polygon = points.map(p => {
    const xy = p.toArray().filter((_, axis) => axis !== omit);
    return new THREE.Vector2(...xy);
  });
  const triangles = THREE.ShapeUtils.triangulateShape(polygon, []);
  if (triangles.length !== points.length - 2) throw new Error('無法將 3D 面轉成預覽三角形。');
  return triangles.map(triangle => {
    const [a, b, c] = triangle.map(i => points[i]);
    if (b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) < 0) triangle.reverse();
    return triangle.map(i => indices[i]);
  });
}

/** Basic display checks only; this does not replace formal model/schema validation. */
export function buildSceneObject(data,{createCanvas=()=>document.createElement('canvas')}={}) {
  if (data?.schema !== 'Scene3D' || data.schema_version !== '1.0.0' || data.units !== 'mm' ||
      !Array.isArray(data.nodes) || !Array.isArray(data.materials)) throw new Error('請提供毫米制 Scene3D@1.0.0。');
  const ids = new Set(data.nodes.map(n => n.id)), materialIds = new Set(data.materials.map(m => m.id));
  if (ids.size !== data.nodes.length || data.nodes.some(n => !n.id)) throw new Error('3D 節點 ID 重複或缺失。');
  if (materialIds.size !== data.materials.length) throw new Error('3D 材質 ID 重複。');
  const records = new Map(data.nodes.map(n => [n.id, n]));
  for (const node of data.nodes) {
    const chain = new Set([node.id]);
    let parent = node.parent_id;
    while (parent != null) {
      if (!records.has(parent) || chain.has(parent)) throw new Error('3D 群組參照缺失或循環。');
      chain.add(parent); parent = records.get(parent).parent_id;
    }
    if (node.transform || node.matrix || node.position) throw new Error('預覽只接收世界座標，不支援額外節點位移。');
  }
  for (const material of data.materials) {
    if (!Array.isArray(material.color_rgba) || material.color_rgba.length !== 4 ||
        material.color_rgba.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error('3D 材質顏色無效。');
    if (material.texture_uri) throw new Error('目前預覽僅支援純色材質，貼圖支援尚待實作。');
  }
  // Prepare all arrays before allocating GPU resources so invalid data is atomic.
  const prepared = new Map();
  for (const node of data.nodes) {
    if (node.kind === 'group' && node.mesh == null) continue;
    if (node.kind !== 'mesh' || !node.mesh) throw new Error('3D 節點必須是群組或網格。');
    const { vertices_mm: vertices, faces } = node.mesh;
    if (!Array.isArray(vertices) || !vertices.length || !Array.isArray(faces) || !faces.length ||
        vertices.some(p => !Array.isArray(p) || p.length !== 3 || p.some(n => !Number.isFinite(n)))) throw new Error('3D 網格座標或面資料無效。');
    const positions = [], uvs = [], groups = [], labels = new Map();
    const faceLabels=node.semantic?.face_labels;
    if(node.semantic?.category==='equipment_placeholder'){
      if(node.semantic.label_mode==='none'){
        if(faceLabels!==undefined||faces.length!==6)throw new Error('純色方塊必須保留六個面且不含文字貼圖。');
      }else if(!Array.isArray(faceLabels)||faceLabels.length!==6||faces.length!==6)throw new Error('標名方塊必須提供六面的名稱。');
    }
    for(const label of faceLabels||[]){
      if(!Number.isInteger(label.face_index)||!faces[label.face_index]||faces[label.face_index].indices.length!==4||labels.has(label.face_index)||typeof label.text!=='string'||!label.text.trim())throw new Error('3D 面的標名資料無效。');
      labels.set(label.face_index,label.text);
    }
    for (const [faceIndex,face] of faces.entries()) {
      if (!materialIds.has(face.material_id)) throw new Error('3D 面參照不存在的材質。');
      const triangles = faceTriangles(vertices, face.indices), start = positions.length / 3;
      for (const triangle of triangles) for (const i of triangle){
        positions.push(...vertices[i]);
        uvs.push(...(labels.has(faceIndex)?[[0,0],[1,0],[1,1],[0,1]][face.indices.indexOf(i)]:[0,0]));
      }
      const count=positions.length/3-start,label=labels.get(faceIndex),previous=groups.at(-1);
      if(label===undefined&&previous&&previous.material===face.material_id&&previous.label===undefined&&previous.start+previous.count===start)previous.count+=count;
      else groups.push({start,count,material:face.material_id,label});
    }
    prepared.set(node.id, { positions, uvs, groups });
  }
  if (!prepared.size) throw new Error('Scene3D 尚未包含可預覽的網格。');
  // Draw trusted strings with Canvas (never HTML), shared across the six faces.
  const labelCanvases=new Map();
  for(const {groups}of prepared.values())for(const {label}of groups){
    if(!label||labelCanvases.has(label))continue;
    const canvas=createCanvas();canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法繪製物件名稱。');
    ctx.fillStyle='#e1eff8';ctx.fillRect(0,0,512,512);
    ctx.strokeStyle='#7196ae';ctx.lineWidth=10;ctx.strokeRect(15,15,482,482);
    const chars=Array.from(label),font=Math.max(12,Math.min(76,400/Math.ceil(Math.sqrt(chars.length)))),lines=[];
    ctx.font=`600 ${font}px "PingFang TC", "Noto Sans CJK TC", sans-serif`;
    let line='';for(const char of chars){if(ctx.measureText(line+char).width>440&&line){lines.push(line);line='';}line+=char;}if(line)lines.push(line);
    ctx.fillStyle='#173b52';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const [i,text]of lines.entries())ctx.fillText(text,256,256+(i-(lines.length-1)/2)*font*1.25,440);
    labelCanvases.set(label,canvas);
  }
  const materials = data.materials.map(m => new THREE.MeshStandardMaterial({
    color: new THREE.Color(...m.color_rgba.slice(0, 3)), roughness: 0.85, metalness: 0,
    opacity: m.color_rgba[3], transparent: m.color_rgba[3] < 1,
  }));
  const materialIndex = new Map(data.materials.map((m, i) => [m.id, i]));
  const labelMaterialIndex=new Map();
  for(const [label,canvas]of labelCanvases){
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    labelMaterialIndex.set(label,materials.length);
    materials.push(new THREE.MeshStandardMaterial({map,roughness:.85,metalness:0}));
  }
  const root = new THREE.Group(), objects = new Map();
  for (const node of data.nodes) {
    let object;
    if (!prepared.has(node.id)) object = new THREE.Group();
    else {
      const { positions, uvs, groups } = prepared.get(node.id), geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      for (const group of groups) geometry.addGroup(group.start, group.count, group.label?labelMaterialIndex.get(group.label):materialIndex.get(group.material));
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, materials);
      object.castShadow = true; object.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x506054, transparent: true, opacity: 0.24 }));
      object.add(edges);
    }
    object.name = node.name || node.id;
    object.userData = { nodeId: node.id, source2DIds: node.source_2d_ids };
    objects.set(node.id, object);
  }
  for (const node of data.nodes) (node.parent_id == null ? root : objects.get(node.parent_id)).add(objects.get(node.id));
  return root;
}

function disposeObject(root) {
  const materials = new Set();
  root.traverse(object => {
    object.geometry?.dispose();
    for (const material of object.material ? [].concat(object.material) : []) materials.add(material);
  });
  const textures=new Set();
  for (const material of materials){if(material.map)textures.add(material.map);material.dispose();}
  for(const texture of textures)texture.dispose();
}

export function createScenePreview(container, onError = () => {}) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
  catch { throw new Error('此瀏覽器無法啟用 WebGL 2，請開啟硬體加速或改用支援的瀏覽器。'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xf0f3ed);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '3D 模型，可拖曳旋轉、滾輪縮放');
  renderer.domElement.setAttribute('tabindex', '0');
  container.append(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 1, 100000);
  camera.up.set(0, 0, 1);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x879477, 1.7); ambient.position.set(0, 0, 1); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6); fill.position.set(-5000, 5000, 3000); scene.add(fill);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.48;
  let model = null, grid = null, size = 1, center = new THREE.Vector3(), lost = false;
  const render = () => { if (!lost) renderer.render(scene, camera); };
  controls.addEventListener('change', render);
  const fit = () => {
    if (!model) return;
    const angle = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
    const distance = size / (2 * Math.sin(angle)) * 1.15;
    camera.position.copy(center).add(new THREE.Vector3(1, 1.5, 1.1).normalize().multiplyScalar(distance));
    camera.near = Math.max(0.1, size / 10000); camera.far = distance + size * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(center); controls.minDistance = size * 0.15; controls.maxDistance = distance * 6;
    controls.update(); render();
  };
  const resize = () => {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height); render();
  };
  const observer = new ResizeObserver(resize); observer.observe(container);
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; onError('3D 顯示已中斷，請重新整理頁面。'); });
  renderer.domElement.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'f') { event.preventDefault(); fit(); } });
  return {
    show(data,{preserveView=false}={}) {
      const hadModel=!!model;
      const next = buildSceneObject(data);
      if (model) { scene.remove(model); disposeObject(model); }
      if (grid) { scene.remove(grid); disposeObject(grid); }
      model = next; scene.add(model);
      const box = new THREE.Box3().setFromObject(model); box.getCenter(center);
      size = box.getSize(new THREE.Vector3()).length();
      if (!Number.isFinite(size) || size <= 0) throw new Error('3D 模型尺寸無效。');
      key.position.copy(center).add(new THREE.Vector3(size, size * 0.5, size * 1.5)); key.target.position.copy(center);
      Object.assign(key.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: size * 0.01, far: size * 5 });
      key.shadow.camera.updateProjectionMatrix(); key.shadow.normalBias = size * 0.0005;
      grid = new THREE.GridHelper(size * 2, 20, 0xc8d2c0, 0xe0e6d9); grid.rotation.x = Math.PI / 2;
      grid.position.set(center.x, center.y, box.min.z - size * 0.002); scene.add(grid);
      resize(); if(preserveView&&hadModel)render();else fit();
    },
    fit,
    resize,
    png: () => new Promise((resolve, reject) => {
      render();
      renderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error('無法產生 PNG 圖片。')), 'image/png');
    }),
    dispose() {
      observer.disconnect(); controls.dispose();
      if (model) disposeObject(model); if (grid) disposeObject(grid);
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
