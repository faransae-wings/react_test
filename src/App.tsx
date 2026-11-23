import { useEffect, useState } from 'react';
import Home from './screens/Home';
import Host from './screens/Host';
import Play from './screens/Play';

function parse() {
  const [, kind, code] = location.hash.split('/');
  return { kind, code: (code ?? '').toUpperCase() };
}

export default function App() {
  const [route, setRoute] = useState(parse());
  useEffect(() => {
    const h = () => setRoute(parse());
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  }, []);
  if (route.kind === 'host' && route.code) return <Host code={route.code} />;
  if (route.kind === 'play' && route.code) return <Play code={route.code} />;
  return <Home />;
}
