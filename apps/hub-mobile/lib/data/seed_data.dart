// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'models/booking.dart';
import 'models/catalog.dart';
import 'models/order.dart';

/// Demo data in Vietnamese. All names, accounts and numbers are invented.
class SeedData {
  SeedData._();

  static const htxs = <Htx>[
    Htx(
      code: 'tan-cuong',
      name: 'HTX Chè Tân Cương (demo)',
      province: 'Thái Nguyên',
      bankBin: '970405',
      bankAccount: '8600201001234',
      accountHolder: 'HTX CHE TAN CUONG',
    ),
    Htx(
      code: 'suoi-giang',
      name: 'HTX Chè Shan Tuyết Suối Giàng (demo)',
      province: 'Yên Bái',
      bankBin: '970436',
      bankAccount: '0011004567890',
      accountHolder: 'HTX CHE SUOI GIANG',
    ),
  ];

  static const tours = <Tour>[
    Tour(
      id: 'tour-01',
      htxCode: 'tan-cuong',
      householdId: 'hh-01',
      name: 'Một ngày làm người hái chè',
      summary: 'Lên đồi chè, hái búp, sao chè bằng chảo gang và thưởng trà tại vườn nhà nông dân.',
      durationLabel: '1 ngày',
      adultPrice: 350000,
      childPrice: 200000,
      gradientSeed: 0,
      itinerary: [
        ItineraryDay(
          title: 'Một ngày tại đồi chè',
          steps: [
            '08:00 Đón khách tại nhà văn hoá HTX',
            '08:30 Lên đồi, học cách hái một tôm hai lá',
            '10:30 Sao chè và vò chè cùng gia đình nông dân',
            '12:00 Cơm trưa với món ăn địa phương',
            '14:00 Thưởng trà, mua quà tại gian HTX',
            '15:30 Kết thúc, đưa khách về điểm đón',
          ],
        ),
      ],
    ),
    Tour(
      id: 'tour-02',
      htxCode: 'tan-cuong',
      householdId: 'hh-02',
      name: 'Hai ngày một đêm homestay vườn chè',
      summary: 'Nghỉ đêm tại nhà sàn, ngắm sương sớm trên đồi chè, học pha trà đạo.',
      durationLabel: '2 ngày 1 đêm',
      adultPrice: 890000,
      childPrice: 500000,
      gradientSeed: 1,
      itinerary: [
        ItineraryDay(
          title: 'Ngày 1: Đến đồi chè',
          steps: [
            '09:00 Đón khách, nhận phòng homestay',
            '10:00 Tham quan vườn chè cổ',
            '15:00 Học sao chè thủ công',
            '19:00 Bữa tối quanh bếp lửa',
          ],
        ),
        ItineraryDay(
          title: 'Ngày 2: Bình minh trên đồi',
          steps: [
            '05:30 Ngắm bình minh, hái chè sương',
            '08:00 Học pha trà và nghệ thuật thưởng trà',
            '11:00 Trả phòng, mua quà lưu niệm',
          ],
        ),
      ],
    ),
    Tour(
      id: 'tour-03',
      htxCode: 'suoi-giang',
      householdId: 'hh-03',
      name: 'Hành trình chè Shan Tuyết cổ thụ',
      summary: 'Đi bộ giữa những gốc chè Shan Tuyết trăm tuổi, nghe chuyện làng nghề.',
      durationLabel: '1 ngày',
      adultPrice: 420000,
      childPrice: 250000,
      gradientSeed: 2,
      itinerary: [
        ItineraryDay(
          title: 'Rừng chè cổ thụ',
          steps: [
            '07:30 Xuất phát từ trung tâm xã',
            '09:00 Trekking nhẹ vào rừng chè cổ thụ',
            '12:00 Cơm trưa tại nhà dân',
            '14:00 Xem sao chè và mua chè khô',
          ],
        ),
      ],
    ),
  ];

