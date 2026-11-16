// node tests/check-model-pipeline.mjs <reference PDF> <Node dependency root>
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const [input,dependencyRoot]=process.argv.slice(2),require=createRequire(path.resolve(dependencyRoot,'package.json'));
const canvas=require('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData,DxfParser:createRequire(import.meta.url)('../web/vendor/dxf-parser/dist/dxf-parser.js')});
const {readFile}=await import('../web/js/services/file-reader-service.js');
const {extractData,prepareWallCandidates,buildWallPlan}=await import('../web/js/services/extraction-service.js');
const {convert2DTo3D}=await import('../web/js/services/transfer-service.js');
const {buildSceneObject}=await import('../web/js/services/preview-service.js');
const {export3D}=await import('../web/js/services/export-service.js');
const {validateFloorPlan}=await import('../web/js/contracts/validators.generated.js');
for(const filename of [input,'web/assets/sample-plan.dxf']){
  const source=await readFile(new File([await fs.readFile(filename)],path.basename(filename)),{pdfOptions:{useSystemFonts:true}});
  try{
    const extracted=await extractData(source,{includeGeometry:true,rasterFallback:false}),candidates=prepareWallCandidates(source,extracted);
    assert(candidates.walls.length>=5);assert.equal(new Set(candidates.walls.map(w=>w.id)).size,candidates.walls.length);
    assert.equal(candidates.referenceWallId,candidates.walls[0].id,'Upper-left reference selected by geometry');
    const plan=buildWallPlan(source,candidates),result=convert2DTo3D(plan,{mode:'preview'});
    assert.equal(plan.extensions.twothreeD.model_defaults.door_height_mm,2100);
    assert.equal(plan.extensions.twothreeD.model_defaults.window_sill_height_mm,900);
    assert.equal(plan.extensions.twothreeD.model_defaults.window_height_mm,1200);
    assert(validateFloorPlan(plan),JSON.stringify(validateFloorPlan.errors));assert.equal(result.report.status,'success',JSON.stringify(result.report));
    assert.equal(result.scene.extensions.twothreeD.source_sha256,source.sha256);assert.equal(result.report.metrics.walls,candidates.walls.length);
    assert.equal(result.report.metrics.openings,0);assert.equal(result.report.metrics.slabs,0,'Never invent a slab from a drawing bbox');
    assert.equal(plan.levels[0].walls[0].thickness_mm,200);assert(plan.levels[0].walls.every(w=>w.height_mm===2500&&!w.confirmed));
    assert(result.scene.nodes.every(n=>!n.id.startsWith('example_')));assert(buildSceneObject(result.scene).children.length);
    assert.equal(convert2DTo3D(plan).report.status,'failed');assert.equal(export3D(result.scene).diagnostics[0].code,'E_PREVIEW_ONLY');
    const doubled=buildWallPlan(source,candidates,{referenceWallId:candidates.walls[0].id,referenceThicknessMm:400,wallHeightMm:3000});
    assert(doubled.levels[0].walls.every((w,i)=>Math.abs(w.thickness_mm-plan.levels[0].walls[i].thickness_mm*2)<1e-6));
    assert(doubled.levels[0].walls.every(w=>w.height_mm===3000));
    assert.throws(()=>buildWallPlan(source,candidates,{referenceWallId:'missing'}));
    if(source.format==='pdf'){
      await fs.mkdir('outputs/model-preview',{recursive:true});
      for(const [name,value]of [['floorplan2d.preview',plan],['scene3d.preview',result.scene],['transfer-report.preview',result.report]])await fs.writeFile(`outputs/model-preview/${name}.json`,JSON.stringify(value,null,2)+'\n');
      extracted.analysis.userBox=[230,175,355,410];
      const small=prepareWallCandidates(source,extracted);assert(small.walls.length<candidates.walls.length,'Crop must change the candidate set');
    }
    console.log(JSON.stringify({format:source.format,walls:candidates.walls.length,gaps:candidates.walls.map(w=>Number(w.gap.toFixed(3))),meshes:result.scene.nodes.filter(n=>n.mesh).length,source_sha256:source.sha256,preview_only:true}));
  }finally{await source.dispose();}
}
console.log('PASS: actual PDF/DXF -> candidate FloorPlan2D -> generated Scene3D -> preview meshes; scaling, crop, source provenance, strict/export gates.');
