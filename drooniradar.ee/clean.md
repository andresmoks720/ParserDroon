# Clean-room specification: borders.geojson usage

## Goal
Define the **observable behavior** of the borders lookup used to gate place/region labels from coordinates. This is a clean-room description of what it does (not how it is implemented).

---

## Normative requirements (strict replication mode)

### Data loading
1. The implementation MUST load a GeoJSON FeatureCollection from `/private/borders.geojson` exactly once per worker lifetime.
2. If the payload is missing, invalid JSON, or not a FeatureCollection with a `features` array, the feature list MUST be treated as empty.
3. If the feature list is empty, every query MUST return `{ result: null }`.

### Input message contract
1. Input messages MUST be structured-clone-able values delivered via `postMessage`/`onmessage` (structured clone, not JSON serialization).
2. The input message MUST be an object with:
   - `requestId`: any structured-clone-able value.
   - `coordinates`: an object with numeric `lat` and `lng`.
3. Extra fields MUST be ignored.
4. `requestId` MUST be echoed verbatim in the output (including `null` or `undefined`).
5. Duplicate `requestId` values are allowed and MUST be echoed without uniqueness checks.

### Input validation and numeric rules
1. `coordinates` MUST be a non-null object.
2. `coordinates.lat` and `coordinates.lng` MUST be finite numbers (`Number.isFinite`).
3. No coercion is performed. Strings, booleans, `NaN`, `Infinity`, or missing values are invalid.
4. No normalization is performed. Coordinates MUST be used exactly as provided (no clamping, wrapping, or projection).
5. If validation fails, the request MUST yield **no response** (see “No-response rule”).

### Geometry acceptance rules
1. Only `Polygon` and `MultiPolygon` geometries participate in containment tests.
2. Non-polygon geometries MUST be **ignored** (skipped) and MUST NOT cause a response or error on their own.
3. Coordinate order is `[lng, lat]` per GeoJSON.

### Polygon validity rules
1. Each polygon MUST have at least one ring.
2. Each ring MUST contain **at least 4 positions**, and the first and last position MUST be identical (closed ring).
3. Each position MUST be an array of two finite numbers `[lng, lat]`.
4. If any polygon fails validation when evaluated for a request, the request MUST yield **no response**.
5. For MultiPolygon, each polygon entry MUST be non-empty; an empty polygon (no rings) is invalid and MUST yield **no response**.

### Holes and multipolygons
1. The **first ring** of a polygon is the outer boundary; subsequent rings are holes.
2. Ring winding order MUST be ignored; hole semantics are determined by ring position, not orientation.
3. Hole **interiors** MUST be excluded from the polygon.
4. Hole **boundaries** MUST be treated as inside (boundary → inside is global).
5. For MultiPolygon, the above rules apply to each polygon independently; a match in any polygon yields containment.

### Bounding box (bbox) handling
1. If a feature includes `bbox`, it MUST be used as-is and MUST NOT be recomputed or normalized.
2. If `bbox` is present but malformed (not an array of 4 finite numbers), evaluation MUST throw and the request MUST yield **no response**.
3. If `bbox` excludes the point, the feature MUST be skipped without further ring evaluation.

### Feature evaluation and selection
1. Features MUST be evaluated in file order.
2. The first feature that contains the point determines the output.
3. If no feature contains the point, the result MUST be `null`.

### Property selection (label priority)
1. The result label MUST be the first present value in this order: `city`, `area`, `county`, `country`.
2. A property is **present** only if its value is neither `""` (empty string), `null`, nor `undefined`.
3. If a feature matches but none of the label properties are present, the result value MUST be `undefined`.

### Output message contract
1. The output MUST be a structured-clone-able object with keys:
   - `requestId`: echoed from input.
   - `result`: **always present** (may be `string`, `null`, or `undefined`).
2. If a feature matches but has no label properties, the output MUST include `result: undefined` (property present with value `undefined`).

### Boundary rules
1. Points on polygon boundaries or vertices MUST be treated as inside.
2. No epsilon tolerance is applied; boundary classification is exact.

### No-response rule (test harness)
1. A request that yields **no response** means the implementation emits no `postMessage` for that request.
2. For tests, **no response** MUST be detected by waiting **500 ms** for a matching `requestId`. If no response arrives, the request is considered to have emitted no response.
3. Tests MUST NOT assume response ordering across concurrent requests.

---

## Normal path summary
1. Load borders data once (see “Data loading”).
2. Receive a query: `{ requestId, coordinates: { lat, lng } }`.
3. Validate input; if invalid, emit no response.
4. Evaluate features in order with bbox gating and polygon containment.
5. Return a label or `null`.

