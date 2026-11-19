// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Services;

public sealed class PolicyService(ISettingsRepository settings)
{
    public const string StandardDaysKey = "payroll.standard_days";
    public const string InsuranceRateKey = "payroll.insurance_rate";
    public const string OvertimeKey = "payroll.overtime_multiplier";

    public async Task<PayrollPolicy> GetAsync(CancellationToken ct = default)
    {
        var p = new PayrollPolicy();
        return p with
        {
            StandardWorkDays = await ReadAsync(StandardDaysKey, p.StandardWorkDays, ct),
            InsuranceRate = await ReadAsync(InsuranceRateKey, p.InsuranceRate, ct),
            OvertimeMultiplier = await ReadAsync(OvertimeKey, p.OvertimeMultiplier, ct),
        };
    }

    public async Task SaveAsync(PayrollPolicy policy, CancellationToken ct = default)
    {
        if (policy.StandardWorkDays is < 1 or > 31) throw new DomainException("Số ngày công chuẩn phải từ 1 đến 31.");
        if (policy.InsuranceRate is < 0 or > 0.5m) throw new DomainException("Tỷ lệ bảo hiểm phải từ 0% đến 50%.");
        if (policy.OvertimeMultiplier is < 1 or > 4) throw new DomainException("Hệ số tăng ca phải từ 1 đến 4.");
        var inv = CultureInfo.InvariantCulture;
        await settings.SetAsync(StandardDaysKey, policy.StandardWorkDays.ToString(inv), ct);
        await settings.SetAsync(InsuranceRateKey, policy.InsuranceRate.ToString(inv), ct);
        await settings.SetAsync(OvertimeKey, policy.OvertimeMultiplier.ToString(inv), ct);
    }

    private async Task<decimal> ReadAsync(string key, decimal fallback, CancellationToken ct)
    {
        var raw = await settings.GetAsync(key, ct);
        return decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : fallback;
    }
}

public sealed class EmployeeService(IEmployeeRepository employees, IPasswordHasher hasher, IDataChangeNotifier notifier)
{
    public const string DefaultMobilePassword = "123456";

    public async Task<Employee> SaveAsync(Employee e, string? newPassword, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(e.FullName)) throw new DomainException("Vui lòng nhập họ tên nhân viên.");
        if (string.IsNullOrWhiteSpace(e.Code)) throw new DomainException("Vui lòng nhập mã nhân viên.");
        if (e.BaseSalary < 0 || e.Allowance < 0) throw new DomainException("Lương và phụ cấp không được âm.");
        if (e.AnnualLeaveDays is < 0 or > 60) throw new DomainException("Số ngày phép năm phải từ 0 đến 60.");
        if (!string.IsNullOrWhiteSpace(e.Phone) && !e.Phone.Trim().All(c => char.IsDigit(c) || c == '+' || c == ' '))
            throw new DomainException("Số điện thoại chỉ gồm chữ số.");
        if (!string.IsNullOrWhiteSpace(e.Email) && !e.Email.Contains('@')) throw new DomainException("Email không hợp lệ.");

        e.Code = e.Code.Trim().ToUpperInvariant();
        e.FullName = e.FullName.Trim();
        if (await employees.CodeExistsAsync(e.Code, e.Id, ct)) throw new DomainException($"Mã nhân viên {e.Code} đã tồn tại.");

