// Historical boundary-approved path; production exports are official Three.js, not mini3.
// Reproduce with npm run vendor-three. See vendor/provenance.json for hashes and licenses.
export * from './vendor/three.module.js';
export { isWebGL2Available } from './support.ts';