---

## Error handling summary
- **Borders load failure**: treat features as empty and return `null` for all queries.
- **Malformed input**: emit no response for that request.
- **Malformed polygon rings or malformed bbox**: emit no response for that request.

---

# Minimal fixture + tests

## Fixture: `borders.fixture.geojson`
The fixture contains labeled features and targeted edge cases. Each feature includes a stable `properties.testId` used by tests. The fixture covers:
- Overlapping `city` polygons (first match wins).
- Property priority within a single feature.
- Polygon with no label properties (result `undefined`).
- Malformed ring and short ring (no response).
- Polygon with a hole (hole interior excluded; hole boundary included).
- Polygon with a hole where the hole uses the same winding as the outer ring.
- MultiPolygon with a hole (hole interior excluded; boundary included).
- MultiPolygon with an empty polygon (invalid → no response when evaluated).
- Feature with explicit, incorrect bbox (trusted; can suppress matches).
- Feature with explicit, correct bbox.
- Feature with malformed bbox (no response).
- Non-polygon features (Point/LineString) to verify they are ignored.

## Test matrix (inputs → expected outcome)

| Case ID | Test target (`testId`) | Input `{lat,lng}` | Expected outcome |
|---|---|---|---|
| T01 | `CITY_A` + `CITY_B` | inside overlap | `{ result: "Alpha City" }` (first match wins) |
| T02 | `PRIORITY` | inside polygon | `{ result: "PriorityCounty" }` (county > country) |
| T03 | `COUNTRY` | inside polygon | `{ result: "Countryland" }` |
| T04 | `COUNTRY` | on boundary | `{ result: "Countryland" }` |
| T05 | `HOLE_ZONE` | inside hole interior | `{ result: null }` |
| T06 | `HOLE_ZONE` | on hole boundary | `{ result: "HoleZone" }` |
| T07 | `HOLE_SAME_WINDING` | inside hole interior | `{ result: null }` |
| T08 | `MULTI_HOLE` | inside hole interior | `{ result: null }` |
| T09 | `MULTI_HOLE` | on hole boundary | `{ result: "MultiHole" }` |
| T10 | `UNLABELED` | inside polygon | `{ result: undefined }` (property present) |
| T11 | `BAD_RING` | inside bbox | **No response emitted** |
| T12 | `SHORT_RING` | inside bbox | **No response emitted** |
| T13 | `BAD_BBOX` | inside geometry | **No response emitted** |
| T14 | `WRONG_BBOX` | inside geometry but outside bbox | `{ result: null }` |
| T15 | `BBOX_OK` | inside geometry | `{ result: "BBoxOK" }` |
| T16 | `POINT_FEATURE` / `LINE_FEATURE` | near geometry only | `{ result: null }` (ignored) |
| T17 | load failure | any point | `{ result: null }` |
| T18 | invalid input | missing/NaN/Infinity/string coords | **No response emitted** |
| T19 | `MULTI_EMPTY` | inside bbox | **No response emitted** |

---

# Decision tables

## Table A: Feature selection

| Condition | Result |
|---|---|
| Borders load failed or features list empty | Return `null` |
| Borders load in progress | Query waits until load completes |
| No features contain point | Return `null` |
| One or more features contain point | Return label from **first** matching feature |

## Table B: Property selection (for a matched feature)

| `city` | `area` | `county` | `country` | Result |
|---|---|---|---|---|
| present | any | any | any | `city` |
| absent | present | any | any | `area` |
| absent | absent | present | any | `county` |
| absent | absent | absent | present | `country` |
| absent | absent | absent | absent | `undefined` (property present, value undefined) |

## Table C: Boundary handling

| Point location | Treated as inside? |
|---|---|
| Strictly inside polygon | Yes |
| On polygon edge | Yes |
| On polygon vertex | Yes |
| Inside hole interior | No |
| On hole boundary | Yes |

---

# Example scenarios

1. **Point inside a single polygon**
   - Input: `{ lat: 59.5, lng: 24.5 }`
   - Matching feature: `COUNTRY`
   - Output: `"Countryland"`

2. **Point inside overlapping polygons**
   - Input: `{ lat: 58.4, lng: 10.4 }`
   - Feature A (first): `CITY_A` → `"Alpha City"`
   - Feature B (second): `CITY_B` → `"Beta City"`
   - Output: `"Alpha City"`

3. **Point inside a hole interior**
   - Input: `{ lat: 59.5, lng: 26.5 }`
   - Feature: `HOLE_ZONE`
   - Output: `null`

4. **Malformed input**
   - Input: `{ coordinates: null }`
   - Output: **no response emitted**
