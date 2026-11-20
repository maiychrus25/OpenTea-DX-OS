// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import '../core/role/role.dart';
import 'models/short_video.dart';
import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/diagnosis.dart';
import 'models/chat.dart';
import 'models/order.dart';
import 'models/staff.dart';

/// Manager-editable fields. Ownership and guide assignments are never client-supplied here.
class NewTour {
  const NewTour({
    required this.name,
    required this.adultPrice,
    required this.childPrice,
    required this.maxGuests,
    required this.dates,
  });
  final String name;
  final int adultPrice;
  final int childPrice;
  final int maxGuests;
  final List<DateTime> dates;
}

class NewOrder {
  const NewOrder({
    required this.customerId,
    required this.htxCode,
    required this.recipient,
    required this.phone,
    required this.address,
    required this.lines,
    required this.method,
    this.note = '',
  });
  final String customerId;
  final String htxCode;
  final String recipient;
  final String phone;
  final String address;
  final String note;
  final List<OrderLine> lines;
  final PaymentMethod method;
}

class NewBooking {
  const NewBooking({
    required this.customerId,
    required this.tourId,
    required this.departureId,
    required this.contactName,
    required this.phone,
    required this.adults,
    required this.children,
    this.email = '',
    this.note = '',
    this.date,
  });
  final String customerId;
  final String tourId;
  final String departureId;
  final String contactName;
  final String phone;
  final int adults;
  final int children;

  /// Optional contact details the customer may add.
  final String email;
  final String note;

  /// The day the customer wants to go. Used when [departureId] is empty: the tour then gets a departure on that day
  /// (any day from tomorrow on), so customers are not tied to the dates the cooperative opened.
  final DateTime? date;
}

/// Thrown for business-rule failures; [message] is Vietnamese and safe to show.
class HubException implements Exception {
  const HubException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Everything the app needs from the backend. Today only the in-memory
/// [MockHubRepository] implements it. The real HTTP client (JSON API under the
/// platform gateway, with the OIDC bearer token) plugs in here later; the API
/// is milestone M2 and its endpoints are not defined yet, so none are invented.
abstract class HubRepository {
  /// Shorts are currently session-only sample data, including in HTTP mode.
  bool get shortsAreSample;
  bool get canPostShorts;
  Future<List<ShortVideo>> listShorts(String channel);

  /// The "Video" feed of the bottom bar: every channel's clips, newest first.
  Future<List<ShortVideo>> listAllShorts();
  Future<ShortVideo> postShort(
    Claims actor, {
    required String title,
    required String source,
    required int durationSeconds,
  });
  Future<void> deleteShort(String id, {required Claims actor});
  Future<ShortVideo> recordShortView(String id);

  /// Hearts and comment count of a clip for [viewer] (null for a guest, who never "liked").
  Future<ShortReactions> shortReactions(String id, {Claims? viewer});

  /// Adds or removes [actor]'s heart; one heart per account.
  Future<ShortReactions> toggleShortLike(String id, Claims actor);

  /// Channels [actor] follows (the ids used by [ShortVideo.ownerId]).
  Future<Set<String>> followedChannels(Claims actor);

  /// Follows or unfollows [channel]; returns whether [actor] follows it now. Your own channel cannot be followed.
  Future<bool> toggleFollowChannel(String channel, Claims actor);

  /// Comments of a clip, newest first.
  Future<List<ShortComment>> listShortComments(String id);

  /// 1 to 300 characters; signed-in accounts only.
  Future<ShortComment> addShortComment(String id, Claims actor, String text);

  /// Online transport is configured; server authorization is still required.
  bool get canChatOnline;

  /// History excludes the new message. One terminal done/error follows text deltas.
  /// Return the done event's sessionId on subsequent turns of this topic only.
  Stream<ChatEvent> chat({
    required ChatTopic topic,
    required String message,
    required List<ChatTurn> history,
    String? sessionId,
    ChatContext context = const ChatContext(),
  });

  /// True while the staff "core" pages (members, parcels, diary, lots,
  /// notifications, HTX profile) are served by sample data, so screens can say so.
  bool get coreIsSample;

  /// Whether the core pages can change data from the phone: the farmer's diary
  /// entry, approving an entry, marking notifications read. False when the real
  /// repository has no write client (read-only). Single calls the server has no
  /// Bearer route for are reported by the getters below.
  bool get coreWritable;

  /// False when rejecting a diary entry has no Bearer route (real repository).
  bool get canRejectJournal;

  /// Whether a leaf photo can be sent for diagnosis. False with the real repository until the server accepts the
  /// app's Bearer token on `/api/diagnosis`.
  bool get canDiagnose;

  /// False when changing a harvest date has no Bearer route (real repository).
  bool get canRescheduleHarvest;

