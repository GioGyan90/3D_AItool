import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrimitiveControlMesh} from '../src/components/meshTopology';
import {triangulateFaces} from '../src/components/traceGeometry';
import {growRegion,regionVertices,partitionRegionTriangles,regionFolds,sectionPlane,sectionSegments,sectionProfile,defaultSection,readInspectionRegions,regionDimensions,landmarkMeasurement,alignedSectionProfiles} from '../src/components/regionInspection';
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

test('central section of a closed box gives exact four-sided contour and no mutation',()=>{
 const mesh=createPrimitiveControlMesh('box'),before=JSON.stringify(mesh),tri=triangulateFaces(mesh.vertices,mesh.faces);
 const p=sectionPlane(mesh,[0,1,2,3,4,5],defaultSection)!;
 const lines=sectionSegments(mesh.vertices,tri,p.normal,p.offset);
 assert.ok(lines.length>=4);assert.ok(lines.every(pair=>pair.every(v=>Math.abs(v[1]-p.offset)<1e-7)));
 const length=lines.reduce((n,[a,b])=>n+Math.hypot(...a.map((v,i)=>v-b[i])),0);
 const range=Math.max(...mesh.vertices.map(v=>v[0]))-Math.min(...mesh.vertices.map(v=>v[0]));
 assert.ok(Math.abs(length-4*range)<1e-7);assert.equal(sectionProfile(lines,p.normal).length,lines.length);
 assert.equal(JSON.stringify(mesh),before);
 const oblique=sectionPlane(mesh,[0,1,2,3,4,5],{...defaultSection,azimuth:35,elevation:30})!;
 assert.ok(sectionSegments(mesh.vertices,tri,oblique.normal,oblique.offset).length>0);
 assert.equal(sectionSegments(mesh.vertices,tri,oblique.normal,oblique.max+10).length,0);
});
test('named regions only restore on identical indexed topology',()=>{
 const mesh=createPrimitiveControlMesh('box'),payload={topology:JSON.stringify(mesh.faces),regions:[{name:'front',faces:[1,1,0]}]};
 assert.deepEqual(readInspectionRegions(mesh,payload),[{name:'front',faces:[0,1]}]);
 assert.throws(()=>readInspectionRegions({...mesh,faces:mesh.faces.slice(1)},payload));
 assert.throws(()=>readInspectionRegions(mesh,{...payload,regions:[{name:'bad',faces:[99]}]}));
});

test('dimensions and paired section projections retain a single coordinate scale',()=>{
 const mesh=createPrimitiveControlMesh('box'),ids=[0,1,2,3,4,5],dims=regionDimensions(mesh,ids)!;
 assert.deepEqual(dims.ratios,[1,1,1]);assert.equal(landmarkMeasurement(mesh,0,0)?.distance,0);assert.equal(landmarkMeasurement(mesh,0,999),null);
 const before:[number[],number[]][]=[[[0,0,0],[1,0,0]]],after:[number[],number[]][]=[[[0,0,0],[2,0,0]]];
 const p=alignedSectionProfiles(after as [[number,number,number],[number,number,number]][],before as [[number,number,number],[number,number,number]][],[0,1,0]);
 const distance=(line:number[][])=>Math.hypot(line[1][0]-line[0][0],line[1][1]-line[0][1]);
 assert.ok(Math.abs(distance(p.now[0])-2*distance(p.before[0]))<1e-8);
 assert.deepEqual(p.now[0][0],p.before[0][0]);
});
