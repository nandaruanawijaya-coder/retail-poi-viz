# Buku Warung POI Service

Production-ready POI analytics service: **BigQuery → FastAPI (DBSCAN) → React map component**.

---

## Architecture

```
Your App (React)
     │  POST /api/poi/analyze
     ▼
FastAPI  ──► BigQuery (fetch merchants)
         ──► sklearn DBSCAN (server-side clustering)
         ──► Redis (cache results 1hr)
         ◄── returns POI clusters only (not 50k raw rows)
```

---

## Backend Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Set environment variables
```bash
cp .env.example .env
# Edit .env with your actual values
```

| Variable     | Example               | Required |
|--------------|-----------------------|----------|
| BQ_PROJECT   | ledger-fcc1e          | ✅        |
| BQ_DATASET   | retail                | ✅        |
| BQ_TABLE     | merchants             | ✅        |
| REDIS_URL    | redis://localhost:6379| ❌ (optional, disables cache if absent) |

### 3. BigQuery schema expected
Your table must have these columns (adjust names in `bq_client.py` if different):

| Column         | Type    |
|----------------|---------|
| merchant_id    | STRING  |
| business_name  | STRING  |
| phone_number   | STRING  |
| orders_address | STRING  |
| latitude       | FLOAT64 |
| longitude      | FLOAT64 |
| city           | STRING  | ← optional, used for filtering

### 4. GCP credentials
On GCP (Cloud Run, GKE): credentials are automatic via Workload Identity.  
Locally: `gcloud auth application-default login`

### 5. Run locally
```bash
uvicorn main:app --reload --port 8000
```

### 6. Docker
```bash
docker build -t poi-service .
docker run -p 8000:8000 --env-file .env poi-service
```

---

## API Endpoints

### `POST /api/poi/analyze`
Runs DBSCAN and returns cluster summaries.

**Request body:**
```json
{
  "radius": 250,
  "min_merchants": 15,
  "city": "Jakarta"
}
```

**Response:**
```json
{
  "total_merchants": 12000,
  "total_pois": 47,
  "assigned_merchants": 8200,
  "unassigned_merchants": 3800,
  "coverage_pct": 68.3,
  "radius_used": 250,
  "min_merchants_used": 15,
  "pois": [
    {
      "poi_id": "POI_001",
      "center_lat": -6.2146,
      "center_lng": 106.8451,
      "merchant_count": 83,
      "radius_m": 250,
      "max_distance_m": 241.5,
      "avg_distance_m": 118.2,
      "merchants": [ ... ]
    }
  ]
}
```

### `GET /api/poi/merchants?city=Jakarta&limit=500`
Returns sampled merchant locations for map background dots.

---

## Frontend Setup

### Install dependencies
```bash
npm install leaflet react-leaflet
```

### Drop in the component
```jsx
import PoiMap from "./PoiMap";

// Basic usage
<PoiMap apiBaseUrl="https://your-api.com" />

// With filters
<PoiMap
  apiBaseUrl="https://your-api.com"
  city="Jakarta"
  initialRadius={300}
  initialMinMerchants={10}
  height="500px"
/>

// Headless (no controls — drive from your own UI)
<PoiMap
  apiBaseUrl="https://your-api.com"
  showControls={false}
/>
```

### Props

| Prop                 | Type    | Default | Description                        |
|----------------------|---------|---------|------------------------------------|
| apiBaseUrl           | string  | `""`    | Your FastAPI base URL              |
| city                 | string  | `null`  | Optional city filter               |
| initialRadius        | number  | `250`   | Starting radius (meters)           |
| initialMinMerchants  | number  | `15`    | Starting min merchants             |
| height               | string  | `600px` | Map height                         |
| showControls         | bool    | `true`  | Show sliders + analyze button      |

---

## Caching

Results are cached in Redis for **1 hour** per unique `(radius, min_merchants, city)` combination.  
If Redis is unavailable, the service falls back gracefully — no crash, just no caching.

To invalidate cache manually:
```bash
redis-cli KEYS "poi:*" | xargs redis-cli DEL
```
