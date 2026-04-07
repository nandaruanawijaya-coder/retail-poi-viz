import os
from typing import List, Optional
from google.cloud import bigquery
import logging

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
BQ_PROJECT = os.environ["BQ_PROJECT"]          # e.g. "ledger-fcc1e"
BQ_DATASET = os.environ["BQ_DATASET"]          # e.g. "retail"
BQ_TABLE = os.environ["BQ_TABLE"]              # e.g. "merchants"

_client: Optional[bigquery.Client] = None


def _get_client() -> bigquery.Client:
    global _client
    if _client is None:
        _client = bigquery.Client(project=BQ_PROJECT)
    return _client


async def fetch_merchants(city: Optional[str] = None) -> List[dict]:
    """
    Fetch merchant rows from BigQuery.
    Returns a list of dicts with keys:
        merchant_id, business_name, phone_number, orders_address, latitude, longitude
    
    Adjust column names below to match your actual BigQuery schema.
    """
    client = _get_client()

    table_ref = f"`{BQ_PROJECT}.{BQ_DATASET}.{BQ_TABLE}`"

    city_filter = ""
    params = []
    if city:
        city_filter = "WHERE LOWER(city) = LOWER(@city)"
        params.append(bigquery.ScalarQueryParameter("city", "STRING", city))

    query = f"""
        SELECT
            CAST(merchant_id AS STRING)  AS merchant_id,
            COALESCE(business_name, 'N/A')   AS business_name,
            COALESCE(phone_number, 'N/A')    AS phone_number,
            COALESCE(orders_address, 'N/A')  AS orders_address,
            CAST(latitude  AS FLOAT64)       AS latitude,
            CAST(longitude AS FLOAT64)       AS longitude
        FROM {table_ref}
        {city_filter}
        -- Only rows with valid coordinates
        WHERE latitude  IS NOT NULL
          AND longitude IS NOT NULL
          AND latitude  BETWEEN -90  AND 90
          AND longitude BETWEEN -180 AND 180
    """

    job_config = bigquery.QueryJobConfig(query_parameters=params)

    logger.info(f"Running BigQuery: project={BQ_PROJECT}, dataset={BQ_DATASET}, table={BQ_TABLE}, city={city}")

    job = client.query(query, job_config=job_config)
    rows = job.result()

    merchants = [dict(row) for row in rows]
    logger.info(f"BigQuery returned {len(merchants)} merchants")
    return merchants