        e.Username = string.IsNullOrWhiteSpace(e.Username) ? null : e.Username.Trim().ToLowerInvariant();
        if (e.Username is not null)
        {
            if (e.Username.Length < 3 || !e.Username.All(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-'))
                throw new DomainException("Tên đăng nhập gồm ít nhất 3 ký tự: chữ không dấu, số, dấu chấm, gạch dưới.");
            if (await employees.UsernameExistsAsync(e.Username, e.Id, ct)) throw new DomainException($"Tên đăng nhập {e.Username} đã được dùng.");
        }

        if (!string.IsNullOrEmpty(newPassword))
        {
            if (newPassword.Length < 6) throw new DomainException("Mật khẩu ứng dụng điện thoại cần ít nhất 6 ký tự.");
            e.PasswordHash = hasher.Hash(newPassword);
        }
        else if (e.Username is not null && string.IsNullOrEmpty(e.PasswordHash))
        {
            e.PasswordHash = hasher.Hash(DefaultMobilePassword);
        }

        var saved = await employees.SaveAsync(e, ct);
        notifier.Notify(DataAreas.Employees);
        return saved;
    }

    public async Task<Employee?> AuthenticateAsync(string username, string password, CancellationToken ct = default)
    {
        var e = await employees.FindByUsernameAsync(username.Trim().ToLowerInvariant(), ct);
        if (e is null || !e.IsActive || e.PasswordHash is null) return null;
        return hasher.Verify(password, e.PasswordHash) ? e : null;
    }

    public async Task ChangePasswordAsync(int employeeId, string current, string next, CancellationToken ct = default)
    {
        var e = await employees.GetAsync(employeeId, ct) ?? throw new DomainException("Không tìm thấy nhân viên.");
        if (e.PasswordHash is null || !hasher.Verify(current, e.PasswordHash)) throw new DomainException("Mật khẩu hiện tại không đúng.");
        if (next.Length < 6) throw new DomainException("Mật khẩu mới cần ít nhất 6 ký tự.");
        e.PasswordHash = hasher.Hash(next);
        await employees.SaveAsync(e, ct);
    }
}

public sealed class TaskService(ITaskRepository tasks, IEmployeeRepository employees, IClock clock, IDataChangeNotifier notifier)
{
    public async Task<WorkTask> SaveAsync(WorkTask task, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(task.Title)) throw new DomainException("Vui lòng nhập tên công việc.");
        if (task.DueDate < task.StartDate) throw new DomainException("Hạn hoàn thành phải sau ngày bắt đầu.");
        var assignee = await employees.GetAsync(task.AssigneeId, ct) ?? throw new DomainException("Vui lòng chọn nhân viên nhận việc.");
        if (!assignee.IsActive) throw new DomainException("Không thể giao việc cho nhân viên đã nghỉ việc.");
        task.Title = task.Title.Trim();
        var saved = await tasks.SaveAsync(task, ct);
        notifier.Notify(DataAreas.Tasks);
        return saved;
    }

    public async Task CancelAsync(int id, CancellationToken ct = default)
    {
        var task = await tasks.GetAsync(id, ct) ?? throw new DomainException("Không tìm thấy công việc.");
        if (task.Status == WorkTaskStatus.Completed) throw new DomainException("Công việc đã hoàn thành, không thể huỷ.");
        task.Status = WorkTaskStatus.Cancelled;
        await tasks.SaveAsync(task, ct);
        notifier.Notify(DataAreas.Tasks);
    }

    public async Task<WorkTask> StaffUpdateAsync(int employeeId, int taskId, WorkTaskStatus to, int? progress, string? note, CancellationToken ct = default)
    {
        var task = await tasks.GetAsync(taskId, ct);
        if (task is null || task.AssigneeId != employeeId) throw new DomainException("Không tìm thấy công việc.");
        TaskWorkflow.ApplyStaffUpdate(task, to, progress, note, clock.Now);
        var saved = await tasks.SaveAsync(task, ct);
        notifier.Notify(DataAreas.Tasks);
        return saved;
    }
}

public sealed class AttendanceService(IAttendanceRepository attendance, IEmployeeRepository employees, IClock clock, IDataChangeNotifier notifier)
{
    public const decimal StandardHours = 8m;

    public async Task<AttendanceRecord> CheckInAsync(int employeeId, RecordSource source, CancellationToken ct = default)
    {
        var now = clock.Now;
        var today = DateOnly.FromDateTime(now);
        var record = await attendance.GetAsync(employeeId, today, ct)
                     ?? new AttendanceRecord { EmployeeId = employeeId, WorkDate = today, Source = source };
        if (record.CheckIn is not null) throw new DomainException($"Bạn đã chấm công vào lúc {record.CheckIn:HH:mm}.");
        if (record.Status is AttendanceStatus.PaidLeave or AttendanceStatus.UnpaidLeave && record.Id != 0)
            throw new DomainException("Hôm nay bạn đang trong ngày nghỉ đã được duyệt.");
        record.CheckIn = now;
        record.Status = AttendanceStatus.Present;
        record.Source = source;
        var saved = await attendance.SaveAsync(record, ct);
        notifier.Notify(DataAreas.Attendance);
        return saved;
    }

    public async Task<AttendanceRecord> CheckOutAsync(int employeeId, CancellationToken ct = default)
    {
        var now = clock.Now;
        var record = await attendance.GetAsync(employeeId, DateOnly.FromDateTime(now), ct);
        if (record?.CheckIn is null) throw new DomainException("Bạn chưa chấm công vào hôm nay.");
        if (record.CheckOut is not null) throw new DomainException($"Bạn đã chấm công ra lúc {record.CheckOut:HH:mm}.");
        record.CheckOut = now;
        var hours = (decimal)(now - record.CheckIn.Value).TotalHours;
        record.Status = hours < 4 ? AttendanceStatus.HalfDay : AttendanceStatus.Present;
        // One hour lunch break; overtime counted in half-hour steps.
        record.OvertimeHours = hours > StandardHours + 1 ? Math.Floor((hours - StandardHours - 1) * 2) / 2 : 0;
        var saved = await attendance.SaveAsync(record, ct);
        notifier.Notify(DataAreas.Attendance);
        return saved;
    }

