NOTAM Data Parsing Logic Walkthrough
This document details the logic discovered for parsing and displaying 
uas.geojson
 data.

Core Logic: Airspace Properties
The logic is encapsulated in a class (detected as Yv in the minified code), which processes the properties of each GeoJSON feature.

Property Extraction
The following properties are extracted from each feature:

identifier: The unique ID of the airspace zone.
name: The display name of the zone.
lower: Lower height limit (defaults to AGL if missing).
upper: Upper height limit.
message: General message or description.
restriction: Determined based on both the restriction and reason properties.
Restriction Logic
The restriction value is mapped as follows:

Condition	Restriction Level
reason === 'Sensitive'	PROHIBITED
reason !== 'Other' && reason !== 'Sensitive'	REQ_AUTHORISATION
Default / reason === 'Other'	Uses the existing restriction property or NO_RESTRICTION
Styling and Visualization
Airspace zones are styled on the map using Leaflet's geoJson layer with the following color-coding based on the restriction level:

PROHIBITED: Reddish color (#d44)
REQ_AUTHORISATION: Blueish color (#88d)
Default: Semi-transparent black border (#0004)
Localized Messages
The system supports localized messages. It looks for extendedProperties.localizedMessages and tries to find a message matching the user's language (e.g., prefix et- for Estonian). If not found, it falls back to the default message property.

Parser Scripts
The following scripts have been isolated in the /parser/ directory:

namedLocationWorker-DHhNwjMm.js
: Handles fetching and point-in-polygon checks for borders/airspaces.
4.CB2fylc3.js
: Contains the frontend rendering logic, including the property processing and Leaflet styling.
Data Sources
The GeoJSON files are fetched from the following endpoints:

https://utm.eans.ee/avm/utm/uas.geojson
https://utm.ans.lt/avm/utm/uas.geojson