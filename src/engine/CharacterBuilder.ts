import * as THREE from 'three';
import type { SpeedstarDef, TurboVisualStyle } from '../shared/gameData';
import { createFabricNormalMap } from './ProceduralTextures';

export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'turbo'
  | 'jump'
  | 'fall'
  | 'doubleJump'
  | 'slide'
  | 'wallRun'
  | 'railGrind'
  | 'fly'
  | 'victory'
  | 'emote'
  | 'zeroPointActivate';

export interface SpeedstarRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  contactShadow: THREE.Mesh | null;
  turboAura: THREE.Group;
  shieldMesh: THREE.Mesh;
  trailMesh: THREE.Mesh;
  turboStyle: TurboVisualStyle;
  accentColor: THREE.Color;
}

const SKIN_TONES = [
  '#F1C2A0',
  '#E0AC89',
  '#C68B64',
  '#9F6844',
  '#6E4229',
  '#ECC4AB',
  '#D29972',
];

const HAIR_TONES = ['#141418', '#2C1E16', '#4A3123', '#8C5E3C', '#D4A55F', '#1E293B', '#7C2D12'];

let cachedFabricNormal: THREE.DataTexture | null = null;
function getFabricNormal(): THREE.DataTexture {
  if (!cachedFabricNormal) {
    cachedFabricNormal = createFabricNormalMap(4);
  }
  return cachedFabricNormal;
}

function hashId(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createLatheProfile(points: [number, number][], segs = 18): THREE.LatheGeometry {
  const vecs = points.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(vecs, segs);
  geo.computeVertexNormals();
  return geo;
}

// Sculpted athletic sneaker geometry (bottom sits at y = 0)
function buildSneaker(primaryMat: THREE.Material, soleMat: THREE.Material, accentMat: THREE.Material): THREE.Group {
  const shoe = new THREE.Group();

  const soleShape = new THREE.Shape();
  soleShape.moveTo(-0.058, -0.09);
  soleShape.quadraticCurveTo(-0.068, 0.02, -0.055, 0.14);
  soleShape.quadraticCurveTo(0, 0.19, 0.055, 0.14);
  soleShape.quadraticCurveTo(0.068, 0.02, 0.058, -0.09);
  soleShape.quadraticCurveTo(0, -0.11, -0.058, -0.09);

  const soleGeo = new THREE.ExtrudeGeometry(soleShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 10,
  });
  soleGeo.rotateX(-Math.PI / 2);
  const sole = new THREE.Mesh(soleGeo, soleMat);
  sole.position.set(0, 0.008, 0.02);
  sole.castShadow = true;

  const upperGeo = new THREE.ExtrudeGeometry(soleShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.004,
    bevelSegments: 3,
    curveSegments: 10,
  });
  upperGeo.rotateX(-Math.PI / 2);
  const upper = new THREE.Mesh(upperGeo, primaryMat);
  upper.position.set(0, 0.042, 0.018);
  upper.scale.set(0.92, 1, 0.94);
  upper.castShadow = true;

  // Heel collar / tongue
  const ankleCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.075, 14), accentMat);
  ankleCollar.position.set(0, 0.105, -0.032);
  ankleCollar.castShadow = true;

  shoe.add(sole, upper, ankleCollar);
  return shoe;
}

function buildSculptedHand(skinMat: THREE.Material, gloveMat: THREE.Material, useGlove: boolean): THREE.Group {
  const hand = new THREE.Group();
  const mat = useGlove ? gloveMat : skinMat;
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), mat);
  palm.scale.set(0.75, 1.15, 0.98);
  palm.position.set(0, -0.042, 0.006);
  palm.castShadow = true;

  const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.045, 4, 8), mat);
  fingers.scale.set(0.82, 1, 1.15);
  fingers.position.set(0, -0.095, 0.014);
  fingers.rotation.x = 0.22;

  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.028, 3, 6), mat);
  thumb.position.set(0, -0.045, 0.045);
  thumb.rotation.x = 0.55;

  hand.add(palm, fingers, thumb);
  return hand;
}

