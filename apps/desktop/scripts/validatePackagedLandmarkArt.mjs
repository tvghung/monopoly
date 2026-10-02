import {
  landmarkArtworkRoot,
  validateLandmarkArtwork,
} from '../../client/scripts/validateLandmarkArtwork.mjs';
import { findPackagedRendererRoot } from './packagedRenderer.mjs';

const rendererRoot = await findPackagedRendererRoot('art/landmarks', 'landmark artwork');

const report = await validateLandmarkArtwork({ sourceDirectory: landmarkArtworkRoot, buildDirectory: rendererRoot });
if (report.errors.length) throw new Error(report.errors.join('\n'));
console.log(`[PASS] ${report.expected} landmark artworks verified in packaged renderer: ${rendererRoot}`);
