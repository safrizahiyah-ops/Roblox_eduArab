import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { InteractTarget, QuizKioskTarget, VocabItem } from './types';
import { QUIZ_KIOSKS, VOCAB_ITEMS } from './vocabData';

export interface ColliderBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface InteractiveObject {
  target: InteractTarget;
  group: THREE.Group;
  proxyMesh: THREE.Mesh;
  beacon: THREE.Mesh;
  ring: THREE.Mesh;
  baseBeaconY: number;
}

export interface BuiltWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  isSoftwareGl: boolean;
  colliders: ColliderBox[];
  interactiveObjects: InteractiveObject[];
  dispose: () => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function makeGrassTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#65b741';
  ctx.fillRect(0, 0, 256, 256);

  const colors = ['#59a838', '#72c44d', '#5eb03c'];
  for (let i = 0; i < 64; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect((i * 37) % 256, (i * 71) % 256, 22, 22);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeCobbleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 256, 256);

  const tiles = 4;
  const size = 256 / tiles;
  for (let r = 0; r < tiles; r++) {
    for (let c = 0; c < tiles; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#cbd5e1';
      ctx.fillRect(c * size + 3, r * size + 3, size - 6, size - 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeAwningTexture(colorA: string, colorB: string, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const stripes = 8;
  const w = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fillRect(i * w, 0, w, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function makeSignTexture(title: string, arabic: string, bg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 200;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 200);

  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 488, 176);

  ctx.fillStyle = '#fef08a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px "Noto Naskh Arabic", Amiri, serif';
  ctx.fillText(arabic, 256, 86);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Outfit, sans-serif';
  ctx.fillText(title, 256, 150);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPedestal(colorHex = 0xf8fafc): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.78, metalness: 0.05 });
  const topMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45, metalness: 0.12 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.2, 1.15), stoneMat);
  base.position.y = 0.1;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const column = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.45, 0.84), topMat);
  column.position.y = 0.425;
  column.castShadow = true;
  column.receiveShadow = true;
  g.add(column);

  return g;
}

