import * as THREE from 'three';
import type { MapDef, SurfaceType } from '../shared/gameData';
import {
  createBoostPadTexture,
  createBuildingFacadePBR,
  createCheckerTexture,
  createConcretePBR,
  createGlowPoolTexture,
  createPalmFrondTexture,
  createRoadPBR,
  createTerrainPBR,
  createWaterNormalMap,
} from './ProceduralTextures';
import type { WeatherSnapshot } from './WeatherSystem';

export interface BoostZone {
  center: THREE.Vector3;
  radius: number;
  tangent: THREE.Vector3;
}

export interface JumpRamp {
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  width: number;
  length: number;
  height: number;
}

export interface GrindRail {
  curve: THREE.CatmullRomCurve3;
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
}

export interface WallRunPanel {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  length: number;
  height: number;
}

export interface TrackObstacle {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  rightVec: THREE.Vector3;
  halfWidth: number;
  height: number;
  slideUnder: boolean;
  oscillateAmp: number;
  oscillateSpeed: number;
  phase: number;
}

export interface CollectibleItem {
  id: number;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  kind: 'star' | 'turbo';
  collected: boolean;
  respawnTimer: number;
}

export interface CheckpointGate {
  index: number;
  progress: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  mesh: THREE.Group;
}

export interface TrackSample {
  progress: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  lateralOffset: number;
  halfWidth: number;
  surface: SurfaceType;
  distSq: number;
}

export interface BuiltMap {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  samples: { pos: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; width: number; surface: SurfaceType }[];
  checkpoints: CheckpointGate[];
  boostZones: BoostZone[];
  jumpRamps: JumpRamp[];
  grindRails: GrindRail[];
  wallPanels: WallRunPanel[];
  obstacles: TrackObstacle[];
  collectibles: CollectibleItem[];
  weatherPoints: THREE.Points | null;
  animatedProps: THREE.Object3D[];
  totalLength: number;
  updateAtmosphere: (dt: number, focusPos: THREE.Vector3, weather?: WeatherSnapshot) => void;
  dispose: () => void;
}

