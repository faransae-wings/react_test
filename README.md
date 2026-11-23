# 🗺️ 보물찾기 (AR Treasure Hunt)

집, 사무실, 야외 어디서나 보물을 숨기고 친구를 초대해 AR로 찾게 하는 웹앱.

- **방장**: 지도에서 보물(💎)과 참가자(🧑‍🚀)의 실시간 위치를 함께 봄. 내 위치 또는 지도 탭으로 보물 숨기기, 메시지 남기기
- **참가자**: 코드/링크로 입장 → 거리·방향 힌트(🧊→🔥) → 카메라 AR로 3D 보물상자 찾기 → 20m 이내에서 열기
- 보물 좌표는 서버만 보관. 참가자에겐 거리/방향 힌트만 전달하고 수집 판정도 서버에서 수행

## 실행

```bash
npm install
npm run dev      # 서버(:3001) + https 개발 서버(:5173)
```

휴대폰 GPS·카메라·모션 센서는 **HTTPS**에서만 동작합니다. 개발 서버는 자체 서명 인증서로 https를 띄우므로
같은 Wi‑Fi의 휴대폰에서 `https://<PC-IP>:5173` 로 접속하세요. (인증서 경고는 무시)

배포: `npm run build && npm start` (서버가 `dist/` 도 함께 서빙. 호스팅 시 HTTPS 필요)

## 구조

- `server/index.js` — Express REST + WebSocket, `server/data.json` 에 저장
- `src/screens/` — Home / Host / Play
- `src/components/ArView.tsx` — three.js + 카메라 + 기기 방향 센서 기반 GPS-AR
- `src/components/MapView.tsx` — Leaflet 지도

## 한계 / 다음 단계

- GPS-AR이라 실내에서는 정확도가 낮음(보통 5~30m). 집·사무실용으로는 비콘/QR 앵커나 WebXR 앵커(Android Chrome) 모드 추가 권장
- 인증은 방장 토큰 수준의 간단한 구조, 저장소는 JSON 파일
