# borders.geojson usage analysis (NOTAM limiting)

## Scope of review
Only one code path in this repository uses `borders.geojson`: the `namedLocationWorker.js` web worker. The worker loads `/private/borders.geojson`, precomputes feature bounding boxes, and answers point-in-polygon queries by returning a place label (city/area/county/country) or `null`. The worker’s logic is the **only** explicit “border limiting” mechanism present in this codebase. 【F:parser/namedLocationWorker.js†L1-L1】

### What this implies for NOTAM limiting
The NOTAM limiting behavior is **indirect**: anything that wants to attach a named location/region to a coordinate can only do so if that coordinate falls within one of the polygons in `borders.geojson`. The worker does **not** know about NOTAMs; it simply maps a point to a named region (or `null`). That means the “limit” is a **hard spatial gate** enforced by the presence/absence of a containing feature in `borders.geojson`, and by the first-match-wins behavior of the worker loop. 【F:parser/namedLocationWorker.js†L1-L1】

---

## Exact load + preprocessing flow
The worker defines a single async initializer (`ar`) that fetches the GeoJSON file, parses it, and precomputes a bounding box for every feature:

```js
let N=null,O=[];
const ar=(async()=>{
  try{
    N=await(await fetch("/private/borders.geojson")).json(),
    N&&Array.isArray(N.features)?
      O=N.features.map(y=>or(y)):
      (N={features:[]},O=[])
  }catch(t){
    N={features:[]},O=[],
    console.error("Failed to fetch or parse borders GeoJSON:",t)
  }
})();
```
【F:parser/namedLocationWorker.js†L1-L1】

**Behavioral implications:**
- **Single fetch**: `ar` is an async IIFE that is awaited on every message, but only executes once. The shared `N` and `O` hold the loaded features and their bboxes. This means updates to `/private/borders.geojson` after worker start will **not** be picked up until the worker is reloaded. 【F:parser/namedLocationWorker.js†L1-L1】
- **Graceful fallback**: If fetch or parse fails, the worker sets `N={features:[]}` and `O=[]`, effectively disabling any matches. Errors are logged to the console. 【F:parser/namedLocationWorker.js†L1-L1】
- **BBox cache**: `O` stores `[minX, minY, maxX, maxY]` per feature, computed via `or` (an alias of `sr`, which computes bbox). The cache is parallel to `N.features` by index; if features are reordered, bbox order must stay in sync. 【F:parser/namedLocationWorker.js†L1-L1】
- **FeatureCollection assumption**: If the parsed GeoJSON does not have a `features` array, the worker treats it as empty. There is no support for a bare `Polygon`/`MultiPolygon` root object. 【F:parser/namedLocationWorker.js†L1-L1】

### How bounding boxes are computed
The bbox logic is derived from the `sr` helper (aliased as `or`). It either uses an existing `bbox` on the feature or walks all coordinates to compute one:

```js
function sr(t,y={}){
  if(t.bbox!=null&&y.recompute!==!0)return t.bbox;
  const b=[1/0,1/0,-1/0,-1/0];
  return H(t,e=>{
    b[0]>e[0]&&(b[0]=e[0]),
    b[1]>e[1]&&(b[1]=e[1]),
    b[2]<e[0]&&(b[2]=e[0]),
    b[3]<e[1]&&(b[3]=e[1])
  }),b
}
```
【F:parser/namedLocationWorker.js†L1-L1】

**Behavioral implications:**
- **Existing bbox honored** unless `recompute: true` is explicitly passed (it is not). This means if a feature has an incorrect bbox, the worker will trust it. 【F:parser/namedLocationWorker.js†L1-L1】
- **All geometry types supported**: the `H` walker iterates through Feature/FeatureCollection/GeometryCollection and all basic geometry types to gather coordinates for bbox calculation. 【F:parser/namedLocationWorker.js†L1-L1】
- **Coordinate order**: bbox uses the raw coordinate order as `[x, y]`, so it assumes GeoJSON standard `[lng, lat]`. If the source data swaps lat/lng, bbox and PIP checks will be wrong. 【F:parser/namedLocationWorker.js†L1-L1】

---

## Exact query/matching flow
The worker’s `onmessage` handler is the runtime logic that “limits” things by borders. It expects a `{ requestId, coordinates }` payload, where `coordinates` has `{ lat, lng }`.

```js
self.onmessage=async t=>{
  var c,o,s,i;
  await ar;
  const{requestId:y,coordinates:b}=t.data,{lat:e,lng:w}=b,
    u=I([w,e]);
  for(let a=0;a<N.features.length;a++){
    const r=N.features[a],[n,f,g,h]=O[a];
    if(w>=n&&w<=g&&e>=f&&e<=h&&ir(u,r)){
      self.postMessage({
        requestId:y,
        result:((c=r.properties)?.city)||
               ((o=r.properties)?.area)||
               ((s=r.properties)?.county)||
               ((i=r.properties)?.country)
      });
      return
    }
  }
  self.postMessage({requestId:y,result:null})
}
```
【F:parser/namedLocationWorker.js†L1-L1】

