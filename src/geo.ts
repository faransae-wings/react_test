import { useEffect, useState } from 'react';
import type { Pos } from './types';

export function useGeolocation() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('이 브라우저는 위치 기능을 지원하지 않아요.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      },
      (e) => setError(e.code === 1 ? '위치 권한을 허용해 주세요.' : '위치를 가져올 수 없어요.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { pos, error };
}

/** iOS는 사용자 제스처(탭) 안에서 모션 센서 권한을 요청해야 합니다. */
export async function requestMotionPermission(): Promise<boolean> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof D.requestPermission === 'function') {
    try {
      return (await D.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
export const compassName = (b: number) => COMPASS[Math.round(b / 45) % 8] + '쪽';
export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);

export function warmth(d: number) {
  if (d <= 10) return { label: '🔥 바로 코앞!', cls: 'hot' };
  if (d <= 30) return { label: '♨️ 아주 가까워요', cls: 'hot' };
  if (d <= 100) return { label: '🙂 가까워지고 있어요', cls: 'warm' };
  return { label: '🧊 아직 멀어요', cls: 'cold' };
}

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
