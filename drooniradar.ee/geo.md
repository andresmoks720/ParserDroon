# Drooniradar Geospatial & API Analysis

This document consolidates all findings from the investigation of `drooniradar.ee`.

---

## 1. Project Overview

- **Technology Stack**: SvelteKit frontend (build output only, no `.svelte` source files).
- **Map Library**: Leaflet 1.9.4 with Proj4Leaflet plugin.
- **Real-time Data**: Socket.io for live drone positions.
- **Local Codebase**: The `drooniradar.ee/` directory is a static build output (not the original source). Key scripts include `history_client.js` (Puppeteer data fetcher).

---

## 2. API Architecture & Authentication

### 2.1 API Endpoints Identified
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/areas` | GET | Fetch geofence/area definitions |
| `/api/v1/sensors` | GET | Fetch sensor configurations |
| `/api/v1/weather/latest` | GET | Fetch current weather data |
| `/api/v2/history/flights` | GET | Fetch daily flight summaries |
| `/api/v1/history/batch` | GET | Fetch backlog flight packets |
| `/api/v1/history/{aircraftId}/all_flights` | GET | Fetch all flights for a specific aircraft |
| `/api/v1/auth/login` | POST | Authenticate user (email/password) |
| `/api/v1/auth/logout` | POST | End session |
| `/api/v1/users/profile` | GET | Fetch user profile |

### 2.2 Authentication Mechanism
- **Session-based Auth**: All API endpoints return `403 Forbidden` without a valid session.
- **Cookie**: `SESSION` cookie stores the session token.
- **Header Injection**: The frontend wrapper function `vi()` in `Dr05Wac7.js` appends the token:
  ```javascript
  function vi(e) {
    const t = ae("SESSION");
    return t && e.append("Authorization", "Bearer " + t), e;
  }
  ```
- **Login Flow**:
  1. POST to `/api/v1/auth/login` with `{email, password}`.
  2. Receive `{sessionToken, expiry}`.
  3. Store in `SESSION` cookie and `localStorage`.

### 2.3 Implications
- **403 Errors**: All attempts to fetch API data without credentials fail.
- **No Public APIs**: Even `/api/v1/areas` requires authentication.
- **Socket.io**: Successfully connects but data is likely session-gated.

---

## 3. Coordinate Systems & Projections

### 3.1 Primary Systems
| System | EPSG | Usage |
|--------|------|-------|
| **L-EST** | EPSG:3301 | Map display projection (Estonian national grid) |
| **WGS84** | EPSG:4326 | API data format (lat/lon) |

### 3.2 Projection Handling
- **Proj4Leaflet**: Converts WGS84 → L-EST for rendering on Maa-amet base tiles.
- **Frontend-Heavy**: All coordinate transformations occur client-side.

### 3.3 Embedded Geospatial Library
A comprehensive geodesy library is bundled in `_app/immutable/chunks/ArrowUp.svelte_svelte_type_style_lang.Dr05Wac7.js`:

| Class (minified) | Original | Purpose |
|------------------|----------|---------|
| `L` | Vector3d | 3D vector math (dot, cross, rotation) |
| `Ie` | LatLon | WGS84 coordinate handling |
| `pi` | UTM | Universal Transverse Mercator conversions |
| `bt` | MGRS | Military Grid Reference System |
| `mi` | Cartesian | ECEF (Earth-Centered, Earth-Fixed) |
| `ge` | LatLonDatum | Datum-aware coordinates |
| `gt` | Cartesian_Datum | Helmert transforms between datums |

**Supported Ellipsoids**: WGS84, GRS80, Airy1830, Bessel1841, Clarke1866, Intl1924, WGS72.

**Supported Datums**: WGS84, ED50, ETRS89, NAD27, NAD83, OSGB36, Potsdam.

### 3.4 Usage Patterns
- `Ma(e)` → Converts `{lat, lng}` to MGRS string.
- `_a(e)` → Converts MGRS back to `{lat, lng}`.
- Cursor position likely displayed in multiple formats (WGS84, UTM, MGRS).

---

## 4. Air Zone Parsing (`parser/uasParser.js`)

### 4.1 AirZone Class
Encapsulates GeoJSON feature properties:
```javascript
class AirZone {
  constructor(feature) { this.feature = feature; }
  get restriction() {
    const props = this.feature?.properties || {};
    let restriction = props.restriction || 'NO_RESTRICTION';
    if (props.reason === 'Sensitive') restriction = 'PROHIBITED';
    else if (props.reason !== 'Other' && props.reason) restriction = 'REQ_AUTHORISATION';
    return restriction;
  }
  get restrictionLevel() { return restrictionLevels[this.restriction]; }
}
```

### 4.2 Styling Function
```javascript
function getAirZoneStyle(feature) {
  const zone = new AirZone(feature);
  const baseStyle = { fillOpacity: 0, color: "#0004", weight: 2, opacity: 0.8 };
  if (zone.restriction === "PROHIBITED") return { ...baseStyle, color: "#d44" };
  if (zone.restriction === "REQ_AUTHORISATION") return { ...baseStyle, color: "#88d" };
  return baseStyle;
}
```

### 4.3 Data Sources
- GeoJSON from `utm.eans.ee` and `utm.ans.lt`.
- Features with identifiers `EERZout`, `EYVLOUT` are filtered out.

---

## 5. History API Client Analysis

### 5.1 Flight Fetch Logic (from `4.CB2fylc3.js`)
```javascript
// Fetching daily flights
Hr(`/api/v2/history/flights?day=${YYYYMMDD}&tz=${tzOffset}&signal=t&mannedAircrafts=f&radar=t`)

