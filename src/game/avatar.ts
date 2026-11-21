import * as THREE from 'three';
import type { AnimState } from './types';

export interface AvatarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  torsoMat: THREE.MeshStandardMaterial;
  capMat: THREE.MeshStandardMaterial;
  setColor: (hex: string) => void;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;

function getContactShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTex) return sharedShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.52)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.22)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  sharedShadowTex = new THREE.CanvasTexture(canvas);
  sharedShadowTex.colorSpace = THREE.SRGBColorSpace;
  return sharedShadowTex;
}

export function createAvatar(shirtHex = '#2563EB'): AvatarRig {
  const root = new THREE.Group();

  // Contact shadow disc on ground (prevents floating look)
  const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.75,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.025;
  root.add(shadowPlane);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xffd1a9,
    roughness: 0.65,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.78,
    metalness: 0.05,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.45,
    metalness: 0.1,
  });
  const torsoMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shirtHex),
    roughness: 0.6,
    metalness: 0.08,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shirtHex).offsetHSL(0, -0.05, -0.1),
    roughness: 0.55,
    metalness: 0.12,
  });
  const darkDetailMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.1,
  });

  // Helper to build a leg pivoted at hip (y = 0.72)
  const buildLeg = (xOffset: number): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.72, 0);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.56, 0.34), pantsMat);
    upper.position.y = -0.28;
    upper.castShadow = true;
    upper.receiveShadow = true;
    legPivot.add(upper);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.42), shoeMat);
    shoe.position.set(0, -0.64, 0.04);
    shoe.castShadow = true;
    legPivot.add(shoe);

    return legPivot;
  };

  const leftLeg = buildLeg(-0.2);
  const rightLeg = buildLeg(0.2);
  bodyGroup.add(leftLeg, rightLeg);

  // Torso (centered around y = 1.12)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.78, 0.44), torsoMat);
  torso.position.y = 1.11;
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // Backpack accent on back (-Z is forward, so +Z is back)
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.52, 0.2), capMat);
  backpack.position.set(0, 1.12, 0.3);
  backpack.castShadow = true;
  bodyGroup.add(backpack);

  // Collar accent
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.46), shoeMat);
  collar.position.set(0, 1.48, 0);
  bodyGroup.add(collar);

  // Helper to build an arm pivoted at shoulder (y = 1.42)
  const buildArm = (xOffset: number): THREE.Group => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 1.42, 0);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.46, 0.28), torsoMat);
    sleeve.position.y = -0.22;
    sleeve.castShadow = true;
    armPivot.add(sleeve);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), skinMat);
    hand.position.y = -0.54;
    hand.castShadow = true;
    armPivot.add(hand);

    return armPivot;
  };

  const leftArm = buildArm(-0.56);
  const rightArm = buildArm(0.56);
  bodyGroup.add(leftArm, rightArm);

  // Head Group (y = 1.8)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.54, 0);
  bodyGroup.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.58), skinMat);
  headMesh.position.y = 0.29;
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // Eyes (facing -Z forward)
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), darkDetailMat);
  leftEye.position.set(-0.13, 0.34, -0.295);
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), darkDetailMat);
  rightEye.position.set(0.13, 0.34, -0.295);
  headGroup.add(leftEye, rightEye);

  // Cheerful smile bar
  const smile = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.04), darkDetailMat);
  smile.position.set(0, 0.17, -0.295);
  headGroup.add(smile);

  // Cap crown + visor
  const capCrown = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.62), capMat);
  capCrown.position.set(0, 0.6, 0.01);
  capCrown.castShadow = true;
  headGroup.add(capCrown);

  const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.26), capMat);
  capVisor.position.set(0, 0.54, -0.35);
  capVisor.castShadow = true;
  headGroup.add(capVisor);

  const setColor = (hex: string) => {
    const base = new THREE.Color(hex);
    torsoMat.color.copy(base);
    capMat.color.copy(base).offsetHSL(0, -0.04, -0.1);
  };

  return {
    root,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    torsoMat,
    capMat,
    setColor,
  };
}

export function animateAvatar(
  rig: AvatarRig,
  animState: AnimState,
  elapsed: number,
  delta: number
) {
  const dampRate = 14;
  if (animState === 'walk') {
    const swing = Math.sin(elapsed * 11) * 0.68;
    rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, swing, dampRate, delta);
    rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, -swing, dampRate, delta);
    rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, -swing * 0.85, dampRate, delta);
    rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, swing * 0.85, dampRate, delta);
    rig.bodyGroup.position.y = Math.abs(Math.sin(elapsed * 11)) * 0.06;
    rig.headGroup.rotation.z = THREE.MathUtils.damp(rig.headGroup.rotation.z, Math.sin(elapsed * 5.5) * 0.04, dampRate, delta);
  } else if (animState === 'jump') {
    rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0.45, dampRate, delta);
    rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, -0.35, dampRate, delta);
    rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, -0.9, dampRate, delta);
    rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, -0.9, dampRate, delta);
    rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, 0, dampRate, delta);
  } else {
    // Idle gentle breathing
    rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0, dampRate, delta);
    rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, 0, dampRate, delta);
    rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, Math.sin(elapsed * 2) * 0.04, dampRate, delta);
    rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, -Math.sin(elapsed * 2) * 0.04, dampRate, delta);
    rig.bodyGroup.position.y = Math.sin(elapsed * 2.5) * 0.02;
    rig.headGroup.rotation.z = THREE.MathUtils.damp(rig.headGroup.rotation.z, 0, dampRate, delta);
  }
}
