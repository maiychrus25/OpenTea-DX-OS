// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

public sealed class DayHeader(DateOnly date, DateOnly today)
{
    public DateOnly Date { get; } = date;
    public string Day => Date.Day.ToString();
    public string Weekday => Date.DayOfWeek switch
    {
        DayOfWeek.Sunday => "CN",
        _ => "T" + ((int)Date.DayOfWeek + 1),
    };
    public bool IsSunday => Date.DayOfWeek == DayOfWeek.Sunday;
    public bool IsToday => Date == today;
}

public sealed class DayCell(Employee employee, DateOnly date, AttendanceRecord? record, DateOnly today)
{
    public Employee Employee { get; } = employee;
    public DateOnly Date { get; } = date;
    public AttendanceRecord? Record { get; } = record;
    public bool IsSunday => Date.DayOfWeek == DayOfWeek.Sunday;
    public bool IsToday => Date == today;
    public bool IsFuture => Date > today;
    public AttendanceStatus? Status => Record?.Status;

    public string Symbol => Record?.Status switch
    {
        AttendanceStatus.Present => Record.OvertimeHours > 0 ? "+" : "✓",
        AttendanceStatus.HalfDay => "½",
        AttendanceStatus.PaidLeave => "P",
        AttendanceStatus.UnpaidLeave => "K",
        AttendanceStatus.Absent => "✕",
        _ => string.Empty,
    };

    public string Tooltip
    {
        get
        {
            var head = $"{Employee.FullName} · {Date:dd/MM/yyyy}";
            if (Record is null) return head + "\nChưa chấm công. Bấm để chấm.";
            var times = Record.CheckIn is null ? "" : $"\nVào {Record.CheckIn:HH:mm}" + (Record.CheckOut is null ? "" : $" · Ra {Record.CheckOut:HH:mm}");
            var ot = Record.OvertimeHours > 0 ? $"\nTăng ca {Record.OvertimeHours:0.#} giờ" : "";
            var note = string.IsNullOrEmpty(Record.Note) ? "" : "\n" + Record.Note;
            return $"{head}\n{Labels.Of(Record.Status)} ({Labels.Of(Record.Source)}){times}{ot}{note}";
        }
    }
}

public sealed class AttendanceRow(Employee employee, IReadOnlyList<DayCell> cells)
{
    public Employee Employee { get; } = employee;
    public IReadOnlyList<DayCell> Cells { get; } = cells;
    public decimal WorkDays => Cells.Sum(c => c.Record is null ? 0 : PayrollCalculator.WorkDayValue(c.Record.Status));
    public int LeaveDays => Cells.Count(c => c.Status is AttendanceStatus.PaidLeave or AttendanceStatus.UnpaidLeave);
    public int AbsentDays => Cells.Count(c => c.Status == AttendanceStatus.Absent);
    public decimal Overtime => Cells.Sum(c => c.Record?.OvertimeHours ?? 0);
}

