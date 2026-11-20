// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';
import 'dart:convert';

import '../core/role/role.dart';
import 'models/short_video.dart';
import 'local_chat_answerer.dart';
import 'models/chat.dart';

import 'core/core_exception.dart';
import 'core/core_mappers.dart';
import 'core/core_queries.dart';
import 'core/graphql_client.dart';
import 'core/hub_api_client.dart';
import 'hub_repository.dart';
import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/diagnosis.dart';
import 'models/order.dart';
import 'models/staff.dart';

/// Real data for the "Lõi" screens (members, parcels, diary, schedule, lots,
/// notifications, HTX profile) over GraphQL; everything else is delegated to
/// [_shop], which is the sample repository until the Gian hàng mini-app exists
/// (tours, products, orders, payments, articles, bulletins, weather, reports).
///
/// Writes go to the web API with the same Bearer token ([HubApiClient]), only
/// through the routes the web opens to mobile apps (`docs/api-contract.md`,
/// "Bearer token (mobile apps)"): journal create and batch-approve, notification
/// mark-read and announce. Rejecting an entry and changing a harvest date have no
/// such route, so they stay unsupported and the screens hide them.
///
/// NOT verified against a running Hasura/Keycloak/web: it follows the metadata in
/// `platform/hasura/metadata`, the web's gateway readers and the route sources.
///
/// Scoping: the `htxCode` arguments are ignored on purpose. Hasura picks the
/// HTX from the token's `htx_code`; a client-side code would add nothing. For a
/// farmer, `householdId` adds a `where` so the screen asks for its own rows,
/// but the real guard is Hasura's row permission on `keycloak_user_id`: a
/// farmer token gets only its own household whatever this client sends.
class HttpHubRepository implements HubRepository {
  @override
  bool get shortsAreSample => _shop.shortsAreSample;
  @override
  bool get canPostShorts => _shop.canPostShorts;
  @override
  Future<List<ShortVideo>> listShorts(String channel) => _shop.listShorts(channel);
  @override
  Future<List<ShortVideo>> listAllShorts() => _shop.listAllShorts();
  @override
  Future<ShortVideo> postShort(
    Claims actor, {
    required String title,
    required String source,
    required int durationSeconds,
  }) => _shop.postShort(actor, title: title, source: source, durationSeconds: durationSeconds);
  @override
  Future<void> deleteShort(String id, {required Claims actor}) => _shop.deleteShort(id, actor: actor);
  @override
  Future<ShortVideo> recordShortView(String id) => _shop.recordShortView(id);
  @override
  Future<ShortReactions> shortReactions(String id, {Claims? viewer}) => _shop.shortReactions(id, viewer: viewer);
  @override
  Future<ShortReactions> toggleShortLike(String id, Claims actor) => _shop.toggleShortLike(id, actor);
  @override
  Future<List<ShortComment>> listShortComments(String id) => _shop.listShortComments(id);
  @override
  Future<ShortComment> addShortComment(String id, Claims actor, String text) => _shop.addShortComment(id, actor, text);

  /// Without [api] the repository is read-only (every write is unsupported).
  HttpHubRepository({required GraphqlClient core, required HubRepository shop, HubApiClient? api})
    : _core = core,
      _shop = shop,
      _api = api;

  final GraphqlClient _core;
  final HubRepository _shop;
  final HubApiClient? _api;

  @override
  bool get coreIsSample => false;

  /// Hasura has no insert/update permission on these tables; writes use the web
  /// API's Bearer routes, so they exist only when an [HubApiClient] is given.
  @override
  bool get coreWritable => _api != null;

  /// `PUT /api/journal/{id}` changes content, not status: no reject route for Bearer callers.
  @override
  bool get canRejectJournal => false;

  /// The harvest schedule routes (`/api/schedule/harvest`) do not accept Bearer tokens.
  @override
  bool get canRescheduleHarvest => false;

  /// `POST /api/diagnosis` is the web's own route (the same classifier, the `tea` model for tea parcels): the app sends
  /// the photo with its Bearer token. Needs the Bearer client, like every write.
  @override
  bool get canDiagnose => _api != null;

  @override
  bool get canChatOnline => _api != null;