// Backlog batch fetch
Hr("/api/v1/history/batch", "GET", new URLSearchParams({s: startSecs, d: durationSecs}))

// Individual aircraft history (requires permissions 100, 102, 103)
Hr("/api/v1/history/" + aircraftId + "/all_flights")
```

### 5.2 `Hr` Function
The central fetch wrapper that injects auth headers:
```javascript
async function Ee(e, t="GET", i=new URLSearchParams) {
  const r = new URL(be + e + (i.size ? "?" : "") + i.toString());
  const n = await fetch(r, { method: t, headers: vi(new Headers) });
  if (!n.ok) throw new Error(`${n.url} responded with code ${n.status}`);
  return await n.json();
}
```

---

## 6. Map Tile Sources

- **Provider**: Maa-amet (Estonian Land Board).
- **Projection**: L-EST (EPSG:3301).
- **Tile Pattern**: Standard XYZ with custom resolutions for Estonian grid.

---

## 7. Real-time Data (Socket.io)

- **Connection**: Successful on page load.
- **Events Observed**:
  - `AirZones: Merging incoming air zones GeoJSON data`
  - `SignalDetection: Subscribing to signal detection service`
- **Auth**: Connection appears open, but data payload may be session-dependent.

---

## 8. Key Files Reference

| File | Purpose |
|------|---------|
| `_app/immutable/nodes/4.CB2fylc3.js` | Main app logic (~1.6MB), contains history API, UAS parsing |
| `_app/immutable/chunks/ArrowUp.svelte_svelte_type_style_lang.Dr05Wac7.js` | Geodesy library + i18n |
| `parser/uasParser.js` | Extracted air zone parsing logic |
| `scripts/history_client.js` | Puppeteer-based history fetcher (403 blocked) |
| `scripts/debug_headers.js` | Header debugging script |

---

## 9. Geofence Violation Detection

### 9.1 **Calculation Location: BACKEND**

**Confirmed via live site inspection**: Geofence violation detection is performed **entirely on the backend**. The frontend does NOT calculate whether a drone violates a geofence—it only displays the results sent by the server.

### 9.2 Data Flow

```
Backend → Socket.io (event "p") → Frontend __intrusionTracker → UI Alerts
```

1. **Backend Calculation**: When a drone position update is received by the backend, the server checks if the drone's coordinates fall within any active geofence polygons/circles.
2. **Socket.io Transmission**: The backend sends flight updates via Socket.io using the event name `"p"` (packet).
3. **Frontend Reception**: The `__intrusionTracker` class subscribes to these packets and processes the `int` property.
4. **UI Display**: Violations are shown in the UI (flight list, map markers, alerts).

### 9.3 Flight Data Structure (from Socket.io)

Each flight update contains:

```javascript
{
  "id": "2b774151-6113-44e7-9e80-16abb513217b",  // Flight UUID
  "v": "4.0",                                     // Version
  "over": false,                                  // Flight ended?
  "maxH": 39025,                                  // Max height (cm)
  "s": 1767528492007,                             // Start timestamp (ms)
  "e": 1767530604038,                             // End timestamp (ms)
  "sen": "145,159",                               // Sensor IDs (comma-separated)
  "int": [                                        // INTRUSIONS ARRAY
    {
      "id": "geofence-uuid",                      // Geofence ID
      "z": "zone-name",                           // Zone name
      "s": 1767529000000,                         // Intrusion start (ms)
      "e": 1767529500000                          // Intrusion end (ms)
    }
  ]
}
```

**Key Property**: `int` (intrusions)
- **Empty array `[]`**: No violations
- **Non-empty array**: Contains objects for each geofence violated

### 9.4 Frontend Intrusion Tracker (`4.CB2fylc3.js`)

**Class**: `os` (minified name for `IntrusionTracker`)

```javascript
class os {
  constructor(geofencesService, knownDronesService) {
    this.__intrusionTracker = new Map();
    this.activeIntrusions = new Ot([]);
    // ...
  }