  static List<Departure> departures(DateTime today) => [
    Departure(id: 'dep-01', tourId: 'tour-01', date: today.add(const Duration(days: 5)), seatsTotal: 20, seatsTaken: 6),
    Departure(
      id: 'dep-02',
      tourId: 'tour-01',
      date: today.add(const Duration(days: 12)),
      seatsTotal: 20,
      seatsTaken: 0,
    ),
    Departure(
      id: 'dep-03',
      tourId: 'tour-02',
      date: today.add(const Duration(days: 9)),
      seatsTotal: 12,
      seatsTaken: 10,
    ),
    Departure(id: 'dep-04', tourId: 'tour-03', date: today.add(const Duration(days: 7)), seatsTotal: 15, seatsTaken: 3),
  ];

  static const products = <Product>[
    Product(
      id: 'prod-01',
      htxCode: 'tan-cuong',
      name: 'Chè xanh Tân Cương đặc biệt',
      unit: 'hộp 200 g',
      price: 180000,
      stock: 40,
      description: 'Búp chè một tôm hai lá, sao thủ công, hương cốm non.',
      gradientSeed: 0,
      householdId: 'hh-01',
    ),
    Product(
      id: 'prod-02',
      htxCode: 'tan-cuong',
      name: 'Chè móc câu',
      unit: 'gói 100 g',
      price: 95000,
      stock: 60,
      description: 'Sợi chè xoăn như móc câu, nước xanh vàng, vị chát dịu.',
      gradientSeed: 1,
      householdId: 'hh-02',
    ),
    Product(
      id: 'prod-03',
      htxCode: 'tan-cuong',
      name: 'Trà hoa nhài sấy',
      unit: 'hộp 150 g',
      price: 130000,
      stock: 3,
      description: 'Chè xanh ướp hoa nhài tươi, thơm nhẹ.',
      gradientSeed: 2,
      householdId: 'hh-01',
    ),
    Product(
      id: 'prod-04',
      htxCode: 'suoi-giang',
      name: 'Shan Tuyết cổ thụ',
      unit: 'hộp 250 g',
      price: 320000,
      stock: 25,
      description: 'Chè hái từ cây trăm tuổi, phủ lớp lông trắng như tuyết.',
      gradientSeed: 3,
      householdId: 'hh-03',
    ),
    Product(
      id: 'prod-05',
      htxCode: 'suoi-giang',
      name: 'Hồng trà Shan Tuyết',
      unit: 'hộp 200 g',
      price: 210000,
      stock: 0,
      description: 'Lên men nhẹ, vị ngọt hậu, màu nước đỏ hổ phách.',
      gradientSeed: 4,
      householdId: 'hh-03',
    ),
  ];

  static List<Article> articles(DateTime now) => [
    Article(
      id: 'art-01',
      htxCode: 'tan-cuong',
      title: 'Vào vụ chè xuân: lịch hái và mở tour mới',
      body: 'Chè xuân là vụ ngon nhất năm. HTX mở thêm các chuyến trải nghiệm hái chè vào cuối tuần.',
      status: ArticleStatus.published,
      createdAt: now.subtract(const Duration(days: 6)),
      pinned: true,
    ),
    Article(
      id: 'art-02',
      htxCode: 'suoi-giang',
      title: 'Chè Shan Tuyết cổ thụ và câu chuyện giữ rừng',
      body: 'Bà con Suối Giàng giữ gìn hàng trăm gốc chè cổ thụ, mỗi gốc có thể cho hơn 10 kg chè tươi một vụ.',
      status: ArticleStatus.published,
      createdAt: now.subtract(const Duration(days: 3)),
    ),
    Article(
      id: 'art-03',
      htxCode: 'tan-cuong',
      title: 'Cách pha chè xanh đúng vị',
      body: 'Nước khoảng 80 độ, tráng chè một lần, hãm 2 đến 3 phút. Không dùng nước sôi già làm cháy búp chè.',
      status: ArticleStatus.pending,
      createdAt: now.subtract(const Duration(days: 1)),
    ),
    Article(
      id: 'art-04',
      htxCode: 'tan-cuong',
      title: 'Thông báo nghỉ tour dịp mưa bão',
      body: 'Nháp: HTX tạm dừng các chuyến đi khi có cảnh báo thời tiết xấu.',
      status: ArticleStatus.draft,
      createdAt: now,
    ),
  ];

