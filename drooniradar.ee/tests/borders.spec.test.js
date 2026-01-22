const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const FIXTURE_PATH = path.join(__dirname, "..", "borders.fixture.geojson");
const NO_RESPONSE = Symbol("NO_RESPONSE");

function getFeatureByTestId(geojson, testId) {
  const feature = geojson.features.find(
    (item) => item.properties && item.properties.testId === testId
  );
  assert.ok(feature, `Missing feature with testId ${testId}`);
  return feature;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function normalizeBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error("Malformed bbox");
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  if (![minLng, minLat, maxLng, maxLat].every(isFiniteNumber)) {
    throw new Error("Malformed bbox");
  }
  return { minLng, minLat, maxLng, maxLat };
}

function computeBboxFromCoordinates(coordinates) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const visitPosition = (position) => {
    if (!Array.isArray(position) || position.length < 2) {
      return;
    }
    const [lng, lat] = position;
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) {
      return;
    }
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  };

  const visitRing = (ring) => {
    if (!Array.isArray(ring)) {
      return;
    }
    ring.forEach(visitPosition);
  };

  const visitPolygon = (polygon) => {
    if (!Array.isArray(polygon)) {
      return;
    }
    polygon.forEach(visitRing);
  };

  if (Array.isArray(coordinates) && coordinates.length > 0) {
    if (Array.isArray(coordinates[0][0])) {
      coordinates.forEach(visitPolygon);
    } else {
      coordinates.forEach(visitRing);
    }
  }

  return { minLng, minLat, maxLng, maxLat };
}

function pointInBbox(point, bbox) {
  return (
    point.lng >= bbox.minLng &&
    point.lng <= bbox.maxLng &&
    point.lat >= bbox.minLat &&
    point.lat <= bbox.maxLat
  );
}

function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error("Ring too short");
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!Array.isArray(first) || !Array.isArray(last)) {
    throw new Error("Ring malformed");
  }
  if (first.length < 2 || last.length < 2) {
    throw new Error("Ring malformed");
  }
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error("Ring not closed");
  }
  ring.forEach((position) => {
    if (!Array.isArray(position) || position.length < 2) {
      throw new Error("Invalid coordinate");
    }
    const [lng, lat] = position;
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) {
      throw new Error("Invalid coordinate");
    }
  });
}

function isPointOnSegment(point, a, b) {
  const cross = (point.lat - a[1]) * (b[0] - a[0]) - (point.lng - a[0]) * (b[1] - a[1]);
  if (cross !== 0) {
    return false;
  }
  const dot = (point.lng - a[0]) * (b[0] - a[0]) + (point.lat - a[1]) * (b[1] - a[1]);
  if (dot < 0) {
    return false;
  }
  const squaredLength = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  return dot <= squaredLength;
}

function pointOnRing(point, ring) {
  for (let i = 0; i < ring.length - 1; i += 1) {
    if (isPointOnSegment(point, ring[i], ring[i + 1])) {
      return true;
    }
  }
  return false;
}

function pointInRingInterior(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(rings, point) {
  if (!Array.isArray(rings) || rings.length === 0) {
    throw new Error("Polygon missing rings");
  }
  const outer = rings[0];
  validateRing(outer);
  if (pointOnRing(point, outer)) {
    return true;
  }
  if (!pointInRingInterior(point, outer)) {
    return false;
  }

  for (let i = 1; i < rings.length; i += 1) {
    const hole = rings[i];
    validateRing(hole);
    if (pointOnRing(point, hole)) {
      return true;
    }
    if (pointInRingInterior(point, hole)) {
      return false;
    }
  }
  return true;
}

function pointInMultiPolygon(polygons, point) {
  if (!Array.isArray(polygons) || polygons.length === 0) {
    throw new Error("MultiPolygon missing polygons");
  }
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error("MultiPolygon contains empty polygon");
    }
    if (pointInPolygon(polygon, point)) {
      return true;
    }
  }
  return false;
}

function pickLabel(properties) {
  if (!properties) {
    return undefined;
  }
  const priorities = ["city", "area", "county", "country"];
  for (const key of priorities) {
    const value = properties[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function createEngine(geojson) {
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  const prepared = features.map((feature) => {
    const geometry = feature.geometry || {};
    const bbox =
      !feature.bbox &&
      (geometry.type === "Polygon" || geometry.type === "MultiPolygon")
        ? computeBboxFromCoordinates(geometry.coordinates || [])
        : null;
    return { ...feature, _bbox: bbox };
  });

  return {
    evaluate(message) {
      const cloned = structuredClone(message);
      if (!cloned || typeof cloned !== "object") {
        throw new Error("Invalid message");
      }
      const { requestId, coordinates } = cloned;
      if (!coordinates || typeof coordinates !== "object") {
        throw new Error("Invalid coordinates");
      }
      const { lat, lng } = coordinates;
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
        throw new Error("Invalid coordinates");
      }
      const point = { lat, lng };

      for (const feature of prepared) {
        const geometry = feature.geometry || {};
        if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
          continue;
        }
        const bbox = feature.bbox ? normalizeBbox(feature.bbox) : feature._bbox;
        if (bbox && !pointInBbox(point, bbox)) {
          continue;
        }
        if (geometry.type === "Polygon") {
          if (pointInPolygon(geometry.coordinates, point)) {
            return structuredClone({
              requestId,
              result: pickLabel(feature.properties)
            });
          }
        }
        if (geometry.type === "MultiPolygon") {
          if (pointInMultiPolygon(geometry.coordinates, point)) {
            return structuredClone({
              requestId,
              result: pickLabel(feature.properties)
            });
          }
        }
      }
      return structuredClone({ requestId, result: null });
    }
  };
}

async function createHarness({ geojson, loadFailure = false }) {
  const data = loadFailure ? { type: "FeatureCollection", features: [] } : geojson;
  const engine = createEngine(data);

  return {
    request(message, timeoutMs = 500) {
      return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          resolve(NO_RESPONSE);
        }, timeoutMs);

        setImmediate(() => {
          if (settled) {
            return;
          }
          try {
            const response = engine.evaluate(message);
            clearTimeout(timer);
            settled = true;
            resolve(response);
          } catch (error) {
            clearTimeout(timer);
            settled = true;
            resolve(NO_RESPONSE);
          }
        });
      });
    }
  };
}

