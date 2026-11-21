import * as THREE from 'three';

function createCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

// Deterministic pseudo-random for crisp repeatable procedural detail
function hash2d(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2d(x: number, y: number, seed = 1337): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2d(xi, yi, seed);
  const b = hash2d(xi + 1, yi, seed);
  const c = hash2d(xi, yi + 1, seed);
  const d = hash2d(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm2d(x: number, y: number, octaves = 4, seed = 1337): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2d(x * freq, y * freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return sum / norm;
}

function heightBufferToNormalTexture(
  height: Float32Array,
  size: number,
  strength: number,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const hL = height[y * size + xm];
      const hR = height[y * size + xp];
      const hD = height[ym * size + x];
      const hU = height[yp * size + x];
      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export interface PBRTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  emissiveMap?: THREE.Texture;
  dispose: () => void;
}

export function createRoadPBR(
  baseColor: string,
  curbColor: string,
  accentColor: string,
  ambience: string,
  maxAnisotropy: number
): PBRTextureSet {
  const size = 1024;
  const [albedoCanvas, aCtx] = createCanvas(size);
  const [roughCanvas, rCtx] = createCanvas(size);
  const height = new Float32Array(size * size);

  const isWet = ambience === 'rain' || ambience === 'beach' || ambience === 'city' || ambience === 'candy';
  const isSnow = ambience === 'snow';
  const isDesert = ambience === 'desert';
  const isWoodOrSoil = ambience === 'forest';

  const baseCol = new THREE.Color(baseColor);
  if (ambience === 'candy') {
    baseCol.set('#22242C');
  } else if (ambience === 'city' || ambience === 'stadium') {
    baseCol.set('#181C24');
  } else if (ambience === 'rain') {
    baseCol.set('#11151D');
  } else if (ambience === 'beach') {
    baseCol.set('#2C2B29');
  } else if (ambience === 'snow') {
    baseCol.set('#3E4C5E');
  } else if (ambience === 'desert') {
    baseCol.set('#554638');
  } else if (ambience === 'forest') {
    baseCol.set('#2B231E');
  }

  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const grain = hash2d(x, y, 42);
      const micro = valueNoise2d(u * 64, v * 64, 19);
      const macro = fbm2d(u * 8, v * 8, 4, 101);
      const crackNoise = Math.abs(fbm2d(u * 7 + 4.2, v * 7 - 1.9, 3, 613) - 0.5);
      const isCrack = !isSnow && !isWoodOrSoil && crackNoise < 0.008 && u > 0.08 && u < 0.92;

      const puddleMask = isWet ? fbm2d(u * 4.5 + 3.1, v * 4.5 + 1.7, 3, 777) : 0;
      const puddleThreshold = ambience === 'rain' ? 0.49 : ambience === 'city' ? 0.62 : 0.66;
      const isPuddle = isWet && puddleMask > puddleThreshold && u > 0.07 && u < 0.93;
      const puddleEdge = isWet
        ? THREE.MathUtils.smoothstep(puddleMask, puddleThreshold - 0.04, puddleThreshold + 0.04)
        : 0;

      // Subtle tire-wear tracks around lane centers
      const tireDist = Math.min(
        Math.abs(u - 0.27),
        Math.abs(u - 0.41),
        Math.abs(u - 0.59),
        Math.abs(u - 0.73)
      );
      const tireWear = Math.max(0, 1 - tireDist / 0.048) * 0.16;

      const idx = (y * size + x) * 4;
      const agg = 0.84 + macro * 0.24 + (micro - 0.5) * 0.12 + (grain - 0.5) * 0.14 - tireWear;
      let r = baseCol.r * 255 * agg;
      let g = baseCol.g * 255 * agg;
      let b = baseCol.b * 255 * agg;

      if (isCrack) {
        // Dark bitumen tar repair seam
        r *= 0.42;
        g *= 0.42;
        b *= 0.44;
      }

      if (isSnow && (u < 0.14 || u > 0.86 || macro > 0.64)) {
        const snowBlend = Math.min(0.75, (macro - 0.5) * 1.4);
        r = THREE.MathUtils.lerp(r, 224, Math.max(0, snowBlend));
        g = THREE.MathUtils.lerp(g, 232, Math.max(0, snowBlend));
        b = THREE.MathUtils.lerp(b, 240, Math.max(0, snowBlend));
      } else if (isDesert && (u < 0.12 || u > 0.88)) {
        r = THREE.MathUtils.lerp(r, 186, 0.48);
        g = THREE.MathUtils.lerp(g, 152, 0.48);
        b = THREE.MathUtils.lerp(b, 108, 0.48);
      } else if (isWoodOrSoil) {
        const plank = Math.sin(v * Math.PI * 16) * 0.5 + 0.5;
        r *= 0.88 + plank * 0.2;
        g *= 0.88 + plank * 0.2;
        b *= 0.88 + plank * 0.2;
      }

      if (puddleEdge > 0) {
        // Wet asphalt deepens albedo & adds subtle sky-tint reflectance
        r = THREE.MathUtils.lerp(r, r * 0.46, puddleEdge);
        g = THREE.MathUtils.lerp(g, g * 0.48, puddleEdge);
        b = THREE.MathUtils.lerp(b, b * 0.55, puddleEdge);
      }

      aImg.data[idx] = Math.max(0, Math.min(255, r));
      aImg.data[idx + 1] = Math.max(0, Math.min(255, g));
      aImg.data[idx + 2] = Math.max(0, Math.min(255, b));
      aImg.data[idx + 3] = 255;

      const dryRough = (ambience === 'rain' ? 90 : 190) - tireWear * 195 + (grain - 0.5) * 34;
      const wetRough = 10 + grain * 6;
      const roughVal = isCrack ? 52 : THREE.MathUtils.lerp(dryRough, wetRough, puddleEdge);
      const rClamped = Math.max(8, Math.min(246, roughVal));
      rImg.data[idx] = rClamped;
      rImg.data[idx + 1] = rClamped;
      rImg.data[idx + 2] = rClamped;
      rImg.data[idx + 3] = 255;

      height[y * size + x] = isPuddle
        ? 0.28
        : isCrack
        ? 0.14
        : macro * 0.46 + micro * 0.24 + grain * 0.3;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Realistic concrete gutter/shoulder & road markings (scaled for 1024px)
  aCtx.fillStyle = '#474C56';
  aCtx.fillRect(0, 0, 44, size);
  aCtx.fillRect(size - 44, 0, 44, size);

  // Subtle painted safety curb stripes on outer edge (realistic weathered boulevard paint)
  const cCol = new THREE.Color(curbColor);
  for (let y = 0; y < size; y += 128) {
    aCtx.fillStyle =
      (y / 128) % 2 === 0
        ? `rgba(${Math.round(cCol.r * 210)},${Math.round(cCol.g * 210)},${Math.round(cCol.b * 210)},0.78)`
        : 'rgba(226,232,240,0.75)';
    aCtx.fillRect(44, y, 20, 112);
    aCtx.fillRect(size - 64, y, 20, 112);
  }

  // Crisp highway edge lines
  aCtx.fillStyle = 'rgba(241, 245, 249, 0.84)';
  aCtx.fillRect(84, 0, 10, size);
  aCtx.fillRect(size - 94, 0, 10, size);

  // Double amber/white centerline or dashed lane dividers
  const accent = new THREE.Color(accentColor);
  aCtx.fillStyle =
    ambience === 'city' || ambience === 'rain' || ambience === 'candy'
      ? 'rgba(234, 179, 8, 0.86)'
      : 'rgba(248, 250, 252, 0.8)';
  for (let y = 36; y < size; y += 128) {
    aCtx.fillRect(size * 0.5 - 6, y, 12, 64);
  }
  aCtx.fillStyle = `rgba(${Math.round(accent.r * 255)},${Math.round(accent.g * 255)},${Math.round(accent.b * 255)},0.34)`;
  aCtx.fillRect(size * 0.25, 0, 4, size);
  aCtx.fillRect(size * 0.75, 0, 4, size);

  // Raised reflective cat's-eye road studs along centerline
  for (let y = 20; y < size; y += 128) {
    aCtx.fillStyle = 'rgba(255,255,255,0.92)';
    aCtx.fillRect(size * 0.5 - 8, y, 16, 10);
    rCtx.fillStyle = 'rgb(20,20,20)';
    rCtx.fillRect(size * 0.5 - 8, y, 16, 10);
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const normalMap = heightBufferToNormalTexture(height, size, isWet ? 1.55 : 2.25, maxAnisotropy);

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

export function createConcretePBR(maxAnisotropy: number, tint = '#646B73'): PBRTextureSet {
  const size = 256;
  const [albedoCanvas, aCtx] = createCanvas(size);
  const [roughCanvas, rCtx] = createCanvas(size);
  const height = new Float32Array(size * size);
  const col = new THREE.Color(tint);

  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm2d((x / size) * 10, (y / size) * 10, 4, 211);
      const g = hash2d(x, y, 91);
      const seam = x % 64 < 2 || y % 64 < 2 ? 0.72 : 1.0;
      const idx = (y * size + x) * 4;
      const v = (0.78 + n * 0.28 + (g - 0.5) * 0.08) * seam;
      aImg.data[idx] = Math.min(255, col.r * 255 * v);
      aImg.data[idx + 1] = Math.min(255, col.g * 255 * v);
      aImg.data[idx + 2] = Math.min(255, col.b * 255 * v);
      aImg.data[idx + 3] = 255;

      const rv = Math.min(245, Math.max(130, 190 + (n - 0.5) * 45 + (g - 0.5) * 20));
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;

      height[y * size + x] = (n * 0.7 + g * 0.3) * seam;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const normalMap = heightBufferToNormalTexture(height, size, 1.8, maxAnisotropy);

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

export function createBuildingFacadePBR(ambience: string, maxAnisotropy: number): PBRTextureSet {
  const size = 512;
  const [albedoCanvas, aCtx] = createCanvas(size);
  const [roughCanvas, rCtx] = createCanvas(size);
  const [emissiveCanvas, eCtx] = createCanvas(size);
  const height = new Float32Array(size * size);

  const isNight = ambience === 'city' || ambience === 'rain' || ambience === 'stadium' || ambience === 'space';
  const frameTone = ambience === 'candy' ? '#F1F5F9' : ambience === 'desert' ? '#C2A67D' : '#262C36';

  aCtx.fillStyle = frameTone;
  aCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = 'rgb(165,165,165)';
  rCtx.fillRect(0, 0, size, size);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);

  const cols = 8;
  const rows = 16;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * cellW + 5;
      const py = row * cellH + 4;
      const pw = cellW - 10;
      const ph = cellH - 8;
      const rnd = hash2d(col, row, 503);
      const litChance = isNight ? 0.52 : 0.14;
      const isLit = rnd < litChance;

      // Glass tint & subtle interior curtain/room gradient
      const grad = aCtx.createLinearGradient(px, py, px, py + ph);
      if (isLit) {
        const warm = rnd < litChance * 0.65;
        grad.addColorStop(0, warm ? '#FFE6B0' : '#BAE6FD');
        grad.addColorStop(1, warm ? '#9A6E38' : '#3B6F99');
      } else {
        grad.addColorStop(0, '#132030');
        grad.addColorStop(1, '#1E293B');
      }
      aCtx.fillStyle = grad;
      aCtx.fillRect(px, py, pw, ph);

      // Glossy glass roughness vs matte architectural spandrel
      rCtx.fillStyle = 'rgb(22,22,22)';
      rCtx.fillRect(px, py, pw, ph);

      if (isLit) {
        const warm = rnd < litChance * 0.65;
        const eGrad = eCtx.createLinearGradient(px, py, px, py + ph);
        eGrad.addColorStop(0, warm ? '#FFD27D' : '#93C5FD');
        eGrad.addColorStop(1, warm ? '#784E1D' : '#1E3A5F');
        eCtx.fillStyle = eGrad;
        eCtx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      }
    }
  }

  // Height map: recessed glass panes vs proud mullions/spandrels
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const lx = x % cellW;
      const ly = y % cellH;
      const isPane = lx > 5 && lx < cellW - 5 && ly > 4 && ly < cellH - 4;
      height[y * size + x] = isPane ? 0.2 : 0.85 + hash2d(x, y, 8) * 0.08;
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  const normalMap = heightBufferToNormalTexture(height, size, 2.0, maxAnisotropy);

  return {
    map,
    normalMap,
    roughnessMap,
    emissiveMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      emissiveMap.dispose();
    },
  };
}

export function createTerrainPBR(ambience: string, maxAnisotropy: number): PBRTextureSet {
  const size = 512;
  const [albedoCanvas, aCtx] = createCanvas(size);
  const [roughCanvas, rCtx] = createCanvas(size);
  const height = new Float32Array(size * size);

  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  const c1 = new THREE.Color('#2E4A2C');
  const c2 = new THREE.Color('#4B5E38');
  let baseRough = 215;

  if (ambience === 'beach') {
    c1.set('#0369A1');
    c2.set('#0E7490');
    baseRough = 32;
  } else if (ambience === 'snow') {
    c1.set('#DCE6F2');
    c2.set('#94A3B8');
    baseRough = 125;
  } else if (ambience === 'lava') {
    c1.set('#1C1917');
    c2.set('#7C2D12');
    baseRough = 195;
  } else if (ambience === 'desert') {
    c1.set('#C69C6D');
    c2.set('#9B7248');
    baseRough = 225;
  } else if (ambience === 'city' || ambience === 'rain' || ambience === 'factory' || ambience === 'stadium') {
    c1.set('#1B2028');
    c2.set('#28303B');
    baseRough = ambience === 'rain' ? 75 : 185;
  } else if (ambience === 'space') {
    c1.set('#090D18');
    c2.set('#1E1B4B');
    baseRough = 175;
  } else if (ambience === 'sky') {
    c1.set('#BAE6FD');
    c2.set('#E0F2FE');
    baseRough = 160;
  } else if (ambience === 'candy') {
    c1.set('#3F624D');
    c2.set('#5C836B');
    baseRough = 195;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm2d((x / size) * 12, (y / size) * 12, 4, 313);
      const fine = hash2d(x, y, 71);
      const mix = THREE.MathUtils.clamp(n * 1.25 - 0.12, 0, 1);
      const r = THREE.MathUtils.lerp(c1.r, c2.r, mix) * 255 * (0.92 + fine * 0.14);
      const g = THREE.MathUtils.lerp(c1.g, c2.g, mix) * 255 * (0.92 + fine * 0.14);
      const b = THREE.MathUtils.lerp(c1.b, c2.b, mix) * 255 * (0.92 + fine * 0.14);
      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.min(255, r);
      aImg.data[idx + 1] = Math.min(255, g);
      aImg.data[idx + 2] = Math.min(255, b);
      aImg.data[idx + 3] = 255;

      const rv = Math.max(18, Math.min(250, baseRough + (n - 0.5) * 40 + (fine - 0.5) * 15));
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;

      height[y * size + x] = n * 0.78 + fine * 0.22;
    }
  }
  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(36, 36);
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(36, 36);
  roughnessMap.anisotropy = maxAnisotropy;

  const normalMap = heightBufferToNormalTexture(height, size, 2.2, maxAnisotropy, 36, 36);

  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

export function createWaterNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 256;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const w1 = Math.sin(u * 3 + v * 2) * 0.35;
      const w2 = Math.cos(u * 5 - v * 4) * 0.25;
      const w3 = fbm2d((x / size) * 8, (y / size) * 8, 3, 919) * 0.4;
      height[y * size + x] = 0.5 + w1 + w2 + w3;
    }
  }
  return heightBufferToNormalTexture(height, size, 1.3, maxAnisotropy, 18, 18);
}

