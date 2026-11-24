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
