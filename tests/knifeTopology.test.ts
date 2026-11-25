import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrimitiveControlMesh,validateControlTopology} from '../src/components/meshTopology';
import {triangulateFaces} from '../src/components/traceGeometry';
import {knifeCut,dissolveEdge,mergeEdgeVertices,type KnifeStep} from '../src/components/knifeTopology';
const closed=(m:ReturnType<typeof createPrimitiveControlMesh>)=>{const s=validateControlTopology(m);assert.equal(s.boundaryEdges,0);assert.equal(m.vertices.length-s.edges+m.faces.length,2);assert.equal(triangulateFaces(m.vertices,m.faces).length/3,m.faces.reduce((n,f)=>n+f.length-2,0))};
test('continuous knife crosses two cube faces via exactly one shared edge vertex',()=>{
 const m=createPrimitiveControlMesh('box'),before=JSON.stringify(m);
 const steps:KnifeStep[]=[{face:0,from:{vertex:4},to:{edge:[5,6],fraction:.3}},{face:3,from:{edge:[6,5],fraction:.7},to:{vertex:1}}];
 const next=knifeCut(m,steps);assert.equal(next.vertices.length,9);assert.equal(next.faces.length,8);assert.deepEqual(next.vertices[8],[.5,-.2,.5]);closed(next);assert.equal(JSON.stringify(m),before);
 assert.throws(()=>knifeCut(m,[steps[0],{...steps[1],from:{edge:[6,5],fraction:.3}}]),/不一致/);
 assert.throws(()=>knifeCut(m,[steps[0],{...steps[1],from:{vertex:2}}]),/不连续/);
});
test('knife supports nonquad faces and repairs neighbors that share cut edges',()=>{
 const m=createPrimitiveControlMesh('box');
 const next=knifeCut(m,[{face:0,from:{edge:[4,5],fraction:.3},to:{edge:[6,7],fraction:.6}}]);
 assert.equal(next.vertices.length,10);closed(next);
 const triangle={vertices:[[0,0,0],[2,0,0],[0,2,0]] as [number,number,number][],faces:[[0,1,2]]};
 const t=knifeCut(triangle,[{face:0,from:{vertex:0},to:{edge:[1,2],fraction:.4}}]);assert.equal(t.faces.length,2);assert.equal(t.vertices.length,4);
});
test('knife rejects exterior concave chords and boundary overlap',()=>{
 const mesh={vertices:[[0,0,0],[3,0,0],[3,3,0],[2,3,0],[2,1,0],[1,1,0],[1,3,0],[0,3,0]] as [number,number,number][],faces:[[0,1,2,3,4,5,6,7]]};
 assert.throws(()=>knifeCut(mesh,[{face:0,from:{vertex:3},to:{vertex:6}}]));
 assert.throws(()=>knifeCut(mesh,[{face:0,from:{vertex:0},to:{vertex:1}}]));
});
test('dissolve restores coplanar polygon, rejects hard edge and material seam',()=>{
 const m=createPrimitiveControlMesh('box');
 const split=knifeCut(m,[{face:0,from:{vertex:4},to:{vertex:6}}]);
 const next=dissolveEdge(split,4,6);assert.equal(next.faces.length,6);assert.equal(next.vertices.length,8);closed(next);
 assert.throws(()=>dissolveEdge(m,4,5),/夹角/);
 const painted={...split,faceColors:split.faces.map((_,i)=>i===0?'#ffffff':'#000000')};
 assert.throws(()=>dissolveEdge(painted,4,6),/颜色/);
});
test('vertex collapse preserves closed cube cage and rejects nonadjacent endpoints',()=>{
 const m=createPrimitiveControlMesh('box'),next=mergeEdgeVertices(m,4,5);
 assert.equal(next.vertices.length,7);closed(next);assert.throws(()=>mergeEdgeVertices(m,0,6),/相邻/);
});
