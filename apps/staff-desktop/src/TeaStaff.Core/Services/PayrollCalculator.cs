// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Services;

/// <summary>Pure payroll arithmetic so it can be unit-tested without a database.</summary>
public static class PayrollCalculator
{
    public static decimal WorkDayValue(AttendanceStatus status) => status switch
    {
        AttendanceStatus.Present => 1m,
        AttendanceStatus.HalfDay => 0.5m,
        _ => 0m,
    };

    public static void Recalculate(Payslip slip, ContractType contract, PayrollPolicy policy)
    {
        var paidDays = slip.WorkDays + slip.PaidLeaveDays;
        decimal dailyRate;
        if (slip.SalaryType == SalaryType.Monthly)
        {
            var standard = slip.StandardDays <= 0 ? policy.StandardWorkDays : slip.StandardDays;
            dailyRate = standard == 0 ? 0 : slip.BaseSalary / standard;
            slip.EarnedSalary = Math.Min(slip.BaseSalary, dailyRate * paidDays);
        }
        else
        {
            dailyRate = slip.BaseSalary;
            slip.EarnedSalary = dailyRate * paidDays;
        }

        var hourly = policy.HoursPerDay == 0 ? 0 : dailyRate / policy.HoursPerDay;
        slip.OvertimePay = hourly * slip.OvertimeHours * policy.OvertimeMultiplier;

        // Compulsory social insurance applies to long-term contracts on monthly salary.
        slip.Insurance = slip.SalaryType == SalaryType.Monthly && contract == ContractType.FullTime
            ? slip.BaseSalary * policy.InsuranceRate
            : 0m;

        slip.GrossPay = slip.EarnedSalary + slip.OvertimePay + slip.Allowance + slip.Bonus;
        slip.NetPay = Math.Max(0m, slip.GrossPay - slip.Insurance - slip.Deduction - slip.Advance);

        slip.EarnedSalary = Round(slip.EarnedSalary);
        slip.OvertimePay = Round(slip.OvertimePay);
        slip.Insurance = Round(slip.Insurance);
        slip.GrossPay = Round(slip.GrossPay);
        slip.NetPay = Round(slip.NetPay);
    }

    /// <summary>Rounds to whole Vietnamese dong.</summary>
    public static decimal Round(decimal value) => Math.Round(value, 0, MidpointRounding.AwayFromZero);
}
