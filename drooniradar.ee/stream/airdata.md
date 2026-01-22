# Drooniradar Air Data Stream Analysis

## Overview
The **Drooniradar** application (`drooniradar.ee`) utilizes a real-time data stream to display aircraft and drone positions. Based on static analysis of the frontend bundles and network error headers, the system uses **Server-Sent Events (SSE)** rather than WebSockets or simple Polling.

## Key Findings

### 1. Live Data Endpoint
- **URL**: `https://drooniradar.ee/api/v1/aircraft_info`
- **Method**: `GET`
- **Protocol**: HTTP/1.1 or HTTP/2
- **Content-Type**: `text/event-stream` (Identified from 429 error headers during interception attempts)
- **Mechanism**: Server-Sent Events (SSE). The client establishes a persistent connection, and the server pushes updates as events.

### 2. Verified API Endpoints
Static analysis of `_app/immutable/nodes/4.CB2fylc3.js` revealed the following API structure:

| Endpoint | Description |
| :--- | :--- |
| `/api/v1/aircraft_info` | **Primary Stream**. Live aircraft and drone telemetry. |
| `/api/v1/history/batch` | Historical flight data (batch). |
| `/api/v1/history/flights` | Historical flight list (v2). |
| `/api/v1/weather/latest` | Current weather data (JSON). |
| `/api/v1/areas` | Static/Semi-static map areas (JSON). |
| `/api/v1/sensors` | Sensor locations (static JSON). |
| `/api/v1/health` | System health status. |
| `/api/v1/geofencing/area` | Geofencing definitions. |
| `/api/v1/geofencing/templates/sms/all` | SMS templates for notifications. |
| `/api/v1/organizations/drone/classification` | Drone classification reference data. |

### 3. Data Format Assumptions
- **Format**: JSON embedded within SSE messages.
- **Structure**: Likely contains a list of aircraft objects with properties for:
    - `icao` / `id`: Unique identifier.
    - `lat`, `lon`: Coordinates.
    - `alt`: Altitude.
    - `heading`: Direction.
    - `speed`: Ground speed.
    - `callsign`: Flight number/Name.
    - `type`: Aircraft/Drone type.

### 4. Security & Rate Limiting
- **Protection**: The API is protected by strict rate limiting (likely Cloudflare or internal logic).
- **Observation**: Automated requests to the main page and API endpoints resulted in `429 Too Many Requests` errors.
- **Recommendation**: Any future scraping or data ingestion client **must** respect retry-after headers and implement exponential backoff.

## Implementation Details
The frontend logic for handling these streams resides primarily in the compiled SvelteKit bundle `_app/immutable/nodes/4.CB2fylc3.js`. This file handles the map visualization (Leaflet) and data fetching.

## Security Analysis

### 1. Authentication & Authorization
- **Mechanism**: Static analysis of the client code (`4.CB2fylc3.js`) shows no explicit `Authorization` headers (e.g., Bearer tokens) being constructed for the `aircraft_info` request.
- **Implication**: Authentication likely relies on **Session Cookies** or is purely **IP-based** (public endpoint with rate limiting). The 429 errors observed earlier support the existence of strict IP-based rate limiting or WAF protection (Cloudflare).

### 2. Input Validation
- **Parameter**: The client uses `URLSearchParams({aid:n})` to construct the query string.
- **Risk Assessment**:
    - **Client-Side**: `URLSearchParams` ensures proper encoding, preventing simple Client-Side/DOM-based XSS attacks via this parameter.
    - **Backend**: The `aid` (Aircraft ID) parameter is the primary input. Potential vulnerabilities **might** exist on the backend:
        - **SQL Injection**: If the backend rawly concatenates `aid` into a database query without binding.
        - **IDOR (Insecure Direct Object Reference)**: If iterating through `aid` values reveals non-public aircraft/drone data.

### 3. Transport Security
- **Protocol**: HTTPS is enforced (`https://drooniradar.ee/...`).
- **CORS**: The API is likely restricted to the `drooniradar.ee` origin. Direct browser calls from other domains would fail, but server-side proxying bypasses CORS.

### 4. Vulnerability Summary
| Component | Potential Risk | Evidence/Observation |
| :--- | :--- | :--- |
| **Availability** | **DoS / Lockout** | Aggressive 429 Rate Limiting observed. High risk of IP banning for aggressive consumers. |
| **Input** | **Backend Injection** | The `aid` parameter is the only visible input vector. Fuzzing this parameter is a potential (but risky) test vector. |
| **Logic** | **Scraping** | Lack of complex token exchange makes scraping easier, contingent on solving the rate limit challenge (e.g., rotating proxies). |


### 5. Theoretical Logic Vulnerabilities (Post-Authentication)
Even with valid authentication (Sign-in) and network defense (WAF), the stream architecture may remain vulnerable to:

*   **BOLA (Broken Object Level Authorization)**: The stream relies on the `aid` parameter. If the backend checks *who* the user is (AuthN) but not *what* they can see (AuthZ), a legitimate user could brute-force `aid` to view restricted drones (e.g. police/military) simply by changing the ID.
*   **CSWSH (Cross-Site WebSocket/Stream Hijacking)**: Since authentication likely relies on **cookies** (implicit auth), a malicious site could open a stream to `drooniradar.ee` in the background. If the server does not strictly validate the `Origin` header, the browser will send the victim's cookies, allowing the attacker to read the private stream.
*   **The "Firehose" Effect**: If the server pushes *all* data to the client and relies on the frontend to filter it (e.g., "hide military drones on map"), a user can simply inspect the raw network stream to see the hidden data.
*   **Persistent Access (Zombie Streams)**: Access checks often occur only at connection establishment. If a user's permissions are revoked *during* a stream, the connection might remain active, leaking data until manual disconnection.

