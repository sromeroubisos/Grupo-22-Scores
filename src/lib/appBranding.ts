// World Cup window: switch app icon to the WC variant until 20 Jul 2026 00:00 ART.
// ART = UTC-3, so 20 Jul 2026 00:00 ART === 20 Jul 2026 03:00 UTC.
const WORLD_CUP_END_MS = Date.UTC(2026, 6, 20, 3, 0, 0);

export function isWorldCupWindow(now: number = Date.now()): boolean {
  return now < WORLD_CUP_END_MS;
}

export function appIconHref(): string {
  return isWorldCupWindow() ? "/icon-wc.png" : "/icon-normal.jpeg";
}

export function appIconMimeType(): string {
  return isWorldCupWindow() ? "image/png" : "image/jpeg";
}
