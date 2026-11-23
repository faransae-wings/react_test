import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Hint } from '../types';
import { fmtDist } from '../geo';

interface Props {
  hints: Hint[];
  claimRadius: number;
  onClaim: (id: string) => void;
  onClose: () => void;
}

const MAX_RENDER_DIST = 40; // 멀리 있는 보물도 이 거리까지 당겨서 그려 보이게 함

function makeChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.8, roughness: 0.3, emissive: 0x553300 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.7), wood);
  base.position.y = 0.3;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.6;
  const band1 = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.72), gold);
  band1.position.y = 0.45;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.08), gold);
  lock.position.set(0, 0.55, 0.38);
  g.add(base, lid, band1, lock);
  // 멀리서도 보이는 빛기둥
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  g.add(beam);
  return g;
}

export default function ArView({ hints, claimRadius, onClaim, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const hintsRef = useRef(hints);
  hintsRef.current = hints;
  const [camError, setCamError] = useState<string | null>(null);
  const [noSensor, setNoSensor] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCamError('카메라를 사용할 수 없어요. 권한을 확인해 주세요.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(2, 5, 3);
    scene.add(sun);

    const chests = new Map<string, { obj: THREE.Group; target: THREE.Vector3; hint: Hint }>();

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    addEventListener('resize', resize);

    // --- 기기 방향 → 카메라 회전 (three.js DeviceOrientationControls 방식) ---
    const euler = new THREE.Euler();
    const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    const q0 = new THREE.Quaternion();
    const zee = new THREE.Vector3(0, 0, 1);
    let iosOffset = 0; // iOS는 alpha가 북쪽 기준이 아니라서 webkitCompassHeading으로 보정
    let gotEvent = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      gotEvent = true;
      let alpha = e.alpha;
      const heading = (e as any).webkitCompassHeading as number | undefined;
      if (heading != null) {
        const target = 360 - heading - alpha;
        let diff = ((target - iosOffset + 540) % 360) - 180;
        iosOffset = (iosOffset + diff * 0.15 + 360) % 360;
        alpha += iosOffset;
      }
      const orient = THREE.MathUtils.degToRad(((screen.orientation?.angle ?? (window as any).orientation) as number) || 0);
      euler.set(THREE.MathUtils.degToRad(e.beta), THREE.MathUtils.degToRad(alpha), -THREE.MathUtils.degToRad(e.gamma), 'YXZ');
      camera.quaternion.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
    };
    const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    addEventListener(evt, onOrient as EventListener);
    const sensorTimer = setTimeout(() => !gotEvent && setNoSensor(true), 2500);

    let raf = 0;
    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();

      // 서버 힌트와 동기화
      const live = new Set<string>();
      for (const h of hintsRef.current) {
        if (h.bearing == null) continue; // 방향을 모르면 AR에 표시 불가
        live.add(h.id);
        const b = THREE.MathUtils.degToRad(h.bearing);
        const d = Math.min(Math.max(h.distance, 3), MAX_RENDER_DIST);
        let c = chests.get(h.id);
        if (!c) {
          const obj = makeChest();
          scene.add(obj);
          c = { obj, target: new THREE.Vector3(), hint: h };
          chests.set(h.id, c);
          obj.position.set(Math.sin(b) * d, -1.2, -Math.cos(b) * d);
        }
        c.hint = h;
        c.target.set(Math.sin(b) * d, -1.2, -Math.cos(b) * d);
      }
      for (const [id, c] of chests) {
        if (!live.has(id)) {
          scene.remove(c.obj);
          chests.delete(id);
          continue;
        }
        c.obj.position.lerp(c.target, 0.08);
        c.obj.position.y = -1.2 + Math.sin(t * 2) * 0.08;
        c.obj.rotation.y = t * 0.8;
        // 멀수록 커 보이게 해서 화면에서 일정한 크기 유지
        const s = Math.max(0.6, c.obj.position.length() / 6);
        c.obj.scale.setScalar(s);
      }

      // 가장 가까운 보물 방향 화살표 (화면 밖일 때만)
      const nearest = hintsRef.current.find((h) => h.bearing != null);
      const arrow = arrowRef.current;
      if (arrow) {
        const c = nearest && chests.get(nearest.id);
        if (c) {
          tmp.copy(c.obj.position).project(camera);
          const inView = tmp.z < 1 && Math.abs(tmp.x) < 0.85 && Math.abs(tmp.y) < 0.85;
          if (inView) arrow.style.opacity = '0';
          else {
            const v = c.obj.position.clone().applyQuaternion(camera.quaternion.clone().invert());
            arrow.style.opacity = '1';
            arrow.style.transform = `rotate(${Math.atan2(v.x, v.y)}rad)`;
          }
        } else arrow.style.opacity = '0';
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(sensorTimer);
      removeEventListener('resize', resize);
      removeEventListener(evt, onOrient as EventListener);
      renderer.dispose();
    };
  }, []);

  const nearest = hints[0];
  const canClaim = nearest && nearest.distance <= claimRadius;

  return (
    <div className="ar">
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      <div className="ar-arrow" ref={arrowRef}>
        ▲
      </div>
      <button className="ar-close" onClick={onClose}>
        ✕
      </button>
      <div className="ar-hud">
        {camError && <p className="warn">{camError}</p>}
        {noSensor && <p className="warn">기기 방향 센서를 찾지 못했어요. 휴대폰에서 열어 주세요.</p>}
        {nearest ? (
          <p className="ar-dist">
            가장 가까운 보물까지 <b>{fmtDist(nearest.distance)}</b>
            {nearest.bearing == null && ' · 더 가까이 가면 AR에 나타나요'}
          </p>
        ) : (
          <p className="ar-dist">남은 보물이 없어요 🎉</p>
        )}
        {canClaim && (
          <button className="primary big pulse" onClick={() => onClaim(nearest.id)}>
            🎁 보물 열기
          </button>
        )}
      </div>
    </div>
  );
}
