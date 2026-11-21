// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaStaff.Core.Domain;

/// <summary>Cooperative-wide payroll rules, editable in Settings.</summary>
public sealed record PayrollPolicy(
    decimal StandardWorkDays = 26m,
    decimal InsuranceRate = 0.105m,
    decimal OvertimeMultiplier = 1.5m,
    decimal HoursPerDay = 8m);
