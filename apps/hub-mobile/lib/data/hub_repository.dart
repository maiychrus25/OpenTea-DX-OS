// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'models/booking.dart';
import 'models/catalog.dart';
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
  });
  final String customerId;
  final String tourId;
  final String departureId;
  final String contactName;
  final String phone;
  final int adults;
  final int children;
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
  // Public (guest and everyone)
  Future<List<Htx>> listHtxs();
  Future<Htx> getHtx(String code);
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

  /// The "Tôi đã chuyển khoản" button; the manager still has to confirm the money.
  Future<void> claimPayment(String reference);
  Future<List<Order>> listMyOrders(String customerId);
  Future<List<Booking>> listMyBookings(String customerId);

  // Farmer (own household only)
  Future<List<Booking>> listHouseholdVisits(String householdId);
  Future<Booking> checkIn(String bookingId);
  Future<List<Product>> listHouseholdProducts(String householdId);

  // HTX manager / officer
  Future<List<Order>> listOrders(String htxCode);
  Future<Order> updateOrderStatus(String orderId, OrderStatus target);
  Future<List<Booking>> listBookings(String htxCode);

  /// Appends a ledger entry for the order or booking with this code and
  /// settles it when fully paid.
  Future<Payment> recordPayment({required String reference, required int amount, required String recordedBy});
  Future<List<Payment>> listPayments(String htxCode);
  Future<List<Article>> listArticles(String htxCode);
  Future<Article> submitArticle(String articleId);
  Future<HtxSummary> summary(String htxCode);

  // Tour-company staff (linked cooperatives)
  Future<List<HtxSummary>> listLinkedSummaries();
  Future<List<Article>> listPendingArticles();
  Future<Article> reviewArticle(String articleId, {required bool approve});
  Future<List<Booking>> listAllBookings();

  // Staff pages of the DX-OS web app (manager, officer, farmer). Farmers pass
  // their household id so they only ever see their own rows.
  Future<HtxProfile> getHtxProfile(String htxCode);
  Future<List<Parcel>> listParcels(String htxCode, {String? householdId});
  Future<List<Member>> listMembers(String htxCode);
  Future<List<JournalEntry>> listJournal(String htxCode, {String? householdId});

  /// Manager approves or rejects a pending diary entry.
  Future<JournalEntry> reviewJournal(String entryId, {required bool approve});
  Future<JournalEntry> addJournal(NewJournalEntry draft);

  /// Manager changes the expected harvest date of a parcel.
  Future<Parcel> rescheduleHarvest(String parcelId, DateTime date);
  Future<List<Lot>> listLots(String htxCode);
  Future<List<AppNotification>> listNotifications(String htxCode, {String? householdId});
  Future<void> markNotificationRead(String id);
  Future<void> markAllNotificationsRead(String htxCode, {String? householdId});
  Future<List<BulletinItem>> listBulletins();
  Future<List<MarketPrice>> listMarketPrices();
  Future<WeatherNow> currentWeather(String htxCode);

  // Tour-company staff
  Future<List<LinkedHtx>> listLinkedHtxs();
  Future<List<RegionTour>> listRegionTours();
  Future<List<Directive>> listDirectives();
  Future<Directive> createDirective(NewDirective draft);
  Future<List<ReportRow>> reportRows();
}
