from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import logging
from models import POIRequest, POIResponse
from clustering import run_clustering
from bq_client import fetch_merchants
from cache import get_cached, set_cached
import random

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Buku Warung POI Service",
    description="Point of Interest clustering API backed by BigQuery + DBSCAN",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your app domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/poi/analyze", response_model=POIResponse)
async def analyze_poi(request: POIRequest):
    """
    Main endpoint. Fetches merchants from BigQuery, runs DBSCAN,
    returns cluster summaries only (not raw merchant rows).
    """
    cache_key = f"poi:{request.radius}:{request.min_merchants}:{request.city or 'all'}"

    cached = await get_cached(cache_key)
    if cached:
        logger.info(f"Cache hit for key: {cache_key}")
        return cached

    logger.info(f"Fetching merchants from BigQuery (city={request.city})")
    try:
        merchants = await fetch_merchants(city=request.city)
    except Exception as e:
        logger.error(f"BigQuery fetch failed: {e}")
        raise HTTPException(status_code=502, detail=f"BigQuery error: {str(e)}")

    if len(merchants) == 0:
        raise HTTPException(status_code=404, detail="No merchant data found for given filters")

    logger.info(f"Running DBSCAN on {len(merchants)} merchants (radius={request.radius}m, min={request.min_merchants})")
    try:
        result = run_clustering(
            merchants=merchants,
            radius_meters=request.radius,
            min_merchants=request.min_merchants,
        )
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
        raise HTTPException(status_code=500, detail=f"Clustering error: {str(e)}")

    await set_cached(cache_key, result, ttl_seconds=3600)

    logger.info(f"Returning {result.total_pois} POIs, coverage={result.coverage_pct:.1f}%")
    return result


@app.get("/api/poi/merchants")
async def get_merchants(
    city: str = Query(None, description="Optional city filter"),
    limit: int = Query(500, le=2000, description="Max merchants to return for map background dots"),
):
    """
    Returns a sampled subset of raw merchant locations for map background dots.
    Frontend uses this for the grey background dots, NOT for clustering.
    """
    cache_key = f"merchants:{city or 'all'}:{limit}"
    cached = await get_cached(cache_key)
    if cached:
        return cached

    merchants = await fetch_merchants(city=city)

    if len(merchants) > limit:
        merchants = random.sample(merchants, limit)

    result = {"merchants": merchants, "total": len(merchants), "sampled": len(merchants) < limit}
    await set_cached(cache_key, result, ttl_seconds=3600)
    return result