export function buildSpeedstarRig(
  speedstar: SpeedstarDef,
  skinColorOverride?: string | null,
  trailColorOverride?: string | null,
  contactShadowTex?: THREE.Texture
): SpeedstarRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const h = hashId(speedstar.id);
  const fabricNormal = getFabricNormal();

  // Desaturate overly neon character hues slightly into realistic pro motorsport / athletic materials
  const primaryCol = new THREE.Color(skinColorOverride || speedstar.primaryColor);
  const secondaryCol = new THREE.Color(speedstar.secondaryColor);
  const accentCol = new THREE.Color(speedstar.accentColor);
  const trailHex = trailColorOverride || speedstar.trailColor;

  const skinTone = SKIN_TONES[h % SKIN_TONES.length];
  const hairTone = HAIR_TONES[(h >> 3) % HAIR_TONES.length];

  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: primaryCol,
    roughness: 0.48,
    metalness: 0.14,
    sheen: 0.55,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color('#ffffff').lerp(primaryCol, 0.5),
    normalMap: fabricNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });

  const secondaryMat = new THREE.MeshPhysicalMaterial({
    color: secondaryCol,
    roughness: 0.66,
    metalness: 0.08,
    sheen: 0.4,
    sheenRoughness: 0.78,
    normalMap: fabricNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: '#1A1F28',
    roughness: 0.28,
    metalness: 0.72,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: accentCol,
    emissive: accentCol,
    emissiveIntensity: 0.28,
    roughness: 0.26,
    metalness: 0.78,
  });

  const skinMat = new THREE.MeshPhysicalMaterial({
    color: skinTone,
    roughness: 0.54,
    metalness: 0.0,
    sheen: 0.28,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color('#FDE2D2'),
    clearcoat: 0.06,
    clearcoatRoughness: 0.55,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: hairTone,
    roughness: 0.68,
    metalness: 0.08,
  });

  const soleMat = new THREE.MeshStandardMaterial({
    color: '#E2E8F0',
    roughness: 0.75,
    metalness: 0.05,
  });

  const visorMat = new THREE.MeshPhysicalMaterial({
    color: '#090E17',
    roughness: 0.06,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.54,
    iridescence: 0.45,
    iridescenceIOR: 1.35,
  });

  // Soft contact shadow decal grounded at y = 0.02
  let contactShadow: THREE.Mesh | null = null;
  if (contactShadowTex) {
    contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.35),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    root.add(contactShadow);
  }

  // Torso group (hip center y = 0.98m; realistic 1.82m humanoid stature)
  const torso = new THREE.Group();
  torso.position.y = 0.98;
  bodyPivot.add(torso);

  // Sculpted athletic pelvis & waist -> chest -> shoulders via LatheGeometry
  const torsoGeo = createLatheProfile(
    [
      [0.01, -0.08],
      [0.145, -0.04], // pelvis
      [0.155, 0.04],  // hip crest
      [0.132, 0.16],  // tapered waist
      [0.158, 0.30],  // ribcage
      [0.192, 0.44],  // broad chest / lats
      [0.185, 0.52],  // upper shoulder yoke
      [0.08, 0.57],   // collar
      [0.01, 0.58],
    ],
    20
  );
  const torsoMesh = new THREE.Mesh(torsoGeo, primaryMat);
  torsoMesh.scale.set(1.06, 1.0, 0.68);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torso.add(torsoMesh);

  // Tailored athletic trousers pelvis wrap
  const pelvisGeo = createLatheProfile(
    [
      [0.01, -0.10],
      [0.148, -0.05],
      [0.16, 0.05],
      [0.138, 0.11],
      [0.01, 0.115],
    ],
    18
  );
  const pelvisMesh = new THREE.Mesh(pelvisGeo, secondaryMat);
  pelvisMesh.scale.set(1.07, 1.0, 0.7);
  pelvisMesh.castShadow = true;
  torso.add(pelvisMesh);

  // Tactical jacket zipper seam & collar
  const zipper = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.44, 8), accentMat);
  zipper.position.set(0, 0.33, 0.125);
  torso.add(zipper);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.024, 10, 20), carbonMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.555, 0.01);
  torso.add(collar);

  // Sleek carbon-fiber shoulder trim pads (anatomically contoured, not boxes)
  const shoulderCapGeo = new THREE.SphereGeometry(0.082, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const lCap = new THREE.Mesh(shoulderCapGeo, carbonMat);
  lCap.position.set(-0.205, 0.48, 0);
  lCap.rotation.z = 0.55;
  lCap.scale.set(1, 0.75, 1.15);
  const rCap = new THREE.Mesh(shoulderCapGeo, carbonMat);
  rCap.position.set(0.205, 0.48, 0);
  rCap.rotation.z = -0.55;
  rCap.scale.set(1, 0.75, 1.15);
  torso.add(lCap, rCap);

  // Anatomical neck & sculpted Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.11, 14), skinMat);
  neck.position.set(0, 0.61, 0.01);
  neck.castShadow = true;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.015);
  torso.add(head);

  const isMasked =
    speedstar.headgear === 'visor' ||
    speedstar.headgear === 'crown' ||
    speedstar.headgear === 'crest' ||
    speedstar.headgear === 'halo';

  // Cranium + contoured jaw/chin
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 18), skinMat);
  cranium.scale.set(0.88, 1.06, 0.98);
  cranium.position.y = 0.02;
  cranium.castShadow = true;
  head.add(cranium);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 12), skinMat);
  jaw.scale.set(0.82, 0.95, 0.9);
  jaw.position.set(0, -0.048, 0.022);
  jaw.castShadow = true;
  head.add(jaw);

  // Subtle nose bridge & ears
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.042, 8), skinMat);
  nose.rotation.x = Math.PI * 0.42;
  nose.position.set(0, -0.01, 0.108);
  head.add(nose);

  const earGeo = new THREE.SphereGeometry(0.022, 8, 8);
  const lEar = new THREE.Mesh(earGeo, skinMat);
  lEar.scale.set(0.45, 1.1, 0.7);
  lEar.position.set(-0.098, 0.005, -0.005);
  const rEar = lEar.clone();
  rEar.position.x = 0.098;
  head.add(lEar, rEar);

  // Realistic eyes (sclera + iris)
  const scleraMat = new THREE.MeshStandardMaterial({ color: '#F8FAFC', roughness: 0.2 });
  const irisMat = new THREE.MeshStandardMaterial({
    color: h % 3 === 0 ? '#1E3A8A' : h % 3 === 1 ? '#3F2E21' : '#065F46',
    roughness: 0.15,
  });
  [-0.036, 0.036].forEach((ex) => {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), scleraMat);
    sclera.scale.set(1.1, 0.78, 0.65);
    sclera.position.set(ex, 0.018, 0.094);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), irisMat);
    iris.position.set(ex, 0.018, 0.102);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.024, 3, 6), hairMat);
    brow.rotation.z = Math.PI / 2 + (ex < 0 ? 0.08 : -0.08);
    brow.position.set(ex, 0.038, 0.098);
    head.add(sclera, iris, brow);
  });

  // Realistic Hair & Headgear silhouettes (non-blocky!)
  addRealisticHeadgear(head, speedstar.headgear, isMasked, primaryMat, accentMat, carbonMat, visorMat, hairMat);

  // Articulated Left & Right Arms (Shoulder -> Upper Arm -> Elbow -> Forearm -> Hand)
  const upperArmGeo = createLatheProfile(
    [
      [0.01, 0.02],
      [0.056, -0.02],
      [0.052, -0.14],
      [0.044, -0.26],
      [0.01, -0.28],
    ],
    14
  );
  const forearmGeo = createLatheProfile(
    [
      [0.01, 0.02],
      [0.045, -0.02],
      [0.04, -0.13],
      [0.031, -0.24],
      [0.01, -0.26],
    ],
    14
  );
  const useGloves = h % 2 === 0;

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.225, 0.49, 0);
  const lUpperMesh = new THREE.Mesh(upperArmGeo, primaryMat);
  lUpperMesh.castShadow = true;
  const leftElbow = new THREE.Group();
  leftElbow.position.set(0, -0.26, 0);
  const lForeMesh = new THREE.Mesh(forearmGeo, useGloves ? primaryMat : skinMat);
  lForeMesh.castShadow = true;
  const lWristGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.034, 0.06, 12), accentMat);
  lWristGuard.position.y = -0.20;
  const lHand = buildSculptedHand(skinMat, carbonMat, useGloves);
  lHand.position.y = -0.24;
  leftElbow.add(lForeMesh, lWristGuard, lHand);
  leftArm.add(lUpperMesh, leftElbow);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.225, 0.49, 0);
  const rUpperMesh = new THREE.Mesh(upperArmGeo, primaryMat);
  rUpperMesh.castShadow = true;
  const rightElbow = new THREE.Group();
  rightElbow.position.set(0, -0.26, 0);
  const rForeMesh = new THREE.Mesh(forearmGeo, useGloves ? primaryMat : skinMat);
  rForeMesh.castShadow = true;
  const rWristGuard = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.034, 0.06, 12), accentMat);
  rWristGuard.position.y = -0.20;
  const rHand = buildSculptedHand(skinMat, carbonMat, useGloves);
  rHand.position.y = -0.24;
  rightElbow.add(rForeMesh, rWristGuard, rHand);
  rightArm.add(rUpperMesh, rightElbow);
  torso.add(rightArm);

  // Articulated Left & Right Legs (Hip at y=0.92 -> Thigh -> Knee at -0.42 -> Calf -> Sneaker sole at y=0)
  const thighGeo = createLatheProfile(
    [
      [0.01, 0.02],
      [0.086, -0.03],
      [0.082, -0.18],
      [0.064, -0.36],
      [0.056, -0.43],
      [0.01, -0.44],
    ],
    16
  );
  const calfGeo = createLatheProfile(
    [
      [0.01, 0.02],
      [0.058, -0.02],
      [0.064, -0.13],
      [0.044, -0.32],
      [0.038, -0.40],
      [0.01, -0.41],
    ],
    16
  );

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.105, 0.92, 0);
  const lThigh = new THREE.Mesh(thighGeo, secondaryMat);
  lThigh.castShadow = true;
  const leftKnee = new THREE.Group();
  leftKnee.position.set(0, -0.42, 0);
  const lCalf = new THREE.Mesh(calfGeo, secondaryMat);
  lCalf.castShadow = true;
  const lShoe = buildSneaker(primaryMat, soleMat, accentMat);
  lShoe.position.set(0, -0.50, 0);
  leftKnee.add(lCalf, lShoe);
  leftLeg.add(lThigh, leftKnee);
  bodyPivot.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.105, 0.92, 0);
  const rThigh = new THREE.Mesh(thighGeo, secondaryMat);
  rThigh.castShadow = true;
  const rightKnee = new THREE.Group();
  rightKnee.position.set(0, -0.42, 0);
  const rCalf = new THREE.Mesh(calfGeo, secondaryMat);
  rCalf.castShadow = true;
  const rShoe = buildSneaker(primaryMat, soleMat, accentMat);
  rShoe.position.set(0, -0.50, 0);
  rightKnee.add(rCalf, rShoe);
  rightLeg.add(rThigh, rightKnee);
  bodyPivot.add(rightLeg);

  // Subtle realistic energy rim aura for Turbo (refined, non-cartoonish)
  const turboAura = new THREE.Group();
  turboAura.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({
    color: trailHex,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46 + i * 0.11, 0.014, 8, 32), ringMat);
    ring.position.y = 0.45 + i * 0.42;
    ring.rotation.x = Math.PI / 2;
    turboAura.add(ring);
  }
  bodyPivot.add(turboAura);

  // Speed Shield Sphere (glass-like kinetic barrier)
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 24, 18),
    new THREE.MeshPhysicalMaterial({
      color: '#38BDF8',
      emissive: '#0284C7',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0.1,
      depthWrite: false,
    })
  );
  shieldMesh.position.y = 1.02;
  shieldMesh.visible = false;
  bodyPivot.add(shieldMesh);

  // Sleek aerodynamic slipstream trail ribbon
  const trailGeo = new THREE.ConeGeometry(0.18, 2.6, 12, 1, true);
  trailGeo.rotateX(Math.PI / 2);
  trailGeo.translate(0, 0, -1.35);
  const trailMesh = new THREE.Mesh(
    trailGeo,
    new THREE.MeshBasicMaterial({
      color: trailHex,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  trailMesh.position.set(0, 1.06, -0.18);
  trailMesh.visible = false;
  bodyPivot.add(trailMesh);

  return {
    root,
    bodyPivot,
    torso,
    head,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    contactShadow,
    turboAura,
    shieldMesh,
    trailMesh,
    turboStyle: speedstar.turboVisual,
    accentColor: new THREE.Color(trailHex),
  };
}

export function buildPhantomEcho(speedstar: SpeedstarDef): THREE.Group {
  const echo = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: speedstar.accentColor || '#38BDF8',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.38, 6, 12), mat);
  torso.position.y = 1.25;
  torso.rotation.x = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat);
  head.position.set(0, 1.66, 0.08);
  const lLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.62, 4, 8), mat);
  lLeg.position.set(-0.1, 0.52, 0.14);
  lLeg.rotation.x = 0.45;
  const rLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.62, 4, 8), mat);
  rLeg.position.set(0.1, 0.52, -0.14);
  rLeg.rotation.x = -0.45;
  echo.add(torso, head, lLeg, rLeg);
  return echo;
}

