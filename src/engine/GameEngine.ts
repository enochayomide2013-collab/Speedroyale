import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  COSMETICS,
  GAME_MODES,
  MAPS,
  SPEEDSTARS,
  VEHICLES,
  type GameModeDef,
  type MapDef,
  type SpeedstarDef,
} from '../shared/gameData';
import {
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  type GhostRunRecord,
  type GhostSelection,
  type MultiplayerRoomState,
  type PlayerLoadout,
  type PlayerSettings,
  type RemoteRacerFrame,
} from '../shared/types';
import { AudioManager } from './AudioManager';
import {
  buildPhantomEcho,
  buildSpeedstarRig,
  CharacterAnimator,
  type SpeedstarRig,
} from './CharacterBuilder';
import { buildTrackMap, TrackSampler, type BuiltMap } from './MapBuilder';
import { MovementSystem, type PlayerPhysicsState } from './MovementSystem';
import { PlayerController, type InputSnapshot } from './PlayerController';
import {
  createBuildingFacadePBR,
  createConcretePBR,
  createContactShadowTexture,
  createGlowPoolTexture,
  createPalmFrondTexture,
  createRoadPBR,
  createSkyAndIBL,
  createWaterNormalMap,
} from './ProceduralTextures';
import { CheckpointManager, RaceManager, type HudSnapshot, type RacerProgress } from './RaceManager';
import { buildVehicleRig, updateVehicleRig, type VehicleRig } from './VehicleBuilder';
import { WeatherSystem } from './WeatherSystem';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _camUp = new THREE.Vector3(0, 1, 0);

// Filmic split-tone cinematic color grade + edge vignette + boost chromatic dispersion + anti-banding dither
const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.25 },
    uContrast: { value: 1.07 },
    uSaturation: { value: 1.09 },
    uTurboIntensity: { value: 0.0 },
    uZeroPointIntensity: { value: 0.0 },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uTurboIntensity;
    uniform float uZeroPointIntensity;
    uniform float uTime;
    varying vec2 vUv;

    float filmHash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 17.3) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);

      // Subtle peripheral speed dispersion during Turbo or Zero Point
      float shift = (0.00045 + uTurboIntensity * 0.0022 + uZeroPointIntensity * 0.0042) * smoothstep(0.24, 0.78, dist);
      vec2 dir = dist > 0.0001 ? centered / dist : vec2(0.0);
      float r = texture2D(tDiffuse, vUv + dir * shift).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * shift).b;
      vec3 col = vec3(r, g, b);

      // Filmic saturation & S-curve contrast in linear space before ACES OutputPass
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = max(vec3(0.0), (col - 0.18) * uContrast + 0.18);

      // Subtle Vice-City split-tone (cool ocean-slate shadows, warm golden-amber highlights)
      float shMask = 1.0 - smoothstep(0.0, 0.25, luma);
      float hiMask = smoothstep(0.35, 1.15, luma);
      col += vec3(-0.005, 0.004, 0.012) * shMask;
      col += vec3(0.016, 0.008, -0.006) * hiMask;

      // Cool cosmic peripheral rim tint during Zero Point
      vec3 zpTint = vec3(0.22, 0.58, 0.98);
      col = mix(col, col + zpTint * 0.09, uZeroPointIntensity * smoothstep(0.28, 0.75, dist));

      // Subtle lens vignette
      float vig = 1.0 - smoothstep(0.45, 0.98, dist) * (uVignette + uTurboIntensity * 0.08 + uZeroPointIntensity * 0.14);
      col *= vig;

      // Micro filmic dither to prevent sky gradient banding
      col += (filmHash(gl_FragCoord.xy) - 0.5) * 0.0032;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

interface AiBot {
  progress: RacerProgress;
  rig: SpeedstarRig;
  animator: CharacterAnimator;
  trackT: number;
  lateral: number;
  targetLateral: number;
  baseSpeed: number;
  yaw: number;
  pos: THREE.Vector3;
  turboTimer: number;
}

interface RemoteVisual {
  clientId: string;
  rig: SpeedstarRig;
  animator: CharacterAnimator;
  vehicleRig: VehicleRig | null;
  targetPos: THREE.Vector3;
  targetYaw: number;
  currentPos: THREE.Vector3;
  currentYaw: number;
  animState: string;
  speed: number;
  turboActive: boolean;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface ReplayRacerSample {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  animState: string;
  turboActive: boolean;
  mountedVehicle: boolean;
  progress: number;
  eliminated: boolean;
  finished: boolean;
  starsCollected: number;
}

interface ReplayFrame {
  t: number;
  racers: ReplayRacerSample[];
}

export interface RaceCompletePayload {
  modeId: string;
  mapId: string;
  placement: number;
  totalRacers: number;
  finishTimeSec: number;
  starsCollected: number;
  turboUsedCount: number;
  eliminated: boolean;
  standings: HudSnapshot['standings'];
  teamScores: HudSnapshot['teamScores'];
  ghostSamples: { t: number; x: number; y: number; z: number; yaw: number }[];
}

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gradePass: ShaderPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private zpPointLight: THREE.PointLight;
  private contactShadowTex: THREE.Texture;
  private activeSkyIbl: { background: THREE.Texture; environment: THREE.Texture; dispose: () => void } | null = null;
  private lobbyDisposables: { dispose: () => void }[] = [];

  public readonly audio = new AudioManager();
  public readonly controller = new PlayerController();
  public readonly movement = new MovementSystem();
  public readonly raceMgr = new RaceManager();
  private readonly weatherSys = new WeatherSystem();

  private sceneMode: 'lobby' | 'race' = 'lobby';
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();

  // Lobby showcase state
  private lobbyGroup = new THREE.Group();
  private lobbyRig: SpeedstarRig | null = null;
  private lobbyVehicleRig: VehicleRig | null = null;
  private lobbyAnimator = new CharacterAnimator();
  private lobbyOrbitYaw = 0.45;
  private lobbyOrbitPitch = 0.18;
  private lobbyPreviewAnim: 'idle' | 'sprint' | 'turbo' | 'victory' = 'idle';
  private lobbyDragging = false;
  private lobbyLastPointer = { x: 0, y: 0 };
  private lobbyWaterNormal: THREE.DataTexture | null = null;
  private lobbyOceanUniform = { value: 0 };
  private lobbySoftboxLight: THREE.RectAreaLight | null = null;
  private sprayAcc = 0;

  // Active race world state
  private raceGroup = new THREE.Group();
  private builtMap: BuiltMap | null = null;
  private sampler: TrackSampler | null = null;
  private cpMgr: CheckpointManager | null = null;
  private currentMapDef: MapDef = MAPS[0];
  private currentModeDef: GameModeDef = GAME_MODES[0];
  private currentSpeedstar: SpeedstarDef = SPEEDSTARS[0];
  private currentLoadout: PlayerLoadout | null = null;
  private currentRanked = false;

