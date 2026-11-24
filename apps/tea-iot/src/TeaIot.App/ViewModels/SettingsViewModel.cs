// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using System.Globalization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaIot.App.Services;
using TeaIot.Core;

namespace TeaIot.App.ViewModels;

public sealed partial class StationRow : ObservableObject
{
    [ObservableProperty] private string _parcelCode = string.Empty;
    [ObservableProperty] private string _name = string.Empty;
    [ObservableProperty] private string _dryThreshold = "35";
    [ObservableProperty] private bool _enabled = true;
}

/// <summary>Edits a copy of the configuration; <see cref="Result"/> is set only when every field is valid.</summary>
public sealed partial class SettingsViewModel : ObservableObject
{
    public SettingsViewModel(IotConfig c)
    {
        HtxCode = c.HtxCode;
        HtxName = c.HtxName;
        BrokerHost = c.BrokerHost;
        BrokerPort = c.BrokerPort.ToString(CultureInfo.InvariantCulture);
        BrokerPassword = c.BrokerPassword;
        Interval = c.IntervalSeconds.ToString(CultureInfo.InvariantCulture);
        SimMinutes = c.SimulatedMinutesPerRound.ToString(CultureInfo.InvariantCulture);
        StaffApiUrl = c.StaffApiUrl;
        StaffDeviceKey = c.StaffDeviceKey;
        foreach (var s in c.Stations)
            Stations.Add(new StationRow { ParcelCode = s.ParcelCode, Name = s.Name, DryThreshold = s.DryThreshold.ToString(CultureInfo.InvariantCulture), Enabled = s.Enabled });
    }

    public IotConfig? Result { get; private set; }
    public event EventHandler<bool>? CloseRequested;

    public ObservableCollection<StationRow> Stations { get; } = [];

    [ObservableProperty] private string _htxCode;
    [ObservableProperty] private string _htxName;
    [ObservableProperty] private string _brokerHost;
    [ObservableProperty] private string _brokerPort;
    [ObservableProperty] private string _brokerPassword;
    [ObservableProperty] private string _interval;
    [ObservableProperty] private string _simMinutes;
    [ObservableProperty] private string _staffApiUrl;
    [ObservableProperty] private string _staffDeviceKey;
    [ObservableProperty] private string? _error;
    [ObservableProperty] private StationRow? _selectedStation;

    [RelayCommand]
    private void AddStation()
    {
        var row = new StationRow { ParcelCode = $"{HtxCode}-", Name = "Đồi mới" };
        Stations.Add(row);
        SelectedStation = row;
    }

    [RelayCommand]
    private void RemoveStation(StationRow? row)
    {
        if (row is not null) Stations.Remove(row);
    }

    [RelayCommand]
    private void Save()
    {
        Error = null;
        var code = HtxCode.Trim();
        if (!Codes.IsValidHtx(code)) { Error = "Mã HTX chỉ gồm chữ, số, '-' hoặc '_' (tối đa 20 ký tự)."; return; }
        if (string.IsNullOrWhiteSpace(BrokerHost)) { Error = "Nhập địa chỉ broker MQTT."; return; }
        if (!int.TryParse(BrokerPort, out var port) || port is < 1 or > 65535) { Error = "Cổng MQTT phải từ 1 đến 65535."; return; }
        if (!int.TryParse(Interval, out var interval) || interval is < 2 or > 600) { Error = "Chu kỳ đo phải từ 2 đến 600 giây."; return; }
        if (!double.TryParse(SimMinutes, NumberStyles.Number, CultureInfo.InvariantCulture, out var sim) || sim is < 1 or > 240) { Error = "Phút mô phỏng mỗi lần đo phải từ 1 đến 240."; return; }
        if (!string.IsNullOrWhiteSpace(StaffApiUrl) && !Uri.TryCreate(StaffApiUrl.Trim(), UriKind.Absolute, out _)) { Error = "Địa chỉ Tea Staff Manager không hợp lệ."; return; }

        var stations = new List<StationConfig>();
        foreach (var s in Stations)
        {
            var parcel = s.ParcelCode.Trim();
            if (!Codes.IsValidParcel(parcel)) { Error = $"Mã thửa \"{parcel}\" không hợp lệ (không chứa '/', '+', '#')."; return; }
            if (stations.Any(x => x.ParcelCode == parcel)) { Error = $"Mã thửa \"{parcel}\" bị trùng."; return; }
            if (!double.TryParse(s.DryThreshold, NumberStyles.Number, CultureInfo.InvariantCulture, out var dry) || dry is < 5 or > 90) { Error = $"Ngưỡng đất khô của {parcel} phải từ 5 đến 90%."; return; }
            stations.Add(new StationConfig { ParcelCode = parcel, Name = s.Name.Trim(), DryThreshold = dry, Enabled = s.Enabled });
        }
        if (stations.Count == 0) { Error = "Cần ít nhất một trạm đo."; return; }

        Result = new IotConfig
        {
            HtxCode = code, HtxName = HtxName.Trim(), BrokerHost = BrokerHost.Trim(), BrokerPort = port, BrokerPassword = BrokerPassword,
            IntervalSeconds = interval, SimulatedMinutesPerRound = sim, StaffApiUrl = StaffApiUrl.Trim(), StaffDeviceKey = StaffDeviceKey.Trim(), Stations = stations,
        };
        CloseRequested?.Invoke(this, true);
    }

    [RelayCommand]
    private void Cancel() => CloseRequested?.Invoke(this, false);
}
