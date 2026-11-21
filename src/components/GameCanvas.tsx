import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { animateAvatar, createAvatar, type AvatarRig } from '../game/avatar';
import { MultiplayerClient, type ScoreRow } from '../game/network';
import { ThirdPersonController } from '../game/playerController';
import { buildLanguageWorld } from '../game/sceneSetup';
import type {
  AnimState,
  ChatBubbleMessage,
  CompetitiveMatchState,
  GreetingChallenge,
  InteractTarget,
  NetworkPlayer,
  PlayerZoneStatus,
  ProjectedLabel,
} from '../game/types';

interface RemoteAvatarEntry {
  rig: AvatarRig;
  targetPos: THREE.Vector3;
  targetRotY: number;
  animState: AnimState;
  data: NetworkPlayer;
}

interface GameCanvasProps {
  playerName: string;
  playerColor: string;
  discoveredIds: Set<string>;
  activeBubbles: Record<string, ChatBubbleMessage>;
  simulatedPeersEnabled: boolean;
  onInteractTarget: (target: InteractTarget) => void;
  onNearestChange: (target: InteractTarget | null) => void;
  onZoneChange: (zone: PlayerZoneStatus) => void;
  onNetworkStatus: (mode: 'websocket' | 'local-tab' | 'offline') => void;
  onRemotePlayersChange: (players: NetworkPlayer[]) => void;
  onScoresSync: (scores: ScoreRow[], localId: string) => void;
  onChatReceived: (msg: ChatBubbleMessage) => void;
  onMatchUpdate: (match: CompetitiveMatchState) => void;
  onGreetingChallenge: (challenge: GreetingChallenge) => void;
  onGreetingToast: (text: string, tone: 'success' | 'info' | 'warn') => void;
  onControllerReady: (actions: {
    sendChat: (text: string, subText?: string) => void;
    sendGreetingChallenge: (greetingId: string) => void;
    answerGreetingChallenge: (challengeId: string, replyText: string) => void;
    startCompetitiveMatch: () => void;
    submitCompetitiveAnswer: (questionId: string, optionId: string) => void;
    addObjectScore: (vocabId: string, points: number) => void;
    togglePointerLock: () => void;
  }) => void;
}

const _projVec = new THREE.Vector3();

