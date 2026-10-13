# 0023 — Barcode scanner for snacks with self-hosted zxing-wasm
Date: 2026-10-13 · Status: accepted

**Context:** `GET /api/barcode/{code}` (0022) had no way in from the app. iOS Safari has no `BarcodeDetector`, and the Home Screen app is our main client.
**Decision:** Decode in the browser with **zxing-wasm** (reader build, EAN-13/EAN-8/UPC-A/UPC-E only). The ~1 MB wasm (~420 KB gzipped) ships in our own bundle via a `?url` import instead of the library's default jsDelivr CDN, and is loaded on first scan (`web/src/lib/barcodeReader.ts`); the service worker precaches it.
- **Scanner** (`web/src/snacks/BarcodeScanner.tsx`): live rear camera (`getUserMedia`), decoding the band around the on-screen guide every 250 ms; a code is sent once while it stays in view. Without a camera (denied, unsupported) or as a fallback: a photo of the barcode, or the typed number (8–14 digits).
- **Way in:** "Scan barcode" in Log a snack, "Scan a barcode" in Add food. Found → the snack form per 100 g with one serving (OFF `serving_quantity`, else 100 g), brand in front of the name, type guessed by the API (OFF category `en:beverages` → drink; sweet categories or ≥ 15 g sugar / 100 g → sweet; else savory), "Save to our snacks" switch. Logged with `source = "barcode"`.
- No values in OFF → the value fields open, logging waits until one is typed. Unknown in OFF → offer the nutrition-label photo instead.
**Alternatives:** `barcode-detector` polyfill (same zxing-wasm underneath, one more layer); `@zxing/browser` (older JS port, slower on phones); the vision model reading the digits (minutes per photo on 2 cores).
**Consequences:** First install downloads the wasm once more (until the zxing version changes). Water and diet drinks come in as "drink" (a treat) — the type toggle fixes it. Corrected values aren't remembered per barcode yet (idea: remember corrected label products).