  static connect(socketManager, geofencesService, knownDronesService) {
    const tracker = new os(geofencesService, knownDronesService);
    tracker.wsUnsubscribe = socketManager.subscribe("p", 
      tracker.__onIncomingMessage.bind(tracker), 
      tracker.__doDisconnect.bind(tracker)
    );
    tracker.stopIntrusionCleanupInterval = setInterval(() => {
      tracker.__cleanThenNotifyIntrusions();
    }, 100);
    return tracker;
  }

  __onIncomingMessage(packet) {
    // Processes incoming flight data
    // Checks packet.int property
    // Updates __intrusionTracker Map
  }

  __checkIntrusion(flight) {
    // Reads flight.int property from backend
    // Returns true if violations exist
    return flight.int != null && flight.int.length > 0;
  }

  __cleanThenNotifyIntrusions() {
    // Removes stale intrusions (>1 minute old)
    // Updates activeIntrusions observable
    // Triggers UI alerts
  }
}
```

### 9.5 Frontend Filter Logic

The history view filters flights by violations using:

```javascript
geofence_violations: (flight, filter, context) => {
  return flight?.sum?.int != null && flight.sum.int.length > 0;
}
```

This confirms the `int` property is present in both:
- Real-time packets (via Socket.io)
- Historical flight summaries (via `/api/v2/history/flights`)

### 9.6 API Endpoints for Violation Data

| Endpoint | Contains `int`? | Purpose |
|----------|----------------|---------|
| Socket.io event `"p"` | ✅ Yes | Real-time flight updates with intrusions |
| `/api/v2/history/flights` | ✅ Yes | Daily flight summaries with intrusions |
| `/api/v1/history/batch` | ✅ Yes | Backlog flight packets |
| `/api/v1/history/{id}/all_flights` | ✅ Yes | All flights for specific aircraft |

### 9.7 Summary

- **Backend**: Performs all geofence violation calculations using server-side geometry libraries.
- **Frontend**: Receives pre-calculated violations via the `int` property in flight objects.
- **Real-time**: Socket.io event `"p"` delivers live intrusion data.
- **Historical**: REST APIs include the same `int` property for past flights.
- **No Client-Side Calculation**: The frontend does NOT use the embedded geodesy library (UTM/MGRS) for violation detection—only for coordinate display formatting.

---

## 10. Blockers & Next Steps

### Current Blockers
1. **403 Forbidden**: All API endpoints require authenticated session.
2. **No Guest Access**: No public endpoints discovered.
3. **Source Not Available**: Only build output exists locally.

### Recommended Next Steps
1. **Mock Auth Endpoint**: Create `/api/v1/auth/login` returning dummy token.
2. **Mock Data APIs**: Serve static JSON for `/api/v1/areas`, `/api/v1/sensors`.
3. **Test Projection**: Generate WGS84 test points, verify L-EST rendering.
4. **Socket Investigation**: Analyze if Socket.io data is session-gated.
