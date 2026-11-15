/** Geographic origin of the future listening-centric sonification space.
 * Present raster music uses nearest palette->values, NOT position->pitch or pan.
 * A cartesian future origin inside the head is coded as 0,0,0 at reception point.
 */
export const VANCOUVER = Object.freeze({
  id: 'vancouver_bc_canada',
  label:'Vancouver, BC, Canada',
  latitude:49.2827,
  longitude:-123.1207,
  datum:'WGS84 / EPSG:4326',
});
export function flatEquirectangularPosition({latitude, longitude}){
 if(!Number.isFinite(latitude)||latitude < -90||latitude>90)throw new RangeError('Latitude must be between -90 and +90');
 if(!Number.isFinite(longitude)||longitude<-180||longitude>180)throw new RangeError('Longitude must be between -180 and +180');
 return Object.freeze({xProportion:(longitude+180)/360,yProportion:(90-latitude)/180});
}
export const VANCOUVER_DISPLAY=Object.freeze({
 ...flatEquirectangularPosition(VANCOUVER),
 get leftPercent(){return this.xProportion*100},
 get topPercent(){return this.yProportion*100},
 mapping:'longitude -180 -> 0; map west -> east, latitude +90 -> 0; north -> south'});
export function headspaceListeningFrame(){
 return Object.freeze({
   schemaVersion: 1,
   type: 'source_origin',
   humanReference: VANCOUVER.label,
   heading: 'Reserved spatial-audio model around Vancouver',
   origin: Object.freeze({x:0, y:0, z:0, context:'inside the listener’s head, at source landmark'}),
   coordinateSpecification: 'When accurate source location and HRTF are available, transform them to a listener-relative local frame anchored at Vancouver',
   projector: 'Only ℝ³ relative to receiver; not verified from colored raster screenshot',
   modelMode: 'future',
 });
}