  private playerRig: SpeedstarRig | null = null;
  private playerVehicleRig: VehicleRig | null = null;
  private playerVehicleEnclosed = false;
  private playerAnimator = new CharacterAnimator();
  private playerState: PlayerPhysicsState = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
    grounded: true,
    sliding: false,
    slideTimer: 0,
    wallRunning: false,
    wallSide: 1,
    railGrinding: false,
    activeRail: null,
    railT: 0,
    doubleJumpUsed: false,
    airDashUsed: false,
    boostTimer: 0,
    stunTimer: 0,
    animState: 'idle',
    lastSafePos: new THREE.Vector3(),
    lastSafeYaw: 0,
    trackProgress: 0,
    currentSurface: 'normal',
  };

  private aiBots: AiBot[] = [];
  private remoteRacers = new Map<string, RemoteVisual>();
  private ghostRig: SpeedstarRig | null = null;
  private ghostAnimator = new CharacterAnimator();
  private activeGhostRun: GhostRunRecord | null = null;
  private ghostSelection: GhostSelection = 'off';
  private ghostPos = new THREE.Vector3();
  private ghostYaw = 0;
  private ghostTrackProgress = 0;
  private ghostDeltaSec: number | null = null;
  private particles: BurstParticle[] = [];
  private particleGeo = new THREE.SphereGeometry(0.16, 6, 6);
  private spectatingTargetId: string | null = null;
  private isSpectatingLiveRoom = false;
  private spectateRoomCode: string | null = null;
  private spectatorCamMode: 'follow' | 'free' = 'follow';
  private freeCamPos = new THREE.Vector3(0, 12, 18);
  private freeCamYaw = 0;
  private freeCamPitch = -0.25;
  private freeCamDragging = false;
  private freeCamLastPointer = { x: 0, y: 0 };

  // Recorded race replay state
  private replayFrames: ReplayFrame[] = [];
  private replayRecordAcc = 0;
  private isReplayMode = false;
  private replayPlaying = false;
  private replayTimeSec = 0;
  private replaySpeed = 1;
  private replayTargetTurboMap = new Map<string, boolean>();
  private replayTargetSpeedMap = new Map<string, number>();

  // Cinematic camera choreography state
  private camShake = 0;
  private camSmoothY = 3.4;
  private finishCamTime = 0;

  // Zero Point VFX pools
  private zpMandala: THREE.Group | null = null;
  private zpAuraGroup: THREE.Group | null = null;
  private zpPulses: { mesh: THREE.Mesh; life: number; maxLife: number; maxScale: number }[] = [];
  private zpCracks: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];
  private zpEchoes: { mesh: THREE.Group; life: number; maxLife: number }[] = [];
  private zpCrackAcc = 0;
  private zpEchoAcc = 0;
  private baseFogColor = new THREE.Color('#090E1A');
  private zpFogColor = new THREE.Color('#0B0622');
  private weatherFogTarget = new THREE.Color('#090E1A');
  private stormRainFogColor = new THREE.Color('#4A5C75');
  private stormSnowFogColor = new THREE.Color('#C5DDF2');
  private stormSandFogColor = new THREE.Color('#C9A26B');
  private prevSurface = 'normal';
  private iceSkidAudioCd = 0;
  private fpsEstimate = 60;

  private settings: PlayerSettings = {
    quality: 'high',
    masterVolume: 0.7,
    sfxVolume: 0.85,
    musicVolume: 0.45,
    autoSprint: true,
    touchControls: false,
    cameraFovBoost: true,
    controls: { ...DEFAULT_KEYBOARD_BINDINGS },
    gamepad: { ...DEFAULT_GAMEPAD_BINDINGS },
    savedSchemes: [],
  };

  // Callbacks to React
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onRaceComplete: (result: RaceCompletePayload) => void;
  private onBroadcastFrame?: (frame: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    speed: number;
    animState: string;
    turboActive: boolean;
    vehicleId: string | null;
    checkpointIndex: number;
    progress: number;
    finished: boolean;
    finishTimeSec: number | null;
  }) => void;
  private hudAcc = 0;
  private netAcc = 0;
  private raceCompleteEmitted = false;

  constructor(
    container: HTMLElement,
    onHudUpdate: (hud: HudSnapshot) => void,
    onRaceComplete: (result: RaceCompletePayload) => void,
    onBroadcastFrame?: GameEngine['onBroadcastFrame']
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onRaceComplete = onRaceComplete;
    this.onBroadcastFrame = onBroadcastFrame;

    // Detect software WebGL cleanly
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#151D2B', 0.0085);

    this.camera = new THREE.PerspectiveCamera(56, w / h, 0.2, 1300);
    this.camera.position.set(0, 2.5, 6);

    // Three-point natural atmospheric lighting rig
    this.hemiLight = new THREE.HemisphereLight('#93C5FD', '#1E293B', 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#FFF3E0', 2.0);
    this.sunLight.position.set(45, 75, 35);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 230;
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.022;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight('#7DD3FC', 0.65);
    this.rimLight.position.set(-40, 25, -40);
    this.scene.add(this.rimLight);

    // Dynamic world illumination light for Zero Point surges
    this.zpPointLight = new THREE.PointLight('#38BDF8', 0, 38, 1.4);
    this.scene.add(this.zpPointLight);

    this.contactShadowTex = createContactShadowTexture();

    this.scene.add(this.lobbyGroup);
    this.scene.add(this.raceGroup);
    this.raceGroup.visible = false;

    // Hardware WebGL Post-Processing Composer (Bloom + Filmic Grade + ACES OutputPass)
    if (!this.isSoftwareGl) {
      this.setupPostProcessing(w, h);
    }

    this.applyAtmosphereSky('city', '#0B111E', '#FDBA74');
    this.buildLobbyStage();
    this.attachEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.startLoop();
  }

  private setupPostProcessing(w: number, h: number): void {
    const composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.42, 0.88);
    const gradePass = new ShaderPass(CinematicGradeShader);
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(gradePass);
    composer.addPass(outputPass);

    this.composer = composer;
    this.bloomPass = bloomPass;
    this.gradePass = gradePass;
  }

  private applyAtmosphereSky(ambience: string, skyHex: string, sunHex: string): void {
    if (this.activeSkyIbl) {
      this.activeSkyIbl.dispose();
      this.activeSkyIbl = null;
    }
    const ibl = createSkyAndIBL(this.renderer, ambience, skyHex, sunHex);
    this.activeSkyIbl = ibl;
    this.scene.background = ibl.background;
    this.scene.environment = ibl.environment;
    this.scene.environmentIntensity = 1.0;
  }

  private buildLobbyStage(): void {
    // Vice Waterfront Sunset Showcase Paddock: Wet asphalt apron + seawall + shimmering bay + palm trees + neon skyline
    const asphaltPBR = createRoadPBR('#191E28', '#334155', '#38BDF8', 'rain', this.maxAnisotropy);
    asphaltPBR.map.repeat.set(3, 3);
    asphaltPBR.normalMap.repeat.set(3, 3);
    asphaltPBR.roughnessMap.repeat.set(3, 3);
    this.lobbyDisposables.push(asphaltPBR);

    const concretePBR = createConcretePBR(this.maxAnisotropy, '#646B73');
    concretePBR.map.repeat.set(4, 4);
    concretePBR.normalMap.repeat.set(4, 4);
    concretePBR.roughnessMap.repeat.set(4, 4);
    this.lobbyDisposables.push(concretePBR);

    const facadePBR = createBuildingFacadePBR('city', this.maxAnisotropy);
    facadePBR.map.repeat.set(2, 4);
    facadePBR.normalMap.repeat.set(2, 4);
    facadePBR.roughnessMap.repeat.set(2, 4);
    facadePBR.emissiveMap?.repeat.set(2, 4);
    this.lobbyDisposables.push(facadePBR);

    const apronGeo = new THREE.CylinderGeometry(24, 24, 0.45, 56);
    const apronMat = new THREE.MeshStandardMaterial({
      map: asphaltPBR.map,
      normalMap: asphaltPBR.normalMap,
      roughnessMap: asphaltPBR.roughnessMap,
      roughness: 0.72,
      metalness: 0.2,
      envMapIntensity: 1.5,
    });
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.y = -0.34;
    apron.receiveShadow = true;
    this.lobbyDisposables.push(apronGeo, apronMat);

    // Concrete showcase turntable plinth with brushed aluminum chamfer ring
    const plinthGeo = new THREE.CylinderGeometry(2.75, 3.05, 0.22, 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      map: concretePBR.map,
      normalMap: concretePBR.normalMap,
      roughnessMap: concretePBR.roughnessMap,
      roughness: 0.74,
      metalness: 0.16,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.11;
    plinth.receiveShadow = true;

    const bevelGeo = new THREE.TorusGeometry(2.78, 0.035, 12, 64);
    const bevelMat = new THREE.MeshStandardMaterial({
      color: '#CBD5E1',
      roughness: 0.2,
      metalness: 0.94,
    });
    const aluminumBevel = new THREE.Mesh(bevelGeo, bevelMat);
    aluminumBevel.rotation.x = Math.PI / 2;
    aluminumBevel.position.y = 0.0;

    // Waterfront seawall promenade ring edge
    const seawallGeo = new THREE.TorusGeometry(24.1, 0.35, 10, 64);
    const seawall = new THREE.Mesh(seawallGeo, plinthMat);
    seawall.rotation.x = Math.PI / 2;
    seawall.position.y = -0.05;
    this.lobbyDisposables.push(plinthGeo, plinthMat, bevelGeo, bevelMat, seawallGeo);

    // Shimmering Vice Bay Ocean horizon surrounding the waterfront dock
    const waterNormal = createWaterNormalMap(this.maxAnisotropy);
    waterNormal.repeat.set(16, 16);
    this.lobbyWaterNormal = waterNormal;
    this.lobbyDisposables.push(waterNormal);

    const bayGeo = new THREE.PlaneGeometry(460, 460, 48, 48);
    const bayMat = new THREE.MeshPhysicalMaterial({
      color: '#06506D',
      roughness: 0.06,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      envMapIntensity: 1.8,
    });
    bayMat.customProgramCacheKey = () => 'lobby-vice-bay-v1';
    bayMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.lobbyOceanUniform;
      shader.vertexShader =
        `uniform float uTime;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += sin(transformed.x * 0.1 + uTime * 1.4) * 0.16 + cos(transformed.y * 0.12 - uTime * 1.1) * 0.14;`
        );
    };
    const bayMesh = new THREE.Mesh(bayGeo, bayMat);
    bayMesh.rotation.x = -Math.PI / 2;
    bayMesh.position.y = -1.15;
    this.lobbyDisposables.push(bayGeo, bayMat);

    // Subtle pit-lane overhead light gantry + studio softbox reflection
    const steelMat = new THREE.MeshStandardMaterial({ color: '#1F2937', roughness: 0.4, metalness: 0.82 });
    const lightStripMat = new THREE.MeshStandardMaterial({
      color: '#F8FAFC',
      emissive: '#E0F2FE',
      emissiveIntensity: 1.75,
      roughness: 0.2,
    });
    const postGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.8, 14);
    const beamGeo = new THREE.BoxGeometry(9.8, 0.22, 0.35);
    const stripGeo = new THREE.BoxGeometry(8.4, 0.06, 0.16);
    const postL = new THREE.Mesh(postGeo, steelMat);
    postL.position.set(-4.6, 2.3, -3.8);
    postL.castShadow = true;
    const postR = postL.clone();
    postR.position.set(4.6, 2.3, -3.8);
    const crossBeam = new THREE.Mesh(beamGeo, steelMat);
    crossBeam.position.set(0, 4.7, -3.8);
    const lightStrip = new THREE.Mesh(stripGeo, lightStripMat);
    lightStrip.position.set(0, 4.56, -3.8);

    // Wet apron specular light pool under gantry
    const poolTex = createGlowPoolTexture('186,230,253');
    const poolGeo = new THREE.PlaneGeometry(14, 14);
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(0, -0.1, -1.6);
    this.lobbyDisposables.push(steelMat, lightStripMat, postGeo, beamGeo, stripGeo, poolTex, poolGeo, poolMat);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight('#E0F2FE', 4.8, 8.0, 1.8);
      softbox.position.set(0, 4.45, -1.8);
      softbox.lookAt(0, 0.5, 0.2);
      this.lobbySoftboxLight = softbox;
      this.lobbyGroup.add(softbox);
    }

    // Coastal palm trees framing the waterfront dock
    const frondTex = createPalmFrondTexture(this.maxAnisotropy);
    const palmTrunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 8.8, 8);
    palmTrunkGeo.translate(0, 4.4, 0);
    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: '#6E503F', roughness: 0.9 });
    const frondPlaneGeo = new THREE.PlaneGeometry(1.3, 3.4, 2, 4);
    frondPlaneGeo.translate(0, 1.7, 0);
    const fPos = frondPlaneGeo.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      const fy = fPos.getY(i);
      const t = fy / 3.4;
      fPos.setZ(i, t * t * 1.15);
    }
    frondPlaneGeo.computeVertexNormals();
    const frondMat = new THREE.MeshStandardMaterial({
      map: frondTex,
      alphaTest: 0.32,
      side: THREE.DoubleSide,
      roughness: 0.55,
    });
    this.lobbyDisposables.push(frondTex, palmTrunkGeo, palmTrunkMat, frondPlaneGeo, frondMat);

    const palmCoords = [
      [-12, -14],
      [13, -13],
      [-17, -4],
      [17, -6],
      [-15, 11],
      [16, 12],
    ];
    palmCoords.forEach(([px, pz], idx) => {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(palmTrunkGeo, palmTrunkMat);
      trunk.rotation.z = (idx % 2 === 0 ? 1 : -1) * 0.08;
      trunk.castShadow = true;
      palm.add(trunk);
      for (let f = 0; f < 6; f++) {
        const blade = new THREE.Mesh(frondPlaneGeo, frondMat);
        blade.position.set((idx % 2 === 0 ? -1 : 1) * 0.7, 8.6, 0);
        blade.rotation.y = (f / 6) * Math.PI * 2;
        blade.rotation.x = 0.85;
        palm.add(blade);
      }
      palm.position.set(px, -0.4, pz);
      this.lobbyGroup.add(palm);
    });

    // Architectural Vice City skyline surrounding the waterfront paddock
    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerMat = new THREE.MeshStandardMaterial({
      map: facadePBR.map,
      normalMap: facadePBR.normalMap,
      roughnessMap: facadePBR.roughnessMap,
      emissiveMap: facadePBR.emissiveMap,
      emissive: new THREE.Color('#FFF3DB'),
      emissiveIntensity: 0.95,
      roughness: 0.34,
      metalness: 0.55,
    });
    const neonMats = ['#38BDF8', '#FB7185', '#FBBF24'].map(
      (hex) => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.7 })
    );
    this.lobbyDisposables.push(towerGeo, towerMat, ...neonMats);

    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const dist = 46 + (i % 3) * 14;
      const w = 7 + (i % 3) * 2.5;
      const h = 22 + (i % 5) * 9;
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.scale.set(w, h, w);
      tower.position.set(Math.cos(ang) * dist, h * 0.5 - 2, Math.sin(ang) * dist);
      tower.rotation.y = -ang;

      const crown = new THREE.Mesh(towerGeo, neonMats[i % neonMats.length]);
      crown.scale.set(w * 1.03, 0.45, w * 1.03);
      crown.position.set(tower.position.x, h - 2.1, tower.position.z);
      crown.rotation.y = -ang;
      this.lobbyGroup.add(tower, crown);
    }

    this.lobbyGroup.add(apron, seawall, bayMesh, plinth, aluminumBevel, postL, postR, crossBeam, lightStrip, poolMesh);
  }

  public updateLobbyPreview(loadout: PlayerLoadout, anim?: 'idle' | 'sprint' | 'turbo' | 'victory'): void {
    const star = SPEEDSTARS.find((s) => s.id === loadout.speedstarId) ?? SPEEDSTARS[0];
    if (anim) this.lobbyPreviewAnim = anim;

    if (this.lobbyRig) {
      this.lobbyGroup.remove(this.lobbyRig.root);
    }
    if (this.lobbyVehicleRig) {
      this.lobbyGroup.remove(this.lobbyVehicleRig.root);
      this.lobbyVehicleRig = null;
    }

    const skinColor = COSMETICS.find((c) => c.id === loadout.skinId)?.colorHex;
    const trailColor = COSMETICS.find((c) => c.id === loadout.trailId)?.colorHex;
    this.lobbyRig = buildSpeedstarRig(star, skinColor, trailColor, this.contactShadowTex);
    this.lobbyGroup.add(this.lobbyRig.root);

    if (loadout.vehicleId) {
      const vDef = VEHICLES.find((v) => v.id === loadout.vehicleId);
      if (vDef) {
        this.lobbyVehicleRig = buildVehicleRig(vDef, false);
        this.lobbyVehicleRig.root.position.set(2.45, 0, -0.95);
        this.lobbyVehicleRig.root.rotation.y = -0.48;
        this.lobbyGroup.add(this.lobbyVehicleRig.root);
      }
    }
  }

  public setLobbyPreviewAnim(anim: 'idle' | 'sprint' | 'turbo' | 'victory'): void {
    this.lobbyPreviewAnim = anim;
  }

  public applySettings(settings: PlayerSettings): void {
    this.settings = settings;
    this.controller.autoSprint = settings.autoSprint;
    if (settings.controls && settings.gamepad) {
      this.controller.setBindings(settings.controls, settings.gamepad);
    }
    this.audio.setVolumes(settings.masterVolume, settings.sfxVolume, settings.musicVolume);
    if (!this.isSoftwareGl) {
      const pr =
        settings.quality === 'low'
          ? 1
          : settings.quality === 'medium'
          ? 1.25
          : Math.min(window.devicePixelRatio, 2);
      this.renderer.setPixelRatio(pr);
      this.renderer.shadowMap.enabled = settings.quality !== 'low';

      const targetShadowSize = settings.quality === 'medium' ? 1024 : 2048;
      if (this.sunLight.shadow.mapSize.x !== targetShadowSize) {
        this.sunLight.shadow.mapSize.set(targetShadowSize, targetShadowSize);
        if (this.sunLight.shadow.map) {
          this.sunLight.shadow.map.dispose();
          this.sunLight.shadow.map = null;
        }
      }

      if (this.composer) {
        this.composer.setPixelRatio(pr);
        this.composer.setSize(
          Math.max(1, this.container.clientWidth),
          Math.max(1, this.container.clientHeight)
        );
      }
      if (this.bloomPass) {
        this.bloomPass.enabled = settings.quality === 'high' || settings.quality === 'ultra';
        this.bloomPass.strength = settings.quality === 'ultra' ? 0.38 : 0.3;
      }
    }
  }

  public enterLobby(loadout: PlayerLoadout): void {
    this.sceneMode = 'lobby';
    this.raceMgr.phase = 'lobby';
    this.isSpectatingLiveRoom = false;
    this.spectateRoomCode = null;
    this.spectatingTargetId = null;
    this.spectatorCamMode = 'follow';
    this.isReplayMode = false;
    this.replayPlaying = false;
    this.replayTimeSec = 0;
    this.replayFrames = [];
    this.replayRecordAcc = 0;
    this.replayTargetTurboMap.clear();
    this.replayTargetSpeedMap.clear();
    this.movement.devFlight = false;
    this.movement.devInfiniteTurbo = false;
    this.movement.devNoCooldowns = false;
    this.lobbyGroup.visible = true;
    this.raceGroup.visible = false;
    this.controller.detach();
    this.zpPointLight.intensity = 0;

    this.applyAtmosphereSky('city', '#0B111E', '#FDBA74');
    this.scene.fog = new THREE.FogExp2('#151D2B', 0.0085);
    this.hemiLight.color.set('#93C5FD');
    this.hemiLight.groundColor.set('#1E293B');
    this.hemiLight.intensity = 0.85;
    this.sunLight.color.set('#FFF3E0');
    this.sunLight.intensity = 2.0;
    this.sunLight.position.set(18, 28, 18);
    this.sunLight.target.position.set(0, 1, 0);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();

    if (this.gradePass) {
      this.gradePass.uniforms.uTurboIntensity.value = 0;
      this.gradePass.uniforms.uZeroPointIntensity.value = 0;
    }

    this.clearRaceObjects();
    this.updateLobbyPreview(loadout);
    this.audio.stopMusic();
    this.audio.startMusic('lobby');
  }

  public startTutorial(
    loadout: PlayerLoadout,
    username: string,
    opts?: { ghostSelection?: GhostSelection; ghostRun?: GhostRunRecord | null }
  ): void {
    this.movement.resetTutorialTelemetry();
    this.startRace({
      modeId: 'training-grounds',
      mapId: 'neon-rush-city',
      ranked: false,
      loadout,
      username,
      fillBots: false,
      ghostSelection: opts?.ghostSelection,
      ghostRun: opts?.ghostRun,
    });
  }

  public startSpectatingLiveRoom(room: MultiplayerRoomState): void {
    this.sceneMode = 'race';
    this.lobbyGroup.visible = false;
    this.raceGroup.visible = true;
    this.raceCompleteEmitted = true;
    this.isSpectatingLiveRoom = true;
    this.spectateRoomCode = room.roomCode;
    this.spectatorCamMode = 'follow';
    this.isReplayMode = false;
    this.replayPlaying = false;
    this.replayTimeSec = 0;
    this.replayFrames = [];
    this.replayRecordAcc = 0;
    this.replayTargetTurboMap.clear();
    this.replayTargetSpeedMap.clear();
    this.camShake = 0;
    this.finishCamTime = 0;

    this.clearRaceObjects();

    this.currentModeDef = GAME_MODES.find((m) => m.id === room.modeId) ?? GAME_MODES[0];
    this.currentMapDef = MAPS.find((m) => m.id === room.mapId) ?? MAPS[0];
    this.currentSpeedstar = SPEEDSTARS[0];
    this.currentRanked = room.ranked;

    this.applyMapAtmosphere(this.currentMapDef);

    this.builtMap = buildTrackMap(
      this.currentMapDef,
      this.maxAnisotropy,
      this.currentModeDef.id,
      this.settings.quality
    );
    this.raceGroup.add(this.builtMap.group);
    this.sampler = new TrackSampler(this.builtMap);
    this.cpMgr = new CheckpointManager(this.builtMap.checkpoints);

    this.playerRig = buildSpeedstarRig(this.currentSpeedstar, undefined, undefined, this.contactShadowTex);
    this.playerRig.root.visible = false;
    this.raceGroup.add(this.playerRig.root);

    const racers: RacerProgress[] = [];
    const targetTotal = Math.max(room.members.length, 2);
    room.members.forEach((rm, idx) => {
      const star = SPEEDSTARS.find((s) => s.id === rm.speedstarId) ?? SPEEDSTARS[idx % SPEEDSTARS.length];
      const spawn = this.sampler!.getSpawnTransform(idx, targetTotal);
      const rig = buildSpeedstarRig(star, undefined, undefined, this.contactShadowTex);
      rig.root.position.copy(spawn.pos);
      rig.root.rotation.y = spawn.yaw;
      this.raceGroup.add(rig.root);

      this.remoteRacers.set(rm.clientId, {
        clientId: rm.clientId,
        rig,
        animator: new CharacterAnimator(),
        vehicleRig: null,
        targetPos: spawn.pos.clone(),
        targetYaw: spawn.yaw,
        currentPos: spawn.pos.clone(),
        currentYaw: spawn.yaw,
        animState: 'idle',
        speed: 0,
        turboActive: false,
      });

      racers.push({
        id: rm.clientId,
        name: rm.username,
        speedstarId: star.id,
        isHuman: false,
        isRemote: true,
        team: this.currentModeDef.id === 'team-sprint' ? (idx % 2 === 0 ? 'cyan' : 'amber') : null,
        nextCheckpointIndex: 0,
        progress: 0,
        finished: false,
        eliminated: false,
        finishTimeSec: null,
        starsCollected: 0,
      });
    });

    this.spectatingTargetId = racers[0]?.id ?? null;
    const initialSpawn = this.sampler.getSpawnTransform(0, targetTotal);
    this.camSmoothY = initialSpawn.pos.y + 3.0;
    this.freeCamPos.set(initialSpawn.pos.x, initialSpawn.pos.y + 10, initialSpawn.pos.z + 14);
    this.freeCamYaw = initialSpawn.yaw;
    this.freeCamPitch = -0.28;

    this.controller.attach();
    this.audio.stopMusic();
    this.weatherSys.resetForMap(this.currentMapDef);
    this.prevSurface = 'normal';
    this.iceSkidAudioCd = 0;
    this.audio.setEnvironmentAmbience(this.currentMapDef.weather, true);
    this.raceMgr.startRace(racers, 1, this.audio);
    this.raceMgr.phase = 'racing';
    this.emitHud();
  }

  private applyMapAtmosphere(mapDef: MapDef): void {
    this.baseFogColor.set(mapDef.fogColor);
    this.applyAtmosphereSky(mapDef.ambience, mapDef.skyColor, mapDef.sunColor);
    this.scene.fog = new THREE.FogExp2(mapDef.fogColor, mapDef.fogDensity * 0.85);
    this.hemiLight.color.set(mapDef.hemiSky);
    this.hemiLight.groundColor.set(mapDef.hemiGround);
    this.hemiLight.intensity = 0.88;
    this.sunLight.color.set(mapDef.sunColor);
    this.sunLight.intensity = mapDef.sunIntensity * 1.15;
    this.rimLight.color.set(mapDef.hemiSky);
    this.rimLight.intensity = 0.6;
  }

  public startRace(params: {
    modeId: string;
    mapId: string;
    ranked: boolean;
    loadout: PlayerLoadout;
    username: string;
    remoteMembers?: { clientId: string; username: string; speedstarId: string }[];
    fillBots: boolean;
    championshipStage?: number;
    ghostSelection?: GhostSelection;
    ghostRun?: GhostRunRecord | null;
  }): void {
    this.sceneMode = 'race';
    this.lobbyGroup.visible = false;
    this.raceGroup.visible = true;
    this.raceCompleteEmitted = false;
    this.spectatingTargetId = null;
    this.isSpectatingLiveRoom = false;
    this.spectateRoomCode = null;
    this.spectatorCamMode = 'follow';
    this.isReplayMode = false;
    this.replayPlaying = false;
    this.replayTimeSec = 0;
    this.replaySpeed = 1;
    this.replayFrames = [];
    this.replayRecordAcc = 0;
    this.replayTargetTurboMap.clear();
    this.replayTargetSpeedMap.clear();
    this.camShake = 0;
    this.finishCamTime = 0;

    this.clearRaceObjects();

    this.currentModeDef = GAME_MODES.find((m) => m.id === params.modeId) ?? GAME_MODES[0];
    this.currentMapDef = MAPS.find((m) => m.id === params.mapId) ?? MAPS[0];
    this.currentSpeedstar = SPEEDSTARS.find((s) => s.id === params.loadout.speedstarId) ?? SPEEDSTARS[0];
    this.currentLoadout = params.loadout;
    this.currentRanked = params.ranked;

    // Apply Realistic Sky, IBL, Sunlight & Atmospheric Horizon Fog
    this.applyMapAtmosphere(this.currentMapDef);

    // Build Realistic 3D Map
    this.builtMap = buildTrackMap(
      this.currentMapDef,
      this.maxAnisotropy,
      this.currentModeDef.id,
      this.settings.quality
    );
    this.raceGroup.add(this.builtMap.group);
    this.sampler = new TrackSampler(this.builtMap);
    this.cpMgr = new CheckpointManager(this.builtMap.checkpoints);

    // Configure player abilities & vehicle
    this.movement.abilitySys.configure(params.loadout.abilityIds, params.ranked);
    const vDef =
      this.currentModeDef.vehiclesAllowed && this.currentMapDef.vehicleFriendly && params.loadout.vehicleId
        ? VEHICLES.find((v) => v.id === params.loadout.vehicleId) ?? null
        : null;
    this.movement.vehicleMgr.setVehicle(vDef, false);

    // Create Realistic Humanoid Player Rig & Zero Point Mandala / Aura
    const skinColor = COSMETICS.find((c) => c.id === params.loadout.skinId)?.colorHex;
    const trailColor = COSMETICS.find((c) => c.id === params.loadout.trailId)?.colorHex;
    this.playerRig = buildSpeedstarRig(
      this.currentSpeedstar,
      skinColor,
      trailColor,
      this.contactShadowTex
    );
    this.raceGroup.add(this.playerRig.root);
    this.buildZeroPointRigAttachments(this.playerRig.root);

    this.playerVehicleEnclosed = false;
    if (vDef) {
      const darkOrRain =
        this.currentMapDef.ambience === 'city' ||
        this.currentMapDef.ambience === 'rain' ||
        this.currentMapDef.ambience === 'lava' ||
        this.currentMapDef.ambience === 'space';
      this.playerVehicleRig = buildVehicleRig(vDef, darkOrRain && this.settings.quality !== 'low');
      this.playerVehicleRig.root.visible = false;
      this.playerVehicleEnclosed =
        vDef.category === 'Supercar' || vDef.category === 'Hovercar' || vDef.category === 'Sky Craft';
      this.playerRig.root.add(this.playerVehicleRig.root);
    }

    // Build Racers Roster (Local Human + Remote Multiplayer Humans + Optional AI Fill)
    const remoteList = params.remoteMembers ?? [];
    const targetTotal = this.currentModeDef.maxCompetitors;
    const racers: RacerProgress[] = [];

    racers.push({
      id: 'local',
      name: params.username,
      speedstarId: this.currentSpeedstar.id,
      isHuman: true,
      isRemote: false,
      team: this.currentModeDef.id === 'team-sprint' ? 'cyan' : null,
      nextCheckpointIndex: 0,
      progress: 0,
      finished: false,
      eliminated: false,
      finishTimeSec: null,
      starsCollected: 0,
    });

    const localSpawn = this.sampler.getSpawnTransform(0, targetTotal);
    this.movement.resetState(this.playerState, localSpawn.pos, localSpawn.yaw, this.currentSpeedstar);
    this.playerRig.root.position.copy(localSpawn.pos);
    this.playerRig.root.rotation.y = localSpawn.yaw;
    this.camSmoothY = localSpawn.pos.y + 2.8;

    remoteList.forEach((rm, idx) => {
      const slot = idx + 1;
      const star = SPEEDSTARS.find((s) => s.id === rm.speedstarId) ?? SPEEDSTARS[slot % SPEEDSTARS.length];
      const spawn = this.sampler!.getSpawnTransform(slot, targetTotal);
      const rig = buildSpeedstarRig(star, undefined, undefined, this.contactShadowTex);
      rig.root.position.copy(spawn.pos);
      rig.root.rotation.y = spawn.yaw;
      this.raceGroup.add(rig.root);

      this.remoteRacers.set(rm.clientId, {
        clientId: rm.clientId,
        rig,
        animator: new CharacterAnimator(),
        vehicleRig: null,
        targetPos: spawn.pos.clone(),
        targetYaw: spawn.yaw,
        currentPos: spawn.pos.clone(),
        currentYaw: spawn.yaw,
        animState: 'idle',
        speed: 0,
        turboActive: false,
      });

      racers.push({
        id: rm.clientId,
        name: rm.username,
        speedstarId: star.id,
        isHuman: false,
        isRemote: true,
        team: this.currentModeDef.id === 'team-sprint' ? (slot % 2 === 0 ? 'cyan' : 'amber') : null,
        nextCheckpointIndex: 0,
        progress: 0,
        finished: false,
        eliminated: false,
        finishTimeSec: null,
        starsCollected: 0,
      });
    });

    const botsNeeded =
      params.fillBots && targetTotal > 1 ? Math.max(0, targetTotal - racers.length) : 0;

    for (let b = 0; b < botsNeeded; b++) {
      const slot = racers.length;
      const star = SPEEDSTARS[(slot * 3 + 2) % SPEEDSTARS.length];
      const spawn = this.sampler.getSpawnTransform(slot, targetTotal);
      const rig = buildSpeedstarRig(star, undefined, undefined, this.contactShadowTex);
      rig.root.position.copy(spawn.pos);
      rig.root.rotation.y = spawn.yaw;
      this.raceGroup.add(rig.root);

      const progress: RacerProgress = {
        id: `bot-${b}`,
        name: `${star.name} (AI)`,
        speedstarId: star.id,
        isHuman: false,
        isRemote: false,
        team: this.currentModeDef.id === 'team-sprint' ? (slot % 2 === 0 ? 'cyan' : 'amber') : null,
        nextCheckpointIndex: 0,
        progress: 0,
        finished: false,
        eliminated: false,
        finishTimeSec: null,
        starsCollected: 0,
      };
      racers.push(progress);

      const skillVariance = 0.91 + ((b * 7) % 10) * 0.017;
      this.aiBots.push({
        progress,
        rig,
        animator: new CharacterAnimator(),
        trackT: 0.992 - Math.floor(slot / 3) * 0.008,
        lateral: ((slot % 3) - 1) * 2.6,
        targetLateral: ((b % 5) - 2) * 1.6,
        baseSpeed: (24.5 + (star.stats.speed - 75) * 0.12) * skillVariance,
        yaw: spawn.yaw,
        pos: spawn.pos.clone(),
        turboTimer: 2 + (b % 4) * 1.5,
      });
    }

    this.ghostSelection = params.ghostSelection ?? 'off';
    this.activeGhostRun = params.ghostRun ?? null;
    this.ghostTrackProgress = 0;
    this.ghostDeltaSec = null;
    if (
      (this.currentModeDef.id === 'time-attack' || this.currentModeDef.id === 'training-grounds') &&
      this.ghostSelection !== 'off' &&
      this.activeGhostRun &&
      this.activeGhostRun.samples.length >= 2
    ) {
      this.spawnOrUpdateGhostRig();
    }

    // Position camera smoothly on opening front-quarter angle for intro sweep
    const introTheta = localSpawn.yaw + 0.68;
    this.camera.position.set(
      localSpawn.pos.x + Math.sin(introTheta) * 4.2,
      localSpawn.pos.y + 1.55,
      localSpawn.pos.z + Math.cos(introTheta) * 4.2
    );
    this.camera.lookAt(localSpawn.pos.x, localSpawn.pos.y + 1.25, localSpawn.pos.z);

    this.controller.attach();
    this.audio.stopMusic();
    this.weatherSys.resetForMap(this.currentMapDef);
    this.prevSurface = 'normal';
    this.iceSkidAudioCd = 0;
    this.audio.setEnvironmentAmbience(this.currentMapDef.weather, true);
    this.raceMgr.startRace(racers, params.championshipStage ?? 1, this.audio);
    this.emitHud();
  }

  public applyRemoteFrame(frame: RemoteRacerFrame): void {
    const rv = this.remoteRacers.get(frame.clientId);
    if (!rv) return;
    rv.targetPos.set(frame.x, frame.y, frame.z);
    rv.targetYaw = frame.yaw;
    rv.animState = frame.animState;
    rv.speed = frame.speed;
    rv.turboActive = frame.turboActive;

    const prog = this.raceMgr.racers.find((r) => r.id === frame.clientId);
    if (prog) {
      prog.nextCheckpointIndex = frame.checkpointIndex;
      prog.progress = frame.progress;
      prog.finished = frame.finished;
      prog.finishTimeSec = frame.finishTimeSec;
    }
  }

  public setSpectateNext(): void {
    this.cycleSpectateTarget(1);
  }

  public cycleSpectateTarget(dir: 1 | -1): void {
    const pool = this.isReplayMode
      ? this.raceMgr.racers
      : (() => {
          const nonHumanActive = this.raceMgr.racers.filter((r) => !r.isHuman && !r.eliminated);
          if (nonHumanActive.length > 0) return nonHumanActive;
          const nonHuman = this.raceMgr.racers.filter((r) => !r.isHuman);
          return nonHuman.length > 0 ? nonHuman : this.raceMgr.racers;
        })();
    if (pool.length === 0) return;
    const idx = pool.findIndex((r) => r.id === this.spectatingTargetId);
    const base = idx >= 0 ? idx : dir > 0 ? -1 : 0;
    this.spectatingTargetId = pool[(base + dir + pool.length) % pool.length].id;
    this.emitHud();
  }

  public setSpectateTarget(racerId: string): void {
    const exists = this.raceMgr.racers.some((r) => r.id === racerId);
    if (!exists) return;
    this.spectatingTargetId = racerId;
    this.spectatorCamMode = 'follow';
    this.emitHud();
  }

  public setSpectatorCamMode(mode: 'follow' | 'free'): void {
    this.spectatorCamMode = mode;
    if (mode === 'free') {
      this.freeCamPos.copy(this.camera.position);
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.freeCamYaw = Math.atan2(dir.x, dir.z);
      this.freeCamPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -0.9, 0.9));
    } else if (!this.spectatingTargetId && this.raceMgr.racers.length > 0) {
      this.spectatingTargetId = this.raceMgr.racers[0].id;
    }
    this.emitHud();
  }

  public enterPostRaceSpectate(): void {
    if (this.sceneMode !== 'race') return;
    if (this.replayFrames.length >= 2) {
      this.startReplaySpectate();
      return;
    }
    const fallbackTarget =
      this.raceMgr.racers.find((r) => !r.isHuman && !r.eliminated)?.id ??
      this.raceMgr.racers.find((r) => !r.isHuman)?.id ??
      this.raceMgr.racers[0]?.id ??
      'local';
    this.spectatingTargetId = fallbackTarget;
    this.spectatorCamMode = 'follow';
    this.freeCamPos.copy(this.camera.position);
    this.emitHud();
  }

  public startReplaySpectate(): void {
    if (this.sceneMode !== 'race' || this.replayFrames.length < 2) return;
    this.isReplayMode = true;
    this.replayPlaying = true;
    this.replayTimeSec = 0;
    if (!this.spectatingTargetId) {
      const local = this.raceMgr.racers.find((r) => r.isHuman);
      this.spectatingTargetId = local?.id ?? this.raceMgr.racers[0]?.id ?? null;
    }
    this.spectatorCamMode = 'follow';
    if (this.playerRig && !this.isSpectatingLiveRoom) {
      this.playerRig.root.visible = true;
    }
    this.applyReplayFrameAt(0, 0.016);
    this.emitHud();
  }

  public restartReplay(): void {
    if (this.replayFrames.length < 2) return;
    this.isReplayMode = true;
    this.replayTimeSec = 0;
    this.replayPlaying = true;
    if (!this.spectatingTargetId) {
      this.spectatingTargetId = this.raceMgr.racers.find((r) => r.isHuman)?.id ?? this.raceMgr.racers[0]?.id ?? null;
    }
    this.applyReplayFrameAt(0, 0.016);
    this.emitHud();
  }

  public toggleReplayPlay(): void {
    if (!this.isReplayMode || this.replayFrames.length < 2) return;
    const duration = this.replayFrames[this.replayFrames.length - 1].t;
    if (!this.replayPlaying && this.replayTimeSec >= duration - 0.05) {
      this.replayTimeSec = 0;
    }
    this.replayPlaying = !this.replayPlaying;
    this.emitHud();
  }

  public seekReplay(timeSec: number): void {
    if (this.replayFrames.length < 2) return;
    if (!this.isReplayMode) {
      this.isReplayMode = true;
      if (!this.spectatingTargetId) {
        this.spectatingTargetId = this.raceMgr.racers.find((r) => r.isHuman)?.id ?? this.raceMgr.racers[0]?.id ?? null;
      }
    }
    const duration = this.replayFrames[this.replayFrames.length - 1].t;
    this.replayTimeSec = THREE.MathUtils.clamp(timeSec, 0, duration);
    this.applyReplayFrameAt(this.replayTimeSec, 0.016);
    this.emitHud();
  }

  public setReplaySpeed(speed: 0.5 | 1 | 2): void {
    this.replaySpeed = speed;
    this.emitHud();
  }

  public setActiveGhost(selection: GhostSelection, ghostRun: GhostRunRecord | null): void {
    this.ghostSelection = selection;
    this.activeGhostRun = ghostRun;
    this.ghostDeltaSec = null;
    this.ghostTrackProgress = 0;
    if (this.sceneMode === 'race') {
      this.spawnOrUpdateGhostRig();
      this.emitHud();
    }
  }

  private spawnOrUpdateGhostRig(): void {
    if (this.ghostRig) {
      this.raceGroup.remove(this.ghostRig.root);
      this.ghostRig = null;
    }
    if (
      this.ghostSelection === 'off' ||
      !this.activeGhostRun ||
      this.activeGhostRun.samples.length < 2
    ) {
      return;
    }
    const ghostStar = SPEEDSTARS.find((s) => s.id === this.activeGhostRun!.speedstarId) ?? SPEEDSTARS[0];
    const rig = buildSpeedstarRig(ghostStar, undefined, undefined, undefined);
    const tintHex = this.ghostSelection === 'global-top' ? '#FBBF24' : '#38BDF8';
    const holoMat = new THREE.MeshStandardMaterial({
      color: tintHex,
      emissive: tintHex,
      emissiveIntensity: 0.72,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      roughness: 0.25,
      metalness: 0.15,
    });

    rig.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj === rig.shieldMesh || obj === rig.trailMesh) {
          obj.visible = false;
          return;
        }
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.material = holoMat;
      }
    });

    const s0 = this.activeGhostRun.samples[0];
    this.ghostPos.set(s0.x, s0.y, s0.z);
    this.ghostYaw = s0.yaw;
    rig.root.position.copy(this.ghostPos);
    rig.root.rotation.y = this.ghostYaw;
    this.raceGroup.add(rig.root);
    this.ghostRig = rig;
  }

  public exitPostRaceSpectate(): void {
    this.isReplayMode = false;
    this.replayPlaying = false;
    this.spectatingTargetId = null;
    this.spectatorCamMode = 'follow';
    if (this.replayFrames.length > 0) {
      const endT = this.replayFrames[this.replayFrames.length - 1].t;
      this.applyReplayFrameAt(endT, 0.016);
    }
    this.emitHud();
  }

  // Owner's Vault Engine Hooks
  public setVaultOptions(opts: {
    devFlight?: boolean;
    devInfiniteTurbo?: boolean;
    devNoCooldowns?: boolean;
  }): void {
    if (typeof opts.devFlight === 'boolean') this.movement.devFlight = opts.devFlight;
    if (typeof opts.devInfiniteTurbo === 'boolean') this.movement.devInfiniteTurbo = opts.devInfiniteTurbo;
    if (typeof opts.devNoCooldowns === 'boolean') this.movement.devNoCooldowns = opts.devNoCooldowns;
  }

  public triggerZeroPointNow(): void {
    if (this.sceneMode !== 'race') return;
    this.movement.activateZeroPoint(this.playerState, this.audio);
  }

  public teleportMap(mapId: string): void {
    if (this.sceneMode !== 'race' || !this.currentLoadout) return;
    const local = this.raceMgr.racers.find((r) => r.isHuman);
    this.startRace({
      modeId: this.currentModeDef.id,
      mapId,
      ranked: false,
      loadout: this.currentLoadout,
      username: local?.name || 'Speedstar',
      fillBots: this.aiBots.length > 0,
      championshipStage: this.raceMgr.championshipStage,
    });
  }

  public teleportToProgress(pct: number): void {
    if (this.sceneMode !== 'race' || !this.builtMap || !this.sampler) return;
    const t = THREE.MathUtils.clamp(pct, 0, 0.95);
    const pt = this.builtMap.curve.getPointAt(t);
    const tan = this.builtMap.curve.getTangentAt(t).normalize();
    this.playerState.position.copy(pt).add(new THREE.Vector3(0, 1.2, 0));
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.yaw = Math.atan2(tan.x, tan.z);
    this.playerState.trackProgress = t;
    this.playerState.lastSafePos.copy(pt);
    this.playerState.lastSafeYaw = this.playerState.yaw;
    this.spawnBurst(this.playerState.position, '#38BDF8', 12);
  }

  public spawnVaultCollectibles(): void {
    if (this.sceneMode !== 'race' || !this.builtMap) return;
    const forward = new THREE.Vector3(Math.sin(this.playerState.yaw), 0, Math.cos(this.playerState.yaw));
    const starGeo = new THREE.OctahedronGeometry(0.42, 0);
    const starMat = new THREE.MeshStandardMaterial({
      color: '#FACC15',
      emissive: '#F59E0B',
      emissiveIntensity: 1.1,
      roughness: 0.18,
      metalness: 0.85,
    });
    const orbGeo = new THREE.SphereGeometry(0.38, 12, 12);
    const orbMat = new THREE.MeshStandardMaterial({
      color: '#22D3EE',
      emissive: '#06B6D4',
      emissiveIntensity: 1.15,
      roughness: 0.12,
      metalness: 0.7,
    });
    for (let i = 1; i <= 8; i++) {
      const kind: 'star' | 'turbo' = i % 2 === 0 ? 'turbo' : 'star';
      const pos = this.playerState.position
        .clone()
        .addScaledVector(forward, 5 + i * 3.8)
        .add(new THREE.Vector3(Math.sin(i * 0.9) * 1.4, 1.0, 0));
      const mesh = new THREE.Mesh(kind === 'star' ? starGeo : orbGeo, kind === 'star' ? starMat : orbMat);
      mesh.position.copy(pos);
      this.raceGroup.add(mesh);
      this.builtMap.collectibles.push({
        id: this.builtMap.collectibles.length + 1000 + i,
        mesh,
        pos,
        kind,
        collected: false,
        respawnTimer: 0,
      });
    }
    this.audio.playStarPickup();
  }

  public finishTraining(): void {
    if (this.sceneMode !== 'race') return;
    this.raceMgr.finishTrainingNow(this.audio);
    this.triggerRaceComplete();
  }

  private buildZeroPointRigAttachments(root: THREE.Group): void {
    const mandala = new THREE.Group();
    mandala.position.y = 0.06;
    mandala.visible = false;
    const cyanMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const violetMat = new THREE.MeshBasicMaterial({
      color: '#A855F7',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(1.75, 1.92, 48), cyanMat);
    outerRing.rotation.x = -Math.PI / 2;
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.16, 36), violetMat);
    innerRing.rotation.x = -Math.PI / 2;
    const sq1 = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.4, 4), cyanMat);
    sq1.rotation.x = -Math.PI / 2;
    const sq2 = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.4, 4), violetMat);
    sq2.rotation.x = -Math.PI / 2;
    sq2.rotation.z = Math.PI / 4;
    mandala.add(outerRing, innerRing, sq1, sq2);
    root.add(mandala);
    this.zpMandala = mandala;

    const aura = new THREE.Group();
    aura.visible = false;
    for (let i = 0; i < 3; i++) {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(0.75 + i * 0.22, 0.028, 8, 32),
        i % 2 === 0 ? cyanMat : violetMat
      );
      torus.position.y = 1.05;
      torus.rotation.x = i * 0.7;
      torus.rotation.y = i * 0.9;
      aura.add(torus);
    }
    root.add(aura);
    this.zpAuraGroup = aura;
  }

  private spawnZeroPointPulse(pos: THREE.Vector3, colorHex: string, maxScale: number, maxLife: number): void {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.08, 10, 44),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.55, 0));
    this.raceGroup.add(mesh);
    this.zpPulses.push({ mesh, life: maxLife, maxLife, maxScale });
  }

  private spawnRealityCrack(pos: THREE.Vector3, yaw: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.45 ? '#38BDF8' : '#C084FC',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 2.0), mat);
    crack.position
      .copy(pos)
      .add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 1.1));
    crack.rotation.set(
      (Math.random() - 0.5) * 0.8,
      yaw + (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 1.4
    );
    this.raceGroup.add(crack);
    this.zpCracks.push({ mesh: crack, life: 2.3, maxLife: 2.3 });
  }

  private spawnPhantomEcho(pos: THREE.Vector3, yaw: number): void {
    const echo = buildPhantomEcho(this.currentSpeedstar);
    echo.position.copy(pos);
    echo.rotation.y = yaw;
    this.raceGroup.add(echo);
    this.zpEchoes.push({ mesh: echo, life: 0.6, maxLife: 0.6 });
  }

  private clearRaceObjects(): void {
    this.aiBots = [];
    this.remoteRacers.clear();
    this.ghostRig = null;
    this.ghostDeltaSec = null;
    this.playerRig = null;
    this.playerVehicleRig = null;
    this.zpMandala = null;
    this.zpAuraGroup = null;
    this.zpPulses = [];
    this.zpCracks = [];
    this.zpEchoes = [];
    this.particles = [];
    this.zpPointLight.intensity = 0;
    while (this.raceGroup.children.length > 0) {
      this.raceGroup.remove(this.raceGroup.children[0]);
    }
    if (this.builtMap) {
      this.builtMap.dispose();
      this.builtMap = null;
    }
    this.sampler = null;
    this.cpMgr = null;
  }

  private spawnBurst(pos: THREE.Vector3, colorHex: string, count: number): void {
    if (this.settings.quality === 'low') return;
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
      this.raceGroup.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 6 + 2, (Math.random() - 0.5) * 9),
        life: 0.5,
        maxLife: 0.5,
      });
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTimeMs) / 1000));
      this.lastTimeMs = now;
      this.fpsEstimate = THREE.MathUtils.lerp(this.fpsEstimate, 1 / dt, 0.08);

      if (this.gradePass) {
        this.gradePass.uniforms.uTime.value = (now * 0.001) % 1000;
      }

      if (this.sceneMode === 'lobby') {
        this.updateLobby(dt);
      } else {
        this.updateRace(dt);
      }

      if (!this.isSoftwareGl && this.composer && this.settings.quality !== 'low') {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateLobby(dt: number): void {
    this.lobbyOceanUniform.value += dt;
    if (this.lobbyWaterNormal) {
      this.lobbyWaterNormal.offset.x = (this.lobbyWaterNormal.offset.x + dt * 0.035) % 1;
      this.lobbyWaterNormal.offset.y = (this.lobbyWaterNormal.offset.y + dt * 0.022) % 1;
    }

    if (!this.lobbyDragging) {
      this.lobbyOrbitYaw += dt * 0.2;
    }
    const radius = 5.1;
    const cx = Math.sin(this.lobbyOrbitYaw) * Math.cos(this.lobbyOrbitPitch) * radius;
    const cy = 1.35 + Math.sin(this.lobbyOrbitPitch) * radius * 0.5;
    const cz = Math.cos(this.lobbyOrbitYaw) * Math.cos(this.lobbyOrbitPitch) * radius;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(0, 1.02, 0);

    if (this.lobbyRig) {
      const spd = this.lobbyPreviewAnim === 'turbo' ? 32 : this.lobbyPreviewAnim === 'sprint' ? 22 : 0;
      this.lobbyAnimator.update(
        this.lobbyRig,
        dt,
        this.lobbyPreviewAnim,
        spd,
        0,
        this.lobbyPreviewAnim === 'turbo',
        false,
        false
      );
    }
    if (this.lobbyVehicleRig) {
      updateVehicleRig(this.lobbyVehicleRig, dt, 0, 0, false, false, false);
    }
  }

  private updateRace(dt: number): void {
    if (!this.builtMap || !this.sampler || !this.cpMgr || !this.playerRig) return;

    const input = this.controller.consumeSnapshot();
    const localProgress = this.raceMgr.racers.find((r) => r.isHuman);
    const zp = this.movement.zeroPoint;
    const worldDt = dt * zp.worldTimeScale;

    const focusPos = this.spectatorCamMode === 'free' ? this.freeCamPos : this.playerState.position;

    // Animate Obstacles, Collectibles, Ocean Water & Weather using Time Fracture worldDt
    const elapsed = this.raceMgr.raceTimeSec;
    for (const obs of this.builtMap.obstacles) {
      if (obs.oscillateAmp > 0) {
        const off = Math.sin(elapsed * obs.oscillateSpeed + obs.phase) * obs.oscillateAmp;
        obs.mesh.position.copy(obs.basePos).addScaledVector(obs.rightVec, off);
      }
    }
    for (const col of this.builtMap.collectibles) {
      if (col.collected) {
        col.respawnTimer -= worldDt;
        if (col.respawnTimer <= 0) {
          col.collected = false;
          col.mesh.visible = true;
        }
      } else {
        col.mesh.rotation.y += worldDt * 2.4;
      }
    }
    for (const prop of this.builtMap.animatedProps) {
      prop.rotation.z += worldDt * 0.5;
      prop.rotation.y += worldDt * 0.2;
    }

    const weatherClock = this.isReplayMode
      ? this.replayTimeSec
      : this.raceMgr.phase === 'racing'
      ? this.raceMgr.raceTimeSec
      : 0;
    const weatherDt = this.isReplayMode && !this.replayPlaying ? 0 : worldDt;
    this.weatherSys.update(weatherDt, weatherClock);
    const transition = this.weatherSys.consumeTransition();
    if (!this.isReplayMode && transition && this.raceMgr.phase === 'racing') {
      const tone =
        transition.condition === 'clear'
          ? 'amber'
          : transition.condition === 'rain' || transition.condition === 'snow' || transition.condition === 'starfield'
          ? 'cyan'
          : 'rose';
      this.raceMgr.pushEvent(`Weather Shift: ${transition.label}`, tone);
      this.audio.playWeatherCue(transition.condition);
    }
    const weatherSnap = this.weatherSys.getSnapshot();
    this.builtMap.updateAtmosphere(worldDt, focusPos, weatherSnap);

    // Update burst particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.raceGroup.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.setScalar(p.life / p.maxLife);
      }
    }

    // Update Zero Point Pulses, Reality Trail Cracks, and Phantom Echoes
    for (let i = this.zpPulses.length - 1; i >= 0; i--) {
      const pulse = this.zpPulses[i];
      pulse.life -= dt;
      if (pulse.life <= 0) {
        this.raceGroup.remove(pulse.mesh);
        this.zpPulses.splice(i, 1);
      } else {
        const t = 1 - pulse.life / pulse.maxLife;
        pulse.mesh.scale.setScalar(1 + t * pulse.maxScale);
        (pulse.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      }
    }
    for (let i = this.zpCracks.length - 1; i >= 0; i--) {
      const c = this.zpCracks[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.raceGroup.remove(c.mesh);
        this.zpCracks.splice(i, 1);
      } else {
        (c.mesh.material as THREE.MeshBasicMaterial).opacity = (c.life / c.maxLife) * 0.85;
      }
    }
    for (let i = this.zpEchoes.length - 1; i >= 0; i--) {
      const e = this.zpEchoes[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.raceGroup.remove(e.mesh);
        this.zpEchoes.splice(i, 1);
      } else {
        const alpha = (e.life / e.maxLife) * 0.38;
        e.mesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) {
            obj.material.opacity = alpha;
          }
        });
      }
    }

    // Replay Mode Playback vs Live Simulation
    if (this.isReplayMode && this.replayFrames.length >= 2) {
      const duration = this.replayFrames[this.replayFrames.length - 1].t;
      if (this.replayPlaying) {
        this.replayTimeSec = Math.min(duration, this.replayTimeSec + dt * this.replaySpeed);
        if (this.replayTimeSec >= duration) {
          this.replayPlaying = false;
        }
      }
      this.raceMgr.raceTimeSec = this.replayTimeSec;
      const replayAnimDt = this.replayPlaying ? dt * this.replaySpeed : 0;
      this.applyReplayFrameAt(this.replayTimeSec, replayAnimDt);
      this.zpPointLight.intensity = 0;
      if (this.gradePass) {
        this.gradePass.uniforms.uTurboIntensity.value = THREE.MathUtils.lerp(
          this.gradePass.uniforms.uTurboIntensity.value,
          0,
          Math.min(1, dt * 6)
        );
        this.gradePass.uniforms.uZeroPointIntensity.value = THREE.MathUtils.lerp(
          this.gradePass.uniforms.uZeroPointIntensity.value,
          0,
          Math.min(1, dt * 6)
        );
      }
    } else {
      // Player Movement only during racing phase and NOT live-room spectating
      if (
        !this.isSpectatingLiveRoom &&
        this.raceMgr.phase === 'racing' &&
        localProgress &&
        !localProgress.eliminated &&
        !localProgress.finished
      ) {
        this.movement.step(
          this.playerState,
          input,
          dt,
          this.currentSpeedstar,
          this.currentMapDef,
          this.builtMap,
          this.sampler,
          this.currentModeDef,
          this.audio,
          (kind, pos) => {
            if (kind === 'star') localProgress.starsCollected += 1;
            this.spawnBurst(pos, kind === 'star' ? '#FACC15' : '#22D3EE', 7);
          },
          (pos) => {
            this.camShake = Math.max(this.camShake, 0.14);
            this.spawnBurst(pos, this.currentSpeedstar.trailColor, 8);
          },
          weatherSnap
        );

        if (this.movement.lastLandingForce > 8) {
          this.playerAnimator.triggerLanding(this.movement.lastLandingForce / 20);
          this.camShake = Math.max(this.camShake, Math.min(0.24, this.movement.lastLandingForce * 0.012));
        }

        if (zp.justEnteredPhase) {
          const entered = zp.justEnteredPhase;
          zp.justEnteredPhase = null;
          if (entered === 'awaken') {
            this.camShake = 0.36;
            this.spawnZeroPointPulse(this.playerState.position, '#38BDF8', 28, 0.9);
            this.spawnBurst(this.playerState.position, '#A855F7', 16);
          } else if (entered === 'finish') {
            this.camShake = 0.28;
            this.spawnZeroPointPulse(this.playerState.position, '#FDE047', 24, 1.0);
            this.spawnZeroPointPulse(this.playerState.position, '#C084FC', 18, 0.85);
            this.spawnBurst(this.playerState.position, '#38BDF8', 22);
          }
        }

        // Surroundings dimming, weather overcast lighting/fog & dynamic PointLight during Zero Point
        const dimming = zp.phase === 'activate' || zp.phase === 'awaken' || zp.phase === 'transcend';
        const stormDim = Math.max(
          weatherSnap.rainIntensity * 0.44,
          weatherSnap.snowIntensity * 0.22,
          weatherSnap.sandIntensity * 0.35
        );
        const targetSun = dimming
          ? this.currentMapDef.sunIntensity * 0.24
          : this.currentMapDef.sunIntensity * 1.15 * (1 - stormDim);
        const targetHemi = dimming ? 0.3 : 0.88 * (1 - stormDim * 0.28);
        const targetIbl = dimming ? 0.38 : 1.0 - stormDim * 0.22;
        const targetZpLight =
          zp.phase === 'awaken'
            ? 24
            : zp.phase === 'transcend'
            ? 15
            : zp.phase === 'activate'
            ? 8
            : zp.phase === 'finish'
            ? 12
            : 0;

        this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, targetSun, Math.min(1, dt * 6));
        this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, targetHemi, Math.min(1, dt * 6));
        this.scene.environmentIntensity = THREE.MathUtils.lerp(
          this.scene.environmentIntensity,
          targetIbl,
          Math.min(1, dt * 6)
        );
        this.zpPointLight.intensity = THREE.MathUtils.lerp(this.zpPointLight.intensity, targetZpLight, Math.min(1, dt * 9));
        this.zpPointLight.position.set(
          this.playerState.position.x,
          this.playerState.position.y + 1.8,
          this.playerState.position.z
        );

        if (this.scene.fog instanceof THREE.FogExp2) {
          this.weatherFogTarget.copy(this.baseFogColor);
          if (weatherSnap.rainIntensity > 0.02) {
            this.weatherFogTarget.lerp(this.stormRainFogColor, weatherSnap.rainIntensity * 0.55);
          }
          if (weatherSnap.snowIntensity > 0.02) {
            this.weatherFogTarget.lerp(this.stormSnowFogColor, weatherSnap.snowIntensity * 0.48);
          }
          if (weatherSnap.sandIntensity > 0.02) {
            this.weatherFogTarget.lerp(this.stormSandFogColor, weatherSnap.sandIntensity * 0.6);
          }
          const fogStormMult =
            1 +
            weatherSnap.rainIntensity * 0.65 +
            weatherSnap.snowIntensity * 0.55 +
            weatherSnap.sandIntensity * 0.78;
          const targetFogDensity = this.currentMapDef.fogDensity * 0.85 * fogStormMult;
          this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, targetFogDensity, Math.min(1, dt * 2.5));
          this.scene.fog.color.lerp(dimming ? this.zpFogColor : this.weatherFogTarget, Math.min(1, dt * 5));
        }

        if (this.zpMandala) {
          this.zpMandala.visible = zp.phase === 'activate' || zp.phase === 'awaken';
          if (this.zpMandala.visible) {
            this.zpMandala.rotation.y += dt * 2.5;
            const s = zp.phase === 'awaken' ? 1.5 : 1.05;
            this.zpMandala.scale.setScalar(s);
          }
        }
        if (this.zpAuraGroup) {
          this.zpAuraGroup.visible =
            zp.phase === 'awaken' || zp.phase === 'transcend' || zp.phase === 'finish' || zp.postGlowTimer > 0;
          if (this.zpAuraGroup.visible) {
            this.zpAuraGroup.children.forEach((child, idx) => {
              child.rotation.x += dt * (2.5 + idx);
              child.rotation.y += dt * (3.2 - idx * 0.5);
            });
          }
        }

        if (zp.phase === 'transcend' && Math.abs(this.playerState.speed) > 8) {
          this.zpCrackAcc += dt;
          this.zpEchoAcc += dt;
          if (this.zpCrackAcc >= 0.045) {
            this.zpCrackAcc = 0;
            this.spawnRealityCrack(this.playerState.position, this.playerState.yaw);
          }
          if (this.zpEchoAcc >= 0.085) {
            this.zpEchoAcc = 0;
            this.spawnPhantomEcho(this.playerState.position, this.playerState.yaw);
          }
        }

        if (
          input.gadgetPressed &&
          this.currentLoadout?.gadgetId &&
          (this.movement.devNoCooldowns || this.movement.abilitySys.gadgetCooldownLeft <= 0)
        ) {
          this.movement.abilitySys.gadgetCooldownLeft = this.movement.devNoCooldowns ? 0 : 14;
          this.audio.playAbility();
          this.movement.turboSys.addCharge(16);
          this.playerState.boostTimer = Math.max(this.playerState.boostTimer, 1.0);
          this.camShake = Math.max(this.camShake, 0.14);
          this.spawnBurst(this.playerState.position, '#EC4899', 12);
        }

        const justFinished = this.cpMgr.evaluateRacer(
          localProgress,
          this.playerState.position,
          this.playerState.trackProgress,
          true,
          this.audio
        );
        if (justFinished) {
          localProgress.finished = true;
          localProgress.finishTimeSec = this.raceMgr.raceTimeSec;
          this.spawnBurst(this.playerState.position, '#FACC15', 16);
        }
      } else if (this.raceMgr.phase === 'finished') {
        this.playerState.animState =
          this.raceMgr.getPlacement('local', this.currentModeDef.id) === 1 ? 'victory' : 'idle';
        this.playerState.speed = THREE.MathUtils.damp(this.playerState.speed, 0, 6, dt);
        this.finishCamTime += dt;
        this.zpPointLight.intensity = THREE.MathUtils.lerp(this.zpPointLight.intensity, 0, Math.min(1, dt * 6));
      }

      // Apply player transform & character/vehicle animations
      if (!this.isSpectatingLiveRoom) {
        this.playerRig.root.position.copy(this.playerState.position);
        this.playerRig.root.rotation.y = this.playerState.yaw;

        const mounted = this.movement.vehicleMgr.mounted;
        const turboOrZp = this.movement.turboSys.active || zp.phase === 'transcend';
        if (this.playerVehicleRig) {
          this.playerVehicleRig.root.visible = mounted;
          this.playerRig.bodyPivot.visible = !(mounted && this.playerVehicleEnclosed);
          if (mounted) {
            updateVehicleRig(
              this.playerVehicleRig,
              dt,
              this.playerState.speed,
              input.steer,
              input.forward < -0.1,
              input.forward > 0.1,
              turboOrZp
            );
          }
        } else {
          this.playerRig.bodyPivot.visible = true;
        }

        // Dynamic surface spray, puddle splashes & ice skid cues
        const curSurf = this.playerState.currentSurface;
        const isWetSurf = curSurf === 'puddle' || curSurf === 'water';
        if (this.iceSkidAudioCd > 0) this.iceSkidAudioCd = Math.max(0, this.iceSkidAudioCd - dt);

        if (
          this.raceMgr.phase === 'racing' &&
          this.playerState.grounded &&
          Math.abs(this.playerState.speed) > 8
        ) {
          if (isWetSurf && this.prevSurface !== curSurf) {
            this.audio.playPuddleSplash(Math.min(1.4, Math.abs(this.playerState.speed) / 22));
            this.spawnBurst(this.playerState.position, '#BAE6FD', 6);
          } else if (
            curSurf === 'ice' &&
            Math.abs(input.steer) > 0.6 &&
            Math.abs(this.playerState.speed) > 13 &&
            this.iceSkidAudioCd <= 0
          ) {
            this.iceSkidAudioCd = 0.42;
            this.audio.playIceSkid();
            this.spawnBurst(this.playerState.position, '#E0F2FE', 4);
          }
        }
        this.prevSurface = curSurf;

        if (
          this.settings.quality !== 'low' &&
          this.raceMgr.phase === 'racing' &&
          this.playerState.grounded &&
          Math.abs(this.playerState.speed) > 14
        ) {
          const wetSpray = weatherSnap.wetness > 0.32 || isWetSurf;
          const icySpray = curSurf === 'ice' && (Math.abs(input.steer) > 0.45 || this.playerState.sliding);
          const dusty = weatherSnap.sandIntensity > 0.35 || this.currentMapDef.ambience === 'lava';
          const hardSlide = this.playerState.sliding || Math.abs(input.steer) > 0.65;
          if (wetSpray || icySpray || dusty || hardSlide) {
            this.sprayAcc += dt;
            const interval = isWetSurf ? 0.035 : wetSpray ? 0.05 : 0.07;
            if (this.sprayAcc >= interval && this.particles.length < 75) {
              this.sprayAcc = 0;
              const sprayCol = wetSpray
                ? '#BAE6FD'
                : icySpray
                ? '#E0F2FE'
                : dusty
                ? '#E7C896'
                : '#CBD5E1';
              this.spawnBurst(this.playerState.position, sprayCol, isWetSurf ? 2 : 1);
            }
          }
        }

        this.playerAnimator.update(
          this.playerRig,
          dt,
          this.playerState.animState,
          this.playerState.speed,
          input.steer,
          turboOrZp,
          this.movement.abilitySys.shieldTimeLeft > 0,
          mounted,
          () =>
            this.audio.playFootstep(
              this.playerState.speed > 18,
              this.playerState.currentSurface,
              this.currentMapDef.ambience
            )
        );

        const spdRatio = Math.abs(this.playerState.speed) / this.movement.speedSys.baseTopSpeed;
        this.audio.setWeatherAudio(
          weatherSnap.rainIntensity,
          weatherSnap.snowIntensity,
          weatherSnap.sandIntensity,
          weatherSnap.wetness,
          weatherSnap.icing,
          spdRatio,
          curSurf,
          mounted,
          this.raceMgr.phase === 'racing'
        );
        this.audio.setSpeedIntensity(spdRatio, turboOrZp, mounted);

        if (this.gradePass) {
          const targetTurboGrade = this.movement.turboSys.active ? 1.0 : 0.0;
          const targetZpGrade =
            zp.phase === 'awaken' || zp.phase === 'transcend' ? 1.0 : zp.phase === 'activate' ? 0.45 : 0.0;
          this.gradePass.uniforms.uTurboIntensity.value = THREE.MathUtils.lerp(
            this.gradePass.uniforms.uTurboIntensity.value,
            targetTurboGrade,
            Math.min(1, dt * 6)
          );
          this.gradePass.uniforms.uZeroPointIntensity.value = THREE.MathUtils.lerp(
            this.gradePass.uniforms.uZeroPointIntensity.value,
            targetZpGrade,
            Math.min(1, dt * 7)
          );
        }
      }

      // Update AI Bots with Time Fracture worldDt
      this.updateBots(worldDt);

      // Update Remote Players smoothly
      this.remoteRacers.forEach((rv) => {
        rv.currentPos.lerp(rv.targetPos, Math.min(1, worldDt * 14));
        rv.currentYaw = THREE.MathUtils.lerp(rv.currentYaw, rv.targetYaw, Math.min(1, worldDt * 14));
        rv.rig.root.position.copy(rv.currentPos);
        rv.rig.root.rotation.y = rv.currentYaw;
        rv.animator.update(rv.rig, worldDt, rv.animState as never, rv.speed, 0, rv.turboActive, false, false);
      });

      // Update Semi-Transparent Ghost Hologram Runner (Time Attack / Training)
      if (this.ghostRig && this.activeGhostRun && this.activeGhostRun.samples.length >= 2 && this.raceMgr.phase === 'racing') {
        const samples = this.activeGhostRun.samples;
        const duration = Math.max(0.1, samples[samples.length - 1].t);
        const queryT =
          this.currentModeDef.id === 'training-grounds'
            ? this.raceMgr.raceTimeSec % duration
            : Math.min(duration, this.raceMgr.raceTimeSec);

        let lo = 0;
        let hi = samples.length - 1;
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1;
          if (samples[mid].t <= queryT) lo = mid;
          else hi = mid;
        }
        const sA = samples[lo];
        const sB = samples[hi];
        const span = sB.t - sA.t;
        const alpha = span > 0.0001 ? THREE.MathUtils.clamp((queryT - sA.t) / span, 0, 1) : 0;

        this.ghostPos.set(
          THREE.MathUtils.lerp(sA.x, sB.x, alpha),
          THREE.MathUtils.lerp(sA.y, sB.y, alpha),
          THREE.MathUtils.lerp(sA.z, sB.z, alpha)
        );
        this.ghostYaw = this.lerpAngle(sA.yaw, sB.yaw, alpha);
        this.ghostRig.root.position.copy(this.ghostPos);
        this.ghostRig.root.rotation.y = this.ghostYaw;

        const ghostSpeed =
          span > 0.001
            ? Math.hypot(sB.x - sA.x, sB.z - sA.z) / span
            : queryT >= duration
            ? 0
            : 28;
        this.ghostAnimator.update(
          this.ghostRig,
          worldDt,
          ghostSpeed > 23 ? 'turbo' : ghostSpeed > 2 ? 'sprint' : 'idle',
          ghostSpeed,
          0,
          ghostSpeed > 25,
          false,
          false
        );

        if (this.sampler && this.raceMgr.raceTimeSec > 0.8) {
          this.ghostTrackProgress = this.sampler.sampleClosest(this.ghostPos, this.ghostTrackProgress).progress;
          // Wrap-safe progress comparison around start gate
          const pNorm = this.playerState.trackProgress > 0.92 && this.raceMgr.raceTimeSec < 5 ? this.playerState.trackProgress - 1 : this.playerState.trackProgress;
          const gNorm = this.ghostTrackProgress > 0.92 && queryT < 5 ? this.ghostTrackProgress - 1 : this.ghostTrackProgress;
          let diff = gNorm - pNorm;
          if (diff > 0.5) diff -= 1;
          if (diff < -0.5) diff += 1;
          this.ghostDeltaSec = Number((diff * this.activeGhostRun.timeSec).toFixed(2));
        }
      }

      // RaceManager Update
      if (!this.isSpectatingLiveRoom) {
        this.raceMgr.update(
          dt,
          this.currentModeDef,
          this.playerState.position,
          this.playerState.yaw,
          this.audio,
          () => this.triggerRaceComplete()
        );

        if (this.raceMgr.phase === 'finished' && !this.raceCompleteEmitted) {
          this.triggerRaceComplete();
        }
      } else {
        this.raceMgr.raceTimeSec += dt;
      }

      // Record multi-racer Replay frames at 10Hz during active racing
      if (this.raceMgr.phase === 'racing') {
        this.replayRecordAcc += dt;
        if (this.replayRecordAcc >= 0.1 || this.replayFrames.length === 0) {
          this.replayRecordAcc = 0;
          this.captureReplayFrame();
        }
      }
    }

    // Update Camera Choreography (Intro Orbit / Dynamic Chase / Finish Orbit / Spectator / Free Cam)
    this.updateRaceCamera(dt, input.steer, input);

    // Move directional shadow frustum smoothly with focus target
    this.sunLight.position.set(focusPos.x + 38, focusPos.y + 58, focusPos.z + 28);
    this.sunLight.target.position.copy(focusPos);

    // Throttled HUD & Multiplayer Sync
    this.hudAcc += dt;
    if (this.hudAcc >= 0.06) {
      this.hudAcc = 0;
      this.emitHud();
    }

    if (!this.isSpectatingLiveRoom && this.onBroadcastFrame && this.raceMgr.phase === 'racing' && localProgress) {
      this.netAcc += dt;
      if (this.netAcc >= 0.05) {
        this.netAcc = 0;
        this.onBroadcastFrame({
          x: Number(this.playerState.position.x.toFixed(2)),
          y: Number(this.playerState.position.y.toFixed(2)),
          z: Number(this.playerState.position.z.toFixed(2)),
          yaw: Number(this.playerState.yaw.toFixed(3)),
          speed: Number(this.playerState.speed.toFixed(1)),
          animState: this.playerState.animState,
          turboActive: this.movement.turboSys.active || zp.phase === 'transcend',
          vehicleId: this.movement.vehicleMgr.mounted ? this.movement.vehicleMgr.activeVehicle?.id ?? null : null,
          checkpointIndex: localProgress.nextCheckpointIndex,
          progress: Number(localProgress.progress.toFixed(4)),
          finished: localProgress.finished,
          finishTimeSec: localProgress.finishTimeSec,
        });
      }
    }
  }

  private updateBots(dt: number): void {
    if (!this.builtMap || !this.cpMgr) return;
    if (this.raceMgr.phase !== 'racing') {
      this.aiBots.forEach((b) => {
        b.animator.update(b.rig, dt, 'idle', 0, 0, false, false, false);
      });
      return;
    }

    const len = Math.max(1, this.builtMap.totalLength);
    for (const bot of this.aiBots) {
      if (bot.progress.eliminated || bot.progress.finished) {
        bot.animator.update(bot.rig, dt, bot.progress.finished ? 'victory' : 'idle', 0, 0, false, false, false);
        continue;
      }

      bot.turboTimer -= dt;
      const turboOn = bot.turboTimer <= 0 && bot.turboTimer > -2.4;
      if (bot.turboTimer < -2.4) bot.turboTimer = 5 + Math.random() * 5;

      const curSpeed = bot.baseSpeed * (turboOn ? 1.24 : 1.0);
      bot.trackT = (bot.trackT + (curSpeed * dt) / len) % 1;
      bot.lateral = THREE.MathUtils.damp(bot.lateral, bot.targetLateral, 2.5, dt);
      if (Math.random() < dt * 0.4) {
        bot.targetLateral = (Math.random() - 0.5) * 9;
      }

      const pt = this.builtMap.curve.getPointAt(bot.trackT);
      const tan = this.builtMap.curve.getTangentAt(bot.trackT).normalize();
      _vec3B.crossVectors(tan, _camUp).normalize();

      bot.pos.copy(pt).addScaledVector(_vec3B, bot.lateral);
      bot.yaw = Math.atan2(tan.x, tan.z);
      bot.rig.root.position.copy(bot.pos);
      bot.rig.root.rotation.y = bot.yaw;

      if (this.currentModeDef.id === 'star-collector' && Math.random() < dt * 0.45) {
        bot.progress.starsCollected += 1;
      }

      const justFinished = this.cpMgr.evaluateRacer(bot.progress, bot.pos, bot.trackT, false);
      if (justFinished) {
        bot.progress.finished = true;
        bot.progress.finishTimeSec = this.raceMgr.raceTimeSec;
      }

      bot.animator.update(
        bot.rig,
        dt,
        turboOn ? 'turbo' : 'sprint',
        curSpeed,
        0,
        turboOn,
        false,
        false
      );
    }
  }

  private updateRaceCamera(dt: number, steerInput: number, input: InputSnapshot): void {
    this.camShake *= Math.exp(-dt * 9);
    const isSpectating = Boolean(this.spectatingTargetId) || this.isSpectatingLiveRoom;

    if (isSpectating && this.spectatorCamMode === 'free') {
      const moveSpeed = input.sprint ? 44 : 25;
      const sinY = Math.sin(this.freeCamYaw);
      const cosY = Math.cos(this.freeCamYaw);
      this.freeCamPos.x += (sinY * input.forward - cosY * input.steer) * moveSpeed * dt;
      this.freeCamPos.z += (cosY * input.forward + sinY * input.steer) * moveSpeed * dt;
      if (input.jumpHeld) this.freeCamPos.y += moveSpeed * 0.75 * dt;
      if (input.slideHeld) this.freeCamPos.y -= moveSpeed * 0.75 * dt;
      this.freeCamPos.y = Math.max(-20, this.freeCamPos.y);

      this.camera.position.lerp(this.freeCamPos, Math.min(1, dt * 14));
      _camLookTarget.set(
        this.camera.position.x + Math.sin(this.freeCamYaw) * Math.cos(this.freeCamPitch) * 10,
        this.camera.position.y + Math.sin(this.freeCamPitch) * 10,
        this.camera.position.z + Math.cos(this.freeCamYaw) * Math.cos(this.freeCamPitch) * 10
      );
      this.camera.lookAt(_camLookTarget);
      if (this.settings.cameraFovBoost) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 64, 7, dt);
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    let targetPos = this.playerState.position;
    let targetYaw = this.playerState.yaw;
    let targetSpeed = this.playerState.speed;
    let targetTurbo = this.isReplayMode
      ? Boolean(this.replayTargetTurboMap.get('local'))
      : this.movement.turboSys.active || this.movement.zeroPoint.phase === 'transcend';

    if (this.spectatingTargetId && this.spectatingTargetId !== 'local') {
      const bot = this.aiBots.find((b) => b.progress.id === this.spectatingTargetId);
      const rv = this.remoteRacers.get(this.spectatingTargetId);
      if (bot) {
        targetPos = bot.pos;
        targetYaw = bot.yaw;
        targetSpeed = this.isReplayMode
          ? (this.replayTargetSpeedMap.get(bot.progress.id) ?? bot.baseSpeed)
          : bot.baseSpeed;
        targetTurbo = this.isReplayMode
          ? Boolean(this.replayTargetTurboMap.get(bot.progress.id))
          : bot.turboTimer <= 0 && bot.turboTimer > -2.4;
      } else if (rv) {
        targetPos = rv.currentPos;
        targetYaw = rv.currentYaw;
        targetSpeed = rv.speed;
        targetTurbo = rv.turboActive;
      }
    }

    // 1. Cinematic Pre-Race Starting Grid Sweep (Countdown)
    if (!isSpectating && this.raceMgr.phase === 'countdown') {
      const raw = THREE.MathUtils.clamp(1 - this.raceMgr.countdownTimer / 3.5, 0, 1);
      const ease = raw * raw * (3 - 2 * raw);
      const sweepAngle = targetYaw + THREE.MathUtils.lerp(0.68, Math.PI, ease);
      const sweepDist = THREE.MathUtils.lerp(4.2, 6.8, ease);
      const sweepHeight = THREE.MathUtils.lerp(1.55, 2.95, ease);

      _camDesired.set(
        targetPos.x + Math.sin(sweepAngle) * sweepDist,
        targetPos.y + sweepHeight,
        targetPos.z + Math.cos(sweepAngle) * sweepDist
      );
      this.camera.position.lerp(_camDesired, Math.min(1, dt * 8));
      _camLookTarget.set(
        targetPos.x + Math.sin(targetYaw) * ease * 3.5,
        targetPos.y + 1.25,
        targetPos.z + Math.cos(targetYaw) * ease * 3.5
      );
      this.camera.lookAt(_camLookTarget);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54 + ease * 6, 6, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    // 2. Dramatic Victory Hero Orbit (Finish Line Celebration)
    if (!isSpectating && this.raceMgr.phase === 'finished') {
      const orbitAngle = targetYaw + 0.55 + this.finishCamTime * 0.45;
      _camDesired.set(
        targetPos.x + Math.sin(orbitAngle) * 4.5,
        targetPos.y + 1.85,
        targetPos.z + Math.cos(orbitAngle) * 4.5
      );
      this.camera.position.lerp(_camDesired, Math.min(1, dt * 5));
      _camLookTarget.set(targetPos.x, targetPos.y + 1.15, targetPos.z);
      this.camera.lookAt(_camLookTarget);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 50, 5, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    // 3. Dynamic High-Speed Chase Camera (with subtle jump lag + impact micro-shake)
    const zpPhase = this.movement.zeroPoint.phase;
    const speedRatio = Math.min(1.6, Math.abs(targetSpeed) / 26);
    const distBack =
      zpPhase === 'transcend'
        ? 9.2
        : zpPhase === 'awaken'
        ? 7.2
        : targetTurbo
        ? 8.3
        : 6.4 + speedRatio * 1.15;
    const heightUp =
      zpPhase === 'activate' ? 2.2 : this.movement.vehicleMgr.mounted ? 3.2 : 2.85;

    const yDamp = this.playerState.grounded ? 9 : 4.5;
    this.camSmoothY = THREE.MathUtils.damp(this.camSmoothY, targetPos.y + heightUp, yDamp, dt);

    const sinY = Math.sin(targetYaw);
    const cosY = Math.cos(targetYaw);
    const shakeX = (Math.random() - 0.5) * this.camShake;
    const shakeY = (Math.random() - 0.5) * this.camShake;

    _camDesired.set(
      targetPos.x - sinY * distBack + shakeX,
      this.camSmoothY + shakeY,
      targetPos.z - cosY * distBack
    );

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camDesired.x, 10, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camDesired.y, 10, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camDesired.z, 10, dt);

    _camLookTarget.set(
      targetPos.x + sinY * 5.2,
      targetPos.y + 1.32,
      targetPos.z + cosY * 5.2
    );
    this.camera.lookAt(_camLookTarget);

    if (this.settings.cameraFovBoost) {
      const desiredFov = zpPhase === 'transcend' ? 84 : targetTurbo ? 74 : 58 + speedRatio * 9;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, desiredFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }
    this.camera.rotation.z +=
      -steerInput * (zpPhase === 'transcend' ? 0.048 : 0.022) * Math.min(1, speedRatio);
  }

  private captureReplayFrame(): void {
    const racers: ReplayRacerSample[] = [];
    const localProgress = this.raceMgr.racers.find((r) => r.isHuman);
    if (!this.isSpectatingLiveRoom && localProgress) {
      racers.push({
        id: localProgress.id,
        x: this.playerState.position.x,
        y: this.playerState.position.y,
        z: this.playerState.position.z,
        yaw: this.playerState.yaw,
        speed: this.playerState.speed,
        animState: this.playerState.animState,
        turboActive: this.movement.turboSys.active || this.movement.zeroPoint.phase === 'transcend',
        mountedVehicle: this.movement.vehicleMgr.mounted,
        progress: localProgress.progress,
        eliminated: localProgress.eliminated,
        finished: localProgress.finished,
        starsCollected: localProgress.starsCollected,
      });
    }
    for (const bot of this.aiBots) {
      const turboOn = bot.turboTimer <= 0 && bot.turboTimer > -2.4;
      racers.push({
        id: bot.progress.id,
        x: bot.pos.x,
        y: bot.pos.y,
        z: bot.pos.z,
        yaw: bot.yaw,
        speed: bot.baseSpeed * (turboOn ? 1.24 : 1.0),
        animState: bot.progress.finished ? 'victory' : bot.progress.eliminated ? 'idle' : turboOn ? 'turbo' : 'sprint',
        turboActive: turboOn,
        mountedVehicle: false,
        progress: bot.progress.progress,
        eliminated: bot.progress.eliminated,
        finished: bot.progress.finished,
        starsCollected: bot.progress.starsCollected,
      });
    }
    for (const [rid, rv] of this.remoteRacers.entries()) {
      const rp = this.raceMgr.racers.find((r) => r.id === rid);
      racers.push({
        id: rid,
        x: rv.currentPos.x,
        y: rv.currentPos.y,
        z: rv.currentPos.z,
        yaw: rv.currentYaw,
        speed: rv.speed,
        animState: rv.animState,
        turboActive: rv.turboActive,
        mountedVehicle: false,
        progress: rp?.progress ?? 0,
        eliminated: Boolean(rp?.eliminated),
        finished: Boolean(rp?.finished),
        starsCollected: rp?.starsCollected ?? 0,
      });
    }
    this.replayFrames.push({ t: this.raceMgr.raceTimeSec, racers });
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private applyReplayFrameAt(timeSec: number, animDt: number): void {
    const frames = this.replayFrames;
    if (frames.length === 0) return;

    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t <= timeSec) lo = mid;
      else hi = mid;
    }
    const fA = frames[lo];
    const fB = frames[hi];
    const span = fB.t - fA.t;
    const alpha = span > 0.0001 ? THREE.MathUtils.clamp((timeSec - fA.t) / span, 0, 1) : 0;

    const mapB = new Map<string, ReplayRacerSample>();
    for (const r of fB.racers) mapB.set(r.id, r);

    this.replayTargetTurboMap.clear();
    this.replayTargetSpeedMap.clear();

    for (const sA of fA.racers) {
      const sB = mapB.get(sA.id) ?? sA;
      const ix = THREE.MathUtils.lerp(sA.x, sB.x, alpha);
      const iy = THREE.MathUtils.lerp(sA.y, sB.y, alpha);
      const iz = THREE.MathUtils.lerp(sA.z, sB.z, alpha);
      const iyaw = this.lerpAngle(sA.yaw, sB.yaw, alpha);
      const ispeed = THREE.MathUtils.lerp(sA.speed, sB.speed, alpha);
      const iprog = THREE.MathUtils.lerp(sA.progress, sB.progress, alpha);

      this.replayTargetTurboMap.set(sA.id, sA.turboActive);
      this.replayTargetSpeedMap.set(sA.id, ispeed);

      const racerProg = this.raceMgr.racers.find((r) => r.id === sA.id);
      if (racerProg) {
        racerProg.progress = iprog;
        racerProg.eliminated = sA.eliminated;
        racerProg.finished = sA.finished;
        racerProg.starsCollected = sA.starsCollected;
      }

      if (sA.id === 'local' && this.playerRig) {
        this.playerState.position.set(ix, iy, iz);
        this.playerState.yaw = iyaw;
        this.playerState.speed = ispeed;
        this.playerState.animState = sA.animState as PlayerPhysicsState['animState'];
        this.playerRig.root.position.set(ix, iy, iz);
        this.playerRig.root.rotation.y = iyaw;

        if (this.playerVehicleRig) {
          this.playerVehicleRig.root.visible = sA.mountedVehicle;
          this.playerRig.bodyPivot.visible = !(sA.mountedVehicle && this.playerVehicleEnclosed);
          if (sA.mountedVehicle) {
            updateVehicleRig(this.playerVehicleRig, animDt, ispeed, 0, false, ispeed > 2, sA.turboActive);
          }
        } else {
          this.playerRig.bodyPivot.visible = true;
        }
        this.playerAnimator.update(
          this.playerRig,
          animDt,
          sA.animState as never,
          ispeed,
          0,
          sA.turboActive,
          false,
          sA.mountedVehicle
        );
        continue;
      }

      const bot = this.aiBots.find((b) => b.progress.id === sA.id);
      if (bot) {
        bot.pos.set(ix, iy, iz);
        bot.yaw = iyaw;
        bot.rig.root.position.set(ix, iy, iz);
        bot.rig.root.rotation.y = iyaw;
        bot.animator.update(bot.rig, animDt, sA.animState as never, ispeed, 0, sA.turboActive, false, false);
        continue;
      }

      const rv = this.remoteRacers.get(sA.id);
      if (rv) {
        rv.currentPos.set(ix, iy, iz);
        rv.currentYaw = iyaw;
        rv.speed = ispeed;
        rv.animState = sA.animState;
        rv.turboActive = sA.turboActive;
        rv.rig.root.position.set(ix, iy, iz);
        rv.rig.root.rotation.y = iyaw;
        rv.animator.update(rv.rig, animDt, sA.animState as never, ispeed, 0, sA.turboActive, false, false);
      }
    }
  }

  private triggerRaceComplete(): void {
    if (this.raceCompleteEmitted || this.isSpectatingLiveRoom) return;
    this.raceCompleteEmitted = true;
    this.captureReplayFrame();
    const local = this.raceMgr.racers.find((r) => r.isHuman);
    const placement = this.raceMgr.getPlacement('local', this.currentModeDef.id);
    const standings = this.raceMgr.getSortedStandings(this.currentModeDef.id);

    this.onRaceComplete({
      modeId: this.currentModeDef.id,
      mapId: this.currentMapDef.id,
      placement,
      totalRacers: this.raceMgr.racers.length,
      finishTimeSec: local?.finishTimeSec ?? this.raceMgr.raceTimeSec,
      starsCollected: local?.starsCollected ?? 0,
      turboUsedCount: this.movement.turboSys.activations,
      eliminated: Boolean(local?.eliminated),
      standings: standings.map((s) => ({ ...s })),
      teamScores: this.raceMgr.getTeamScores(this.currentModeDef.id),
      ghostSamples: this.raceMgr.ghostSamples,
    });
  }

  private emitHud(): void {
    const local = this.raceMgr.racers.find((r) => r.isHuman);
    const standings = this.raceMgr.getSortedStandings(this.currentModeDef.id);
    const placement = local ? this.raceMgr.getPlacement('local', this.currentModeDef.id) : 1;
    const remaining = this.raceMgr.racers.filter((r) => !r.eliminated).length;

    let objective = `Checkpoints ${local?.nextCheckpointIndex ?? 0} / ${this.cpMgr?.total ?? 10}`;
    if (this.isSpectatingLiveRoom) {
      objective = `Live Broadcast · Room ${this.spectateRoomCode ?? ''}`;
    } else if (this.currentModeDef.id === 'star-collector') {
      const left = Math.max(0, Math.ceil(this.currentModeDef.roundDurationSec - this.raceMgr.raceTimeSec));
      objective = `Stars: ${local?.starsCollected ?? 0} · ${left}s left`;
    } else if (this.currentModeDef.id === 'speed-royale') {
      objective = `Elimination Stage ${this.raceMgr.eliminationStage + 1} · ${remaining} Alive`;
    } else if (this.currentModeDef.id === 'last-runner-standing') {
      objective = `Storm Surge: ${Math.max(0, Math.round(this.raceMgr.stormSafeProgress * 100))}% · ${remaining} Alive`;
    } else if (this.currentModeDef.id === 'training-grounds') {
      objective = 'Free Practice · Complete anytime for 5,000 SC';
    }

    const specActive = Boolean(this.spectatingTargetId) || this.isSpectatingLiveRoom || this.isReplayMode;
    const specRacer = this.spectatingTargetId
      ? this.raceMgr.racers.find((r) => r.id === this.spectatingTargetId)
      : undefined;
    const specRemote = this.spectatingTargetId ? this.remoteRacers.get(this.spectatingTargetId) : undefined;
    const specBot = this.spectatingTargetId
      ? this.aiBots.find((b) => b.progress.id === this.spectatingTargetId)
      : undefined;
    const specPlacement = specRacer ? this.raceMgr.getPlacement(specRacer.id, this.currentModeDef.id) : 1;
    const specIsLocal = specRacer?.isHuman ?? this.spectatingTargetId === 'local';
    const specRawSpeed = specIsLocal
      ? this.playerState.speed
      : this.isReplayMode && this.spectatingTargetId
      ? this.replayTargetSpeedMap.get(this.spectatingTargetId) ?? specRemote?.speed ?? specBot?.baseSpeed ?? 0
      : specRemote?.speed ?? specBot?.baseSpeed ?? 0;
    const specTurbo = this.isReplayMode && this.spectatingTargetId
      ? Boolean(this.replayTargetTurboMap.get(this.spectatingTargetId))
      : specIsLocal
      ? this.movement.turboSys.active || this.movement.zeroPoint.phase === 'transcend'
      : Boolean(
          specRemote?.turboActive || (specBot && specBot.turboTimer <= 0 && specBot.turboTimer > -2.4)
        );
    const replayDuration =
      this.replayFrames.length > 0 ? this.replayFrames[this.replayFrames.length - 1].t : 0;

    const tel = this.movement.tutorialTelemetry;
    const speedKmh = Math.round(Math.abs(this.playerState.speed) * 6.8);
    const leaderId = standings.find((s) => !s.eliminated)?.id ?? null;

    const radarDots: HudSnapshot['radarDots'] = [];
    if (local) {
      radarDots.push({
        id: local.id,
        x: this.playerState.position.x,
        z: this.playerState.position.z,
        yaw: this.playerState.yaw,
        isHuman: true,
        isLeader: local.id === leaderId,
        eliminated: local.eliminated,
        team: local.team,
      });
    }
    for (const bot of this.aiBots) {
      radarDots.push({
        id: bot.progress.id,
        x: bot.pos.x,
        z: bot.pos.z,
        yaw: bot.yaw,
        isHuman: false,
        isLeader: bot.progress.id === leaderId,
        eliminated: bot.progress.eliminated,
        team: bot.progress.team,
      });
    }
    for (const [rid, rv] of this.remoteRacers.entries()) {
      const rp = this.raceMgr.racers.find((r) => r.id === rid);
      radarDots.push({
        id: rid,
        x: rv.currentPos.x,
        z: rv.currentPos.z,
        yaw: rv.currentYaw,
        isHuman: false,
        isLeader: rid === leaderId,
        eliminated: Boolean(rp?.eliminated),
        team: rp?.team ?? null,
      });
    }
    if (this.ghostRig && this.activeGhostRun && this.ghostSelection !== 'off') {
      radarDots.push({
        id: 'active-ghost',
        x: this.ghostPos.x,
        z: this.ghostPos.z,
        yaw: this.ghostYaw,
        isHuman: false,
        isLeader: false,
        isGhost: true,
        ghostTone: this.ghostSelection === 'global-top' ? 'amber' : 'cyan',
        eliminated: false,
        team: null,
      });
    }

    this.onHudUpdate({
      phase: this.raceMgr.phase,
      mapId: this.currentMapDef.id,
      countdownValue: Math.max(0, Math.ceil(this.raceMgr.countdownTimer)),
      raceTimeSec: this.raceMgr.raceTimeSec,
      placement,
      totalRacers: this.raceMgr.racers.length,
      remainingRacers: remaining,
      speedKmh,
      turboMeter: Math.round(this.movement.turboSys.meter),
      turboActive: this.movement.turboSys.active,
      checkpointCurrent: local?.nextCheckpointIndex ?? 0,
      checkpointTotal: this.cpMgr?.total ?? 10,
      starsCollected: local?.starsCollected ?? 0,
      modeId: this.currentModeDef.id,
      modeObjectiveText: objective,
      eliminated: Boolean(local?.eliminated),
      mountedVehicle: this.movement.vehicleMgr.mounted,
      zeroPointPhase: this.movement.zeroPoint.phase,
      zeroPointTimeLeft: Number(Math.max(0, this.movement.zeroPoint.timer).toFixed(1)),
      abilities: this.movement.abilitySys.equipped.map((a) => ({
        id: a.id,
        name: a.name,
        cooldownLeft: Number(a.cooldownLeft.toFixed(1)),
        maxCooldown: a.maxCooldown,
        kind: a.kind,
      })),
      gadgetCooldownLeft: Number(this.movement.abilitySys.gadgetCooldownLeft.toFixed(1)),
      standings: standings.map((s) => ({ ...s })),
      teamScores: this.raceMgr.getTeamScores(this.currentModeDef.id),
      championshipStage: this.raceMgr.championshipStage,
      spectating: {
        active: specActive,
        liveRoom: this.isSpectatingLiveRoom,
        roomCode: this.spectateRoomCode,
        cameraMode: this.spectatorCamMode,
        targetId: specRacer?.id ?? this.spectatingTargetId,
        targetName: specRacer?.name ?? 'Free Camera',
        targetSpeedstarId: specRacer?.speedstarId ?? 'vortex',
        targetSpeedKmh: Math.round(Math.abs(specRawSpeed) * 6.8),
        targetProgress: specRacer?.progress ?? 0,
        targetPlacement: specPlacement,
        targetTurbo: specTurbo,
        isReplay: this.isReplayMode,
        replayAvailable: this.replayFrames.length >= 2,
        replayPlaying: this.replayPlaying,
        replayTimeSec: this.replayTimeSec,
        replayDurationSec: replayDuration,
        replaySpeed: this.replaySpeed,
      },
      tutorialSignals: {
        ranDistance: tel.ranDistance,
        jumped: tel.jumped,
        slid: tel.slid,
        wallRunSec: tel.wallRunSec,
        railGrindSec: tel.railGrindSec,
        turboUsed: tel.turboUsed,
        abilityUsed: tel.abilityUsed,
        speedKmh,
      },
      debugInfo: {
        x: Number(this.playerState.position.x.toFixed(1)),
        y: Number(this.playerState.position.y.toFixed(1)),
        z: Number(this.playerState.position.z.toFixed(1)),
        speedMs: Number(this.playerState.speed.toFixed(1)),
        surface: this.playerState.currentSurface,
        fps: Math.round(this.fpsEstimate),
        trackProgress: Number((this.playerState.trackProgress * 100).toFixed(1)),
        state: this.playerState.animState,
      },
      radarDots,
      raceEvents: this.raceMgr.getActiveEvents(),
      weather: (() => {
        const ws = this.weatherSys.getSnapshot();
        return {
          condition: ws.condition,
          label: ws.label,
          roadConditionLabel: ws.roadConditionLabel,
          wetness: ws.wetness,
          icing: ws.icing,
        };
      })(),
      ghost:
        this.currentModeDef.id === 'time-attack' || this.currentModeDef.id === 'training-grounds'
          ? {
              active: Boolean(this.ghostRig && this.activeGhostRun && this.ghostSelection !== 'off'),
              selection: this.ghostSelection,
              label:
                this.ghostSelection === 'global-top'
                  ? 'Global Top'
                  : this.ghostSelection === 'personal-best'
                  ? 'Personal Best'
                  : 'Off',
              username: this.activeGhostRun?.username ?? '',
              speedstarId: this.activeGhostRun?.speedstarId ?? 'vortex',
              targetTimeSec: this.activeGhostRun?.timeSec ?? 0,
              deltaSec: this.ghostDeltaSec,
            }
          : null,
    });
  }

  private onResize = () => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.sceneMode === 'lobby') {
      this.lobbyDragging = true;
      this.lobbyLastPointer = { x: e.clientX, y: e.clientY };
    } else if (
      this.sceneMode === 'race' &&
      (this.spectatingTargetId || this.isSpectatingLiveRoom) &&
      this.spectatorCamMode === 'free'
    ) {
      this.freeCamDragging = true;
      this.freeCamLastPointer = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.lobbyDragging && this.sceneMode === 'lobby') {
      const dx = e.clientX - this.lobbyLastPointer.x;
      const dy = e.clientY - this.lobbyLastPointer.y;
      this.lobbyLastPointer = { x: e.clientX, y: e.clientY };
      this.lobbyOrbitYaw -= dx * 0.008;
      this.lobbyOrbitPitch = THREE.MathUtils.clamp(this.lobbyOrbitPitch + dy * 0.006, 0.02, 0.65);
    } else if (this.freeCamDragging && this.sceneMode === 'race' && this.spectatorCamMode === 'free') {
      const dx = e.clientX - this.freeCamLastPointer.x;
      const dy = e.clientY - this.freeCamLastPointer.y;
      this.freeCamLastPointer = { x: e.clientX, y: e.clientY };
      this.freeCamYaw -= dx * 0.006;
      this.freeCamPitch = THREE.MathUtils.clamp(this.freeCamPitch - dy * 0.005, -1.2, 1.2);
    }
  };

  private onPointerUp = () => {
    this.lobbyDragging = false;
    this.freeCamDragging = false;
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private attachEvents(): void {
    window.addEventListener('resize', this.onResize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.controller.detach();
    this.clearRaceObjects();
    if (this.activeSkyIbl) {
      this.activeSkyIbl.dispose();
      this.activeSkyIbl = null;
    }
    this.lobbyDisposables.forEach((d) => d.dispose());
    this.lobbyDisposables = [];
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.contactShadowTex.dispose();
    this.particleGeo.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
