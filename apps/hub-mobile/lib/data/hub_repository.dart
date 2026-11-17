// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/diagnosis.dart';
import 'models/order.dart';
import 'models/staff.dart';

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
  /// order; the travel company confirms the money of a booking.
  Future<void> claimPayment(String reference);
  Future<List<Order>> listMyOrders(String customerId);
  Future<List<Booking>> listMyBookings(String customerId);

  /// The travel company that sells the tours and receives the booking money.
  Future<TourCompany> getTourCompany();

  // Farmer (own household only). Farmers have nothing to do with tours.
  Future<List<Product>> listHouseholdProducts(String householdId);

  /// Sends a leaf photo and returns the disease name with its confidence. Never a treatment.
  ///
  /// The web classifier needs the parcel ([parcelId]); [parcelCode] is only its label on the result.
  Future<DiagnosisReport> submitDiagnosis(Uint8List image, {String? parcelId, String? parcelCode});

  /// The reports this device sent in this session, newest first.
  Future<List<DiagnosisReport>> listDiagnoses();

  // HTX manager / officer: products and product orders, never tours.
  Future<List<Order>> listOrders(String htxCode);
  Future<Order> updateOrderStatus(String orderId, OrderStatus target);

  /// Appends a ledger entry for the order or booking with this code and
  /// settles it when fully paid. Orders are confirmed by the cooperative,
  /// bookings by the travel company.
  Future<Payment> recordPayment({required String reference, required int amount, required String recordedBy});

  /// The cooperative's ledger: product-order payments only.
  Future<List<Payment>> listPayments(String htxCode);
  Future<List<Article>> listArticles(String htxCode);
  Future<Article> submitArticle(String articleId);
  Future<HtxSummary> summary(String htxCode);

  // Tour-company staff: all tour work (bookings, money, check-in) and articles.
  Future<List<HtxSummary>> listLinkedSummaries();
  Future<List<Article>> listPendingArticles();
  Future<Article> reviewArticle(String articleId, {required bool approve});
  Future<List<Booking>> listAllBookings();

  /// Cancels a pending or confirmed booking and gives its seats back.
  Future<Booking> cancelBooking(String bookingId);

  /// Marks a confirmed group as arrived.
  Future<Booking> checkIn(String bookingId);

  /// The tour part of the payment ledger (references that are booking codes).
  Future<List<Payment>> listTourPayments();

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

  // Tour-company staff
  Future<List<LinkedHtx>> listLinkedHtxs();
  Future<List<RegionTour>> listRegionTours();
  Future<List<ReportRow>> reportRows();
}
