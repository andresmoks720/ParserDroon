# Clean-room specification: borders.geojson usage

## Goal
Define the **observable behavior** of the borders lookup used to gate place/region labels from coordinates. This is a clean-room description of what it does (not how it is implemented).

---

## Normal paths
1. **Load borders data once**
   - Load a GeoJSON FeatureCollection from `/private/borders.geojson`.
   - If the payload is a valid FeatureCollection with `features`, treat each feature as a candidate polygon region.
2. **Receive a query**
   - Input: `{ requestId, coordinates: { lat, lng } }`.
3. **Evaluate features in order**
   - For each feature, check if the point is inside the feature’s polygon/multipolygon.
   - The **first** feature that contains the point determines the output.
4. **Return a place label**
   - Return the first **truthy** property in this priority order (empty string, `null`, or `undefined` are treated as absent):
     1. `city`
     2. `area`
     3. `county`
     4. `country`
   - If no feature contains the point, return `null`.

---

## Wire Contract (message I/O)

### Input message schema
Required structure:

```json
{
  "requestId": "<any structured-clone-able value>",
  "coordinates": {
    "lat": <number>,
    "lng": <number>
  }
}
```

### Input tolerance rules
- **Ignore extra fields**: any additional keys on the message or `coordinates` are ignored; only `coordinates.lat` and `coordinates.lng` are read.
- **requestId echo**: `requestId` is echoed verbatim, including `null` or `undefined`, as long as it is structured-clone-able.
- **Duplicate requestId**: no uniqueness requirement; duplicate values are allowed and echoed as provided.

### Structured-clone failure handling
- If an incoming message cannot be structured-cloned (e.g., contains functions/DOM nodes), the runtime throws during message dispatch; **no response is emitted**.

Behavior if missing / non-numeric:
- **Strict replication mode (current behavior)**: invalid/missing `coordinates.lat` or `coordinates.lng` causes an uncaught exception during point creation; **no response is posted** for that request. The worker may terminate depending on runtime. 【F:parser/namedLocationWorker.js†L1-L1】

### Output message schema
Always posted only if the worker completes the lookup:

```json
{
  "requestId": "<same as input requestId>",
  "result": "<string | null | undefined>"
}
```

Where:
- `string` = the selected label (city/area/county/country)
- `null` = no polygon matched
- `undefined` = polygon matched, but none of `city/area/county/country` exist on the matching feature

**Important:** The current worker does **not** normalize `undefined` to `null`. If a polygon matches but lacks all label properties, the response includes `"result": undefined` (property present with `undefined` value), not an omitted key or `null`. 【F:parser/namedLocationWorker.js†L1-L1】

### Testable “no-response” rule
- In strict replication mode, treat **no response within 500 ms** as “no response emitted.” This timeout is a **test harness rule**; implementations should not add artificial delays. (If you choose a different timeout, document it and keep it consistent across tests.)

### Response ordering
- **No ordering guarantee**: multiple in-flight requests that wait on the same load may resolve in any order. Tests must not assume response order unless explicitly enforced. 【F:parser/namedLocationWorker.js†L1-L1】
  - **Test harness rule**: validate responses as an **unordered set** when concurrency is involved.

---

## Edge cases
- **Overlapping features**: Only the first matching feature in file order is used; later matches are ignored.
- **Point on boundary**: A point that lies exactly on a polygon boundary is treated as **inside**, including boundaries of holes. (Boundary → inside is global.) 【F:parser/namedLocationWorker.js†L1-L1】
- **Non-polygon features**: If a feature is not a `Polygon` or `MultiPolygon`, it is **not skipped**; behavior is undefined and may throw. Strict replication mode preserves this risk. 【F:parser/namedLocationWorker.js†L1-L1】
- **Coordinate order**: Coordinates are treated as `[lng, lat]` per GeoJSON conventions. Swapped inputs lead to incorrect results.
- **No normalization**: Coordinates are used as-is (no projection conversion, dateline wrapping, or normalization).

---

## Ambiguities & decisions (spec audit)
- **Non-polygon geometries**: strict replication **does not skip**; behavior is undefined and may throw. If legacy data includes non-polygons, capture a golden-master trace to lock behavior. 【F:clean.md†L67-L71】
- **“Non-empty property”**: interpret as **truthy** value. Empty string, `null`, or `undefined` are treated as absent. If legacy data uses empty strings intentionally, capture a golden-master trace. 【F:clean.md†L18-L23】
- **Worker termination after exception**: assert **no response** for the failed request; do **not** assert worker liveness unless a golden-master trace confirms survival behavior. 【F:clean.md†L76-L83】
- **Feature.bbox trust**: treat wrong `feature.bbox` as authoritative; it can suppress matches even when geometry contains the point. This is consistent with “trusted” and “no recompute.” 【F:clean.md†L104-L117】
- **MultiPolygon holes**: hole behavior is not explicitly defined; default expectation is “holes exclude interior, but hole boundary counts as inside.” Capture a golden-master trace to confirm. 【F:clean.md†L69-L70】