function hashSeed(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function buildTrackMap(
  mapDef: MapDef,
  maxAnisotropy: number,
  modeId: string,
  quality: 'low' | 'medium' | 'high' | 'ultra'
): BuiltMap {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const points = mapDef.waypoints.map((w) => new THREE.Vector3(w.x, w.y, w.z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
  const totalLength = curve.getLength();
  const sampleCount = 260;

  const samples: BuiltMap['samples'] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const wpFloat = t * mapDef.waypoints.length;
    const wpIdx = Math.floor(wpFloat) % mapDef.waypoints.length;
    const wpNext = (wpIdx + 1) % mapDef.waypoints.length;
    const frac = wpFloat - Math.floor(wpFloat);
    const w0 = mapDef.waypoints[wpIdx].width ?? 16;
    const w1 = mapDef.waypoints[wpNext].width ?? 16;
    const width = THREE.MathUtils.lerp(w0, w1, frac);
    const surface = mapDef.waypoints[wpIdx].surface ?? 'normal';

    samples.push({ pos, tangent, right, width, surface });
  }

  // ==========================================================================
  // 1. PBR ROADWAY CARRIAGEWAY + RAISED SIDEWALKS & BRIDGE DECK INFRASTRUCTURE
  // ==========================================================================
  const roadPos: number[] = [];
  const roadNorm: number[] = [];
  const roadUv: number[] = [];
  const roadIdx: number[] = [];

  const sidePos: number[] = [];
  const sideNorm: number[] = [];
  const sideUv: number[] = [];
  const sideIdx: number[] = [];

  const deckPos: number[] = [];
  const deckNorm: number[] = [];
  const deckIdx: number[] = [];

  for (let i = 0; i <= sampleCount; i++) {
    const s = samples[i % sampleCount];
    const halfW = s.width * 0.5;
    const sidewalkW = 1.9;
    const curbH = 0.16;
    const vCoord = (i / sampleCount) * (totalLength / 13);

    const lRoad = s.pos.clone().addScaledVector(s.right, -halfW);
    const rRoad = s.pos.clone().addScaledVector(s.right, halfW);
    roadPos.push(lRoad.x, lRoad.y, lRoad.z, rRoad.x, rRoad.y, rRoad.z);
    roadNorm.push(0, 1, 0, 0, 1, 0);
    roadUv.push(0, vCoord, 1, vCoord);

    if (i < sampleCount) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      roadIdx.push(a, b, c, b, d, c);
    }

    // Left & Right Concrete Curbs + Sidewalks + Under-deck Bridge Skirt
    const lCurbTop = s.pos.clone().addScaledVector(s.right, -(halfW + 0.15)).add(new THREE.Vector3(0, curbH, 0));
    const lOuter = s.pos.clone().addScaledVector(s.right, -(halfW + sidewalkW)).add(new THREE.Vector3(0, curbH, 0));
    const rCurbTop = s.pos.clone().addScaledVector(s.right, halfW + 0.15).add(new THREE.Vector3(0, curbH, 0));
    const rOuter = s.pos.clone().addScaledVector(s.right, halfW + sidewalkW).add(new THREE.Vector3(0, curbH, 0));

    sidePos.push(
      lOuter.x, lOuter.y, lOuter.z,
      lCurbTop.x, lCurbTop.y, lCurbTop.z,
      lRoad.x, lRoad.y, lRoad.z,
      rRoad.x, rRoad.y, rRoad.z,
      rCurbTop.x, rCurbTop.y, rCurbTop.z,
      rOuter.x, rOuter.y, rOuter.z
    );
    for (let k = 0; k < 6; k++) sideNorm.push(0, 1, 0);
    sideUv.push(0, vCoord, 0.35, vCoord, 0.4, vCoord, 0.6, vCoord, 0.65, vCoord, 1, vCoord);

    if (i < sampleCount) {
      const base = i * 6;
      const next = (i + 1) * 6;
      // Left sidewalk & curb face
      sideIdx.push(base, base + 1, next, base + 1, next + 1, next);
      sideIdx.push(base + 1, base + 2, next + 1, base + 2, next + 2, next + 1);
      // Right curb face & sidewalk
      sideIdx.push(base + 3, base + 4, next + 3, base + 4, next + 4, next + 3);
      sideIdx.push(base + 4, base + 5, next + 4, base + 5, next + 5, next + 4);
    }

    // Solid Bridge Under-Deck Girder Spine
    const lBot = lOuter.clone().add(new THREE.Vector3(0.4 * s.right.x, -1.1, 0.4 * s.right.z));
    const rBot = rOuter.clone().add(new THREE.Vector3(-0.4 * s.right.x, -1.1, -0.4 * s.right.z));
    deckPos.push(lOuter.x, lOuter.y, lOuter.z, lBot.x, lBot.y, lBot.z, rBot.x, rBot.y, rBot.z, rOuter.x, rOuter.y, rOuter.z);
    deckNorm.push(-s.right.x, -0.3, -s.right.z, 0, -1, 0, 0, -1, 0, s.right.x, -0.3, s.right.z);

    if (i < sampleCount) {
      const b0 = i * 4;
      const b1 = (i + 1) * 4;
      deckIdx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
      deckIdx.push(b0 + 1, b1 + 1, b0 + 2, b0 + 2, b1 + 1, b1 + 2);
      deckIdx.push(b0 + 2, b1 + 2, b0 + 3, b0 + 3, b1 + 2, b1 + 3);
    }
  }

  const trackGeo = new THREE.BufferGeometry();
  trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  trackGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNorm, 3));
  trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUv, 2));
  trackGeo.setIndex(roadIdx);
  trackGeo.computeVertexNormals();
  disposables.push(trackGeo);

  const roadPBR = createRoadPBR(mapDef.trackColor, mapDef.curbColor, mapDef.accentColor, mapDef.ambience, maxAnisotropy);
  disposables.push(roadPBR);

  const roadWeatherUniforms = {
    uWetness: { value: mapDef.ambience === 'rain' ? 0.85 : mapDef.waterSections ? 0.25 : 0.0 },
    uIcing: { value: mapDef.ambience === 'snow' ? 0.85 : 0.0 },
    uRainIntensity: { value: mapDef.weather === 'rain' ? 1.0 : 0.0 },
    uWeatherTime: { value: 0.0 },
    uTrackRepeat: { value: totalLength / 13 },
  };

  const trackMat = new THREE.MeshStandardMaterial({
    map: roadPBR.map,
    normalMap: roadPBR.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: roadPBR.roughnessMap,
    roughness: 1.0,
    metalness: mapDef.ambience === 'rain' ? 0.25 : 0.08,
    envMapIntensity: mapDef.ambience === 'rain' ? 1.55 : 0.9,
  });
  trackMat.customProgramCacheKey = () => 'dynamic-weather-road-v1';
  trackMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = roadWeatherUniforms.uWetness;
    shader.uniforms.uIcing = roadWeatherUniforms.uIcing;
    shader.uniforms.uRainIntensity = roadWeatherUniforms.uRainIntensity;
    shader.uniforms.uWeatherTime = roadWeatherUniforms.uWeatherTime;
    shader.uniforms.uTrackRepeat = roadWeatherUniforms.uTrackRepeat;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vRoadWeatherUv;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vRoadWeatherUv = uv;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;
        uniform float uIcing;
        uniform float uRainIntensity;
        uniform float uWeatherTime;
        uniform float uTrackRepeat;
        varying vec2 vRoadWeatherUv;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float rwTrackProg = fract(vRoadWeatherUv.y / max(1.0, uTrackRepeat));
        float rwRut = exp(-pow((abs(vRoadWeatherUv.x - 0.5) - 0.18) * 6.5, 2.0));
        float rwPuddleWave = sin(rwTrackProg * 81.6814) * 0.5 + cos(rwTrackProg * 43.9823) * 0.5;
        float rwPuddleMask = smoothstep(0.95 - uWetness * 0.58, 1.16 - uWetness * 0.58, rwPuddleWave + rwRut * 0.16) * smoothstep(0.22, 0.42, uWetness);
        float rwRipple = sin(length(fract(vRoadWeatherUv * vec2(11.0, 26.0)) - 0.5) * 34.0 - uWeatherTime * 11.5) * 0.5 + 0.5;
        diffuseColor.rgb *= mix(1.0, 0.54, uWetness * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.68 + vec3(0.04, 0.07, 0.11) * rwRipple * max(0.25, uRainIntensity), rwPuddleMask * 0.78);
        float rwFrostWave = cos(rwTrackProg * 62.8318) * 0.6 + sin(rwTrackProg * 28.2743) * 0.4;
        float rwIceMask = smoothstep(0.88 - uIcing * 0.55, 1.12 - uIcing * 0.55, rwFrostWave + (1.0 - rwRut) * 0.15) * smoothstep(0.20, 0.40, uIcing);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.89, 0.99), rwIceMask * 0.58);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float rWetTrackProg = fract(vRoadWeatherUv.y / max(1.0, uTrackRepeat));
        float rWetRut = exp(-pow((abs(vRoadWeatherUv.x - 0.5) - 0.18) * 6.5, 2.0));
        float rWetWave = sin(rWetTrackProg * 81.6814) * 0.5 + cos(rWetTrackProg * 43.9823) * 0.5;
        float rPuddle = smoothstep(0.95 - uWetness * 0.58, 1.16 - uWetness * 0.58, rWetWave + rWetRut * 0.16) * smoothstep(0.22, 0.42, uWetness);
        float rRipple = sin(length(fract(vRoadWeatherUv * vec2(11.0, 26.0)) - 0.5) * 34.0 - uWeatherTime * 11.5) * 0.5 + 0.5;
        roughnessFactor = mix(roughnessFactor, 0.24, uWetness * 0.72);
        roughnessFactor = mix(roughnessFactor, 0.04 + rRipple * 0.025 * max(0.2, uRainIntensity), rPuddle);
        float rFrostWave = cos(rWetTrackProg * 62.8318) * 0.6 + sin(rWetTrackProg * 28.2743) * 0.4;
        float rIce = smoothstep(0.88 - uIcing * 0.55, 1.12 - uIcing * 0.55, rFrostWave + (1.0 - rWetRut) * 0.15) * smoothstep(0.20, 0.40, uIcing);
        roughnessFactor = mix(roughnessFactor, 0.09, rIce);`
      );
  };
  disposables.push(trackMat);

  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.receiveShadow = true;
  group.add(trackMesh);

  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  sideGeo.setAttribute('normal', new THREE.Float32BufferAttribute(sideNorm, 3));
  sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUv, 2));
  sideGeo.setIndex(sideIdx);
  sideGeo.computeVertexNormals();
  disposables.push(sideGeo);

  const concretePBR = createConcretePBR(maxAnisotropy, mapDef.ambience === 'desert' ? '#B89B74' : '#737B84');
  disposables.push(concretePBR);
  const concreteMat = new THREE.MeshStandardMaterial({
    map: concretePBR.map,
    normalMap: concretePBR.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: concretePBR.roughnessMap,
    roughness: 1.0,
    metalness: 0.06,
  });
  disposables.push(concreteMat);
  const sideMesh = new THREE.Mesh(sideGeo, concreteMat);
  sideMesh.receiveShadow = true;
  sideMesh.castShadow = true;
  group.add(sideMesh);

  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.setAttribute('normal', new THREE.Float32BufferAttribute(deckNorm, 3));
  deckGeo.setIndex(deckIdx);
  deckGeo.computeVertexNormals();
  const deckMat = new THREE.MeshStandardMaterial({ color: '#1F242D', roughness: 0.85, metalness: 0.2 });
  disposables.push(deckGeo, deckMat);
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.castShadow = true;
  group.add(deckMesh);

  // Bridge Support Columns underneath elevated track spans
  const pierGeo = new THREE.CylinderGeometry(1.05, 1.35, 1, 14);
  const pierPositions: { pos: THREE.Vector3; h: number }[] = [];
  for (let i = 0; i < sampleCount; i += 10) {
    const s = samples[i];
    if (s.pos.y > 0.6) {
      const h = s.pos.y + 10;
      pierPositions.push({ pos: new THREE.Vector3(s.pos.x, s.pos.y - 1.0 - h * 0.5, s.pos.z), h });
    }
  }
  if (pierPositions.length > 0) {
    disposables.push(pierGeo);
    const pierInst = new THREE.InstancedMesh(pierGeo, concreteMat, pierPositions.length);
    const dummy = new THREE.Object3D();
    pierPositions.forEach((p, idx) => {
      dummy.position.copy(p.pos);
      dummy.scale.set(1, p.h, 1);
      dummy.updateMatrix();
      pierInst.setMatrixAt(idx, dummy.matrix);
    });
    pierInst.instanceMatrix.needsUpdate = true;
    pierInst.computeBoundingSphere();
    pierInst.castShadow = true;
    pierInst.receiveShadow = true;
    group.add(pierInst);
  }

  // ==========================================================================
  // 2. REALISTIC SCULPTED TERRAIN & ANIMATED WATER / OCEAN HORIZON
  // ==========================================================================
  const terrainPBR = createTerrainPBR(mapDef.ambience, maxAnisotropy);
  disposables.push(terrainPBR);

  const terrainGeo = new THREE.PlaneGeometry(1800, 1800, 84, 84);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const wx = tPos.getX(i) + 75;
    const wz = tPos.getZ(i) - 65;
    tPos.setX(i, wx);
    tPos.setZ(i, wz);

    // Measure distance from track center so terrain forms hills/mountains/dunes outside track corridor
    let minD = 9999;
    for (let k = 0; k < samples.length; k += 8) {
      const dx = wx - samples[k].pos.x;
      const dz = wz - samples[k].pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD) minD = dSq;
    }
    const dist = Math.sqrt(minD);
    const corridorClear = THREE.MathUtils.smoothstep(dist, 26, 95);
    const ridgeNoise =
      Math.sin(wx * 0.015) * Math.cos(wz * 0.014) * 14 +
      Math.sin(wx * 0.038 + 1.2) * Math.sin(wz * 0.033) * 6;
    let baseH = -7.5;
    if (mapDef.ambience === 'snow' || mapDef.ambience === 'lava') {
      baseH = -8.5 + corridorClear * (Math.abs(ridgeNoise) * 2.1 + (dist > 140 ? 22 : 0));
    } else if (mapDef.ambience === 'desert' || mapDef.ambience === 'forest') {
      baseH = -7.2 + corridorClear * (Math.abs(ridgeNoise) * 1.15);
    } else if (mapDef.ambience === 'beach') {
      baseH = -9.5 + corridorClear * (ridgeNoise * 0.45 + 3.5);
    }
    tPos.setY(i, baseH);
  }
  terrainGeo.computeVertexNormals();
  disposables.push(terrainGeo);

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainPBR.map,
    normalMap: terrainPBR.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: terrainPBR.roughnessMap,
    roughness: 1.0,
    metalness: mapDef.ambience === 'rain' ? 0.2 : 0.04,
    emissive: mapDef.ambience === 'lava' ? '#9A3412' : '#000000',
    emissiveIntensity: mapDef.ambience === 'lava' ? 0.35 : 0,
  });
  disposables.push(terrainMat);
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // Shimmering Animated Water Ocean / Coastline (Gerstner Swells + Fresnel Sun Glint)
  const waterNormal = createWaterNormalMap(maxAnisotropy);
  disposables.push(waterNormal);
  let animatedWaterNormal: THREE.DataTexture | null = null;
  const oceanTimeUniform = { value: 0 };
  if (mapDef.ambience === 'beach' || mapDef.waterSections) {
    animatedWaterNormal = waterNormal;
    const oceanGeo = new THREE.PlaneGeometry(1800, 1800, 96, 96);
    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: mapDef.ambience === 'beach' ? '#046E94' : '#0B4660',
      roughness: 0.06,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      envMapIntensity: 1.85,
      transparent: true,
      opacity: 0.92,
    });
    oceanMat.customProgramCacheKey = () => 'vice-ocean-v1';
    oceanMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = oceanTimeUniform;
      shader.vertexShader =
        `uniform float uTime;\nvarying float vWaveHeight;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float w1 = sin(transformed.x * 0.045 + uTime * 1.45) * 0.34;
          float w2 = cos(transformed.y * 0.055 - uTime * 1.15) * 0.28;
          float w3 = sin((transformed.x + transformed.y) * 0.085 + uTime * 2.1) * 0.12;
          float waveZ = w1 + w2 + w3;
          transformed.z += waveZ;
          vWaveHeight = waveZ;`
        );
      shader.fragmentShader =
        `uniform float uTime;\nvarying float vWaveHeight;\n` +
        shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `float crest = smoothstep(0.18, 0.65, vWaveHeight);
          vec3 sssTint = vec3(0.04, 0.44, 0.56) * crest * 0.26;
          float viewGrazing = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.2);
          gl_FragColor.rgb += sssTint + vec3(0.95, 0.85, 0.72) * viewGrazing * 0.16;
          #include <dithering_fragment>`
        );
    };
    disposables.push(oceanGeo, oceanMat);
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(75, -6.2, -65);
    ocean.receiveShadow = true;
    group.add(ocean);
  }

  // ==========================================================================
  // 3. ARCHITECTURAL FINISH GANTRY, CHECKPOINTS & STREETLIGHTS
  // ==========================================================================
  const startS = samples[0];
  const checkerTex = createCheckerTexture(maxAnisotropy);
  disposables.push(checkerTex);
  const finishStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(startS.width, 4.4),
    new THREE.MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  finishStrip.rotation.x = -Math.PI / 2;
  const finishYaw = Math.atan2(startS.tangent.x, startS.tangent.z);
  finishStrip.rotation.z = -finishYaw;
  finishStrip.position.copy(startS.pos).add(new THREE.Vector3(0, 0.04, 0));
  finishStrip.receiveShadow = true;
  group.add(finishStrip);

  const gantryGroup = buildArchitecturalGantry(startS.width + 2.4, 7.8, mapDef.accentColor, true);
  gantryGroup.position.copy(startS.pos);
  gantryGroup.rotation.y = finishYaw;
  group.add(gantryGroup);

  const checkpoints: CheckpointGate[] = [];
  const cpCount = 10;
  for (let c = 1; c <= cpCount; c++) {
    const progress = c / (cpCount + 1);
    const idx = Math.floor(progress * sampleCount) % sampleCount;
    const s = samples[idx];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const gate = buildArchitecturalGantry(s.width + 1.8, 6.4, mapDef.curbColor, false);
    gate.position.copy(s.pos);
    gate.rotation.y = yaw;
    group.add(gate);
    checkpoints.push({
      index: c - 1,
      progress,
      position: s.pos.clone(),
      tangent: s.tangent.clone(),
      mesh: gate,
    });
  }

  // Streetlights along sidewalks (Instanced poles + LED luminaire heads + volumetric beams & wet light pools)
  const streetlightFX = buildStreetlights(group, samples, mapDef, quality, disposables);

  // Steel Highway Guardrails & Reflective Delineator Posts
  buildGuardrails(group, samples, mapDef, disposables);

  // Highway / Urban Tunnels on City & Rain maps
  if (mapDef.ambience === 'city' || mapDef.ambience === 'rain') {
    buildTunnelSection(group, samples, 18, 30, concreteMat, mapDef.accentColor, disposables);
  }

  // ==========================================================================
  // 4. SURFACE OVERLAYS (WATER / ICE)
  // ==========================================================================
  const waterPatchMat = new THREE.MeshPhysicalMaterial({
    color: '#087CA0',
    roughness: 0.06,
    metalness: 0.15,
    clearcoat: 1.0,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    transparent: true,
    opacity: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const icePatchMat = new THREE.MeshPhysicalMaterial({
    color: '#DCEEFB',
    roughness: 0.06,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposables.push(waterPatchMat, icePatchMat);

  for (let i = 0; i < sampleCount; i += 3) {
    const s = samples[i];
    if (s.surface === 'water' || s.surface === 'ice') {
      const patch = new THREE.Mesh(
        new THREE.PlaneGeometry(s.width * 0.9, (totalLength / sampleCount) * 3.3),
        s.surface === 'water' ? waterPatchMat : icePatchMat
      );
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = -Math.atan2(s.tangent.x, s.tangent.z);
      patch.position.copy(s.pos).add(new THREE.Vector3(0, 0.05, 0));
      patch.receiveShadow = true;
      group.add(patch);
    }
  }

  // ==========================================================================
  // 5. BOOST PADS & ENGINEERED JUMP RAMPS
  // ==========================================================================
  const boostZones: BoostZone[] = [];
  const jumpRamps: JumpRamp[] = [];
  const boostTex = createBoostPadTexture(mapDef.accentColor, maxAnisotropy);
  const boostMat = new THREE.MeshStandardMaterial({
    map: boostTex,
    emissive: mapDef.accentColor,
    emissiveMap: boostTex,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const rampSteelMat = new THREE.MeshStandardMaterial({
    color: '#2A313D',
    roughness: 0.38,
    metalness: 0.75,
  });
  const rampGlowMat = new THREE.MeshStandardMaterial({
    color: mapDef.accentColor,
    emissive: mapDef.accentColor,
    emissiveIntensity: 1.1,
    roughness: 0.2,
  });
  disposables.push(boostTex, boostMat, rampSteelMat, rampGlowMat);

  // Wedge ramp ExtrudeGeometry
  const wedgeShape = new THREE.Shape();
  wedgeShape.moveTo(-3.2, 0);
  wedgeShape.lineTo(3.2, 0);
  wedgeShape.lineTo(3.2, 1.45);
  wedgeShape.lineTo(2.7, 1.45);
  wedgeShape.quadraticCurveTo(0, 0.6, -3.2, 0.06);
  wedgeShape.closePath();
  const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, {
    depth: 4.4,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  wedgeGeo.rotateY(Math.PI / 2);
  wedgeGeo.translate(-2.2, 0, 0);
  disposables.push(wedgeGeo);

  for (let i = 15; i < sampleCount - 10; i += 24) {
    const s = samples[i];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const latOffset = (Math.floor(i / 24) % 2 === 0 ? -1 : 1) * (s.width * 0.18);
    const center = s.pos.clone().addScaledVector(s.right, latOffset);

    if (Math.floor(i / 24) % 2 === 0) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.6), boostMat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = -yaw;
      pad.position.copy(center).add(new THREE.Vector3(0, 0.05, 0));
      group.add(pad);
      boostZones.push({ center, radius: 3.9, tangent: s.tangent.clone() });
    } else {
      const rampGroup = new THREE.Group();
      const rampMesh = new THREE.Mesh(wedgeGeo, rampSteelMat);
      rampMesh.castShadow = true;
      rampMesh.receiveShadow = true;
      const lipGlow = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.12, 0.25), rampGlowMat);
      lipGlow.position.set(0, 1.45, 3.1);
      rampGroup.add(rampMesh, lipGlow);
      rampGroup.position.copy(center);
      rampGroup.rotation.y = yaw;
      group.add(rampGroup);
      jumpRamps.push({
        center: center.clone(),
        tangent: s.tangent.clone(),
        width: 4.6,
        length: 6.4,
        height: 1.8,
      });
    }
  }

  // ==========================================================================
  // 6. GRIND RAILS & ILLUMINATED WALL-RUN BILLBOARDS
  // ==========================================================================
  const grindRails: GrindRail[] = [];
  const railMat = new THREE.MeshStandardMaterial({
    color: '#D8E0EB',
    roughness: 0.18,
    metalness: 0.92,
  });
  const railGlowMat = new THREE.MeshStandardMaterial({
    color: mapDef.accentColor,
    emissive: mapDef.accentColor,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });
  disposables.push(railMat, railGlowMat);

  [38, 118, 188].forEach((startIdx, rIdx) => {
    const railPts: THREE.Vector3[] = [];
    const side = rIdx % 2 === 0 ? 1 : -1;
    for (let k = 0; k <= 12; k++) {
      const s = samples[(startIdx + k) % sampleCount];
      railPts.push(s.pos.clone().addScaledVector(s.right, side * (s.width * 0.34)).add(new THREE.Vector3(0, 1.55, 0)));
    }
    const rCurve = new THREE.CatmullRomCurve3(railPts);
    const rGeo = new THREE.TubeGeometry(rCurve, 32, 0.14, 12, false);
    disposables.push(rGeo);
    const rMesh = new THREE.Mesh(rGeo, railMat);
    rMesh.castShadow = true;
    group.add(rMesh);

    // Support stanchions under rail
    for (let st = 0; st <= 4; st++) {
      const pt = rCurve.getPointAt(st / 4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.55, 8), railGlowMat);
      post.position.set(pt.x, pt.y - 0.78, pt.z);
      group.add(post);
    }

    const sampledPts: THREE.Vector3[] = [];
    const sampledTans: THREE.Vector3[] = [];
    for (let p = 0; p <= 24; p++) {
      sampledPts.push(rCurve.getPointAt(p / 24));
      sampledTans.push(rCurve.getTangentAt(p / 24).normalize());
    }
    grindRails.push({ curve: rCurve, points: sampledPts, tangents: sampledTans });
  });

  // Wall-Run Architectural Billboards
  const wallPanels: WallRunPanel[] = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1E242E', roughness: 0.4, metalness: 0.8 });
  const panelFaceMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    emissive: mapDef.accentColor,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.5,
  });
  disposables.push(frameMat, panelFaceMat);

  [56, 100, 156, 214].forEach((idx, wIdx) => {
    const s = samples[idx % sampleCount];
    const side = wIdx % 2 === 0 ? -1 : 1;
    const panelCenter = s.pos
      .clone()
      .addScaledVector(s.right, side * (s.width * 0.51))
      .add(new THREE.Vector3(0, 2.7, 0));

    const panelGrp = new THREE.Group();
    const backing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.5, 18.4), frameMat);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.8, 17.6), panelFaceMat);
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 18.2), rampGlowMat);
    topStrip.position.y = 2.15;
    panelGrp.add(backing, face, topStrip);
    panelGrp.position.copy(panelCenter);
    panelGrp.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    backing.castShadow = true;
    group.add(panelGrp);

    wallPanels.push({
      center: panelCenter,
      normal: s.right.clone().multiplyScalar(-side),
      tangent: s.tangent.clone(),
      length: 18,
      height: 4.4,
    });
  });

  // ==========================================================================
  // 7. ENGINEERED TRACK BARRIERS / OBSTACLES
  // ==========================================================================
  const obstacles: TrackObstacle[] = [];
  const obsCount = modeId === 'obstacle-rush' ? 14 : 7;
  const obsFrameMat = new THREE.MeshStandardMaterial({ color: '#272D38', roughness: 0.35, metalness: 0.78 });
  const obsWarnMat = new THREE.MeshStandardMaterial({
    color: '#DC2626',
    emissive: '#EF4444',
    emissiveIntensity: 0.65,
    roughness: 0.28,
  });
  disposables.push(obsFrameMat, obsWarnMat);

  for (let o = 0; o < obsCount; o++) {
    const idx = Math.floor(((o + 1) / (obsCount + 1)) * (sampleCount - 16)) + 10;
    const s = samples[idx % sampleCount];
    const slideUnder = o % 3 === 1;
    const width = slideUnder ? 6.6 : 3.8;
    const height = slideUnder ? 1.45 : 1.15;
    const yOffset = slideUnder ? 1.9 : 0.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.85), obsFrameMat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.24, 0.9), obsWarnMat);
    mesh.add(bar);
    const basePos = s.pos.clone().add(new THREE.Vector3(0, yOffset, 0));
    mesh.position.copy(basePos);
    mesh.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    mesh.castShadow = true;
    group.add(mesh);

    obstacles.push({
      mesh,
      basePos,
      rightVec: s.right.clone(),
      halfWidth: width * 0.5,
      height,
      slideUnder,
      oscillateAmp: slideUnder ? 0 : s.width * 0.24,
      oscillateSpeed: 1.5 + (o % 3) * 0.45,
      phase: o * 1.1,
    });
  }

  // ==========================================================================
  // 8. COLLECTIBLES (ENERGY STARS & TURBO CORES)
  // ==========================================================================
  const collectibles: CollectibleItem[] = [];
  const starGeo = new THREE.OctahedronGeometry(0.48, 0);
  const starMat = new THREE.MeshPhysicalMaterial({
    color: '#FACC15',
    emissive: '#F59E0B',
    emissiveIntensity: 0.9,
    roughness: 0.14,
    metalness: 0.9,
    clearcoat: 1.0,
  });
  const orbGeo = new THREE.SphereGeometry(0.42, 16, 14);
  const orbMat = new THREE.MeshPhysicalMaterial({
    color: '#22D3EE',
    emissive: '#06B6D4',
    emissiveIntensity: 1.05,
    roughness: 0.1,
    metalness: 0.7,
    clearcoat: 1.0,
  });
  disposables.push(starGeo, starMat, orbGeo, orbMat);

  const collectibleStep = modeId === 'star-collector' ? 5 : 9;
  let cId = 0;
  for (let i = 8; i < sampleCount - 6; i += collectibleStep) {
    const s = samples[i];
    const kind: 'star' | 'turbo' = i % 2 === 0 ? 'star' : 'turbo';
    const lat = Math.sin(i * 0.4) * (s.width * 0.26);
    const pos = s.pos.clone().addScaledVector(s.right, lat).add(new THREE.Vector3(0, 1.25, 0));
    const mesh = new THREE.Mesh(kind === 'star' ? starGeo : orbGeo, kind === 'star' ? starMat : orbMat);
    mesh.position.copy(pos);
    group.add(mesh);
    collectibles.push({
      id: cId++,
      mesh,
      pos,
      kind,
      collected: false,
      respawnTimer: 0,
    });
  }

  // ==========================================================================
  // 9. COMPOSITE MULTI-PART WORLD ARCHITECTURE & NATURAL VEGETATION
  // ==========================================================================
  const animatedProps: THREE.Object3D[] = [];
  const animatedChoppers: { group: THREE.Group; rotor: THREE.Object3D; tailRotor: THREE.Object3D; angle: number; radius: number; speed: number; y: number }[] = [];
  const propCount = quality === 'low' ? 42 : quality === 'medium' ? 76 : quality === 'high' ? 110 : 140;
  buildRealisticWorldScenery(
    group,
    mapDef,
    samples,
    propCount,
    maxAnisotropy,
    animatedProps,
    animatedChoppers,
    disposables
  );

  // ==========================================================================
  // 10. ATMOSPHERIC WEATHER PARTICLES (DYNAMIC ACROSS ALL MAPS)
  // ==========================================================================
  const pCount = quality === 'low' ? 350 : quality === 'medium' ? 700 : 1200;
  const pPos = new Float32Array(pCount * 3);
  const weatherSeeds = new Float32Array(pCount * 3);
  const weatherVelocities = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 140;
    pPos[i * 3 + 1] = Math.random() * 55;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    weatherSeeds[i * 3] = Math.random();
    weatherSeeds[i * 3 + 1] = Math.random();
    weatherSeeds[i * 3 + 2] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: '#93C5FD',
    size: 0.28,
    transparent: true,
    opacity: mapDef.weather === 'clear' ? 0.0 : 0.65,
    depthWrite: false,
  });
  disposables.push(pGeo, pMat);
  const weatherPoints = new THREE.Points(pGeo, pMat);
  weatherPoints.frustumCulled = false;
  weatherPoints.visible = mapDef.weather !== 'clear';
  group.add(weatherPoints);

  const weatherColorTmp = new THREE.Color('#93C5FD');

  const updateAtmosphere = (dt: number, focusPos: THREE.Vector3, weather?: WeatherSnapshot) => {
    oceanTimeUniform.value += dt;
    roadWeatherUniforms.uWeatherTime.value += dt;
    if (animatedWaterNormal) {
      animatedWaterNormal.offset.x = (animatedWaterNormal.offset.x + dt * 0.035) % 1;
      animatedWaterNormal.offset.y = (animatedWaterNormal.offset.y + dt * 0.022) % 1;
    }

    // Dynamic roadway wetness / frost / specular reflections
    const wetness = weather ? weather.wetness : mapDef.ambience === 'rain' ? 0.85 : 0.0;
    const icing = weather ? weather.icing : mapDef.ambience === 'snow' ? 0.85 : 0.0;
    const rainAmt = weather ? weather.rainIntensity : mapDef.weather === 'rain' ? 1 : 0;
    const snowAmt = weather ? weather.snowIntensity : mapDef.weather === 'snow' ? 1 : 0;
    const sandAmt = weather ? weather.sandIntensity : mapDef.weather === 'sandstorm' ? 1 : 0;
    const emberAmt = weather ? weather.emberIntensity : mapDef.weather === 'embers' ? 1 : 0;
    const starAmt = weather ? weather.starIntensity : mapDef.weather === 'starfield' ? 1 : 0;

    roadWeatherUniforms.uWetness.value = wetness;
    roadWeatherUniforms.uIcing.value = icing;
    roadWeatherUniforms.uRainIntensity.value = rainAmt;
    trackMat.metalness = THREE.MathUtils.lerp(0.08, 0.34, Math.max(wetness, icing * 0.7));
    trackMat.envMapIntensity = THREE.MathUtils.lerp(0.9, 1.85, Math.max(wetness, icing * 0.8));

    if (streetlightFX) {
      if (streetlightFX.poolMat) {
        streetlightFX.poolMat.opacity = Math.min(0.85, streetlightFX.basePoolOpacity + wetness * 0.42);
      }
      if (streetlightFX.coneMat) {
        streetlightFX.coneMat.opacity = Math.min(0.24, streetlightFX.baseConeOpacity + Math.max(rainAmt, snowAmt) * 0.09);
      }
    }

    for (const ch of animatedChoppers) {
      ch.angle += dt * ch.speed;
      const nx = Math.cos(ch.angle) * ch.radius + 35;
      const nz = Math.sin(ch.angle) * ch.radius - 40;
      const tangentYaw = Math.atan2(-Math.sin(ch.angle), Math.cos(ch.angle));
      ch.group.position.set(nx, ch.y + Math.sin(ch.angle * 3) * 1.4, nz);
      ch.group.rotation.set(0.08, tangentYaw, -0.06);
      ch.rotor.rotation.y += dt * 26;
      ch.tailRotor.rotation.x += dt * 32;
    }

    const totalVis = Math.max(rainAmt, snowAmt, sandAmt, emberAmt, starAmt);
    weatherPoints.visible = totalVis > 0.02;
    if (weatherPoints.visible) {
      // Choose dominant active particle appearance
      if (rainAmt >= snowAmt && rainAmt >= sandAmt && rainAmt >= emberAmt && rainAmt >= starAmt) {
        weatherColorTmp.set('#93C5FD');
        pMat.size = 0.25;
        pMat.opacity = 0.62 * rainAmt;
      } else if (snowAmt >= sandAmt && snowAmt >= emberAmt && snowAmt >= starAmt) {
        weatherColorTmp.set('#F1F5F9');
        pMat.size = 0.38;
        pMat.opacity = 0.78 * snowAmt;
      } else if (sandAmt >= emberAmt && sandAmt >= starAmt) {
        weatherColorTmp.set('#E7C896');
        pMat.size = 0.34;
        pMat.opacity = 0.66 * sandAmt;
      } else if (emberAmt >= starAmt) {
        weatherColorTmp.set('#FB923C');
        pMat.size = 0.34;
        pMat.opacity = 0.8 * emberAmt;
      } else {
        weatherColorTmp.set('#E0E7FF');
        pMat.size = 0.55;
        pMat.opacity = 0.75 * starAmt;
      }
      pMat.color.copy(weatherColorTmp);

      const posAttr = weatherPoints.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const halfBox = 70;
      const minY = focusPos.y - 6;
      const maxY = focusPos.y + 46;

      for (let i = 0; i < posAttr.count; i++) {
        const ix = i * 3;
        const s0 = weatherSeeds[ix];
        const s1 = weatherSeeds[ix + 1];
        const s2 = weatherSeeds[ix + 2];

        const vx =
          rainAmt * -5.5 +
          snowAmt * ((s0 - 0.5) * 4.5) +
          sandAmt * (22 + s0 * 8) +
          emberAmt * ((s0 - 0.5) * 3.0);
        const vy =
          rainAmt * (-36 - s1 * 10) +
          snowAmt * (-4.5 - s1 * 2.5) +
          sandAmt * ((s1 - 0.5) * 2.0) +
          emberAmt * (4.5 + s1 * 4.0) +
          starAmt * -0.3;
        const vz =
          rainAmt * -2.5 +
          snowAmt * ((s2 - 0.5) * 4.5) +
          sandAmt * 6.0 +
          emberAmt * ((s2 - 0.5) * 3.0);

        weatherVelocities[ix] = vx;
        weatherVelocities[ix + 1] = vy;
        weatherVelocities[ix + 2] = vz;

        arr[ix] += vx * dt;
        arr[ix + 1] += vy * dt;
        arr[ix + 2] += vz * dt;

        if (arr[ix] < focusPos.x - halfBox) arr[ix] += halfBox * 2;
        if (arr[ix] > focusPos.x + halfBox) arr[ix] -= halfBox * 2;
        if (arr[ix + 2] < focusPos.z - halfBox) arr[ix + 2] += halfBox * 2;
        if (arr[ix + 2] > focusPos.z + halfBox) arr[ix + 2] -= halfBox * 2;
        if (arr[ix + 1] < minY) arr[ix + 1] = maxY - Math.random() * 5;
        if (arr[ix + 1] > maxY) arr[ix + 1] = minY + Math.random() * 5;
      }
      posAttr.needsUpdate = true;
    }
  };

  return {
    group,
    curve,
    samples,
    checkpoints,
    boostZones,
    jumpRamps,
    grindRails,
    wallPanels,
    obstacles,
    collectibles,
    weatherPoints,
    animatedProps,
    totalLength,
    updateAtmosphere,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function buildArchitecturalGantry(width: number, height: number, colorHex: string, isFinish: boolean): THREE.Group {
  const gate = new THREE.Group();
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#1E242E',
    roughness: 0.34,
    metalness: 0.85,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: '#0B111C',
    roughness: 0.4,
    metalness: 0.6,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: isFinish ? 1.45 : 0.9,
    roughness: 0.15,
  });

  // Tapered steel gantry stanchions + concrete footings
  [-width * 0.5, width * 0.5].forEach((px) => {
    const footing = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.72, 1.1, 12), steelMat);
    footing.position.set(px, 0.55, 0);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, height, 12), steelMat);
    column.position.set(px, height * 0.5, 0);
    column.castShadow = true;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.35, 12), ledMat);
    beacon.position.set(px, height - 0.3, 0);
    gate.add(footing, column, beacon);
  });

  // Overhead truss girder + illuminated signboard
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.45, 0.7), steelMat);
  crossBeam.position.set(0, height + 0.1, 0);
  crossBeam.castShadow = true;

  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, isFinish ? 1.35 : 0.75, 0.42), bannerMat);
  signBoard.position.set(0, height - 0.5, 0);

  const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.14, 0.48), ledMat);
  ledStrip.position.set(0, height - (isFinish ? 1.12 : 0.82), 0);

  gate.add(crossBeam, signBoard, ledStrip);
  return gate;
}

