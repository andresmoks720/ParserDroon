# Unified Airspace Aggregation Schema

This document describes the intermediate data structure used to bridge the gap between **Raw Data Parsing** (eAIP, NOTAMs) and **Frontend Visualization**.

## Purpose

The `schema.json` defines a strict `GeoJSON FeatureCollection` format that normalizes diverse aviation data sources into a single, consumable format for the Drooniradar map interface.

By standardizing sources before visualization, we ensure:
1.  **Rendering Consistency**: All restricted areas, whether permanent (eAIP) or temporary (NOTAM), share common properties like `restriction` level and `priority`.
2.  **Type Safety**: The frontend receives guaranteed property shapes, reducing runtime errors.
3.  **Decoupled Logic**: The visualization layer doesn't need to know how to parse a raw raw NOTAM text or scrape an eAIP HTML page.

## Key Properties

### `source`
Indicates the origin of the feature.
- `EAIP`: Permanent airspace structure (Prohibited Areas, Control Zones).
- `NOTAM`: Temporary notices (Exercises, Crane work).
- `UAS_ZONE`: Specific drone-only geographical zones.

### `restriction`
A normalized enum that drives the map coloring and user warnings.
- `PROHIBITED`: Red. No fly zone.
- `RESTRICTED`: Orange. Flight possible with specific permission/conditions.
- `DANGER`: Yellow. Hazardous activity.
- `REQ_AUTHORISATION`: Blue/Purple. UTM authorization required.

### `priority`
Determines Z-index and visual urgency.
- `CRITICAL`: e.g., Emergency TFRs, immediately effective prohibited zones.
- `HIGH`: Active Prohibited/Restricted areas.
- `LOW`: Informational warnings or inactive scheduled zones.

### `radius`
Optional radius in meters. If present and geometry is `Point`, frontends should render a circle.

### `relatedTo`
ID of a permanent structure this feature modifies (e.g., "EED123").

### `schedule.activations`
Pre-computed list of "hot" windows. This approach offloads complex temporal logic to the backend parser.

**Strategy: Rule -> List**
The backend should "unroll" complex rules into specific UTC windows for a useful lookahead period (e.g., Today + 7 days).

| Original Rule (Human) | Backend Helper | Pre-Calculated List (Machine) |
| :--- | :--- | :--- |
| "MON-FRI 0800-1600" | `RRule.fromString("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR...")` | ISO-8601 Windows for next 7 days:<br>`[{ "start": "2026-01-05T08:00Z", "end": "2026-01-05T16:00Z" }, { "start": "2026-01-06T08:00Z", ... }]` |
| "Daytime (SR-30 to SS+30)" | `SunCalc.getTimes(date, lat, lon)` | `[{ "start": "2026-01-05T06:32Z", "end": "2026-01-05T15:45Z" }]` |
| "First Sat of Month" | Cron/Date Math | `[{ "start": "2026-02-07T00:00Z", "end": "2026-02-07T23:59Z" }]` |

**Benefit**: Frontend checks `now >= start && now <= end`. No complex libraries needed in the client.

## Example Payload

Below is an example of what the aggregator output looks like, adhering to `schema.json`.

```json
{
  "type": "FeatureCollection",
  "generatedAt": "2026-01-05T12:00:00Z",
  "metadata": {
    "eaipVersion": "2401",
    "notamFetchTime": "2026-01-05T11:59:00Z",
    "activeCount": 2
  },
  "features": [
    {
      "type": "Feature",
      "id": "EER1",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[24.0, 59.0], [24.1, 59.0], [24.1, 59.1], [24.0, 59.1], [24.0, 59.0]]]
      },
      "properties": {
        "source": "EAIP",
        "identifier": "EER1",
        "name": "EER1 PROHIBITED AREA",
        "class": "UNCLASSIFIED",
        "restriction": "PROHIBITED",
        "lowerLimit": { "value": 0, "unit": "FT", "referenceDatum": "SFC" },
        "upperLimit": { "value": 3000, "unit": "FT", "referenceDatum": "AMSL" },
        "schedule": {
          "isPermanent": true
        },
        "content": "Permanent prohibited area for national security.",
        "priority": "HIGH"
      }
    },
    {
      "type": "Feature",
      "id": "A1234/26",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[25.0, 58.0], [25.2, 58.0], [25.2, 58.2], [25.0, 58.2], [25.0, 58.0]]]
      },
      "properties": {
        "source": "NOTAM",
        "identifier": "A1234/26",
        "name": "MIL EXERCISE AREA",
        "class": "UNCLASSIFIED",
        "restriction": "RESTRICTED",
        "lowerLimit": { "value": 0, "unit": "FT", "referenceDatum": "SFC" },
        "upperLimit": { "value": 2000, "unit": "FT", "referenceDatum": "AMSL" },
        "schedule": {
          "isPermanent": false,
          "activeFrom": "2026-01-06T08:00:00Z",
          "activeUntil": "2026-01-06T16:00:00Z",
          "text": "JAN 06 0800-1600"
        },
        "content": "MILITARY EXERCISE WILL TAKE PLACE. FLIGHTS PROHIBITED.",
        "priority": "MEDIUM",
        "contact": "TALLINN CONTROL 123.450"
      }
    }
  ]
}
```
