import * as THREE from 'three';
import type { VehicleDef } from '../shared/gameData';
import { createCarbonFiberPBR } from './ProceduralTextures';

export interface VehicleRig {
  root: THREE.Group;
  chassis: THREE.Group;
  wheels: THREE.Mesh[];
  frontWheelPivots: THREE.Group[];
  thrusters: THREE.Mesh[];
  brakeLights: THREE.MeshStandardMaterial[];
  rotorGlowMats: THREE.MeshStandardMaterial[];
  exhaustFlames: THREE.Mesh[];
  headlightBeams: THREE.Mesh[];
  headlightSpot: THREE.SpotLight | null;
  hoverHeight: number;
  wheelRadius: number;
}

let cachedCarbon: ReturnType<typeof createCarbonFiberPBR> | null = null;
function getCarbonPBR() {
  if (!cachedCarbon) {
    cachedCarbon = createCarbonFiberPBR(4);
  }
  return cachedCarbon;
}

function buildAutomotiveWheel(
  radius: number,
  width: number,
  rimMat: THREE.Material,
  tireMat: THREE.Material,
  caliperMat: THREE.Material,
  rotorMat: THREE.Material
): { wheelGroup: THREE.Group; spinMesh: THREE.Mesh } {
  const wheelGroup = new THREE.Group();

  // Tire tread & sidewall
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const spinMesh = new THREE.Mesh(tireGeo, tireMat);
  spinMesh.castShadow = true;

  // Machined alloy rim barrel
  const rimGeo = new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width * 1.03, 24);
  rimGeo.rotateZ(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  spinMesh.add(rim);

  // 5-Spoke alloy star pattern on both faces
  const spokeGeo = new THREE.BoxGeometry(width * 1.05, radius * 1.18, radius * 0.11);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.x = (i / 5) * Math.PI;
    spinMesh.add(spoke);
  }

  // Center lug cap
  const hubGeo = new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, width * 1.08, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, caliperMat);
  spinMesh.add(hub);

  // Static vented brake rotor & performance caliper inside wheel arch
  const rotorGeo = new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width * 0.25, 20);
  rotorGeo.rotateZ(Math.PI / 2);
  const rotor = new THREE.Mesh(rotorGeo, rotorMat);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(width * 0.4, radius * 0.34, radius * 0.22), caliperMat);
  caliper.position.set(0, radius * 0.28, -radius * 0.28);

  wheelGroup.add(spinMesh, rotor, caliper);
  return { wheelGroup, spinMesh };
}

function buildCockpitInterior(trimMat: THREE.Material, dashMat: THREE.Material, isSingleSeat: boolean): THREE.Group {
  const interior = new THREE.Group();
  const seatOffsets = isSingleSeat ? [0] : [-0.28, 0.28];
  seatOffsets.forEach((sx) => {
    const base = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.2, 4, 8), trimMat);
    base.rotation.x = Math.PI / 2;
    base.position.set(sx, 0.44, -0.05);
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 4, 8), trimMat);
    back.rotation.x = -0.22;
    back.position.set(sx, 0.66, -0.24);
    interior.add(base, back);
  });

  // Steering wheel & digital gauge binnacle
  const dash = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, isSingleSeat ? 0.32 : 0.92, 12), trimMat);
  dash.rotation.z = Math.PI / 2;
  dash.position.set(0, 0.62, 0.45);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), dashMat);
  screen.position.set(isSingleSeat ? 0 : -0.28, 0.67, 0.35);
  screen.rotation.x = -0.2;

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 18), trimMat);
  wheel.position.set(isSingleSeat ? 0 : -0.28, 0.62, 0.28);
  wheel.rotation.x = -0.35;

  interior.add(dash, screen, wheel);
  return interior;
}

