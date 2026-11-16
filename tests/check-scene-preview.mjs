import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Box3, Vector3 } from '../web/vendor/three/three.module.js';
import { buildSceneObject } from '../web/js/services/preview-service.js';
const example = JSON.parse(await fs.readFile(new URL('../web/assets/scene3d.example.json', import.meta.url)));
const before = JSON.stringify(example.scene3d), root = buildSceneObject(example.scene3d);
assert.equal(JSON.stringify(example.scene3d), before, 'Preview must not modify the JSON');
const objects = []; root.traverse(node => { if (node.userData.nodeId) objects.push(node); });
assert.equal(objects.length, 12); assert.equal(objects.filter(node => node.isMesh).length, 10);
const bounds = new Box3().setFromObject(root);
assert.deepEqual(bounds.min.toArray(), [0, -100, -100]); assert.deepEqual(bounds.max.toArray(), [5000, 3000, 2500]);
const chair = objects.find(node => node.userData.nodeId === 'example_node_chair_seat');
assert.equal(chair.parent.userData.nodeId, 'example_node_chair');
assert.deepEqual(chair.getWorldPosition(new Vector3()).toArray(), [0, 0, 0], 'Parent hierarchy must not reapply placement');

// Concave planar face: area is 3, not the overlapping fan that a naive renderer produces.
const polygon = { schema: 'Scene3D', schema_version: '1.0.0', units: 'mm', materials: [{ id: 'm', color_rgba: [1, 1, 1, 1] }], nodes: [
  { id: 'p', kind: 'mesh', parent_id: null, mesh: { vertices_mm: [[0, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]], faces: [{ indices: [0, 1, 2, 3, 4, 5], material_id: 'm' }] } },
] };
for (const reverse of [false, true]) {
  const sample = structuredClone(polygon); if (reverse) sample.nodes[0].mesh.faces[0].indices.reverse();
  const mesh = buildSceneObject(sample).children[0], p = mesh.geometry.attributes.position;
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1), c = new Vector3().fromBufferAttribute(p, i + 2);
    const cross = b.sub(a).cross(c.sub(a)); area += cross.length() / 2;
    assert(reverse ? cross.z < 0 : cross.z > 0, 'Winding is preserved');
  }
  assert.equal(area, 3);
}
const invalid = structuredClone(polygon); invalid.nodes[0].mesh.faces[0].indices[0] = 999;
assert.throws(() => buildSceneObject(invalid), /索引/);
const cycle = structuredClone(polygon); cycle.nodes[0].parent_id = 'p';
assert.throws(() => buildSceneObject(cycle), /循環/);
const missingMaterial = structuredClone(polygon); missingMaterial.nodes[0].mesh.faces[0].material_id = 'missing';
assert.throws(() => buildSceneObject(missingMaterial), /材質/);
console.log('PASS: 12 nodes, 10 meshes, mm/Z-up bounds, hierarchy, unchanged source JSON, concave triangulation, invalid geometry rejection.');
