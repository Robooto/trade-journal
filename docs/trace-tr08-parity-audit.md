# TRACE TR-08 parity audit

Status: **implementation parity ready; visual cutover pending**

Audit anchor: `2026-07-24`, latest capture `2026-07-24T13:00:05-07:00`.
The standalone mini dashboard remains the reference presentation. Both UIs read
the same versioned TRACE APIs through the Pi's same-origin proxy.

## Resolved parity items

| Area | Result | Evidence |
| --- | --- | --- |
| Session and capture grain | Pass | Both presentations use the versioned session catalog and `(date, capture_id)` timeline rows. |
| Timeline selection | Pass | Slider, buttons, keyboard arrows, charts, snapshot, gamma profile, GEX map, and capture history share `selectedCaptureIndex`. |
| Snapshot values and evidence | Pass | The Angular snapshot now restores prominent spot/last-move context, detailed HIRO rates/acceleration/age, pressure evidence, gamma-at-spot/slope, volatility thresholds, nearest price structure, matched Charm context, and key signed-GEX nodes without frontend scoring. |
| Price structure | Pass | Near-price and full-range domains mirror the legacy focus rules; spot, walls, shelf, and signed-GEX containment/expansion nodes use the same capture-linked timeline. |
| HIRO pressure | Pass with intentional redesign | SPX/equities HIRO use a symmetric zero-centered domain and spot uses a separate axis. Rate-sign arrows show movement at each capture, while selected backend values, rates, and acceleration labels remain visible. |
| Signed GEX map | Pass | Positive circles, negative diamonds, backend node states, key/all nodes, near/full modes, and selected cursor are present. |
| Gamma around spot | Fixed in TR-08 | Angular now renders signed bars plus the curve, zero line, spot cursor, and backend cross-spot slope. |
| Exact session rows | Fixed in TR-08 | A collapsed capture-history table exposes every timeline row and synchronizes selection by timestamp. |
| Partial/error states | Pass | Independent source failures remain visible without taking down journal or positions. |
| Responsive containment | Pass by automated layout contract | Charts have responsive SVG view boxes and the table scrolls inside its own container rather than widening the application. |

## Intentional differences

- Angular uses the shared operator shell, responsive widths, and a collapsed
  exact-data table instead of reproducing the mini layout pixel for pixel.
- Angular preserves HIRO rate direction with per-capture up/down markers and shows
  backend acceleration labels for the selected capture. It does not recreate the
  legacy browser's separate six-capture classification in frontend code.
- Charm remains a first-class TRACE sub-route for full analysis and is also shown as
  optional experimental context in the overview snapshot. A missing Charm response does
  not block the core TRACE session.
- Source readiness and quality are more explicit in Angular.

## Required visual sign-off

The browser-controlled side-by-side check could not run because the desktop
browser connection failed at its sandbox boundary. Do not retire the standalone
mini presentation until these checks are completed on the deployed pages:

1. Open the same ready session and latest capture in both UIs.
2. Compare price near/full shapes, wall/shelf levels, and selected markers.
3. Compare HIRO zero crossings, relative SPX/equities shapes, right-axis spot,
   and selected values.
4. Compare key/all and near/full Signed GEX nodes plus gamma sign around spot.
5. Move backward through at least five captures using keyboard arrows and verify
   every panel and the active history row stay synchronized.
6. Check expanded and collapsed sidebar layouts at desktop width, then a narrow
   viewport for clipping and page-level horizontal overflow.
7. Repeat on one partial session to verify warnings and unavailable states.

## Cutover rule

Cutover is safe only after the visual checklist passes and the user confirms the
Angular overview preserves the research meaning they rely on. Keep the Legacy
TRACE link and mini UI as the rollback path until that confirmation. Retiring a
presentation must not remove or relocate the mini APIs.
