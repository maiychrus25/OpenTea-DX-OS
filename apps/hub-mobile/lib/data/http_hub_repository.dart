// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'core/core_exception.dart';
import 'core/core_mappers.dart';
import 'core/core_queries.dart';
import 'core/graphql_client.dart';
import 'hub_repository.dart';
import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/order.dart';
import 'models/staff.dart';

/// Real data for the "Lõi" screens (members, parcels, diary, schedule, lots,
/// notifications, HTX profile) over GraphQL; everything else is delegated to
/// [_shop], which is the sample repository until the Gian hàng mini-app exists
/// (tours, products, orders, payments, articles, bulletins, weather, reports).
///
/// NOT verified against a running Hasura/Keycloak: it follows the metadata in
/// `platform/hasura/metadata` and the web's gateway readers, nothing more.
///
/// Scoping: the `htxCode` arguments are ignored on purpose. Hasura picks the
/// HTX from the token's `htx_code`; a client-side code would add nothing. For a
/// farmer, `householdId` adds a `where` so the screen asks for its own rows,
/// but the real guard is Hasura's row permission on `keycloak_user_id`: a
/// farmer token gets only its own household whatever this client sends.
class HttpHubRepository implements HubRepository {
  HttpHubRepository({required GraphqlClient core, required HubRepository shop}) : _core = core, _shop = shop;

  final GraphqlClient _core;
  final HubRepository _shop;

  @override
  bool get coreIsSample => false;

  /// Hasura has no insert/update permission on these tables, and the web's
  /// write routes need the web session. No write endpoint is invented here.
  @override
  bool get coreWritable => false;

  @override
  Future<HtxProfile> getHtxProfile(String htxCode) async {
    final data = await _core.query(htxProfileQuery);
    final list = rows(data['htx_profiles']);
    if (list.isEmpty) throw const CoreException(CoreErrorKind.forbidden, 'Không thấy hồ sơ HTX của tài khoản này.');
    return htxProfileFrom(list.first);
  }

  @override
  Future<List<Member>> listMembers(String htxCode) async {
    final data = await _core.query(householdsQuery, variables: {'limit': coreListLimit});
    return [for (final r in rows(data['households'])) memberFrom(r, htxCode)];
  }

  @override
  Future<List<Parcel>> listParcels(String htxCode, {String? householdId}) async {
    final data = await _core.query(
      parcelsQuery,
      variables: {'where': parcelsWhere(householdId), 'limit': coreListLimit},
    );
    return [for (final r in rows(data['parcels'])) parcelFrom(r)];
  }

  @override
  Future<List<JournalEntry>> listJournal(String htxCode, {String? householdId}) async {
    final data = await _core.query(
      journalQuery,
      variables: {'where': journalWhere(householdId), 'limit': coreListLimit},
    );
    return [for (final r in rows(data['journal_entries'])) journalFrom(r)];
  }

  @override
  Future<List<Lot>> listLots(String htxCode) async {
    final data = await _core.query(lotsQuery, variables: {'limit': coreListLimit});
    return [for (final r in rows(data['lots'])) lotFrom(r)];
  }

  /// [householdId] is not sent: the core scopes notifications by recipient
  /// (`recipient_id = X-Hasura-User-Id`), which is the only filter that counts.
  @override
  Future<List<AppNotification>> listNotifications(String htxCode, {String? householdId}) async {
    final data = await _core.query(notificationsQuery, variables: {'limit': coreListLimit});
    return [for (final r in rows(data['notifications'])) notificationFrom(r)];
  }

  /// `where` of the parcel list: all visible parcels, or one household's.
  static Map<String, Object?> parcelsWhere(String? householdId) => householdId == null
      ? const {}
      : {
          'household_id': {'_eq': householdId},
        };

  /// `where` of the diary list: through the parcel's household.
  static Map<String, Object?> journalWhere(String? householdId) => householdId == null
      ? const {}
      : {
          'parcel': {
            'household_id': {'_eq': householdId},
          },
        };

  // ---- Reads only: no write permission exists in Hasura for these roles ----

  @override
  Future<JournalEntry> reviewJournal(String entryId, {required bool approve}) async =>
      throw const CoreException.unsupported();

