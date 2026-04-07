/**
 * PoiMap.jsx — Buku Warung POI Analytics Map
 *
 * Drop-in React component. Calls your FastAPI backend and renders
 * an interactive Leaflet map with POI clusters.
 *
 * Dependencies (add to your project):
 *   npm install leaflet react-leaflet
 *
 * Usage:
 *   <PoiMap apiBaseUrl="https://your-api.com" city="Jakarta" />
 */

import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Constants ────────────────────────────────────────────────────────────────
const COLORS = {
  blue: "#2E86C1",
  blueDark: "#1F5F8B",
  blueLight: "#5DADE2",
  yellow: "#F1C40F",
  yellowDark: "#D4AC0D",
  gray: "#95A5A6",
  grayLight: "#BDC3C7",
};

const DEFAULT_RADIUS = 250;
const DEFAULT_MIN_MERCHANTS = 15;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Recenter map when center prop changes */
function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

/** Star icon for POI cluster centers */
const starIcon = L.divIcon({
  className: "",
  html: `<div style="
    background: linear-gradient(135deg, #F1C40F, #D4AC0D);
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; border: 3px solid white;
    box-shadow: 0 4px 12px rgba(46,134,193,0.4);
  ">⭐</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

/** Stats bar shown above map */
function StatsBar({ data }) {
  if (!data) return null;
  const stats = [
    { label: "Strategic POIs", value: data.total_pois },
    { label: "Assigned Merchants", value: data.assigned_merchants.toLocaleString() },
    { label: "Coverage", value: `${data.coverage_pct}%` },
    { label: "Growth Opportunities", value: data.unassigned_merchants.toLocaleString() },
  ];
  return (
    <div style={styles.statsBar}>
      {stats.map((s) => (
        <div key={s.label} style={styles.statCard}>
          <div style={styles.statValue}>{s.value}</div>
          <div style={styles.statLabel}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Merchant popup content */
function MerchantPopup({ merchant, poiId }) {
  return (
    <div style={{ fontFamily: "sans-serif", width: 280 }}>
      <h4 style={{ color: COLORS.blue, margin: "4px 0 8px" }}>🏪 {merchant.business_name}</h4>
      {poiId && (
        <div style={{ background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.blueDark})`, color: "#fff", padding: "6px 10px", borderRadius: 6, marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
          {poiId} — STRATEGIC LOCATION
        </div>
      )}
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        <b>📞</b> {merchant.phone_number}<br />
        <b>🏠</b> {merchant.orders_address}<br />
        <b>📍</b> {merchant.latitude.toFixed(6)}, {merchant.longitude.toFixed(6)}<br />
        {merchant.distance_to_center_m !== undefined && (
          <><b>📏</b> {merchant.distance_to_center_m.toFixed(0)}m from POI center<br /></>
        )}
        <a
          href={`https://www.google.com/maps?q=${merchant.latitude},${merchant.longitude}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: COLORS.yellow, fontWeight: 600 }}
        >
          🗺️ Open in Google Maps
        </a>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PoiMap({
  apiBaseUrl = "",          // e.g. "https://poi-service.bukuwarung.com"
  city = null,              // optional city filter
  initialRadius = DEFAULT_RADIUS,
  initialMinMerchants = DEFAULT_MIN_MERCHANTS,
  height = "600px",
  showControls = true,
}) {
  const [radius, setRadius] = useState(initialRadius);
  const [minMerchants, setMinMerchants] = useState(initialMinMerchants);
  const [poiData, setPoiData] = useState(null);
  const [bgMerchants, setBgMerchants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([-6.2, 106.8]); // Default: Jakarta

  // Load background merchant dots once on mount
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/poi/merchants?${city ? `city=${city}&` : ""}limit=500`)
      .then((r) => r.json())
      .then((data) => {
        setBgMerchants(data.merchants || []);
        if (data.merchants?.length > 0) {
          const avgLat = data.merchants.reduce((s, m) => s + m.latitude, 0) / data.merchants.length;
          const avgLng = data.merchants.reduce((s, m) => s + m.longitude, 0) / data.merchants.length;
          setMapCenter([avgLat, avgLng]);
        }
      })
      .catch((e) => console.warn("Could not load background merchants:", e));
  }, [apiBaseUrl, city]);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/poi/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radius, min_merchants: minMerchants, city }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "API error");
      }
      const data = await res.json();
      setPoiData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, radius, minMerchants, city]);

  // Collect all merchant indices already assigned to a POI
  const assignedSet = new Set(
    (poiData?.pois || []).flatMap((poi) =>
      poi.merchants.map((m) => `${m.latitude}:${m.longitude}`)
    )
  );

  return (
    <div style={styles.wrapper}>
      {/* Controls */}
      {showControls && (
        <div style={styles.controlPanel}>
          <div style={styles.controlRow}>
            <div style={styles.sliderGroup}>
              <label style={styles.label}>
                🎯 Detection Radius: <strong>{radius}m</strong>
              </label>
              <input
                type="range" min={100} max={1000} step={50}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                style={styles.slider}
              />
            </div>
            <div style={styles.sliderGroup}>
              <label style={styles.label}>
                👥 Min Merchants per POI: <strong>{minMerchants}</strong>
              </label>
              <input
                type="range" min={2} max={100} step={1}
                value={minMerchants}
                onChange={(e) => setMinMerchants(Number(e.target.value))}
                style={styles.slider}
              />
            </div>
            <div style={styles.presets}>
              <span style={styles.label}>⚡ Presets:</span>
              <button style={styles.presetBtn} onClick={() => { setRadius(250); setMinMerchants(15); }}>Retail Standard</button>
              <button style={styles.presetBtn} onClick={() => { setRadius(300); setMinMerchants(10); }}>Sparse Coverage</button>
              <button style={styles.presetBtn} onClick={() => { setRadius(400); setMinMerchants(20); }}>Dense Areas</button>
            </div>
          </div>
          <button
            style={{ ...styles.analyzeBtn, opacity: loading ? 0.7 : 1 }}
            onClick={runAnalysis}
            disabled={loading}
          >
            {loading ? "🔄 Analyzing..." : "🚀 Analyze Points of Interest"}
          </button>
          {error && <div style={styles.errorBox}>❌ {error}</div>}
        </div>
      )}

      {/* Stats */}
      {poiData && <StatsBar data={poiData} />}

      {/* Map */}
      <div style={{ ...styles.mapWrapper, height }}>
        <MapContainer
          center={mapCenter}
          zoom={12}
          style={{ width: "100%", height: "100%", borderRadius: 16 }}
        >
          <MapController center={mapCenter} zoom={12} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
          />

          {/* Background merchant dots (grey, no POI assigned yet) */}
          {!poiData && bgMerchants.map((m, i) => (
            <CircleMarker
              key={`bg-${i}`}
              center={[m.latitude, m.longitude]}
              radius={4}
              pathOptions={{ color: COLORS.blue, fillColor: COLORS.blueLight, fillOpacity: 0.7, weight: 1 }}
            >
              <Popup><MerchantPopup merchant={m} /></Popup>
            </CircleMarker>
          ))}

          {/* POI results */}
          {poiData?.pois.map((poi) => (
            <div key={poi.poi_id}>
              {/* Radius circle */}
              <Circle
                center={[poi.center_lat, poi.center_lng]}
                radius={poi.radius_m}
                pathOptions={{ color: COLORS.yellow, weight: 2, fillColor: COLORS.blue, fillOpacity: 0.08 }}
              />
              {/* Star center marker */}
              <Marker center={[poi.center_lat, poi.center_lng]} position={[poi.center_lat, poi.center_lng]} icon={starIcon}>
                <Popup>
                  <div style={{ fontFamily: "sans-serif", width: 300 }}>
                    <h4 style={{ color: COLORS.blue, margin: "4px 0 8px" }}>⭐ {poi.poi_id}</h4>
                    <div style={{ background: `linear-gradient(135deg, ${COLORS.yellow}, ${COLORS.yellowDark})`, color: "#fff", padding: "6px 10px", borderRadius: 6, marginBottom: 8, fontSize: 12, fontWeight: 700 }}>
                      🏆 STRATEGIC POI CENTER
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                      <b>📊 Merchants:</b> {poi.merchant_count}<br />
                      <b>📏 Max distance:</b> {poi.max_distance_m}m<br />
                      <b>📏 Avg distance:</b> {poi.avg_distance_m}m<br />
                      <b>📍</b> {poi.center_lat.toFixed(6)}, {poi.center_lng.toFixed(6)}<br />
                      <a href={`https://www.google.com/maps?q=${poi.center_lat},${poi.center_lng}`} target="_blank" rel="noreferrer" style={{ color: COLORS.yellow, fontWeight: 600 }}>
                        🗺️ Open in Google Maps
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
              {/* Merchants inside POI */}
              {poi.merchants.map((m, i) => (
                <CircleMarker
                  key={`${poi.poi_id}-${i}`}
                  center={[m.latitude, m.longitude]}
                  radius={5}
                  pathOptions={{ color: COLORS.blue, fillColor: COLORS.blueLight, fillOpacity: 0.9, weight: 2 }}
                >
                  <Popup><MerchantPopup merchant={m} poiId={poi.poi_id} /></Popup>
                </CircleMarker>
              ))}
            </div>
          ))}

          {/* Unassigned merchants after analysis */}
          {poiData && bgMerchants
            .filter((m) => !assignedSet.has(`${m.latitude}:${m.longitude}`))
            .map((m, i) => (
              <CircleMarker
                key={`unassigned-${i}`}
                center={[m.latitude, m.longitude]}
                radius={3}
                pathOptions={{ color: COLORS.gray, fillColor: COLORS.grayLight, fillOpacity: 0.6, weight: 1 }}
              >
                <Popup><MerchantPopup merchant={m} /></Popup>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  wrapper: { fontFamily: "sans-serif", display: "flex", flexDirection: "column", gap: 16 },
  controlPanel: {
    background: "#fff", borderRadius: 16, padding: "20px 24px",
    boxShadow: "0 4px 20px rgba(46,134,193,0.12)", border: "1px solid #e9ecef",
  },
  controlRow: { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end", marginBottom: 16 },
  sliderGroup: { display: "flex", flexDirection: "column", gap: 6, minWidth: 200, flex: 1 },
  label: { fontSize: 13, fontWeight: 500, color: "#1F5F8B" },
  slider: { width: "100%", accentColor: "#2E86C1" },
  presets: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  presetBtn: {
    padding: "8px 14px", background: "linear-gradient(135deg, #F1C40F, #D4AC0D)",
    color: "#fff", border: "none", borderRadius: 20, cursor: "pointer",
    fontSize: 12, fontWeight: 600,
  },
  analyzeBtn: {
    width: "100%", padding: "14px", fontSize: 15, fontWeight: 700,
    background: "linear-gradient(135deg, #2E86C1, #1F5F8B)", color: "#fff",
    border: "none", borderRadius: 12, cursor: "pointer",
  },
  errorBox: { marginTop: 10, padding: "10px 14px", background: "#fdecea", color: "#c0392b", borderRadius: 8, fontSize: 13 },
  statsBar: { display: "flex", gap: 12, flexWrap: "wrap" },
  statCard: {
    flex: 1, minWidth: 120, background: "linear-gradient(135deg, #2E86C1, #1F5F8B)",
    color: "#fff", padding: "16px 20px", borderRadius: 14, textAlign: "center",
    boxShadow: "0 4px 16px rgba(46,134,193,0.2)",
  },
  statValue: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
  statLabel: { fontSize: 12, opacity: 0.9 },
  mapWrapper: { borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(46,134,193,0.15)" },
};