**Behavioral implications:**
1. **Await data load**: every request waits for `ar` to resolve (ensures borders are ready). Requests can queue while the fetch is pending. 【F:parser/namedLocationWorker.js†L1-L1】
2. **Point creation**: uses `I([lng, lat])` to create a GeoJSON Point feature (note the coordinate order). `I` throws if inputs are missing or non-numeric, which would crash the worker for malformed messages. 【F:parser/namedLocationWorker.js†L1-L1】
3. **Two-step containment test**:
   - **BBox filter**: `(lng between minX/maxX) && (lat between minY/maxY)` using the cached bbox `O[a]`. This is a coarse, fast rejection test. 【F:parser/namedLocationWorker.js†L1-L1】
   - **Precise point-in-polygon**: `ir(u, r)` (alias of `er`) performs point-in-polygon / multipolygon checks. 【F:parser/namedLocationWorker.js†L1-L1】
4. **First match wins**: on the first feature that contains the point, the worker posts a result and stops. It does **not** search for multiple matches or resolve overlaps beyond order. Overlapping polygons are effectively prioritized by the order of `features` in the GeoJSON. 【F:parser/namedLocationWorker.js†L1-L1】
5. **Return value**: `result` is **one** of `city`, `area`, `county`, or `country`, in that priority order; the first **truthy** value is used (empty string, `null`, or `undefined` are treated as absent). If none exist, it returns `undefined` (implicitly). If no border matches, `result: null`. 【F:parser/namedLocationWorker.js†L1-L1】
6. **No coordinate normalization**: There is no projection/normalization logic (e.g., antimeridian wrapping). Coordinates are treated as-is. This matters if borders or inputs cross ±180° or use non-WGS84 projections. 【F:parser/namedLocationWorker.js†L1-L1】

### Wire contract clarifications (operational)
- **requestId** must be structured-clone-able (worker message semantics), not just JSON-serializable. It is echoed back verbatim on success responses (including `null`/`undefined`), and duplicates are allowed. 【F:parser/namedLocationWorker.js†L1-L1】
- **Extra fields**: additional keys on the message or `coordinates` are ignored; only `coordinates.lat`/`coordinates.lng` are read. 【F:parser/namedLocationWorker.js†L1-L1】
- **Result values** include `undefined` when a polygon matches but no label properties are present; this is not normalized to `null`. 【F:parser/namedLocationWorker.js†L1-L1】
- **No-response test rule**: for strict replication tests, treat “no response within 500 ms” as “no response emitted.” This is a harness rule for determinism, not a runtime guarantee.
- **Response ordering**: multiple queued requests may respond in any order; tests should not assume ordering.

### Trace-to-spec mapping
- Once golden-master traces are captured (non-polygon geometry, hole boundary/interior, post-exception survival), codify the observed outcomes as acceptance criteria and update the spec accordingly.

---

## Exact point-in-polygon logic
The worker’s “is point inside feature” check is `er` (aliased to `ir`), which wraps helper functions to support Polygons and MultiPolygons.

```js
function er(t,y,b={}){
  if(!t)throw new Error("point is required");
  if(!y)throw new Error("polygon is required");
  const e=rr(t),w=tr(y),u=w.type,c=y.bbox;
  let o=w.coordinates;
  if(c&&nr(e,c)===!1)return!1;
  u==="Polygon"&&(o=[o]);
  let s=!1;
  for(var i=0;i<o.length;++i){
    const a=T(e,o[i]);
    if(a===0)return!b.ignoreBoundary;
    a&&(s=!0)
  }
  return s
}
```
【F:parser/namedLocationWorker.js†L1-L1】

**Key details:**
- **Input shape normalization**: If geometry is a `Polygon`, it is wrapped so the same loop handles `MultiPolygon` and `Polygon`. The function expects polygonal geometry; it will not treat `LineString` or `Point` as valid borders. 【F:parser/namedLocationWorker.js†L1-L1】
- **Secondary bbox check**: If the feature itself has a `bbox`, it’s checked again via `nr`. That means the code has **two** bbox filters: the cached one `O[a]` and the feature’s own `bbox` (if present). 【F:parser/namedLocationWorker.js†L1-L1】
- **Boundary inclusion**: If the point lies on the boundary (the inner function `T` returns `0`), then the default behavior is to treat it as **inside** because `ignoreBoundary` is undefined → `!b.ignoreBoundary` is `true`. 【F:parser/namedLocationWorker.js†L1-L1】
- **Error behavior**: `er` throws if input point or polygon is missing. That means upstream caller must ensure both are present to avoid worker crashes. 【F:parser/namedLocationWorker.js†L1-L1】

### Boundary/inside decision logic (`T` + `j`)
The `T` function performs the ray-casting test and treats boundary hits specially:

```js
function T(t,y){
  var b,e,w=0,u,c,o,s,i,a,r,n=t[0],f=t[1],g=y.length;
  for(b=0;b<g;b++){
    e=0;var h=y[b],p=h.length-1;
    if(a=h[0],a[0]!==h[p][0]&&a[1]!==h[p][1])
      throw new Error("First and last coordinates in a ring must be the same");
    for(c=a[0]-n,o=a[1]-f,e;e<p;e++){
      if(r=h[e+1],s=r[0]-n,i=r[1]-f,o===0&&i===0){
        if(s<=0&&c>=0||c<=0&&s>=0)return 0
      }else if(i>=0&&o<=0||i<=0&&o>=0){
        if(u=j(c,s,o,i,0,0),u===0)return 0;
        (u>0&&i>0&&o<=0||u<0&&i<=0&&o>0)&&w++
      }
      a=r,o=i,c=s
    }
  }
  return w%2!==0
}
```
【F:parser/namedLocationWorker.js†L1-L1】

**Behavioral implications:**
- **Closed rings required**: If the first and last coordinates of a ring do not match, an error is thrown. This makes invalid polygons fatal to that query. 【F:parser/namedLocationWorker.js†L1-L1】
- **Boundary hit**: Returning `0` signals a boundary hit, which is then accepted as inside by default in `er`. 【F:parser/namedLocationWorker.js†L1-L1】
- **Winding order agnostic**: The ray-casting count is based on crossings; it does not depend on polygon winding direction. Holes are still respected because each ring is processed and contributes to the parity count. 【F:parser/namedLocationWorker.js†L1-L1】

### GeoJSON support boundaries
The helper set (`rr`, `tr`, `er`, `H`) accepts GeoJSON `Feature` or `Geometry` objects. In practice, `er` is invoked with a feature from `borders.geojson`. If the geometry is not `Polygon` or `MultiPolygon`, the test logic is not meaningful, so `borders.geojson` must contain polygonal features for correct behavior. 【F:parser/namedLocationWorker.js†L1-L1】

---

## How this “limits NOTAMs” in practice
While there is no explicit "NOTAM" reference inside `namedLocationWorker.js`, this worker is the only path that uses `borders.geojson`. Any code that needs a **place name** or **region classification** for a coordinate uses this border lookup to constrain output to defined areas. That means the “limit” is:

1. **You only get a place label if the coordinate falls inside any `borders.geojson` feature**, and
2. **The lookup stops at the first matching feature** (feature order matters if they overlap), and
3. **The label returned is a *single* property string** chosen by the `city → area → county → country` priority. 【F:parser/namedLocationWorker.js†L1-L1】

### Consequences for reimplementation
- **Determinism depends on feature order**: if two polygons overlap, the label that “wins” is whichever feature appears first in the GeoJSON. Reordering the file can change results. 【F:parser/namedLocationWorker.js†L1-L1】
- **Hard exclusion**: coordinates outside all polygons always map to `null`, so any upstream NOTAM logic must handle missing region labels gracefully (e.g., skip, fallback, or flag). 【F:parser/namedLocationWorker.js†L1-L1】
- **Single-label output**: the result is not a structured region hierarchy; it is a single string chosen by priority. If the downstream system needs multiple levels (city + county), it must perform a separate lookup or change the data contract. 【F:parser/namedLocationWorker.js†L1-L1】

---

## Re-implementation checklist (exact behavior to replicate)
- **Fetch path**: `/private/borders.geojson` (relative URL).【F:parser/namedLocationWorker.js†L1-L1】
- **Load once per worker**: cache the parsed FeatureCollection and per-feature bboxes; subsequent queries reuse cached data. 【F:parser/namedLocationWorker.js†L1-L1】
- **Precompute bboxes** for each feature once and cache them (use feature-provided `bbox` if present, else compute).【F:parser/namedLocationWorker.js†L1-L1】
- **Coordinate order**: always treat input `{lat, lng}` as `[lng, lat]` when building point geometry.【F:parser/namedLocationWorker.js†L1-L1】
- **Two-stage containment**: bbox check first, then point-in-polygon (`Polygon`/`MultiPolygon` only).【F:parser/namedLocationWorker.js†L1-L1】
- **Boundary inside**: point on border should count as inside (`ignoreBoundary` defaults to false).【F:parser/namedLocationWorker.js†L1-L1】
- **Return rule**: first match returns `properties.city || properties.area || properties.county || properties.country`; otherwise `null`.【F:parser/namedLocationWorker.js†L1-L1】
- **Failure behavior**: on fetch/parse error, the borders list is empty (no matches).【F:parser/namedLocationWorker.js†L1-L1】
- **Input validation**: the point builder throws if coordinates are missing or non-numeric; decide whether to mirror this strictness or to coerce/ignore invalid inputs. 【F:parser/namedLocationWorker.js†L1-L1】