    public async Task<int> MarkAllPresentAsync(DateOnly day, CancellationToken ct = default)
    {
        var count = 0;
        foreach (var e in (await employees.ListAsync(ct)).Where(e => e.Status == EmployeeStatus.Active))
        {
            if (await attendance.GetAsync(e.Id, day, ct) is not null) continue;
            await attendance.SaveAsync(new AttendanceRecord
            {
                EmployeeId = e.Id, WorkDate = day, Status = AttendanceStatus.Present, Source = RecordSource.Desktop,
            }, ct);
            count++;
        }
        notifier.Notify(DataAreas.Attendance);
        return count;
    }

    public async Task<AttendanceRecord> SetAsync(int employeeId, DateOnly day, AttendanceStatus status, decimal overtime, string? note, CancellationToken ct = default)
    {
        if (overtime is < 0 or > 12) throw new DomainException("Giờ tăng ca phải từ 0 đến 12.");
        var record = await attendance.GetAsync(employeeId, day, ct)
                     ?? new AttendanceRecord { EmployeeId = employeeId, WorkDate = day, Source = RecordSource.Desktop };
        record.Status = status;
        record.OvertimeHours = overtime;
        record.Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        var saved = await attendance.SaveAsync(record, ct);
        notifier.Notify(DataAreas.Attendance);
        return saved;
    }

    public async Task ClearAsync(int employeeId, DateOnly day, CancellationToken ct = default)
    {
        var record = await attendance.GetAsync(employeeId, day, ct);
        if (record is null) return;
        await attendance.DeleteAsync(record.Id, ct);
        notifier.Notify(DataAreas.Attendance);
    }
}

