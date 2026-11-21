import * as THREE from 'three';
import type { ColliderBox, InteractiveObject } from './sceneSetup';
import type { AnimState, InteractTarget, PlayerZoneStatus } from './types';
import { getZoneAtPosition } from './vocabData';

const WORLD_BOUND = 31.5;
const PLAYER_RADIUS = 0.55;
const INTERACT_DISTANCE = 4.2;

export class ThirdPersonController {
  public position = new THREE.Vector3(0, 0, 6);
  public rotY = Math.PI;
  public animState: AnimState = 'idle';
  public currentZone: PlayerZoneStatus = 'central';

  private velocityY = 0;
  private isGrounded = true;

  private camYaw = 0;
  private camPitch = 0.42;
  private camDistance = 8.8;

  private keys = new Set<string>();
  private isDragging = false;
  private dragMoved = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private domElement: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private colliders: ColliderBox[];
  private interactiveObjects: InteractiveObject[];

  private onInteract: (target: InteractTarget) => void;
  private onNearestChange: (target: InteractTarget | null) => void;
  private onZoneChange: (zone: PlayerZoneStatus) => void;
  private lastNearestKey: string | null = null;

  private readonly _forward = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _moveDir = new THREE.Vector3();
  private readonly _camTarget = new THREE.Vector3();
  private readonly _desiredCamPos = new THREE.Vector3();

  private cleanupFns: Array<() => void> = [];

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    colliders: ColliderBox[],
    interactiveObjects: InteractiveObject[],
    onInteract: (target: InteractTarget) => void,
    onNearestChange: (target: InteractTarget | null) => void,
    onZoneChange: (zone: PlayerZoneStatus) => void
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.colliders = colliders;
    this.interactiveObjects = interactiveObjects;
    this.onInteract = onInteract;
    this.onNearestChange = onNearestChange;
    this.onZoneChange = onZoneChange;

    this.raycaster.layers.set(1);
    this.bindEvents();
  }

  private isTypingInInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  private bindEvents() {
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.isTypingInInput(e.target)) return;
      this.keys.add(e.code);

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.isGrounded) {
          this.velocityY = 9.2;
          this.isGrounded = false;
        }
      } else if (e.code === 'KeyE') {
        const nearest = this.findNearestInteractive();
        if (nearest) {
          this.onInteract(nearest.target);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    const onPointerDown = (e: PointerEvent) => {
      this.isDragging = true;
      this.dragMoved = false;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (document.pointerLockElement === this.domElement) {
        this.camYaw -= e.movementX * 0.004;
        this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.003, 0.14, 1.15);
        return;
      }

      if (this.isDragging) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          this.dragMoved = true;
        }
        this.camYaw -= dx * 0.0065;
        this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.005, 0.14, 1.15);
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.dragMoved && e.button === 0) {
        this.handleCanvasClick(e);
      }
      this.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.008, 4.5, 16);
    };

    const onBlur = () => {
      this.keys.clear();
      this.isDragging = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    this.domElement.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupFns.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      this.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      this.domElement.removeEventListener('wheel', onWheel);
    });
  }

  private handleCanvasClick(e: PointerEvent) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const proxies = this.interactiveObjects.map((o) => o.proxyMesh);
    const hits = this.raycaster.intersectObjects(proxies, false);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.interactIndex as number;
      const found = this.interactiveObjects[idx];
      if (found) {
        this.onInteract(found.target);
      }
    }
  }

  public requestPointerLock() {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock?.();
    } else {
      this.domElement.requestPointerLock?.();
    }
  }

  private collidesAt(x: number, z: number): boolean {
    if (Math.abs(x) > WORLD_BOUND || Math.abs(z) > WORLD_BOUND) {
      return true;
    }
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (
        x + PLAYER_RADIUS > c.minX &&
        x - PLAYER_RADIUS < c.maxX &&
        z + PLAYER_RADIUS > c.minZ &&
        z - PLAYER_RADIUS < c.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  private findNearestInteractive(): InteractiveObject | null {
    let best: InteractiveObject | null = null;
    let bestDistSq = INTERACT_DISTANCE * INTERACT_DISTANCE;
    for (let i = 0; i < this.interactiveObjects.length; i++) {
      const obj = this.interactiveObjects[i];
      const dx = obj.group.position.x - this.position.x;
      const dz = obj.group.position.z - this.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = obj;
      }
    }
    return best;
  }

  private targetKey(t: InteractTarget | null): string | null {
    if (!t) return null;
    return t.type === 'vocab' ? `v:${t.item.id}` : `k:${t.zone}`;
  }

  public update(delta: number) {
    const dt = Math.min(delta, 0.05);

    let moveForward = 0;
    let moveRight = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    this._forward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)).normalize();
    this._right.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).normalize();

    this._moveDir.set(0, 0, 0);
    if (moveForward !== 0) this._moveDir.addScaledVector(this._forward, moveForward);
    if (moveRight !== 0) this._moveDir.addScaledVector(this._right, moveRight);

    const isMoving = this._moveDir.lengthSq() > 0.001;
    if (isMoving) {
      this._moveDir.normalize();
      const speed = 7.6;
      const nextX = this.position.x + this._moveDir.x * speed * dt;
      const nextZ = this.position.z + this._moveDir.z * speed * dt;

      if (!this.collidesAt(nextX, this.position.z)) {
        this.position.x = nextX;
      }
      if (!this.collidesAt(this.position.x, nextZ)) {
        this.position.z = nextZ;
      }

      const targetRotY = Math.atan2(-this._moveDir.x, -this._moveDir.z);
      let diff = targetRotY - this.rotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotY += diff * (1 - Math.exp(-14 * dt));
    }

    if (!this.isGrounded) {
      this.velocityY -= 24 * dt;
      this.position.y += this.velocityY * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    }

    this.animState = !this.isGrounded ? 'jump' : isMoving ? 'walk' : 'idle';

    // Track current thematic zone
    const nextZone = getZoneAtPosition(this.position.x, this.position.z);
    if (nextZone !== this.currentZone) {
      this.currentZone = nextZone;
      this.onZoneChange(nextZone);
    }

    // Update Third-Person Camera
    this._camTarget.set(this.position.x, this.position.y + 1.65, this.position.z);
    const horizDist = Math.cos(this.camPitch) * this.camDistance;
    const vertDist = Math.sin(this.camPitch) * this.camDistance;

    this._desiredCamPos.set(
      this._camTarget.x + Math.sin(this.camYaw) * horizDist,
      this._camTarget.y + vertDist,
      this._camTarget.z + Math.cos(this.camYaw) * horizDist
    );

    const camLerp = 1 - Math.exp(-14 * dt);
    this.camera.position.lerp(this._desiredCamPos, camLerp);
    this.camera.lookAt(this._camTarget);

    // Proximity check
    const nearest = this.findNearestInteractive();
    const key = this.targetKey(nearest ? nearest.target : null);
    if (key !== this.lastNearestKey) {
      this.lastNearestKey = key;
      this.onNearestChange(nearest ? nearest.target : null);
    }
  }

  public dispose() {
    this.cleanupFns.forEach((fn) => fn());
  }
}