export function buildVehicleRig(vehicle: VehicleDef, enableHeadlightSpot = false): VehicleRig {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);

  const carbon = getCarbonPBR();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: vehicle.primaryColor,
    roughness: 0.13,
    metalness: 0.86,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    iridescence: 0.22,
    iridescenceIOR: 1.42,
    reflectivity: 1.0,
    envMapIntensity: 1.65,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    map: carbon.map,
    normalMap: carbon.normalMap,
    roughnessMap: carbon.roughnessMap,
    roughness: 0.38,
    metalness: 0.48,
    envMapIntensity: 1.25,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: '#14171D',
    roughness: 0.62,
    metalness: 0.22,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: '#181A1F',
    roughness: 0.85,
    metalness: 0.05,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    roughness: 0.16,
    metalness: 0.95,
    envMapIntensity: 1.45,
  });

  const rotorMat = new THREE.MeshStandardMaterial({
    color: '#94A3B8',
    emissive: '#F97316',
    emissiveIntensity: 0.0,
    roughness: 0.32,
    metalness: 0.88,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0B1320',
    roughness: 0.03,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    ior: 1.52,
    envMapIntensity: 1.75,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: '#F8FAFC',
    emissive: '#E0F2FE',
    emissiveIntensity: 2.5,
    roughness: 0.08,
  });

  const brakeMat = new THREE.MeshStandardMaterial({
    color: '#991B1B',
    emissive: '#EF4444',
    emissiveIntensity: 1.15,
    roughness: 0.15,
  });

  const accentGlowMat = new THREE.MeshStandardMaterial({
    color: vehicle.accentColor,
    emissive: vehicle.accentColor,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.7,
  });

  const flameMat = new THREE.MeshBasicMaterial({
    color: '#38BDF8',
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const beamConeMat = new THREE.MeshBasicMaterial({
    color: '#E0F2FE',
    transparent: true,
    opacity: 0.085,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const wheels: THREE.Mesh[] = [];
  const frontWheelPivots: THREE.Group[] = [];
  const thrusters: THREE.Mesh[] = [];
  const brakeLights: THREE.MeshStandardMaterial[] = [brakeMat];
  const rotorGlowMats: THREE.MeshStandardMaterial[] = [rotorMat];
  const exhaustFlames: THREE.Mesh[] = [];
  const headlightBeams: THREE.Mesh[] = [];
  let headlightSpot: THREE.SpotLight | null = null;
  let wheelRadius = 0.34;

  if (vehicle.category === 'Hoverboard') {
    // Sculpted carbon-composite racing hoverboard
    const deckShape = new THREE.Shape();
    deckShape.moveTo(0, -1.05);
    deckShape.quadraticCurveTo(0.38, -0.7, 0.34, 0.2);
    deckShape.quadraticCurveTo(0.28, 0.88, 0, 1.12);
    deckShape.quadraticCurveTo(-0.28, 0.88, -0.34, 0.2);
    deckShape.quadraticCurveTo(-0.38, -0.7, 0, -1.05);

    const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
      curveSegments: 16,
    });
    deckGeo.rotateX(-Math.PI / 2);
    const deck = new THREE.Mesh(deckGeo, bodyMat);
    deck.position.y = 0.22;
    deck.castShadow = true;

    const grip = new THREE.Mesh(deckGeo, carbonMat);
    grip.scale.set(0.84, 0.5, 0.82);
    grip.position.y = 0.27;

    const thrL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.06, 18), accentGlowMat);
    thrL.position.set(0, 0.18, 0.48);
    const thrR = thrL.clone();
    thrR.position.set(0, 0.18, -0.48);
    thrusters.push(thrL, thrR);
    chassis.add(deck, grip, thrL, thrR);
  } else if (vehicle.category === 'Bike' || vehicle.category === 'Speed Bike') {
    wheelRadius = 0.34;
    // Sculpted superbike profile extruded sideways
    const bikeProfile = new THREE.Shape();
    bikeProfile.moveTo(-0.85, 0.42);
    bikeProfile.lineTo(-0.55, 0.82); // tail cowl
    bikeProfile.quadraticCurveTo(-0.2, 0.72, 0.05, 0.74); // saddle dip
    bikeProfile.quadraticCurveTo(0.32, 0.98, 0.58, 0.92); // sculpted tank
    bikeProfile.quadraticCurveTo(0.88, 0.78, 0.96, 0.48); // aero nose fairing
    bikeProfile.lineTo(0.62, 0.34);
    bikeProfile.lineTo(-0.45, 0.34);
    bikeProfile.closePath();

    const fairingGeo = new THREE.ExtrudeGeometry(bikeProfile, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 4,
      curveSegments: 16,
    });
    fairingGeo.rotateY(Math.PI / 2);
    fairingGeo.translate(-0.17, 0, 0);
    const fairing = new THREE.Mesh(fairingGeo, bodyMat);
    fairing.castShadow = true;

    // Tinted windscreen
    const windscreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 12, 0, Math.PI, 0, Math.PI * 0.55),
      glassMat
    );
    windscreen.scale.set(0.85, 0.95, 1.45);
    windscreen.position.set(0, 0.9, 0.64);
    windscreen.rotation.x = -0.55;

    // Leather seat & clip-on handlebars
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.36, 4, 10), trimMat);
    seat.rotation.x = Math.PI / 2;
    seat.scale.set(1.25, 1, 0.55);
    seat.position.set(0, 0.78, -0.18);

    const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.64, 10), rimMat);
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(0, 0.88, 0.45);

    // Inverted front fork tubes
    [-0.12, 0.12].forEach((fx) => {
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.66, 10), rimMat);
      fork.position.set(fx, 0.62, 0.68);
      fork.rotation.x = -0.34;
      chassis.add(fork);
    });

    // Front & rear automotive-grade bike wheels
    const fWheelBuilt = buildAutomotiveWheel(wheelRadius, 0.16, rimMat, tireMat, accentGlowMat, rotorMat);
    const fPivot = new THREE.Group();
    fPivot.position.set(0, wheelRadius, 0.84);
    fPivot.add(fWheelBuilt.wheelGroup);
    frontWheelPivots.push(fPivot);

    const rWheelBuilt = buildAutomotiveWheel(wheelRadius, 0.21, rimMat, tireMat, accentGlowMat, rotorMat);
    rWheelBuilt.wheelGroup.position.set(0, wheelRadius, -0.78);
    wheels.push(fWheelBuilt.spinMesh, rWheelBuilt.spinMesh);

    // Twin titanium exhaust & LED lights + exhaust flames
    const flameGeo = new THREE.ConeGeometry(0.045, 0.32, 8);
    flameGeo.rotateX(-Math.PI / 2);
    [-0.14, 0.14].forEach((ex) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.42, 12), rimMat);
      pipe.rotation.x = Math.PI * 0.44;
      pipe.position.set(ex, 0.42, -0.82);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(ex, 0.38, -1.04);
      flame.scale.set(0.01, 0.01, 0.01);
      exhaustFlames.push(flame);
      chassis.add(pipe, flame);
    });
    const headLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14), headlightMat);
    headLamp.rotation.x = Math.PI / 2;
    headLamp.position.set(0, 0.68, 0.96);
    const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.05), brakeMat);
    tailLamp.position.set(0, 0.8, -0.86);

    if (enableHeadlightSpot) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7.5, 12, 1, true), beamConeMat);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(0, 0.56, 4.75);
      headlightBeams.push(beam);
      chassis.add(beam);
    }

    chassis.add(fairing, windscreen, seat, handleBar, fPivot, rWheelBuilt.wheelGroup, headLamp, tailLamp);
  } else if (vehicle.category === 'Sky Craft') {
    // Sleek aerospace delta-wing VTOL craft
    const fuseProfile = new THREE.Shape();
    fuseProfile.moveTo(-1.45, 0.42);
    fuseProfile.lineTo(-1.25, 0.72);
    fuseProfile.lineTo(0.45, 0.78);
    fuseProfile.quadraticCurveTo(1.15, 0.74, 1.55, 0.45);
    fuseProfile.lineTo(1.2, 0.32);
    fuseProfile.lineTo(-1.35, 0.34);
    fuseProfile.closePath();

    const fuseGeo = new THREE.ExtrudeGeometry(fuseProfile, {
      depth: 0.76,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.08,
      bevelSegments: 4,
      curveSegments: 16,
    });
    fuseGeo.rotateY(Math.PI / 2);
    fuseGeo.translate(-0.38, 0, 0);
    const fuselage = new THREE.Mesh(fuseGeo, bodyMat);
    fuselage.castShadow = true;

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.4, 0.25);
    wingShape.lineTo(1.85, -0.45);
    wingShape.lineTo(1.85, -0.78);
    wingShape.lineTo(0.35, -0.58);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    wingGeo.rotateX(Math.PI / 2);
    const rWing = new THREE.Mesh(wingGeo, carbonMat);
    rWing.position.set(0, 0.54, 0);
    rWing.castShadow = true;
    const lWing = rWing.clone();
    lWing.scale.x = -1;

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.44, 22, 16), glassMat);
    canopy.scale.set(0.95, 0.65, 2.2);
    canopy.position.set(0, 0.84, 0.25);

    const interior = buildCockpitInterior(trimMat, accentGlowMat, true);
    interior.position.y = 0.14;

    [-0.28, 0.28].forEach((jx) => {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.34, 16), carbonMat);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(jx, 0.52, -1.52);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), accentGlowMat);
      glow.rotation.x = Math.PI / 2;
      glow.position.set(jx, 0.52, -1.66);
      thrusters.push(glow);
      chassis.add(nozzle, glow);
    });
    chassis.add(fuselage, lWing, rWing, canopy, interior);
  } else {
    // Photorealistic GT Supercar / Hypercar (Extruded side silhouette + wheel wells + interior + glass + alloy wheels)
    wheelRadius = 0.34;
    const isHover = vehicle.hoverHeight > 0;

    // Side profile (x = Z forward, y = Y height)
    const carProfile = new THREE.Shape();
    carProfile.moveTo(-1.58, 0.24); // rear diffuser bottom
    carProfile.lineTo(-1.62, 0.72); // rear fascia
    carProfile.lineTo(-1.18, 0.84); // rear decklid
    carProfile.quadraticCurveTo(-0.78, 1.12, -0.35, 1.16); // fastback roofline
    carProfile.quadraticCurveTo(0.12, 1.17, 0.58, 0.84); // raked windshield
    carProfile.quadraticCurveTo(1.15, 0.76, 1.62, 0.44); // sculpted hood & nose
    carProfile.lineTo(1.66, 0.22); // front splitter
    carProfile.lineTo(1.22, 0.20);
    // Front wheel arch cutout
    carProfile.absarc(0.96, 0.26, 0.38, 0, Math.PI, false);
    carProfile.lineTo(-0.56, 0.20);
    // Rear wheel arch cutout
    carProfile.absarc(-0.96, 0.26, 0.39, 0, Math.PI, false);
    carProfile.lineTo(-1.58, 0.24);

    const bodyWidth = 1.48;
    const bodyGeo = new THREE.ExtrudeGeometry(carProfile, {
      depth: bodyWidth,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.05,
      bevelSegments: 4,
      curveSegments: 20,
    });
    bodyGeo.rotateY(Math.PI / 2);
    bodyGeo.translate(-bodyWidth * 0.5, 0, 0);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;

    // Carbon-fiber front splitter, intake grille, side skirts, and rear aero diffuser
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 0.34), carbonMat);
    splitter.position.set(0, 0.21, 1.56);
    const intakeGrille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.12), trimMat);
    intakeGrille.position.set(0, 0.33, 1.62);
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.14, 0.28), carbonMat);
    diffuser.position.set(0, 0.25, -1.56);
    const licensePlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.03), accentGlowMat);
    licensePlate.position.set(0, 0.48, -1.65);

    // Tinted curved glass greenhouse shell wrapping the upper cabin
    const glassGreenhouse = new THREE.Mesh(new THREE.SphereGeometry(0.68, 22, 16), glassMat);
    glassGreenhouse.scale.set(0.94, 0.52, 1.68);
    glassGreenhouse.position.set(0, 0.92, -0.16);

    // Visible cabin interior (bucket seats, steering wheel, glowing dash)
    const interior = buildCockpitInterior(trimMat, accentGlowMat, false);
    interior.position.y = 0.14;

    // Swan-neck GT carbon wing
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.045, 0.26), carbonMat);
    wingBlade.position.set(0, 1.16, -1.48);
    wingBlade.rotation.x = 0.09;
    wingBlade.castShadow = true;
    [-0.42, 0.42].forEach((sx) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.14), carbonMat);
      strut.position.set(sx, 0.99, -1.42);
      strut.rotation.x = -0.22;
      chassis.add(strut);
    });

    // Side mirrors
    [-0.84, 0.84].forEach((mx) => {
      const mirror = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.11, 4, 8), carbonMat);
      mirror.rotation.z = Math.PI / 2;
      mirror.position.set(mx, 0.84, 0.34);
      chassis.add(mirror);
    });

    // LED Matrix Headlights, volumetric beam cones & full-width LED Taillight bar
    const coneGeo = enableHeadlightSpot ? new THREE.ConeGeometry(1.15, 8.2, 12, 1, true) : null;
    [-0.54, 0.54].forEach((hx) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.055, 0.08), headlightMat);
      lamp.position.set(hx, 0.48, 1.62);
      lamp.rotation.y = hx < 0 ? 0.18 : -0.18;
      chassis.add(lamp);

      if (coneGeo) {
        const beam = new THREE.Mesh(coneGeo, beamConeMat);
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(hx, 0.44, 5.75);
        headlightBeams.push(beam);
        chassis.add(beam);
      }
    });

    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.055, 0.06), brakeMat);
    tailBar.position.set(0, 0.68, -1.64);

    // Dual quad exhaust tips + dynamic flame cones
    const carFlameGeo = new THREE.ConeGeometry(0.045, 0.38, 8);
    carFlameGeo.rotateX(-Math.PI / 2);
    [-0.45, -0.33, 0.33, 0.45].forEach((ex) => {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.12, 12), rimMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(ex, 0.26, -1.66);
      const flame = new THREE.Mesh(carFlameGeo, flameMat);
      flame.position.set(ex, 0.26, -1.86);
      flame.scale.set(0.01, 0.01, 0.01);
      exhaustFlames.push(flame);
      chassis.add(tip, flame);
    });

    if (enableHeadlightSpot) {
      headlightSpot = new THREE.SpotLight('#E0F2FE', 7.5, 52, Math.PI / 5, 0.55, 1.35);
      headlightSpot.position.set(0, 0.65, 1.65);
      headlightSpot.target.position.set(0, 0.1, 20);
      chassis.add(headlightSpot, headlightSpot.target);
    }

    chassis.add(bodyMesh, splitter, intakeGrille, diffuser, licensePlate, glassGreenhouse, interior, wingBlade, tailBar);

    if (isHover) {
      const padGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.09, 18);
      const offsets: [number, number][] = [[-0.68, 0.92], [0.68, 0.92], [-0.68, -0.92], [0.68, -0.92]];
      offsets.forEach(([ox, oz]) => {
        const pad = new THREE.Mesh(padGeo, accentGlowMat);
        pad.position.set(ox, 0.22, oz);
        chassis.add(pad);
        thrusters.push(pad);
      });
    } else {
      const offsets: [number, number, boolean][] = [
        [-0.78, 0.96, true],
        [0.78, 0.96, true],
        [-0.78, -0.96, false],
        [0.78, -0.96, false],
      ];
      offsets.forEach(([ox, oz, isFront]) => {
        const built = buildAutomotiveWheel(wheelRadius, 0.26, rimMat, tireMat, accentGlowMat, rotorMat);
        wheels.push(built.spinMesh);
        if (isFront) {
          const pivot = new THREE.Group();
          pivot.position.set(ox, wheelRadius, oz);
          pivot.add(built.wheelGroup);
          chassis.add(pivot);
          frontWheelPivots.push(pivot);
        } else {
          built.wheelGroup.position.set(ox, wheelRadius, oz);
          chassis.add(built.wheelGroup);
        }
      });
    }
  }

  return {
    root,
    chassis,
    wheels,
    frontWheelPivots,
    thrusters,
    brakeLights,
    rotorGlowMats,
    exhaustFlames,
    headlightBeams,
    headlightSpot,
    hoverHeight: vehicle.hoverHeight,
    wheelRadius,
  };
}

