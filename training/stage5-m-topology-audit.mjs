import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {triangulateFaces} from '../src/components/traceGeometry.ts';
import {renderedRegionDiagnostics} from '../src/components/regionInspection.ts';
import {validateControlTopology} from '../src/components/meshTopology.ts';
const mesh=JSON.parse(await readFile('stage5-l-artifact/stage5-l.json','utf8'));
const topology=validateControlTopology(mesh);
assert.equal(mesh.vertices.length,113);assert.equal(mesh.faces.length,112);
const ids=mesh.faces.map((_,i)=>i);
const audit=optimized=>{
 const indices=triangulateFaces(mesh.vertices,mesh.faces,optimized,true);
 const d=renderedRegionDiagnostics(mesh,indices,ids);
 return {indices,folds:d.folds,score:d.folds.reduce((s,e)=>s+(e.internal?1:.3)*Math.max(0,Math.abs(e.degrees)-(e.internal?25:35))**2,0)};
};
const baseline=audit(false),alternative=audit(true);
const adjacency=mesh.faces.map((f,i)=>({face:i,vertices:f,neighbors:ids.filter(j=>j!==i&&mesh.faces[j].filter(v=>f.includes(v)).length>=2)}));
const suspect=baseline.folds.filter(e=>e.internal&&Math.abs(e.degrees)>=40).map(e=>({edge:e,face:adjacency[e.faces[0]],positions:mesh.faces[e.faces[0]].map(v=>mesh.vertices[v]),alternative:alternative.folds.filter(x=>x.faces.includes(e.faces[0]))}));
const report={sourceRun:45865666182,topology,baseline,alternative,suspect,decision:'Read-only audit; no model accepted or published. Compare actual rendering before any topology edit.'};
await mkdir('artifacts/stage5-m',{recursive:true});await writeFile('artifacts/stage5-m/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({topology,baseline:baseline.score,alternative:alternative.score,suspect:suspect.map(x=>x.face.face)}));
