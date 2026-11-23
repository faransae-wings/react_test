export interface Treasure {
  id: string;
  name: string;
  message: string;
  lat: number;
  lng: number;
  foundBy: { id: string; name: string }[];
}
export interface PlayerInfo {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  acc: number | null;
  ts: number;
  found: number;
  online: boolean;
}
export interface HostView {
  role: 'host';
  code: string;
  name: string;
  treasures: Treasure[];
  players: PlayerInfo[];
}
export interface Hint {
  id: string;
  distance: number;
  bearing: number | null;
}
export interface PlayerView {
  role: 'player';
  code: string;
  name: string;
  total: number;
  claimRadius: number;
  found: { id: string; name: string; message: string }[];
  hints: Hint[];
  board: { id: string; name: string; found: number }[];
}
export type Pos = { lat: number; lng: number; acc: number };