function addRealisticHeadgear(
  head: THREE.Group,
  style: SpeedstarDef['headgear'],
  isMasked: boolean,
  primaryMat: THREE.Material,
  accentMat: THREE.Material,
  carbonMat: THREE.Material,
  visorMat: THREE.Material,
  hairMat: THREE.Material
): void {
  if (isMasked) {
    // Sleek full-face aerodynamic motorsport/sprint helmet
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.126, 20, 18), primaryMat);
    shell.scale.set(0.92, 1.06, 1.06);
    shell.position.set(0, 0.015, -0.005);
    shell.castShadow = true;
    head.add(shell);

    // Wraparound curved tinted visor
    const visorGeo = new THREE.CylinderGeometry(0.124, 0.122, 0.068, 20, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.016, 0.006);
    head.add(visor);

    if (style === 'crest') {
      const fin = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.18, 4, 8), accentMat);
      fin.rotation.x = Math.PI * 0.42;
      fin.position.set(0, 0.125, -0.03);
      head.add(fin);
    } else if (style === 'crown') {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.012, 8, 24), accentMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 0.125, 0);
      head.add(rim);
    } else if (style === 'halo') {
      const comms = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.009, 8, 24), accentMat);
      comms.rotation.x = Math.PI / 2 - 0.18;
      comms.position.set(0, 0.11, -0.01);
      head.add(comms);
    }
    return;
  }

  // Natural sculpted hair cap + side-swept hair volume
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.117, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMat
  );
  hairCap.scale.set(0.9, 1.04, 1.02);
  hairCap.position.set(0, 0.025, -0.012);
  hairCap.rotation.x = -0.22;
  hairCap.castShadow = true;
  head.add(hairCap);

  // Wraparound polarized sport shades for street/pro speedsters
  const shades = new THREE.Mesh(
    new THREE.CylinderGeometry(0.106, 0.106, 0.036, 18, 1, true, -Math.PI * 0.32, Math.PI * 0.64),
    visorMat
  );
  shades.position.set(0, 0.02, 0.004);
  head.add(shades);

  if (style === 'spikes') {
    // Swept athletic hair locks
    for (let i = 0; i < 4; i++) {
      const lock = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.14, 10), hairMat);
      lock.position.set((i % 2 === 0 ? -1 : 1) * 0.025, 0.07 - i * 0.03, -0.105 - i * 0.012);
      lock.rotation.x = -Math.PI * (0.45 + i * 0.06);
      head.add(lock);
    }
  } else if (style === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.026, 10, 22), accentMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, -0.11, 0);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.22, 4, 8), accentMat);
    tail.position.set(0.04, -0.15, -0.13);
    tail.rotation.x = 1.15;
    head.add(scarf, tail);
  } else if (style === 'fins' || style === 'wings' || style === 'ears' || style === 'horns') {
    // Sleek titanium aerodynamic headset / comms wings on temples
    [-1, 1].forEach((side) => {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.055, 4, 8), carbonMat);
      pod.position.set(side * 0.108, 0.02, -0.01);
      pod.rotation.x = 0.6;
      const blade = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.085, 4, 8), accentMat);
      blade.position.set(side * 0.118, 0.055, -0.045);
      blade.rotation.x = -0.85;
      blade.rotation.z = side * -0.25;
      head.add(pod, blade);
    });
  }
}

