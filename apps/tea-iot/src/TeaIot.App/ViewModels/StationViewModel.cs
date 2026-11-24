// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.ObjectModel;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using TeaIot.App.Controls;
using TeaIot.Core;

namespace TeaIot.App.ViewModels;

public sealed partial class SensorValue(SensorInfo info) : ObservableObject
{
    public SensorInfo Info { get; } = info;
    public string Name => Info.Name;
    public string Unit => Info.Unit;
    public string Glyph => Info.Glyph;
    [ObservableProperty] private string _text = "—";
    [ObservableProperty] private bool _warning;
}

public sealed record ScenarioOption(Scenario Value, string Label)
{
    public override string ToString() => Label;
}

/// <summary>One parcel station: its model, live values, short history for the chart and status.</summary>
public sealed partial class StationViewModel : ObservableObject
{
    public const int HistoryLength = 72;
    private static readonly Brush SoilBrush = ChartBase.Palette[0];
    private static readonly Brush AirBrush = ChartBase.Palette[2];
    private static readonly Brush HumidityBrush = ChartBase.Palette[1];

    private readonly List<double> _soil = [], _air = [], _humidity = [];
    private readonly List<string> _labels = [];

    public StationViewModel(StationConfig config, int seed)
    {
        Model = new StationModel(config, seed);
        Values = new ObservableCollection<SensorValue>(Sensors.All.Select(s => new SensorValue(s)));
        _scenario = Scenarios[0];
    }

    public StationModel Model { get; }
    public StationConfig Config => Model.Config;
    public string ParcelCode => Config.ParcelCode;
    public string Name => string.IsNullOrWhiteSpace(Config.Name) ? Config.ParcelCode : Config.Name;
    public double DryThreshold => Config.DryThreshold;
    public ObservableCollection<SensorValue> Values { get; }

    public IReadOnlyList<ScenarioOption> ScenarioOptions => Scenarios;
    public static IReadOnlyList<ScenarioOption> Scenarios { get; } = Enum.GetValues<Scenario>().Select(s => new ScenarioOption(s, ScenarioLabels.Of(s))).ToList();

    [ObservableProperty] private ScenarioOption _scenario;
    partial void OnScenarioChanged(ScenarioOption value) => Model.Scenario = value.Value;

    [ObservableProperty] private bool _isSelected;
    [ObservableProperty] private string _status = "Bình thường";

    /// <summary>"ok", "warn" or "danger"; drives the colour of the card.</summary>
    [ObservableProperty] private string _tone = "ok";
    [ObservableProperty] private string _soilText = "—";

    public IReadOnlyList<ChartSeries> Series { get; private set; } = [];
    public IReadOnlyList<string> Labels { get; private set; } = [];

    public IReadOnlyList<(SensorKind Sensor, double Value)> Snapshot { get; private set; } = [];

    /// <summary>Advances the model and records the values that will be published.</summary>
    public void Tick(DateTime simulatedClock, double minutes)
    {
        Model.Step(simulatedClock, minutes);
        Snapshot = Model.Readings().ToList();
        foreach (var (sensor, value) in Snapshot)
        {
            var row = Values.First(v => v.Info.Kind == sensor);
            row.Text = value.ToString("0.#");
            row.Warning = !Sensors.InRange(sensor, value) || (sensor == SensorKind.SoilMoisture && value < Config.DryThreshold);
        }
        var soil = Snapshot.First(s => s.Sensor == SensorKind.SoilMoisture).Value;
        SoilText = $"{soil:0.#}%";
        Push(_soil, Math.Clamp(soil, 0, 100));
        Push(_air, Math.Max(0, Model.AirTemperature));
        Push(_humidity, Model.AirHumidity);
        Push(_labels, simulatedClock.ToString("HH:mm"));
        Series = [new ChartSeries("Độ ẩm đất (%)", SoilBrush, _soil.ToList()), new ChartSeries("Độ ẩm không khí (%)", HumidityBrush, _humidity.ToList()),
                  new ChartSeries("Nhiệt độ (°C)", AirBrush, _air.ToList())];
        Labels = _labels.ToList();
        OnPropertyChanged(nameof(Series));
        OnPropertyChanged(nameof(Labels));
    }

    public void SetStatus(IReadOnlyCollection<Alert> active)
    {
        if (active.Count == 0)
        {
            Status = Model.Scenario == Core.Scenario.Normal ? "Bình thường" : ScenarioLabels.Of(Model.Scenario);
            Tone = "ok";
            return;
        }
        var worst = active.OrderByDescending(a => a.Level).First();
        Status = worst.Message.Replace($" ở {Name}", string.Empty);
        Tone = worst.Level == AlertLevel.Danger ? "danger" : "warn";
    }

    private static void Push<T>(List<T> list, T value)
    {
        list.Add(value);
        if (list.Count > HistoryLength) list.RemoveAt(0);
    }
}
