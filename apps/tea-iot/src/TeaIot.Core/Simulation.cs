// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaIot.Core;

/// <summary>Weather the station is put through, chosen per station in the UI.</summary>
public enum Scenario { Normal, HeatDrought, HeavyRain, Frost, FaultySensor }

public static class ScenarioLabels
{
    public static string Of(Scenario s) => s switch
    {
        Scenario.Normal => "Bình thường",
        Scenario.HeatDrought => "Nắng nóng, khô hạn",
        Scenario.HeavyRain => "Mưa lớn",
        Scenario.Frost => "Rét đậm, sương muối",
        Scenario.FaultySensor => "Cảm biến lỗi",
        _ => s.ToString(),
    };
}

/// <summary>A sensor station on one parcel (thửa) of the cooperative.</summary>
public sealed class StationConfig
{
    public string ParcelCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>Soil moisture the tea bushes need; below it the station raises "đất khô".</summary>
    public double DryThreshold { get; set; } = 35;
    public bool Enabled { get; set; } = true;
}

/// <summary>
/// Physical model of one station, advanced in simulated minutes: daily temperature cycle,
/// humidity that follows temperature and rain, soil that dries with heat and wets with rain
/// or irrigation, and soil temperature that lags the air. Deterministic for a given seed.
/// </summary>
public sealed class StationModel
{
    private readonly Random _random;

    public StationModel(StationConfig config, int seed)
    {
        Config = config;
        _random = new Random(seed);
        SoilMoisture = 52 + _random.NextDouble() * 10;
        SoilTemperature = 21;
        AirTemperature = 22;
        AirHumidity = 78;
    }

    public StationConfig Config { get; }
    public Scenario Scenario { get; set; } = Scenario.Normal;

    public double SoilMoisture { get; private set; }
    public double SoilTemperature { get; private set; }
    public double AirTemperature { get; private set; }
    public double AirHumidity { get; private set; }

    /// <summary>Rain that fell during the last step, in mm.</summary>
    public double Rainfall { get; private set; }

    public double Value(SensorKind kind) => kind switch
    {
        SensorKind.SoilMoisture => SoilMoisture,
        SensorKind.SoilTemperature => SoilTemperature,
        SensorKind.AirTemperature => AirTemperature,
        SensorKind.AirHumidity => AirHumidity,
        SensorKind.Rainfall => Rainfall,
        _ => 0,
    };

    /// <summary>Water poured by an irrigation run (the "Tưới" button or a finished watering task).</summary>
    public void Irrigate(double percent = 25) => SoilMoisture = Math.Min(95, SoilMoisture + percent);

    /// <summary>Advances the model to <paramref name="clock"/>, <paramref name="minutes"/> simulated minutes after the previous step.</summary>
    public void Step(DateTime clock, double minutes)
    {
        var hour = clock.Hour + clock.Minute / 60.0;
        // Coolest around 05:00, warmest around 14:00.
        var cycle = Math.Sin((hour - 8) / 24 * 2 * Math.PI);
        var (tempBase, amplitude, rainChance, rainMax) = Scenario switch
        {
            Scenario.HeatDrought => (31.0, 6.0, 0.0, 0.0),
            Scenario.HeavyRain => (21.0, 2.0, 0.85, 18.0),
            Scenario.Frost => (3.0, 3.5, 0.0, 0.0),
            _ => (22.0, 5.0, 0.08, 3.0),
        };
        var targetAir = tempBase + amplitude * cycle + Noise(0.4);
        AirTemperature += (targetAir - AirTemperature) * Math.Min(1, minutes / 20);

        Rainfall = _random.NextDouble() < rainChance * Math.Min(1, minutes / 10) ? Math.Round(_random.NextDouble() * rainMax * Math.Max(1, minutes / 10), 1) : 0;

        var targetHumidity = Scenario switch
        {
            Scenario.HeatDrought => 45 - 12 * cycle,
            Scenario.HeavyRain => 96,
            Scenario.Frost => 88,
            _ => 80 - 15 * cycle,
        } + (Rainfall > 0 ? 8 : 0) + Noise(1.2);
        AirHumidity = Math.Clamp(AirHumidity + (targetHumidity - AirHumidity) * Math.Min(1, minutes / 15), 5, 100);

        // Evapotranspiration grows with heat and dry air; rain soaks in at ~1.2 % per mm.
        var dryRate = Math.Max(0, (AirTemperature - 8) / 25) * (1.2 - AirHumidity / 100) * 0.06;
        SoilMoisture = Math.Clamp(SoilMoisture - dryRate * minutes + Rainfall * 1.2 + Noise(0.1), 3, 98);

        var targetSoil = AirTemperature * 0.75 + 4;
        SoilTemperature += (targetSoil - SoilTemperature) * Math.Min(1, minutes / 90);
    }

    /// <summary>Readings for the current state. A faulty sensor sends values the core must reject.</summary>
    public IEnumerable<(SensorKind Sensor, double Value)> Readings()
    {
        foreach (var s in Sensors.All)
        {
            var v = Value(s.Kind);
            if (Scenario == Scenario.FaultySensor && s.Kind == SensorKind.SoilMoisture) v = 140 + _random.NextDouble() * 20;
            yield return (s.Kind, Math.Round(v, 1));
        }
    }

    private double Noise(double scale) => (_random.NextDouble() * 2 - 1) * scale;
}
