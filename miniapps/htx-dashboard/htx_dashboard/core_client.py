# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Reads the core through Hasura with the viewer's own token (spec §6).

Every query is a module constant; user input reaches it only as GraphQL variables. Blocks run in parallel, each with its
own timeout, and each ends as a value or an error: one failing block never fails the page (spec §4 rule 3).
"""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Callable

from htx_dashboard import metrics as m

# The only core service the app's network reaches; Hasura filters every row by the token's htx_code and role.
GRAPHQL_URL = "http://apisix:9081/api/data/graphql"
ROLE = "manager"
TIMEOUT_S = 5
LIMIT = m.LIST_LIMIT

# Root fields follow Hasura's default naming: a table of schema public is its name, a table of another schema is
# <schema>_<table>. Prisma timestamps are `timestamp` (UTC, no offset); telemetry columns are `timestamptz`.

PARCELS = """query ($limit: Int!) { parcels(order_by: {parcel_code: asc}, limit: $limit) {
  parcel_code crop_type area_ha status estimated_yield_per_ha
  household { id name }
  crop_cycles(where: {harvested_at: {_is_null: true}}, order_by: {created_at: desc}, limit: 1) {
    season sowed_at estimated_harvest_date } } }"""

PARCEL_ONE = """query ($code: String!) { parcels(where: {parcel_code: {_eq: $code}}, limit: 1) {
  parcel_code crop_type area_ha status estimated_yield_per_ha
  household { id name }
  crop_cycles(where: {harvested_at: {_is_null: true}}, order_by: {created_at: desc}, limit: 1) {
    season sowed_at estimated_harvest_date } } }"""

HOUSEHOLDS = "query ($limit: Int!) { households(order_by: {name: asc}, limit: $limit) { id name } }"

JOURNAL_FIELDS = "id entry_date activity_type status created_at performed_by parcel { parcel_code household { name } }"

JOURNALS = """query ($since: timestamp!, $limit: Int!) { journal_entries(where: {entry_date: {_gte: $since}},
  order_by: {entry_date: desc}, limit: $limit) { """ + JOURNAL_FIELDS + " } }"

JOURNALS_PENDING = """query ($limit: Int!) { journal_entries(where: {status: {_eq: "PENDING_APPROVAL"}},
  order_by: {created_at: asc}, limit: $limit) { """ + JOURNAL_FIELDS + " } }"

JOURNAL_COUNTS = """query ($since: timestamp!) {
  in_period: journal_entries_aggregate(where: {entry_date: {_gte: $since}}) { aggregate { count } }
  pending: journal_entries_aggregate(where: {status: {_eq: "PENDING_APPROVAL"}}) { aggregate { count } }
  changes: journal_entries_aggregate(where: {status: {_eq: "REQUEST_CHANGES"}}) { aggregate { count } } }"""

PARCEL_JOURNALS = """query ($code: String!) { journal_entries(where: {parcel: {parcel_code: {_eq: $code}}},
  order_by: {entry_date: desc}, limit: 10) { """ + JOURNAL_FIELDS + " notes } }"

DISEASE_FIELDS = """id detection_date ai_disease_name ai_confidence confirmed_diagnosis status created_at
  parcel { parcel_code } household { name }"""

DISEASES = "query ($limit: Int!) { disease_reports(order_by: {detection_date: desc}, limit: $limit) { " + DISEASE_FIELDS + " } }"

PARCEL_DISEASES = """query ($code: String!) { disease_reports(where: {parcel: {parcel_code: {_eq: $code}}},
  order_by: {detection_date: desc}, limit: 5) { """ + DISEASE_FIELDS + " } }"

LOT_FIELDS = "lot_code commodity quality_grade harvest_date estimated_weight_kg actual_weight_kg status created_at"

LOTS = "query ($limit: Int!) { lots(order_by: {created_at: desc}, limit: $limit) { " + LOT_FIELDS + " } }"

PARCEL_LOTS = """query ($code: String!) { lots(where: {lot_parcels: {parcel: {parcel_code: {_eq: $code}}}},
  order_by: {created_at: desc}, limit: 20) { """ + LOT_FIELDS + " } }"

WEATHER = """query ($code: String!) { weather_cache(where: {parcel: {parcel_code: {_eq: $code}}},
  order_by: {recorded_at: desc}, limit: 1) { recorded_at condition temperature_c precipitation_mm humidity_pct source } }"""

PRICE_FIELDS = "commodity metric value unit source fetched_at"

PRICES = """query { tea: market_data(where: {commodity: {_eq: "Tea"}}, order_by: {fetched_at: desc}, limit: 3) { """ + PRICE_FIELDS + """ }
  others: market_data(where: {commodity: {_neq: "Tea"}}, order_by: {fetched_at: desc}, limit: 3) { """ + PRICE_FIELDS + " } }"

# The newest reading of each (parcel, sensor); distinct_on needs the same columns first in order_by.
LATEST_READINGS = """query ($htx: String!, $limit: Int!) { telemetry_sensor_readings(
  where: {htx_code: {_eq: $htx}}, distinct_on: [parcel_code, sensor],
  order_by: [{parcel_code: asc}, {sensor: asc}, {ts: desc}], limit: $limit) { parcel_code sensor ts value } }"""

PARCEL_LATEST = """query ($htx: String!, $code: String!) { telemetry_sensor_readings(
  where: {htx_code: {_eq: $htx}, parcel_code: {_eq: $code}}, distinct_on: [sensor],
  order_by: [{sensor: asc}, {ts: desc}], limit: 50) { parcel_code sensor ts value } }"""

DAILY_FIELDS = "parcel_code sensor day reading_count min_value max_value avg_value first_ts last_ts"

DAILY = """query ($htx: String!, $from: date!, $limit: Int!) { telemetry_sensor_daily(
  where: {htx_code: {_eq: $htx}, day: {_gte: $from}}, order_by: [{day: asc}], limit: $limit) { """ + DAILY_FIELDS + " } }"

PARCEL_DAILY = """query ($htx: String!, $code: String!, $from: date!) { telemetry_sensor_daily(
  where: {htx_code: {_eq: $htx}, parcel_code: {_eq: $code}, day: {_gte: $from}},
  order_by: [{sensor: asc}, {day: asc}], limit: 1000) { """ + DAILY_FIELDS + " } }"

RUNS = """query ($htx: String!, $limit: Int!) { telemetry_lifecycle_runs(where: {htx_code: {_eq: $htx}},
  order_by: {started_at: desc}, limit: $limit) { id target partition_date status row_count min_ts max_ts sha256
  size_bytes quality error started_at finished_at } }"""


class CoreError(Exception):
    pass


@dataclass(frozen=True)
class Result:
    ok: bool
    value: Any = None
    error: str = ""


@dataclass(frozen=True)
class Block:
    query: str
    variables: dict
    parse: Callable[[dict], Any]


Transport = Callable[[str, str, dict, float], Any]


def http_transport(authorization: str, role: str, payload: dict, timeout: float) -> Any:
    request = urllib.request.Request(
        GRAPHQL_URL, data=json.dumps(payload).encode(), method="POST",
        headers={"Authorization": authorization, "Content-Type": "application/json", "x-hasura-role": role})
    with urllib.request.urlopen(request, timeout=timeout) as reply:
        return json.loads(reply.read())


class Core:
    def __init__(self, transport: Transport = http_transport, timeout: float = TIMEOUT_S):
        self.transport = transport
        self.timeout = timeout

    def _one(self, authorization: str, block: Block) -> Result:
        try:
            reply = self.transport(authorization, ROLE, {"query": block.query, "variables": block.variables}, self.timeout)
            if not isinstance(reply, dict) or reply.get("errors") or not isinstance(reply.get("data"), dict):
                raise CoreError("core answered with an error or an unexpected shape")
            return Result(True, block.parse(reply["data"]))
        except (OSError, ValueError, KeyError, TypeError, AttributeError, CoreError) as exc:  # URLError and timeouts are OSError
            return Result(False, error=f"{type(exc).__name__}: {exc}"[:200])

    def run(self, authorization: str, blocks: dict[str, Block]) -> dict[str, Result]:
        """All blocks at once; a block that has not answered within the timeout is an error, the page still renders."""
        pool = ThreadPoolExecutor(max_workers=max(1, len(blocks)))
        futures = {name: pool.submit(self._one, authorization, block) for name, block in blocks.items()}
        out = {}
        try:
            for name, future in futures.items():
                try:
                    out[name] = future.result(timeout=self.timeout)
                except FutureTimeout:
                    out[name] = Result(False, error="timeout")
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
        return out


# ---------- parsers: raw GraphQL data -> typed rows; any odd shape raises and becomes a block error ----------

def parse_ts(raw: str) -> datetime:
    """A Prisma `timestamp` has no offset and is UTC; a `timestamptz` carries its offset."""
    ts = datetime.fromisoformat(raw)
    return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts.astimezone(timezone.utc)


def _ts(raw) -> datetime | None:
    return None if raw is None else parse_ts(raw)


def _float(raw) -> float:
    if isinstance(raw, bool) or raw is None:
        raise TypeError("number expected")
    return float(raw)


def _opt_float(raw) -> float | None:
    return None if raw is None else _float(raw)


def _int(raw) -> int:
    return int(_float(raw))


def _str(raw) -> str:
    if not isinstance(raw, str):
        raise TypeError("text expected")
    return raw


def _rows(data: dict, field: str) -> list[dict]:
    rows = data[field]
    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        raise TypeError(f"{field}: list of objects expected")
    return rows


def _count(data: dict, key: str) -> int:
    return _int(data[key]["aggregate"]["count"])


def _parcel(row: dict) -> m.Parcel:
    cycles = row["crop_cycles"]
    cycle = None
    if cycles:
        c = cycles[0]
        cycle = m.Cycle(c.get("season"), _ts(c.get("sowed_at")), _ts(c.get("estimated_harvest_date")))
    household = row["household"]
    return m.Parcel(code=_str(row["parcel_code"]), household_id=_str(household["id"]), household_name=_str(household["name"]),
                    crop_type=_str(row["crop_type"]), area_ha=_float(row["area_ha"]), status=_str(row["status"]),
                    yield_per_ha=_opt_float(row.get("estimated_yield_per_ha")), cycle=cycle)


def parse_parcels(data: dict) -> list[m.Parcel]:
    return [_parcel(r) for r in _rows(data, "parcels")]


def parse_parcel(data: dict) -> m.Parcel | None:
    rows = _rows(data, "parcels")
    return _parcel(rows[0]) if rows else None


def parse_households(data: dict) -> list[str]:
    return [_str(r["name"]) for r in _rows(data, "households") if _str(r["id"])]


@dataclass(frozen=True)
class JournalCounts:
    in_period: int
    pending: int
    changes: int


def parse_journal_counts(data: dict) -> JournalCounts:
    return JournalCounts(_count(data, "in_period"), _count(data, "pending"), _count(data, "changes"))


def _journal(row: dict) -> m.Journal:
    return m.Journal(id=_str(row["id"]), parcel_code=_str(row["parcel"]["parcel_code"]),
                     household_name=_str(row["parcel"]["household"]["name"]), entry_date=parse_ts(_str(row["entry_date"])),
                     activity_type=_str(row["activity_type"]), status=_str(row["status"]),
                     created_at=parse_ts(_str(row["created_at"])), performed_by=_str(row["performed_by"]))


def parse_journals(data: dict) -> list[m.Journal]:
    return [_journal(r) for r in _rows(data, "journal_entries")]


@dataclass(frozen=True)
class JournalNote:
    entry: m.Journal
    notes: str


def parse_parcel_journals(data: dict) -> list[JournalNote]:
    return [JournalNote(_journal(r), r.get("notes") or "") for r in _rows(data, "journal_entries")]


def parse_diseases(data: dict) -> list[m.Disease]:
    return [m.Disease(id=_str(r["id"]), parcel_code=_str(r["parcel"]["parcel_code"]), household_name=_str(r["household"]["name"]),
                      detection_date=parse_ts(_str(r["detection_date"])), ai_name=_str(r["ai_disease_name"]),
                      confidence=_float(r["ai_confidence"]), confirmed=r.get("confirmed_diagnosis"), status=_str(r["status"]),
                      created_at=parse_ts(_str(r["created_at"]))) for r in _rows(data, "disease_reports")]


def parse_lots(data: dict) -> list[m.Lot]:
    return [m.Lot(code=_str(r["lot_code"]), commodity=_str(r["commodity"]), grade=r.get("quality_grade"),
                  harvest_date=parse_ts(_str(r["harvest_date"])), estimated_kg=_opt_float(r.get("estimated_weight_kg")),
                  actual_kg=_opt_float(r.get("actual_weight_kg")), status=_str(r["status"]),
                  created_at=parse_ts(_str(r["created_at"]))) for r in _rows(data, "lots")]


@dataclass(frozen=True)
class Weather:
    recorded_at: datetime
    condition: str
    temperature_c: float
    precipitation_mm: float
    humidity_pct: float


def parse_weather(data: dict) -> Weather | None:
    rows = _rows(data, "weather_cache")
    if not rows:
        return None
    r = rows[0]
    return Weather(parse_ts(_str(r["recorded_at"])), _str(r["condition"]), _float(r["temperature_c"]),
                   _float(r["precipitation_mm"]), _float(r["humidity_pct"]))


def _price(r: dict) -> m.Price:
    return m.Price(_str(r["commodity"]), _str(r["metric"]), _float(r["value"]), _str(r["unit"]), _str(r["source"]),
                   parse_ts(_str(r["fetched_at"])))


def parse_prices(data: dict) -> list[m.Price]:
    return m.choose_prices([_price(r) for r in _rows(data, "tea")], [_price(r) for r in _rows(data, "others")])


def parse_readings(data: dict) -> list[m.Reading]:
    return [m.Reading(_str(r["parcel_code"]), _str(r["sensor"]), parse_ts(_str(r["ts"])), _float(r["value"]))
            for r in _rows(data, "telemetry_sensor_readings")]


def parse_daily(data: dict) -> list[m.Daily]:
    return [m.Daily(_str(r["parcel_code"]), _str(r["sensor"]), date.fromisoformat(_str(r["day"])), _int(r["reading_count"]),
                    _float(r["min_value"]), _float(r["max_value"]), _float(r["avg_value"]),
                    parse_ts(_str(r["first_ts"])), parse_ts(_str(r["last_ts"]))) for r in _rows(data, "telemetry_sensor_daily")]


def parse_runs(data: dict) -> list[m.Run]:
    return [m.Run(id=_str(r["id"]), target=_str(r["target"]), partition_date=date.fromisoformat(_str(r["partition_date"])),
                  status=_str(r["status"]), row_count=None if r.get("row_count") is None else _int(r["row_count"]),
                  min_ts=_ts(r.get("min_ts")), max_ts=_ts(r.get("max_ts")), sha256=r.get("sha256"),
                  size_bytes=None if r.get("size_bytes") is None else _int(r["size_bytes"]), quality=r.get("quality"),
                  error=r.get("error"), started_at=parse_ts(_str(r["started_at"])), finished_at=_ts(r.get("finished_at")))
            for r in _rows(data, "telemetry_lifecycle_runs")]
