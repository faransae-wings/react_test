import { useEffect, useMemo, useState } from 'react';
import ArView from '../components/ArView';
import MapView from '../components/MapView';
import { compassName, fmtDist, newId, requestMotionPermission, useGeolocation, warmth } from '../geo';
import { useHuntSocket } from '../socket';
import type { PlayerView } from '../types';

export default function Play({ code }: { code: string }) {
  const stored = useMemo(() => {
    const raw = localStorage.getItem(`player:${code}`);
    return raw ? (JSON.parse(raw) as { pid: string; name: string }) : null;
  }, [code]);
  const [me, setMe] = useState(stored);
  const [nameInput, setNameInput] = useState('');

  if (!me) {
    return (
      <main className="home">
        <h1>🗺️ 보물찾기</h1>
        <p className="sub">코드 <b>{code}</b></p>
        <section className="card">
          <input placeholder="내 이름" value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={20} />
          <button
            className="primary"
            onClick={() => {
              const v = { pid: newId(), name: nameInput.trim() || '탐험가' };
              localStorage.setItem(`player:${code}`, JSON.stringify(v));
              setMe(v);
            }}
          >
            시작하기
          </button>
        </section>
      </main>
    );
  }
  return <Game code={code} pid={me.pid} name={me.name} />;
}

function Game({ code, pid, name }: { code: string; pid: string; name: string }) {
  const { pos, error: geoErr } = useGeolocation();
  const [ar, setAr] = useState(false);
  const [found, setFound] = useState<{ name: string; message: string } | null>(null);
  const [msg, setMsg] = useState('');

  const { view, status, error, send } = useHuntSocket<PlayerView>({ t: 'join', code, pid, name }, (m) => {
    if (m.t === 'claim') {
      if (m.ok) setFound(m.treasure);
      else setMsg(m.distance ? `아직 ${m.distance}m 떨어져 있어요. 더 가까이!` : '열 수 없어요.');
    }
  });

  // 위치가 바뀔 때마다 서버로 전송
  useEffect(() => {
    if (!pos || status !== 'open') return;
    const t = setTimeout(() => send({ t: 'pos', lat: pos.lat, lng: pos.lng, acc: pos.acc }), 0);
    return () => clearTimeout(t);
  }, [pos, status, send]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  if (error === 'not_found') return <main className="home"><p className="warn">존재하지 않는 보물찾기예요.</p></main>;
  if (!view) return <main className="home"><p className="sub">연결 중…</p></main>;

  const nearest = view.hints[0];
  const w = nearest ? warmth(nearest.distance) : null;
  const done = view.total > 0 && view.found.length === view.total;

  const startAr = async () => {
    await requestMotionPermission();
    setAr(true);
  };

  return (
    <div className="screen">
      <header className="bar">
        <button className="ghost" onClick={() => (location.hash = '')}>←</button>
        <div className="title">
          <b>{view.name}</b>
          <span className={`dot ${status}`} />
        </div>
        <span className="chip">{view.found.length}/{view.total} 💎</span>
      </header>

      <MapView me={pos} />

      <div className="sheet">
        {geoErr && <p className="warn">{geoErr}</p>}
        {!pos && !geoErr && <p className="hint">위치를 찾는 중…</p>}

        {done ? (
          <div className="card center"><h2>🎉 모든 보물을 찾았어요!</h2></div>
        ) : view.total === 0 ? (
          <div className="card center"><p>아직 숨겨진 보물이 없어요. 방장이 준비 중이에요.</p></div>
        ) : nearest && w ? (
          <div className={`radar ${w.cls}`}>
            <div className="radar-main">{w.label}</div>
            <div>
              가장 가까운 보물 <b>{fmtDist(nearest.distance)}</b>
              {nearest.bearing != null && <> · {compassName(nearest.bearing)}</>}
            </div>
          </div>
        ) : (
          <p className="hint">내 위치를 확인하면 힌트가 나와요.</p>
        )}

        <button className="primary big" onClick={startAr} disabled={!pos || done || view.total === 0}>
          📷 AR로 보물 찾기
        </button>

        {view.found.length > 0 && (
          <>
            <h3>찾은 보물</h3>
            <ul className="list">
              {view.found.map((f) => (
                <li key={f.id}>
                  <div>
                    <b>💎 {f.name}</b>
                    {f.message && <small>{f.message}</small>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>순위</h3>
        <ol className="list board">
          {view.board.map((b, i) => (
            <li key={b.id} className={b.id === pid ? 'me' : ''}>
              <div><b>{i + 1}. {b.name}</b></div>
              <span>{b.found} 💎</span>
            </li>
          ))}
        </ol>
      </div>

      {ar && <ArView hints={view.hints} claimRadius={view.claimRadius} onClaim={(id) => send({ t: 'claim', id })} onClose={() => setAr(false)} />}
      {msg && <div className="toast">{msg}</div>}
      {found && (
        <div className="modal" onClick={() => setFound(null)}>
          <div className="modal-card">
            <div className="burst">🎁</div>
            <h2>{found.name} 발견!</h2>
            {found.message && <p>{found.message}</p>}
            <button className="primary" onClick={() => setFound(null)}>계속 찾기</button>
          </div>
        </div>
      )}
    </div>
  );
}