  @override
  Stream<ChatEvent> chat({
    required ChatTopic topic,
    required String message,
    required List<ChatTurn> history,
    String? sessionId,
    ChatContext context = const ChatContext(),
  }) async* {
    if (_api == null || context.localOnly) {
      yield* LocalChatAnswerer(_shop).chat(topic: topic, message: message, context: context);
      return;
    }
    try {
      await for (final frame in _api.postLines(
        '/api/chatbot',
        body: {
          'message': message,
          'type': topic.wireValue,
          'session_id': ?sessionId,
          'history': history.map((turn) => turn.toJson()).toList(),
        },
      )) {
        final value = jsonDecode(frame.line);
        if (value is! Map<String, dynamic>) throw const FormatException();
        if (value['error'] == true) {
          // Never expose arbitrary server diagnostics, tokens or HTML in an error bubble.
          yield const ChatError(chatUnavailable);
          return;
        }
        if (value['done'] == true) {
          final sources = value['sources'];
          final model = value['model'];
          if (sources is! List || sources.any((s) => s is! String) || model is! String) {
            throw const FormatException();
          }
          yield ChatDone(sources: List<String>.unmodifiable(sources), model: model, sessionId: frame.sessionId);
          return;
        }
        final text = value['text'];
        if (text is! String) throw const FormatException();
        yield ChatText(text);
      }
      // An interrupted response is not a successfully completed answer.
      yield const ChatError(chatUnavailable);
    } on HubException catch (e) {
      yield ChatError(e.message);
    } catch (_) {
      yield const ChatError(chatUnavailable);
    }
  }

  final _diagnoses = <DiagnosisReport>[];

  @override
  Future<DiagnosisReport> submitDiagnosis(Uint8List image, {String? parcelId, String? parcelCode}) async {
    if (parcelId == null || parcelId.isEmpty) throw const HubException('Hãy chọn thửa đất của ảnh này.');
    final png = image.length > 4 && image[0] == 0x89 && image[1] == 0x50 && image[2] == 0x4E && image[3] == 0x47;
    final Object? data;
    try {
      data = await _write.sendFile(
        '/api/diagnosis',
        fields: {'parcel_id': parcelId},
        fileField: 'image',
        bytes: image,
        filename: png ? 'leaf.png' : 'leaf.jpg',
        contentType: png ? 'image/png' : 'image/jpeg',
      );
    } on CoreException catch (e) {
      if (e.kind == CoreErrorKind.unavailable) {
        throw const HubException('Dịch vụ chẩn đoán bệnh đang bảo trì. Hãy thử lại sau.');
      }
      if (e.kind == CoreErrorKind.validation) {
        throw const HubException('Ảnh hoặc thửa đất chưa hợp lệ. Dùng ảnh JPEG hoặc PNG nhỏ hơn 5 MB.');
      }
      rethrow;
    }
    if (data is! Map) throw const CoreException.badResponse();
    final name = data['disease_name'];
    final score = data['confidence_score'];
    final id = data['report_id'];
    if (name is! String || score is! num || id is! String) throw const CoreException.badResponse();
    final submitted = data['submitted_at'];
    final report = DiagnosisReport(
      id: id,
      diseaseName: name,
      confidence: score.toDouble().clamp(0.0, 1.0),
      submittedAt: (submitted is String ? DateTime.tryParse(submitted) : null)?.toLocal() ?? DateTime.now(),
      parcelCode: parcelCode,
      image: image,
      serverUncertain: data['uncertain'] is bool ? data['uncertain'] as bool : null,
    );
    _diagnoses.insert(0, report);
    return report;
  }

  @override
  Future<List<DiagnosisReport>> listDiagnoses() async => List.unmodifiable(_diagnoses);

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

  // ---- Writes through the web API's Bearer routes ----

  HubApiClient get _write => _api ?? (throw const CoreException.unsupported());

  /// `POST /api/journal/batch-approve` `{entry_ids: [id]}`; manager or officer.
  /// Rejecting has no Bearer route.
  @override
  Future<void> reviewJournal(String entryId, {required bool approve}) async {
    if (!approve) throw const CoreException.unsupported();
    final data = await _write.send(
      'POST',
      '/api/journal/batch-approve',
      body: {
        'entry_ids': [entryId],
      },
    );
    final failed = data is Map ? data['failed_ids'] : null;
    final approved = data is Map ? data['approved_count'] : null;
    if (failed is List && failed.isNotEmpty || approved is num && approved < 1) {
      throw const CoreException.conflict();
    }
  }

