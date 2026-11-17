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

  /// Receives the money of every tour booking. Demo account, not a real one.
  static const tourCompany = TourCompany(
    name: 'Công ty Lữ hành Xứ Chè (demo)',
    bankBin: '970422',
    bankAccount: '0000123456789',
    accountHolder: 'CONG TY LU HANH XU CHE DEMO',
  );

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
      tags: ['Hái chè', 'Sao chè', 'Trà đạo'],
      bestMonths: 'Th3 – Th5, Th9 – Th11',
      level: 'Dễ, hợp gia đình',
      maxGuests: 12,
      includes: [
        'Người dẫn của HTX suốt chuyến',
        'Nón lá, gùi tre để hái chè',
        'Sao chè, vò chè cùng gia đình nông dân',
        'Cơm trưa món địa phương',
        'Thưởng trà tại vườn',
        'Đưa khách về điểm đón',
      ],
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
      tags: ['Homestay', 'Nông trại', 'Gia đình'],
      bestMonths: 'Quanh năm',
      level: 'Dễ',
      maxGuests: 8,
      includes: [
        'Một đêm homestay tại nhà vườn',
        'Bữa tối và bữa sáng cùng gia đình',
        'Người dẫn của HTX',
        'Hái chè và sao chè',
        'Thưởng trà buổi sáng',
      ],
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
      tags: ['Hái chè', 'Trekking'],
      bestMonths: 'Th4 – Th6, Th10',
      level: 'Vừa sức',
      maxGuests: 15,
      includes: [
        'Người dẫn địa phương',
        'Đi bộ lên vùng chè Shan Tuyết cổ thụ',
        'Hái búp chè cổ thụ',
        'Bữa trưa trên bản',
        'Thưởng trà Shan Tuyết',
      ],
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

  static const households = <Household>[
    Household(
      id: 'hh-01',
      htxCode: 'tan-cuong',
      name: 'Hộ bà Lan',
      village: 'Thôn Soi, xã Tân Cương',
      crop: 'Chè Trung du · 0,8 ha',
      certificate: 'VietGAP',
      experience: 'Làm chè 25 năm',
      hosting: 'Đón tối đa 8 khách/lượt',
      process: [
        ProcessStep(
          title: 'Chăm sóc và bón phân',
          description: 'Bón phân hữu cơ đợt đầu xuân, tỉa cành sau vụ đông.',
          source: 'Nhật ký canh tác đã duyệt · 03/2026',
        ),
        ProcessStep(
          title: 'Thu hái',
          description: 'Hái một tôm hai lá lúc sáng sớm, mỗi đợt cách nhau khoảng 7 – 10 ngày.',
          source: 'Nhật ký canh tác đã duyệt · 04/2026',
        ),
        ProcessStep(
          title: 'Làm héo',
          description: 'Trải chè trong nhà thoáng 4 – 6 giờ cho bớt nước.',
          source: 'Do hộ mô tả',
        ),
        ProcessStep(
          title: 'Diệt men và vò',
          description: 'Sao chảo gang 280°C rồi vò nhẹ tay cho chè săn lại.',
          source: 'Do hộ mô tả',
        ),
        ProcessStep(
          title: 'Sấy và đóng gói',
          description: 'Sấy lửa nhỏ đến khô giòn, đóng gói theo lô có mã QR.',
          source: 'Lô TC-2026-014',
        ),
      ],
    ),
    Household(
      id: 'hh-02',
      htxCode: 'tan-cuong',
      name: 'Hộ ông Hải',
      village: 'Thôn Đồng Chùa, xã Tân Cương',
      crop: 'Chè Kim Tuyên · 0,5 ha',
      certificate: 'Hữu cơ',
      experience: 'Làm chè 12 năm',
      hosting: 'Đón tối đa 6 khách/lượt',
      process: [
        ProcessStep(
          title: 'Chăm sóc',
          description: 'Không dùng thuốc trừ sâu hoá học, bẫy côn trùng.',
          source: 'Nhật ký canh tác đã duyệt · 03/2026',
        ),
        ProcessStep(
          title: 'Thu hái',
          description: 'Hái búp non, bán chè tươi cho HTX.',
          source: 'Nhật ký canh tác đã duyệt · 05/2026',
        ),
        ProcessStep(title: 'Chế biến', description: 'Sao thủ công tại nhà, chia mẻ nhỏ.', source: 'Do hộ mô tả'),
      ],
    ),
    Household(
      id: 'hh-03',
      htxCode: 'suoi-giang',
      name: 'Hộ bà Mai',
      village: 'Bản Suối Giàng, xã Suối Giàng',
      crop: 'Chè Shan Tuyết cổ thụ · 1,2 ha',
      certificate: 'Chè cổ thụ',
      experience: 'Làm chè 30 năm',
      hosting: 'Đón tối đa 10 khách/lượt',
      process: [
        ProcessStep(
          title: 'Chăm sóc gốc chè cổ',
          description: 'Giữ nguyên cây chè trăm tuổi, không bón phân hoá học.',
          source: 'Do hộ mô tả',
        ),
        ProcessStep(
          title: 'Thu hái',
          description: 'Hái búp tuyết phủ trắng vào sáng sớm, mỗi vụ vài lần.',
          source: 'Nhật ký canh tác đã duyệt · 04/2026',
        ),
        ProcessStep(title: 'Sao và vò', description: 'Sao chảo gang củi, vò tay trên nong.', source: 'Do hộ mô tả'),
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
      description:
          'Búp chè một tôm hai lá hái vào sáng sớm trên đồi Tân Cương, sao thủ công trên chảo gang theo cách truyền thống của nghề chè Thái Nguyên. Nước chè xanh vàng, hương cốm non rất đặc trưng, vị chát dịu rồi ngọt hậu, uống xong còn đọng lại lâu trong cổ.',
      gradientSeed: 0,
      householdId: 'hh-01',
      origin: 'Đồi chè Tân Cương, Thái Nguyên',
      harvest: 'Chè xuân, hái búp một tôm hai lá',
      shelfLife: '12 tháng kể từ ngày đóng gói',
      storage: 'Nơi khô ráo, thoáng mát, tránh ánh nắng và mùi mạnh. Đậy kín hộp sau khi dùng.',
      brewing: 'Khoảng 5 g chè cho 150 ml nước 80 đến 85 độ C. Hãm 1 đến 2 phút, có thể hãm lại 3 lần.',
    ),
    Product(
      id: 'prod-02',
      htxCode: 'tan-cuong',
      name: 'Chè móc câu',
      unit: 'gói 100 g',
      price: 95000,
      stock: 60,
      description:
          'Sợi chè xoăn cong như chiếc móc câu, được vò và sao kỹ nên giữ trọn hương chè. Nước xanh vàng trong, vị chát dịu, hậu ngọt, hợp với người thích chè đậm vừa phải và uống hằng ngày.',
      gradientSeed: 1,
      householdId: 'hh-02',
      origin: 'Hộ nông dân Tân Cương, Thái Nguyên',
      harvest: 'Chè hái quanh năm, ngon nhất vụ xuân và vụ thu',
      shelfLife: '12 tháng kể từ ngày đóng gói',
      storage: 'Để trong túi kín, nơi khô ráo, tránh ẩm. Nên dùng hết trong 2 tháng sau khi mở túi.',
      brewing: 'Khoảng 6 g chè cho 200 ml nước 85 độ C. Hãm 2 phút, rót hết nước để chè không bị đắng.',
    ),
    Product(
      id: 'prod-03',
      htxCode: 'tan-cuong',
      name: 'Trà hoa nhài sấy',
      unit: 'hộp 150 g',
      price: 130000,
      stock: 3,
      description:
          'Chè xanh được ướp cùng hoa nhài tươi nhiều lần cho thấm hương, rồi sấy nhẹ để giữ độ thơm. Hương nhài dịu mát, nước vàng nhạt, thích hợp thưởng trà buổi chiều hoặc tiếp khách.',
      gradientSeed: 2,
      householdId: 'hh-01',
      origin: 'Tân Cương, Thái Nguyên',
      harvest: 'Hoa nhài hái buổi chiều, ướp ngay trong đêm',
      shelfLife: '9 tháng kể từ ngày đóng gói',
      storage: 'Để nơi mát, tránh nắng, đậy kín để không mất hương nhài.',
      brewing: 'Khoảng 5 g trà cho 200 ml nước 80 độ C. Hãm 2 đến 3 phút.',
    ),
    Product(
      id: 'prod-04',
      htxCode: 'suoi-giang',
      name: 'Shan Tuyết cổ thụ',
      unit: 'hộp 250 g',
      price: 320000,
      stock: 25,
      description:
          'Chè hái từ những cây Shan Tuyết cổ thụ trăm tuổi trên núi Suối Giàng, búp phủ lớp lông trắng như tuyết. Chè mọc tự nhiên ở độ cao hơn 1.000 mét nên hương thơm sâu, vị ngọt hậu thanh, nước vàng sáng.',
      gradientSeed: 3,
      householdId: 'hh-03',
      origin: 'Núi Suối Giàng, Văn Chấn, Yên Bái',
      harvest: 'Hái búp vào đầu xuân, mỗi cây chỉ hái vài lần',
      shelfLife: '18 tháng kể từ ngày đóng gói',
      storage: 'Nơi khô ráo, thoáng mát, tránh ẩm và mùi lạ. Nên đậy kín ngay sau khi dùng.',
      brewing: 'Khoảng 6 g chè cho 150 ml nước 85 đến 90 độ C. Hãm 1 phút cho lần đầu, các lần sau tăng dần thêm.',
    ),
    Product(
      id: 'prod-05',
      htxCode: 'suoi-giang',
      name: 'Hồng trà Shan Tuyết',
      unit: 'hộp 200 g',
      price: 210000,
      stock: 0,
      description:
          'Chè Shan Tuyết lên men nhẹ nên có vị ngọt hậu, hương mật ong và quả chín. Nước màu đỏ hổ phách, đậm đà nhưng không gắt, uống nóng hay pha lạnh đều ngon.',
      gradientSeed: 4,
      householdId: 'hh-03',
      origin: 'Núi Suối Giàng, Văn Chấn, Yên Bái',
      harvest: 'Hái búp vụ xuân, lên men và sấy thủ công',
      shelfLife: '24 tháng kể từ ngày đóng gói',
      storage: 'Nơi khô ráo, thoáng mát, tránh ánh nắng trực tiếp.',
      brewing: 'Khoảng 5 g cho 200 ml nước 90 đến 95 độ C. Hãm 2 đến 3 phút.',
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
