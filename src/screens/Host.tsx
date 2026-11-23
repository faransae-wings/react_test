import { useMemo, useState } from 'react';
import MapView, { MapMarker } from '../components/MapView';
import { fmtDist, useGeolocation } from '../geo';
import { useHuntSocket } from '../socket';
import type { HostView } from '../types';

export default function Host({ code }: { code: string }) {
  const token = localStorage.getItem(`host:${code}`);
  const { pos, error: geoErr } = useGeolocation();
  const { view, status, error } = useHuntSocket<HostView>(token ? { t: 'host', code, token } : null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState('');

  const link = `${location.origin}/#/play/${code}`;

  const flash = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 2000);
  };

  const hide = async (at: { lat: number; lng: number }) => {
    const r = await fetch(`/api/hunts/${code}/treasures`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-host-token': token! },
      body: JSON.stringify({ ...at, name, message }),
    });
    if (!r.ok) return flash('숨기기에 실패했어요.');
    setName('');
    setMessage('');
    setPicked(null);
    setPicking(false);
    flash('💎 보물을 숨겼어요!');
  };

  const remove = async (id: string) => {
    if (!confirm('이 보물을 삭제할까요?')) return;
    await fetch(`/api/hunts/${code}/treasures/${id}`, { method: 'DELETE', headers: { 'x-host-token': token! } });
  };

  const share = async () => {
    const text = `보물찾기에 초대합니다! 코드: ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: view?.name, text, url: link });
        return;
      } catch {
        /* 취소 */
      }
    }
    await navigator.clipboard?.writeText(link);
    flash('초대 링크를 복사했어요');
  };

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    for (const t of view?.treasures ?? []) {
      m.push({ id: t.id, lat: t.lat, lng: t.lng, emoji: t.foundBy.length ? '📭' : '💎', label: t.name, dim: t.foundBy.length > 0 });
    }
    for (const p of view?.players ?? []) {
      if (p.lat != null && p.lng != null) m.push({ id: p.id, lat: p.lat, lng: p.lng, emoji: '🧑‍🚀', label: p.name, dim: !p.online });
    }
    if (picked) m.push({ id: 'picked', lat: picked.lat, lng: picked.lng, emoji: '🎯', label: '여기에 숨김' });
    return m;
  }, [view, picked]);

  if (!token) {
    return (
      <main className="home">
        <p className="warn">이 기기에서 만든 보물찾기가 아니에요.</p>
        <button onClick={() => (location.hash = '')}>처음으로</button>
      </main>
    );
  }
  if (error) return <main className="home"><p className="warn">접속 오류: {error}</p></main>;

  const target = picked ?? pos;

  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={() => (location.hash = '')}>←</button>
        <div className="title">
          <b>{view?.name ?? '...'}</b>
          <span className={`dot ${status}`} />
        </div>
        <button className="chip" onClick={share}>
          초대 <b>{code}</b>
        </button>
      </header>

      <MapView
        me={pos}
        markers={markers}
        picking={picking}
        onTap={(lat, lng) => {
          if (picking) setPicked({ lat, lng });
        }}
      />

      <div className="sheet">
        <div className="form">
          <input placeholder="보물 이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <input placeholder="찾았을 때 보여줄 메시지 (선택)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={200} />
          <div className="row">
            <button className="primary" disabled={!target} onClick={() => target && hide(target)}>
              {picked ? '🎯 선택한 곳에 숨기기' : '📍 내 위치에 숨기기'}
            </button>
            <button
              className={picking ? 'active' : ''}
              onClick={() => {
                setPicking(!picking);
                if (picking) setPicked(null);
              }}
            >
              {picking ? '선택 취소' : '🗺️ 지도에서 선택'}
            </button>
          </div>
          {picking && <p className="hint">지도를 탭해 보물 위치를 고르세요.</p>}
          {geoErr && <p className="warn">{geoErr}</p>}
          {pos && !picking && <p className="hint">내 위치 정확도 약 {fmtDist(pos.acc)} · 정확할수록 AR이 잘 맞아요</p>}
        </div>

        <h3>💎 숨긴 보물 ({view?.treasures.length ?? 0})</h3>
        <ul className="list">
          {view?.treasures.map((t) => (
            <li key={t.id}>
              <div>
                <b>{t.name}</b>
                <small>{t.foundBy.length ? `찾은 사람: ${t.foundBy.map((f) => f.name).join(', ')}` : '아직 아무도 못 찾음'}</small>
              </div>
              <button className="ghost" onClick={() => remove(t.id)}>🗑</button>
            </li>
          ))}
        </ul>

        <h3>🧑‍🚀 참가자 ({view?.players.length ?? 0})</h3>
        <ul className="list">
          {view?.players.map((p) => (
            <li key={p.id}>
              <div>
                <b>{p.name}</b> <span className={`dot ${p.online ? 'open' : 'closed'}`} />
                <small>{p.found}/{view.treasures.length} 발견</small>
              </div>
            </li>
          ))}
          {view?.players.length === 0 && <li><small>코드 {code} 를 공유해 친구를 초대하세요.</small></li>}
        </ul>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
