// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TeaIot.App.Services;
using TeaIot.Core;

namespace TeaIot.App.ViewModels;

public sealed record FeedItem(string Time, string Title, string Detail, string Tone);

/// <summary>
/// The station console: simulates every parcel, publishes readings to the DX-OS broker
/// through a store-and-forward outbox, raises alerts and forwards them to Tea Staff Manager.
/// </summary>
public sealed partial class MainViewModel : ObservableObject, IAsyncDisposable
{
    private readonly MqttSink _sink = new();
    private readonly Outbox _outbox;
    private readonly AlertThrottle _throttle = new();
    private readonly DispatcherTimer _timer = new();
    private StaffAlertClient _staff;
    private DateTime _simClock;
    private bool _ticking;

    public MainViewModel()
    {
        Config = IotConfig.Load();
        _outbox = new Outbox(_sink);
        _staff = new StaffAlertClient(Config);
        _simClock = DateTime.Now;
        BuildStations();
        _sink.StateChanged += (_, _) => Application.Current?.Dispatcher.BeginInvoke(UpdateConnection);
        _timer.Tick += async (_, _) => await TickAsync();
        ApplyInterval();
        _timer.Start();
        UpdateConnection();
    }

    public IotConfig Config { get; private set; }
    public string HtxName => Config.HtxName;
    public string BrokerText => $"{Config.BrokerHost}:{Config.BrokerPort} · tài khoản {Config.HtxCode}";

    public ObservableCollection<StationViewModel> Stations { get; } = [];
    public ObservableCollection<FeedItem> Alerts { get; } = [];
    public ObservableCollection<FeedItem> Log { get; } = [];

    [ObservableProperty] private StationViewModel? _selected;
    partial void OnSelectedChanged(StationViewModel? oldValue, StationViewModel? newValue)
    {
        if (oldValue is not null) oldValue.IsSelected = false;
        if (newValue is not null) newValue.IsSelected = true;
    }

    [ObservableProperty] private bool _isConnected;
    [ObservableProperty] private bool _isConnecting;
    [ObservableProperty] private bool _isRunning = true;
    [ObservableProperty] private string _connectionText = "Chưa kết nối";
    [ObservableProperty] private string? _connectionError;
    [ObservableProperty] private long _sent;
    [ObservableProperty] private int _pending;
    [ObservableProperty] private int _rejectedLocally;
    [ObservableProperty] private string _simTime = string.Empty;
    [ObservableProperty] private bool _forwardAlerts = true;

    private void BuildStations()
    {
        Stations.Clear();
        var seed = 11;
        foreach (var s in Config.Stations.Where(s => s.Enabled && Codes.IsValidParcel(s.ParcelCode)))
            Stations.Add(new StationViewModel(s, seed++));
        // Give the demo some variety: one hill already dry, one under rain.
        if (Stations.Count >= 4)
        {
            Stations[3].Scenario = StationViewModel.Scenarios.First(o => o.Value == Scenario.HeatDrought);
            Stations[3].Model.Step(_simClock, 0);
        }
        Selected = Stations.FirstOrDefault();
        // Warm up a few simulated hours so charts are not empty on start.
        for (var i = 0; i < 24; i++)
        {
            _simClock = _simClock.AddMinutes(Config.SimulatedMinutesPerRound);
            foreach (var st in Stations) st.Tick(_simClock, Config.SimulatedMinutesPerRound);
        }
        SimTime = _simClock.ToString("HH:mm dd/MM");
    }

    private void ApplyInterval() => _timer.Interval = TimeSpan.FromSeconds(Math.Clamp(Config.IntervalSeconds, 2, 600));

    private void UpdateConnection()
    {
        IsConnected = _sink.IsConnected;
        ConnectionText = IsConnected ? "Đã kết nối lõi DX-OS" : IsConnecting ? "Đang kết nối…" : "Chưa kết nối";
        ConnectionError = _sink.LastError;
    }

    [RelayCommand]
    private async Task Connect()
    {
        if (IsConnected)
        {
            await _sink.DisconnectAsync();
            AddLog("MQTT", "Đã ngắt kết nối. Số đo được giữ lại trong hàng đợi.", "warn");
            UpdateConnection();
            return;
        }
        if (!Codes.IsValidHtx(Config.HtxCode))
        {
            ConnectionError = "Mã HTX không hợp lệ.";
            return;
        }
        IsConnecting = true;
        UpdateConnection();
        var ok = await _sink.ConnectAsync(Config);
        IsConnecting = false;
        UpdateConnection();
        AddLog("MQTT", ok ? $"Đã kết nối {Config.BrokerHost}:{Config.BrokerPort} bằng tài khoản thiết bị {Config.HtxCode}." : _sink.LastError ?? "Không kết nối được.", ok ? "ok" : "danger");
        if (ok) await FlushAsync();
    }

