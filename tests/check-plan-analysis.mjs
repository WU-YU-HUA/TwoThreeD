// Usage: node tests/check-plan-analysis.mjs <PDF path> <directory containing @napi-rs/canvas>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const source=process.argv[2], dependencyRoot=process.argv[3];
if(!source||!dependencyRoot)throw new Error('Supply the reference PDF and dependency root.');
const require=createRequire(path.resolve(dependencyRoot,'package.json'));
const canvas=require('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData});
const pdfjs=await import('../web/vendor/pdfjs/build/pdf.mjs');
const {analyzePdfPage,pdfObjects,normalizeBox,transformBox}=await import('../web/js/plan-analysis.js');
const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(source)),useSystemFonts:true}).promise;
try{
  const page=await pdf.getPage(1),analysis=await analyzePdfPage(pdf,page),summary=pdfObjects(analysis,analysis.box);
  assert.equal(analysis.method,'layers');assert.equal(analysis.hiddenCount,1);
  assert(analysis.box[0]>190&&analysis.box[2]<900,'Main region excludes the outer title frame');
  assert(analysis.box[1]>140,'Main region excludes bottom title block');
  assert(summary.layers.includes('原有牆'));assert(summary.layers.includes('門'));assert(summary.layers.includes('窗'));
  const all=JSON.stringify(summary);for(const term of ['公司','115.11.04','張秀菁','Gary','圖框','A1-001'])assert(!all.includes(term),`Excluded: ${term}`);
  assert(summary.categories.find(c=>c.title==='空間').items.some(i=>i.name==='會議區'));
  const furniture=summary.categories.find(c=>c.title==='家具與收納');assert.equal(furniture.items.find(i=>i.name==='新做OA辦公家具').count,4);
  const equipment=summary.categories.find(c=>c.title==='設備');assert.equal(equipment.items.find(i=>i.name==='印表機').count,3);
  // Restrict the box to the left pantry: office furniture must be removed.
  const pantry=pdfObjects(analysis,[230,175,355,410]);assert(!JSON.stringify(pantry.categories).includes('OA辦公家具'));assert(JSON.stringify(pantry.categories).includes('飲水機'));
  for(const rotation of [0,90,180,270]){
    const viewport=page.getViewport({scale:1,rotation});const projected=normalizeBox(viewport.convertToViewportRectangle(analysis.box));
    const restored=normalizeBox([...viewport.convertToPdfPoint(projected[0],projected[1]),...viewport.convertToPdfPoint(projected[2],projected[3])]);
    assert(restored.every((n,i)=>Math.abs(n-analysis.box[i])<1e-6));
  }
  assert.deepEqual(transformBox([0,0,2,3],[0,1,-1,0,10,20]),[7,20,10,22]);
  console.log('PASS: layer-based region, title exclusion, object evidence, manual-region filtering, rotation coordinates.');
}finally{await pdf.destroy();}