  static List<Booking> bookings(DateTime today) => [
    Booking(
      id: 'bk-01',
      code: 'TOUR K7M2QX',
      htxCode: 'tan-cuong',
      householdId: 'hh-01',
      tourId: 'tour-01',
      tourName: 'Một ngày làm người hái chè',
      departureId: 'dep-01',
      departureDate: today.add(const Duration(days: 5)),
      customerId: 'cus-demo',
      contactName: 'Nguyễn Thu Hà',
      phone: '0912345678',
      adults: 2,
      children: 1,
      total: 900000,
      status: BookingStatus.confirmed,
      paymentStatus: PaymentStatus.paid,
      createdAt: today.subtract(const Duration(days: 2)),
    ),
    Booking(
      id: 'bk-02',
      code: 'TOUR P3N8ZD',
      htxCode: 'tan-cuong',
      householdId: 'hh-01',
      tourId: 'tour-01',
      tourName: 'Một ngày làm người hái chè',
      departureId: 'dep-01',
      departureDate: today.add(const Duration(days: 5)),
      customerId: 'cus-other',
      contactName: 'Trần Minh Đức',
      phone: '0987654321',
      adults: 4,
      children: 0,
      total: 1400000,
      status: BookingStatus.pending,
      paymentStatus: PaymentStatus.claimed,
      createdAt: today.subtract(const Duration(days: 1)),
    ),
    Booking(
      id: 'bk-03',
      code: 'TOUR W5R1HB',
      htxCode: 'suoi-giang',
      householdId: 'hh-03',
      tourId: 'tour-03',
      tourName: 'Hành trình chè Shan Tuyết cổ thụ',
      departureId: 'dep-04',
      departureDate: today.add(const Duration(days: 7)),
      customerId: 'cus-other',
      contactName: 'Vũ Thị Lan',
      phone: '0903111222',
      adults: 3,
      children: 0,
      total: 1260000,
      status: BookingStatus.pending,
      paymentStatus: PaymentStatus.unpaid,
      createdAt: today,
    ),
  ];

  static List<Order> orders(DateTime today) => [
    Order(
      id: 'ord-01',
      code: 'DH 4F9K2A',
      htxCode: 'tan-cuong',
      customerId: 'cus-demo',
      recipient: 'Nguyễn Thu Hà',
      phone: '0912345678',
      address: '12 Nguyễn Trãi, Thanh Xuân, Hà Nội',
      lines: const [
        OrderLine(
          productId: 'prod-01',
          name: 'Chè xanh Tân Cương đặc biệt',
          unit: 'hộp 200 g',
          unitPrice: 180000,
          quantity: 2,
        ),
      ],
      method: PaymentMethod.vietQr,
      status: OrderStatus.pending,
      paymentStatus: PaymentStatus.claimed,
      createdAt: today.subtract(const Duration(hours: 5)),
    ),
    Order(
      id: 'ord-02',
      code: 'DH 7M3Q8C',
      htxCode: 'tan-cuong',
      customerId: 'cus-other',
      recipient: 'Đỗ Quang Huy',
      phone: '0933444555',
      address: '45 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
      lines: const [
        OrderLine(productId: 'prod-02', name: 'Chè móc câu', unit: 'gói 100 g', unitPrice: 95000, quantity: 3),
      ],
      method: PaymentMethod.cashOnDelivery,
      status: OrderStatus.confirmed,
      paymentStatus: PaymentStatus.unpaid,
      createdAt: today.subtract(const Duration(days: 1)),
    ),
  ];
}
