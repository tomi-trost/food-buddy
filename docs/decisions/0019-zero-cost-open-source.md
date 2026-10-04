# 0019 — Zero cost and open source
Date: 2026-10-04 · Status: accepted (license choice pending)

**Context:** The app is for the two of us; we don't want to pay for anything and aren't distributing it yet. We would like it to be open source.
**Decision:** Nothing paid: no Apple Developer Program, no app stores, no paid or metered APIs (closed free tiers aren't used either). Self-hosted models and open data only. The code will be **open source** in a public GitHub repo; proposed license **AGPL-3.0** (alternative MIT). Going public is a separate step we take when ready.
**Alternatives:** Paying 99 USD/year for TestFlight (rejected); hosted vision APIs (rejected: cost/closed); keeping the repo private (rejected long-term).
**Consequences:** iPhone access is a PWA; Android gets a sideloaded APK. Public repo → free arm64 CI runners and free GHCR, but strict hygiene: no secrets, household data or meal photos in git. Model/data licenses (Qwen Apache-2.0, USDA CC0, Ciqual attribution, Open Food Facts ODbL) are credited in the README.