    [RelayCommand]
    private void ToggleRun()
    {
        IsRunning = !IsRunning;
        AddLog("Mô phỏng", IsRunning ? "Tiếp tục đo." : "Tạm dừng đo.", "ok");
    }

    [RelayCommand]
    private void Select(StationViewModel? station)
    {
        if (station is not null) Selected = station;
    }

    [RelayCommand]
    private void Irrigate(StationViewModel? station)
    {
        station ??= Selected;
        if (station is null) return;
        station.Model.Irrigate();
        AddLog("Tưới", $"Đã chạy bơm tưới ở {station.Name}, độ ẩm đất tăng.", "ok");
    }

    [RelayCommand]
    private Task Step() => TickAsync(force: true);

    [RelayCommand]
    private async Task OpenSettings()
    {
        var vm = new SettingsViewModel(Config);
        var window = new Views.SettingsWindow { DataContext = vm, Owner = Application.Current.MainWindow };
        if (window.ShowDialog() != true) return;
        var reconnect = IsConnected;
        if (reconnect) await _sink.DisconnectAsync();
        Config = vm.Result!;
        Config.Save();
        _staff = new StaffAlertClient(Config);
        _throttle.Reset();
        ApplyInterval();
        BuildStations();
        OnPropertyChanged(nameof(BrokerText));
        OnPropertyChanged(nameof(HtxName));
        AddLog("Cài đặt", "Đã lưu cài đặt trạm.", "ok");
        if (reconnect) await Connect();
        UpdateConnection();
    }

    private async Task TickAsync(bool force = false)
    {
        if (_ticking || (!IsRunning && !force)) return;
        _ticking = true;
        try
        {
            _simClock = _simClock.AddMinutes(Config.SimulatedMinutesPerRound);
            SimTime = _simClock.ToString("HH:mm dd/MM");
            var now = DateTimeOffset.Now;
            var batch = new List<Reading>();
            foreach (var st in Stations)
            {
                st.Tick(_simClock, Config.SimulatedMinutesPerRound);
                foreach (var (sensor, value) in st.Snapshot)
                {
                    if (!Sensors.InRange(sensor, value)) RejectedLocally++;
                    // Out-of-range values are still sent: the core must reject them itself (telemetry.ingest_rejects).
                    batch.Add(new Reading(Config.HtxCode, st.ParcelCode, sensor, now, value));
                }
                var values = st.Snapshot.ToDictionary(s => s.Sensor, s => s.Value);
                var active = AlertRules.Evaluate(st.Config, values, DateTime.Now).ToList();
                st.SetStatus(active);
                foreach (var alert in active.Where(_throttle.ShouldRaise)) await RaiseAsync(alert);
            }
            _outbox.Enqueue(batch);
            await FlushAsync();
        }
        finally
        {
            _ticking = false;
        }
    }

    private async Task FlushAsync()
    {
        var before = _outbox.Sent;
        await _outbox.FlushAsync(2000);
        Sent = _outbox.Sent;
        Pending = _outbox.Pending;
        var delta = _outbox.Sent - before;
        if (delta > 0) AddLog("MQTT", $"Đã gửi {delta} số đo vào lõi (QoS 1).", "ok");
        else if (Pending > 0 && !IsConnected) ConnectionError ??= $"Đang giữ {Pending} số đo, sẽ gửi khi kết nối lại.";
        UpdateConnection();
    }

    private async Task RaiseAsync(Alert alert)
    {
        var tone = alert.Level switch { AlertLevel.Danger => "danger", AlertLevel.Warning => "warn", _ => "ok" };
        var detail = alert.Evidence + (alert.SuggestedTask is null ? string.Empty : $" · Gợi ý: {alert.SuggestedTask}");
        Alerts.Insert(0, new FeedItem(alert.At.ToString("HH:mm"), alert.Message, detail, tone));
        while (Alerts.Count > 50) Alerts.RemoveAt(Alerts.Count - 1);
        if (!ForwardAlerts || alert.SuggestedTask is null) return;
        var (ok, message) = await _staff.SendAsync(alert);
        AddLog("Tea Staff Manager", ok ? $"{message}: {alert.SuggestedTask}" : message, ok ? "ok" : "warn");
    }

    private void AddLog(string source, string text, string tone)
    {
        Log.Insert(0, new FeedItem(DateTime.Now.ToString("HH:mm:ss"), source, text, tone));
        while (Log.Count > 80) Log.RemoveAt(Log.Count - 1);
    }

    public async ValueTask DisposeAsync()
    {
        _timer.Stop();
        await _sink.DisposeAsync();
    }
}
