from pydantic import BaseModel, Field
from typing import List, Optional


class POIRequest(BaseModel):
    radius: int = Field(default=250, ge=100, le=1000, description="Clustering radius in meters")
    min_merchants: int = Field(default=15, ge=2, le=100, description="Minimum merchants to form a POI")
    city: Optional[str] = Field(default=None, description="Optional city filter (matches BigQuery city column)")


class MerchantSummary(BaseModel):
    merchant_id: str
    business_name: str
    phone_number: str
    orders_address: str
    latitude: float
    longitude: float
    distance_to_center_m: float


class POICluster(BaseModel):
    poi_id: str                          # e.g. "POI_001"
    center_lat: float
    center_lng: float
    merchant_count: int
    radius_m: int                        # detection radius used
    max_distance_m: float                # farthest merchant from center
    avg_distance_m: float
    merchants: List[MerchantSummary]     # full list for drill-down popups


class POIResponse(BaseModel):
    total_merchants: int
    total_pois: int
    assigned_merchants: int
    unassigned_merchants: int
    coverage_pct: float
    radius_used: int
    min_merchants_used: int
    pois: List[POICluster]
