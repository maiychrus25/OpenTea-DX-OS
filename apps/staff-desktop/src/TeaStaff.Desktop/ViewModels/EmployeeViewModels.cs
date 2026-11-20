// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using System.Text;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

public sealed partial class EmployeesViewModel(
    IDialogService dialogs, IEmployeeRepository employees, IDepartmentRepository departments, EmployeeService service,
    ITaskRepository tasks) : PageViewModel(dialogs)
{
    private IReadOnlyList<Employee> _all = [];

    public override string Title => "Nhân viên";
    public override string Subtitle => "Hồ sơ, hợp đồng, lương cơ bản và tài khoản ứng dụng nhận việc.";
    public override IReadOnlyCollection<string> WatchedAreas => [DataAreas.Employees];

    public ObservableCollection<Employee> Items { get; } = [];
    public ObservableCollection<Option<int?>> DepartmentFilters { get; } = [];
    public IReadOnlyList<Option<EmployeeStatus?>> StatusFilters { get; } =
        [new(null, "Tất cả trạng thái"), .. Enum.GetValues<EmployeeStatus>().Select(s => new Option<EmployeeStatus?>(s, Labels.Of(s)))];

    [ObservableProperty] private string _search = string.Empty;
    [ObservableProperty] private Option<int?>? _departmentFilter;
    [ObservableProperty] private Option<EmployeeStatus?>? _statusFilter;
    [ObservableProperty] private Employee? _selected;
    [ObservableProperty] private string _summary = string.Empty;
    private static readonly int[] TeamColors = [0, 1, 2, 7, 5, 4];
    [ObservableProperty] private IReadOnlyList<Controls.ChartPoint> _teamShare = [];
    [ObservableProperty] private IReadOnlyList<LegendItem> _teamLegend = [];
    [ObservableProperty] private IReadOnlyList<Controls.ChartPoint> _contractBars = [];
    [ObservableProperty] private string _salaryFund = string.Empty;

    partial void OnSearchChanged(string value) => Apply();
    partial void OnDepartmentFilterChanged(Option<int?>? value) => Apply();
    partial void OnStatusFilterChanged(Option<EmployeeStatus?>? value) => Apply();

    public override async Task LoadAsync()
    {
        _all = await employees.ListAsync();
        var keep = DepartmentFilter?.Value;
        DepartmentFilters.Clear();
        DepartmentFilters.Add(new Option<int?>(null, "Tất cả tổ / phòng ban"));
        foreach (var d in await departments.ListAsync()) DepartmentFilters.Add(new Option<int?>(d.Id, d.Name));
        DepartmentFilter = DepartmentFilters.FirstOrDefault(o => o.Value == keep) ?? DepartmentFilters[0];
        StatusFilter ??= StatusFilters[0];
        Apply();
    }

    private void Apply()
    {
        var q = Search.Trim();
        var list = _all.Where(e =>
            (q.Length == 0 || Contains(e.FullName, q) || Contains(e.Code, q) || Contains(e.Phone, q) || Contains(e.Position, q)) &&
            (DepartmentFilter?.Value is null || e.DepartmentId == DepartmentFilter.Value) &&
            (StatusFilter?.Value is null || e.Status == StatusFilter.Value)).ToList();
        Items.Clear();
        foreach (var e in list) Items.Add(e);
        Summary = $"{list.Count} / {_all.Count} nhân viên · {_all.Count(e => e.Status == EmployeeStatus.Active)} đang làm";

        // Structure of the active workforce (independent of the search box).
        var active = _all.Where(e => e.Status == EmployeeStatus.Active).ToList();
        var teams = active.GroupBy(e => e.Department?.Name ?? "Chưa phân tổ").OrderByDescending(g => g.Count()).ToList();
        TeamShare = teams.Select((g, i) => new Controls.ChartPoint(g.Key, g.Count(), Controls.ChartBase.Palette[TeamColors[i % TeamColors.Length]])).ToList();
        TeamLegend = teams.Select((g, i) => new LegendItem(g.Key, $"{g.Count()} người", Controls.ChartBase.Palette[TeamColors[i % TeamColors.Length]])).ToList();
        ContractBars = Enum.GetValues<ContractType>()
            .Select((c, i) => new Controls.ChartPoint(Labels.Of(c), active.Count(e => e.ContractType == c), Controls.ChartBase.Palette[new[] { 0, 1, 2, 5 }[i % 4]]))
            .ToList();
        SalaryFund = Converters.MoneyConverter.Format(active.Where(e => e.SalaryType == SalaryType.Monthly).Sum(e => e.BaseSalary + e.Allowance));
    }

    /// <summary>Accent-insensitive search, so "nguyen" finds "Nguyễn".</summary>
    private static bool Contains(string? source, string query) =>
        !string.IsNullOrEmpty(source) && Fold(source).Contains(Fold(query), StringComparison.OrdinalIgnoreCase);

    private static string Fold(string s)
    {
        var normalized = s.Replace('đ', 'd').Replace('Đ', 'D').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString();
    }

    [RelayCommand]
    private async Task Add()
    {
        var editor = new EmployeeEditorViewModel(service, await departments.ListAsync(), new Employee
        {
            Code = await employees.NextCodeAsync(),
            HireDate = DateOnly.FromDateTime(DateTime.Today),
            BaseSalary = 6_000_000,
            AnnualLeaveDays = 12,
        });
        if (Dialogs.ShowEditor(editor)) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Edit(Employee? employee)
    {
        employee ??= Selected;
        if (employee is null) return;
        var fresh = await employees.GetAsync(employee.Id);
        if (fresh is null) return;
        var editor = new EmployeeEditorViewModel(service, await departments.ListAsync(), fresh);
        if (Dialogs.ShowEditor(editor)) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Delete(Employee? employee)
    {
        if (employee is null) return;
        var open = (await tasks.ListAsync(employee.Id)).Count(t => t.IsOpen);
        var message = open > 0
            ? $"{employee.FullName} còn {open} công việc đang làm. Xoá hồ sơ sẽ xoá luôn công việc, chấm công và phiếu lương của nhân viên này.\n\nNếu nhân viên chỉ nghỉ việc, hãy đổi trạng thái sang \"Đã nghỉ việc\" để giữ lịch sử."
            : $"Xoá hồ sơ {employee.FullName} ({employee.Code})? Chấm công và phiếu lương của nhân viên cũng bị xoá. Thao tác này không hoàn tác được.";
        if (!Dialogs.Confirm("Xoá nhân viên", message, "Xoá hồ sơ", danger: true)) return;
        await RunAsync(async () =>
        {
            await employees.DeleteAsync(employee.Id);
            await LoadAsync();
        });
    }

    [RelayCommand]
    private async Task ResetPassword(Employee? employee)
    {
        if (employee is null) return;
        var fresh = await employees.GetAsync(employee.Id);
        if (fresh is null) return;
        if (string.IsNullOrEmpty(fresh.Username))
        {
            Dialogs.Info("Chưa có tài khoản", "Nhân viên này chưa có tên đăng nhập. Mở \"Sửa hồ sơ\" để tạo tài khoản ứng dụng nhận việc.");
            return;
        }
        if (!Dialogs.Confirm("Đặt lại mật khẩu", $"Đặt lại mật khẩu ứng dụng điện thoại của {fresh.FullName} về \"{EmployeeService.DefaultMobilePassword}\"?")) return;
        if (await RunAsync(() => service.SaveAsync(fresh, EmployeeService.DefaultMobilePassword)))
            Dialogs.Info("Đã đặt lại", $"Tài khoản: {fresh.Username}\nMật khẩu mới: {EmployeeService.DefaultMobilePassword}\n\nNhắc nhân viên đổi mật khẩu sau khi đăng nhập.");
    }

    [RelayCommand]
    private void Export()
    {
        var path = Dialogs.SaveFile($"nhan-vien-{DateTime.Today:yyyyMMdd}.csv", "CSV (*.csv)|*.csv");
        if (path is null) return;
        CsvExporter.Write(path,
            ["Mã", "Họ tên", "Giới tính", "Ngày sinh", "Điện thoại", "Email", "Tổ / phòng ban", "Chức vụ", "Ngày vào làm", "Hợp đồng", "Hình thức lương", "Lương cơ bản", "Phụ cấp", "Trạng thái", "Tài khoản"],
            Items.Select(e => new object?[]
            {
                e.Code, e.FullName, Labels.Of(e.Gender), e.DateOfBirth?.ToString("dd/MM/yyyy"), e.Phone, e.Email, e.Department?.Name, e.Position,
                e.HireDate.ToString("dd/MM/yyyy"), Labels.Of(e.ContractType), Labels.Of(e.SalaryType), e.BaseSalary, e.Allowance, Labels.Of(e.Status), e.Username,
            }));
        Dialogs.Info("Đã xuất file", path);
    }
}

public sealed partial class EmployeeEditorViewModel : EditorViewModel
{
    private readonly EmployeeService _service;
    private readonly Employee _employee;

    public EmployeeEditorViewModel(EmployeeService service, IReadOnlyList<Department> departments, Employee employee)
    {
        _service = service;
        _employee = employee;
        Departments = [new Option<int?>(null, "Chưa phân tổ"), .. departments.Select(d => new Option<int?>(d.Id, d.Name))];
        Code = employee.Code;
        FullName = employee.FullName;
        Gender = Genders.First(g => g.Value == employee.Gender);
        DateOfBirth = employee.DateOfBirth?.ToDateTime(TimeOnly.MinValue);
        Phone = employee.Phone;
        Email = employee.Email;
        Address = employee.Address;
        IdentityNumber = employee.IdentityNumber;
        Department = Departments.FirstOrDefault(d => d.Value == employee.DepartmentId) ?? Departments[0];
        Position = employee.Position;
        HireDate = employee.HireDate.ToDateTime(TimeOnly.MinValue);
        Contract = Contracts.First(c => c.Value == employee.ContractType);
        SalaryType = SalaryTypes.First(s => s.Value == employee.SalaryType);
        BaseSalary = Money(employee.BaseSalary);
        Allowance = Money(employee.Allowance);
        BankName = employee.BankName;
        BankAccount = employee.BankAccount;
        Status = Statuses.First(s => s.Value == employee.Status);
        AnnualLeaveDays = employee.AnnualLeaveDays.ToString();
        Note = employee.Note;
        Username = employee.Username ?? (employee.Id == 0 ? employee.Code.ToLowerInvariant() : null);
        HasPassword = !string.IsNullOrEmpty(employee.PasswordHash);
    }

    public override string Title => _employee.Id == 0 ? "Thêm nhân viên" : $"Hồ sơ {_employee.FullName}";
    public override double Width => 760;
    public bool IsNew => _employee.Id == 0;

    public IReadOnlyList<Option<int?>> Departments { get; }
    public IReadOnlyList<Option<Gender>> Genders { get; } = Options.Of<Gender>();
    public IReadOnlyList<Option<ContractType>> Contracts { get; } = Options.Of<ContractType>();
    public IReadOnlyList<Option<SalaryType>> SalaryTypes { get; } = Options.Of<SalaryType>();
    public IReadOnlyList<Option<EmployeeStatus>> Statuses { get; } = Options.Of<EmployeeStatus>();

    [ObservableProperty] private string _code;
    [ObservableProperty] private string _fullName;
    [ObservableProperty] private Option<Gender> _gender;
    [ObservableProperty] private DateTime? _dateOfBirth;
    [ObservableProperty] private string? _phone;
    [ObservableProperty] private string? _email;
    [ObservableProperty] private string? _address;
    [ObservableProperty] private string? _identityNumber;
    [ObservableProperty] private Option<int?> _department;
    [ObservableProperty] private string _position;
    [ObservableProperty] private DateTime _hireDate;
    [ObservableProperty] private Option<ContractType> _contract;
    [ObservableProperty] private Option<SalaryType> _salaryType;
    [ObservableProperty] private string _baseSalary;
    [ObservableProperty] private string _allowance;
    [ObservableProperty] private string? _bankName;
    [ObservableProperty] private string? _bankAccount;
    [ObservableProperty] private Option<EmployeeStatus> _status;
    [ObservableProperty] private string _annualLeaveDays;
    [ObservableProperty] private string? _note;
    [ObservableProperty] private string? _username;
    [ObservableProperty] private string? _newPassword;
    [ObservableProperty] private bool _hasPassword;

    public string SalaryHint => SalaryType.Value == Core.Domain.SalaryType.Daily ? "Đơn giá một ngày công (₫)" : "Lương tháng theo hợp đồng (₫)";
    partial void OnSalaryTypeChanged(Option<SalaryType> value) => OnPropertyChanged(nameof(SalaryHint));

    public string PasswordHint => HasPassword
        ? "Để trống nếu giữ mật khẩu hiện tại."
        : $"Để trống sẽ dùng mật khẩu mặc định {EmployeeService.DefaultMobilePassword}.";

    protected override async Task SaveCoreAsync()
    {
        if (!int.TryParse(AnnualLeaveDays, out var leaveDays)) throw new DomainException("Số ngày phép năm phải là số nguyên.");
        _employee.Code = Code;
        _employee.FullName = FullName;
        _employee.Gender = Gender.Value;
        _employee.DateOfBirth = DateOfBirth is null ? null : DateOnly.FromDateTime(DateOfBirth.Value);
        _employee.Phone = Clean(Phone);
        _employee.Email = Clean(Email);
        _employee.Address = Clean(Address);
        _employee.IdentityNumber = Clean(IdentityNumber);
        _employee.DepartmentId = Department.Value;
        _employee.Position = Position?.Trim() ?? string.Empty;
        _employee.HireDate = DateOnly.FromDateTime(HireDate);
        _employee.ContractType = Contract.Value;
        _employee.SalaryType = SalaryType.Value;
        _employee.BaseSalary = ParseMoney(BaseSalary, "Lương cơ bản");
        _employee.Allowance = ParseMoney(Allowance, "Phụ cấp");
        _employee.BankName = Clean(BankName);
        _employee.BankAccount = Clean(BankAccount);
        _employee.Status = Status.Value;
        _employee.AnnualLeaveDays = leaveDays;
        _employee.Note = Clean(Note);
        _employee.Username = Clean(Username);
        _employee.Department = null;
        await _service.SaveAsync(_employee, NewPassword);
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}

public sealed partial class DepartmentsViewModel(IDialogService dialogs, IDepartmentRepository departments, IEmployeeRepository employees) : PageViewModel(dialogs)
{
    public override string Title => "Tổ / Phòng ban";
    public override string Subtitle => "Chia nhân viên theo tổ sản xuất để giao việc và theo dõi.";

    public ObservableCollection<DepartmentRow> Items { get; } = [];

    public override async Task LoadAsync()
    {
        var staff = await employees.ListAsync();
        Items.Clear();
        foreach (var d in await departments.ListAsync())
            Items.Add(new DepartmentRow(d, staff.Count(e => e.DepartmentId == d.Id && e.IsActive)));
    }

    [RelayCommand]
    private async Task Add()
    {
        if (Dialogs.ShowEditor(new DepartmentEditorViewModel(departments, new Department()))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Edit(DepartmentRow? row)
    {
        if (row is null) return;
        if (Dialogs.ShowEditor(new DepartmentEditorViewModel(departments, row.Department))) await RunAsync(LoadAsync);
    }

    [RelayCommand]
    private async Task Delete(DepartmentRow? row)
    {
        if (row is null) return;
        var count = await departments.CountEmployeesAsync(row.Department.Id);
        var message = count > 0
            ? $"Tổ \"{row.Department.Name}\" đang có {count} nhân viên. Các nhân viên này sẽ chuyển sang \"Chưa phân tổ\"."
            : $"Xoá tổ \"{row.Department.Name}\"?";
        if (!Dialogs.Confirm("Xoá tổ / phòng ban", message, "Xoá", danger: true)) return;
        await RunAsync(async () =>
        {
            await departments.DeleteAsync(row.Department.Id);
            await LoadAsync();
        });
    }
}

public sealed record DepartmentRow(Department Department, int EmployeeCount);

public sealed partial class DepartmentEditorViewModel : EditorViewModel
{
    private readonly IDepartmentRepository _repo;
    private readonly Department _department;

    public DepartmentEditorViewModel(IDepartmentRepository repo, Department department)
    {
        _repo = repo;
        _department = department;
        Name = department.Name;
        Description = department.Description;
        ManagerName = department.ManagerName;
    }

    public override string Title => _department.Id == 0 ? "Thêm tổ / phòng ban" : "Sửa tổ / phòng ban";
    public override double Width => 520;

    [ObservableProperty] private string _name;
    [ObservableProperty] private string? _description;
    [ObservableProperty] private string? _managerName;

    protected override async Task SaveCoreAsync()
    {
        if (string.IsNullOrWhiteSpace(Name)) throw new DomainException("Vui lòng nhập tên tổ / phòng ban.");
        var existing = await _repo.ListAsync();
        if (existing.Any(d => d.Id != _department.Id && string.Equals(d.Name, Name.Trim(), StringComparison.OrdinalIgnoreCase)))
            throw new DomainException("Tên tổ / phòng ban đã tồn tại.");
        _department.Name = Name.Trim();
        _department.Description = string.IsNullOrWhiteSpace(Description) ? null : Description.Trim();
        _department.ManagerName = string.IsNullOrWhiteSpace(ManagerName) ? null : ManagerName.Trim();
        await _repo.SaveAsync(_department);
    }
}
