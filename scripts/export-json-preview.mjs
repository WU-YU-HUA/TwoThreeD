// Diagnostic workflow only. All domain work lives in the four browser services.
// node scripts/export-json-preview.mjs <PDF path> <output dir> <dependency root>
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const [input, outputDir, dependencyRoot] = process.argv.slice(2);
if (!input || !outputDir || !dependencyRoot) throw new Error('Supply PDF path, output directory and Node dependency root.');
const require = createRequire(path.resolve(dependencyRoot, 'package.json'));
const canvas = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, Path2D: canvas.Path2D, ImageData: canvas.ImageData });

const { readFile } = await import('../web/js/services/file-reader-service.js');
const { extractData, extractInspection } = await import('../web/js/services/extraction-service.js');
const { create3DProposal } = await import('../web/js/services/transfer-service.js');
const { createJsonArtifact } = await import('../web/js/services/export-service.js');

const source = await readFile(new File([await fs.readFile(input)], path.basename(input)), { pdfOptions: { useSystemFonts: true } });
try {
  const extracted = await extractData(source, { includeGeometry: true, rasterFallback: false });
  const { plan, geometry } = await extractInspection(source, extracted);
  const proposal = await create3DProposal(plan);
  const artifacts = [
    createJsonArtifact('plan2d.inspection.json', plan),
    createJsonArtifact('plan2d.geometry.json', geometry),
    createJsonArtifact('scene3d.proposal.json', proposal),
  ];
  await fs.mkdir(outputDir, { recursive: true });
  for (const artifact of artifacts) await fs.writeFile(path.join(outputDir, artifact.filename), artifact.content);
  console.log(JSON.stringify({ output: path.resolve(outputDir), layers: plan.layers.length,
    object_labels: plan.object_labels.length, vector_paths: geometry.vector_paths.length,
    planned_groups: proposal.planned_object_groups.length, illustrative_nodes: proposal.format_example.scene3d.nodes.length,
    actual_scene_generated: false }));
} finally {
  await source.dispose();
}
