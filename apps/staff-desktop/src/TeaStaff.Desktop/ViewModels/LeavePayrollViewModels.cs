// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Converters;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

public sealed partial class LeavesViewModel(IDialogService dialogs, ILeaveRepository leaves, IEmployeeRepository employees, LeaveService service) : PageViewModel(dialogs)
{
    private IReadOnlyList<LeaveRequest> _all = [];

    public override string Title => "Nghỉ phép";
    public override string Subtitle => "Duyệt đơn xin nghỉ gửi từ điện thoại. Đơn được duyệt tự ghi vào bảng chấm công.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Leaves];

    public ObservableCollection<LeaveRequest> Items { get; } = [];

    [ObservableProperty] private string _filter = "pending";
    [ObservableProperty] private int _pendingCount;
    [ObservableProperty] private IReadOnlyList<Controls.ChartPoint> _typeShare = [];
    [ObservableProperty] private IReadOnlyList<LegendItem> _typeLegend = [];
    [ObservableProperty] private IReadOnlyList<Controls.ChartPoint> _monthBars = [];
    [ObservableProperty] private string _evidenceRate = "–";

    partial void OnFilterChanged(string value) => Apply();

    public override async Task LoadAsync()
    {
        _all = await leaves.ListAsync();
        PendingCount = _all.Count(l => l.Status == LeaveStatus.Pending);

        // Approved leave this year: days by type, and days per month for the last six months.
        var year = DateTime.Today.Year;
        var approved = _all.Where(l => l.Status == LeaveStatus.Approved).ToList();
        var colors = new[] { 0, 1, 2, 5 };
        var types = Enum.GetValues<LeaveType>();
        TypeShare = types.Select((t, i) => new Controls.ChartPoint(Labels.Of(t), approved.Where(l => l.Type == t && l.FromDate.Year == year).Sum(l => l.Days), Controls.ChartBase.Palette[colors[i]])).ToList();
        TypeLegend = types.Select((t, i) => new LegendItem(Labels.Of(t), $"{approved.Where(l => l.Type == t && l.FromDate.Year == year).Sum(l => l.Days)} ngày", Controls.ChartBase.Palette[colors[i]])).ToList();
        var first = new DateOnly(year, DateTime.Today.Month, 1).AddMonths(-5);
        MonthBars = Enumerable.Range(0, 6).Select(i => first.AddMonths(i)).Select(m => new Controls.ChartPoint($"T{m.Month}",
            approved.Where(l => l.FromDate.Year == m.Year && l.FromDate.Month == m.Month).Sum(l => l.Days), Controls.ChartBase.Palette[0])).ToList();
        var sick = _all.Where(l => l.Type == LeaveType.Sick && l.Status != LeaveStatus.Cancelled).ToList();
        EvidenceRate = sick.Count == 0 ? "–" : $"{sick.Count(l => l.HasAttachment) * 100 / sick.Count}%";
        Apply();
    }

    [RelayCommand]
    private void SetFilter(string key) => Filter = key;

    private void Apply()
    {
        Items.Clear();
        foreach (var l in _all.Where(l => Filter switch
                 {
                     "pending" => l.Status == LeaveStatus.Pending,
                     "approved" => l.Status == LeaveStatus.Approved,
                     "rejected" => l.Status is LeaveStatus.Rejected or LeaveStatus.Cancelled,
                     _ => true,
                 }))
            Items.Add(l);
    }

    [RelayCommand]
    private async Task Approve(LeaveRequest? request)
    {
        if (request is null) return;
        if (!Dialogs.Confirm("Duyệt đơn nghỉ", $"Duyệt {Labels.Of(request.Type).ToLowerInvariant()} {request.Days} ngày ({request.FromDate:dd/MM} – {request.ToDate:dd/MM}) cho {request.Employee?.FullName}?", "Duyệt")) return;
        await RunAsync(async () => { await service.ReviewAsync(request.Id, true, null); await LoadAsync(); });
    }

    [RelayCommand]
    private async Task Reject(LeaveRequest? request)
    {
        if (request is null) return;
        var reason = Dialogs.Prompt("Từ chối đơn nghỉ", $"Lý do từ chối đơn của {request.Employee?.FullName}:", required: true);
        if (reason is null) return;
        await RunAsync(async () => { await service.ReviewAsync(request.Id, false, reason); await LoadAsync(); });
    }

