import * as T from 'three';

// Authored motion-plan data, not motion capture or a paid API response. Five
// 0.8s gait cycles fit the existing 1–20s / 64-key protocol unchanged.
const gait=[[-30,18,12],[-18,30,-10],[0,26,-23],[18,16,0],[28,42,-20],[15,82,-40],[-6,100,-45],[-25,95,-42],[-40,78,-30],[-43,50,-20],[-40,28,8],[-35,16,18]];
// Canonical foot-clearance calibration: contact/load/support at ground level,
// then 25 / 45 / 20mm of flight; repeats for the opposite leg.
const hipHeight=[-.0447566,-.01785554,-.03786895,-.00608841,-.04347864,-.05485952];
export const RUNNING_PHASES=['contact','load','support','toe-off','flight','recovery','opposite-contact','opposite-load','opposite-support','opposite-toe-off','flight','reach'];
export const RUNNING_PLAN={version:1,name:'自然慢跑 · 原地循环',duration:4,loop:true,hands:{left:'looseFist',right:'looseFist'},frames:Array.from({length:61},(_,i)=>{
  const p=i%12,a=p*Math.PI/6,left=gait[p],right=gait[(p+6)%12],swing=19*Math.cos(a),rotations=[];
  const r=(joint,degrees)=>rotations.push({joint,degrees});
  r('Hips',[3,3.5*Math.sin(a),1.2*Math.cos(a)]);r('Spine',[3,-2*Math.sin(a),-.7*Math.cos(a)]);r('Spine1',[2,-2*Math.sin(a),0]);r('Spine2',[0,-3*Math.sin(a),0]);r('Neck',[-5,0,0]);r('Head',[-2,0,0]);
  for(const [side,leg,arm,sign]of [['Left',left,swing,1],['Right',right,-swing,-1]]){
    r(side+'UpLeg',[leg[0],0,-sign*1.2]);r(side+'Leg',[leg[1],0,0]);r(side+'Foot',[leg[2],0,0]);
    r(side+'Arm',[arm,0,-sign*82]);
    // Bend, then roll about the rest forearm axis. This preserves the elbow
    // trajectory while turning palms inward instead of serving-tray palms up.
    const q=new T.Quaternion().setFromEuler(new T.Euler(0,-sign*(88+6*Math.sin(a)*sign)*Math.PI/180,0)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),82*Math.PI/180)),e=new T.Euler().setFromQuaternion(q);
    r(side+'ForeArm',[e.x,e.y,e.z].map(v=>v*180/Math.PI));r(side+'Hand',[0,0,0]);
  }
  return {t:i/15,root:[.008*Math.sin(a),hipHeight[p%6],0],rotations};
})};
export function makeRunningTake(driver,planToTake){return {...planToTake(driver,RUNNING_PLAN),id:'run',description:'左右交替支撑、蹬离、腾空和屈膝回收；对侧摆臂 · 150 步/分钟',prompt:'adult woman jogs naturally in place, athletic tank top and yoga leggings'};}
