// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaStaff.Core.Services;

/// <summary>A business rule was violated. The message is user-facing (Vietnamese).</summary>
public sealed class DomainException(string message) : Exception(message);