export class CharacterAnimator {
  private cycleTime = 0;
  private stepAccumulator = 0;
  private landSquash = 0;
  private wasGrounded = true;

  public triggerLanding(intensity = 1): void {
    this.landSquash = Math.max(this.landSquash, Math.min(1.5, intensity));
  }

  public update(
    rig: SpeedstarRig,
    dt: number,
    state: AnimState,
    speed: number,
    steerInput: number,
    turboActive: boolean,
    shieldActive: boolean,
    mountedVehicle: boolean,
    onFootstep?: () => void
  ): void {
    const dampRate = 13;
    const speedFactor = Math.min(2.0, Math.abs(speed) / 20);

    // Landing shock absorption trigger
    const isAir = state === 'jump' || state === 'fall' || state === 'doubleJump';
    if (this.wasGrounded && isAir) {
      this.wasGrounded = false;
    } else if (!this.wasGrounded && !isAir) {
      this.wasGrounded = true;
      this.landSquash = 1.0;
    }
    this.landSquash = THREE.MathUtils.damp(this.landSquash, 0, 10, dt);

    // Contact shadow fades smoothly with jump/air height
    if (rig.contactShadow) {
      const mat = rig.contactShadow.material as THREE.MeshBasicMaterial;
      mat.opacity = mountedVehicle ? 0 : isAir ? 0.22 : 0.55;
    }

    rig.shieldMesh.visible = shieldActive;
    if (shieldActive) {
      rig.shieldMesh.rotation.y += dt * 1.4;
    }

    rig.turboAura.visible = turboActive;
    if (turboActive) {
      rig.turboAura.children.forEach((child, idx) => {
        child.rotation.z += dt * (4.5 + idx * 1.6);
        const s = 1 + Math.sin(this.cycleTime * 7 + idx) * 0.06;
        child.scale.set(s, s, 1);
      });
    }

    if (speed > 15 || turboActive) {
      rig.trailMesh.visible = true;
      const lenScale = turboActive ? 1.75 : THREE.MathUtils.clamp((speed - 14) / 22, 0.3, 1.25);
      rig.trailMesh.scale.set(turboActive ? 1.2 : 0.8, turboActive ? 1.2 : 0.8, lenScale);
    } else {
      rig.trailMesh.visible = false;
    }

    // Target biomechanical joint angles
    let targetBodyY = 0;
    let targetBodyPitch = 0;
    let targetBodyRoll = 0;
    let targetTorsoY = 0.98;
    let targetTorsoPitch = 0;
    let targetTorsoYaw = 0;
    let targetHeadPitch = 0;
    let targetHeadYaw = -steerInput * 0.22;

    let targetLShoulder = 0;
    let targetRShoulder = 0;
    let targetLElbow = -0.25;
    let targetRElbow = -0.25;

    let targetLHip = 0;
    let targetRHip = 0;
    let targetLKnee = 0.06;
    let targetRKnee = 0.06;

    if (mountedVehicle) {
      this.cycleTime += dt * 3;
      targetBodyY = -0.08;
      targetTorsoY = 0.84;
      targetTorsoPitch = 0.22;
      targetLShoulder = -0.78;
      targetRShoulder = -0.78;
      targetLElbow = -0.68;
      targetRElbow = -0.68;
      targetLHip = -1.25;
      targetRHip = -1.25;
      targetLKnee = 1.25;
      targetRKnee = 1.25;
      targetBodyRoll = -steerInput * 0.14;
    } else if (state === 'idle') {
      this.cycleTime += dt * 2.2;
      const breath = Math.sin(this.cycleTime);
      targetBodyY = breath * 0.012 - this.landSquash * 0.12;
      targetLShoulder = breath * 0.04;
      targetRShoulder = -breath * 0.04;
      targetLElbow = -0.28;
      targetRElbow = -0.28;
      targetLKnee = 0.08 + this.landSquash * 0.45;
      targetRKnee = 0.08 + this.landSquash * 0.45;
    } else if (state === 'walk' || state === 'run' || state === 'sprint' || state === 'turbo') {
      const freq = state === 'turbo' ? 16.5 : state === 'sprint' ? 13.5 : state === 'run' ? 10 : 6.8;
      const prevSin = Math.sin(this.cycleTime);
      this.cycleTime += dt * freq * Math.max(0.68, speedFactor * 0.88);
      const currSin = Math.sin(this.cycleTime);
      const currCos = Math.cos(this.cycleTime);

      if (onFootstep && ((prevSin < 0 && currSin >= 0) || (prevSin > 0 && currSin <= 0))) {
        if (this.stepAccumulator > 0.11) {
          onFootstep();
          this.stepAccumulator = 0;
        }
      }
      this.stepAccumulator += dt;

      const amp = state === 'turbo' ? 1.08 : state === 'sprint' ? 0.92 : state === 'run' ? 0.68 : 0.38;
      targetLHip = currSin * amp;
      targetRHip = -currSin * amp;

      // Realistic knee flexion on recovery swing & soft stance absorption
      targetLKnee = Math.max(0.08, -currCos * (amp * 1.15) + (currSin > 0 ? 0.15 : 0.65 * amp));
      targetRKnee = Math.max(0.08, currCos * (amp * 1.15) + (-currSin > 0 ? 0.15 : 0.65 * amp));

      // Natural bent-arm runner pump with counter-twist
      targetLShoulder = -currSin * amp * 0.88;
      targetRShoulder = currSin * amp * 0.88;
      targetLElbow = -1.25 - Math.max(0, -currSin) * 0.35;
      targetRElbow = -1.25 - Math.max(0, currSin) * 0.35;

      const strideDrop = Math.abs(currCos) * (state === 'turbo' ? 0.09 : 0.065);
      targetBodyY = strideDrop - 0.04 - this.landSquash * 0.14;
      targetTorsoPitch = state === 'turbo' ? 0.38 : state === 'sprint' ? 0.24 : 0.11;
      targetTorsoYaw = -currSin * 0.12 * Math.min(1, amp);
      targetHeadPitch = -targetTorsoPitch * 0.72;
      targetBodyRoll = -steerInput * (0.24 * Math.min(1, speed / 24));
    } else if (state === 'slide') {
      this.cycleTime += dt * 6;
      targetBodyY = -0.44;
      targetTorsoPitch = -0.68;
      targetHeadPitch = 0.55;
      targetLHip = -1.15;
      targetLKnee = 0.22;
      targetRHip = -0.45;
      targetRKnee = 1.45;
      targetLShoulder = 0.45;
      targetRShoulder = -0.65;
      targetLElbow = -0.7;
      targetRElbow = -0.8;
    } else if (state === 'jump' || state === 'doubleJump') {
      this.cycleTime += dt * 10;
      targetLHip = -0.78;
      targetLKnee = 1.05;
      targetRHip = 0.28;
      targetRKnee = 0.45;
      targetLShoulder = -1.1;
      targetRShoulder = -0.65;
      targetLElbow = -0.9;
      targetRElbow = -0.8;
      targetTorsoPitch = 0.16;
      if (state === 'doubleJump') {
        targetBodyPitch = this.cycleTime * 2.5;
      }
    } else if (state === 'fall') {
      this.cycleTime += dt * 6;
      targetLHip = -0.25;
      targetLKnee = 0.55;
      targetRHip = 0.18;
      targetRKnee = 0.35;
      targetLShoulder = -1.85;
      targetRShoulder = -1.85;
      targetLElbow = -0.45;
      targetRElbow = -0.45;
    } else if (state === 'wallRun') {
      this.cycleTime += dt * 14;
      const s = Math.sin(this.cycleTime);
      targetLHip = s * 0.8;
      targetRHip = -s * 0.8;
      targetLKnee = Math.max(0.15, -s * 0.9 + 0.4);
      targetRKnee = Math.max(0.15, s * 0.9 + 0.4);
      targetLShoulder = -s * 0.75;
      targetRShoulder = s * 0.75;
      targetLElbow = -1.2;
      targetRElbow = -1.2;
      targetBodyRoll = steerInput >= 0 ? 0.48 : -0.48;
      targetTorsoPitch = 0.22;
    } else if (state === 'railGrind') {
      this.cycleTime += dt * 5;
      targetBodyY = -0.1;
      targetTorsoPitch = 0.16;
      targetBodyRoll = Math.sin(this.cycleTime) * 0.1;
      targetLShoulder = -0.95;
      targetRShoulder = 0.85;
      targetLElbow = -0.4;
      targetRElbow = -0.4;
      targetLHip = -0.45;
      targetLKnee = 0.72;
      targetRHip = 0.35;
      targetRKnee = 0.52;
    } else if (state === 'fly') {
      this.cycleTime += dt * 6;
      targetTorsoPitch = 0.88;
      targetHeadPitch = -0.68;
      targetLShoulder = -2.25;
      targetRShoulder = -2.25;
      targetLElbow = -0.2;
      targetRElbow = -0.2;
      targetLHip = 0.18;
      targetRHip = 0.18;
      targetBodyRoll = -steerInput * 0.4;
    } else if (state === 'victory' || state === 'emote') {
      this.cycleTime += dt * 4.5;
      targetBodyY = Math.abs(Math.sin(this.cycleTime)) * 0.22;
      targetLShoulder = -2.3 + Math.sin(this.cycleTime * 2) * 0.2;
      targetRShoulder = -2.3 - Math.sin(this.cycleTime * 2) * 0.2;
      targetLElbow = -0.35;
      targetRElbow = -0.35;
    } else if (state === 'zeroPointActivate') {
      this.cycleTime += dt * 5;
      targetBodyY = 0.36 + Math.sin(this.cycleTime) * 0.05;
      targetTorsoPitch = -0.08;
      targetHeadPitch = -0.22;
      targetHeadYaw = 0;
      targetRShoulder = -2.75;
      targetRElbow = -0.12;
      targetLShoulder = -0.32;
      targetLElbow = -0.45;
      targetLHip = 0.12;
      targetRHip = -0.15;
      targetLKnee = 0.18;
      targetRKnee = 0.26;
    }

    rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, targetBodyY, dampRate, dt);
    rig.bodyPivot.rotation.z = THREE.MathUtils.damp(rig.bodyPivot.rotation.z, targetBodyRoll, dampRate, dt);
    rig.bodyPivot.rotation.x = state === 'doubleJump'
      ? targetBodyPitch
      : THREE.MathUtils.damp(rig.bodyPivot.rotation.x, targetBodyPitch, dampRate, dt);

