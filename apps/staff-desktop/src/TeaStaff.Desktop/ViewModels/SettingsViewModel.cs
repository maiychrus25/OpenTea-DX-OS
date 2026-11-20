// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Diagnostics;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Services;
using TeaStaff.Infrastructure;
using TeaStaff.Infrastructure.MobileApi;

namespace TeaStaff.Desktop.ViewModels;

public sealed partial class SettingsViewModel(IDialogService dialogs, AppConfig config, PolicyService policies, MobileApiServer api,
    IOwnerAccountRepository owners, IPasswordHasher hasher, ITenantContext tenant, Infrastructure.Diagnostics.ConnectionChecker checker) : PageViewModel(dialogs)
{
    [CommunityToolkit.Mvvm.Input.RelayCommand]
    private async Task TestPhone()
    {
        var r = await checker.CheckPhoneApiAsync(api.IsRunning);
        if (r.Ok) Dialogs.Info("Kiểm tra kết nối điện thoại", r.Message);
        else Dialogs.Error(r.Message);
    }

    [CommunityToolkit.Mvvm.Input.RelayCommand]
    private void AllowFirewall()
    {
        var r = checker.AllowThroughFirewall();
        if (r.Ok) Dialogs.Info("Tường lửa Windows", r.Message);
        else Dialogs.Error(r.Message);
    }

    [CommunityToolkit.Mvvm.Input.RelayCommand]
    private async Task TestCore()
    {
        IsBusy = true;
        try
        {
            var r = await checker.CheckCoreAsync(KeycloakUrl, KeycloakRealm, PostgresConnection);
            if (r.Ok) Dialogs.Info("Kết nối lõi OpenTea DX-OS", r.Message);
            else Dialogs.Error(r.Message);
        }
        finally { IsBusy = false; }
    }

    public override string Title => "Cài đặt";
    public override string Subtitle => "Thông tin HTX, quy tắc tính lương, máy chủ cho điện thoại và kết nối lõi OpenTea DX-OS.";

    public event EventHandler? ApiChanged;

    public IReadOnlyList<Option<AuthMode>> AuthModes { get; } =
        [new(AuthMode.Local, "Tài khoản trên máy (offline)"), new(AuthMode.Keycloak, "Tài khoản chung OpenTea DX-OS (Keycloak)")];
    public IReadOnlyList<Option<DatabaseProvider>> Providers { get; } =
        [new(DatabaseProvider.Sqlite, "SQLite trên máy này"), new(DatabaseProvider.Postgres, "PostgreSQL của DX-OS (schema app_staff_work)")];

    [ObservableProperty] private string _htxCode = string.Empty;
    [ObservableProperty] private string _htxName = string.Empty;
    [ObservableProperty] private string _standardDays = string.Empty;
    [ObservableProperty] private string _insuranceRate = string.Empty;
    [ObservableProperty] private string _overtimeMultiplier = string.Empty;
    [ObservableProperty] private bool _apiEnabled;
    [ObservableProperty] private string _apiPort = string.Empty;
    [ObservableProperty] private string _apiAddresses = string.Empty;
    [ObservableProperty] private Option<AuthMode>? _selectedAuthMode;
    [ObservableProperty] private string _keycloakUrl = string.Empty;
    [ObservableProperty] private string _keycloakRealm = string.Empty;
    [ObservableProperty] private string _keycloakClient = string.Empty;
    [ObservableProperty] private Option<DatabaseProvider>? _selectedProvider;
    [ObservableProperty] private string _postgresConnection = string.Empty;
    [ObservableProperty] private string _dataFolder = AppConfig.DataFolder;
    [ObservableProperty] private string _version = "1.0.0";

    public bool IsLocalOwner => config.AuthMode == Infrastructure.AuthMode.Local;

    public override async Task LoadAsync()
    {
        HtxCode = config.HtxCode;
        HtxName = config.HtxName;
        var p = await policies.GetAsync();
        StandardDays = p.StandardWorkDays.ToString("0.#", CultureInfo.InvariantCulture);
        InsuranceRate = (p.InsuranceRate * 100).ToString("0.##", CultureInfo.InvariantCulture);
        OvertimeMultiplier = p.OvertimeMultiplier.ToString("0.##", CultureInfo.InvariantCulture);
        ApiEnabled = config.MobileApi.Enabled;
        ApiPort = config.MobileApi.Port.ToString();
        UpdateAddresses();
        SelectedAuthMode = AuthModes.First(a => a.Value == config.AuthMode);
        KeycloakUrl = config.Keycloak.BaseUrl;
        KeycloakRealm = config.Keycloak.Realm;
        KeycloakClient = config.Keycloak.ClientId;
        SelectedProvider = Providers.First(x => x.Value == config.Database.Provider);
        PostgresConnection = config.Database.PostgresConnection;
        Version = typeof(SettingsViewModel).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";
    }

    private void UpdateAddresses()
    {
        var ips = MobileApiServer.LocalAddresses();
        ApiAddresses = api.IsRunning
            ? string.Join("   ", ips.Select(ip => $"http://{ip}:{api.Port}")) + (ips.Count == 0 ? $"http://127.0.0.1:{api.Port}" : "")
            : api.LastError ?? "Máy chủ đang tắt";
    }

    [RelayCommand]
    private async Task SavePayroll()
    {
        if (!decimal.TryParse(StandardDays, NumberStyles.Number, CultureInfo.InvariantCulture, out var days) ||
            !decimal.TryParse(InsuranceRate, NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) ||
            !decimal.TryParse(OvertimeMultiplier, NumberStyles.Number, CultureInfo.InvariantCulture, out var ot))
        {
            Dialogs.Error("Các ô quy tắc lương phải là số (dùng dấu chấm cho phần thập phân).");
            return;
        }
        if (await RunAsync(() => policies.SaveAsync(new PayrollPolicy(days, rate / 100m, ot))))
            Dialogs.Info("Đã lưu", "Quy tắc mới áp dụng khi bấm \"Tính lương\" ở Bảng lương.");
    }

    [RelayCommand]
    private void SaveHtx()
    {
        var code = HtxCode.Trim().ToUpperInvariant();
        if (code.Length is < 1 or > 20 || !code.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-'))
        {
            Dialogs.Error("Mã HTX gồm 1–20 ký tự chữ không dấu, số, gạch ngang (ví dụ TC). Mã phải trùng claim htx_code của tài khoản DX-OS.");
            return;
        }
        if (string.IsNullOrWhiteSpace(HtxName)) { Dialogs.Error("Vui lòng nhập tên HTX."); return; }
        var codeChanged = code != config.HtxCode;
        if (codeChanged && !Dialogs.Confirm("Đổi mã HTX",
                "Dữ liệu được tách theo mã HTX. Sau khi đổi mã và khởi động lại, ứng dụng chỉ hiện dữ liệu của mã mới (dữ liệu mã cũ vẫn được giữ). Tiếp tục?"))
            return;
        config.HtxCode = code;
        config.HtxName = HtxName.Trim();
        config.Save();
        Dialogs.Info("Đã lưu", codeChanged ? "Khởi động lại ứng dụng để dùng mã HTX mới." : "Đã cập nhật tên HTX.");
    }

    [RelayCommand]
    private async Task SaveApi()
    {
        if (!int.TryParse(ApiPort, out var port) || port is < 1024 or > 65535)
        {
            Dialogs.Error("Cổng phải là số từ 1024 đến 65535.");
            return;
        }
        config.MobileApi.Enabled = ApiEnabled;
        config.MobileApi.Port = port;
        config.Save();
        await api.StopAsync();
        if (ApiEnabled && !await api.StartAsync()) Dialogs.Error(api.LastError ?? "Không khởi động được máy chủ.");
        UpdateAddresses();
        ApiChanged?.Invoke(this, EventArgs.Empty);
    }

    [RelayCommand]
    private void SaveCore()
    {
        if (SelectedAuthMode is null || SelectedProvider is null) return;
        if (!Uri.TryCreate(KeycloakUrl, UriKind.Absolute, out _)) { Dialogs.Error("Địa chỉ Keycloak không hợp lệ, ví dụ http://localhost:8080."); return; }
        config.AuthMode = SelectedAuthMode.Value;
        config.Keycloak.BaseUrl = KeycloakUrl.Trim();
        config.Keycloak.Realm = KeycloakRealm.Trim();
        config.Keycloak.ClientId = KeycloakClient.Trim();
        config.Database.Provider = SelectedProvider.Value;
        config.Database.PostgresConnection = PostgresConnection.Trim();
        config.Save();
        Dialogs.Info("Đã lưu", "Cấu hình kết nối được áp dụng ở lần mở ứng dụng tiếp theo.\n\nXem docs/core-integration.md để tạo role app_staff_work và client Keycloak trên lõi.");
    }

    [RelayCommand]
    private async Task ChangePassword()
    {
        var current = Dialogs.Prompt("Đổi mật khẩu", "Mật khẩu hiện tại:", required: true);
        if (current is null) return;
        var owner = await owners.FindAsync(tenant.UserName);
        if (owner is null || !hasher.Verify(current, owner.PasswordHash)) { Dialogs.Error("Mật khẩu hiện tại không đúng."); return; }
        var next = Dialogs.Prompt("Đổi mật khẩu", "Mật khẩu mới (ít nhất 8 ký tự):", required: true);
        if (next is null) return;
        if (next.Length < 8) { Dialogs.Error("Mật khẩu mới cần ít nhất 8 ký tự."); return; }
        owner.PasswordHash = hasher.Hash(next);
        await owners.SaveAsync(owner);
        Dialogs.Info("Đã đổi mật khẩu", "Dùng mật khẩu mới ở lần đăng nhập sau.");
    }

    [RelayCommand]
    private void OpenDataFolder() => Process.Start(new ProcessStartInfo("explorer.exe", AppConfig.DataFolder) { UseShellExecute = true });
}
