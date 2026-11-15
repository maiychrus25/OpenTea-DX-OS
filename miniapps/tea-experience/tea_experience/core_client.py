# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Dữ liệu lõi của HTX lấy bằng token của trưởng HTX qua gateway (DL-11).

Nguồn đúng của tên cột là apps/web/prisma/schema.prisma (không dùng docs/database-schema.md, tài liệu đã cũ).
ROOTS là truy vấn khai báo dưới dạng dữ liệu: test hợp đồng đối chiếu từng trường với schema.prisma và với
metadata Hasura, nên lệch cột sẽ làm test đỏ trước khi lên hệ thống thật.

Hasura lọc theo htx_code của token: htx_profiles theo htx_code, households và parcels qua htx_profile, vụ qua parcel.
Khách không có token nên không gọi lõi: mọi thứ khách xem là bản sao mà trưởng HTX làm mới.
"""
import json
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

GRAPHQL_URL = "http://apisix:9081/api/data/graphql"
TIMEOUT_S = 5
MAX_REPLY_BYTES = 2_000_000
# (table = root field, arguments, selected scalar fields). Aggregates are not used: the manager role has no
# allow_aggregations on households, so the member count is the number of household ids the app receives.
ROOTS = (
    ("htx_profiles", {"limit": 1}, ("htx_code", "name", "address", "crop_types", "season_label", "total_area_ha")),
    ("households", {}, ("id",)),
    ("parcels", {}, ("id", "parcel_code", "crop_type", "centroid_lat", "centroid_lng")),
    # Still growing: not harvested yet. A cycle that was never sown is counted too (no sowing date needed).
    ("parcel_crop_cycles", {"where": {"harvested_at": {"_is_null": True}}}, ("parcel_id", "season")),
)
# Fixed codes: they go into core_sync_log, never the raw error text.
UNAVAILABLE = "core_unavailable"
BAD_RESPONSE = "core_bad_response"
NO_PROFILE = "core_no_profile"
WRONG_HTX = "core_wrong_htx"
QUANT = Decimal("0.0000001")


def _render(value) -> str:
    """A GraphQL literal for the small value types used in ROOTS."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, dict):
        return "{" + ", ".join(f"{k}: {_render(v)}" for k, v in value.items()) + "}"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(value)


def build_query() -> str:
    lines = []
    for table, args, fields in ROOTS:
        arg_text = f"({', '.join(f'{k}: {_render(v)}' for k, v in args.items())})" if args else ""
        lines.append(f"  {table}{arg_text} {{ {' '.join(fields)} }}")
    return "query {\n" + "\n".join(lines) + "\n}"


QUERY = build_query()


class CoreError(Exception):
    """The core could not give a usable snapshot; the message is one of the fixed codes above."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Profile:
    htx_code: str
    name: str | None
    address: str | None  # the core's address, as the core has it: the manager sees it, guests never do
    crop_types: str | None  # the core's list of crop names, joined with ", "
    season_label: str | None
    total_area_ha: Decimal | None
    member_count: int  # households of the HTX that the manager's token can see


@dataclass(frozen=True)
class Parcel:
    parcel_code: str  # also the name shown to people: the core has no parcel name
    lat: Decimal
    lng: Decimal
    crop: str | None  # parcels.crop_type
    season: str | None  # season of the open cycle, if any
    planting: bool  # True when the parcel has a cycle not yet harvested


@dataclass(frozen=True)
class Snapshot:
    profile: Profile
    parcels: tuple[Parcel, ...]
    skipped: int  # parcels left out: no usable coordinates, duplicate code, or no id


def _text(value, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text[:limit] if text else None


def _decimal(value, low: str, high: str) -> Decimal | None:
    """A finite number in [low, high], or None. Accepts JSON numbers and numeric strings."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if not number.is_finite() or not Decimal(low) <= number <= Decimal(high):
        return None
    return number.quantize(QUANT)


def _crop_types(value) -> str | None:
    if not isinstance(value, list):
        return None
    names = [t.strip() for t in value if isinstance(t, str) and t.strip()]
    return ", ".join(names)[:300] or None


def parse_snapshot(data: dict, htx_code: str) -> Snapshot:
    """Check the core's reply for one HTX. Pure: no network, no database."""
    profiles = data.get("htx_profiles")
    households = data.get("households")
    parcels_raw = data.get("parcels")
    cycles_raw = data.get("parcel_crop_cycles")
    if not all(isinstance(x, list) for x in (profiles, households, parcels_raw, cycles_raw)):
        raise CoreError(BAD_RESPONSE)
    if not profiles or not isinstance(profiles[0], dict):
        raise CoreError(NO_PROFILE)
    row = profiles[0]
    if row.get("htx_code") != htx_code:
        raise CoreError(WRONG_HTX)
    area = _decimal(row.get("total_area_ha"), "0", "1000000")
    profile = Profile(
        htx_code=htx_code,
        name=_text(row.get("name"), 200),
        address=_text(row.get("address"), 300),
        crop_types=_crop_types(row.get("crop_types")),
        season_label=_text(row.get("season_label"), 100),
        total_area_ha=area.quantize(Decimal("0.01")) if area is not None else None,
        member_count=sum(1 for h in households if isinstance(h, dict) and _text(h.get("id"), 64)),
    )

    # The first open cycle per parcel decides its season; a parcel with an open cycle is planted.
    open_cycle: dict[str, str | None] = {}
    for cycle in cycles_raw:
        if isinstance(cycle, dict) and isinstance(cycle.get("parcel_id"), str):
            open_cycle.setdefault(cycle["parcel_id"], _text(cycle.get("season"), 50))

    parcels: list[Parcel] = []
    seen: set[str] = set()
    skipped = 0
    for raw in parcels_raw:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        code = _text(raw.get("parcel_code"), 50)
        lat = _decimal(raw.get("centroid_lat"), "-90", "90")
        lng = _decimal(raw.get("centroid_lng"), "-180", "180")
        pid = raw.get("id")
        if code is None or code in seen or lat is None or lng is None or not isinstance(pid, str):
            skipped += 1
            continue
        seen.add(code)
        parcels.append(Parcel(parcel_code=code, lat=lat, lng=lng, crop=_text(raw.get("crop_type"), 100),
                              season=open_cycle.get(pid), planting=pid in open_cycle))
    return Snapshot(profile=profile, parcels=tuple(parcels), skipped=skipped)


def fetch_snapshot(authorization: str, htx_code: str) -> Snapshot:
    """One call to the core with the manager's own token, 5 seconds at most."""
    request = urllib.request.Request(
        GRAPHQL_URL, data=json.dumps({"query": QUERY}).encode(), method="POST",
        headers={"Authorization": authorization, "Content-Type": "application/json", "x-hasura-role": "manager"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as reply:
            raw = reply.read(MAX_REPLY_BYTES + 1)
    except OSError as exc:  # URLError and timeouts are OSError
        raise CoreError(UNAVAILABLE) from exc
    if len(raw) > MAX_REPLY_BYTES:
        raise CoreError(BAD_RESPONSE)
    try:
        body = json.loads(raw)
    except ValueError as exc:
        raise CoreError(BAD_RESPONSE) from exc
    data = body.get("data") if isinstance(body, dict) else None
    if not isinstance(data, dict):
        raise CoreError(BAD_RESPONSE)
    return parse_snapshot(data, htx_code)