function buildStreetlights(
  group: THREE.Group,
  samples: BuiltMap['samples'],
  mapDef: MapDef,
  quality: 'low' | 'medium' | 'high' | 'ultra',
  disposables: { dispose: () => void }[]
): {
  coneMat: THREE.MeshBasicMaterial | null;
  poolMat: THREE.MeshBasicMaterial | null;
  baseConeOpacity: number;
  basePoolOpacity: number;
} | null {
  const showLights = ['city', 'rain', 'stadium', 'beach', 'candy', 'factory'].includes(mapDef.ambience);
  if (!showLights) return null;

  const step = 12;
  const count = Math.floor(samples.length / step);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 6.8, 10);
  const armGeo = new THREE.BoxGeometry(1.8, 0.1, 0.12);
  const lampGeo = new THREE.BoxGeometry(0.65, 0.08, 0.32);

  const poleMat = new THREE.MeshStandardMaterial({ color: '#333C4A', roughness: 0.35, metalness: 0.85 });
  const isWarmDusk = mapDef.ambience === 'beach' || mapDef.ambience === 'candy' || mapDef.ambience === 'factory';
  const lampColor = isWarmDusk ? '#FDE68A' : '#BAE6FD';
  const lampMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    emissive: lampColor,
    emissiveIntensity: mapDef.ambience === 'rain' || mapDef.ambience === 'city' ? 2.5 : 1.4,
    roughness: 0.1,
  });

  disposables.push(poleGeo, armGeo, lampGeo, poleMat, lampMat);

  const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
  const armInst = new THREE.InstancedMesh(armGeo, poleMat, count);
  const lampInst = new THREE.InstancedMesh(lampGeo, lampMat, count);

  const addVolumetric = quality !== 'low';
  const baseConeOpacity = mapDef.ambience === 'rain' ? 0.11 : mapDef.ambience === 'city' ? 0.075 : 0.045;
  const basePoolOpacity = mapDef.ambience === 'rain' ? 0.56 : mapDef.ambience === 'city' ? 0.36 : 0.2;

  const coneGeo = addVolumetric ? new THREE.CylinderGeometry(0.24, 3.1, 6.5, 12, 1, true) : null;
  const coneMat = addVolumetric
    ? new THREE.MeshBasicMaterial({
        color: isWarmDusk ? '#FCD34D' : '#93C5FD',
        transparent: true,
        opacity: baseConeOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    : null;
  const poolTex = addVolumetric ? createGlowPoolTexture(isWarmDusk ? '255,220,145' : '165,220,255') : null;
  const poolGeo = addVolumetric ? new THREE.PlaneGeometry(7.8, 7.8) : null;
  const poolMat = addVolumetric && poolTex
    ? new THREE.MeshBasicMaterial({
        map: poolTex,
        transparent: true,
        opacity: basePoolOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    : null;

  if (coneGeo) disposables.push(coneGeo);
  if (coneMat) disposables.push(coneMat);
  if (poolTex) disposables.push(poolTex);
  if (poolGeo) disposables.push(poolGeo);
  if (poolMat) disposables.push(poolMat);

  const coneInst = coneGeo && coneMat ? new THREE.InstancedMesh(coneGeo, coneMat, count) : null;
  const poolInst = poolGeo && poolMat ? new THREE.InstancedMesh(poolGeo, poolMat, count) : null;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const s = samples[i * step];
    const side = i % 2 === 0 ? 1 : -1;
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const offset = s.width * 0.5 + 1.45;
    const px = s.pos.x + s.right.x * side * offset;
    const pz = s.pos.z + s.right.z * side * offset;

    dummy.position.set(px, s.pos.y + 3.4, pz);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    poleInst.setMatrixAt(i, dummy.matrix);

    // Arm extends inward toward carriageway
    const armX = px - s.right.x * side * 0.85;
    const armZ = pz - s.right.z * side * 0.85;
    dummy.position.set(armX, s.pos.y + 6.75, armZ);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    armInst.setMatrixAt(i, dummy.matrix);

    const lampX = px - s.right.x * side * 1.55;
    const lampZ = pz - s.right.z * side * 1.55;
    dummy.position.set(lampX, s.pos.y + 6.68, lampZ);
    dummy.updateMatrix();
    lampInst.setMatrixAt(i, dummy.matrix);

    if (coneInst && poolInst) {
      dummy.position.set(lampX, s.pos.y + 3.35, lampZ);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      coneInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(lampX, s.pos.y + 0.04, lampZ);
      dummy.rotation.set(-Math.PI / 2, 0, -yaw);
      dummy.updateMatrix();
      poolInst.setMatrixAt(i, dummy.matrix);
    }
  }

  [poleInst, armInst, lampInst, coneInst, poolInst].forEach((inst) => {
    if (!inst) return;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });

  return { coneMat, poolMat, baseConeOpacity, basePoolOpacity };
}

function buildGuardrails(
  group: THREE.Group,
  samples: BuiltMap['samples'],
  mapDef: MapDef,
  disposables: { dispose: () => void }[]
): void {
  const showRails = ['city', 'rain', 'beach', 'forest', 'desert', 'snow', 'factory', 'candy'].includes(mapDef.ambience);
  if (!showRails) return;

  const wallIndices = [56, 100, 156, 214];
  const railMat = new THREE.MeshStandardMaterial({ color: '#64748B', roughness: 0.38, metalness: 0.82 });
  const postMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.55, metalness: 0.72 });
  const reflectorMat = new THREE.MeshStandardMaterial({
    color: '#FBBF24',
    emissive: mapDef.ambience === 'city' || mapDef.ambience === 'rain' ? '#38BDF8' : '#F59E0B',
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  const postGeo = new THREE.BoxGeometry(0.11, 0.82, 0.11);
  const beamGeo = new THREE.BoxGeometry(0.08, 0.28, 1);
  const refGeo = new THREE.BoxGeometry(0.12, 0.08, 0.16);
  disposables.push(railMat, postMat, reflectorMat, postGeo, beamGeo, refGeo);

  const step = 2;
  const transforms: { pos: THREE.Vector3; mid: THREE.Vector3; yaw: number; segLen: number }[] = [];

  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i];
    const sNext = samples[(i + step) % samples.length];

    for (const side of [-1, 1] as const) {
      // Leave clearance right in front of wall-run billboards
      const nearWallPanel = wallIndices.some((wi, wIdx) => {
        const panelSide = wIdx % 2 === 0 ? -1 : 1;
        const dIdx = Math.min(
          Math.abs(i - wi),
          samples.length - Math.abs(i - wi)
        );
        return side === panelSide && dIdx <= 4;
      });
      if (nearWallPanel) continue;

      const offset = s.width * 0.5 + 1.82;
      const offsetNext = sNext.width * 0.5 + 1.82;
      const p0 = s.pos.clone().addScaledVector(s.right, side * offset);
      const p1 = sNext.pos.clone().addScaledVector(sNext.right, side * offsetNext);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const segLen = Math.hypot(dx, dz) + 0.12;
      const yaw = Math.atan2(dx, dz);
      transforms.push({ pos: p0, mid, yaw, segLen });
    }
  }

  if (transforms.length === 0) return;
  const postInst = new THREE.InstancedMesh(postGeo, postMat, transforms.length);
  const beamInst = new THREE.InstancedMesh(beamGeo, railMat, transforms.length);
  const refInst = new THREE.InstancedMesh(refGeo, reflectorMat, transforms.length);

  const dummy = new THREE.Object3D();
  transforms.forEach((tr, idx) => {
    dummy.position.set(tr.pos.x, tr.pos.y + 0.44, tr.pos.z);
    dummy.rotation.set(0, tr.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tr.mid.x, tr.mid.y + 0.62, tr.mid.z);
    dummy.rotation.set(0, tr.yaw, 0);
    dummy.scale.set(1, 1, tr.segLen);
    dummy.updateMatrix();
    beamInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tr.pos.x, tr.pos.y + 0.87, tr.pos.z);
    dummy.rotation.set(0, tr.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    refInst.setMatrixAt(idx, dummy.matrix);
  });

  [postInst, beamInst, refInst].forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });
}

