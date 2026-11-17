// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format/formatting.dart';
import '../../core/theme/staff_theme.dart';
import '../../data/hub_repository.dart';
import '../../data/models/diagnosis.dart';
import '../../data/models/staff.dart';
import '../../shared/live_camera.dart';
import '../../shared/photo_source.dart';
import '../../shared/widgets.dart' show showMessage;
import '../staff/staff_format.dart';
import '../staff/staff_widgets.dart';

/// "Quét bệnh": the farmer takes a photo of a leaf and gets the disease name and the confidence.
/// The camera opens as soon as the tab opens. The result carries no treatment advice: the cooperative's officer
/// confirms the name.
class DiagnosisPage extends StatefulWidget {
  const DiagnosisPage({super.key});

  @override
  State<DiagnosisPage> createState() => _DiagnosisPageState();
}

class _DiagnosisPageState extends State<DiagnosisPage> {
  String? _parcelCode;
  DiagnosisReport? _result;
  bool _busy = false;
  List<DiagnosisReport> _history = const [];
  late final Future<List<Parcel>> _parcels;
  LiveCamera? _camera;
  bool _cameraReady = false;
  String? _cameraError;

  @override
  void initState() {
    super.initState();
    final scope = StaffScope(context);
    _parcels = scope.repo.listParcels(scope.htx, householdId: scope.household);
    _loadHistory();
    // "Quét luôn": the camera starts as soon as the tab opens and its picture is in the frame.
    if (scope.repo.canDiagnose) _startCamera();
  }

  Future<void> _startCamera() async {
    final camera = context.read<PhotoSource>().createCamera();
    _camera = camera;
    setState(() {
      _cameraReady = false;
      _cameraError = null;
    });
    try {
      await camera.start();
      if (mounted && _camera == camera) setState(() => _cameraReady = true);
    } on LiveCameraException catch (e) {
      if (mounted) setState(() => _cameraError = e.message);
    } catch (_) {
      if (mounted) setState(() => _cameraError = 'Không mở được camera.');
    }
  }

  @override
  void dispose() {
    _camera?.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    final list = await context.read<HubRepository>().listDiagnoses();
    if (mounted) setState(() => _history = list);
  }

  Future<void> _scan({required bool camera}) async {
    final repo = context.read<HubRepository>();
    final source = context.read<PhotoSource>();
    setState(() => _busy = true);
    try {
      final Uint8List? bytes;
      if (camera) {
        bytes = await _camera!.capture();
      } else {
        bytes = (await source.pickPhoto())?.bytes;
      }
      if (bytes == null) return;
      final report = await repo.submitDiagnosis(bytes, parcelCode: _parcelCode);
      if (!mounted) return;
      setState(() => _result = report);
      await _loadHistory();
    } on HubException catch (e) {
      if (mounted) showMessage(context, e.message);
    } catch (_) {
      if (mounted) showMessage(context, 'Không chụp được ảnh. Hãy thử lại.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = context.read<HubRepository>();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
      children: [
        const PageHead('Quét bệnh cây', subtitle: 'Chụp ảnh lá chè để nhận biết bệnh. Cán bộ HTX sẽ xác nhận kết quả.'),
        if (!repo.canDiagnose)
          const _Note(
            Icons.info_outline,
            'Chức năng này chưa dùng được với dữ liệu thật: máy chủ chưa nhận ảnh từ ứng dụng. '
            'Hãy dùng bản web DX-OS để chẩn đoán.',
          )
        else ...[
          FutureBuilder<List<Parcel>>(
            future: _parcels,
            builder: (context, snap) {
              final parcels = snap.data ?? const <Parcel>[];
              if (parcels.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: DropdownButtonFormField<String?>(
                  key: const Key('scan-parcel'),
                  isExpanded: true,
                  initialValue: _parcelCode,
                  decoration: const InputDecoration(labelText: 'Thửa đất (không bắt buộc)'),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('Không chọn thửa')),
                    for (final p in parcels)
                      DropdownMenuItem<String?>(value: p.code, child: Text('${p.code} — ${p.cropType}')),
                  ],
                  onChanged: (v) => setState(() => _parcelCode = v),
                ),
              );
            },
          ),
          _Viewfinder(
            camera: _camera,
            ready: _cameraReady,
            error: _cameraError,
            busy: _busy,
            onRetry: _startCamera,
            onShutter: () => _scan(camera: true),
            onGallery: () => _scan(camera: false),
          ),
          if (_result != null) _ResultCard(report: _result!, sample: repo.coreIsSample),
          if (_history.length > (_result == null ? 0 : 1)) ...[
            const SizedBox(height: 18),
            const Text('Đã gửi gần đây', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            for (final r in _history)
              if (r.id != _result?.id) _HistoryRow(report: r),
          ],
        ],
      ],
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.icon, this.text);
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: StaffColors.warnSoft, borderRadius: BorderRadius.circular(staffRadius)),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: StaffColors.warn),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text, style: const TextStyle(height: 1.45, color: StaffColors.warn)),
        ),
      ],
    ),
  );
}