export function GameCanvas({
  playerName,
  playerColor,
  discoveredIds,
  activeBubbles,
  simulatedPeersEnabled,
  onInteractTarget,
  onNearestChange,
  onZoneChange,
  onNetworkStatus,
  onRemotePlayersChange,
  onScoresSync,
  onChatReceived,
  onMatchUpdate,
  onGreetingChallenge,
  onGreetingToast,
  onControllerReady,
}: GameCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);
  const [contextLost, setContextLost] = useState(false);

  const callbacksRef = useRef({
    onInteractTarget,
    onNearestChange,
    onZoneChange,
    onNetworkStatus,
    onRemotePlayersChange,
    onScoresSync,
    onChatReceived,
    onMatchUpdate,
    onGreetingChallenge,
    onGreetingToast,
    onControllerReady,
  });
  callbacksRef.current = {
    onInteractTarget,
    onNearestChange,
    onZoneChange,
    onNetworkStatus,
    onRemotePlayersChange,
    onScoresSync,
    onChatReceived,
    onMatchUpdate,
    onGreetingChallenge,
    onGreetingToast,
    onControllerReady,
  };

  const stateRef = useRef({
    playerName,
    playerColor,
    discoveredIds,
    activeBubbles,
    localScore: 0,
  });
  stateRef.current.playerName = playerName;
  stateRef.current.playerColor = playerColor;
  stateRef.current.discoveredIds = discoveredIds;
  stateRef.current.activeBubbles = activeBubbles;

  const netRef = useRef<MultiplayerClient | null>(null);
  const localRigRef = useRef<AvatarRig | null>(null);

  useEffect(() => {
    localRigRef.current?.setColor(playerColor);
    netRef.current?.updateProfile(playerName, playerColor);
  }, [playerName, playerColor]);

  useEffect(() => {
    netRef.current?.setSimulatedPeersEnabled(simulatedPeersEnabled);
  }, [simulatedPeersEnabled]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const world = buildLanguageWorld(container);
    const { scene, camera, renderer, isSoftwareGl, colliders, interactiveObjects } = world;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const localRig = createAvatar(stateRef.current.playerColor);
    localRigRef.current = localRig;
    scene.add(localRig.root);

    const remoteAvatars = new Map<string, RemoteAvatarEntry>();

    const controller = new ThirdPersonController(
      camera,
      renderer.domElement,
      colliders,
      interactiveObjects,
      (target) => callbacksRef.current.onInteractTarget(target),
      (nearest) => callbacksRef.current.onNearestChange(nearest),
      (zone) => callbacksRef.current.onZoneChange(zone)
    );

    const net = new MultiplayerClient(
      stateRef.current.playerName,
      stateRef.current.playerColor,
      {
        onStatusChange: (mode) => callbacksRef.current.onNetworkStatus(mode),
        onChatMessage: (msg) => callbacksRef.current.onChatReceived(msg),
        onMatchUpdate: (match) => callbacksRef.current.onMatchUpdate(match),
        onGreetingChallenge: (challenge) => callbacksRef.current.onGreetingChallenge(challenge),
        onGreetingToast: (text, tone) => callbacksRef.current.onGreetingToast(text, tone),
        onScoresSync: (scores, localId) => {
          const me = scores.find((s) => s.id === localId);
          if (me) stateRef.current.localScore = me.score;
          callbacksRef.current.onScoresSync(scores, localId);
        },
        onPlayersSync: (players) => {
          const seenIds = new Set<string>();
          for (const p of players) {
            seenIds.add(p.id);
            const existing = remoteAvatars.get(p.id);
            if (existing) {
              existing.targetPos.set(p.x, p.y, p.z);
              existing.targetRotY = p.rotY;
              existing.animState = p.animState;
              if (existing.data.color !== p.color) {
                existing.rig.setColor(p.color);
              }
              existing.data = p;
            } else {
              const rig = createAvatar(p.color);
              rig.root.position.set(p.x, p.y, p.z);
              rig.root.rotation.y = p.rotY;
              scene.add(rig.root);
              remoteAvatars.set(p.id, {
                rig,
                targetPos: new THREE.Vector3(p.x, p.y, p.z),
                targetRotY: p.rotY,
                animState: p.animState,
                data: p,
              });
            }
          }

          for (const [id, entry] of remoteAvatars.entries()) {
            if (!seenIds.has(id)) {
              scene.remove(entry.rig.root);
              remoteAvatars.delete(id);
            }
          }

          callbacksRef.current.onRemotePlayersChange(players);
        },
      }
    );
    netRef.current = net;

    callbacksRef.current.onControllerReady({
      sendChat: (text, subText) => net.sendChat(text, subText),
      sendGreetingChallenge: (greetingId) => net.sendGreetingChallenge(greetingId),
      answerGreetingChallenge: (challengeId, replyText) =>
        net.answerGreetingChallenge(challengeId, replyText),
      startCompetitiveMatch: () => net.startCompetitiveMatch(),
      submitCompetitiveAnswer: (questionId, optionId) =>
        net.submitCompetitiveAnswer(questionId, optionId),
      addObjectScore: (vocabId, points) => net.addObjectScore(vocabId, points),
      togglePointerLock: () => controller.requestPointerLock(),
    });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lastLabelSync = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controller.update(delta);
      localRig.root.position.copy(controller.position);
      localRig.root.rotation.y = controller.rotY;
      animateAvatar(localRig, controller.animState, elapsed, delta);

      net.updateLocalTransform(
        controller.position.x,
        controller.position.y,
        controller.position.z,
        controller.rotY,
        controller.animState,
        controller.currentZone
      );

      const remoteLerp = 1 - Math.exp(-12 * Math.min(delta, 0.05));
      for (const entry of remoteAvatars.values()) {
        entry.rig.root.position.lerp(entry.targetPos, remoteLerp);
        let diff = entry.targetRotY - entry.rig.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        entry.rig.root.rotation.y += diff * remoteLerp;
        animateAvatar(entry.rig, entry.animState, elapsed, delta);
      }

      const discovered = stateRef.current.discoveredIds;
      for (let i = 0; i < interactiveObjects.length; i++) {
        const obj = interactiveObjects[i];
        obj.beacon.rotation.y = elapsed * 1.8 + i;
        obj.beacon.position.y = obj.baseBeaconY + Math.sin(elapsed * 2.6 + i) * 0.14;

        if (obj.target.type === 'vocab') {
          const isDone = discovered.has(obj.target.item.id);
          const beaconMat = obj.beacon.material as THREE.MeshStandardMaterial;
          const ringMat = obj.ring.material as THREE.MeshBasicMaterial;
          if (isDone) {
            beaconMat.color.setHex(0x10b981);
            beaconMat.emissive.setHex(0x059669);
            ringMat.color.setHex(0x10b981);
          } else {
            beaconMat.color.setHex(0xfbbf24);
            beaconMat.emissive.setHex(0xf59e0b);
            ringMat.color.setHex(0xf59e0b);
          }
        }
      }

      renderer.render(scene, camera);

      const nowMs = performance.now();
      if (nowMs - lastLabelSync > 40) {
        lastLabelSync = nowMs;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        const bubbles = stateRef.current.activeBubbles;
        const nextLabels: ProjectedLabel[] = [];

        const projectOne = (
          id: string,
          name: string,
          color: string,
          score: number,
          zone: PlayerZoneStatus,
          worldPos: THREE.Vector3,
          isSelf: boolean
        ) => {
          _projVec.set(worldPos.x, worldPos.y + 2.55, worldPos.z);
          _projVec.project(camera);
          const inFront = _projVec.z >= -1 && _projVec.z <= 1;
          const sx = ((_projVec.x + 1) / 2) * w;
          const sy = ((-_projVec.y + 1) / 2) * h;
          const bubble = bubbles[id];
          const bubbleFresh = bubble && Date.now() - bubble.timestamp < 5500;
          nextLabels.push({
            id,
            name,
            color,
            score,
            zone,
            x: sx,
            y: sy,
            visible: inFront && sx > -60 && sx < w + 60 && sy > -60 && sy < h + 60,
            bubbleText: bubbleFresh ? bubble.text : undefined,
            bubbleSubText: bubbleFresh ? bubble.subText : undefined,
            isSelf,
          });
        };

        projectOne(
          net.localId,
          stateRef.current.playerName,
          stateRef.current.playerColor,
          stateRef.current.localScore,
          controller.currentZone,
          localRig.root.position,
          true
        );

        for (const [id, entry] of remoteAvatars.entries()) {
          projectOne(
            id,
            entry.data.name,
            entry.data.color,
            entry.data.score,
            entry.data.zone,
            entry.rig.root.position,
            false
          );
        }

        setLabels(nextLabels);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controller.dispose();
      net.dispose();
      world.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Arena Kuis Bahasa Arab 3D"
      />

      {/* Projected DOM Nametags with Live Scores & Arabic Speech Bubbles */}
      <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
        {labels.map(
          (lbl) =>
            lbl.visible && (
              <div
                key={lbl.id}
                style={{
                  transform: `translate3d(${lbl.x}px, ${lbl.y}px, 0) translate(-50%, -100%)`,
                }}
                className="absolute top-0 left-0 flex flex-col items-center gap-1.5"
              >
                {lbl.bubbleText && (
                  <div
                    dir="rtl"
                    lang="ar"
                    className="max-w-[240px] rounded-xl bg-white px-3.5 py-2 text-center shadow-lg border border-slate-200"
                  >
                    <p className="font-arabic text-base font-bold text-slate-900">
                      {lbl.bubbleText}
                    </p>
                    {lbl.bubbleSubText && (
                      <p dir="ltr" className="mt-0.5 text-[11px] font-medium text-slate-500">
                        {lbl.bubbleSubText}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-1.5 rounded-md bg-slate-900/85 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                  <span
                    className="inline-block h-2 w-2 rounded-sm shrink-0"
                    style={{ backgroundColor: lbl.color }}
                  />
                  <span dir="auto" className="whitespace-nowrap">
                    {lbl.name}
                    {lbl.isSelf ? ' (Kamu)' : ''}
                  </span>
                  <span className="text-amber-300 font-bold tabular-nums">· {lbl.score}</span>
                </div>
              </div>
            )
        )}
      </div>

      {contextLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/90 text-white">
          <div className="rounded-xl bg-slate-800 p-6 text-center max-w-sm border border-slate-700">
            <h2 className="font-display text-lg font-bold">Konteks WebGL Terhenti</h2>
            <p className="mt-2 text-sm text-slate-300">
              Grafis 3D sedang dipulihkan. Jika tidak kembali otomatis, muat ulang halaman.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
