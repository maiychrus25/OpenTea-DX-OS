// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Infrastructure.MobileApi;

public sealed record ApiError(string Message);

public sealed record LoginRequest(string? Username, string? Password);

public sealed record LoginResponse(string Token, ProfileDto Profile);

public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public sealed record TaskStatusRequest(WorkTaskStatus Status, int? Progress, string? Note);

/// <summary>Evidence travels as base64 inside the JSON body (max 5 MB decoded).</summary>
public sealed record AttachmentUpload(string? FileName, string? DataBase64);

public sealed record LeaveCreateRequest(string FromDate, string ToDate, LeaveType Type, string? Reason, AttachmentUpload? Attachment = null);

public sealed record ProfileDto(
    int Id, string Code, string FullName, string Position, string? Department, string? Phone, string? Email,
    string HireDate, string ContractType, string SalaryType, string HtxCode, string HtxName)
{
    public static ProfileDto From(Employee e, AppConfig config) => new(
        e.Id, e.Code, e.FullName, e.Position, e.Department?.Name, e.Phone, e.Email,
        e.HireDate.ToString("yyyy-MM-dd"), Labels.Of(e.ContractType), Labels.Of(e.SalaryType), e.HtxCode, config.HtxName);
}

public sealed record TaskDto(
    int Id, string Title, string? Description, string? Location, TaskPriority Priority, string PriorityLabel,
    WorkTaskStatus Status, string StatusLabel, int Progress, string StartDate, string DueDate, bool Overdue,
    string? ReportNote, string AssignedBy, string? CompletedAt, IReadOnlyList<WorkTaskStatus> NextStatuses)
{
    public static TaskDto From(WorkTask t, DateTime now) => new(
        t.Id, t.Title, t.Description, t.Location, t.Priority, Labels.Of(t.Priority), t.Status, Labels.Of(t.Status), t.Progress,
        t.StartDate.ToString("yyyy-MM-ddTHH:mm"), t.DueDate.ToString("yyyy-MM-ddTHH:mm"), t.IsOverdue(now), t.ReportNote,
        t.AssignedBy, t.CompletedAt?.ToString("yyyy-MM-ddTHH:mm"), TaskWorkflow.NextStatesForStaff(t.Status));
}

public sealed record AttendanceDto(string WorkDate, string? CheckIn, string? CheckOut, AttendanceStatus Status, string StatusLabel, decimal OvertimeHours, string? Note)
{
    public static AttendanceDto From(AttendanceRecord r) => new(
        r.WorkDate.ToString("yyyy-MM-dd"), r.CheckIn?.ToString("HH:mm"), r.CheckOut?.ToString("HH:mm"),
        r.Status, Labels.Of(r.Status), r.OvertimeHours, r.Note);
}

public sealed record AttendanceMonthDto(string Month, decimal WorkDays, int LeaveDays, int AbsentDays, decimal OvertimeHours, IReadOnlyList<AttendanceDto> Records);

public sealed record LeaveDto(int Id, string FromDate, string ToDate, int Days, LeaveType Type, string TypeLabel, string? Reason, LeaveStatus Status, string StatusLabel, string? ReviewNote, bool HasAttachment, string? AttachmentName)
{
    public static LeaveDto From(LeaveRequest l) => new(
        l.Id, l.FromDate.ToString("yyyy-MM-dd"), l.ToDate.ToString("yyyy-MM-dd"), l.Days, l.Type, Labels.Of(l.Type),
        l.Reason, l.Status, Labels.Of(l.Status), l.ReviewNote, l.HasAttachment, l.AttachmentName);
}

public sealed record LeaveListDto(int RemainingAnnualDays, IReadOnlyList<LeaveDto> Items);

public sealed record PayslipDto(
    int Id, int Year, int Month, string SalaryType, decimal BaseSalary, decimal StandardDays, decimal WorkDays, decimal PaidLeaveDays,
    decimal OvertimeHours, decimal EarnedSalary, decimal OvertimePay, decimal Allowance, decimal Bonus, decimal Insurance,
    decimal Deduction, decimal Advance, decimal GrossPay, decimal NetPay, PayslipStatus Status, string StatusLabel, string? Note)
{
    public static PayslipDto From(Payslip p) => new(
        p.Id, p.Year, p.Month, Labels.Of(p.SalaryType), p.BaseSalary, p.StandardDays, p.WorkDays, p.PaidLeaveDays, p.OvertimeHours,
        p.EarnedSalary, p.OvertimePay, p.Allowance, p.Bonus, p.Insurance, p.Deduction, p.Advance, p.GrossPay, p.NetPay,
        p.Status, Labels.Of(p.Status), p.Note);
}
