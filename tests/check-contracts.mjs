import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateFloorPlan,validateFloorPlanV2,validateFloorPlanV3,validateFloorPlanV4,validateFloorPlanV5,validateFloorPlanV6,validateFloorPlanV7,validateFloorPlanV8,validateScene3D,validateProfile,validateReport,validateReportV2,validateReportV3,validateReportV4,validateReportV5,validateReportV6,validateReportV7,validateReportV8} from '../web/js/contracts/validators.generated.js';
for(const [name,validate]of [['floorplan2d',validateFloorPlan],['scene3d',validateScene3D],['transfer-profile',validateProfile],['transfer-report',validateReport],['floorplan2d.v2',validateFloorPlanV2],['transfer-report.v2',validateReportV2],['floorplan2d.v3',validateFloorPlanV3],['transfer-report.v3',validateReportV3],['floorplan2d.v4',validateFloorPlanV4],['transfer-report.v4',validateReportV4],['floorplan2d.v5',validateFloorPlanV5],['transfer-report.v5',validateReportV5],['floorplan2d.v6',validateFloorPlanV6],['transfer-report.v6',validateReportV6],['floorplan2d.v7',validateFloorPlanV7],['transfer-report.v7',validateReportV7],['floorplan2d.v8',validateFloorPlanV8],['transfer-report.v8',validateReportV8]]){
  const data=JSON.parse(await fs.readFile(`examples/${name}.sample.json`,'utf8'));
  assert(validate(data),JSON.stringify(validate.errors));
  assert.equal(validate({...data,schema_version:'99.0.0'}),false,'Reject incompatible versions');
}
console.log('PASS: eighteen sample contracts validated by compiled Ajv JSON Schemas; incompatible versions rejected.');