public sealed partial class AttendanceViewModel(IDialogService dialogs, IEmployeeRepository employees, IAttendanceRepository attendance,
    AttendanceService service, IClock clock) : PageViewModel(dialogs)
{
    public override string Title => "Chấm công";
    public override string Subtitle => "Bảng công theo tháng. Nhân viên tự chấm vào/ra trên điện thoại, chủ HTX sửa bằng cách bấm vào ô.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Attendance, DataAreas.Employees];

    public ObservableCollection<DayHeader> Days { get; } = [];
    public ObservableCollection<AttendanceRow> Rows { get; } = [];

    [ObservableProperty] private DateOnly _month = new(DateTime.Today.Year, DateTime.Today.Month, 1);
    [ObservableProperty] private string _monthLabel = string.Empty;
    [ObservableProperty] private string _summary = string.Empty;
    [ObservableProperty] private IReadOnlyList<Controls.ChartSeries> _dailySeries = [];
    [ObservableProperty] private IReadOnlyList<string> _dailyLabels = [];

    public override async Task LoadAsync()
    {
        var today = DateOnly.FromDateTime(clock.Now);
        var end = Month.AddMonths(1).AddDays(-1);
        var staff = (await employees.ListAsync()).ToList();
        var records = await attendance.ListAsync(Month, end);
        var map = records.ToDictionary(r => (r.EmployeeId, r.WorkDate));

        MonthLabel = $"Tháng {Month.Month:00}/{Month.Year}";
        Days.Clear();
        for (var d = Month; d <= end; d = d.AddDays(1)) Days.Add(new DayHeader(d, today));

        Rows.Clear();
        foreach (var e in staff.Where(e => e.IsActive || records.Any(r => r.EmployeeId == e.Id)))
        {
            var cells = Days.Select(h => new DayCell(e, h.Date, map.GetValueOrDefault((e.Id, h.Date)), today)).ToList();
            Rows.Add(new AttendanceRow(e, cells));
        }
        // Daily totals for the month chart (days after today stay empty).
        var shown = Days.Where(d => d.Date <= today).ToList();
        DailyLabels = shown.Select(d => d.Date.ToString("dd/MM")).ToList();
        DailySeries =
        [
            new("Số công", Controls.ChartBase.Palette[3], shown.Select(d => (double)records.Where(r => r.WorkDate == d.Date).Sum(r => PayrollCalculator.WorkDayValue(r.Status))).ToList()),
            new("Nghỉ / vắng", Controls.ChartBase.Palette[2], shown.Select(d => (double)records.Count(r => r.WorkDate == d.Date && r.Status is AttendanceStatus.Absent or AttendanceStatus.PaidLeave or AttendanceStatus.UnpaidLeave)).ToList()),
            new("Giờ tăng ca", Controls.ChartBase.Palette[1], shown.Select(d => (double)records.Where(r => r.WorkDate == d.Date).Sum(r => r.OvertimeHours)).ToList()),
        ];

        var todayCount = records.Count(r => r.WorkDate == today && r.Status is AttendanceStatus.Present or AttendanceStatus.HalfDay);
        Summary = Month.Month == today.Month && Month.Year == today.Year
            ? $"Hôm nay có mặt {todayCount}/{staff.Count(e => e.Status == EmployeeStatus.Active)} người · tổng {Rows.Sum(r => r.WorkDays):0.#} công trong tháng"
            : $"Tổng {Rows.Sum(r => r.WorkDays):0.#} công · {Rows.Sum(r => r.Overtime):0.#} giờ tăng ca";
    }

    [RelayCommand]
    private Task PreviousMonth()
    {
        Month = Month.AddMonths(-1);
        return RunAsync(LoadAsync);
    }

    [RelayCommand]
    private Task NextMonth()
    {
        Month = Month.AddMonths(1);
        return RunAsync(LoadAsync);
    }

    [RelayCommand]
    private Task ThisMonth()
    {
        Month = new DateOnly(clock.Now.Year, clock.Now.Month, 1);
        return RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task MarkAllToday()
    {
        var today = DateOnly.FromDateTime(clock.Now);
        if (!Dialogs.Confirm("Chấm công hàng loạt", $"Chấm \"Có mặt\" ngày {today:dd/MM/yyyy} cho mọi nhân viên đang làm mà chưa có công hôm nay?")) return;
        var count = 0;
        if (await RunAsync(async () => { count = await service.MarkAllPresentAsync(today); await LoadAsync(); }))
            Dialogs.Info("Đã chấm công", count == 0 ? "Mọi nhân viên đã có công hôm nay." : $"Đã chấm có mặt cho {count} nhân viên.");
    }

    [RelayCommand]
    private async Task EditCell(DayCell? cell)
    {
        if (cell is null) return;
        if (cell.IsFuture && cell.Record is null)
        {
            Dialogs.Info("Chưa tới ngày", "Chỉ chấm công cho hôm nay hoặc các ngày đã qua. Ngày nghỉ sắp tới hãy tạo ở mục Nghỉ phép.");
            return;
        }
        if (Dialogs.ShowEditor(new AttendanceEditorViewModel(service, cell))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private void Export()
    {
        var path = Dialogs.SaveFile($"cham-cong-{Month:yyyy-MM}.csv", "CSV (*.csv)|*.csv");
        if (path is null) return;
        var header = new List<string> { "Mã", "Họ tên" };
        header.AddRange(Days.Select(d => d.Day));
        header.AddRange(["Công", "Nghỉ", "Vắng", "Tăng ca (giờ)"]);
        CsvExporter.Write(path, header, Rows.Select(r =>
        {
            var row = new List<object?> { r.Employee.Code, r.Employee.FullName };
            row.AddRange(r.Cells.Select(c => (object?)c.Symbol));
            row.AddRange([r.WorkDays, r.LeaveDays, r.AbsentDays, r.Overtime]);
            return row.ToArray();
        }));
        Dialogs.Info("Đã xuất file", path);
    }
}

public sealed partial class AttendanceEditorViewModel : EditorViewModel
{
    private readonly AttendanceService _service;
    private readonly DayCell _cell;

    public AttendanceEditorViewModel(AttendanceService service, DayCell cell)
    {
        _service = service;
        _cell = cell;
        Status = Statuses.First(s => s.Value == (cell.Record?.Status ?? AttendanceStatus.Present));
        Overtime = (cell.Record?.OvertimeHours ?? 0).ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);
        Note = cell.Record?.Note;
    }

    public override string Title => "Chấm công";
    public override double Width => 480;

    public string Heading => $"{_cell.Employee.FullName} · {_cell.Date:dddd, dd/MM/yyyy}";
    public string TimesText => _cell.Record?.CheckIn is null ? "Không có giờ vào/ra từ điện thoại."
        : $"Vào {_cell.Record.CheckIn:HH:mm}" + (_cell.Record.CheckOut is null ? " · chưa chấm ra" : $" · Ra {_cell.Record.CheckOut:HH:mm}");
    public bool HasRecord => _cell.Record is not null;

    public IReadOnlyList<Option<AttendanceStatus>> Statuses { get; } = Options.Of<AttendanceStatus>();

    [ObservableProperty] private Option<AttendanceStatus> _status;
    [ObservableProperty] private string _overtime;
    [ObservableProperty] private string? _note;

    protected override Task SaveCoreAsync() =>
        _service.SetAsync(_cell.Employee.Id, _cell.Date, Status.Value, ParseDecimal(Overtime, "Giờ tăng ca"), Note);

    [RelayCommand]
    private async Task Clear()
    {
        await _service.ClearAsync(_cell.Employee.Id, _cell.Date);
        Close(true);
    }
}
