import { useState } from 'react';

export default function Home() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/hunts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const { code, hostToken } = await r.json();
      localStorage.setItem(`host:${code}`, hostToken);
      location.hash = `#/host/${code}`;
    } catch {
      setErr('서버에 연결할 수 없어요.');
      setBusy(false);
    }
  };

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const r = await fetch(`/api/hunts/${c}`);
    if (!r.ok) return setErr('없는 코드예요. 다시 확인해 주세요.');
    location.hash = `#/play/${c}`;
  };

  return (
    <main className="home">
      <h1>🗺️ 보물찾기</h1>
      <p className="sub">어디에든 보물을 숨기고, 친구를 초대해 AR로 찾게 하세요.</p>

      <section className="card">
        <h2>보물 숨기기</h2>
        <input placeholder="보물찾기 이름 (예: 우리집 대탐험)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <button className="primary" onClick={create} disabled={busy}>
          새 보물찾기 만들기
        </button>
      </section>

      <section className="card">
        <h2>보물 찾기</h2>
        <input
          placeholder="초대 코드 5자리"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={5}
          className="code-input"
        />
        <button onClick={join}>참가하기</button>
      </section>
      {err && <p className="warn">{err}</p>}
    </main>
  );
}
