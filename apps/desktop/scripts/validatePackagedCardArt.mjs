import {
  artworkRoot,
  validateCardArtwork,
} from '../../client/scripts/validateCardArtwork.mjs';
import { findPackagedRendererRoot } from './packagedRenderer.mjs';

const rendererRoot = await findPackagedRendererRoot('art/cards', 'card artwork');

const report = await validateCardArtwork({ sourceDirectory: artworkRoot, buildDirectory: rendererRoot });
if (report.errors.length) throw new Error(report.errors.join('\n'));
console.log(`[PASS] ${report.expected} card artworks verified in packaged renderer: ${rendererRoot}`);