    rig.torso.position.y = THREE.MathUtils.damp(rig.torso.position.y, targetTorsoY, dampRate, dt);
    rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, targetTorsoPitch, dampRate, dt);
    rig.torso.rotation.y = THREE.MathUtils.damp(rig.torso.rotation.y, targetTorsoYaw, dampRate, dt);
    rig.head.rotation.x = THREE.MathUtils.damp(rig.head.rotation.x, targetHeadPitch, dampRate, dt);
    rig.head.rotation.y = THREE.MathUtils.damp(rig.head.rotation.y, targetHeadYaw, dampRate, dt);

    rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, targetLShoulder, dampRate, dt);
    rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, targetRShoulder, dampRate, dt);
    rig.leftElbow.rotation.x = THREE.MathUtils.damp(rig.leftElbow.rotation.x, targetLElbow, dampRate, dt);
    rig.rightElbow.rotation.x = THREE.MathUtils.damp(rig.rightElbow.rotation.x, targetRElbow, dampRate, dt);

    rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, targetLHip, dampRate, dt);
    rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, targetRHip, dampRate, dt);
    rig.leftKnee.rotation.x = THREE.MathUtils.damp(rig.leftKnee.rotation.x, targetLKnee, dampRate, dt);
    rig.rightKnee.rotation.x = THREE.MathUtils.damp(rig.rightKnee.rotation.x, targetRKnee, dampRate, dt);
  }
}
