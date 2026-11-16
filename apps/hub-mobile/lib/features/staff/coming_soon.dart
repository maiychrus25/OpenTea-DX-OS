// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:flutter/material.dart';

import '../../core/theme/staff_theme.dart';
import 'staff_widgets.dart';

/// "Sắp có" screen for web pages that are not rebuilt on the phone yet.
class ComingSoonPage extends StatelessWidget {
  const ComingSoonPage({
    super.key,
    required this.title,
    required this.icon,
    required this.webDoes,
    this.points = const [],
  });
  final String title;
  final IconData icon;

  /// One sentence: what the page does in the web app.
  final String webDoes;
  final List<String> points;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
    children: [
      Center(
        child: Container(
          width: 88,
          height: 88,
          decoration: const BoxDecoration(color: StaffColors.secondary, shape: BoxShape.circle),
          child: Icon(icon, size: 42, color: StaffColors.primary),
        ),
      ),
      const SizedBox(height: 18),
      Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(color: StaffColors.lime, borderRadius: BorderRadius.circular(999)),
          child: const Text(
            'Sắp có',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: StaffColors.sidebar),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Text(
        title,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 18),
      SectionCard(
        title: 'Trên bản web',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(webDoes, style: const TextStyle(fontSize: 14.5, height: 1.45)),
            for (final p in points)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 3, right: 8),
                      child: Icon(Icons.check_circle_outline, size: 16, color: StaffColors.primary),
                    ),
                    Expanded(
                      child: Text(p, style: const TextStyle(fontSize: 14, color: StaffColors.muted, height: 1.4)),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 12),
      const InfoNote(
        'Màn hình này chưa có trên ứng dụng di động. Hãy dùng bản web DX-OS để thao tác, dữ liệu vẫn dùng chung.',
        tone: Tone.neutral,
      ),
    ],
  );
}

/// Content of each placeholder, keyed by the last path segment.
ComingSoonPage comingSoonFor(String key) => switch (key) {
  'chat' => const ComingSoonPage(
    title: 'Chatbot',
    icon: Icons.chat_bubble_outline,
    webDoes: 'Hỏi đáp thông tin thị trường nông sản và kỹ thuật canh tác bằng trợ lý trò chuyện, có ghi nguồn dữ liệu.',
    points: [
      'Mỗi câu trả lời kèm nguồn và ghi chú đây là tổng hợp dữ liệu',
      'Lưu lịch sử hỏi đáp theo từng người dùng',
    ],
  ),
  'partner-map' => const ComingSoonPage(
    title: 'Bản đồ đối tác',
    icon: Icons.map_outlined,
    webDoes: 'Quản lý người mua, nhà kho và đại lý trực quan trên bản đồ, kèm danh bạ đối tác.',
    points: [
      'Đánh dấu từng đối tác theo loại: người mua, trung gian, kho',
      'Thêm, sửa, xoá đối tác và mở danh bạ dạng danh sách',
    ],
  ),
  'app-store' => const ComingSoonPage(
    title: 'Kho ứng dụng',
    icon: Icons.storefront_outlined,
    webDoes:
        'Cài thêm các mini-app cho HTX (du lịch, bán hàng, tư vấn...). Mini-app đọc dữ liệu chung của hệ thống và hiện thêm mục trong menu.',
    points: ['Xem mô tả, quyền truy cập dữ liệu của từng ứng dụng', 'Cài đặt hoặc gỡ ứng dụng cho cả HTX'],
  ),
  'documents' => const ComingSoonPage(
    title: 'Tài liệu',
    icon: Icons.folder_open_outlined,
    webDoes: 'Quản lý tài liệu canh tác của HTX theo thư mục (dự án, lĩnh vực, tài nguyên, lưu trữ).',
    points: ['Tải lên, xem và tìm tài liệu kỹ thuật', 'Chia sẻ tài liệu cho cán bộ và nông dân'],
  ),
  'diseases' => const ComingSoonPage(
    title: 'Nhật ký bệnh',
    icon: Icons.healing_outlined,
    webDoes: 'Danh sách báo cáo bệnh từ nông hộ cần cán bộ xác nhận chẩn đoán và đưa ra khuyến nghị xử lý.',
    points: ['Xem ảnh lá, kết quả nhận diện và độ tin cậy', 'Xác nhận hoặc từ chối chẩn đoán, gửi hướng xử lý cho hộ'],
  ),
  'assistant' => const ComingSoonPage(
    title: 'Trợ lý thông tin thị trường',
    icon: Icons.smart_toy_outlined,
    webDoes: 'Trò chuyện để tra cứu giá và xu hướng nông sản, mọi số liệu đều ghi rõ nguồn.',
  ),
  'diagnosis' => const ComingSoonPage(
    title: 'Chẩn đoán bệnh',
    icon: Icons.healing_outlined,
    webDoes: 'Chụp ảnh lá chè để nhận diện bệnh, gửi báo cáo cho cán bộ kỹ thuật xác nhận và nhận hướng xử lý.',
    points: ['Chụp hoặc chọn ảnh lá bị bệnh', 'Xem kết quả nhận diện, độ tin cậy và lời khuyên của cán bộ'],
  ),
  _ => const ComingSoonPage(title: 'Sắp có', icon: Icons.hourglass_empty, webDoes: 'Trang này đang được xây dựng.'),
};