export function createFabricNormalMap(maxAnisotropy: number): THREE.DataTexture {
  const size = 128;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = ((x % 4 < 2) !== (y % 4 < 2)) ? 0.65 : 0.35;
      const micro = hash2d(x, y, 55) * 0.12;
      height[y * size + x] = weave + micro;
    }
  }
  return heightBufferToNormalTexture(height, size, 1.1, maxAnisotropy, 6, 6);
}

export function createCarbonFiberPBR(maxAnisotropy: number): PBRTextureSet {
  const size = 128;
  const [albedoCanvas, aCtx] = createCanvas(size);
  const [roughCanvas, rCtx] = createCanvas(size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const diag = ((x + y) % 8) < 4;
      const sub = ((x - y + 128) % 8) < 4;
      const v = diag ? (sub ? 36 : 24) : (sub ? 28 : 16);
      aCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      aCtx.fillRect(x, y, 1, 1);
      const rv = diag ? 65 : 110;
      rCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
      rCtx.fillRect(x, y, 1, 1);
      height[y * size + x] = diag ? 0.7 : 0.3;
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 8);
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(8, 8);
  roughnessMap.anisotropy = maxAnisotropy;

  const normalMap = heightBufferToNormalTexture(height, size, 1.4, maxAnisotropy, 8, 8);
  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

export function createCheckerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256);
  const cell = 32;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const dark = ((x / cell) + (y / cell)) % 2 === 0;
      ctx.fillStyle = dark ? '#11151C' : '#E5E9F0';
      ctx.fillRect(x, y, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBoostPadTexture(accentColor: string, maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256);
  ctx.fillStyle = '#0D131D';
  ctx.fillRect(0, 0, 256, 256);

  // Recessed metallic housing border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let y = 58; y <= 212; y += 70) {
    ctx.beginPath();
    ctx.moveTo(46, y + 32);
    ctx.lineTo(128, y - 14);
    ctx.lineTo(210, y + 32);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128);
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPalmFrondTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size);
  ctx.clearRect(0, 0, size, size);

  // Central rachis stem running bottom -> top
  ctx.strokeStyle = '#4B6B2E';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size);
  ctx.quadraticCurveTo(size * 0.5, size * 0.45, size * 0.5, 10);
  ctx.stroke();

  // Feathered tropical palm leaflets radiating symmetrically along stem
  const pairs = 22;
  for (let i = 1; i < pairs; i++) {
    const t = i / pairs;
    const y = size * (1 - t * 0.92);
    const span = Math.sin(t * Math.PI) * 116 + 10;
    const droop = 18 * (1 - t * 0.3);
    [-1, 1].forEach((side) => {
      const grad = ctx.createLinearGradient(size * 0.5, y, size * 0.5 + side * span, y - droop);
      grad.addColorStop(0, '#224F22');
      grad.addColorStop(0.55, '#2E6E2E');
      grad.addColorStop(1, '#4C8C38');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, y + 3);
      ctx.quadraticCurveTo(size * 0.5 + side * span * 0.55, y - droop * 1.15, size * 0.5 + side * span, y - droop * 0.3);
      ctx.quadraticCurveTo(size * 0.5 + side * span * 0.5, y - droop * 0.35, size * 0.5, y - 4);
      ctx.closePath();
      ctx.fill();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createGlowPoolTexture(colorRgb = '255,214,153'): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256);
  const grad = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
  grad.addColorStop(0, `rgba(${colorRgb},0.82)`);
  grad.addColorStop(0.28, `rgba(${colorRgb},0.34)`);
  grad.addColorStop(0.65, `rgba(${colorRgb},0.09)`);
  grad.addColorStop(1, `rgba(${colorRgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkyAndIBL(
  renderer: THREE.WebGLRenderer,
  ambience: string,
  _skyHex: string,
  sunHex: string
): { background: THREE.Texture; environment: THREE.Texture; dispose: () => void } {
  const w = 2048;
  const h = 1024;
  const [canvas, ctx] = createCanvas(w, h);

  // Vice City / Next-Gen atmospheric Rayleigh + Mie sunset & twilight sky palettes
  let zenith = '#0A1E3D';
  let midSky = '#385C92';
  let horizon = '#F9A875';
  let horizonGlow = '#FCD9A8';
  let ground = '#151B24';
  let sunPos = { x: w * 0.72, y: h * 0.38 };
  let cloudOpacity = 0.45;
  let cloudLitTint = '255,212,174';
  let cloudShadowTint = '68,72,102';
  let stars = false;

  if (ambience === 'city' || ambience === 'stadium') {
    // Leonida / Vice City golden-violet dusk
    zenith = '#091124';
    midSky = '#283663';
    horizon = '#EC7A62';
    horizonGlow = '#FBBF88';
    ground = '#0B1018';
    sunPos = { x: w * 0.75, y: h * 0.43 };
    cloudOpacity = 0.42;
    cloudLitTint = '255,176,138';
    cloudShadowTint = '44,49,78';
    stars = true;
  } else if (ambience === 'rain') {
    zenith = '#0B121D';
    midSky = '#1F2C3D';
    horizon = '#485A70';
    horizonGlow = '#6B7E96';
    ground = '#0A0E14';
    sunPos = { x: w * 0.65, y: h * 0.36 };
    cloudOpacity = 0.62;
    cloudLitTint = '155,172,195';
    cloudShadowTint = '34,44,58';
  } else if (ambience === 'beach') {
    // Tropical Vice Beach late-afternoon golden sun over turquoise sea
    zenith = '#0D4B8C';
    midSky = '#3B91CC';
    horizon = '#FCE1B6';
    horizonGlow = '#FFF1D4';
    ground = '#074968';
    sunPos = { x: w * 0.7, y: h * 0.34 };
    cloudOpacity = 0.48;
    cloudLitTint = '255,248,235';
    cloudShadowTint = '106,134,168';
  } else if (ambience === 'snow') {
    zenith = '#163964';
    midSky = '#659BC7';
    horizon = '#E4EFF9';
    horizonGlow = '#FFFFFF';
    ground = '#889BB2';
    sunPos = { x: w * 0.68, y: h * 0.32 };
    cloudOpacity = 0.42;
    cloudLitTint = '248,252,255';
    cloudShadowTint = '138,158,184';
  } else if (ambience === 'lava') {
    zenith = '#12080A';
    midSky = '#43140E';
    horizon = '#EA580C';
    horizonGlow = '#FB923C';
    ground = '#1A0B08';
    sunPos = { x: w * 0.74, y: h * 0.43 };
    cloudOpacity = 0.5;
    cloudLitTint = '253,164,102';
    cloudShadowTint = '48,22,20';
  } else if (ambience === 'desert') {
    zenith = '#1D4D82';
    midSky = '#7CA4C4';
    horizon = '#F6C28B';
    horizonGlow = '#FDE5BF';
    ground = '#8D6742';
    sunPos = { x: w * 0.72, y: h * 0.31 };
    cloudOpacity = 0.26;
    cloudLitTint = '255,236,208';
    cloudShadowTint = '142,126,120';
  } else if (ambience === 'forest') {
    zenith = '#0C2925';
    midSky = '#245850';
    horizon = '#AEDAC0';
    horizonGlow = '#DCF3E2';
    ground = '#16271D';
    sunPos = { x: w * 0.7, y: h * 0.35 };
    cloudOpacity = 0.38;
    cloudLitTint = '244,252,240';
    cloudShadowTint = '68,94,88';
  } else if (ambience === 'space') {
    zenith = '#02040B';
    midSky = '#0B1126';
    horizon = '#342466';
    horizonGlow = '#6D54B5';
    ground = '#03050C';
    sunPos = { x: w * 0.72, y: h * 0.35 };
    cloudOpacity = 0.22;
    cloudLitTint = '180,165,245';
    cloudShadowTint = '26,20,56';
    stars = true;
  } else if (ambience === 'sky') {
    zenith = '#10549E';
    midSky = '#52A4E3';
    horizon = '#F5FAFF';
    horizonGlow = '#FFFFFF';
    ground = '#B2D8F5';
    sunPos = { x: w * 0.7, y: h * 0.3 };
    cloudOpacity = 0.55;
    cloudLitTint = '255,255,255';
    cloudShadowTint = '148,176,208';
  } else if (ambience === 'factory') {
    zenith = '#131720';
    midSky = '#2E3544';
    horizon = '#D4804E';
    horizonGlow = '#F0AA78';
    ground = '#16191F';
    sunPos = { x: w * 0.74, y: h * 0.42 };
    cloudOpacity = 0.48;
    cloudLitTint = '235,172,130';
    cloudShadowTint = '48,52,64';
  } else if (ambience === 'candy') {
    zenith = '#1C3F7E';
    midSky = '#8B74BA';
    horizon = '#FDB689';
    horizonGlow = '#FFE0BC';
    ground = '#263646';
    sunPos = { x: w * 0.72, y: h * 0.39 };
    cloudOpacity = 0.46;
    cloudLitTint = '255,208,186';
    cloudShadowTint = '84,74,116';
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, zenith);
  grad.addColorStop(0.28, midSky);
  grad.addColorStop(0.47, horizon);
  grad.addColorStop(0.505, horizonGlow);
  grad.addColorStop(0.535, ground);
  grad.addColorStop(1.0, ground);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (stars) {
    for (let i = 0; i < 650; i++) {
      const sx = hash2d(i, 1, 99) * w;
      const sy = hash2d(i, 2, 99) * h * 0.38;
      const sz = hash2d(i, 3, 99) > 0.88 ? 2.2 : 1.1;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + hash2d(i, 4, 99) * 0.65})`;
      ctx.fillRect(sx, sy, sz, sz);
    }
  }

  // Sculpted Cumulus Cloud Banks (dark cool undersides + bright sunlit rims)
  for (let i = 0; i < 120; i++) {
    const cx = hash2d(i, 10, 404) * w;
    const cy = h * (0.14 + hash2d(i, 11, 404) * 0.31);
    const rx = 85 + hash2d(i, 12, 404) * 210;
    const ry = 16 + hash2d(i, 13, 404) * 32;

    // Cloud belly shadow
    const shGrad = ctx.createRadialGradient(cx, cy + ry * 0.25, 4, cx, cy + ry * 0.25, rx);
    shGrad.addColorStop(0, `rgba(${cloudShadowTint},${cloudOpacity * 0.52})`);
    shGrad.addColorStop(0.6, `rgba(${cloudShadowTint},${cloudOpacity * 0.16})`);
    shGrad.addColorStop(1, `rgba(${cloudShadowTint},0)`);
    ctx.save();
    ctx.translate(cx, cy + ry * 0.22);
    ctx.scale(1, (ry * 0.85) / rx);
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sunlit upper cloud crown
    const litGrad = ctx.createRadialGradient(cx, cy - ry * 0.12, 4, cx, cy - ry * 0.12, rx * 0.92);
    litGrad.addColorStop(0, `rgba(${cloudLitTint},${cloudOpacity * 0.72})`);
    litGrad.addColorStop(0.5, `rgba(${cloudLitTint},${cloudOpacity * 0.25})`);
    litGrad.addColorStop(1, `rgba(${cloudLitTint},0)`);
    ctx.save();
    ctx.translate(cx, cy - ry * 0.1);
    ctx.scale(1, (ry * 0.75) / rx);
    ctx.fillStyle = litGrad;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Intense Solar Disk + Wide Atmospheric Mie Scattering Corona
  if (ambience !== 'rain') {
    const sCol = new THREE.Color(sunHex);
    const sRgb = `${Math.round(sCol.r * 255)},${Math.round(sCol.g * 255)},${Math.round(sCol.b * 255)}`;
    const sunGrad = ctx.createRadialGradient(sunPos.x, sunPos.y, 4, sunPos.x, sunPos.y, 380);
    sunGrad.addColorStop(0, 'rgba(255,253,246,1.0)');
    sunGrad.addColorStop(0.035, 'rgba(255,244,224,0.94)');
    sunGrad.addColorStop(0.11, `rgba(${sRgb},0.65)`);
    sunGrad.addColorStop(0.38, `rgba(${sRgb},0.22)`);
    sunGrad.addColorStop(1, `rgba(${sRgb},0)`);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);
  }

  const background = new THREE.CanvasTexture(canvas);
  background.mapping = THREE.EquirectangularReflectionMapping;
  background.colorSpace = THREE.SRGBColorSpace;
  background.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromEquirectangular(background);
  pmrem.dispose();

  return {
    background,
    environment: rt.texture,
    dispose: () => {
      background.dispose();
      rt.dispose();
    },
  };
}
