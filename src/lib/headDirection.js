/** Pure coarse head-direction estimate, not eye gaze, exact pose or geographic face.
 * No DOM/audio/network side effects. Only front-camera head-relative orientation.
 * MediaPipe pose matrix gives model's requested face transform, not absolute head
 * orientation. No iris data, landmarks-to-pitch or geographic calculations.
 */
export const DIRECTIONS=Object.freeze(['forward','up','left','right','down','uncertain']);
export const NEUTRAL_FORWARD=Object.freeze({x:0,y:1,z:0});
export const NEUTRAL_UP=Object.freeze({x:0,y:0,z:1});
export const HEAD_DIRECTION_DEFAULTS=Object.freeze({forwardDegrees:10,directionDegrees:15,exitDegrees:5,maximumDegrees:75,dwellMs:360,lostGraceMs:800,sampleIntervalMs:180,minimumPublishMs:400,audioChangeDegrees: 2});
const DEG=180/Math.PI,finite=n=>typeof n==='number'&&Number.isFinite(n);
export function poseFromMatrix(matrix,{inputMirrored=false}={}){
 if(!matrix||matrix.rows!==4||matrix.columns!==4||!matrix.data||matrix.data.length!==16)return null;
 const d=Array.from(matrix.data);if(!d.every(finite))return null;
 const columns=[0,1,2].map(k=>Math.hypot(d[k*4],d[k*4+1],d[k*4+2]));
 if(columns.some(n=>!finite(n)||n<=1e-8)||Math.max(...columns)/Math.min(...columns)>1.5)return null;
 const f=[d[8]/columns[2],d[9]/columns[2],d[10]/columns[2]];
 const depth=f[2]; if(!(depth>.18))return null;
 // Canonical face-forward column. Camera x points viewer-right; a person
 // looking left moves nose viewer-right. Camera y points down; head-up rotates
 // face forward toward negative camera-depth/up relative to the user's head plane.
 // These explicit subject-relative signs are not CSS preview mirroring.
 const yaw=-Math.atan2(f[0],f[2])*DEG;
 const pitch=Math.atan2(f[1],Math.hypot(f[0],f[2]))*DEG;
 const result={yaw:inputMirrored?-yaw:yaw,pitch};
 return validPose(result);
}
export function calibrationFromMatrix(matrix,options={}){
 const pose=poseFromMatrix(matrix,options);if(!pose)return null;
 return {yaw:pose.yaw,pitch:pose.pitch,inputMirrored:Boolean(options.inputMirrored)};
}
export function relativePoseFromMatrix(matrix,calibration){
 if(!calibration||!validPose(calibration)||typeof calibration.inputMirrored!=='boolean')return null;
 const current=poseFromMatrix(matrix,{inputMirrored:calibration.inputMirrored});
 return current?validPose({yaw:current.yaw-calibration.yaw,pitch:current.pitch-calibration.pitch}):null;
}
export function relativeCalibrationSession(options={}){
 const state=createHeadDirectionState(options);
 let calibration=null,last=state.stop();
 function frame(result,now){
  const matrix=result?.facialTransformationMatrixes?.[0];
  if(!calibration){
   const center=calibrationFromMatrix(matrix);
   if(center){calibration=center;last={...state.poseAt({yaw:0,pitch:0},now),direction:'forward',calibrated:true};}
   else last={...state.poseAt(null,now),calibrated:false};
  }else last={...state.poseAt(relativePoseFromMatrix(matrix,calibration),now),calibrated:true};
  last.calibrated=Boolean(calibration);return last;
 }
 function calibrate(result){
  const center=calibrationFromMatrix(result?.facialTransformationMatrixes?.[0]);
  if(!center)return false;
  calibration=center;last=state.stop();last={...last,direction:'forward',calibrated:true};
  return true;
 }
 function reset(){calibration=null;last=state.stop();return last;}
 function manual(direction) {
  const result = state.manual(direction);
  if (result) last = { ...result, calibrated: Boolean(calibration) };
  return result;
 }
 return {frame,calibrate,stop:reset,recenter:reset,manual,poseAt:state.poseAt,orientation:()=>last.orientation,get direction(){return last.direction;},get calibrated(){return calibration!==null;}};
}
export function createHeadDirectionState(options={}){
 const config={...HEAD_DIRECTION_DEFAULTS,...options};
 let direction='uncertain',candidate=null,candidateSince=null,missingSince=null,lastOrientation=null,lastPublish=-Infinity;
 const neutral=()=>({forward:{...NEUTRAL_FORWARD},up:{...NEUTRAL_UP}});
 function poseAt(value,now){
  if(!finite(now))return {direction:'uncertain',orientation:neutral()};
  const p=validPose(value);
  if(!p){
   if(missingSince===null)missingSince=now;candidate=null;
   if(now-missingSince<config.lostGraceMs)return {direction,orientation:lastOrientation||neutral(),holding:true};
   direction='uncertain';lastOrientation=neutral();return {direction,orientation:lastOrientation};
  }
  missingSince=null;
  const next=classifyCalibrated(p,direction,config);
  if(next!==candidate){candidate=next;candidateSince=now;}
  if(direction!==next&&now-candidateSince>=config.dwellMs)direction=next;
  if(direction==='uncertain')return {direction,orientation:neutral()};
  const target=direction==='forward'?neutral():orientationFromPose(p);
  if(!lastOrientation||(now-lastPublish>=config.minimumPublishMs&&angleBetween(lastOrientation.forward,target.forward)>=config.audioChangeDegrees)){
   lastOrientation=target;lastPublish=now;
  }
  return {direction,orientation:lastOrientation,pose:p};
 }
 function manual(label){const o=manualOrientation(label);if(!o)return false;
  lastOrientation=o;return {direction:label,orientation:lastOrientation};}
 function stop(){direction='uncertain';candidate=null;candidateSince=null;missingSince=null;lastOrientation=neutral();lastPublish=-Infinity;return {direction,orientation:lastOrientation};}
 return {poseAt,manual,stop,orientation:()=>lastOrientation||neutral(),direction:()=>direction};
}
function validPose(v){return v&&finite(v.yaw)&&finite(v.pitch)&&Math.abs(v.yaw)<=85&&Math.abs(v.pitch)<=85?{yaw:v.yaw,pitch:v.pitch}:null;}
function angleBetween(a,b){return Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y+a.z*b.z)))*DEG;}
export function classifyCalibrated(value,previous='uncertain',options={}){
 const p=validPose(value);if(!p)return 'uncertain';
 const {forwardDegrees:forwardEnter,directionDegrees:entry,exitDegrees:exit,maximumDegrees:maximum}={...HEAD_DIRECTION_DEFAULTS,...options};
 if(Math.abs(p.yaw)>maximum||Math.abs(p.pitch)>maximum)return 'uncertain';
 // Retain active axis until sign switches or neutral is firmly regained.
 if(['left','right'].includes(previous)&&((previous==='right'&&p.yaw>=exit)||(previous==='left'&&p.yaw<=-exit)))return previous;
 if(['up','down'].includes(previous)&&((previous==='up'&&p.pitch>=exit)||(previous==='down'&&p.pitch<=-exit)))return previous;
 if(Math.abs(p.yaw)<=forwardEnter&&Math.abs(p.pitch)<=forwardEnter)return 'forward';
 if(Math.abs(p.yaw)>=entry&&Math.abs(p.yaw)>Math.abs(p.pitch))return p.yaw>0?'right':'left';
 if(Math.abs(p.pitch)>=entry&&Math.abs(p.pitch)>Math.abs(p.yaw))return p.pitch>0?'up':'down';
 return previous==='uncertain'?'uncertain':'uncertain';
}
export function orientationFromPose(value){
 if(!validPose(value))return null;
 const yaw=value.yaw/DEG,pitch=value.pitch/DEG;
 return {forward:{x:Math.sin(yaw)*Math.cos(pitch),y:Math.cos(yaw)*Math.cos(pitch),z:Math.sin(pitch)},up:{x:-Math.sin(yaw)*Math.sin(pitch),y:-Math.cos(yaw)*Math.sin(pitch),z:Math.cos(pitch)}};
}
export function manualOrientation(direction,angle=HEAD_DIRECTION_DEFAULTS.directionDegrees){
 if(!['forward','up','left','right','down'].includes(direction)||!finite(angle))return null;
 return orientationFromPose({yaw:direction==='right'?angle:direction==='left'?-angle:0,pitch:direction==='up'?angle:direction==='down'?-angle:0});
}
export function sanitizeOrientation(forward=NEUTRAL_FORWARD,up=NEUTRAL_UP){
 const f=[forward?.x,forward?.y,forward?.z],u=[up?.x,up?.y,up?.z];
 if(!f.every(finite)||!u.every(finite)||Math.hypot(...f)<1e-8||Math.hypot(...u)<1e-8)return null;
 const nf=Math.hypot(...f),nu=Math.hypot(...u),front=f.map(v=>v/nf),upNormalize=u.map(v=>v/nu);
 const along=front.reduce((sum,v,i)=>sum+v*upNormalize[i],0);
 if(Math.abs(along)>=1-1e-9)return null;
 const upOrthogonal=upNormalize.map((v,i)=>v-along*front[i]),length=Math.hypot(...upOrthogonal);
 return {forward:{x:front[0]||0,y:front[1]||0,z:front[2]||0},up:{x:upOrthogonal[0]/length||0,y:upOrthogonal[1]/length||0,z:upOrthogonal[2]/length||0}};
}
