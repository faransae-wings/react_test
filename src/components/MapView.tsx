import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  emoji: string;
  label?: string;
  dim?: boolean;
}

interface Props {
  me: { lat: number; lng: number; acc: number } | null;
  markers?: MapMarker[];
  onTap?: (lat: number, lng: number) => void;
  picking?: boolean;
}

export default function MapView({ me, markers = [], onTap, picking }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const centered = useRef(false);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false }).setView([37.5665, 126.978], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e) => tapRef.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (me && !centered.current && map.current) {
      map.current.setView([me.lat, me.lng], 18);
      centered.current = true;
    }
  }, [me]);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (me) {
      L.circle([me.lat, me.lng], { radius: me.acc, color: '#3b82f6', weight: 1, fillOpacity: 0.1 }).addTo(g);
      L.marker([me.lat, me.lng], { icon: icon('📍'), interactive: false }).addTo(g);
    }
    for (const mk of markers) {
      const m = L.marker([mk.lat, mk.lng], { icon: icon(mk.emoji, mk.dim) }).addTo(g);
      if (mk.label) m.bindTooltip(mk.label, { permanent: true, direction: 'bottom', offset: [0, 6], className: 'tip' });
    }
  }, [me, markers]);

  return (
    <div className={`map-wrap ${picking ? 'picking' : ''}`}>
      <div ref={el} className="map" />
      {me && (
        <button className="locate" onClick={() => map.current?.setView([me.lat, me.lng], 18)}>
          ◎
        </button>
      )}
    </div>
  );
}

function icon(emoji: string, dim = false) {
  return L.divIcon({
    className: 'emoji-icon',
    html: `<span style="opacity:${dim ? 0.45 : 1}">${emoji}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}