function buildTunnelSection(
  group: THREE.Group,
  samples: BuiltMap['samples'],
  startIdx: number,
  endIdx: number,
  concreteMat: THREE.Material,
  accentColor: string,
  disposables: { dispose: () => void }[]
): void {
  const stripMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    emissive: accentColor,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  disposables.push(stripMat);

  for (let i = startIdx; i < endIdx; i += 2) {
    const s = samples[i % samples.length];
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(s.width * 0.56, 0.65, 8, 20, Math.PI),
      concreteMat
    );
    arch.position.copy(s.pos);
    arch.rotation.y = yaw;
    arch.castShadow = true;
    arch.receiveShadow = true;

    const ceilingLight = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.35), stripMat);
    ceilingLight.position.set(0, s.width * 0.52, 0);
    arch.add(ceilingLight);
    group.add(arch);
  }
}

function createPalmRosetteGeometry(frondCount = 7): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let vOffset = 0;
  const segs = 5;
  const frondLen = 3.8;
  const frondWidth = 1.45;

  for (let f = 0; f < frondCount; f++) {
    const yaw = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.18;
    const pitchLift = f % 2 === 0 ? 0.52 : 0.25;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const dist = t * frondLen;
      // Arched parabolic droop
      const y = dist * pitchLift - t * t * 1.65;
      const halfW = frondWidth * 0.5 * (0.65 + 0.35 * Math.sin(t * Math.PI));

      // Left & Right vertices in local frond frame, rotated around Y
      const lx = -halfW;
      const rx = halfW;
      const wxL = lx * cosY + dist * sinY;
      const wzL = -lx * sinY + dist * cosY;
      const wxR = rx * cosY + dist * sinY;
      const wzR = -rx * sinY + dist * cosY;

      positions.push(wxL, y, wzL, wxR, y, wzR);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, t, 1, t);

      if (s < segs) {
        const a = vOffset + s * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }
    vOffset += (segs + 1) * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildInstancedPalms(
  group: THREE.Group,
  samples: BuiltMap['samples'],
  palmCount: number,
  maxAnisotropy: number,
  baseY: number,
  distBase: number,
  distSpread: number,
  disposables: { dispose: () => void }[]
): void {
  // Curved slender coconut palm trunk
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.38, 10.5, 9, 6);
  trunkGeo.translate(0, 5.25, 0);
  const tPos = trunkGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const py = tPos.getY(i);
    const curveFactor = (py / 10.5) * (py / 10.5) * 1.1;
    tPos.setX(i, tPos.getX(i) + curveFactor);
  }
  trunkGeo.computeVertexNormals();

  const crownGeo = createPalmRosetteGeometry(7);
  const frondTex = createPalmFrondTexture(maxAnisotropy);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6E503F', roughness: 0.92, metalness: 0.02 });
  const frondMat = new THREE.MeshStandardMaterial({
    map: frondTex,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.56,
    metalness: 0.04,
  });

  disposables.push(trunkGeo, crownGeo, frondTex, trunkMat, frondMat);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount);
  const crownInst = new THREE.InstancedMesh(crownGeo, frondMat, palmCount);

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  for (let i = 0; i < palmCount; i++) {
    const s = samples[Math.floor((i / palmCount) * samples.length) % samples.length];
    const side = i % 2 === 0 ? 1 : -1;
    const dist = s.width * 0.5 + distBase + (i % 5) * distSpread;
    const px = s.pos.x + s.right.x * side * dist + (hashSeed(i * 7) - 0.5) * 3.5;
    const pz = s.pos.z + s.right.z * side * dist + (hashSeed(i * 11) - 0.5) * 3.5;
    const scale = 0.82 + hashSeed(i) * 0.55;
    const rotY = hashSeed(i + 2) * Math.PI * 2;
    const leanZ = (hashSeed(i + 7) - 0.5) * 0.12;

    dummy.position.set(px, baseY, pz);
    dummy.rotation.set(0, rotY, leanZ);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    // Local tip of trunk at (1.1, 10.5, 0) transformed by rotY & scale
    const localTipX = 1.1 * scale;
    const localTipY = 10.35 * scale;
    const tipX = px + localTipX * Math.cos(rotY) - Math.sin(leanZ) * localTipY * Math.cos(rotY);
    const tipZ = pz - localTipX * Math.sin(rotY) + Math.sin(leanZ) * localTipY * Math.sin(rotY);
    dummy.position.set(tipX, baseY + localTipY, tipZ);
    dummy.rotation.set(0, rotY + i * 0.4, leanZ * 0.5);
    dummy.scale.set(scale * 1.05, scale * 1.05, scale * 1.05);
    dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);

    col.set('#FFFFFF').offsetHSL((hashSeed(i + 15) - 0.5) * 0.04, 0, (hashSeed(i + 19) - 0.5) * 0.14);
    crownInst.setColorAt(i, col);
  }

  [trunkInst, crownInst].forEach((inst) => {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);
  });
}

