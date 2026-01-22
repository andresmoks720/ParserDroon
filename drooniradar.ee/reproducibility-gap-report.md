# Reproducibility Gap Report (Clean-room)

This report lists the strict-replication gaps identified for the borders lookup and documents the minimal expansion plan and resolution status.

## G1 gaps (prioritized)

| Gap ID | Description | Minimal Expansion Plan | Status |
|---|---|---|---|
| G1-01 | Numeric validity rules for `lat`/`lng` (finite numbers only; no coercion). | Specify finite-number validation and no coercion; add invalid-input no-response tests. | Resolved |
| G1-02 | `coordinates` object missing or `null` behavior. | Declare invalid input ⇒ no response; add tests for missing/null `coordinates`. | Resolved |
| G1-03 | Structured-clone messaging vs JSON; `result` key presence when `undefined`. | Require structured clone; require `result` key always present; add tests for `undefined` preservation. | Resolved |
| G1-04 | Non-polygon geometry handling (skip vs throw/no-response). | Choose **skip** behavior for non-polygons; add tests near Point/LineString. | Resolved |
| G1-05 | Hole semantics (ring order ignored), hole boundary inclusion, and multipolygon hole behavior. | Define outer ring + hole rings by position; boundary-inside; add hole + multipolygon tests. | Resolved |
| G1-06 | Malformed `bbox` handling (trust without validation vs recompute). | Choose **trust without validation**; malformed bbox ⇒ evaluation throws ⇒ no response. | Resolved |
| G1-07 | No normalization of lat/lng; use exact values. | Add explicit MUST-level rule and tests that use raw values. | Resolved |
| G1-08 | Exact boundary behavior (no epsilon). | Define boundary inclusion with no epsilon; add boundary test. | Resolved |
| G1-09 | No-response harness rule (500ms). | Specify harness timeout; use in all no-response tests. | Resolved |
| G1-10 | Malformed rings (ring-too-short / not closed) behavior. | Define ring validity rules; malformed ring ⇒ no response; add tests for bad/short rings. | Resolved |
| G1-11 | MultiPolygon with empty polygon coordinates. | Treat empty polygon as invalid; add fixture + no-response test. | Resolved |
| G1-12 | Overlapping same-property tie (two `city` polygons). | Specify first match wins; add overlapping `city` test. | Resolved |
| G1-13 | Load failure behavior (`null`). | Specify empty-feature behavior on load failure; add test. | Resolved |

---

## Resolution details

### Spec updates (clean.md)
- **Normative Requirements** section covers validation, structured-clone, non-polygons, holes, bbox handling, and no-response behavior. (See: `clean.md` “Normative requirements (strict replication mode)”.)
- **Test matrix** enumerates the finalized cases and expected outcomes. (See: `clean.md` “Test matrix (inputs → expected outcome)”.)

### Test case IDs
The following tests in `drooniradar.ee/tests/borders.spec.test.js` map to the G1 gaps:

| Test ID | Gap(s) covered |
|---|---|
| T01 | G1-12 |
| T02 | G1-01 (indirect through valid input), property priority |
| T03 | G1-01 |
| T04 | G1-08 |
| T05 | G1-05 |
| T06 | G1-05 |
| T07 | G1-05 |
| T08 | G1-05 |
| T09 | G1-05 |
| T10 | G1-03 |
| T11 | G1-10 |
| T12 | G1-10 |
| T13 | G1-06 |
| T14 | G1-06 |
| T15 | G1-06 |
| T16 | G1-04 |
| T17 | G1-13 |
| T18 | G1-01, G1-02, G1-09 |
| T19 | G1-11 |

---

## Minimal Expansion Plan (executed)
1. Add MUST-level input validation and structured-clone requirements.
2. Lock no-response semantics to a 500ms harness timeout.
3. Explicitly define holes, boundary inclusion, and multipolygon behavior.
4. Clarify bbox trust and malformed-bbox behavior.
5. Set non-polygon features to be ignored (skip), not error.
6. Add fixtures and tests for edge cases (holes, overlaps, malformed rings, malformed bbox, empty multipolygon polygon).

