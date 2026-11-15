# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Preview server: the real app over a throwaway Postgres with a demo cooperative, for screenshots and visual passes.

    cd miniapps/tea-tour && python tests/preview.py --port 8090      (needs Docker and the platform CLI's requirements)

Open http://127.0.0.1:8090/apps/tea-tour/ (manager), .../guide (guide), .../public/TC (customer site). The role follows
the path prefix (/public: nobody, /guide: farmer, everything else: manager) and ?as=manager|farmer overrides it for one
request. No cookies: pages are stateless, exactly as behind the proxy. Every response carries the production CSP.
Ctrl-C stops the server and removes the database container.
"""
import argparse
import importlib.util
import io
import os
import signal
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs

APP_DIR = Path(__file__).resolve().parents[1]
REPO = APP_DIR.parents[1]
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image, ImageDraw  # noqa: E402

from factories import (HTX, add_booking, add_departure, add_event, add_inquiry, add_payment, add_review,  # noqa: E402
                       add_settings, add_tour, bearer)

PREFIX = "/apps/tea-tour"
CSP = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'"
MANAGER_TOKEN = bearer(sub="kc-manager-tc", htx=HTX, roles=("manager",), name="Chị Lan (trưởng HTX)")["Authorization"]
FARMER_TOKEN = bearer(sub="kc-farmer-1", htx=HTX, roles=("farmer",), name="Hộ ông Ba")["Authorization"]
GUIDE_1 = ("kc-farmer-1", "Hộ ông Ba")
GUIDE_2 = ("kc-farmer-2", "Hộ bà Tư")
PALETTES = (((190, 220, 150), (30, 110, 70)), ((250, 210, 150), (120, 80, 40)), ((170, 200, 240), (40, 100, 80)),
            ((220, 235, 200), (60, 130, 90)), ((240, 190, 170), (90, 100, 60)))


def photo(palette: int, seed: int, size=(1600, 1067)) -> bytes:
    """A gradient sky over layered hills: enough to judge crops and contrast without any third-party picture."""
    top, bottom = PALETTES[palette % len(PALETTES)]
    image = Image.composite(Image.new("RGB", size, bottom), Image.new("RGB", size, top), Image.linear_gradient("L").resize(size))
    draw = ImageDraw.Draw(image)
    for layer in range(4):
        shade = tuple(max(0, int(c * (0.9 - layer * 0.18))) for c in bottom)
        base = size[1] * (0.45 + layer * 0.14)
        for step in range(-1, 6):
            cx = (step * 0.24 + ((seed + layer) % 5) * 0.05) * size[0]
            draw.ellipse((cx - 0.4 * size[0], base, cx + 0.4 * size[0], base + 0.7 * size[1]), fill=shade)
    out = io.BytesIO()
    image.save(out, "JPEG", quality=85)
    return out.getvalue()


def at(days: int, hour: int = 7, minute: int = 30) -> datetime:
    from tea_tour.domain.policy import VN_TZ
    return (datetime.now(VN_TZ) + timedelta(days=days)).replace(hour=hour, minute=minute, second=0, microsecond=0)


def seed(conn) -> dict:
    """The demo cooperative TC (and a second one, LB, for isolation checks). Returns ids the tests and screenshots use."""
    from tea_tour import media
    from tea_tour.domain.tour_templates import TEMPLATES
    from tea_tour.store import core
    from tea_tour.store import media as media_store

    manager = core.Actor("MANAGER", "Chị Lan (trưởng HTX)", "kc-manager-tc")
    guest = core.Actor("GUEST", "Khách")
    add_settings(conn, display_name="HTX Chè Tân Cương", tagline="Chè ngon từ đồi, trọn một ngày thảnh thơi",
                 intro="Hợp tác xã chè Tân Cương đón bạn lên đồi hái chè, sao chè và thưởng trà cùng các nông hộ "
                       "đã làm nghề ba đời. Mỗi tour có người dẫn là chính người trồng chè.",
                 hotline="0912 345 678", zalo="0912345678", email="tour@chetancuong.example",
                 address="Xóm Hồng Thái, xã Tân Cương, Thái Nguyên", map_url="https://maps.example.com/tan-cuong",
                 bank_bin="970405", bank_account="8600201001234", bank_holder="HTX CHE TAN CUONG", deposit_percent=30,
                 hold_hours=24, cancel_free_hours=24, auto_confirm=False,
                 policy_text="Đặt cọc 30% để giữ chỗ trong 24 giờ. Huỷ miễn phí trước giờ khởi hành 24 giờ; sau đó "
                             "vui lòng gọi hotline để HTX xử lý.")
    media_store.add_site_cover(conn, HTX, _processed(photo(0, 1)), "Chị Lan")
    tours = {}
    for index, (key, status) in enumerate((("picking", "PUBLISHED"), ("crafting", "PUBLISHED"), ("sunrise", "PUBLISHED"),
                                           ("classroom", "DRAFT"))):
        template = TEMPLATES[key]
        tours[key] = add_tour(
            conn, title=template.title, status=status, category=template.category, summary=template.summary,
            description=template.description, duration_minutes=template.duration_minutes,
            itinerary=list(template.itinerary), includes=list(template.includes), excludes=list(template.excludes),
            bring=list(template.bring), faq=list(template.faq), price_adult_vnd=template.price_adult_vnd,
            price_child_vnd=template.price_child_vnd, default_seats=template.default_seats,
            meeting_point="Nhà văn hoá xóm Hồng Thái", map_url="https://maps.example.com/hong-thai")
        for shot in range(3 if key != "classroom" else 1):
            media_store.add_tour_photo(conn, HTX, tours[key], _processed(photo(index + shot, index * 3 + shot)), "Chị Lan")

    def departure(key, days, seats, hour=7, minute=30, guide=None, **fields):
        t = TEMPLATES[key]
        return add_departure(conn, tours[key], starts_at=at(days, hour, minute), seats=seats,
                             price_adult_vnd=t.price_adult_vnd, price_child_vnd=t.price_child_vnd,
                             guide_user_id=guide[0] if guide else None, guide_name=guide[1] if guide else None, **fields)

    d = {
        "picking_tomorrow": departure("picking", 1, 12, guide=GUIDE_1),
        "picking_soon": departure("picking", 3, 12, guide=GUIDE_1),
        "picking_closed": departure("picking", 6, 12, status="CLOSED"),
        "picking_later": departure("picking", 14, 12),
        "picking_past": departure("picking", -4, 12, guide=GUIDE_1),
        "picking_old": departure("picking", -12, 12, guide=GUIDE_1),
        "crafting_full": departure("crafting", 2, 10, hour=14, minute=0, guide=GUIDE_2),
        "crafting_open": departure("crafting", 5, 10, hour=14, minute=0, guide=GUIDE_1),
        "crafting_cancelled": departure("crafting", 20, 10, hour=14, minute=0, status="CANCELLED",
                                        cancel_reason="Mưa lớn kéo dài, HTX dời lịch"),
        "crafting_past": departure("crafting", -8, 10, hour=14, minute=0, guide=GUIDE_2),
        "sunrise_today": add_departure(conn, tours["sunrise"], starts_at=datetime.now(at(0).tzinfo) - timedelta(hours=2),
                                       seats=15, price_adult_vnd=180_000, price_child_vnd=100_000,
                                       guide_user_id=GUIDE_1[0], guide_name=GUIDE_1[1]),
        "sunrise_next": departure("sunrise", 4, 15, hour=5, minute=0),
        "sunrise_later": departure("sunrise", 10, 15, hour=5, minute=0),
        "classroom_draft": departure("classroom", 12, 40, hour=8, minute=0),
    }

    def book(key, adults, children=0, name="Nguyễn Văn Khách", phone="0912345678", note=None, pay=None, report=False,
             cancel=None, request=None):
        """A booking through the real rules, so its history, hold and deposit are what production would write."""
        request = core.NewBooking(HTX, d[key], adults, children, name, phone, None, note, request or f"preview-{name}-{phone}-{key}-{adults}",
                                  "WEB")
        booking = core.create_booking(conn, request, guest)
        assert isinstance(booking, core.Booking), booking
        if report:
            core.report_paid(conn, HTX, booking.id)
        if pay:
            core.record_payment(conn, HTX, booking.id, pay, "TRANSFER", None, manager)
        if cancel:
            core.cancel_booking(conn, HTX, booking.id, cancel, manager)
        return booking.id

    b = {
        "tomorrow_confirmed": book("picking_tomorrow", 2, 1, "Trần Thị Mai", "0987000111", "Có bé 5 tuổi, xin ghế ngồi", pay=195_000),
        "tomorrow_pending": book("picking_tomorrow", 3, 0, "Lê Quang Hải", "0987000222"),
        "tomorrow_reported": book("picking_tomorrow", 2, 0, "Phạm Thu Hà", "0987000333", report=True),
        "soon_paid": book("picking_soon", 2, 0, "Đỗ Minh Tuấn", "0987000444", pay=500_000),
        "soon_refund": book("picking_soon", 1, 1, "Vũ Hoài Nam", "0987000555", pay=120_000, cancel="Khách xin huỷ do ốm"),
        "full_a": book("crafting_full", 4, 0, "Nguyễn Hữu Phước", "0987000666", pay=1_280_000),
        "full_b": book("crafting_full", 3, 0, "Hoàng Thị Lý", "0987000777", pay=960_000),
        "full_c": book("crafting_full", 2, 1, "Bùi Anh Dũng", "0987000888", pay=840_000),
        "open_one": book("crafting_open", 2, 0, "Ngô Thanh Vân", "0987000999", pay=192_000),
        "later_pending": book("picking_later", 2, 2, "Đặng Kim Chi", "0987001000"),
    }
    # An expired hold nobody swept yet: it frees its seats through the view, and the overview sweep cancels it.
    b["expired"] = add_booking(conn, d["picking_soon"], adults=2, guest_name="Trịnh Văn Long", phone="0987001111",
                               total_vnd=500_000, deposit_vnd=150_000, hold_until=at(0).replace(hour=0, minute=1) - timedelta(hours=1))
    add_event(conn, b["expired"], kind="CREATED", detail="Đặt chỗ: 2 người lớn, 0 trẻ em")
    # A departure that started two hours ago: one group already checked in.
    for key, adults, children, name, phone, present in (("sunrise_today", 2, 0, "Phan Văn Bình", "0987002001", 2),
                                                        ("sunrise_today", 2, 1, "Lương Thị Hoa", "0987002002", None),
                                                        ("sunrise_today", 4, 0, "Mai Đình Khoa", "0987002003", None)):
        total = adults * 180_000 + children * 100_000
        booking = add_booking(conn, d[key], adults=adults, children=children, status="CONFIRMED", guest_name=name, phone=phone,
                              price_adult_vnd=180_000, price_child_vnd=100_000, total_vnd=total, deposit_vnd=0,
                              checked_in_at=at(0) if present else None, checked_in_count=present,
                              checked_in_by=GUIDE_1[1] if present else None)
        add_event(conn, booking, kind="CREATED", detail="Đặt chỗ")
        add_event(conn, booking, kind="CONFIRMED", actor_kind="MANAGER", actor_name="Chị Lan (trưởng HTX)")
        if present:
            add_event(conn, booking, kind="CHECKED_IN", actor_kind="GUIDE", actor_name=GUIDE_1[1])
        b["today_" + phone[-1]] = booking
    # Past departures: checked-in guests with paid bookings and reviews, one absent guest, one cancelled.
    reviews = []
    for key, tour_key, people in (("picking_past", "picking", (("Hồ Thị Nga", "0987003001", 2, 1, 5, "PUBLISHED",
                                                               "Cả nhà rất thích. Bé hái chè vui lắm, người dẫn nhiệt tình."),
                                                              ("Võ Đức Anh", "0987003002", 2, 0, 4, "PENDING",
                                                               "Đồi đẹp, hơi nắng nhưng đáng đi."),
                                                              ("Lý Văn Sơn", "0987003003", 3, 0, 2, "HIDDEN", "Đông người quá."),
                                                              ("Cao Thị Yến", "0987003004", 2, 0, None, None, None))),
                                  ("picking_old", "picking", (("Đinh Công Thành", "0987003005", 2, 0, 5, "PUBLISHED",
                                                               "Trải nghiệm tuyệt vời, sẽ quay lại cùng bạn bè."),
                                                              ("Tạ Thu Hương", "0987003006", 4, 2, 4, "PUBLISHED",
                                                               "Tour phù hợp gia đình, chè pha xong thơm lắm."))),
                                  ("crafting_past", "crafting", (("Kiều Mỹ Linh", "0987003007", 2, 0, 5, "PUBLISHED",
                                                                  "Tự tay sao chè rất thú vị, mang về một gói chè nhỏ."),))):
        template = TEMPLATES[tour_key]
        for name, phone, adults, children, rating, review_status, comment in people:
            total = adults * template.price_adult_vnd + children * template.price_child_vnd
            attended = rating is not None
            booking = add_booking(conn, d[key], adults=adults, children=children, status="CONFIRMED", guest_name=name, phone=phone,
                                  price_adult_vnd=template.price_adult_vnd, price_child_vnd=template.price_child_vnd,
                                  total_vnd=total, deposit_vnd=0,
                                  checked_in_at=at(-4) if attended else None, checked_in_count=adults + children if attended else None,
                                  checked_in_by=GUIDE_1[1] if attended else None)
            add_payment(conn, booking, total, method="TRANSFER")
            add_event(conn, booking, kind="CREATED", detail="Đặt chỗ")
            add_event(conn, booking, kind="PAYMENT", actor_kind="MANAGER", actor_name="Chị Lan (trưởng HTX)", detail="Thu đủ")
            if review_status:
                reviews.append(add_review(conn, booking, tours[tour_key], rating=rating, status=review_status, comment=comment,
                                          display_name=name.split()[-1],
                                          reply="Cảm ơn bạn, HTX rất vui được đón bạn." if review_status == "PUBLISHED" and rating == 5 else None))
    stale = add_booking(conn, d["picking_past"], adults=1, status="CANCELLED", guest_name="Khách huỷ", phone="0987003999",
                        cancel_reason="Khách tự huỷ", cancelled_by="GUEST")
    add_event(conn, stale, kind="CANCELLED", detail="Khách tự huỷ")
    for status, name, size, message, note in (("NEW", "Cô giáo Thu Trang", 32, "Đoàn học sinh lớp 5, muốn đi vào thứ Sáu.", None),
                                              ("CONTACTED", "Anh Quốc Bảo", 12, "Nhóm bạn công ty, cần xuất hoá đơn.", "Đã gọi, hẹn báo giá"),
                                              ("CLOSED", "Chị Diệu Linh", 6, "Chụp ảnh cưới trên đồi chè.", "Đã chốt ngày")):
        add_inquiry(conn, name=name, group_size=size, message=message, status=status, internal_note=note)
    # A second cooperative, so every page can be checked for leaks.
    other = add_tour(conn, htx="LB", title="Tour La Bằng bí mật", status="PUBLISHED")
    other_departure = add_departure(conn, other, htx="LB", starts_at=at(3))
    add_booking(conn, other_departure, htx="LB", guest_name="Khách La Bằng", phone="0911222333")
    return {"tours": tours, "departures": d, "bookings": b, "reviews": reviews, "other_tour": other}


def _processed(data: bytes):
    from tea_tour import media
    result = media.process_image(data)
    assert isinstance(result, media.ProcessedImage), result
    return result


class Preview:
    """ASGI wrapper standing in for the web proxy and the gateway: strips the prefix, injects the token, adds the CSP."""

    def __init__(self, app):
        self.app = app
        self.css = (REPO / "apps" / "web" / "public" / "dxos-app.css").read_bytes()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        if path == "/dxos-app.css":
            return await self.reply(send, 200, self.css, b"text/css; charset=utf-8")
        if not (path == PREFIX or path.startswith(PREFIX + "/")):
            return await self.reply(send, 302, b"", b"text/plain", [(b"location", (PREFIX + "/").encode())])
        inner = path.removeprefix(PREFIX) or "/"
        query = parse_qs(scope.get("query_string", b"").decode())
        role = (query.get("as") or [""])[0]
        if not role:
            role = "" if inner.startswith("/public") else "farmer" if inner.startswith("/guide") else "manager"
        headers = [h for h in scope["headers"] if h[0] != b"authorization"]
        token = {"manager": MANAGER_TOKEN, "farmer": FARMER_TOKEN}.get(role)
        if token:
            headers.append((b"authorization", token.encode()))

        async def with_csp(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": [*message["headers"], (b"content-security-policy", CSP.encode())]}
            await send(message)

        await self.app({**scope, "path": inner, "raw_path": inner.encode(), "root_path": PREFIX, "headers": headers},
                       receive, with_csp)

    @staticmethod
    async def reply(send, status, body, content_type, extra=()):
        headers = [(b"content-type", content_type), (b"content-security-policy", CSP.encode()), *extra]
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})


def make_app(app_db_url: str):
    os.environ["DXOS_APP_DB_URL"] = app_db_url
    from tea_tour import main
    return Preview(main.app)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8090)
    args = parser.parse_args()
    import psycopg
    import uvicorn
    from psycopg.conninfo import make_conninfo

    sys.path.insert(0, str(REPO / "platform" / "cli"))
    from dxos_cli.database import drop_app_database, ensure_app_database

    from tea_tour import store

    spec = importlib.util.spec_from_file_location("cli_conftest", REPO / "platform/cli/tests/conftest.py")
    cli_conftest = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli_conftest)
    database = cli_conftest.pg_url._get_wrapped_function()()  # the throwaway Postgres container of the test fixture
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        pg_url = next(database)
        with psycopg.connect(pg_url, autocommit=True) as admin:
            drop_app_database(admin, "tea-tour")
            password = ensure_app_database(admin, "tea-tour", APP_DIR / "migrations")
        app_url = make_conninfo(pg_url, user="app_tea_tour", password=password)
        with store.connect(app_url) as conn:
            seed(conn)
        print(f"Preview ready: http://127.0.0.1:{args.port}{PREFIX}/  (manager)  {PREFIX}/guide  (guide)  "
              f"{PREFIX}/public/{HTX}  (customer site); ?as=manager|farmer switches the role. Ctrl-C to stop.", flush=True)
        uvicorn.run(make_app(app_url), host="127.0.0.1", port=args.port, log_level="warning")
    except KeyboardInterrupt:
        pass
    finally:
        database.close()  # runs the fixture's cleanup: the container is removed


if __name__ == "__main__":
    main()