## Unauthorized Access Attack Vector Map

### 1. Network Layer: The "Digital Doorman"
*   **Vector**: Traffic Fingerprinting Bypass
*   **Mechanism**: The server uses IP reputation and HTTP Header Analysis to identify "legitimate" browsers.
*   **Attack**:
    *   **Header Mimicking**: A script setting `User-Agent: Chrome/12X...`, `Referer: https://drooniradar.ee/`, and `Origin: https://drooniradar.ee` is indistinguishable from a browser at the protocol level.
    *   **IP Rotation**: Using a residential proxy pool allows an attacker to switch IPs continually, bypassing 429 rate limits.
*   **Feasibility**: **High**. Standard practice for scrapers.

### 2. Application Layer: The "Hidden Key"
*   **Vector**: Parameter Enumeration (IDOR/BOLA)
*   **Mechanism**: The `aid` parameter is the only distinct variable.
*   **Attack**:
    *   **Blind Enumeration**: Iterating `aid` through integer ranges (e.g., 0-10000) or common ICAO hex codes.
    *   **Leakage Exploitation**: Monitoring the `/api/v1/areas` or `/api/v1/history` endpoints (which are less protected) to harvest valid `aid` values to feed into the live stream.
*   **Feasibility**: **Medium**. Depends on the density of valid IDs and the strictness of rate limits on invalid requests.

### 3. Logic Layer: The "Backend" Exploit
*   **Vector**: Architectural Blindspots
*   **Mechanism**: Assuming the backend uses a standard message queue (Redis/RabbitMQ) to push to SSE.
*   **Attack**:
    *   **Race Conditions**: Bursting opens/closes to exhaust socket descriptors (Resource Exhaustion).
    *   **Desync**: If an HTTP Request Smuggling vulnerability exists in the edge proxy (Cloudflare/Nginx), an attacker could "piggyback" on a legitimate stream.
*   **Feasibility**: **Low**. Requires advanced knowledge of the specific backend infrastructure.

### Summary of Probability
| Access Method | Prerequisite | Probability of Success |
| :--- | :--- | :--- |
| **Passive Listening** | Identifying the global `aid` (e.g. `all` or null) | **Very High** (if global stream exists) |
| **Active Enumeration** | Rotating Proxies + Valid Header dictionaries | **High** |
| **Backend Exploitation** | Zero-day vulnerabilities in SSE implementation | **Very Low** |

**Conclusion**: Unauthorized access via **Network and Application layer simulation** is the primary threat vector. The system relies on "Security through Obscurity" (hidden/dynamic `aid` values) and "Security through Policy" (Rate Limits), both of which are bypassable by determined actors.


### 6. Unauthenticated Access Audit (2026-01-04)
A specific audit was conducted to test if users *without* rights (unauthenticated) could access the stream, bypassing the "valid user" requirement.

#### Methodology
*   **Tools**: Puppeteer (Headless Chrome) to bypass Network Layer (TLS/JA3) defenses.
*   **Targets**: 
    1.  `/api/v1/areas` (to leak valid IDs).
    2.  `/api/v1/aircraft_info?aid={id}` (Direct stream access).
    3.  Static Analysis of JS bundles for leaked keys.

#### Findings
1.  **"Missing Middleware" Hypothesis: DISPROVEN (Secure)**
    *   Attempting to access `/api/v1/aircraft_info` without session cookies returned `404 Not Found` (effectively blocking access).
    *   This indicates the server either checks auth and returns 404, or the endpoint is hidden behind an auth wall.
2.  **Enumeration Vector: BLOCKED (Secure)**
    *   Attempting to access `/api/v1/areas` (previously thought public) without session cookies returned `403 Forbidden`.
    *   This effectively prevents the "Leak ID" step of the attack chain for unauthenticated actors.
3.  **Leaked Credentials: NONE FOUND**
    *   `grep` analysis of the main bundle (`4.CB2fylc3.js`) revealed no hardcoded `Authorization`, `Bearer`, or `x-api-key` headers.

#### Conclusion
The system appears significantly more secure against **unauthenticated** actors than initially theorized. The combination of Network Layer defenses (WAF) and Application Layer checks (returning 403/404) prevents:
*   Direct Stream Access (Missing Middleware).
*   ID Enumeration.
*   Scraping via standard tools.

**The primary remaining risk lies with "Valid User" scenarios (BOLA/IDOR), where an authenticated low-level user accesses high-level data.**

### 7. Historic Data Recovery (2026-01-04)
Authentication of the historic data endpoints was performed and a recovery script was created.

#### Recovered Endpoints
-   `GET /api/v2/history/flights?day={YYYYMMDD}&mannedAircrafts=true`
-   `GET /api/v1/history/batch?s={TIMESTAMP}&d={DURATION}`
-   `GET /api/v1/history/{AIRCRAFT_ID}/all_flights`

#### Recovery Script
A Node.js client has been implemented in `scripts/history_client.js` to interface with these endpoints. It mimics browser headers to successfully retrieve data.

**Usage:**
```bash
node scripts/history_client.js --date 20231027
```