  /// `POST /api/journal` with the web's `journalCreateSchema`: one activity,
  /// `entry_date` as `yyyy-MM-dd`, `observation` = the notes. No photo (see README).
  /// The author is the token's user, not a field of the body.
  @override
  Future<void> addJournal(NewJournalEntry draft) async {
    await _write.send('POST', '/api/journal', body: journalCreateBody(draft));
  }

  @override
  Future<Parcel> rescheduleHarvest(String parcelId, DateTime date) async => throw const CoreException.unsupported();

  /// `PUT /api/notifications` `{id, action: "mark-read"}`.
  @override
  Future<void> markNotificationRead(String id) async {
    await _write.send('PUT', '/api/notifications', body: {'id': id, 'action': 'mark-read'});
  }

  /// `PUT /api/notifications` `{action: "mark-all-read"}` (all of the caller's notifications).
  @override
  Future<void> markAllNotificationsRead(String htxCode, {String? householdId}) async {
    await _write.send('PUT', '/api/notifications', body: {'action': 'mark-all-read'});
  }

  /// `POST /api/notifications/announce` `{title, body}`; manager or officer (201).
  @override
  Future<void> announce({required String title, required String body}) async {
    await _write.send('POST', '/api/notifications/announce', body: {'title': title.trim(), 'body': body.trim()});
  }

  /// Body of `POST /api/journal`; mirrors `journalCreateSchema` in `apps/web/src/lib/validations/journal.schema.ts`.
  static Map<String, Object?> journalCreateBody(NewJournalEntry d) {
    String? text(String? v) => v == null || v.trim().isEmpty ? null : v.trim();
    final product = text(d.productName);
    final dosage = text(d.dosage);
    final notes = text(d.notes);
    final days = d.withdrawalDays;
    String two(int n) => n.toString().padLeft(2, '0');
    return {
      'parcel_id': d.parcelId,
      'entry_date': '${d.entryDate.year.toString().padLeft(4, '0')}-${two(d.entryDate.month)}-${two(d.entryDate.day)}',
      'observation': ?notes,
      'activities': [
        {
          'activity_type': _activityTypeCode(d.activityType),
          'product_name': ?product,
          'dosage': ?dosage,
          if (days != null && days >= 0) 'withdrawal_days': days,
        },
      ],
    };
  }

  static String _activityTypeCode(ActivityType t) => switch (t) {
    ActivityType.sowing => 'SOWING',
    ActivityType.fertilizing => 'FERTILIZING',
    ActivityType.spraying => 'SPRAYING',
    ActivityType.irrigation => 'IRRIGATION',
    ActivityType.harvest => 'HARVEST',
    ActivityType.other => 'OTHER',
  };

  // ---- Gian hàng and the rest: sample until the mini-app exists ----

  @override
  Future<List<Htx>> listHtxs() => _shop.listHtxs();

  @override
  Future<Htx> getHtx(String code) => _shop.getHtx(code);

  // Like the rest of the storefront, from the sample repository until the tea-experience mini-app serves JSON.
  @override
  Future<List<Site>> listSites(String htxCode) => _shop.listSites(htxCode);

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
  Future<TourCompany> getTourCompany() => _shop.getTourCompany();

  @override
  Future<List<Product>> listHouseholdProducts(String householdId) => _shop.listHouseholdProducts(householdId);

  @override
  Future<List<Order>> listOrders(String htxCode) => _shop.listOrders(htxCode);

  @override
  Future<Order> updateOrderStatus(String orderId, OrderStatus target) => _shop.updateOrderStatus(orderId, target);

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
  Future<Booking> cancelBooking(String bookingId) => _shop.cancelBooking(bookingId);

  @override
  Future<Booking> checkIn(String bookingId) => _shop.checkIn(bookingId);

  @override
  Future<List<Payment>> listTourPayments() => _shop.listTourPayments();

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
