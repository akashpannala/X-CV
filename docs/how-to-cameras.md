# How to connect cameras

Add LAN, RTSP, public, and file sources, and understand the automatic
server→browser fallback. Assumes you finished the tutorial.

## How to add any camera

If you want a new source, open the **Cameras** page → Add Camera. The URL
field accepts both kinds — no per-kind setup:

- LAN IP cam (same WiFi as the backend or browser):
  `http://192.168.1.100:8080/video`
- RTSP / public / dashcam: `rtsp://host/stream`, `https://…/video.mjpg`
- Local file (deterministic testing): `/home/you/Videos/site.mp4`

Press **Start** on the row. An Active badge means the server opened it;
`Failed to start…` means the URL is unreachable *from the server*.

## How the dashboard picks a path

If you want to predict behavior, the rule is: server-first, relay on
failure. Picking a settings row always tries the server; only a failed
start (or 3 dead polls) on an `http(s)` URL engages browser relay, labelled
`Name (relay)`. RTSP failures stay errors — browsers cannot play RTSP.

| Camera | Local backend | AWS backend |
|---|---|---|
| LAN `192.168.x` | Server path | Auto-relay (browser is on the LAN) |
| Public RTSP/HTTPS | Server path | Server path |
| Dead RTSP | Error | Error |

Browser Webcam and Screen-share in the dropdown need no settings row.

## How to use a public internet cam

If you want someone else's live feed, you need its *direct stream URL*,
never a watch page (YouTube, embeds, and directory pages cannot open):

1. Open the page, play the stream, open DevTools → Network.
2. Filter `m3u8|mp4|jpg|mjpg|cgi` while it plays.
3. Paste a repeating media URL in a plain tab: moving image = usable
   server-side (and relayable); refreshing still = snapshot-only;
   page/YouTube = unusable, move on.

Try `https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4`
(a verified progressive MP4) to prove the internet path.

## How to fix common failures

- `http://` cam on an `https://` dashboard won't load: Site settings →
  Insecure content → Allow (mixed-content rule, not our bug).
- Relay loads but pixels stay blocked (one-time alert): the cam sends no
  CORS headers — use Screen-share on the cam's tab instead.
- Overlay draws but nothing records: open DevTools console; the store
  call now logs failures instead of swallowing them.
- Distant workers missed on wide panoramas: model limits (mAP50-95
  0.513), not app failure — stage close-ups with a phone to prove
  detection.
