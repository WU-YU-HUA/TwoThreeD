import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {findHatchedRegions} from '../web/js/extraction/structure-analysis.js';

let operator=0;
const line=(a,b,layer='HATCH')=>({sourceOperatorIndex:operator++,names:[layer],commands:[{op:'move_to',points:[a]},{op:'line_to',points:[b]}]});
const outline=(ring,layer='木作')=>ring.map((p,i)=>line(p,ring[(i+1)%ring.length],layer));
const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
// Fixture generator: clip y = +/- x + offset against a known polygon.
function hatch(ring,{cross=false,spacing=1}={}){
  const points=ring.flat(),limit=Math.max(...points.map(Math.abs))*3+10,result=[];
  for(const sign of cross?[1,-1]:[1])for(let offset=-limit;offset<=limit;offset+=spacing){
    const cuts=[];
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],va=a[1]-sign*a[0]-offset,vb=b[1]-sign*b[0]-offset;
      if((va<=0&&vb>0)||(vb<=0&&va>0)){const t=va/(va-vb);cuts.push(a.map((v,k)=>v+(b[k]-v)*t));}
    }
    cuts.sort((a,b)=>a[0]-b[0]);for(let i=0;i+1<cuts.length;i+=2)result.push(line(cuts[i],cuts[i+1]));
  }
  return result;
}
const scope=[-10,-10,110,110],square=rectangle(0,0,8,10),wall=rectangle(20,0,24,60),L=[[40,0],[44,0],[44,56],[70,56],[70,60],[40,60]];
const fixture=[...outline(square,'原有牆'),...hatch(square,{cross:true}),...outline(wall),...hatch(wall),...outline(L),...hatch(L)];
const found=findHatchedRegions(fixture,scope,{fingerprint:'fixture'});
assert.equal(found.regions.length,3);assert.equal(found.regions.filter(r=>r.kind==='column').length,1);
assert.equal(found.regions.filter(r=>r.kind==='wall').length,2);
const bent=found.regions.find(r=>r.boundary.length===6);assert(bent,'L footprint remains concave');assert(Math.abs(bent.area_source_units2-344)<1e-6);
assert.equal(found.unassigned_hatch_strokes,0);
assert.equal(findHatchedRegions([...outline(square),line([0,0],[8,10]),line([0,10],[8,0])],scope).regions.length,0,'Furniture X is not repeated hatching');
assert.equal(findHatchedRegions(outline(square),scope).regions.length,0,'Plain outline is not concrete');
assert.equal(findHatchedRegions([...outline(square).slice(1),...hatch(square)],scope).regions.length,0,'Missing boundary is not invented');
assert.equal(findHatchedRegions(fixture,[1,1,7,9]).regions.length,0,'Crop must not create partial columns');
const subset=findHatchedRegions(fixture,[-1,-1,9,11],{fingerprint:'fixture'});assert.equal(subset.regions[0].id,found.regions.find(r=>r.kind==='column').id,'IDs stable across crop');
assert.deepEqual(findHatchedRegions([...fixture,...fixture],scope,{fingerprint:'fixture'}).regions.map(r=>r.id),found.regions.map(r=>r.id),'Duplicate CAD strokes do not duplicate objects');
assert.deepEqual(findHatchedRegions([...fixture].reverse(),scope,{fingerprint:'fixture'}).regions.map(r=>r.id),found.regions.map(r=>r.id),'Path order does not change IDs');
const divided=findHatchedRegions([...outline(wall),...hatch(wall),line([20,2],[24,2],'原有牆')],scope);assert.equal(divided.regions.length,1,'Crossing line does not split a filled wall into two objects');
assert(Math.abs(divided.regions[0].area_source_units2-240)<1e-6);
// Keep an unfilled interior ring as a hole rather than filling its bounding box.
const outer=rectangle(0,0,20,20),inner=rectangle(6,6,14,14);
const annulusHatch=[...hatch(rectangle(0,0,20,6)),...hatch(rectangle(0,14,20,20)),...hatch(rectangle(0,6,6,14)),...hatch(rectangle(14,6,20,14))];
const annulus=findHatchedRegions([...outline(outer),...outline(inner),...annulusHatch],scope);
assert.equal(annulus.regions.length,1);assert.equal(annulus.regions[0].holes.length,1);assert(Math.abs(annulus.regions[0].area_source_units2-336)<1e-6);

const [input,dependencyRoot]=process.argv.slice(2),require=createRequire(path.resolve(dependencyRoot,'package.json'));
const canvas=require('@napi-rs/canvas');Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData,DxfParser:createRequire(import.meta.url)('../web/vendor/dxf-parser/dist/dxf-parser.js')});
const {readFile}=await import('../web/js/services/file-reader-service.js');
const {extractData,prepareWallCandidates,extractStructure}=await import('../web/js/services/extraction-service.js');
const source=await readFile(new File([await fs.readFile(input)],path.basename(input)),{pdfOptions:{useSystemFonts:true}});
try{
  const extracted=await extractData(source,{includeGeometry:true,rasterFallback:false}),base=prepareWallCandidates(source,extracted),snapshot=JSON.stringify(extracted.analysis.paths);
  const result=extractStructure(source,extracted,{wallCandidates:base});
  assert.equal(JSON.stringify(extracted.analysis.paths),snapshot,'Extraction must not mutate source paths');
  assert.equal(result.summary.concrete_columns,6);assert.equal(result.summary.concrete_walls,3);assert.equal(result.summary.light_partitions,5);assert.equal(result.objects.length,51);
  assert.equal(result.summary.doors,2);
  assert.equal(new Set(result.objects.map(o=>o.id)).size,51);assert(result.objects.every(o=>!o.confirmed&&o.source_refs.length&&o.boundary_mm.length===o.boundary.length));
  assert(result.objects.filter(o=>o.material.kind==='light_partition'&&o.evidence.method!=='labelled_oa_closed_parallel_strips').every(o=>o.evidence.boundary_layers.includes('原有牆')),'Do not classify furniture/window edges as light partitions');
  assert(result.objects.some(o=>o.kind==='wall'&&o.boundary.length===6&&o.evidence.boundary_layers.includes('木作')),'Recover the partition on the woodwork layer');
  const short=result.objects.find(o=>o.material.kind==='concrete'&&o.kind==='wall'&&Math.abs(o.area_source_units2-225.0864)<.01);assert(short,'Retain the lower short partition');
  assert.equal(result.calibration.reference_thickness_mm,200);assert(Math.abs(result.calibration.mm_per_source_unit-200/9.72)<1e-6);
  assert.deepEqual(extractStructure(source,extracted,{wallCandidates:base}),result,'Deterministic serializable evidence');
  await fs.mkdir('outputs/extraction',{recursive:true});await fs.writeFile('outputs/extraction/plan2d.structure.json',JSON.stringify(result,null,2)+'\n');
  extracted.analysis.userBox=[230,175,355,450];const cropped=extractStructure(source,extracted);
  assert.equal(cropped.summary.concrete_columns,0);assert.equal(cropped.summary.concrete_walls,2);
  assert(cropped.objects.every(o=>result.objects.some(original=>original.id===o.id)),'Whole object IDs retained after cropping');
  console.log(JSON.stringify({objects:result.objects.length,...result.summary,source_sha256:source.sha256}));
}finally{await source.dispose();}
console.log('PASS: hatch/outline recognition, columns, concave and short partitions, plain wall material defaults, duplicate/order/crop stability, incomplete outlines, furniture exclusion, holes, source references, original PDF pipeline.');