public sealed class LeaveService(ILeaveRepository leaves, IAttendanceRepository attendance, IEmployeeRepository employees, ITenantContext tenant, IClock clock, IDataChangeNotifier notifier)
{
    public async Task<LeaveRequest> SubmitAsync(LeaveRequest request, CancellationToken ct = default)
    {
        if (request.ToDate < request.FromDate) throw new DomainException("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
        if (request.Days > 30) throw new DomainException("Mỗi đơn nghỉ tối đa 30 ngày.");
        if (request.FromDate < DateOnly.FromDateTime(clock.Now).AddDays(-30)) throw new DomainException("Không thể xin nghỉ cho ngày quá 30 ngày trước.");
        if (string.IsNullOrWhiteSpace(request.Reason)) throw new DomainException("Vui lòng ghi lý do nghỉ.");
        if (request.Type == LeaveType.Annual)
        {
            var remaining = await RemainingAnnualDaysAsync(request.EmployeeId, request.FromDate.Year, ct);
            if (request.Days > remaining) throw new DomainException($"Số ngày phép năm còn lại là {remaining}, không đủ cho {request.Days} ngày.");
        }
        request.Reason = request.Reason.Trim();
        request.Status = LeaveStatus.Pending;
        var saved = await leaves.SaveAsync(request, ct);
        notifier.Notify(DataAreas.Leaves);
        return saved;
    }

    public async Task<int> RemainingAnnualDaysAsync(int employeeId, int year, CancellationToken ct = default)
    {
        var employee = await employees.GetAsync(employeeId, ct) ?? throw new DomainException("Không tìm thấy nhân viên.");
        var used = (await leaves.ListAsync(employeeId, ct))
            .Where(l => l.Type == LeaveType.Annual && l.FromDate.Year == year && l.Status is LeaveStatus.Approved or LeaveStatus.Pending)
            .Sum(l => l.Days);
        return Math.Max(0, employee.AnnualLeaveDays - used);
    }

    public async Task ReviewAsync(int id, bool approve, string? note, CancellationToken ct = default)
    {
        var request = await leaves.GetAsync(id, ct) ?? throw new DomainException("Không tìm thấy đơn nghỉ.");
        if (request.Status != LeaveStatus.Pending) throw new DomainException("Đơn này đã được xử lý.");
        if (!approve && string.IsNullOrWhiteSpace(note)) throw new DomainException("Vui lòng ghi lý do từ chối.");
        request.Status = approve ? LeaveStatus.Approved : LeaveStatus.Rejected;
        request.ReviewNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        request.ReviewedBy = tenant.DisplayName;
        request.ReviewedAt = clock.Now;
        await leaves.SaveAsync(request, ct);

        if (approve)
        {
            var status = request.Type == LeaveType.Unpaid ? AttendanceStatus.UnpaidLeave : AttendanceStatus.PaidLeave;
            for (var d = request.FromDate; d <= request.ToDate; d = d.AddDays(1))
            {
                if (d.DayOfWeek == DayOfWeek.Sunday) continue;
                var rec = await attendance.GetAsync(request.EmployeeId, d, ct)
                          ?? new AttendanceRecord { EmployeeId = request.EmployeeId, WorkDate = d, Source = RecordSource.Desktop };
                rec.Status = status;
                rec.Note = $"{Labels.Of(request.Type)} (đơn #{request.Id})";
                await attendance.SaveAsync(rec, ct);
            }
            notifier.Notify(DataAreas.Attendance);
        }
        notifier.Notify(DataAreas.Leaves);
    }

    public async Task CancelAsync(int employeeId, int id, CancellationToken ct = default)
    {
        var request = await leaves.GetAsync(id, ct);
        if (request is null || request.EmployeeId != employeeId) throw new DomainException("Không tìm thấy đơn nghỉ.");
        if (request.Status != LeaveStatus.Pending) throw new DomainException("Chỉ huỷ được đơn đang chờ duyệt.");
        request.Status = LeaveStatus.Cancelled;
        await leaves.SaveAsync(request, ct);
        notifier.Notify(DataAreas.Leaves);
    }
}

public sealed class PayrollService(IPayslipRepository payslips, IEmployeeRepository employees, IAttendanceRepository attendance, PolicyService policies, IClock clock, IDataChangeNotifier notifier)
{
    /// <summary>Creates or refreshes draft payslips for every employee who is active or worked in the month.</summary>
    public async Task<IReadOnlyList<Payslip>> GenerateAsync(int year, int month, CancellationToken ct = default)
    {
        var policy = await policies.GetAsync(ct);
        var from = new DateOnly(year, month, 1);
        var to = from.AddMonths(1).AddDays(-1);
        var records = await attendance.ListAsync(from, to, null, ct);
        var existing = (await payslips.ListAsync(year, month, ct)).ToDictionary(p => p.EmployeeId);

        foreach (var e in await employees.ListAsync(ct))
        {
            var mine = records.Where(r => r.EmployeeId == e.Id).ToList();
            if (!e.IsActive && mine.Count == 0) continue;
            existing.TryGetValue(e.Id, out var slip);
            if (slip is { Status: not PayslipStatus.Draft }) continue;
            slip ??= new Payslip { EmployeeId = e.Id, Year = year, Month = month };
            slip.SalaryType = e.SalaryType;
            slip.BaseSalary = e.BaseSalary;
            slip.Allowance = e.Allowance;
            slip.StandardDays = policy.StandardWorkDays;
            slip.WorkDays = mine.Sum(r => PayrollCalculator.WorkDayValue(r.Status));
            slip.PaidLeaveDays = mine.Count(r => r.Status == AttendanceStatus.PaidLeave);
            slip.OvertimeHours = mine.Sum(r => r.OvertimeHours);
            slip.Employee = null;
            PayrollCalculator.Recalculate(slip, e.ContractType, policy);
            await payslips.SaveAsync(slip, ct);
        }
        notifier.Notify(DataAreas.Payroll);
        return await payslips.ListAsync(year, month, ct);
    }

    public async Task<Payslip> UpdateAdjustmentsAsync(Payslip slip, CancellationToken ct = default)
    {
        if (slip.Status != PayslipStatus.Draft) throw new DomainException("Chỉ sửa được phiếu lương ở trạng thái Nháp.");
        if (slip.Bonus < 0 || slip.Deduction < 0 || slip.Advance < 0 || slip.Allowance < 0) throw new DomainException("Các khoản tiền không được âm.");
        var employee = await employees.GetAsync(slip.EmployeeId, ct);
        PayrollCalculator.Recalculate(slip, employee?.ContractType ?? ContractType.FullTime, await policies.GetAsync(ct));
        var saved = await payslips.SaveAsync(slip, ct);
        notifier.Notify(DataAreas.Payroll);
        return saved;
    }

    public async Task SetStatusAsync(Payslip slip, PayslipStatus status, CancellationToken ct = default)
    {
        var ok = (slip.Status, status) switch
        {
            (PayslipStatus.Draft, PayslipStatus.Approved) => true,
            (PayslipStatus.Approved, PayslipStatus.Draft) => true,
            (PayslipStatus.Approved, PayslipStatus.Paid) => true,
            _ => false,
        };
        if (!ok) throw new DomainException($"Không thể chuyển phiếu lương từ \"{Labels.Of(slip.Status)}\" sang \"{Labels.Of(status)}\".");
        slip.Status = status;
        slip.PaidAt = status == PayslipStatus.Paid ? clock.Now : null;
        await payslips.SaveAsync(slip, ct);
        notifier.Notify(DataAreas.Payroll);
    }
}