    [RelayCommand]
    private async Task Add()
    {
        var staff = (await employees.ListAsync()).Where(e => e.IsActive).ToList();
        if (staff.Count == 0) return;
        if (Dialogs.ShowEditor(new LeaveEditorViewModel(service, staff, Dialogs))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private void OpenAttachment(LeaveRequest? request)
    {
        var path = request is null ? null : service.AttachmentFile(request);
        if (path is null || !System.IO.File.Exists(path))
        {
            Dialogs.Error("Không tìm thấy tệp minh chứng trên máy này.");
            return;
        }
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
    }
}

public sealed partial class LeaveEditorViewModel : EditorViewModel
{
    private readonly LeaveService _service;
    private readonly IDialogService _dialogs;

    public LeaveEditorViewModel(LeaveService service, IReadOnlyList<Employee> staff, IDialogService dialogs)
    {
        _service = service;
        _dialogs = dialogs;
        Employees = staff.Select(e => new Option<int>(e.Id, $"{e.FullName} ({e.Code})")).ToList();
        Employee = Employees[0];
        Type = Types[0];
    }

    public override string Title => "Ghi đơn nghỉ";
    public override string SaveText => "Ghi và duyệt";
    public override double Width => 520;

    public IReadOnlyList<Option<int>> Employees { get; }
    public IReadOnlyList<Option<LeaveType>> Types { get; } = Options.Of<LeaveType>();

    [ObservableProperty] private Option<int> _employee;
    [ObservableProperty] private Option<LeaveType> _type;
    [ObservableProperty] private DateTime _fromDate = DateTime.Today;
    [ObservableProperty] private DateTime _toDate = DateTime.Today;
    [ObservableProperty] private string? _reason;
    [ObservableProperty] private string _remaining = string.Empty;
    [ObservableProperty] private string? _attachmentFile;

    public string AttachmentLabel => AttachmentFile is null ? "Chưa chọn tệp (ảnh JPG/PNG hoặc PDF, tối đa 5 MB)" : System.IO.Path.GetFileName(AttachmentFile);
    partial void OnAttachmentFileChanged(string? value) => OnPropertyChanged(nameof(AttachmentLabel));

    [RelayCommand]
    private void PickAttachment() => AttachmentFile = _dialogs.OpenFile("Ảnh hoặc PDF|*.jpg;*.jpeg;*.png;*.webp;*.pdf") ?? AttachmentFile;

    [RelayCommand]
    private void ClearAttachment() => AttachmentFile = null;

    partial void OnEmployeeChanged(Option<int> value) => _ = LoadRemainingAsync();

    private async Task LoadRemainingAsync()
    {
        try { Remaining = $"Còn {await _service.RemainingAnnualDaysAsync(Employee.Value, FromDate.Year)} ngày phép năm"; }
        catch (DomainException) { Remaining = string.Empty; }
    }

    protected override async Task SaveCoreAsync()
    {
        var saved = await _service.SubmitAsync(new LeaveRequest
        {
            EmployeeId = Employee.Value, Type = Type.Value, FromDate = DateOnly.FromDateTime(FromDate), ToDate = DateOnly.FromDateTime(ToDate),
            Reason = Reason, Source = RecordSource.Desktop,
        }, AttachmentFile is null ? null : new LeaveAttachment(System.IO.Path.GetFileName(AttachmentFile), await System.IO.File.ReadAllBytesAsync(AttachmentFile)));
        await _service.ReviewAsync(saved.Id, true, "Ghi bởi chủ HTX");
    }
}

public sealed partial class PayrollViewModel(IDialogService dialogs, IPayslipRepository payslips, PayrollService service, PolicyService policies,
    Infrastructure.AppConfig config) : PageViewModel(dialogs)
{
    public override string Title => "Bảng lương";
    public override string Subtitle => "Tính lương từ bảng công: lương theo ngày công, tăng ca, phụ cấp, thưởng, bảo hiểm, tạm ứng.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Payroll];

    public ObservableCollection<Payslip> Items { get; } = [];

    [ObservableProperty] private DateOnly _month = new(DateTime.Today.Year, DateTime.Today.Month, 1);
    [ObservableProperty] private string _monthLabel = string.Empty;
    [ObservableProperty] private string _totalGross = "0 ₫";
    [ObservableProperty] private string _totalNet = "0 ₫";
    [ObservableProperty] private string _totalInsurance = "0 ₫";
    [ObservableProperty] private string _statusSummary = string.Empty;
    [ObservableProperty] private string _policyText = string.Empty;
    [ObservableProperty] private bool _isEmpty;

    public override async Task LoadAsync()
    {
        MonthLabel = $"Tháng {Month.Month:00}/{Month.Year}";
        var policy = await policies.GetAsync();
        PolicyText = $"Công chuẩn {policy.StandardWorkDays:0.#} ngày · BHXH người lao động {policy.InsuranceRate * 100:0.#}% (HĐ chính thức) · tăng ca ×{policy.OvertimeMultiplier:0.#}";
        var list = await payslips.ListAsync(Month.Year, Month.Month);
        Items.Clear();
        foreach (var p in list) Items.Add(p);
        IsEmpty = list.Count == 0;
        TotalGross = MoneyConverter.Format(list.Sum(p => p.GrossPay));
        TotalNet = MoneyConverter.Format(list.Sum(p => p.NetPay));
        TotalInsurance = MoneyConverter.Format(list.Sum(p => p.Insurance));
        StatusSummary = list.Count == 0 ? "Chưa có phiếu lương"
            : $"{list.Count(p => p.Status == PayslipStatus.Draft)} nháp · {list.Count(p => p.Status == PayslipStatus.Approved)} đã duyệt · {list.Count(p => p.Status == PayslipStatus.Paid)} đã trả";
    }

    [RelayCommand]
    private Task PreviousMonth() { Month = Month.AddMonths(-1); return RunAsync(LoadAsync); }

    [RelayCommand]
    private Task NextMonth() { Month = Month.AddMonths(1); return RunAsync(LoadAsync); }

    [RelayCommand]
    private async Task Generate()
    {
        var hasLocked = Items.Any(p => p.Status != PayslipStatus.Draft);
        var message = $"Tính lương {MonthLabel.ToLowerInvariant()} từ bảng chấm công hiện tại?" +
                      (Items.Count > 0 ? "\n\nPhiếu nháp được cập nhật lại số công (giữ thưởng, khấu trừ, tạm ứng đã nhập)." : "") +
                      (hasLocked ? " Phiếu đã duyệt hoặc đã trả không bị thay đổi." : "");
        if (!Dialogs.Confirm("Tính lương", message, "Tính lương")) return;
        await RunAsync(async () => { await service.GenerateAsync(Month.Year, Month.Month); await LoadAsync(); });
    }

    [RelayCommand]
    private async Task Edit(Payslip? slip)
    {
        if (slip is null) return;
        if (Dialogs.ShowEditor(new PayslipEditorViewModel(service, slip, config.HtxName))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task ApproveAll()
    {
        var drafts = Items.Where(p => p.Status == PayslipStatus.Draft).ToList();
        if (drafts.Count == 0) { Dialogs.Info("Không có phiếu nháp", "Mọi phiếu lương tháng này đã được duyệt."); return; }
        if (!Dialogs.Confirm("Duyệt bảng lương", $"Duyệt {drafts.Count} phiếu lương nháp? Phiếu đã duyệt sẽ hiện trên điện thoại của nhân viên.", "Duyệt")) return;
        await RunAsync(async () => { foreach (var p in drafts) await service.SetStatusAsync(p, PayslipStatus.Approved); await LoadAsync(); });
    }

    [RelayCommand]
    private async Task PayAll()
    {
        var approved = Items.Where(p => p.Status == PayslipStatus.Approved).ToList();
        if (approved.Count == 0) { Dialogs.Info("Chưa có phiếu đã duyệt", "Hãy duyệt bảng lương trước khi ghi nhận đã trả."); return; }
        if (!Dialogs.Confirm("Ghi nhận đã trả lương", $"Ghi nhận đã trả {MoneyConverter.Format(approved.Sum(p => p.NetPay))} cho {approved.Count} nhân viên?", "Đã trả")) return;
        await RunAsync(async () => { foreach (var p in approved) await service.SetStatusAsync(p, PayslipStatus.Paid); await LoadAsync(); });
    }

    [RelayCommand]
    private async Task Approve(Payslip? slip)
    {
        if (slip is null) return;
        var target = slip.Status switch { PayslipStatus.Draft => PayslipStatus.Approved, PayslipStatus.Approved => PayslipStatus.Paid, _ => slip.Status };
        if (target == slip.Status) return;
        await RunAsync(async () => { await service.SetStatusAsync(slip, target); await LoadAsync(); });
    }

    [RelayCommand]
    private void Export()
    {
        if (Items.Count == 0) return;
        var path = Dialogs.SaveFile($"bang-luong-{Month:yyyy-MM}.csv", "CSV (*.csv)|*.csv");
        if (path is null) return;
        CsvExporter.Write(path,
            ["Mã", "Họ tên", "Hình thức", "Lương cơ bản", "Công chuẩn", "Ngày công", "Nghỉ có lương", "Lương theo công", "Tăng ca (giờ)", "Tiền tăng ca", "Phụ cấp", "Thưởng", "Tổng thu nhập", "BHXH", "Khấu trừ", "Tạm ứng", "Thực lĩnh", "Trạng thái", "Ngân hàng", "Số tài khoản"],
            Items.Select(p => new object?[]
            {
                p.Employee?.Code, p.Employee?.FullName, Labels.Of(p.SalaryType), p.BaseSalary, p.StandardDays, p.WorkDays, p.PaidLeaveDays, p.EarnedSalary,
                p.OvertimeHours, p.OvertimePay, p.Allowance, p.Bonus, p.GrossPay, p.Insurance, p.Deduction, p.Advance, p.NetPay, Labels.Of(p.Status),
                p.Employee?.BankName, p.Employee?.BankAccount,
            }));
        Dialogs.Info("Đã xuất file", path);
    }
}

public sealed partial class PayslipEditorViewModel : EditorViewModel
{
    private readonly PayrollService _service;
    private readonly Payslip _slip;

    public PayslipEditorViewModel(PayrollService service, Payslip slip, string htxName)
    {
        _service = service;
        _slip = slip;
        HtxName = htxName;
        Allowance = Money(slip.Allowance);
        Bonus = Money(slip.Bonus);
        Deduction = Money(slip.Deduction);
        Advance = Money(slip.Advance);
        Note = slip.Note;
    }

    public override string Title => $"Phiếu lương tháng {_slip.Month:00}/{_slip.Year}";
    public override string SaveText => "Lưu và tính lại";
    public override double Width => 620;

    public string HtxName { get; }
    public Payslip Slip => _slip;
    public bool IsEditable => _slip.Status == PayslipStatus.Draft;
    public string EmployeeLine => $"{_slip.Employee?.FullName} · {_slip.Employee?.Code} · {_slip.Employee?.Position}";
    public string DaysLine => _slip.SalaryType == SalaryType.Monthly
        ? $"{_slip.WorkDays:0.#} công + {_slip.PaidLeaveDays:0.#} nghỉ có lương / {_slip.StandardDays:0.#} công chuẩn"
        : $"{_slip.WorkDays:0.#} công + {_slip.PaidLeaveDays:0.#} nghỉ có lương × {MoneyConverter.Format(_slip.BaseSalary)}/ngày";

    [ObservableProperty] private string _allowance;
    [ObservableProperty] private string _bonus;
    [ObservableProperty] private string _deduction;
    [ObservableProperty] private string _advance;
    [ObservableProperty] private string? _note;

    protected override async Task SaveCoreAsync()
    {
        if (!IsEditable) throw new DomainException("Phiếu đã duyệt. Chuyển về Nháp (bấm \"Trả về nháp\") trước khi sửa.");
        _slip.Allowance = ParseMoney(Allowance, "Phụ cấp");
        _slip.Bonus = ParseMoney(Bonus, "Thưởng");
        _slip.Deduction = ParseMoney(Deduction, "Khấu trừ");
        _slip.Advance = ParseMoney(Advance, "Tạm ứng");
        _slip.Note = string.IsNullOrWhiteSpace(Note) ? null : Note.Trim();
        await _service.UpdateAdjustmentsAsync(_slip);
    }

    [RelayCommand]
    private async Task BackToDraft()
    {
        if (_slip.Status != PayslipStatus.Approved) return;
        try
        {
            await _service.SetStatusAsync(_slip, PayslipStatus.Draft);
            Close(true);
        }
        catch (DomainException e)
        {
            Error = e.Message;
        }
    }
}