async function loadFixture() {
  const contents = await fs.readFile(FIXTURE_PATH, "utf8");
  return JSON.parse(contents);
}

test("T01 overlap first match (CITY_A vs CITY_B)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "CITY_A");
  getFeatureByTestId(fixture, "CITY_B");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t01",
    coordinates: { lat: 58.4, lng: 10.4 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "Alpha City");
});

test("T02 property priority within feature (PRIORITY)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "PRIORITY");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t02",
    coordinates: { lat: 58.1, lng: 12.1 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "PriorityCounty");
});

test("T03 normal match (COUNTRY)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "COUNTRY");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t03",
    coordinates: { lat: 59.1, lng: 24.1 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "Countryland");
});

test("T04 boundary inclusion (COUNTRY)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "COUNTRY");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t04",
    coordinates: { lat: 59.0, lng: 24.5 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "Countryland");
});

test("T05 hole interior exclusion (HOLE_ZONE)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "HOLE_ZONE");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t05",
    coordinates: { lat: 59.5, lng: 26.5 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, null);
});

test("T06 hole boundary inclusion (HOLE_ZONE)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "HOLE_ZONE");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t06",
    coordinates: { lat: 59.2, lng: 26.2 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "HoleZone");
});

test("T07 hole same-winding interior exclusion (HOLE_SAME_WINDING)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "HOLE_SAME_WINDING");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t07",
    coordinates: { lat: 61.5, lng: 26.5 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, null);
});

test("T08 multipolygon hole interior exclusion (MULTI_HOLE)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "MULTI_HOLE");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t08",
    coordinates: { lat: 59.4, lng: 29.6 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, null);
});

test("T09 multipolygon hole boundary inclusion (MULTI_HOLE)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "MULTI_HOLE");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t09",
    coordinates: { lat: 59.2, lng: 29.4 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "MultiHole");
});

test("T10 result key presence with undefined (UNLABELED)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "UNLABELED");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: { id: "t10" },
    coordinates: { lat: 58.05, lng: 14.05 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.ok(Object.prototype.hasOwnProperty.call(response, "result"));
  assert.equal(response.result, undefined);
  assert.deepEqual(response.requestId, { id: "t10" });
});

test("T11 malformed ring yields no response (BAD_RING)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "BAD_RING");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t11",
    coordinates: { lat: 58.05, lng: 15.05 }
  });

  assert.equal(response, NO_RESPONSE);
});

test("T12 short ring yields no response (SHORT_RING)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "SHORT_RING");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t12",
    coordinates: { lat: 58.0, lng: 16.05 }
  });

  assert.equal(response, NO_RESPONSE);
});

test("T13 malformed bbox yields no response (BAD_BBOX)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "BAD_BBOX");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t13",
    coordinates: { lat: 59.25, lng: 32.25 }
  });

  assert.equal(response, NO_RESPONSE);
});

test("T14 wrong bbox suppresses match (WRONG_BBOX)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "WRONG_BBOX");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t14",
    coordinates: { lat: 59.25, lng: 30.25 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, null);
});

test("T15 correct bbox match (BBOX_OK)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "BBOX_OK");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t15",
    coordinates: { lat: 59.25, lng: 31.25 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, "BBoxOK");
});

test("T16 non-polygon features are ignored (POINT_FEATURE/LINE_FEATURE)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "POINT_FEATURE");
  getFeatureByTestId(fixture, "LINE_FEATURE");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t16",
    coordinates: { lat: 10.2, lng: 40.2 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, null);
});

test("T17 load failure returns null", async () => {
  const fixture = await loadFixture();
  const harness = await createHarness({ geojson: fixture, loadFailure: true });

  const response = await harness.request({
    requestId: "t17",
    coordinates: { lat: 59.1, lng: 24.1 }
  });

  assert.notEqual(response, NO_RESPONSE);
  assert.equal(response.result, null);
});

test("T18 invalid inputs yield no response", async () => {
  const fixture = await loadFixture();
  const harness = await createHarness({ geojson: fixture });

  const responses = await Promise.all([
    harness.request({ requestId: "t18a", coordinates: { lng: 24.1 } }),
    harness.request({ requestId: "t18b", coordinates: { lat: NaN, lng: 24.1 } }),
    harness.request({ requestId: "t18c", coordinates: { lat: 59.1, lng: Infinity } }),
    harness.request({ requestId: "t18d", coordinates: { lat: "59.1", lng: 24.1 } }),
    harness.request({ requestId: "t18e", coordinates: null })
  ]);

  responses.forEach((response) => {
    assert.equal(response, NO_RESPONSE);
  });
});

test("T19 multipolygon empty polygon yields no response (MULTI_EMPTY)", async () => {
  const fixture = await loadFixture();
  getFeatureByTestId(fixture, "MULTI_EMPTY");
  const harness = await createHarness({ geojson: fixture });

  const response = await harness.request({
    requestId: "t19",
    coordinates: { lat: 59.25, lng: 34.25 }
  });

  assert.equal(response, NO_RESPONSE);
});
