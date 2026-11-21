// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import '../hub_repository.dart' show HubException;

/// Why a call to the core (Hasura behind the gateway) failed.
enum CoreErrorKind {
  network,
  unauthorized,
  forbidden,
  notFound,
  validation,
  conflict,
  unavailable,
  server,
  graphql,
  badResponse,
  unsupported,
}

/// A failure of the real backend. [message] is Vietnamese and safe to show:
/// it never contains the token, the variables or the server's raw text.
class CoreException extends HubException {
  const CoreException(this.kind, String message, {this.statusCode}) : super(message);

  final CoreErrorKind kind;
  final int? statusCode;

  /// True when trying again later may work (offline, 503, 5xx): the screen offers "Thử lại".
  bool get retryable =>
      kind == CoreErrorKind.network || kind == CoreErrorKind.unavailable || kind == CoreErrorKind.server;

  static const networkMessage = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  static const unauthorizedMessage = 'Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ. Hãy đăng nhập lại.';
  static const forbiddenMessage = 'Tài khoản này không có quyền xem dữ liệu này.';
  static const graphqlMessage =
      'Máy chủ không xử lý được yêu cầu dữ liệu (vai trò chưa được phép đọc, hoặc cấu trúc dữ liệu đã đổi).';
  static const badResponseMessage = 'Máy chủ trả về dữ liệu không đọc được.';
  static const writeForbiddenMessage = 'Bạn không có quyền thực hiện thao tác này.';
  static const notFoundMessage = 'Không tìm thấy dữ liệu này (có thể đã bị xoá).';
  static const validationMessage = 'Dữ liệu chưa hợp lệ. Kiểm tra lại các ô đã nhập.';
  static const conflictMessage = 'Dữ liệu này đã tồn tại hoặc vừa được người khác thay đổi.';
  static const unavailableMessage = 'Hệ thống tạm thời không khả dụng. Hãy thử lại sau.';
  static const noHtxMessage = 'Tài khoản chưa gắn với hợp tác xã nào.';
  static const unsupportedMessage = 'Thao tác này chưa làm được trên app. Hãy dùng bản web DX-OS.';

  const CoreException.network() : this(CoreErrorKind.network, networkMessage);
  const CoreException.unauthorized() : this(CoreErrorKind.unauthorized, unauthorizedMessage);
  const CoreException.forbidden() : this(CoreErrorKind.forbidden, forbiddenMessage);
  const CoreException.graphql() : this(CoreErrorKind.graphql, graphqlMessage);
  const CoreException.badResponse() : this(CoreErrorKind.badResponse, badResponseMessage);
  const CoreException.writeForbidden() : this(CoreErrorKind.forbidden, writeForbiddenMessage, statusCode: 403);
  const CoreException.noHtx() : this(CoreErrorKind.forbidden, noHtxMessage, statusCode: 403);
  const CoreException.notFound() : this(CoreErrorKind.notFound, notFoundMessage, statusCode: 404);
  const CoreException.validation() : this(CoreErrorKind.validation, validationMessage);
  const CoreException.conflict() : this(CoreErrorKind.conflict, conflictMessage, statusCode: 409);
  const CoreException.unavailable() : this(CoreErrorKind.unavailable, unavailableMessage, statusCode: 503);
  const CoreException.unsupported() : this(CoreErrorKind.unsupported, unsupportedMessage);
  CoreException.server(int status)
    : this(CoreErrorKind.server, 'Máy chủ đang gặp sự cố (mã $status). Thử lại sau ít phút.', statusCode: status);
}
