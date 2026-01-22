# Stream and Batch Mechanism Analysis

## Overview
Drooniradar.ee uses two distinct mechanisms for delivering aircraft position data depending on the context: **Live Streaming (SSE)** and **Historical Playback (Batched Fetch)**.

## 1. Live Streaming: Server-Sent Events (SSE)
As identified in `airdata.md` and `poc_stream.js`:
- **Endpoint:** `/api/v1/aircraft_info`
- **Protocol:** Server-Sent Events (SSE)
- **Content-Type:** `text/event-stream`
- **Behavior:** The client opens a persistent connection. The server pushes updates as they happen. This is the "true" stream mechanism.
- **Authentication:** Appears to require session cookies. Unauthenticated access via scripts often results in 403 or 404 unless headers and fingerprinting are perfectly mimicked (as noted in `poc_stream.js`).

## 2. Historical Playback: Batched Fetch
Our investigation of the 12:23 DJI Mini 4 Pro flight confirmed that historical data does **not** use SSE. Instead, it uses a "pseudo-stream" implemented with sequential polling:
- **Endpoint:** `/api/v1/history/batch`
- **Protocol:** Standard HTTP GET
- **Parameters:**
    - `s`: Start timestamp (Unix epoch in seconds).
    - `d`: Duration window in seconds (e.g., 10s initially, then 50s for subsequent pre-fetches).
- **Behavior:**
    1. Client selects a flight.
    2. Client fetches the first 10-second batch to start playback immediately.
    3. Client fetches larger 50-second batches in the background to buffer the "stream".
    4. Playback logic on the frontend iterates through the timestamps in the JSON array to render positions on the map.

## 3. Comparison

| Feature | Live Stream (SSE) | History Playback (Batch) |
| :--- | :--- | :--- |
| **Technology** | `EventSource` (SSE) | `fetch()` (Long Polling/Batching) |
| **Latency** | Real-time (push) | High (buffered) |
| **Data Format** | Single events (JSON) | Arrays of positions (JSON) |
| **State** | Persistent connection | Stateless requests |
| **Control** | Server-controlled flow | Client-controlled (can skip around) |

## 4. Intrusion and Alert Data

One of the most critical parts of the Drooniradar stream is the **Intrusion Detection System (IDS)**. Unlike simple positional apps, this server calculates violations in real-time.

### The `int` (Intrusions) Property
The backend performs geometric intersection checks between drone coordinates and prohibited polygons. Results are pushed in the `int` array:

- **Key Fields:**
    - `id`: The UUID of the geofence being violated.
    - `z`: Human-readable name of the zone (e.g., "Airport Restricted Area").
    - `s`: Start timestamp of the intrusion.
    - `e`: End timestamp (null if the drone is still inside the zone).

### Message Types
1. **Positional Packets (Event "p")**: Standard updates containing latitude, longitude, and height.
2. **Violation Events**: Triggered when a drone crosses a boundary. These are often accompanied by UI changes (red markers) and background triggers (SMS/Email).
3. **Telemetry Loss**: Status changes when a drone is no longer detected by sensors.

## 5. Security and Notification Logic
The site contains SMS templates for automatic warnings. A typical automated warning message follows this structure:

> "WARNING: Drone [Model] SERIAL: [SN] entered zone [Zone Name] at [Time]. Current altitude: [H]m."

This indicates that the backend has a notification engine tied directly to the stream processing loop.

## Conclusion
The "stream" the user sees in the browser for historical flights is a client-side illusion created by stitching together batch responses. To build a reliable collector or rebuilder for this data, one should focus on the `/api/v1/history/batch` endpoint with a sliding window for the `s` parameter.