### Golden-master trace requirements
Collect traces for these cases to lock behavior:
1. **Non-polygon geometry**: one Point and one LineString feature present; send a query near the feature. Record whether a response is emitted or an exception occurs.
2. **Hole semantics**: send one query inside a hole interior and one on a hole boundary; record result.
3. **Post-exception survival**: send a malformed request, then a valid request; record whether the valid request gets a response.

### Trace-to-spec mapping workflow
- After capturing golden-master traces, **codify the observed outcome as acceptance criteria**.
  - Example: if the trace shows **no response** for non-polygon geometry, lock the spec to “strict no-response for non-polygons.”

---

## Error handling
- **Borders load failure**: If the GeoJSON fails to load or parse, the feature list is treated as empty, and all queries return `null`.
- **Malformed polygons**: If a polygon ring is not closed (first and last coordinates differ), the lookup throws an uncaught exception during PIP evaluation; **no response is posted** for that request in strict replication mode. 【F:parser/namedLocationWorker.js†L1-L1】
- **Malformed input**: Missing or non-numeric coordinates throw during point creation; **no response is posted** for that request in strict replication mode. 【F:parser/namedLocationWorker.js†L1-L1】

### Fatal vs non-fatal (explicit)
- **Strict replication mode (current)**: malformed input or malformed polygon rings cause an uncaught exception and **no `postMessage`** is emitted for that request. The worker may terminate (runtime-dependent). 【F:parser/namedLocationWorker.js†L1-L1】
- **Hardened mode (not current)**: per-request catch and respond with `{ requestId, result: null, error: "..." }`. This is **not** current behavior and would be a deliberate change.

---

## Ordering rules
- **Feature order**: The first matching feature wins.
- **Property priority**: `city` > `area` > `county` > `country`.

---

## Precision / rounding rules
- **No explicit rounding**: Inputs are evaluated at full floating-point precision.
- **Boundary detection**: Exact boundary hits are treated as inside; no epsilon tolerance is specified. Vertex hits count as boundary and are inside. 【F:parser/namedLocationWorker.js†L1-L1】

---

## Timezone / locale rules
- **None**: The lookup does not use time, timezone, or locale. Labels are returned exactly as stored in feature properties.

---

## GeoJSON acceptance rules
- **Top-level**: Must be a FeatureCollection with a `features` array. Otherwise, treat as empty. 【F:parser/namedLocationWorker.js†L1-L1】
- **Feature geometry**: Only `Polygon` and `MultiPolygon` are meaningful for containment. Other geometry types are not validated/filtered; strict replication mode **does not skip** them and may error. 【F:parser/namedLocationWorker.js†L1-L1】
- **Feature bbox**: If `feature.bbox` exists, it is trusted (no recompute). 【F:parser/namedLocationWorker.js†L1-L1】
- **Coordinate order**: `[lng, lat]` everywhere, consistent with GeoJSON. 【F:parser/namedLocationWorker.js†L1-L1】

---

## BBox algorithm (exact)
- **Raw coordinates only**: bbox is computed from raw coordinates; no projection transforms. 【F:parser/namedLocationWorker.js†L1-L1】
- **Existing bbox trusted**: if `feature.bbox` exists, it is used as-is. 【F:parser/namedLocationWorker.js†L1-L1】
- **Two bbox gates**:
  1. **Cached bbox** computed once per feature at load time (parallel array).
  2. **Feature bbox** checked again inside the PIP function (if present). 【F:parser/namedLocationWorker.js†L1-L1】

---

## Concurrency and caching invariants
- **Single fetch per worker lifetime**: borders are fetched once and cached. 【F:parser/namedLocationWorker.js†L1-L1】
- **Shared load promise**: all requests received while loading await the same promise. 【F:parser/namedLocationWorker.js†L1-L1】
- **No live reload**: updates to `/private/borders.geojson` are not observed until worker restart. 【F:parser/namedLocationWorker.js†L1-L1】
  
## Performance constraints (observable)
- **Precompute bboxes** is required for correctness parity; do not compute per-request only. 【F:parser/namedLocationWorker.js†L1-L1】
- **Feature count/ring size**: no explicit limits defined; performance degradation is possible with large datasets (tests should not assume limits).