function spawnSkylineHelicopters(
  group: THREE.Group,
  animatedChoppers: { group: THREE.Group; rotor: THREE.Object3D; tailRotor: THREE.Object3D; angle: number; radius: number; speed: number; y: number }[],
  disposables: { dispose: () => void }[]
): void {
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.25, metalness: 0.78 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#0F172A', roughness: 0.06, clearcoat: 1.0, metalness: 0.1 });
  const navRed = new THREE.MeshStandardMaterial({ color: '#EF4444', emissive: '#EF4444', emissiveIntensity: 2.2 });
  const navCyan = new THREE.MeshStandardMaterial({ color: '#38BDF8', emissive: '#38BDF8', emissiveIntensity: 2.0 });
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#E0F2FE',
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const hullGeo = new THREE.SphereGeometry(1.4, 14, 10);
  hullGeo.scale(0.85, 0.75, 1.9);
  const boomGeo = new THREE.CylinderGeometry(0.14, 0.28, 3.6, 8);
  boomGeo.rotateX(Math.PI / 2);
  const bladeGeo = new THREE.BoxGeometry(6.8, 0.05, 0.24);
  const tailBladeGeo = new THREE.BoxGeometry(0.06, 1.2, 0.14);
  const coneGeo = new THREE.CylinderGeometry(0.22, 3.6, 26, 12, 1, true);

  disposables.push(bodyMat, glassMat, navRed, navCyan, beamMat, hullGeo, boomGeo, bladeGeo, tailBladeGeo, coneGeo);

  for (let i = 0; i < 3; i++) {
    const chGroup = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo, bodyMat);
    const canopy = new THREE.Mesh(hullGeo, glassMat);
    canopy.scale.set(0.82, 0.65, 0.62);
    canopy.position.set(0, 0.22, 0.78);
    const boom = new THREE.Mesh(boomGeo, bodyMat);
    boom.position.set(0, 0.15, -2.5);

    const rotor = new THREE.Group();
    rotor.position.set(0, 1.15, 0);
    const b1 = new THREE.Mesh(bladeGeo, bodyMat);
    const b2 = new THREE.Mesh(bladeGeo, bodyMat);
    b2.rotation.y = Math.PI / 2;
    rotor.add(b1, b2);

    const tailRotor = new THREE.Mesh(tailBladeGeo, bodyMat);
    tailRotor.position.set(0.22, 0.25, -4.15);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), i % 2 === 0 ? navRed : navCyan);
    beacon.position.set(0, -0.75, 0.4);

    const searchBeam = new THREE.Mesh(coneGeo, beamMat);
    searchBeam.position.set(0, -13.2, 6.2);
    searchBeam.rotation.x = 0.44;

    chGroup.add(hull, canopy, boom, rotor, tailRotor, beacon, searchBeam);
    group.add(chGroup);

    animatedChoppers.push({
      group: chGroup,
      rotor,
      tailRotor,
      angle: i * 2.1,
      radius: 105 + i * 38,
      speed: (i % 2 === 0 ? 1 : -1) * (0.14 + i * 0.03),
      y: 44 + i * 14,
    });
  }
}

