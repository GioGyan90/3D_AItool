import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrimitiveControlMesh,insetControlRegion,validateControlTopology} from '../src/components/meshTopology.ts';
test('two-face region inset preserves outer cage and shared fold, closed manifold',()=>{
 const m=createPrimitiveControlMesh('box'),before=JSON.stringify(m);
 const n=insetControlRegion(m,[0,3],.25);
 assert.equal(n.vertices.length,14);assert.equal(n.faces.length,12);
 assert.deepEqual(n.vertices.slice(0,8),m.vertices);assert.equal(validateControlTopology(n).boundaryEdges,0);
 assert.equal(JSON.stringify(m),before);
});
test('disconnected or whole closed surface region rejected atomically',()=>{
 const m=createPrimitiveControlMesh('box'),before=JSON.stringify(m);
 assert.throws(()=>insetControlRegion(m,[0,1],.25));assert.throws(()=>insetControlRegion(m,[0,1,2,3,4,5],.25));assert.equal(JSON.stringify(m),before);
});
