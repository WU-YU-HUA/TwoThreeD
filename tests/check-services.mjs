// node tests/check-services.mjs <reference PDF> <Node dependency root>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const [input, dependencyRoot] = process.argv.slice(2);
if (!input || !dependencyRoot) throw new Error('Supply reference PDF and Node dependency root.');
const require = createRequire(path.resolve(dependencyRoot, 'package.json'));
const canvas = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, Path2D: canvas.Path2D, ImageData: canvas.ImageData });
globalThis.DxfParser = createRequire(import.meta.url)('../web/vendor/dxf-parser/dist/dxf-parser.js');
const { readFile, validateFile } = await import('../web/js/services/file-reader-service.js');
const { extractData, extractInspection, getObjectSummary, dxfView } = await import('../web/js/services/extraction-service.js');
const { convert2DTo3D, create3DProposal } = await import('../web/js/services/transfer-service.js');
const { export3D, createJsonArtifact, exportCapabilities } = await import('../web/js/services/export-service.js');
const file = async filename => new File([await fs.readFile(filename)], path.basename(filename));

await assert.rejects(readFile(new File(['x'], 'plan.dwg')), { code: 'E_UNSUPPORTED_INPUT' });
await assert.rejects(readFile(new File([], 'empty.pdf')), { code: 'E_EMPTY_FILE' });
await assert.rejects(readFile(await file('tests/fixtures/invalid.pdf')), { code: 'E_INVALID_PDF' });
await assert.rejects(readFile(new File(['AutoCAD Binary DXF'], 'binary.dxf')), { code: 'E_BINARY_DXF' });
assert.throws(() => validateFile({ name: 'large.pdf', size: 51 * 1024 * 1024, arrayBuffer() { throw new Error('must not read'); } }), { code: 'E_FILE_TOO_LARGE' });

const dxf = await readFile(new File([await fs.readFile('web/assets/sample-plan.dxf')], 'sample.DXF'));
try {
  assert.equal(dxf.format, 'dxf'); assert(dxf.document.entities);
  assert.equal(dxf.document.paths, undefined, 'Reader must not extract geometry');
  const extracted = await extractData(dxf), preview = extracted.preview;
  assert.equal(preview.total, 19); assert.equal(preview.paths.length, 14); assert.equal(preview.labels.length, 5);
  assert.equal(dxfView(preview, false).paths, preview.originalPaths);
  assert(getObjectSummary(extracted).layers.length);
} finally { await dxf.dispose(); }

const source = await readFile(await file(input), { pdfOptions: { useSystemFonts: true } });
try {
  const extracted = await extractData(source, { includeGeometry: true, rasterFallback: false });
  const { plan, geometry } = await extractInspection(source, extracted);
  const proposal = await create3DProposal(plan);
  for (const [name, data] of [['plan2d.inspection.json', plan], ['plan2d.geometry.json', geometry], ['scene3d.proposal.json', proposal]]) {
    const artifact = createJsonArtifact(name, data);
    assert.deepEqual(JSON.parse(artifact.content), JSON.parse(await fs.readFile('outputs/json-preview/' + name, 'utf8')), name + ' must preserve data and stable IDs');
  }
  assert.equal(proposal.actual_scene3d, null); assert.equal(proposal.export_ready, false);
  assert.equal(proposal.format_example.scene3d.nodes.length, 12);
  const example = JSON.parse(await fs.readFile('web/assets/scene3d.example.json', 'utf8'));
  assert.deepEqual(example, proposal.format_example, 'Browser demo uses the same 3D JSON example');
  assert.equal(convert2DTo3D(plan).scene, null);
  assert.equal(convert2DTo3D(plan).report.diagnostics[0].code, 'E_FLOORPLAN_REQUIRED');
  assert.equal(convert2DTo3D({ schema: 'FloorPlan2D', schema_version: '1.0.0', source: { scale_verified: false } }).report.diagnostics[0].code, 'E_SCALE_UNVERIFIED');
  assert.equal(convert2DTo3D({ schema: 'FloorPlan2D', schema_version: '1.0.0', source: { scale_verified: true } }).report.diagnostics[0].code, 'E_SCHEMA');
  assert.equal(export3D(proposal).diagnostics[0].code, 'E_SCENE_REQUIRED');
  assert.equal(export3D(example.scene3d).success, true);
  assert.equal(export3D(example.scene3d, { format: 'unknown' }).diagnostics[0].code, 'E_UNSUPPORTED_OUTPUT');
  assert.deepEqual(exportCapabilities().available3DFormats, ['dae']);
  // A manual region must change the extracted content, without changing source coordinates.
  extracted.analysis.userBox = [230, 175, 355, 410];
  const pantry = await extractInspection(source, extracted);
  assert.equal(pantry.plan.main_region.method, 'manual');
  assert(!JSON.stringify(pantry.plan.object_labels).includes('OA辦公家具'));
  assert(JSON.stringify(pantry.plan.object_labels).includes('飲水機'));
} finally { await source.dispose(); await source.dispose(); }
assert.throws(() => createJsonArtifact('../model.json', {}));
assert.throws(() => createJsonArtifact('model.json', { value: NaN }));
console.log('PASS: reader validation, DXF extraction, PDF evidence, 3 JSON regressions, manual region, strict transfer gates, validated DAE export and preview rejection, disposal.');
