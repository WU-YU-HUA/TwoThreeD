import {validateFloorPlan,validateFloorPlanV2,validateFloorPlanV3,validateFloorPlanV4,validateFloorPlanV5,validateFloorPlanV6,validateFloorPlanV7,validateFloorPlanV8} from './validators.generated.js';

export function migrateFloorPlanV1ToV2(plan){
  if(!validateFloorPlan(plan))throw new Error('升級需要符合 FloorPlan2D@1.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='2.0.0';
  for(const level of upgraded.levels)level.columns=[];
  if(!validateFloorPlanV2(upgraded))throw new Error('FloorPlan2D v2 升級驗證失敗。');
  return upgraded;
}

export function migrateFloorPlanV2ToV3(plan){
  if(!validateFloorPlanV2(plan))throw new Error('升級需要符合 FloorPlan2D@2.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='3.0.0';
  for(const level of upgraded.levels)level.doors=[];
  if(!validateFloorPlanV3(upgraded))throw new Error('FloorPlan2D v3 升級驗證失敗。');
  return upgraded;
}

export function migrateFloorPlanV3ToV4(plan){
  if(!validateFloorPlanV3(plan))throw new Error('升級需要符合 FloorPlan2D@3.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='4.0.0';
  for(const level of upgraded.levels)level.furniture=[];
  if(!validateFloorPlanV4(upgraded))throw new Error('FloorPlan2D v4 升級驗證失敗。');
  return upgraded;
}

export function migrateFloorPlanV4ToV5(plan){
  if(!validateFloorPlanV4(plan))throw new Error('升級需要符合 FloorPlan2D@4.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='5.0.0';
  if(!validateFloorPlanV5(upgraded))throw new Error('FloorPlan2D v5 升級驗證失敗。');
  return upgraded;
}

export function migrateFloorPlanV5ToV6(plan){
  if(!validateFloorPlanV5(plan))throw new Error('升級需要符合 FloorPlan2D@5.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='6.0.0';
  if(!validateFloorPlanV6(upgraded))throw new Error('FloorPlan2D v6 升級驗證失敗。');
  return upgraded;
}

export function migrateFloorPlanV6ToV7(plan){
  if(!validateFloorPlanV6(plan))throw new Error('升級需要符合 FloorPlan2D@6.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='7.0.0';
  if(!validateFloorPlanV7(upgraded))throw new Error('FloorPlan2D v7 升級驗證失敗。');
  return upgraded;
}

export function migrateFloorPlanV7ToV8(plan){
  if(!validateFloorPlanV7(plan))throw new Error('升級需要符合 FloorPlan2D@7.0.0 的輸入。');
  const upgraded=structuredClone(plan);upgraded.schema_version='8.0.0';
  if(!validateFloorPlanV8(upgraded))throw new Error('FloorPlan2D v8 升級驗證失敗。');
  return upgraded;
}