export function updateVehicleRig(
  rig: VehicleRig,
  dt: number,
  speed: number,
  steerInput: number,
  braking: boolean,
  accelerating: boolean,
  turboActive = false
): void {
  // Spin wheels proportionally to linear velocity (omega = v / r)
  const spinDelta = (speed / Math.max(0.15, rig.wheelRadius)) * dt;
  for (const w of rig.wheels) {
    w.rotation.x += spinDelta;
  }

  // Smooth front wheel steering turn angle
  const targetSteer = -steerInput * 0.42;
  for (const pivot of rig.frontWheelPivots) {
    pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, targetSteer, 14, dt);
  }

  // Realistic suspension squat under acceleration, nose-dive under braking, and body roll in corners
  const targetPitch = braking ? 0.045 : accelerating ? -0.032 : 0;
  const targetRoll = -steerInput * 0.055 * Math.min(1, Math.abs(speed) / 22);
  rig.chassis.rotation.x = THREE.MathUtils.damp(rig.chassis.rotation.x, targetPitch, 10, dt);
  rig.chassis.rotation.z = THREE.MathUtils.damp(rig.chassis.rotation.z, targetRoll, 10, dt);

  if (rig.hoverHeight > 0) {
    rig.chassis.position.y = Math.sin(performance.now() * 0.005) * 0.05 + rig.hoverHeight * 0.3;
  } else if (Math.abs(speed) > 12) {
    rig.chassis.position.y = Math.sin(performance.now() * 0.045) * 0.004;
  } else {
    rig.chassis.position.y = 0;
  }

  // Brake light intensity flare + glowing hot carbon-ceramic rotors under heavy braking
  const brakeGlow = braking ? 3.4 : 0.95;
  for (const bm of rig.brakeLights) {
    bm.emissiveIntensity = THREE.MathUtils.damp(bm.emissiveIntensity, brakeGlow, 15, dt);
  }
  const targetRotorHeat = braking && Math.abs(speed) > 6 ? 2.4 : 0.0;
  for (const rm of rig.rotorGlowMats) {
    rm.emissiveIntensity = THREE.MathUtils.damp(rm.emissiveIntensity, targetRotorHeat, braking ? 8 : 2.5, dt);
  }

  // Exhaust afterburner flames on acceleration & Turbo
  const flameTarget = turboActive ? 1.45 + Math.random() * 0.45 : accelerating && Math.abs(speed) > 8 ? 0.55 + Math.random() * 0.25 : 0.01;
  for (const fl of rig.exhaustFlames) {
    const s = THREE.MathUtils.damp(fl.scale.z, flameTarget, 18, dt);
    fl.scale.set(Math.min(1.2, s * 0.8), Math.min(1.2, s * 0.8), s);
    fl.visible = s > 0.06;
  }
}
