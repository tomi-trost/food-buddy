# 0017 — Web-first PWA (React + Vite) wrapped with Capacitor
Date: 2026-10-04 · Status: proposed (revised the same day; confirm after phase-0 spike)

**Context:** Both of us use iPhones; Android should work too. We pay nothing, so no Apple Developer Program: no TestFlight/App Store, and free Xcode-signed builds expire every 7 days. The iPhone app will therefore be the **home-screen web app** day to day.
**Decision:** **React + TypeScript + Vite PWA** (vite-plugin-pwa, Web Push via VAPID, camera via file input with `capture`, zxing for barcodes), wrapped with **Capacitor** for a sideloaded Android APK (and an optional 7-day iOS build). The mock's CSS tokens and styles are ported almost 1:1. See `docs/design-plan.md` §2.
**Alternatives:** Expo/React Native (first proposal; dropped because its web output is weaker and native store apps aren't our target); Flutter (weaker web); Svelte instead of React (fine too, but React has the bigger ecosystem).
**Consequences:** One web codebase. On iOS, no background tasks and some native features are limited, but camera, offline and push are covered. Store apps stay possible later through Capacitor.

*(File name kept from the first proposal, "expo-client", so links don't break.)*
