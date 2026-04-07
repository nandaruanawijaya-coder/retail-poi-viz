import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import haversine_distances
from math import radians
from typing import List
from models import POICluster, POIResponse, MerchantSummary
import logging

logger = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_000


def run_clustering(
    merchants: List[dict],
    radius_meters: int,
    min_merchants: int,
) -> POIResponse:
    """
    Runs sklearn DBSCAN on server side.
    Only cluster summaries are returned — raw rows stay on the server.
    """
    if not merchants:
        return POIResponse(
            total_merchants=0, total_pois=0, assigned_merchants=0,
            unassigned_merchants=0, coverage_pct=0.0,
            radius_used=radius_meters, min_merchants_used=min_merchants, pois=[]
        )

    # Build coordinate matrix in radians for haversine metric
    coords = np.array([
        [radians(m["latitude"]), radians(m["longitude"])]
        for m in merchants
    ])

    epsilon = radius_meters / EARTH_RADIUS_M  # convert meters → radians

    db = DBSCAN(
        eps=epsilon,
        min_samples=min_merchants,
        algorithm="ball_tree",
        metric="haversine",
        n_jobs=-1,
    ).fit(coords)

    labels = db.labels_
    unique_labels = set(labels) - {-1}  # -1 = noise / unassigned

    logger.info(f"DBSCAN found {len(unique_labels)} clusters from {len(merchants)} merchants")

    pois: List[POICluster] = []

    for cluster_id in sorted(unique_labels):
        indices = np.where(labels == cluster_id)[0]
        cluster_merchants = [merchants[i] for i in indices]
        cluster_coords = coords[indices]

        # Cluster centroid (mean lat/lon in degrees)
        center_lat = float(np.mean([m["latitude"] for m in cluster_merchants]))
        center_lng = float(np.mean([m["longitude"] for m in cluster_merchants]))
        center_rad = np.array([[radians(center_lat), radians(center_lng)]])

        # Distance from each merchant to centroid
        distances_rad = haversine_distances(cluster_coords, center_rad).flatten()
        distances_m = distances_rad * EARTH_RADIUS_M

        merchant_summaries = [
            MerchantSummary(
                merchant_id=str(cluster_merchants[i]["merchant_id"]),
                business_name=cluster_merchants[i]["business_name"],
                phone_number=cluster_merchants[i]["phone_number"],
                orders_address=cluster_merchants[i]["orders_address"],
                latitude=cluster_merchants[i]["latitude"],
                longitude=cluster_merchants[i]["longitude"],
                distance_to_center_m=round(float(distances_m[i]), 1),
            )
            for i in range(len(cluster_merchants))
        ]

        pois.append(POICluster(
            poi_id=f"POI_{str(cluster_id + 1).zfill(3)}",
            center_lat=center_lat,
            center_lng=center_lng,
            merchant_count=len(cluster_merchants),
            radius_m=radius_meters,
            max_distance_m=round(float(distances_m.max()), 1),
            avg_distance_m=round(float(distances_m.mean()), 1),
            merchants=merchant_summaries,
        ))

    assigned = sum(p.merchant_count for p in pois)
    total = len(merchants)

    return POIResponse(
        total_merchants=total,
        total_pois=len(pois),
        assigned_merchants=assigned,
        unassigned_merchants=total - assigned,
        coverage_pct=round((assigned / total) * 100, 2) if total > 0 else 0.0,
        radius_used=radius_meters,
        min_merchants_used=min_merchants,
        pois=pois,
    )
