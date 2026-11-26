import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrimitiveControlMesh} from '../src/components/meshTopology';
import {triangulateFaces} from '../src/components/traceGeometry';
import {growRegion,regionVertices,partitionRegionTriangles,regionFolds} from '../src/components/regionInspection';
import type {ControlMesh} from '../src/types';
test('isolation preserves source indices, winding, and complete original triangles',()=>{
 const mesh=createPrimitiveControlMesh('box'),snapshot=JSON.stringify(mesh),tri=triangulateFaces(mesh.vertices,mesh.faces);
 const {target,context}=partitionRegionTriangles(mesh,tri,[0]);
 assert.deepEqual(target,tri.slice(0,6));assert.deepEqual(context,tri.slice(6));assert.equal(regionVertices(mesh,[0]).length,4);
 assert.equal(growRegion(mesh,[0]).length,5);assert.equal(JSON.stringify(mesh),snapshot);
});
test('signed folds distinguish convex and concave with consistent outward winding',()=>{
 const mesh:ControlMesh={vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,-1]],faces:[[0,1,2],[1,0,3]]};
 const positive=regionFolds(mesh,[0]);assert.equal(positive.length,1);assert.ok(positive[0].degrees>89);assert.equal(positive[0].boundary,true);
 mesh.vertices[3]=[0,0,1];const negative=regionFolds(mesh,[0,1]);assert.ok(negative[0].degrees< -89);assert.equal(negative[0].boundary,false);
});
