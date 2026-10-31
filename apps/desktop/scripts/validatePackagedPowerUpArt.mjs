import { validatePowerUpArtwork } from '../../client/scripts/validatePowerUpArtwork.mjs';
import { findPackagedRendererRoot } from './packagedRenderer.mjs';
const rendererRoot=await findPackagedRendererRoot('art/powerups','Power-up artwork');
const report=await validatePowerUpArtwork({buildDirectory:rendererRoot});
if(report.errors.length)throw Error(report.errors.join('\n'));
console.log('[PASS] 30 fronts and three category backs: SVG/PNG byte parity in '+rendererRoot);
