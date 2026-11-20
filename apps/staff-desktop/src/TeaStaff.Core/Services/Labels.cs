// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Services;

/// <summary>Vietnamese display labels for domain enums (user-facing copy only).</summary>
public static class Labels
{
    public static string Of(Enum value) => value switch
    {
        Gender.Male => "Nam",
        Gender.Female => "Nữ",
        Gender.Other => "Khác",
        ContractType.FullTime => "Chính thức",
        ContractType.PartTime => "Bán thời gian",
        ContractType.Seasonal => "Thời vụ",
        ContractType.Probation => "Thử việc",
        SalaryType.Monthly => "Theo tháng",
        SalaryType.Daily => "Theo ngày công",
        EmployeeStatus.Active => "Đang làm",
        EmployeeStatus.OnLeave => "Tạm nghỉ",
        EmployeeStatus.Resigned => "Đã nghỉ việc",
        TaskPriority.Low => "Thấp",
        TaskPriority.Normal => "Bình thường",
        TaskPriority.High => "Cao",
        TaskPriority.Urgent => "Khẩn cấp",
        WorkTaskStatus.Assigned => "Mới giao",
        WorkTaskStatus.Accepted => "Đã nhận",
        WorkTaskStatus.InProgress => "Đang làm",
        WorkTaskStatus.Completed => "Hoàn thành",
        WorkTaskStatus.Rejected => "Từ chối",
        WorkTaskStatus.Cancelled => "Đã huỷ",
        AttendanceStatus.Present => "Có mặt",
        AttendanceStatus.HalfDay => "Nửa ngày",
        AttendanceStatus.Absent => "Vắng",
        AttendanceStatus.PaidLeave => "Nghỉ có lương",
        AttendanceStatus.UnpaidLeave => "Nghỉ không lương",
        LeaveType.Annual => "Nghỉ phép năm",
        LeaveType.Sick => "Nghỉ ốm",
        LeaveType.Unpaid => "Nghỉ không lương",
        LeaveType.Personal => "Việc riêng",
        LeaveStatus.Pending => "Chờ duyệt",
        LeaveStatus.Approved => "Đã duyệt",
        LeaveStatus.Rejected => "Từ chối",
        LeaveStatus.Cancelled => "Đã huỷ",
        PayslipStatus.Draft => "Nháp",
        PayslipStatus.Approved => "Đã duyệt",
        PayslipStatus.Paid => "Đã trả",
        RecordSource.Desktop => "Máy tính",
        RecordSource.Mobile => "Điện thoại",
        RecordSource.Core => "DX-OS",
        _ => value.ToString(),
    };
}