/// The camera block: the live picture inside a rounded frame, a round shutter button under it and a link to the gallery.
class _Viewfinder extends StatelessWidget {
  const _Viewfinder({
    required this.camera,
    required this.ready,
    required this.error,
    required this.busy,
    required this.onRetry,
    required this.onShutter,
    required this.onGallery,
  });
  final LiveCamera? camera;
  final bool ready;
  final String? error;
  final bool busy;
  final VoidCallback onRetry;
  final VoidCallback onShutter;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: StaffColors.sidebar, borderRadius: BorderRadius.circular(24)),
    child: Column(
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: Container(
            key: const Key('scan-frame'),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: StaffColors.lime, width: 2.5),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(17),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  const ColoredBox(color: Colors.black),
                  if (ready && camera != null) camera!.preview(),
                  if (!ready && error == null) const Center(child: CircularProgressIndicator(color: StaffColors.lime)),
                  if (error != null)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              error!,
                              key: const Key('camera-error'),
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.white, height: 1.45),
                            ),
                            const SizedBox(height: 12),
                            OutlinedButton(
                              key: const Key('camera-retry'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: StaffColors.lime,
                                side: const BorderSide(color: StaffColors.lime),
                              ),
                              onPressed: onRetry,
                              child: const Text('Thử lại'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (busy)
                    const ColoredBox(
                      color: Colors.black54,
                      child: Center(child: CircularProgressIndicator(color: StaffColors.lime)),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          busy ? 'Đang phân tích ảnh…' : 'Đặt lá chè vào khung, chụp rõ nét, đủ sáng',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, height: 1.4),
        ),
        const SizedBox(height: 12),
        GestureDetector(
          key: const Key('scan-camera'),
          onTap: ready && !busy ? onShutter : null,
          child: Container(
            width: 72,
            height: 72,
            padding: const EdgeInsets.all(5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 4),
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: ready && !busy ? StaffColors.lime : Colors.white38,
              ),
            ),
          ),
        ),
        TextButton.icon(
          key: const Key('scan-gallery'),
          style: TextButton.styleFrom(foregroundColor: Colors.white),
          onPressed: busy ? null : onGallery,
          icon: const Icon(Icons.photo_library_outlined, size: 20),
          label: const Text('Chọn ảnh có sẵn'),
        ),
      ],
    ),
  );
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.report, required this.sample});
  final DiagnosisReport report;
  final bool sample;

  @override
  Widget build(BuildContext context) {
    final pct = (report.confidence * 100).round();
    final tone = report.uncertain ? Tone.warn : Tone.ok;
    return Container(
      key: const Key('scan-result'),
      width: double.infinity,
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: StaffColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (report.image != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Image.memory(report.image!, height: 180, width: double.infinity, fit: BoxFit.cover),
            ),
          const SizedBox(height: 14),
          const Text('Kết quả', style: TextStyle(fontSize: 12.5, color: StaffColors.muted)),
          Text(
            report.diseaseName,
            key: const Key('scan-disease'),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.3),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: report.confidence,
                    minHeight: 8,
                    backgroundColor: StaffColors.neutralSoft,
                    color: toneColor(tone),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text('$pct%', style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 4),
          const Text('Độ tin cậy của mô hình', style: TextStyle(fontSize: 12.5, color: StaffColors.muted)),
          if (report.uncertain) ...[
            const SizedBox(height: 12),
            const _Note(
              Icons.warning_amber_rounded,
              'Mô hình chưa chắc chắn. Hãy chụp lại gần hơn, đủ sáng, lá nằm giữa khung.',
            ),
          ],
          const SizedBox(height: 12),
          const Pill('Chờ cán bộ HTX xác nhận', tone: Tone.neutral),
          const SizedBox(height: 8),
          const Text(
            'Ứng dụng chỉ cho biết tên bệnh và độ tin cậy, không đưa ra cách chữa. '
            'Hãy chờ cán bộ HTX xác nhận và hướng dẫn.',
            style: TextStyle(fontSize: 13, height: 1.45, color: StaffColors.muted),
          ),
          if (sample) ...[
            const SizedBox(height: 8),
            const Text(
              'Kết quả mẫu để xem giao diện, chưa phải mô hình thật.',
              key: Key('scan-sample-note'),
              style: TextStyle(fontSize: 12.5, color: StaffColors.warn, fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({required this.report});
  final DiagnosisReport report;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: RowCard(
      title: report.diseaseName,
      subtitle: '${(report.confidence * 100).round()}% · ${formatDateTime(report.submittedAt)}',
      meta: report.parcelCode,
      leading: report.image == null
          ? const IconBadge(Icons.eco_outlined)
          : ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(report.image!, width: 42, height: 42, fit: BoxFit.cover),
            ),
      trailing: Pill(
        report.confirmed ? 'Đã xác nhận' : 'Chờ xác nhận',
        tone: report.confirmed ? Tone.ok : Tone.neutral,
      ),
    ),
  );
}
