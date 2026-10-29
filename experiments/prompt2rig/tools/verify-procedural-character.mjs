import fs from 'node:fs/promises';
import {createProceduralCharacter,validateProceduralParts} from '../public/lab/procedural-character.js';
import {exportCharacter} from '../public/lab/assets.js';
import {modelStats} from '../public/lab/optimize.js';

globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
const root=createProceduralCharacter(),parts=validateProceduralParts();
const report={model:'procedural-cage-character-v1',method:'authored cross-section rings, mirrored sides, independent caps, blended skinning',usesReferenceMesh:false,parts:parts.length,stats:modelStats(root),allPartsPass:parts.every(p=>p.pass),checks:parts,limits:['Individual watertight parts do not imply a continuously welded body.','Intersections between assembled parts and extreme-pose self-intersection are not exhaustively tested.','No reference-fit silhouette or surface-error score is claimed.']};
if(!report.allPartsPass)throw new Error('Part topology validation failed');
await fs.writeFile(new URL('../docs/procedural-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
const glb=await exportCharacter(root,[]);await fs.writeFile(new URL('../samples/procedural_character_v1.glb',import.meta.url),Buffer.from(glb));
console.log(JSON.stringify({parts:report.parts,...report.stats,closedPartsPass:report.allPartsPass,glbBytes:glb.byteLength}));
