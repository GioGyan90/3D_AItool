export type Vec3=[number,number,number];
export type CalibrationView='front'|'side';
export type ImageCalibration={cx:number;cy:number;scale:number;flip:boolean;rotation:number};
export type Landmark={vertex:number;front?:[number,number];side?:[number,number]};
export function projectLandmark(v:Vec3,view:CalibrationView,c:ImageCalibration):[number,number]{
 const x=(view==='front'?v[0]:v[2])*(c.flip?-1:1)*c.scale,y=-v[1]*c.scale,a=c.rotation*Math.PI/180;
 return [c.cx+x*Math.cos(a)-y*Math.sin(a),c.cy+x*Math.sin(a)+y*Math.cos(a)];
}
export function unprojectLandmark(p:[number,number],c:ImageCalibration):[number,number]{
 if(!(c.scale>0))throw Error('比例必须大于零');
 const a=c.rotation*Math.PI/180,x=p[0]-c.cx,y=p[1]-c.cy;
 return [(x*Math.cos(a)+y*Math.sin(a))/c.scale*(c.flip?-1:1),(x*Math.sin(a)-y*Math.cos(a))/c.scale];
}
export function fitLandmark(v:Vec3,l:Landmark,front:ImageCalibration,side:ImageCalibration,tolerance=.02):Vec3{
 const f=l.front?unprojectLandmark(l.front,front):null,s=l.side?unprojectLandmark(l.side,side):null;
 if(f&&s&&Math.abs(f[1]-s[1])>tolerance)throw Error('正侧目标高度不一致，请先校准参考图');
 return [f?.[0]??v[0],f&&s?(f[1]+s[1])/2:f?.[1]??s?.[1]??v[1],s?.[0]??v[2]];
}
export function landmarkError(v:Vec3,p:[number,number],view:CalibrationView,c:ImageCalibration){
 const q=projectLandmark(v,view,c);return {dx:q[0]-p[0],dy:q[1]-p[1],pixels:Math.hypot(q[0]-p[0],q[1]-p[1])};
}

export type Anchor={vertex:number;pixel:[number,number]};
// Least-squares similarity fit: translation, uniform scale and image-plane rotation.
export function calibrateAnchors(vertices:Vec3[],view:CalibrationView,anchors:Anchor[],flip=false):ImageCalibration{
 if(anchors.length<2)throw Error('至少需要两个已知对应点');
 const pairs=anchors.map(a=>{const v=vertices[a.vertex];if(!v||!a.pixel.every(Number.isFinite))throw Error('无效标定点');return {x:(view==='front'?v[0]:v[2])*(flip?-1:1),y:-v[1],u:a.pixel[0],v:a.pixel[1]}});
 const n=pairs.length,mean=(key:'x'|'y'|'u'|'v')=>pairs.reduce((s,p)=>s+p[key],0)/n;
 const x=mean('x'),y=mean('y'),u=mean('u'),v=mean('v');
 let den=0,dot=0,cross=0;
 for(const p of pairs){const a=p.x-x,b=p.y-y,c=p.u-u,d=p.v-v;den+=a*a+b*b;dot+=a*c+b*d;cross+=a*d-b*c;}
 if(den<1e-10)throw Error('标定点过于接近');
 const A=dot/den,B=cross/den,scale=Math.hypot(A,B);
 if(!Number.isFinite(scale)||scale<1e-6)throw Error('标定点无有效比例');
 return {cx:u-A*x+B*y,cy:v-B*x-A*y,scale,rotation:Math.atan2(B,A)*180/Math.PI,flip};
}
export function edgeResidual(a:Vec3,b:Vec3,pa:[number,number],pb:[number,number],view:CalibrationView,c:ImageCalibration){
 const u=projectLandmark(a,view,c),v=projectLandmark(b,view,c),dx=v[0]-u[0],dy=v[1]-u[1],tx=pb[0]-pa[0],ty=pb[1]-pa[1];
 const length=Math.hypot(dx,dy),targetLength=Math.hypot(tx,ty);
 return {length,targetLength,lengthError:length-targetLength,angleError:length>1e-8&&targetLength>1e-8?Math.atan2(Math.abs(dx*ty-dy*tx),dx*tx+dy*ty)*180/Math.PI:null};
}
// View direction is +Z for front and -X for side (nose points right).
// Back-facing polygons are excluded by their Newell normal, independent of triangulation.
export function facingEdges(vertices:Vec3[],faces:number[][],view:CalibrationView){
 const edges=new Set<string>(),points=new Set<number>();
 for(const face of faces){let normal=0;for(let i=0;i<face.length;i++){const a=vertices[face[i]],b=vertices[face[(i+1)%face.length]];normal+=view==='front'?(a[0]-b[0])*(a[1]+b[1]):-(a[1]-b[1])*(a[2]+b[2]);}
 if(normal<=1e-9)continue;
 face.forEach((a,i)=>{const b=face[(i+1)%face.length];edges.add(a<b?a+':'+b:b+':'+a);points.add(a);});}
 return {edges,points};
}


export function projectionResiduals(vertices:Vec3[],targets:Landmark[],view:CalibrationView,c:ImageCalibration){
 const rows=targets.flatMap(t=>{const p=t[view],v=vertices[t.vertex];return p&&v?[{id:t.vertex,target:p,projected:projectLandmark(v,view,c),...landmarkError(v,p,view,c)}]:[]}).sort((a,b)=>b.pixels-a.pixels);
 return {rows,count:rows.length,max:Math.max(0,...rows.map(r=>r.pixels)),rms:Math.sqrt(rows.reduce((s,r)=>s+r.pixels*r.pixels,0)/Math.max(1,rows.length))};
}
export function residualColor(pixels:number,threshold:number){
 return pixels<=threshold?'#65d995':pixels<=threshold*2?'#ffcc66':'#ff6666';
}
