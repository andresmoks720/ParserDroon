# Drone Radar System: Comprehensive Information Flow

This document provides an in-depth overview of the Drone Radar system, detailing its architecture, data flow, and operational mechanics. It is designed for developers, engineers, and stakeholders seeking a thorough understanding of the system's functionality, from drone detection to real-time visualization and API interactions.

## Table of Contents

- [1. System Overview](#1-system-overview)
  - [1.1 Core Components](#11-core-components)
  - [1.2 System Architecture Diagram](#12-system-architecture-diagram)
- [2. Data Flow: Airspace Zones (Static/Semi-Static Data)](#2-data-flow-airspace-zones-staticsemi-static-data)
  - [2.1 Data Acquisition](#21-data-acquisition)
  - [2.2 Data Processing and Parsing](#22-data-processing-and-parsing)
  - [2.3 Data Presentation (Frontend)](#23-data-presentation-frontend)
- [3. Data Flow: Drone Detection and Real-time Information (Dynamic Data)](#3-data-flow-drone-detection-and-real-time-information-dynamic-data)
  - [3.1 Sensor Data Ingestion](#31-sensor-data-ingestion)
  - [3.2 Data Aggregation and Enrichment](#32-data-aggregation-and-enrichment)
  - [3.3 Decision Making and Alerting](#33-decision-making-and-alerting)
  - [3.4 Real-time Frontend Update](#34-real-time-frontend-update)
- [4. API Interactions Summary](#4-api-interactions-summary)
- [5. Technical Deep Dive](#5-technical-deep-dive)
  - [5.1 Signal Processing in Radar Systems](#51-signal-processing-in-radar-systems)
  - [5.2 CFAR Detection Algorithm](#52-cfar-detection-algorithm)
  - [5.3 Doppler Processing](#53-doppler-processing)
- [6. Comparative Analysis: Radar vs. Lidar](#6-comparative-analysis-radar-vs-lidar)
- [7. Limitations and Trade-offs](#7-limitations-and-trade-offs)
- [8. Radar MD API Integration and Real-Time Data Flow](#8-radar-md-api-integration-and-real-time-data-flow)
  - [8.1 API Call Flow](#81-api-call-flow)
  - [8.2 Data Aggregation Logic](#82-data-aggregation-logic)
  - [8.3 Real-Time Processing](#83-real-time-processing)
  - [8.4 GUI Data Rendering](#84-gui-data-rendering)
  - [8.5 Example Scenario: Drone Flight from Takeoff to Landing](#85-example-scenario-drone-flight-from-takeoff-to-landing)
  - [8.6 Edge Cases & Optimizations](#86-edge-cases--optimizations)
- [9. Data Fusion and API Integration for GUI Visualization](#9-data-fusion-and-api-integration-for-gui-visualization)
  - [9.1 Overview of Data Fusion](#91-overview-of-data-fusion)
  - [9.2 API Call Sequence for Drone Data](#92-api-call-sequence-for-drone-data)
  - [9.3 Data Fusion Process](#93-data-fusion-process)
  - [9.4 Data Flow Diagram](#94-data-flow-diagram)
  - [9.5 Example: Complete Data Fusion for a Flying Drone](#95-example-complete-data-fusion-for-a-flying-drone)
- [10. Conclusion](#10-conclusion)

## 1. System Overview

The Drone Radar system is designed to detect, track, and monitor unmanned aerial systems (UAS), commonly known as drones, in real-time. It provides critical information about drone flight paths, especially in relation to restricted airspace zones, ensuring compliance with aviation regulations and enhancing airspace safety.

### 1.1 Core Components

The system integrates data from multiple sources and processes it through a series of components:

- **Sensors**: Physical devices deployed in various geographical areas to detect drones. These include:
  - **ADS-B Receivers**: For detecting drones equipped with ADS-B transponders.
  - **Passive Radar**: For detecting drones without relying on cooperative transponders.
  - **Optical Sensors**: For visual confirmation and tracking.

- **Backend API**: Currently a static API serving JSON files, simulating a dynamic backend for development and prototyping. It provides configuration data for sensors, areas, and other system parameters.

- **External UTM Data Sources**: GeoJSON feeds providing information about restricted airspace zones. These are critical for ensuring drones operate within legal boundaries.

- **Data Stream Processor**: A proof-of-concept component designed to handle real-time drone tracking data. This component is essential for processing high-frequency data streams from sensors.

- **Parser Logic**: JavaScript modules responsible for processing raw data, especially GeoJSON, to extract meaningful information and apply business rules. Key modules include:
  - [`parser/namedLocationWorker.js`](parser/namedLocationWorker.js): For fetching and initial processing of GeoJSON data.
  - [`parser/uasParser.js`](parser/uasParser.js): For interpreting and structuring airspace data.
  - [`parser/displayLogic.js`](parser/displayLogic.js): For preparing data for visualization.

- **Frontend (Svelte)**: A single-page application responsible for visualizing all gathered information on an interactive map. It uses libraries like Leaflet.js for map rendering.

### 1.2 System Architecture Diagram

Below is a high-level architecture diagram illustrating the flow of data within the Drone Radar system:

```mermaid
graph TD
    A[Sensors] -->|Real-time Data| B[Data Stream Processor]
    B --> C[Backend API]
    C --> D[Parser Logic]
    D --> E[Frontend]
    F[External UTM Data] --> D
    C -->|Enriched Data| E
    E -->|Visualization| G[Interactive Map]
```

## 2. Data Flow: Airspace Zones (Static/Semi-Static Data)

The system continuously monitors and displays restricted airspace zones to inform users about flight regulations and potential hazards. This data flow primarily involves fetching and processing GeoJSON data from external UTM providers.

### 2.1 Data Acquisition

1. **Request for Airspace Data**: The frontend or backend service initiates a request to external UTM data providers for UAS airspace information.
   - **API Endpoint Example**: Requests are made to URLs like `https://utm.eans.ee/uas.geojson` and `https://utm.ans.lt/uas.geojson`.
   - **Mechanism**: These requests are typically HTTP GET requests to retrieve GeoJSON files. In the current project setup, these are represented by local files in the [`external/utm.eans.ee/uas.geojson`](external/utm.eans.ee/uas.geojson) and [`external/utm.ans.lt/uas.geojson`](external/utm.ans.lt/uas.geojson) directories.

2. **Data Reception**: The system receives GeoJSON data, which is a standard format for encoding geographical data structures. Each GeoJSON feature represents a specific airspace zone (e.g., restricted areas, no-fly zones).

### 2.2 Data Processing and Parsing

1. **Web Worker for Fetching and Initial Processing**: The [`parser/namedLocationWorker.js`](parser/namedLocationWorker.js) acts as a web worker. This is crucial for offloading heavy computational tasks from the main thread, ensuring a smooth user experience.
   - **Function**: The web worker is responsible for:
     - Fetching the `uas.geojson` data from the specified URLs.
     - Performing initial parsing of the GeoJSON structure.
     - Performing point-in-polygon checks to determine if a given geographical point (e.g., a drone's location) falls within any defined airspace zone.

2. **UAS Parser Logic**: The [`parser/uasParser.js`](parser/uasParser.js) module contains the core logic for interpreting the GeoJSON data.
   - **`AirZone` Class**: This class is central to structuring the parsed airspace data. It extracts and normalizes properties such as:
     - `restriction`: The type of restriction (e.g., `NO_RESTRICTION`, `REQ_AUTHORISATION`, `PROHIBITED`).
     - `identifier`: A unique identifier for the airspace zone (e.g., "EERZ79").
     - `name`: The human-readable name of the zone.
     - `lowerLimit`, `upperLimit`: Vertical boundaries of the airspace zone, along with their reference (`AGL` - Above Ground Level, or `MSL` - Mean Sea Level).
     - `message`: Detailed textual information about the restriction, often including contact information or specific procedures.
   - **Dynamic Interpretation of Restrictions**: The `restriction` property is dynamically determined based on `properties.reason` within the GeoJSON:
     - If `properties.reason` is "Sensitive", the zone is treated as `PROHIBITED`.
     - If `properties.reason` is anything other than "Other", it's treated as `REQ_AUTHORISATION`.
     - Otherwise, it defaults to `NO_RESTRICTION`.
   - **Data Filtering**: The parser also includes logic to exclude specific test or meta-zones (e.g., "EERZout", "EYVLOUT") to ensure only relevant airspace information is processed.

3. **Display Logic**: The [`parser/displayLogic.js`](parser/displayLogic.js) module is responsible for preparing the parsed airspace data for visualization.
   - **Styling**: It applies specific styling rules based on the `restriction` type:
     - `PROHIBITED` zones are typically styled in red (e.g., `#d44`).
     - `REQ_AUTHORISATION` zones are styled in blue (e.g., `#88d`).
   - **Localized Messages**: The system prioritizes localized messages (e.g., using `et-EE` for Estonian) from `extendedProperties.localizedMessages` to display information in the user's preferred language.

### 2.3 Data Presentation (Frontend)

1. **Map Rendering**: The processed airspace zone data is rendered on an interactive map using a library like Leaflet.js.
   - **`L.geoJSON` Layer**: Leaflet's `L.geoJSON` layer is used to display the geographical polygons of the airspace zones.
   - **Custom Styling**: The styling logic from `displayLogic.js` is applied via the `onEachFeature` callback of the `L.geoJSON` layer, ensuring that each zone is visually represented according to its restriction level.
   - **Information Display**: When a user interacts with a zone (e.g., clicks on it), the `message` and other relevant properties are displayed, providing immediate context about the airspace regulations.

## 3. Data Flow: Drone Detection and Real-time Information (Dynamic Data)

This section describes the real-time data flow for drone detection and tracking. While the current backend is static, the architecture supports dynamic data ingestion.

### 3.1 Sensor Data Ingestion

1. **Sensor Network**: The system relies on a network of physical sensors (e.g., ADS-B receivers, passive radar) deployed in various locations.
   - **Sensor Types**: The `api/v1/sensors.json` file indicates different sensor types (e.g., `type: 0`, `type: 1`, `type: 2`, `type: 3`), suggesting a variety of detection technologies.
   - **Sensor Location**: Each sensor has an `id`, `name`, `serialNr`, and optionally a `location` (longitude and latitude). The `areaId` links sensors to predefined geographical areas (e.g., "Kaitseliit", "HexTech", "Lennujaam") defined in `api/v1/areas.json`.

2. **Real-time Data Stream**: Sensors continuously detect drones and transmit their data to a central processing unit.
   - **Mechanism**: This would typically involve a real-time data streaming protocol (e.g., WebSockets, MQTT) or periodic API calls. The presence of the `stream/` directory and files like `stream/poc_stream.js` and `stream/schema_mock.json` strongly suggests a streaming architecture for live data.
   - **Data Content**: Real-time drone data would include:
     - Drone Identifier (e.g., serial number, transponder code).
     - Geographical Coordinates (longitude, latitude).
     - Altitude.
     - Speed and Heading.
     - Timestamp.
     - Sensor ID (identifying which sensor detected the drone).

### 3.2 Data Aggregation and Enrichment

1. **Backend Ingestion**: The real-time drone data stream is ingested by the backend.
   - **Processing**: The backend processes this raw data, potentially filtering out noise, correlating data from multiple sensors, and performing initial validation.

2. **Data Enrichment via APIs**: The ingested drone data is enriched with additional context by making requests to various internal and external APIs.
   - **Sensor Information**:
     - **Request**: The backend queries an endpoint like `api/v1/sensors.json` (or a dynamic equivalent) using the `sensor ID` from the drone data.
     - **Purpose**: To retrieve detailed information about the detecting sensor, such as its exact location, type, and associated `areaId`.
   - **Area Information**:
     - **Request**: Using the `areaId` obtained from the sensor information, the backend queries an endpoint like `api/v1/areas.json` (or a dynamic equivalent).
     - **Purpose**: To get the name and other details of the geographical area where the drone was detected.
   - **Weather Information**:
     - **Request**: The backend might query an external weather API or an internal endpoint like `api/v1/weather/latest.json`.
     - **Purpose**: To gather local weather conditions (wind speed, temperature, precipitation) that could affect drone flight or provide context for anomalies.
   - **Geofencing and Authorization**:
     - **Request**: The drone's current location and flight path are checked against geofencing rules and restricted airspace data. This involves querying the processed UTM data (from `uas.geojson`).
     - **API Endpoint Example**: `api/v1/geofencing/area.json` and `api/v1/geofencing/templates/sms/all.json` suggest that the system can retrieve geofencing configurations and potentially trigger automated responses (like SMS alerts).
     - **Purpose**: To determine if the drone is operating within a permitted zone, requires authorization, or is in a prohibited area. This involves spatial queries (point-in-polygon or line-in-polygon).
   - **Drone Classification/Organization Data**:
     - **Request**: If the drone has an identifiable serial number or other unique ID, the system might query `api/v1/organizations/drone/classification.json` to retrieve information about the drone's owner, type, or operational permissions.
     - **Purpose**: To provide additional context about the drone, such as whether it's a registered commercial drone, a recreational drone, or an unknown entity.
   - **User Profile Data**:
     - **Request**: If the system supports user accounts and drone registration, `api/v1/users/profile/` could be queried to link drone operations to specific users.
     - **Purpose**: To identify the operator of a detected drone, if known.

### 3.3 Decision Making and Alerting

1. **Rule Engine**: Based on the aggregated and enriched data, a rule engine evaluates the drone's status against predefined operational rules and airspace regulations.
   - **Conditions**: Rules might include:
     - Is the drone within a `PROHIBITED` zone?
     - Is the drone within a `REQ_AUTHORISATION` zone without proper authorization?
     - Is the drone flying above its permitted altitude?
     - Is the drone operating outside of approved hours or weather conditions?
   - **Actions**: Depending on the rule violations, the system can trigger various actions:
     - **Visual Alerts**: Displaying prominent warnings on the frontend map.
     - **Notifications**: Sending alerts to operators, authorities, or relevant personnel (e.g., via SMS using templates from `api/v1/geofencing/templates/sms/all.json`).
     - **Logging**: Recording incidents for audit and analysis.

### 3.4 Real-time Frontend Update

1. **Data Transmission**: The processed and enriched drone data, along with any associated alerts or status updates, is transmitted to the frontend.
   - **Mechanism**: This would typically be via the same real-time streaming mechanism used for data ingestion (e.g., WebSockets).

2. **Frontend Visualization**: The frontend updates the interactive map in real-time.
   - **Drone Markers**: Drones are displayed as dynamic markers on the map, showing their current position, altitude, and potentially their flight path.
   - **Color-coding/Icons**: Drones might be color-coded or use specific icons (e.g., from `icon_sets_251019/civ_icons/pilot/default_signal.png`) to indicate their status (e.g., authorized, unauthorized, unknown).
   - **Alert Overlays**: Visual alerts and messages related to airspace violations are displayed prominently on the map, drawing the user's attention to critical events.

## 4. API Interactions Summary

The system relies heavily on API interactions to gather, enrich, and manage data.

- **External GeoJSON APIs**:
  - **Purpose**: Retrieve static/semi-static airspace zone definitions.
  - **Endpoints**: `https://utm.eans.ee/uas.geojson`, `https://utm.ans.lt/uas.geojson`.
  - **Frequency**: Typically fetched periodically (e.g., hourly, daily) or on system startup, as these zones do not change rapidly.

- **Internal Mock/Configuration APIs (Current State)**:
  - **Purpose**: Provide configuration and static data for sensors, areas, and other system parameters. These are placeholders for a dynamic backend.
  - **Endpoints**:
    - [`api/v1/sensors.json`](api/v1/sensors.json): Provides a list of all registered sensors, their types, and locations.
    - [`api/v1/areas.json`](api/v1/areas.json): Defines geographical areas and their properties.
    - [`api/v1/health.json`](api/v1/health.json): System health status.
    - [`api/v1/geofencing/area.json`](api/v1/geofencing/area.json): Geofencing configurations.
    - [`api/v1/geofencing/templates/sms/all.json`](api/v1/geofencing/templates/sms/all.json): Templates for SMS alerts related to geofencing.
    - [`api/v1/organizations/drone/classification.json`](api/v1/organizations/drone/classification.json): Drone classification data.
    - [`api/v1/users/profile/`](api/v1/users/profile/): User profile information.
    - [`api/v1/weather/latest.json`](api/v1/weather/latest.json): Latest weather data.
  - **Frequency**: Fetched on demand by the frontend or backend services as needed for display or processing.

- **Real-time Data Stream (Planned/Hypothetical)**:
  - **Purpose**: Ingest live drone tracking data from sensors.
  - **Mechanism**: Likely WebSockets or a similar push-based protocol.
  - **Frequency**: Continuous.

## 5. Technical Deep Dive

### 5.1 Signal Processing in Radar Systems

Radar systems rely on signal processing techniques to detect and track objects. The key steps include:

1. **Signal Transmission**: A radar system transmits a signal (e.g., a pulse or continuous wave) into the environment.
2. **Signal Reflection**: The signal reflects off objects (e.g., drones) and returns to the radar receiver.
3. **Signal Reception**: The receiver captures the reflected signal, which is typically weaker and delayed compared to the transmitted signal.
4. **Signal Processing**: The received signal is processed to extract information about the object, such as its range, velocity, and direction.

### 5.2 CFAR Detection Algorithm

The Constant False Alarm Rate (CFAR) algorithm is a common technique used in radar systems to detect targets in noisy environments. The algorithm dynamically adjusts the detection threshold based on the noise level to maintain a constant false alarm rate.

```python
import numpy as np

def cfar_detection(signal, guard_cells, reference_cells, pfa):
    """
    Implement CFAR detection algorithm.
    
    Parameters:
    - signal: Input signal array
    - guard_cells: Number of guard cells around the cell under test
    - reference_cells: Number of reference cells for noise estimation
    - pfa: Probability of false alarm
    
    Returns:
    - threshold: Detection threshold for each cell
    """
    n = len(signal)
    threshold = np.zeros(n)
    
    for i in range(n):
        # Define the range for reference cells
        start = max(0, i - guard_cells - reference_cells)
        end = min(n, i + guard_cells + reference_cells)
        
        # Exclude guard cells and the cell under test
        ref_cells = np.concatenate([signal[start:i-guard_cells], signal[i+guard_cells+1:end]])
        
        # Estimate noise level
        noise_level = np.mean(ref_cells)
        
        # Calculate threshold based on noise level and PFA
        threshold[i] = noise_level * np.log(1/pfa)
    
    return threshold
```

### 5.3 Doppler Processing

Doppler processing is used to estimate the velocity of a moving object based on the frequency shift of the reflected signal. The Doppler shift is calculated as:

```
fd = (2 * v * cos(theta)) / lambda
```

where:
- `fd` is the Doppler frequency shift,
- `v` is the velocity of the object,
- `theta` is the angle between the object's direction of motion and the radar line of sight,
- `lambda` is the wavelength of the transmitted signal.

## 6. Comparative Analysis: Radar vs. Lidar

| Feature               | Radar System                          | Lidar System                          |
|-----------------------|---------------------------------------|---------------------------------------|
| **Wavelength**        | Longer (e.g., microwave, radio)       | Shorter (e.g., infrared, visible)     |
| **Range**             | Long-range detection                  | Short to medium-range detection       |
| **Weather Resistance**| High (less affected by weather)       | Low (affected by rain, fog)          |
| **Resolution**        | Lower resolution                      | Higher resolution                     |
| **Cost**              | Generally lower cost                  | Generally higher cost                 |
| **Use Case**          | Air traffic control, drone detection  | Autonomous vehicles, 3D mapping       |

## 7. Limitations and Trade-offs

- **Sensor Limitations**: Radar systems may struggle with detecting small or low-flying drones, especially in cluttered environments.
- **Data Latency**: Real-time processing introduces latency, which can affect the system's responsiveness.
- **False Positives/Negatives**: Environmental factors (e.g., weather, interference) can lead to false detections or missed detections.
- **Scalability**: As the number of sensors and drones increases, the system must scale to handle the increased data volume.

## 8. Radar MD API Integration and Real-Time Data Flow

This section provides a detailed technical breakdown of how the Radar MD API integrates and sequences its calls to aggregate, process, and display real-time data about a flying drone on the GUI.

### 8.1 API Call Flow

The interaction between the frontend (GUI) and backend (Radar MD API) involves a series of steps to ensure seamless data flow and real-time updates.

#### Initialization and Authentication

1. **Authentication Handshake**:
   - The frontend initiates a connection to the backend API using an authentication token or API key.
   - Example:
     ```http
     POST /api/v1/auth/login
     Content-Type: application/json
     
     {
       "username": "user@example.com",
       "password": "securepassword"
     }
     ```
   - Response:
     ```json
     {
       "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "expiresIn": 3600
     }
     ```

2. **Session Establishment**:
   - The frontend uses the token to establish a WebSocket connection for real-time updates.
   - Example:
     ```javascript
     const socket = new WebSocket('wss://api.radar-md.com/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
     ```

#### Data Request Triggers

1. **Drone Detection Event**:
   - When a sensor detects a drone, it triggers a series of API calls to retrieve and process drone data.
   - Example:
     ```http
     GET /api/v1/drones/{droneId}/metadata
     Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```

2. **Periodic Polling**:
   - The frontend periodically polls the backend for updates on drone status and telemetry.
   - Example:
     ```http
     GET /api/v1/drones/{droneId}/telemetry?interval=5s
     Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     ```

3. **Event-Based Updates**:
   - The backend pushes updates to the frontend via WebSocket when critical events occur (e.g., drone entering a no-fly zone).
   - Example WebSocket Message:
     ```json
     {
       "event": "drone_alert",
       "droneId": "drone123",
       "alertType": "no_fly_zone_violation",
       "timestamp": "2023-10-01T12:00:00Z"
     }
     ```

#### Chaining of Dependent API Calls

1. **Sequential API Calls**:
   - The frontend or backend chains API calls to aggregate all necessary data for a drone.
   - Example Sequence:
     - `GET /api/v1/drones/{droneId}/metadata` → Retrieve drone metadata.
     - `GET /api/v1/drones/{droneId}/telemetry` → Retrieve telemetry data.
     - `GET /api/v1/drones/{droneId}/flightpath` → Retrieve flight path.

2. **Parallel API Calls**:
   - For efficiency, non-dependent API calls are made in parallel.
   - Example:
     ```javascript
     Promise.all([
       fetch(`/api/v1/drones/${droneId}/metadata`),
       fetch(`/api/v1/drones/${droneId}/telemetry`)
     ])
     .then(responses => Promise.all(responses.map(res => res.json())))
     .then(data => console.log(data));
     ```

#### Error Handling and Retry Mechanisms

1. **Retry Logic**:
   - Failed API calls are retried with exponential backoff.
   - Example:
     ```javascript
     async function fetchWithRetry(url, retries = 3, delay = 1000) {
       try {
         const response = await fetch(url);
         if (!response.ok) throw new Error('Request failed');
         return await response.json();
       } catch (error) {
         if (retries <= 0) throw error;
         await new Promise(resolve => setTimeout(resolve, delay));
         return fetchWithRetry(url, retries - 1, delay * 2);
       }
     }
     ```

2. **Fallback Mechanisms**:
   - If an API call fails repeatedly, the system falls back to cached data or displays a user-friendly error message.

### 8.2 Data Aggregation Logic

#### Merging and Normalizing Data

1. **Data Merging**:
   - Raw data from multiple API endpoints is merged into a unified structure.
   - Example:
     ```json
     {
       "drone": {
         "metadata": {
           "id": "drone123",
           "model": "DJI Mavic 3",
           "serialNumber": "SN123456789"
         },
         "telemetry": {
           "latitude": 59.4370,
           "longitude": 24.7536,
           "altitude": 120,
           "speed": 15.5,
           "heading": 45,
           "timestamp": "2023-10-01T12:00:00Z"
         },
         "flightPath": [
           {"latitude": 59.4360, "longitude": 24.7526, "timestamp": "2023-10-01T11:59:00Z"},
           {"latitude": 59.4365, "longitude": 24.7531, "timestamp": "2023-10-01T11:59:30Z"}
         ]
       }
     }
     ```

2. **Data Normalization**:
   - Data from different sources is normalized to ensure consistency.
   - Example: Converting altitude from meters to feet for display.

#### Timestamp Synchronization

1. **Temporal Consistency**:
   - Timestamps across datasets are synchronized to ensure accurate correlation of events.
   - Example:
     ```javascript
     const synchronizedData = data.map(item => ({
       ...item,
       timestamp: new Date(item.timestamp).toISOString()
     }));
     ```

#### Conflict Resolution

1. **Handling Conflicting Data**:
   - Conflicting data (e.g., altitude readings from different sensors) is resolved using predefined rules or algorithms.
   - Example: Averaging conflicting altitude readings.

### 8.3 Real-Time Processing

#### Streaming vs. Batch Processing

1. **WebSockets for Live Telemetry**:
   - The system uses WebSockets to stream live telemetry updates from drones to the frontend.
   - Example:
     ```javascript
     socket.onmessage = (event) => {
       const telemetry = JSON.parse(event.data);
       updateDronePosition(telemetry);
     };
     ```

2. **Server-Sent Events (SSE)**:
   - For environments where WebSockets are not supported, SSE is used as a fallback.
   - Example:
     ```javascript
     const eventSource = new EventSource('/api/v1/drones/{droneId}/telemetry/stream');
     eventSource.onmessage = (event) => {
       const telemetry = JSON.parse(event.data);
       updateDronePosition(telemetry);
     };
     ```

#### Throttling and Rate-Limiting

1. **Throttling Updates**:
   - To prevent GUI lag, updates are throttled to a maximum frequency (e.g., 10 updates per second).
   - Example:
     ```javascript
     const throttle = (func, limit) => {
       let lastFunc;
       let lastRan;
       return function() {
         const context = this;
         const args = arguments;
         if (!lastRan) {
           func.apply(context, args);
           lastRan = Date.now();
         } else {
           clearTimeout(lastFunc);
           lastFunc = setTimeout(() => {
             if ((Date.now() - lastRan) >= limit) {
               func.apply(context, args);
               lastRan = Date.now();
             }
           }, limit - (Date.now() - lastRan));
         }
       };
     };
     ```

2. **Rate-Limiting API Calls**:
   - API calls are rate-limited to prevent overloading the backend.
   - Example:
     ```javascript
     const rateLimit = (func, limit) => {
       let queue = [];
       let inProgress = false;
       
       return function() {
         queue.push({ context: this, args: arguments });
         if (!inProgress) {
           inProgress = true;
           setTimeout(() => {
             const item = queue.shift();
             func.apply(item.context, item.args);
             inProgress = false;
           }, limit);
         }
       };
     };
     ```

#### Caching Mechanisms

1. **Redis Caching**:
   - Frequently accessed drone attributes are cached in Redis to reduce latency.
   - Example:
     ```javascript
     async function getDroneMetadata(droneId) {
       const cachedData = await redis.get(`drone:${droneId}:metadata`);
       if (cachedData) return JSON.parse(cachedData);
       
       const response = await fetch(`/api/v1/drones/${droneId}/metadata`);
       const data = await response.json();
       await redis.setex(`drone:${droneId}:metadata`, 3600, JSON.stringify(data));
       return data;
     }
     ```

### 8.4 GUI Data Rendering

#### Structuring Data for the Frontend

1. **JSON Payload Structure**:
   - Aggregated data is structured into a JSON payload for the frontend.
   - Example:
     ```json
     {
       "drone": {
         "id": "drone123",
         "model": "DJI Mavic 3",
         "serialNumber": "SN123456789",
         "telemetry": {
           "position": {
             "latitude": 59.4370,
             "longitude": 24.7536,
             "altitude": 120
           },
           "speed": 15.5,
           "heading": 45,
           "battery": 85,
           "timestamp": "2023-10-01T12:00:00Z"
         },
         "flightPath": [
           {"latitude": 59.4360, "longitude": 24.7526, "timestamp": "2023-10-01T11:59:00Z"},
           {"latitude": 59.4365, "longitude": 24.7531, "timestamp": "2023-10-01T11:59:30Z"}
         ],
         "alerts": [
           {
             "type": "no_fly_zone_violation",
             "message": "Drone entered a no-fly zone.",
             "timestamp": "2023-10-01T12:00:00Z"
           }
         ]
       }
     }
     ```

#### Mapping API Fields to GUI Components

1. **Field Mapping**:
   - API fields are mapped to specific GUI components for display.
   - Example:
     - `drone.telemetry.position` → Map marker position.
     - `drone.telemetry.speed` → Speedometer widget.
     - `drone.telemetry.battery` → Battery status bar.
     - `drone.alerts` → Alert overlay.

2. **Dynamic Updates**:
   - The GUI dynamically updates based on API push notifications.
   - Example:
     ```javascript
     function updateDronePosition(telemetry) {
       map.setView([telemetry.position.latitude, telemetry.position.longitude]);
       speedometer.update(telemetry.speed);
       batteryStatus.update(telemetry.battery);
       
       if (telemetry.alerts && telemetry.alerts.length > 0) {
         showAlert(telemetry.alerts[0].message);
       }
     }
     ```

### 8.5 Example Scenario: Drone Flight from Takeoff to Landing

#### Sequence of API Calls

1. **Takeoff Phase**:
   - **API Call**: `POST /api/v1/drones/{droneId}/takeoff`
   - **Request Payload**:
     ```json
     {
       "droneId": "drone123",
       "initialPosition": {
         "latitude": 59.4360,
         "longitude": 24.7526,
         "altitude": 0
       }
     }
     ```
   - **Response**:
     ```json
     {
       "status": "success",
       "message": "Drone takeoff initiated.",
       "timestamp": "2023-10-01T11:59:00Z"
     }
     ```
   - **GUI Update**: The drone marker appears on the map at the takeoff location.

2. **In-Flight Phase**:
   - **API Call**: `GET /api/v1/drones/{droneId}/telemetry?interval=1s`
   - **Response**:
     ```json
     {
       "telemetry": {
         "position": {
           "latitude": 59.4370,
           "longitude": 24.7536,
           "altitude": 120
         },
         "speed": 15.5,
         "heading": 45,
         "battery": 85,
         "timestamp": "2023-10-01T12:00:00Z"
       }
     }
     ```
   - **GUI Update**: The drone marker moves on the map, and the speedometer and battery status are updated.

3. **Alert Phase**:
   - **WebSocket Message**:
     ```json
     {
       "event": "drone_alert",
       "droneId": "drone123",
       "alertType": "no_fly_zone_violation",
       "message": "Drone entered a no-fly zone.",
       "timestamp": "2023-10-01T12:00:00Z"
     }
     ```
   - **GUI Update**: An alert overlay appears on the map, and the drone marker turns red.

4. **Landing Phase**:
   - **API Call**: `POST /api/v1/drones/{droneId}/land`
   - **Request Payload**:
     ```json
     {
       "droneId": "drone123",
       "finalPosition": {
         "latitude": 59.4380,
         "longitude": 24.7546,
         "altitude": 0
       }
     }
     ```
   - **Response**:
     ```json
     {
       "status": "success",
       "message": "Drone landing completed.",
       "timestamp": "2023-10-01T12:05:00Z"
     }
     ```
   - **GUI Update**: The drone marker disappears from the map, and a landing confirmation message is displayed.

### 8.6 Edge Cases & Optimizations

#### Handling Intermittent Connectivity

1. **Offline Mode**:
   - The GUI caches the last known drone state and displays it when connectivity is lost.
   - Example:
     ```javascript
     let lastKnownState = null;
     
     socket.onmessage = (event) => {
       const telemetry = JSON.parse(event.data);
       lastKnownState = telemetry;
       updateDronePosition(telemetry);
     };
     
     socket.onclose = () => {
       if (lastKnownState) {
         showOfflineWarning();
         updateDronePosition(lastKnownState);
       }
     };
     ```

2. **Reconnection Logic**:
   - The GUI automatically attempts to reconnect to the WebSocket.
   - Example:
     ```javascript
     function reconnect() {
       setTimeout(() => {
         socket = new WebSocket('wss://api.radar-md.com/ws?token=...');
         socket.onopen = () => console.log('Reconnected');
         socket.onclose = reconnect;
       }, 5000);
     }
     ```

#### Prioritization of Critical Data

1. **Data Prioritization**:
   - Critical data (e.g., altitude, position) is prioritized over non-critical data (e.g., camera feed) during high-latency conditions.
   - Example:
     ```javascript
     function prioritizeData(data) {
       const criticalData = {
         position: data.position,
         altitude: data.altitude,
         battery: data.battery
       };
       return criticalData;
     }
     ```

#### API Versioning and Backward Compatibility

1. **Versioned APIs**:
   - The backend supports multiple API versions to ensure backward compatibility.
   - Example:
     ```http
     GET /api/v2/drones/{droneId}/telemetry
     ```

2. **Feature Detection**:
   - The frontend detects supported API features and adapts accordingly.
   - Example:
     ```javascript
     async function checkApiFeatures() {
       const response = await fetch('/api/features');
       const features = await response.json();
       if (features.includes('real-time-telemetry')) {
         enableWebSocketUpdates();
       }
     }
     ```

## 9. Data Fusion and API Integration for GUI Visualization

This section explains how API calls work together to provide all the data visible about a flying drone on the GUI, including where and how data is fused.

### 9.1 Overview of Data Fusion

Data fusion is the process of combining data from multiple sources to produce a unified and comprehensive view of a drone's status and environment. In the Drone Radar system, data fusion occurs at multiple levels:

1. **Sensor-Level Fusion**: Combining data from multiple sensors (e.g., radar, ADS-B, optical) to detect and track drones.
2. **API-Level Fusion**: Aggregating data from various API endpoints to enrich drone information.
3. **GUI-Level Fusion**: Merging processed data for visualization on the frontend.

### 9.2 API Call Sequence for Drone Data

The following sequence of API calls is made to gather all necessary data for displaying a drone on the GUI:

1. **Detect Drone**:
   - **API Call**: `GET /api/v1/sensors/{sensorId}/detections`
   - **Purpose**: Retrieve the initial detection of a drone by a sensor.
   - **Response**:
     ```json
     {
       "detectionId": "det123",
       "droneId": "drone456",
       "sensorId": "sensor789",
       "timestamp": "2023-10-01T12:00:00Z"
     }
     ```

2. **Retrieve Drone Metadata**:
   - **API Call**: `GET /api/v1/drones/{droneId}/metadata`
   - **Purpose**: Retrieve static information about the drone.
   - **Response**:
     ```json
     {
       "id": "drone456",
       "model": "DJI Mavic 3",
       "serialNumber": "SN987654321",
       "operator": "operator123"
     }
     ```

3. **Retrieve Real-Time Telemetry**:
   - **API Call**: `GET /api/v1/drones/{droneId}/telemetry`
   - **Purpose**: Retrieve real-time telemetry data.
   - **Response**:
     ```json
     {
       "position": {
         "latitude": 59.4370,
         "longitude": 24.7536,
         "altitude": 120
       },
       "speed": 15.5,
       "heading": 45,
       "battery": 85,
       "timestamp": "2023-10-01T12:00:00Z"
     }
     ```

4. **Retrieve Flight Path**:
   - **API Call**: `GET /api/v1/drones/{droneId}/flightpath`
   - **Purpose**: Retrieve the drone's flight path.
   - **Response**:
     ```json
     {
       "path": [
         {"latitude": 59.4360, "longitude": 24.7526, "timestamp": "2023-10-01T11:59:00Z"},
         {"latitude": 59.4365, "longitude": 24.7531, "timestamp": "2023-10-01T11:59:30Z"}
       ]
     }
     ```

5. **Retrieve Sensor Information**:
   - **API Call**: `GET /api/v1/sensors/{sensorId}`
   - **Purpose**: Retrieve information about the detecting sensor.
   - **Response**:
     ```json
     {
       "id": "sensor789",
       "name": "Sensor Alpha",
       "type": "radar",
       "location": {
         "latitude": 59.4350,
         "longitude": 24.7516
       }
     }
     ```

6. **Retrieve Airspace Information**:
   - **API Call**: `GET /api/v1/airspace?latitude=59.4370&longitude=24.7536`
   - **Purpose**: Retrieve airspace restrictions at the drone's current location.
   - **Response**:
     ```json
     {
       "zones": [
         {
           "id": "zone123",
           "name": "No-Fly Zone Alpha",
           "restriction": "PROHIBITED",
           "message": "Unauthorized drone flight prohibited."
         }
       ]
     }
     ```

7. **Retrieve Weather Information**:
   - **API Call**: `GET /api/v1/weather?latitude=59.4370&longitude=24.7536`
   - **Purpose**: Retrieve weather conditions at the drone's location.
   - **Response**:
     ```json
     {
       "temperature": 15.5,
       "windSpeed": 10.2,
       "windDirection": 180,
       "precipitation": 0.0
     }
     ```

### 9.3 Data Fusion Process

The data fusion process involves the following steps:

1. **Data Collection**:
   - Data is collected from multiple API endpoints and sensors.
   - Example:
     ```javascript
     const droneData = {
       metadata: await fetchDroneMetadata(droneId),
       telemetry: await fetchDroneTelemetry(droneId),
       flightPath: await fetchDroneFlightPath(droneId),
       sensor: await fetchSensorInfo(sensorId),
       airspace: await fetchAirspaceInfo(telemetry.position.latitude, telemetry.position.longitude),
       weather: await fetchWeatherInfo(telemetry.position.latitude, telemetry.position.longitude)
     };
     ```

2. **Data Normalization**:
   - Data from different sources is normalized to ensure consistency.
   - Example: Converting units, aligning timestamps, and standardizing data formats.

3. **Data Enrichment**:
   - Additional context is added to the raw data.
   - Example: Adding airspace restriction information to the drone's telemetry data.

4. **Conflict Resolution**:
   - Conflicting data is resolved using predefined rules.
   - Example: Averaging altitude readings from multiple sensors.

5. **Data Aggregation**:
   - All data is aggregated into a single payload for the frontend.
   - Example:
     ```json
     {
       "drone": {
         "id": "drone456",
         "model": "DJI Mavic 3",
         "serialNumber": "SN987654321",
         "operator": "operator123",
         "telemetry": {
           "position": {
             "latitude": 59.4370,
             "longitude": 24.7536,
             "altitude": 120
           },
           "speed": 15.5,
           "heading": 45,
           "battery": 85,
           "timestamp": "2023-10-01T12:00:00Z"
         },
         "flightPath": [
           {"latitude": 59.4360, "longitude": 24.7526, "timestamp": "2023-10-01T11:59:00Z"},
           {"latitude": 59.4365, "longitude": 24.7531, "timestamp": "2023-10-01T11:59:30Z"}
         ],
         "sensor": {
           "id": "sensor789",
           "name": "Sensor Alpha",
           "type": "radar",
           "location": {
             "latitude": 59.4350,
             "longitude": 24.7516
           }
         },
         "airspace": {
           "zones": [
             {
               "id": "zone123",
               "name": "No-Fly Zone Alpha",
               "restriction": "PROHIBITED",
               "message": "Unauthorized drone flight prohibited."
             }
           ]
         },
         "weather": {
           "temperature": 15.5,
           "windSpeed": 10.2,
           "windDirection": 180,
           "precipitation": 0.0
         }
       }
     }
     ```

### 9.4 Data Flow Diagram

Below is a diagram illustrating the data flow and fusion process:

```mermaid
graph TD
    A[Sensors] -->|Detect Drone| B[Backend API]
    B -->|Retrieve Metadata| C[Drone Metadata]
    B -->|Retrieve Telemetry| D[Drone Telemetry]
    B -->|Retrieve Flight Path| E[Flight Path]
    B -->|Retrieve Sensor Info| F[Sensor Info]
    B -->|Retrieve Airspace Info| G[Airspace Info]
    B -->|Retrieve Weather Info| H[Weather Info]
    C --> I[Data Fusion]
    D --> I
    E --> I
    F --> I
    G --> I
    H --> I
    I --> J[Frontend]
    J --> K[GUI Visualization]
```

### 9.5 Example: Complete Data Fusion for a Flying Drone

#### Step-by-Step Data Fusion

1. **Initial Detection**:
   - A sensor detects a drone and sends a detection event to the backend.
   - Example Detection Event:
     ```json
     {
       "detectionId": "det123",
       "droneId": "drone456",
       "sensorId": "sensor789",
       "timestamp": "2023-10-01T12:00:00Z"
     }
     ```

2. **Retrieve Drone Metadata**:
   - The backend retrieves static metadata about the drone.
   - Example Metadata:
     ```json
     {
       "id": "drone456",
       "model": "DJI Mavic 3",
       "serialNumber": "SN987654321",
       "operator": "operator123"
     }
     ```

3. **Retrieve Real-Time Telemetry**:
   - The backend retrieves real-time telemetry data from the drone.
   - Example Telemetry:
     ```json
     {
       "position": {
         "latitude": 59.4370,
         "longitude": 24.7536,
         "altitude": 120
       },
       "speed": 15.5,
       "heading": 45,
       "battery": 85,
       "timestamp": "2023-10-01T12:00:00Z"
     }
     ```

4. **Retrieve Flight Path**:
   - The backend retrieves the drone's flight path.
   - Example Flight Path:
     ```json
     {
       "path": [
         {"latitude": 59.4360, "longitude": 24.7526, "timestamp": "2023-10-01T11:59:00Z"},
         {"latitude": 59.4365, "longitude": 24.7531, "timestamp": "2023-10-01T11:59:30Z"}
       ]
     }
     ```

5. **Retrieve Sensor Information**:
   - The backend retrieves information about the detecting sensor.
   - Example Sensor Info:
     ```json
     {
       "id": "sensor789",
       "name": "Sensor Alpha",
       "type": "radar",
       "location": {
         "latitude": 59.4350,
         "longitude": 24.7516
       }
     }
     ```

6. **Retrieve Airspace Information**:
   - The backend retrieves airspace restrictions at the drone's current location.
   - Example Airspace Info:
     ```json
     {
       "zones": [
         {
           "id": "zone123",
           "name": "No-Fly Zone Alpha",
           "restriction": "PROHIBITED",
           "message": "Unauthorized drone flight prohibited."
         }
       ]
     }
     ```

7. **Retrieve Weather Information**:
   - The backend retrieves weather conditions at the drone's location.
   - Example Weather Info:
     ```json
     {
       "temperature": 15.5,
       "windSpeed": 10.2,
       "windDirection": 180,
       "precipitation": 0.0
     }
     ```

8. **Data Fusion**:
   - All retrieved data is fused into a single payload.
   - Example Fused Data:
     ```json
     {
       "drone": {
         "id": "drone456",
         "model": "DJI Mavic 3",
         "serialNumber": "SN987654321",
         "operator": "operator123",
         "telemetry": {
           "position": {
             "latitude": 59.4370,
             "longitude": 24.7536,
             "altitude": 120
           },
           "speed": 15.5,
           "heading": 45,
           "battery": 85,
           "timestamp": "2023-10-01T12:00:00Z"
         },
         "flightPath": [
           {"latitude": 59.4360, "longitude": 24.7526, "timestamp": "2023-10-01T11:59:00Z"},
           {"latitude": 59.4365, "longitude": 24.7531, "timestamp": "2023-10-01T11:59:30Z"}
         ],
         "sensor": {
           "id": "sensor789",
           "name": "Sensor Alpha",
           "type": "radar",
           "location": {
             "latitude": 59.4350,
             "longitude": 24.7516
           }
         },
         "airspace": {
           "zones": [
             {
               "id": "zone123",
               "name": "No-Fly Zone Alpha",
               "restriction": "PROHIBITED",
               "message": "Unauthorized drone flight prohibited."
             }
           ]
         },
         "weather": {
           "temperature": 15.5,
           "windSpeed": 10.2,
           "windDirection": 180,
           "precipitation": 0.0
         }
       }
     }
     ```

9. **GUI Visualization**:
   - The fused data is sent to the frontend for visualization.
   - Example GUI Updates:
     - The drone's position is displayed on the map.
     - The drone's speed, heading, and battery status are shown in the dashboard.
     - The flight path is drawn on the map.
     - Airspace restrictions are highlighted, and alerts are displayed if the drone enters a restricted zone.
     - Weather conditions are shown in a sidebar.

## 10. Conclusion

The Drone Radar system orchestrates a complex information flow, combining static airspace regulations with dynamic drone tracking data. By leveraging external UTM data, internal configuration APIs, and a real-time data stream, the system aims to provide a comprehensive and up-to-date operational picture. The parsing and display logic ensure that raw geographical and sensor data is transformed into actionable insights, presented intuitively on an interactive map for effective drone monitoring and airspace management.

For further reading, refer to:
- [IEEE 802.11 Standards for Radar in Wi-Fi](https://standards.ieee.org/standard/802_11-2020.html)
- [GeoJSON Specification](https://geojson.org/)
- [Leaflet.js Documentation](https://leafletjs.com/)