function buildRealisticWorldScenery(
  group: THREE.Group,
  mapDef: MapDef,
  samples: BuiltMap['samples'],
  count: number,
  maxAnisotropy: number,
  animatedProps: THREE.Object3D[],
  animatedChoppers: { group: THREE.Group; rotor: THREE.Object3D; tailRotor: THREE.Object3D; angle: number; radius: number; speed: number; y: number }[],
  disposables: { dispose: () => void }[]
): void {
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();

  if (mapDef.ambience === 'city' || mapDef.ambience === 'rain' || mapDef.ambience === 'stadium' || mapDef.ambience === 'candy') {
    // Multi-part Realistic High-Rise Urban Skyline (Podium + Glazed Curtain Tower + Rooftop Penthouse + Neon Trim + Spire)
    const facade = createBuildingFacadePBR(mapDef.ambience, maxAnisotropy);
    disposables.push(facade);

    const towerMat = new THREE.MeshStandardMaterial({
      map: facade.map,
      normalMap: facade.normalMap,
      roughnessMap: facade.roughnessMap,
      emissiveMap: facade.emissiveMap,
      emissive: '#FFFFFF',
      emissiveIntensity: mapDef.ambience === 'city' || mapDef.ambience === 'rain' ? 1.15 : 0.55,
      roughness: 0.85,
      metalness: 0.38,
      envMapIntensity: 1.4,
    });
    const podiumMat = new THREE.MeshStandardMaterial({
      color: '#252B36',
      roughness: 0.72,
      metalness: 0.25,
    });
    const penthouseMat = new THREE.MeshStandardMaterial({
      color: '#1A202C',
      roughness: 0.4,
      metalness: 0.7,
    });
    const neonTrimMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      emissive: '#FFFFFF',
      emissiveIntensity: mapDef.ambience === 'city' || mapDef.ambience === 'rain' ? 1.8 : 0.9,
      roughness: 0.2,
    });

    const podiumGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const crownGeo = new THREE.BoxGeometry(0.65, 1, 0.65);
    const neonCollarGeo = new THREE.BoxGeometry(1.03, 0.36, 1.03);
    const spireGeo = new THREE.CylinderGeometry(0.06, 0.2, 1, 8);
    disposables.push(towerMat, podiumMat, penthouseMat, neonTrimMat, podiumGeo, towerGeo, crownGeo, neonCollarGeo, spireGeo);

    const podiumInst = new THREE.InstancedMesh(podiumGeo, podiumMat, count);
    const towerInst = new THREE.InstancedMesh(towerGeo, towerMat, count);
    const crownInst = new THREE.InstancedMesh(crownGeo, penthouseMat, count);
    const neonInst = new THREE.InstancedMesh(neonCollarGeo, neonTrimMat, count);
    const spireInst = new THREE.InstancedMesh(spireGeo, penthouseMat, count);

    const vicePalette = ['#38BDF8', '#FB7185', '#FBBF24', '#C084FC'];

    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const layer = Math.floor(i / 24);
      const dist = s.width * 0.95 + 18 + (i % 6) * 14 + layer * 24;
      const px = s.pos.x + s.right.x * side * dist + (hashSeed(i * 3) - 0.5) * 14;
      const pz = s.pos.z + s.right.z * side * dist + (hashSeed(i * 5) - 0.5) * 14;

      const bw = 11 + hashSeed(i + 11) * 13;
      const bd = 11 + hashSeed(i + 23) * 13;
      const bh = (mapDef.ambience === 'stadium' ? 18 : 26) + hashSeed(i + 37) * 58;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const groundY = -8;

      // Podium base
      const podH = 6.5;
      dummy.position.set(px, groundY + podH * 0.5, pz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(bw * 1.18, podH, bd * 1.18);
      dummy.updateMatrix();
      podiumInst.setMatrixAt(i, dummy.matrix);

      // Curtain-wall tower
      dummy.position.set(px, groundY + podH + bh * 0.5, pz);
      dummy.scale.set(bw, bh, bd);
      dummy.updateMatrix();
      towerInst.setMatrixAt(i, dummy.matrix);

      // Rooftop mechanical crown
      const crH = 3.5;
      dummy.position.set(px, groundY + podH + bh + crH * 0.5, pz);
      dummy.scale.set(bw, crH, bd);
      dummy.updateMatrix();
      crownInst.setMatrixAt(i, dummy.matrix);

      // Vice-City architectural rooftop neon trim band
      dummy.position.set(px, groundY + podH + bh - 0.15, pz);
      dummy.scale.set(bw, 1, bd);
      dummy.updateMatrix();
      neonInst.setMatrixAt(i, dummy.matrix);
      c.set(vicePalette[i % vicePalette.length]);
      neonInst.setColorAt(i, c);

      // Telecom spire on taller skyscrapers
      const spH = i % 3 === 0 ? 11 : 0.1;
      dummy.position.set(px, groundY + podH + bh + crH + spH * 0.5, pz);
      dummy.scale.set(1, spH, 1);
      dummy.updateMatrix();
      spireInst.setMatrixAt(i, dummy.matrix);

      c.set('#CBD5E1').offsetHSL((hashSeed(i) - 0.5) * 0.08, 0.05, (hashSeed(i + 9) - 0.5) * 0.15);
      towerInst.setColorAt(i, c);
    }

    [podiumInst, towerInst, crownInst, neonInst, spireInst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = inst !== neonInst;
      inst.receiveShadow = inst !== neonInst;
      group.add(inst);
    });

    // Vice Boulevard Palm Trees lining urban & candy strips
    buildInstancedPalms(group, samples, Math.min(48, Math.floor(count * 0.45)), maxAnisotropy, -3.5, 5.4, 2.2, disposables);
    spawnSkylineHelicopters(group, animatedChoppers, disposables);
  } else if (mapDef.ambience === 'beach') {
    // Lush Feathered Coconut Palm Trees + Vice Waterfront Skyline Silhouettes & Patrol Choppers
    buildInstancedPalms(group, samples, count, maxAnisotropy, -6.5, 5.2, 11, disposables);
    spawnSkylineHelicopters(group, animatedChoppers, disposables);
  } else if (mapDef.ambience === 'forest' || mapDef.ambience === 'snow') {
    // Multi-tier Conifer / Redwood Trees (bark trunk + 3 stacked natural foliage tiers)
    const isSnow = mapDef.ambience === 'snow';
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.78, 12, 10);
    trunkGeo.translate(0, 6, 0);
    const tierGeo = new THREE.ConeGeometry(3.8, 6.2, 10);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#4A3222', roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: isSnow ? '#2D4F44' : '#1B4D2E',
      roughness: 0.78,
    });
    disposables.push(trunkGeo, tierGeo, trunkMat, leafMat);

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const t1Inst = new THREE.InstancedMesh(tierGeo, leafMat, count);
    const t2Inst = new THREE.InstancedMesh(tierGeo, leafMat, count);
    const t3Inst = new THREE.InstancedMesh(tierGeo, leafMat, count);

    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width * 0.95 + 14 + (i % 6) * 14;
      const px = s.pos.x + s.right.x * side * dist;
      const pz = s.pos.z + s.right.z * side * dist;
      const scale = 0.85 + hashSeed(i) * 0.75;
      const baseY = -7.5;

      dummy.position.set(px, baseY, pz);
      dummy.rotation.set(0, hashSeed(i + 4) * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, baseY + 8.5 * scale, pz);
      dummy.scale.set(scale * 1.1, scale, scale * 1.1);
      dummy.updateMatrix();
      t1Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, baseY + 11.8 * scale, pz);
      dummy.scale.set(scale * 0.85, scale * 0.9, scale * 0.85);
      dummy.updateMatrix();
      t2Inst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(px, baseY + 14.8 * scale, pz);
      dummy.scale.set(scale * 0.6, scale * 0.8, scale * 0.6);
      dummy.updateMatrix();
      t3Inst.setMatrixAt(i, dummy.matrix);

      c.set(isSnow ? '#355A4F' : '#1E5434').offsetHSL(0, 0, (hashSeed(i + 9) - 0.5) * 0.14);
      t1Inst.setColorAt(i, c);
      t2Inst.setColorAt(i, c);
      t3Inst.setColorAt(i, isSnow ? c.clone().lerp(new THREE.Color('#E2E8F0'), 0.45) : c);
    }

    [trunkInst, t1Inst, t2Inst, t3Inst].forEach((inst) => {
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      group.add(inst);
    });
  } else if (mapDef.ambience === 'desert') {
    // Monumental Sandstone Pyramids & Carved Obelisks
    const pyrGeo = new THREE.ConeGeometry(16, 24, 4);
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#C8A16E', roughness: 0.86, metalness: 0.04 });
    disposables.push(pyrGeo, stoneMat);
    const inst = new THREE.InstancedMesh(pyrGeo, stoneMat, Math.min(count, 44));
    for (let i = 0; i < Math.min(count, 44); i++) {
      const s = samples[(i * 5) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 28 + (i % 4) * 26;
      const sc = 0.8 + hashSeed(i) * 1.4;
      dummy.position.set(s.pos.x + s.right.x * side * dist, -8 + 11 * sc, s.pos.z + s.right.z * side * dist);
      dummy.rotation.set(0, Math.PI * 0.25 + (i % 3) * 0.1, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);
  } else if (mapDef.ambience === 'lava') {
    // Jagged Volcanic Basalt Spires & Glowing Magma Cracks
    const rockGeo = new THREE.DodecahedronGeometry(6.5, 1);
    const basaltMat = new THREE.MeshStandardMaterial({
      color: '#231F20',
      emissive: '#9A3412',
      emissiveIntensity: 0.18,
      roughness: 0.88,
    });
    disposables.push(rockGeo, basaltMat);
    const inst = new THREE.InstancedMesh(rockGeo, basaltMat, count);
    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 16 + (i % 5) * 18;
      const sc = 0.9 + hashSeed(i) * 1.7;
      dummy.position.set(s.pos.x + s.right.x * side * dist, -6 + sc * 3, s.pos.z + s.right.z * side * dist);
      dummy.rotation.set(hashSeed(i + 2), hashSeed(i + 3), hashSeed(i + 4));
      dummy.scale.set(sc, sc * 2.2, sc);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);
  } else if (mapDef.ambience === 'factory') {
    // Heavy Industrial Silos + Steel Trusses + Turbines
    const siloGeo = new THREE.CylinderGeometry(4.5, 4.5, 22, 18);
    const tankMat = new THREE.MeshStandardMaterial({ color: '#3F444E', roughness: 0.42, metalness: 0.78 });
    disposables.push(siloGeo, tankMat);
    const inst = new THREE.InstancedMesh(siloGeo, tankMat, count);
    for (let i = 0; i < count; i++) {
      const s = samples[(i * 3) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 16 + (i % 5) * 14;
      const h = 0.8 + hashSeed(i) * 1.1;
      dummy.position.set(s.pos.x + s.right.x * side * dist, -8 + 11 * h, s.pos.z + s.right.z * side * dist);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.castShadow = true;
    group.add(inst);

    for (let g = 0; g < 3; g++) {
      const gear = new THREE.Mesh(
        new THREE.TorusGeometry(9, 1.3, 12, 24),
        new THREE.MeshStandardMaterial({ color: '#B45309', metalness: 0.85, roughness: 0.28 })
      );
      gear.position.set(55 + g * 45, 16, -90 - g * 30);
      group.add(gear);
      animatedProps.push(gear);
    }
  } else {
    // Space / Sky: Orbital Solar Array Stations & Cloud-Skimming Titanium Pylons
    const arrayGeo = new THREE.BoxGeometry(8, 0.25, 14);
    const arrayMat = new THREE.MeshStandardMaterial({ color: '#1E3A8A', roughness: 0.22, metalness: 0.85 });
    disposables.push(arrayGeo, arrayMat);
    const inst = new THREE.InstancedMesh(arrayGeo, arrayMat, count);
    for (let i = 0; i < count; i++) {
      const s = samples[(i * 2) % samples.length];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = s.width + 18 + (i % 5) * 16;
      dummy.position.set(
        s.pos.x + s.right.x * side * dist,
        s.pos.y + ((i % 5) - 2) * 6,
        s.pos.z + s.right.z * side * dist
      );
      dummy.rotation.set(0.3, Math.atan2(s.tangent.x, s.tangent.z), 0.2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);

    if (mapDef.ambience === 'space') {
      const planet = new THREE.Mesh(
        new THREE.SphereGeometry(32, 32, 24),
        new THREE.MeshStandardMaterial({ color: '#3730A3', roughness: 0.65, metalness: 0.1 })
      );
      planet.position.set(95, 58, -260);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(42, 62, 64),
        new THREE.MeshStandardMaterial({
          color: '#7DD3FC',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.45,
          roughness: 0.5,
        })
      );
      ring.rotation.x = Math.PI * 0.38;
      planet.add(ring);
      group.add(planet);
      animatedProps.push(planet);
    }
  }
}

export class TrackSampler {
  private readonly samples: BuiltMap['samples'];
  private readonly count: number;
  private readonly tmp = new THREE.Vector3();

  constructor(builtMap: BuiltMap) {
    this.samples = builtMap.samples;
    this.count = builtMap.samples.length;
  }

  public sampleClosest(pos: THREE.Vector3, hintProgress?: number): TrackSample {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintProgress !== undefined) {
      const centerIdx = Math.floor(((hintProgress % 1 + 1) % 1) * this.count);
      for (let offset = -24; offset <= 24; offset++) {
        const idx = (centerIdx + offset + this.count) % this.count;
        const dSq = this.samples[idx].pos.distanceToSquared(pos);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      if (bestDistSq < 550) {
        return this.buildSampleResult(bestIdx, pos, bestDistSq);
      }
    }

    for (let i = 0; i < this.count; i++) {
      const dSq = this.samples[i].pos.distanceToSquared(pos);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    return this.buildSampleResult(bestIdx, pos, bestDistSq);
  }

  private buildSampleResult(idx: number, pos: THREE.Vector3, distSq: number): TrackSample {
    const s = this.samples[idx];
    this.tmp.copy(pos).sub(s.pos);
    const lateralOffset = this.tmp.dot(s.right);
    return {
      progress: idx / this.count,
      point: s.pos,
      tangent: s.tangent,
      right: s.right,
      lateralOffset,
      halfWidth: s.width * 0.5,
      surface: s.surface,
      distSq,
    };
  }

  public getSpawnTransform(slotIndex: number, totalRacers: number): { pos: THREE.Vector3; yaw: number } {
    const s = this.samples[0];
    const row = Math.floor(slotIndex / 3);
    const col = (slotIndex % 3) - 1;
    const lateral = col * 2.8;
    const back = -2.5 - row * 2.8;
    const pos = s.pos
      .clone()
      .addScaledVector(s.right, lateral)
      .addScaledVector(s.tangent, back);
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    if (totalRacers <= 2) {
      pos.copy(s.pos).addScaledVector(s.right, slotIndex === 0 ? -2.2 : 2.2).addScaledVector(s.tangent, -2);
    }
    return { pos, yaw };
  }
}
