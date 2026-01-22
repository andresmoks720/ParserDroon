# Captured Stream Frames (Expanded Examples)

This document provides a variety of data frames captured or inferred from the Drooniradar stream and batch APIs.

## 1. Historical Batch Frames (`/api/v1/history/batch`)

### Example A: High-Speed Transit
Captured when a drone is moving between locations.
**URL:** `.../api/v1/history/batch?s=1767522400&d=10`

```json
[
  {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-e1f2a3b4c5d6",
    "aid": "151dc9",
    "dc": { "lng": 24.7535, "lat": 59.4372 },
    "yaw": 185.5,
    "pc": null,
    "h": 120.5,
    "ts": 1767522400100
  },
  {
    "id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
    "aid": "151dc9",
    "dc": { "lng": 24.7540, "lat": 59.4368 },
    "yaw": 186.2,
    "pc": null,
    "h": 121.0,
    "ts": 1767522401105
  }
]
```

### Example B: Rapid Altitude Change
**URL:** `.../api/v1/history/batch?s=1767522500&d=10`

```json
[
  {
    "id": "c3d4e5f6-a7b8-9c0d-e1f2-3a4b5c6d7e8f",
    "aid": "461fa9",
    "dc": { "lng": 24.8102, "lat": 59.4123 },
    "yaw": 45.0,
    "h": 50.2,
    "ts": 1767522500000
  },
  {
    "id": "d4e5f6a7-b89c-0d1e-2f3a-4b5c6d7e8f9a",
    "aid": "461fa9",
    "dc": { "lng": 24.8102, "lat": 59.4123 },
    "yaw": 45.0,
    "h": 95.8,
    "ts": 1767522501000
  }
]
```

---

## 2. Geofencing Warning Frames (Intrusions)

The server injects geofence violations into the `int` array within the flight packet.

### Example C: Prohibited Zone Entry (Historical)
**URL:** `.../api/v1/history/batch?s=1767529000&d=60`

```json
[
  {
    "id": "flight-packet-uuid",
    "aid": "1581F6Z9C239E0037R9Q",
    "dc": { "lng": 24.8321, "lat": 59.4012 },
    "h": 45.0,
    "ts": 1767529000000,
    "int": [
      {
        "id": "zone-tallinn-airport-inner",
        "z": "Tallinn Airport Restricted Area",
        "s": 1767528995000,
        "e": null 
      }
    ]
  }
]
```
> [!IMPORTANT]
> When `e` (end timestamp) is `null`, the intrusion is currently ACTIVE.

### Example D: Multiple Zone Violations
A drone flying through overlapping restricted areas.

```json
{
  "id": "active-flight-id",
  "int": [
    {
      "id": "zone-critical-infra-1",
      "z": "Power Plant Buffer",
      "s": 1767530000000,
      "e": null
    },
    {
      "id": "zone-military-base-alpha",
      "z": "Restricted Area EER23",
      "s": 1767530100000,
      "e": null
    }
  ]
}
```

---

## 3. Real-time Socket.io Packets (Event "p")

The "firehose" of live data.

### Example E: Live Drone Update
```json
{
  "type": "p",
  "data": {
    "id": "2b774151-6113-44e7-9e80-16abb513217b",
    "v": "4.0",
    "over": false,
    "maxH": 12000,
    "s": 1767528492007,
    "sen": "145",
    "dc": { "lng": 24.7, "lat": 59.4 },
    "h": 100.5,
    "int": []
  }
}
```

---

## 4. System & Alert Messages (Inferred)

Based on the UI's notification logic and SMS templates found in the API.

### Example F: Geofence Entry Notification (SMS/Web Intent)
When the server triggers an external alert, the data structure looks like this in internal logs:

```json
{
  "type": "NOTIFICATION_TRIGGER",
  "level": "CRITICAL",
  "target": "SMS",
  "payload": {
    "phone": "+372XXXX",
    "message": "WARNING: Drone [DJI Mini 4 Pro] SERIAL: 1581F6Z9C239E0037R9Q entered zone [Tallinn Airport] at 12:23. Current altitude: 104m."
  }
}
```

### Example G: Signal Loss Warning
When a sensor loses telemetry for a tracked drone.

```json
{
  "type": "p",
  "data": {
    "id": "tracked-drone-id",
    "status": "SIGNAL_LOST",
    "lastPosition": { "lng": 24.75, "lat": 59.4 },
    "ts": 1767530500000
  }
}
```

---

## 5. Aircraft Interaction (Manned Aircraft)

## 6. Detailed Analysis: Batch 13:16 UTC (15:16 Local)
**URL:** `https://drooniradar.ee/api/v1/history/batch?s=1767529000&d=60`
**Timestamp:** 1767529000 (2026-01-04 13:16:40 UTC)

This batch represents a 60-second window containing two distinct types of sensor data.

### Data Type 1: Aircraft Tracking
```json
{
  "id": "2bb3d963-d8ef-4fa6-9ed7-ed6bd619a460",
  "aid": "461fa4",
  "dc": { "lng": 18.96332, "lat": 58.6675 },
  "yaw": null,
  "pc": null,
  "h": 10972.8,
  "ts": 1767529000095
}
```
- **Source**: Direct telemetry or ADSB.
- **Content**: Precise coordinates and altitude (`h`: 10972.8m).

### Data Type 2: RF Signal Detection (Electronic Intelligence)
```json
{
  "id": "3d867f5b-9970-48db-9f36-960b6d89cd8f",
  "l": "ELRS Remote: D/F",
  "c": { "lng": 26.952586, "lat": 57.809979 },
  "r": 4,
  "d": 1,
  "az": 157.2,
  "bw": 53.6,
  "st": "directional",
  "e": {
    "brand": "rf:rantelon",
    "rssi_dbm": -80.1,
    "bandwidth_mhz": 80,
    "center_frequency_mhz": 1325
  },
  "ts": 1767529000828,
  "sid": 189
}
```
- **Label (`l`)**: `"ELRS Remote: D/F"` (ExpressLRS Direction Finding).
- **Sensor ID (`sid`)**: `189`. 
- **Manufacturer (`brand`)**: `rf:rantelon`.
- **Signal Parameters**:
    - **`rssi_dbm`**: -80.1 (Signal strength).
    - **`az` / `bw`**: Azimuth (157.2°) and beamwidth (53.6°) of the detection.
    - **`center_frequency_mhz`**: 1325 MHz (The frequency being scanned).
- **Station (`st`)**: `"directional"`.

### Conclusion
This endpoint serves as a **unified telemetry and ELINT stream**. It doesn't just show where drones are; it shows identifying RF signatures and the specific ground sensors (like Rantelon stations) that are detecting them.

**Sensor Coverage Analysis for this Patch:**
- **Total Sensors in System**: 56 (discovered via `/api/v1/sensors`).
- **Active Sensors in this 60s Window**: Only **Sensor 189** ("Nursi tee 2") provided signal detection data.
- **Data Scoping**: Aircraft positioning (`aid`) is likely globally aggregated, whereas electronic intelligence (`l`) is attributed to specific sensor nodes.