  // Public (guest and everyone)
  Future<List<Htx>> listHtxs();
  Future<Htx> getHtx(String code);

  /// Notable places of a cooperative that it chose to show publicly.
  Future<List<Site>> listSites(String htxCode);
  Future<List<Tour>> listTours({String? htxCode});
  Future<Tour> getTour(String id);
  Future<List<Departure>> listDepartures(String tourId);
  Future<List<Product>> listProducts({String? htxCode});
  Future<List<Household>> listHouseholds({String? htxCode});
  Future<Household> getHousehold(String id);
  Future<List<Article>> listPublishedArticles();

  // Customer
  Future<Order> placeOrder(NewOrder draft);
  Future<Booking> createBooking(NewBooking draft);

  /// The "Tôi đã chuyển khoản" button. The cooperative confirms the money of an
  /// order; the cooperative confirms the money of a booking.
  Future<void> claimPayment(String reference);
  Future<List<Order>> listMyOrders(String customerId);
  Future<List<Booking>> listMyBookings(String customerId);

  // HTX-owned tours; mutations check the manager's cooperative or guide assignment.
  Future<List<Tour>> listGuideTours(String guideId);
  Future<List<GuideStaff>> listHtxGuides(String htxCode);
  Future<GuideStaff> addHtxGuide({required String name, required String phone, required Claims actor});
  Future<Tour> createTour(NewTour draft, {required Claims actor});
  Future<Tour> updateTour(String tourId, NewTour draft, {required Claims actor});
  Future<void> addGuideToTour(String tourId, String guideId, {required Claims actor});
  Future<void> removeGuideFromTour(String tourId, String guideId, {required Claims actor});
  Future<List<Booking>> listBookings(String htxCode);
  Future<List<Booking>> listGuideBookings(String guideId, {String? tourId});

  // Farmer (own household only). Farmers have nothing to do with tours.
  Future<List<Product>> listHouseholdProducts(String householdId);

  /// Sends a leaf photo and returns the disease name with its confidence. Never a treatment.
  ///
  /// The web classifier needs the parcel ([parcelId]); [parcelCode] is only its label on the result.
  Future<DiagnosisReport> submitDiagnosis(Uint8List image, {String? parcelId, String? parcelCode});

  /// The reports this device sent in this session, newest first.
  Future<List<DiagnosisReport>> listDiagnoses();

  // HTX manager / officer: product orders remain separate from tour bookings.
  Future<List<Order>> listOrders(String htxCode);
  Future<Order> updateOrderStatus(String orderId, OrderStatus target);

  /// Appends a ledger entry for the order or booking with this code and
  /// settles it when fully paid. Orders are confirmed by the cooperative,
  /// bookings by the cooperative.
  Future<Payment> recordPayment({
    required String reference,
    required int amount,
    required String recordedBy,
    Claims? actor,
  });

  /// The cooperative's ledger: product-order payments only.
  Future<List<Payment>> listPayments(String htxCode);
  Future<List<Article>> listArticles(String htxCode);
  Future<Article> submitArticle(String articleId);
  Future<HtxSummary> summary(String htxCode);

  /// Cancels a pending or confirmed booking and gives its seats back.
  Future<Booking> cancelBooking(String bookingId, {required Claims actor});

  /// Marks a confirmed group as arrived.
  Future<Booking> checkIn(String bookingId, {required Claims actor});

  /// The tour part of the payment ledger (references that are booking codes).
  Future<List<Payment>> listTourPayments(String htxCode);

  // Staff pages of the DX-OS web app (manager, officer, farmer). Farmers pass
  // their household id so they only ever see their own rows.
  Future<HtxProfile> getHtxProfile(String htxCode);
  Future<List<Parcel>> listParcels(String htxCode, {String? householdId});
  Future<List<Member>> listMembers(String htxCode);
  Future<List<JournalEntry>> listJournal(String htxCode, {String? householdId});

  /// Manager approves or rejects a pending diary entry. Screens reload the list
  /// afterwards, so the real repository returns nothing.
  Future<void> reviewJournal(String entryId, {required bool approve});
  Future<void> addJournal(NewJournalEntry draft);

  /// Manager changes the expected harvest date of a parcel.
  Future<Parcel> rescheduleHarvest(String parcelId, DateTime date);
  Future<List<Lot>> listLots(String htxCode);
  Future<List<AppNotification>> listNotifications(String htxCode, {String? householdId});
  Future<void> markNotificationRead(String id);
  Future<void> markAllNotificationsRead(String htxCode, {String? householdId});

  /// Manager or officer sends an announcement to the members of their HTX.
  Future<void> announce({required String title, required String body});
  Future<List<BulletinItem>> listBulletins();
  Future<List<MarketPrice>> listMarketPrices();
  Future<WeatherNow> currentWeather(String htxCode);
}