function buildVocabMesh(item: VocabItem): { group: THREE.Group; topY: number } {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.82, metalness: 0.04 });
  const lightWoodMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72, metalness: 0.05 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3, metalness: 0.75 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 });

  let topY = 1.7;

  switch (item.id) {
    // === ZONA 1: AL-MADRASAH ===
    case 'kitab': {
      group.add(createPedestal(0xeff6ff));
      const coverMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 });
      const pageMat = new THREE.MeshStandardMaterial({ color: 0xfefce8, roughness: 0.85 });
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.9), coverMat);
      b1.position.y = 0.72;
      b1.castShadow = true;
      const pages = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.84), pageMat);
      pages.position.set(0.02, 0.86, 0);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.9), coverMat);
      b2.position.y = 1.0;
      b2.castShadow = true;
      const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.42), goldMat);
      emblem.position.set(0.02, 1.05, 0);
      group.add(b1, pages, b2, emblem);
      topY = 1.5;
      break;
    }

    case 'qalam': {
      group.add(createPedestal(0xf0f9ff));
      const penGroup = new THREE.Group();
      penGroup.position.y = 1.15;
      penGroup.rotation.z = -0.35;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.95, 8),
        new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35, metalness: 0.3 })
      );
      barrel.castShadow = true;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.24, 8), goldMat);
      grip.position.y = -0.36;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 8), metalMat);
      tip.position.y = -0.62;
      tip.rotation.x = Math.PI;
      penGroup.add(barrel, grip, tip);
      group.add(penGroup);
      topY = 1.8;
      break;
    }

    case 'maktab': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.0), lightWoodMat);
      top.position.y = 0.98;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      for (const [lx, lz] of [
        [-0.72, -0.38],
        [0.72, -0.38],
        [-0.72, 0.38],
        [0.72, 0.38],
      ] as [number, number][]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.12), metalMat);
        leg.position.set(lx, 0.46, lz);
        leg.castShadow = true;
        group.add(leg);
      }
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.84), woodMat);
      drawer.position.set(0.45, 0.76, 0);
      group.add(drawer);
      topY = 1.5;
      break;
    }

    case 'kursi': {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.82), lightWoodMat);
      seat.position.y = 0.62;
      seat.castShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.72, 0.12), lightWoodMat);
      back.position.set(0, 1.04, -0.35);
      back.castShadow = true;
      group.add(seat, back);
      for (const [lx, lz] of [
        [-0.34, -0.32],
        [0.34, -0.32],
        [-0.34, 0.32],
        [0.34, 0.32],
      ] as [number, number][]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), metalMat);
        leg.position.set(lx, 0.3, lz);
        leg.castShadow = true;
        group.add(leg);
      }
      topY = 1.65;
      break;
    }

    case 'sabburah': {
      const standL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), woodMat);
      standL.position.set(-0.95, 0.95, 0);
      standL.castShadow = true;
      const standR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.14), woodMat);
      standR.position.set(0.95, 0.95, 0);
      standR.castShadow = true;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.32, 0.14), woodMat);
      frame.position.set(0, 1.55, 0);
      frame.castShadow = true;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 1.1, 0.17),
        new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.75 })
      );
      board.position.set(0, 1.55, 0);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.24), lightWoodMat);
      tray.position.set(0, 0.92, 0.12);
      group.add(standL, standR, frame, board, tray);
      topY = 2.45;
      break;
    }

    case 'haqibah': {
      group.add(createPedestal(0xeff6ff));
      const bagMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.65 });
      const pocketMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.65 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.82, 0.42), bagMat);
      body.position.y = 1.08;
      body.castShadow = true;
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.42, 0.14), pocketMat);
      pocket.position.set(0, 0.92, 0.24);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), goldMat);
      buckle.position.set(0, 1.16, 0.25);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12, Math.PI), pocketMat);
      handle.position.set(0, 1.5, 0);
      group.add(body, pocket, buckle, handle);
      topY = 1.85;
      break;
    }

    // === ZONA 2: SUQ AL-FAWAKIH ===
    case 'tuffah': {
      group.add(createPedestal(0xfef2f2));
      const apple = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.4, 1),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.38 })
      );
      apple.position.y = 1.05;
      apple.castShadow = true;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 6), woodMat);
      stem.position.y = 1.48;
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.04, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.65 })
      );
      leaf.position.set(0.14, 1.5, 0);
      leaf.rotation.z = 0.35;
      group.add(apple, stem, leaf);
      topY = 1.8;
      break;
    }

    case 'mawz': {
      group.add(createPedestal(0xfefce8));
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.36, 0.9, 0),
        new THREE.Vector3(-0.1, 1.12, 0),
        new THREE.Vector3(0.2, 1.08, 0),
        new THREE.Vector3(0.42, 0.86, 0),
      ]);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 12, 0.13, 7, false),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 })
      );
      mesh.castShadow = true;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 6), woodMat);
      tip.position.set(-0.4, 0.85, 0);
      tip.rotation.z = 2.1;
      group.add(mesh, tip);
      topY = 1.6;
      break;
    }

    case 'inab': {
      group.add(createPedestal(0xf5f3ff));
      const grapeMat = new THREE.MeshStandardMaterial({ color: 0x7e22ce, roughness: 0.35 });
      const offsets: [number, number, number][] = [
        [0, 1.32, 0],
        [-0.18, 1.24, 0.1],
        [0.18, 1.24, 0.1],
        [0, 1.24, -0.15],
        [-0.12, 1.05, 0],
        [0.12, 1.05, 0],
        [0, 0.88, 0.04],
      ];
      for (const [gx, gy, gz] of offsets) {
        const berry = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), grapeMat);
        berry.position.set(gx, gy, gz);
        berry.castShadow = true;
        group.add(berry);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 6), woodMat);
      stem.position.y = 1.5;
      group.add(stem);
      topY = 1.8;
      break;
    }

    case 'burtuqal': {
      group.add(createPedestal(0xfff7ed));
      const orange = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.4, 1),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 })
      );
      orange.position.y = 1.05;
      orange.castShadow = true;
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.04, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.65 })
      );
      leaf.position.set(0.1, 1.46, 0);
      leaf.rotation.z = 0.25;
      group.add(orange, leaf);
      topY = 1.75;
      break;
    }

    case 'bittikh': {
      group.add(createPedestal(0xf0fdf4));
      const rind = new THREE.Mesh(
        new THREE.SphereGeometry(0.44, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.55 })
      );
      rind.scale.set(1.18, 0.9, 0.9);
      rind.position.y = 1.05;
      rind.castShadow = true;
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.41, 0.035, 6, 16),
        new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.6 })
      );
      stripe.position.y = 1.05;
      stripe.rotation.y = Math.PI / 2;
      group.add(rind, stripe);
      topY = 1.75;
      break;
    }

    case 'manju': {
      group.add(createPedestal(0xfefce8));
      const mango = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
      );
      mango.scale.set(0.85, 1.25, 0.85);
      mango.position.y = 1.08;
      mango.rotation.z = -0.25;
      mango.castShadow = true;
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.04, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.65 })
      );
      leaf.position.set(0.12, 1.5, 0);
      group.add(mango, leaf);
      topY = 1.8;
      break;
    }

    // === ZONA 3: AL-BAYT ===
    case 'bab': {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.26), woodMat);
      frame.position.y = 1.2;
      frame.castShadow = true;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.28, 2.18, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.65 })
      );
      panel.position.y = 1.12;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), goldMat);
      knob.position.set(0.44, 1.05, 0.2);
      group.add(frame, panel, knob);
      topY = 2.65;
      break;
    }

    case 'nafidhah': {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 1.85, 0.26),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.78 })
      );
      wall.position.y = 1.1;
      wall.castShadow = true;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.25, 0.32), woodMat);
      frame.position.y = 1.25;
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.05, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.15, metalness: 0.25 })
      );
      glass.position.y = 1.25;
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.38), woodMat);
      crossV.position.y = 1.25;
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.38), woodMat);
      crossH.position.y = 1.25;
      group.add(wall, frame, glass, crossV, crossH);
      topY = 2.3;
      break;
    }

    case 'misbah': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.32, 8), metalMat);
      base.position.y = 0.16;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.85, 8), metalMat);
      pole.position.y = 1.2;
      pole.castShadow = true;
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.46, 0.45, 8),
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.75,
          roughness: 0.25,
        })
      );
      shade.position.y = 2.25;
      group.add(base, pole, shade);
      topY = 2.75;
      break;
    }

    case 'saah': {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.45, 0.26), woodMat);
      stand.position.y = 0.725;
      stand.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 16), goldMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.65;
      rim.castShadow = true;
      const face = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.48, 0.2, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
      );
      face.rotation.x = Math.PI / 2;
      face.position.y = 1.65;
      const hand1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.32, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
      );
      hand1.position.set(0, 1.77, 0.12);
      const hand2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.05, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x0f172a })
      );
      hand2.position.set(0.1, 1.65, 0.12);
      group.add(stand, rim, face, hand1, hand2);
      topY = 2.4;
      break;
    }

    case 'maidah': {
      const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.12, 12), lightWoodMat);
      tableTop.position.y = 0.92;
      tableTop.castShadow = true;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.85, 8), woodMat);
      pedestal.position.y = 0.43;
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.24, 0.05, 10),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
      );
      plate.position.set(0, 1.0, 0);
      group.add(tableTop, pedestal, plate);
      topY = 1.45;
      break;
    }

    case 'arikah':
    default: {
      const sofaMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.78 });
      const cushionMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.75 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.9), sofaMat);
      base.position.y = 0.32;
      base.castShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 0.24), sofaMat);
      back.position.set(0, 0.76, -0.33);
      back.castShadow = true;
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.9), cushionMat);
      armL.position.set(-0.84, 0.62, 0);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, 0.9), cushionMat);
      armR.position.set(0.84, 0.62, 0);
      group.add(base, back, armL, armR);
      topY = 1.45;
      break;
    }
  }

  return { group, topY };
}

