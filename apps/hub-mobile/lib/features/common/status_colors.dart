// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/booking.dart';
import '../../data/models/order.dart';

Color orderStatusColor(OrderStatus s) => switch (s) {
  OrderStatus.pending => AppColors.amber,
  OrderStatus.cancelled => AppColors.danger,
  _ => AppColors.teaGreen,
};

Color bookingStatusColor(BookingStatus s) => switch (s) {
  BookingStatus.pending => AppColors.amber,
  BookingStatus.cancelled => AppColors.danger,
  _ => AppColors.teaGreen,
};

Color paymentStatusColor(PaymentStatus s) => switch (s) {
  PaymentStatus.unpaid => AppColors.danger,
  PaymentStatus.claimed => AppColors.amber,
  PaymentStatus.paid => AppColors.teaGreen,
};
