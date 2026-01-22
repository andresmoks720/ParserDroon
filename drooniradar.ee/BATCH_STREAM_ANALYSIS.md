# Batch Stream Analysis - Historical Flight Data

## Overview
This document analyzes the batch streaming mechanism used by drooniradar.ee to load historical flight position data.

## API Endpoint Structure

### Base URL Pattern
```
https://drooniradar.ee/api/v1/history/batch?s={timestamp}&d={duration}
```

### Query Parameters
- `s` - Start timestamp (Unix timestamp in seconds)
- `d` - Duration/batch size (in seconds)

## Captured Batch Requests

### Example from DJI Mini 4 Pro Flight (12:23, Jan 4 2026)
**Serial Number:** 1581F6Z9C239E0037R9Q

#### Batch Request 1
- **URL:** `https://drooniradar.ee/api/v1/history/batch?s=1767522214&d=10`
- **Start Time:** 1767522214 (Unix timestamp)
- **Duration:** 10 seconds
- **Request Headers:** None (standard fetch)
- **Response Headers:**
  ```json
  {
    "connection": "keep-alive",
    "content-type": "application/json; charset=utf-8",
    "date": "Sun, 04 Jan 2026 13:05:23 GMT",
    "server": "nginx",
    "transfer-encoding": "chunked"
  }
  ```

#### Response Data Structure
Each batch returns an array of position objects with the following schema:

```json
{
  "id": "20b9ab19-032e-4baf-8f5f-f491092765b1",
  "aid": "151dc9",
  "dc": {
    "lng": 20.40365,
    "lat": 57.88536
  },
  "yaw": null,
  "pc": null,
  "h": 10363.2,
  "ts": 1767522214024
}
```

### Field Definitions
- `id` - Unique position record ID (UUID)
- `aid` - Aircraft ID (hex string)
- `dc` - Drone coordinates object
  - `lng` - Longitude
  - `lat` - Latitude
- `yaw` - Drone yaw/heading (null in captured data)
- `pc` - Pilot coordinates (null in captured data)
- `h` - Height/altitude in meters
- `ts` - Timestamp in milliseconds

## Streaming Mechanism

### How It Works
1. When a historical flight is selected, the client initiates batch requests
2. Each request fetches 10 seconds worth of position data (`d=10`)
3. Subsequent requests increment the start timestamp (`s` parameter)
4. The client likely continues fetching batches until the flight ends or no more data is returned

### Batch Sequencing
```
Batch 1: s=1767522214, d=10  → positions from 1767522214 to 1767522224
Batch 2: s=1767522224, d=10  → positions from 1767522224 to 1767522234
Batch 3: s=1767522234, d=10  → positions from 1767522234 to 1767522244
...
```

## Implementation Notes

### For Replay Functionality
To implement historical flight replay:

1. **Get Flight Start Time**
   - Extract from flight metadata (start timestamp)

2. **Initialize Batch Loader**
   ```javascript
   let currentTimestamp = flightStartTime;
   const batchDuration = 10; // seconds
   ```

3. **Fetch Batches Sequentially**
   ```javascript
   async function fetchNextBatch(startTime) {
     const url = `https://drooniradar.ee/api/v1/history/batch?s=${startTime}&d=${batchDuration}`;
     const response = await fetch(url);
     const positions = await response.json();
     return positions;
   }
   ```

4. **Render Positions**
   - Process each position object
   - Update map markers/trails
   - Advance to next batch when current batch is exhausted

### Performance Considerations
- Batch size of 10 seconds balances latency and data volume
- Chunked transfer encoding allows streaming large responses
- Client can prefetch next batch while rendering current one

## Screenshots

![Flight Details Panel](file:///C:/Users/Mox/.gemini/antigravity/brain/cb6dba52-7239-43d0-8cce-c564f083f41f/flight_details_panel_1767531952882.png)

## Browser Recording

The complete interaction sequence showing the batch capture process:

![Batch Capture Recording](file:///C:/Users/Mox/.gemini/antigravity/brain/cb6dba52-7239-43d0-8cce-c564f083f41f/capture_batch_stream_1767531777318.webp)