function buildQuizKiosk(kiosk: QuizKioskTarget): { group: THREE.Group; topY: number } {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.25 });
  const accentColor =
    kiosk.zone === 'madrasah' ? 0x2563eb : kiosk.zone === 'suq' ? 0xd97706 : 0x059669;
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.24, 8), baseMat);
  plinth.position.y = 0.12;
  plinth.castShadow = true;
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.15, 0.55), baseMat);
  pillar.position.y = 0.8;
  pillar.castShadow = true;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.54, 0.14), accentMat);
  screen.position.set(0, 1.48, 0);
  screen.rotation.x = -0.35;
  group.add(plinth, pillar, screen);

  return { group, topY: 2.0 };
}

export function buildLanguageWorld(container: HTMLElement): BuiltWorld {
  const isSoftwareGl = detectSoftwareWebGL();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbeafe);
  scene.fog = new THREE.Fog(0xdbeafe, 50, 125);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 220);
  camera.position.set(0, 6, 15);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  // 3-Point Outdoor Daylight Rig
  const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x65a30d, 0.75);
  hemiLight.position.set(0, 40, 0);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.45);
  sunLight.position.set(24, 36, 22);
  sunLight.castShadow = !isSoftwareGl;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40;
  sunLight.shadow.camera.bottom = -40;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.45);
  rimLight.position.set(-22, 16, -24);
  scene.add(rimLight);

  const colliders: ColliderBox[] = [];
  const addCollider = (cx: number, cz: number, w: number, d: number) => {
    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  };

  // Terrain & Connecting Pathways
  const grassTex = makeGrassTexture(maxAnisotropy);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const cobbleTex = makeCobbleTexture(maxAnisotropy);
  const pathMat = new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.84, metalness: 0.04 });

  // Central Plaza
  const mainPlaza = new THREE.Mesh(new THREE.BoxGeometry(16, 0.06, 16), pathMat);
  mainPlaza.position.set(0, 0.03, 0);
  mainPlaza.receiveShadow = true;
  scene.add(mainPlaza);

  // Path to Suq (-X) and Madrasah (+X)
  const ewPath = new THREE.Mesh(new THREE.BoxGeometry(56, 0.05, 6.5), pathMat);
  ewPath.position.set(0, 0.025, 0);
  ewPath.receiveShadow = true;
  scene.add(ewPath);

  // Path to Al-Bayt (-Z) and South entrance
  const nsPath = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.05, 42), pathMat);
  nsPath.position.set(0, 0.025, -6);
  nsPath.receiveShadow = true;
  scene.add(nsPath);

  // Central Fountain Monument
  const fountain = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.72 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.15 });
  const fBase = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.4, 10), stoneMat);
  fBase.position.y = 0.2;
  fBase.castShadow = true;
  const fWater = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.08, 10), waterMat);
  fWater.position.y = 0.44;
  const fPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 2.2, 8), stoneMat);
  fPillar.position.y = 1.3;
  fPillar.castShadow = true;
  const fStar = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 })
  );
  fStar.position.y = 2.65;
  fountain.add(fBase, fWater, fPillar, fStar);
  scene.add(fountain);
  addCollider(0, 0, 4.8, 4.8);

  // Central Directional Signpost (Papan Penunjuk Arah)
  const guidePost = new THREE.Group();
  guidePost.position.set(3.8, 0, 3.8);
  const postPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 3.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
  );
  postPole.position.y = 1.6;
  postPole.castShadow = true;
  guidePost.add(postPole);

  const addArrowSign = (y: number, rotY: number, title: string, arabic: string, color: string) => {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.68, 0.12),
      new THREE.MeshStandardMaterial({ map: makeSignTexture(title, arabic, color), roughness: 0.5 })
    );
    board.position.y = y;
    board.rotation.y = rotY;
    board.castShadow = true;
    guidePost.add(board);
  };
  addArrowSign(2.85, 0.15, 'Al-Madrasah →', 'السَّاحَةُ الْمَدْرَسِيَّةُ', '#1e40af');
  addArrowSign(2.15, -0.15, '← Suq al-Fawakih', 'سُوقُ الْفَوَاكِهِ', '#b45309');
  addArrowSign(1.45, 0, '↑ Al-Bayt (Utara)', 'الْبَيْتُ', '#047857');
  scene.add(guidePost);
  addCollider(3.8, 3.8, 0.8, 0.8);

  // ========================
  // ZONA 1 BUILDING: AL-MADRASAH (+X)
  // ========================
  const school = new THREE.Group();
  school.position.set(22, 0, -11.5);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72 });
  const blueRoof = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65 });

  const sPlinth = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.34, 6.2), trimMat);
  sPlinth.position.y = 0.17;
  const sBody = new THREE.Mesh(new THREE.BoxGeometry(9.4, 4.2, 5.4), wallMat);
  sBody.position.y = 2.44;
  sBody.castShadow = true;
  const sRoof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 2.2, 4), blueRoof);
  sRoof.position.y = 5.65;
  sRoof.rotation.y = Math.PI / 4;
  sRoof.scale.set(1.25, 1, 0.75);
  sRoof.castShadow = true;
  const sSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.8, 1.4, 0.18),
    new THREE.MeshStandardMaterial({
      map: makeSignTexture('Zona 1: Al-Madrasah', 'السَّاحَةُ الْمَدْرَسِيَّةُ', '#1e40af'),
      roughness: 0.45,
    })
  );
  sSign.position.set(0, 3.8, 2.8);
  school.add(sPlinth, sBody, sRoof, sSign);
  scene.add(school);
  addCollider(22, -11.5, 9.8, 5.8);

  // ========================
  // ZONA 2 BUILDING: SUQ AL-FAWAKIH (-X)
  // ========================
  const buildMarketStall = (x: number, z: number, colorA: string, title: string, arabic: string) => {
    const stall = new THREE.Group();
    stall.position.set(x, 0, z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.82 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.16, 4.0), wood);
    floor.position.y = 0.08;
    stall.add(floor);
    for (const [px, pz] of [
      [-2.4, -1.6],
      [2.4, -1.6],
      [-2.4, 1.6],
      [2.4, 1.6],
    ] as [number, number][]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.2, 0.24), wood);
      post.position.set(px, 1.68, pz);
      post.castShadow = true;
      stall.add(post);
    }
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(6.0, 0.22, 4.4),
      new THREE.MeshStandardMaterial({ map: makeAwningTexture(colorA, '#fef3c7', maxAnisotropy), roughness: 0.6 })
    );
    awning.position.y = 3.32;
    awning.castShadow = true;
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 1.2, 0.16),
      new THREE.MeshStandardMaterial({ map: makeSignTexture(title, arabic, colorA), roughness: 0.5 })
    );
    sign.position.set(0, 4.05, 1.9);
    stall.add(awning, sign);
    scene.add(stall);
    addCollider(x, z, 5.6, 3.8);
  };

  buildMarketStall(-20.5, -11.5, '#d97706', 'Zona 2: Suq al-Fawakih', 'سُوقُ الْفَوَاكِهِ');
  buildMarketStall(-20.5, 11.5, '#dc2626', 'Pasar Buah Segar', 'فَوَاكِهُ طَازَجَةٌ');

  // ========================
  // ZONA 3 BUILDING: AL-BAYT (NORTH -Z)
  // ========================
  const bayt = new THREE.Group();
  bayt.position.set(0, 0, -30.5);
  const houseWall = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.78 });
  const greenRoof = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.6 });
  const hPlinth = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.32, 5.8), trimMat);
  hPlinth.position.y = 0.16;
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(10.6, 4.0, 5.0), houseWall);
  hBody.position.y = 2.32;
  hBody.castShadow = true;
  const hRoof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.3, 4), greenRoof);
  hRoof.position.y = 5.45;
  hRoof.rotation.y = Math.PI / 4;
  hRoof.scale.set(1.35, 1, 0.75);
  hRoof.castShadow = true;
  const hSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 1.3, 0.18),
    new THREE.MeshStandardMaterial({
      map: makeSignTexture('Zona 3: Al-Bayt', 'الْبَيْتُ', '#047857'),
      roughness: 0.45,
    })
  );
  hSign.position.set(0, 3.6, 2.6);
  bayt.add(hPlinth, hBody, hRoof, hSign);
  scene.add(bayt);
  addCollider(0, -30.5, 11.0, 5.4);

  // ========================
  // INSTANCED PERIMETER TREES & HILLS
  // ========================
  const treeCount = 38;
  const trunkInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.42, 1.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 }),
    treeCount
  );
  const crownInst = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.5, 2.8, 7),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }),
    treeCount
  );
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const leafPalette = [0x15803d, 0x16a34a, 0x22c55e, 0x166534];

  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2;
    const radius = 36 + (i % 3) * 5.2;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const scale = 0.88 + (i % 5) * 0.08;

    dummy.position.set(tx, 0.9 * scale, tz);
    dummy.scale.setScalar(scale);
    dummy.rotation.y = i * 1.1;
    dummy.updateMatrix();
    trunkInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(tx, 2.7 * scale, tz);
    dummy.updateMatrix();
    crownInst.setMatrixAt(i, dummy.matrix);

    tint.setHex(leafPalette[i % leafPalette.length]);
    crownInst.setColorAt(i, tint);
  }
  trunkInst.computeBoundingSphere();
  crownInst.computeBoundingSphere();
  scene.add(trunkInst, crownInst);

  // ========================
  // 18 VOCABULARY PROPS + 3 QUIZ KIOSKS
  // ========================
  const interactiveObjects: InteractiveObject[] = [];
  const beaconGeo = new THREE.OctahedronGeometry(0.22);
  const ringGeo = new THREE.RingGeometry(0.72, 0.9, 24);

  const registerInteractive = (
    target: InteractTarget,
    group: THREE.Group,
    position: [number, number, number],
    topY: number,
    isKiosk: boolean
  ) => {
    group.position.set(position[0], position[1], position[2]);

    const ringMat = new THREE.MeshBasicMaterial({
      color: isKiosk ? 0x6366f1 : 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    const beaconMat = new THREE.MeshStandardMaterial({
      color: isKiosk ? 0x818cf8 : 0xfbbf24,
      emissive: isKiosk ? 0x4f46e5 : 0xf59e0b,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.3,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    const baseBeaconY = topY + 0.35;
    beacon.position.y = baseBeaconY;
    group.add(beacon);

    const proxyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, topY + 0.9, 1.85),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxyMesh.position.y = (topY + 0.9) / 2;
    proxyMesh.layers.set(1);
    proxyMesh.userData.interactIndex = interactiveObjects.length;
    group.add(proxyMesh);

    scene.add(group);
    addCollider(position[0], position[2], 1.15, 1.15);

    interactiveObjects.push({
      target,
      group,
      proxyMesh,
      beacon,
      ring,
      baseBeaconY,
    });
  };

  for (const item of VOCAB_ITEMS) {
    const { group, topY } = buildVocabMesh(item);
    registerInteractive({ type: 'vocab', item }, group, item.position, topY, false);
  }

  for (const kiosk of QUIZ_KIOSKS) {
    const { group, topY } = buildQuizKiosk(kiosk);
    registerInteractive(kiosk, group, kiosk.position, topY, true);
  }

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  const dispose = () => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    grassTex.dispose();
    cobbleTex.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    scene,
    camera,
    renderer,
    isSoftwareGl,
    colliders,
    interactiveObjects,
    dispose,
  };
}