  @override
  Future<JournalEntry> addJournal(NewJournalEntry draft) async => throw const CoreException.unsupported();

  @override
  Future<Parcel> rescheduleHarvest(String parcelId, DateTime date) async => throw const CoreException.unsupported();

  @override
  Future<void> markNotificationRead(String id) async => throw const CoreException.unsupported();

  @override
  Future<void> markAllNotificationsRead(String htxCode, {String? householdId}) async =>
      throw const CoreException.unsupported();

  // ---- Gian hàng and the rest: sample until the mini-app exists ----

  @override
  Future<List<Htx>> listHtxs() => _shop.listHtxs();

  @override
  Future<Htx> getHtx(String code) => _shop.getHtx(code);

  @override
  Future<List<Tour>> listTours({String? htxCode}) => _shop.listTours(htxCode: htxCode);

  @override
  Future<Tour> getTour(String id) => _shop.getTour(id);

  @override
  Future<List<Departure>> listDepartures(String tourId) => _shop.listDepartures(tourId);

  @override
  Future<List<Product>> listProducts({String? htxCode}) => _shop.listProducts(htxCode: htxCode);

  @override
  Future<List<Household>> listHouseholds({String? htxCode}) => _shop.listHouseholds(htxCode: htxCode);

  @override
  Future<Household> getHousehold(String id) => _shop.getHousehold(id);

  @override
  Future<List<Article>> listPublishedArticles() => _shop.listPublishedArticles();

  @override
  Future<Order> placeOrder(NewOrder draft) => _shop.placeOrder(draft);

  @override
  Future<Booking> createBooking(NewBooking draft) => _shop.createBooking(draft);

  @override
  Future<void> claimPayment(String reference) => _shop.claimPayment(reference);

  @override
  Future<List<Order>> listMyOrders(String customerId) => _shop.listMyOrders(customerId);

  @override
  Future<List<Booking>> listMyBookings(String customerId) => _shop.listMyBookings(customerId);

  @override
  Future<List<Booking>> listHouseholdVisits(String householdId) => _shop.listHouseholdVisits(householdId);

  @override
  Future<Booking> checkIn(String bookingId) => _shop.checkIn(bookingId);

  @override
  Future<List<Product>> listHouseholdProducts(String householdId) => _shop.listHouseholdProducts(householdId);

  @override
  Future<List<Order>> listOrders(String htxCode) => _shop.listOrders(htxCode);

  @override
  Future<Order> updateOrderStatus(String orderId, OrderStatus target) => _shop.updateOrderStatus(orderId, target);

  @override
  Future<List<Booking>> listBookings(String htxCode) => _shop.listBookings(htxCode);

  @override
  Future<Payment> recordPayment({required String reference, required int amount, required String recordedBy}) =>
      _shop.recordPayment(reference: reference, amount: amount, recordedBy: recordedBy);

  @override
  Future<List<Payment>> listPayments(String htxCode) => _shop.listPayments(htxCode);

  @override
  Future<List<Article>> listArticles(String htxCode) => _shop.listArticles(htxCode);

  @override
  Future<Article> submitArticle(String articleId) => _shop.submitArticle(articleId);

  @override
  Future<HtxSummary> summary(String htxCode) => _shop.summary(htxCode);

  @override
  Future<List<HtxSummary>> listLinkedSummaries() => _shop.listLinkedSummaries();

  @override
  Future<List<Article>> listPendingArticles() => _shop.listPendingArticles();

  @override
  Future<Article> reviewArticle(String articleId, {required bool approve}) =>
      _shop.reviewArticle(articleId, approve: approve);

  @override
  Future<List<Booking>> listAllBookings() => _shop.listAllBookings();

  @override
  Future<List<BulletinItem>> listBulletins() => _shop.listBulletins();

  @override
  Future<List<MarketPrice>> listMarketPrices() => _shop.listMarketPrices();

  @override
  Future<WeatherNow> currentWeather(String htxCode) => _shop.currentWeather(htxCode);

  @override
  Future<List<LinkedHtx>> listLinkedHtxs() => _shop.listLinkedHtxs();

  @override
  Future<List<RegionTour>> listRegionTours() => _shop.listRegionTours();

  @override
  Future<List<ReportRow>> reportRows() => _shop.reportRows();
}
