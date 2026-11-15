# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest
from factories import add_media, add_settings, add_tour, add_tour_media, sample_image

from tea_tour import media
from tea_tour.store import media as media_store
from tea_tour.store.media import MediaRefusal

HTX = "TC"


def processed() -> media.ProcessedImage:
    large, thumb, width, height = sample_image()
    return media.ProcessedImage(large, thumb, width, height)


def upload(db, tour, htx=HTX):
    return media_store.add_tour_photo(db, htx, tour, processed(), "Quản trị TC")


def order(db, tour, htx=HTX):
    return [m.id for m in media_store.list_tour_media(db, htx, tour)]


def test_photos_keep_their_order_and_the_first_becomes_the_cover(db):
    tour = add_tour(db)
    first, second, third = (upload(db, tour) for _ in range(3))
    assert order(db, tour) == [first, second, third]
    assert [m.position for m in media_store.list_tour_media(db, HTX, tour)] == [0, 1, 2]
    assert db.execute("SELECT cover_media_id FROM tours WHERE id = %s", (tour,)).fetchone()[0] == first
    ref = media_store.list_tour_media(db, HTX, tour)[0]
    assert (ref.width, ref.height) == sample_image()[2:]


def test_at_most_12_photos_per_tour(db):
    tour = add_tour(db)
    for _ in range(12):
        assert not isinstance(upload(db, tour), MediaRefusal)
    assert upload(db, tour) is MediaRefusal.TOUR_FULL
    assert len(order(db, tour)) == 12
    assert db.execute("SELECT count(*) FROM media").fetchone()[0] == 12  # the refused upload left nothing behind
    assert not isinstance(upload(db, add_tour(db, title="Tour khác")), MediaRefusal)  # the limit is per tour


def test_at_most_200_photos_per_cooperative(db):
    tour = add_tour(db)
    db.execute("INSERT INTO media (htx_code, width, height, large, thumb) "
               "SELECT 'TC', 1, 1, '\\x00', '\\x00' FROM generate_series(1, 200)")
    assert upload(db, tour) is MediaRefusal.HTX_FULL
    other = add_tour(db, htx="LB")
    assert not isinstance(upload(db, other, "LB"), MediaRefusal)


def test_move_up_and_down_swaps_neighbours_and_stops_at_the_ends(db):
    tour = add_tour(db)
    a, b, c = (upload(db, tour) for _ in range(3))
    assert media_store.move(db, HTX, tour, c, "up") and order(db, tour) == [a, c, b]
    assert media_store.move(db, HTX, tour, a, "down") and order(db, tour) == [c, a, b]
    assert not media_store.move(db, HTX, tour, c, "up") and not media_store.move(db, HTX, tour, b, "down")
    assert order(db, tour) == [c, a, b]
    assert not media_store.move(db, HTX, tour, a, "sideways")
    assert [m.position for m in media_store.list_tour_media(db, HTX, tour)] == [0, 1, 2]


def test_set_cover_and_remove(db):
    tour = add_tour(db)
    a, b, c = (upload(db, tour) for _ in range(3))
    assert media_store.set_tour_cover(db, HTX, tour, b)
    cover = lambda: db.execute("SELECT cover_media_id FROM tours WHERE id = %s", (tour,)).fetchone()[0]  # noqa: E731
    assert cover() == b
    assert media_store.remove(db, HTX, tour, b)
    assert cover() == a and order(db, tour) == [a, c]  # the first remaining photo takes over
    assert [m.position for m in media_store.list_tour_media(db, HTX, tour)] == [0, 1]
    assert db.execute("SELECT count(*) FROM media WHERE id = %s", (b,)).fetchone()[0] == 0
    assert media_store.remove(db, HTX, tour, a) and media_store.remove(db, HTX, tour, c)
    assert cover() is None
    assert not media_store.remove(db, HTX, tour, c)


def test_other_cooperatives_photos_cannot_be_touched(db):
    mine, theirs = add_tour(db), add_tour(db, htx="LB")
    photo = upload(db, theirs, "LB")
    assert not media_store.remove(db, HTX, mine, photo) and not media_store.remove(db, HTX, theirs, photo)
    assert not media_store.set_tour_cover(db, HTX, theirs, photo) and not media_store.move(db, HTX, theirs, photo, "up")
    assert media_store.list_tour_media(db, HTX, theirs) == []
    assert upload(db, theirs) is MediaRefusal.NOT_FOUND
    assert db.execute("SELECT count(*) FROM media").fetchone()[0] == 1


def test_a_photo_cannot_be_removed_through_another_tour(db):
    one, two = add_tour(db), add_tour(db, title="Tour hai")
    photo = upload(db, one)
    assert not media_store.remove(db, HTX, two, photo)
    assert order(db, one) == [photo]


def test_media_is_public_only_for_published_tours_or_the_cooperative_cover(db):
    tour = add_tour(db, status="DRAFT")
    photo = upload(db, tour)
    large = lambda public, htx=HTX, mid=photo, variant="large": media_store.get_image(db, htx, mid, variant, public)  # noqa: E731
    assert large(True) is None  # a draft's photo is never public
    assert large(False) is not None  # the manager sees it
    db.execute("UPDATE tours SET status = 'PUBLISHED' WHERE id = %s", (tour,))
    assert large(True) == sample_image()[0]
    assert large(True, variant="thumb") == sample_image()[1]
    db.execute("UPDATE tours SET status = 'ARCHIVED' WHERE id = %s", (tour,))
    assert large(True) is None and large(False) is not None
    assert large(True, htx="LB") is None and large(False, htx="LB") is None  # another cooperative
    db.execute("UPDATE tours SET status = 'PUBLISHED' WHERE id = %s", (tour,))
    assert large(True, variant="huge") is None and large(False, variant="../x") is None
    cover = media_store.add_site_cover(db, HTX, processed(), "Quản trị TC")
    assert media_store.get_image(db, HTX, cover, "large", True) is not None
    assert media_store.get_image(db, "LB", cover, "large", True) is None


def test_unlinked_media_is_not_public(db):
    loose = add_media(db)
    assert media_store.get_image(db, HTX, loose, "large", True) is None
    assert media_store.get_image(db, HTX, loose, "large", False) is not None


def test_site_cover_replaces_the_old_one(db):
    first = media_store.add_site_cover(db, HTX, processed(), "x")
    second = media_store.add_site_cover(db, HTX, processed(), "x")
    assert first != second
    assert db.execute("SELECT cover_media_id FROM settings WHERE htx_code = 'TC'").fetchone()[0] == second
    assert db.execute("SELECT count(*) FROM media WHERE id = %s", (first,)).fetchone()[0] == 0
    add_settings(db, htx="LB")
    assert db.execute("SELECT cover_media_id FROM settings WHERE htx_code = 'LB'").fetchone()[0] is None


def test_count_for_cooperative(db):
    tour = add_tour(db)
    upload(db, tour)
    add_media(db, htx="LB")
    assert media_store.count_for_htx(db, HTX) == 1