### Fetch retry policy
- **No retries**: on fetch/parse failure, no automatic retry is performed; the empty dataset persists until worker restart. 【F:parser/namedLocationWorker.js†L1-L1】

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
| Outside polygon | No |

---

# State transitions

## Borders data lifecycle

```text
[Start]
   |
   v
[Begin load borders geojson]
   | (async)
   v
[Load complete: features cached OR empty]
   |
   | query received
   v
[Evaluate features in order] ---> [Match found] ---> [Return label]
   |
   | no match
   v
[Return null]
```

## Query-time failure paths

```text
[Query received]
   |
   v
[Wait for load completion]
   |
   v
[Validate input / polygon rings]
   | invalid input OR malformed ring (strict replication)
   v
[Uncaught exception -> no response emitted]
```

---

# Example scenarios

1. **Point inside a single polygon**
   - Input: `{ lat: 59.4, lng: 24.8 }`
   - Matching feature: Estonia border polygon
   - Properties: `{ country: "Estonia" }`
   - Output: `"Estonia"`

2. **Point inside overlapping polygons**
   - Input: `{ lat: 59.4, lng: 24.8 }`
   - Feature A (first): `{ area: "Tallinn" }`
   - Feature B (second): `{ county: "Harju" }`
   - Output: `"Tallinn"` (first match wins)

3. **Point on boundary**
   - Input: `{ lat: 58.0, lng: 24.0 }` exactly on polygon edge
   - Output: label from the first matching feature (boundary counts as inside)

4. **Outside all borders**
   - Input: `{ lat: 0, lng: 0 }`
   - Output: `null`

5. **Malformed GeoJSON load**
   - Borders file missing or invalid JSON
   - All queries return `null`

6. **Malformed ring**
   - A polygon ring is not closed
   - Query triggers an error condition; no label is returned for that query

7. **Property priority**
   - Feature properties: `{ county: "Harju", country: "Estonia" }`
   - Output: `"Harju"` (county beats country)

---

# Minimal fixture + golden-master tests

## Fixture: `borders.fixture.geojson`
See `drooniradar.ee/borders.fixture.geojson` for a minimal test dataset containing:
- Country polygon
- Overlapping area polygon
- Polygon with no city/area/county/country (forces `undefined`)
- Malformed ring polygon (forces strict-mode exception)
- MultiPolygon feature
- MultiPolygon with a hole
- Polygon with a hole
- Feature with explicit, incorrect bbox (tests bbox trust)
- Feature with explicit, correct bbox
- Non-polygon feature (Point)
- Non-polygon feature (LineString)

## Test matrix (inputs → expected outcome)

| Case | Input `{lat,lng}` | Expected outcome |
|---|---|---|
| 1 | inside country only (`lat: 59.5, lng: 24.5`) | `{ result: "Countryland" }` |
| 2 | inside overlapping area + country (`lat: 59.5, lng: 24.5`) | `{ result: "Metro Area" }` (first match) |
| 3 | inside unlabeled polygon (`lat: 59.12, lng: 24.12`) | `{ result: undefined }` |
| 4 | outside all polygons (`lat: 0, lng: 0`) | `{ result: null }` |
| 5 | malformed ring polygon hit (`lat: 59.35, lng: 24.35`) | **No response emitted** (strict mode) |
| 6 | invalid input (lat missing) | **No response emitted** (strict mode) |
| 7 | on hole boundary (`lat: 59.2, lng: 26.2`) | `{ result: "HoleZone" }` (boundary counts as inside) |
| 8 | inside hole interior (`lat: 59.5, lng: 26.5`) | `{ result: null }` (hole excludes interior) |
| 9 | inside multipolygon (`lat: 59.25, lng: 28.25`) | `{ result: "MultiZone" }` |
| 10 | inside wrong-bbox polygon geometry but outside bbox (`lat: 59.25, lng: 30.25`) | `{ result: null }` (bbox trust causes false negative) |
| 11 | non-polygon Point present (query near `PointFeature`) | **Undefined behavior** (strict replication may throw) |
| 12 | inside correct-bbox polygon (`lat: 59.25, lng: 31.25`) | `{ result: "BBoxOK" }` |
| 13 | inside multipolygon hole interior (`lat: 59.4, lng: 29.6`) | `{ result: null }` (if holes exclude interior; needs trace) |
| 14 | on multipolygon hole boundary (`lat: 59.2, lng: 29.4`) | `{ result: "MultiHole" }` (boundary inside; needs trace) |
| 15 | LineString feature present (query near `LineFeature`) | **Undefined behavior** (strict replication may throw) |
