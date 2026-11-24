// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaIot.Core;

public enum AlertKind { DrySoil, Heat, HeavyRain, Frost, SensorFault }

public enum AlertLevel { Info, Warning, Danger }

/// <summary>
/// A threshold crossing on one parcel. <see cref="SuggestedTask"/> is the field work that
/// usually answers it; the staff app shows it to the owner as a suggestion, never as an order.
/// </summary>
public sealed record Alert(AlertKind Kind, AlertLevel Level, string ParcelCode, string ParcelName, string Message, string Evidence, string? SuggestedTask, DateTime At);

/// <summary>Agronomic thresholds for tea bushes (Camellia sinensis) used by the station.</summary>
public static class AlertRules
{
    public const double HeatAbove = 35;
    public const double HeavyRainMm = 15;
    public const double FrostBelow = 4;

    /// <summary>Same alert on the same parcel is not repeated within this time.</summary>
    public static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(30);

    public static IEnumerable<Alert> Evaluate(StationConfig station, IReadOnlyDictionary<SensorKind, double> values, DateTime now)
    {
        var name = string.IsNullOrWhiteSpace(station.Name) ? station.ParcelCode : station.Name;
        if (values.TryGetValue(SensorKind.SoilMoisture, out var soil))
        {
            if (!Sensors.InRange(SensorKind.SoilMoisture, soil))
                yield return new(AlertKind.SensorFault, AlertLevel.Warning, station.ParcelCode, name,
                    $"Cảm biến độ ẩm đất ở {name} gửi giá trị bất thường", $"Đọc được {soil:0.#}% (hợp lệ 0–100%)", $"Kiểm tra cảm biến độ ẩm đất {name}", now);
            else if (soil < station.DryThreshold)
                yield return new(AlertKind.DrySoil, soil < station.DryThreshold - 10 ? AlertLevel.Danger : AlertLevel.Warning, station.ParcelCode, name,
                    $"Đất khô ở {name}", $"Độ ẩm đất {soil:0.#}% < ngưỡng {station.DryThreshold:0}%", $"Tưới giữ ẩm {name}", now);
        }
        if (values.TryGetValue(SensorKind.AirTemperature, out var air))
        {
            if (air > HeatAbove)
                yield return new(AlertKind.Heat, AlertLevel.Warning, station.ParcelCode, name,
                    $"Nắng nóng ở {name}", $"Nhiệt độ không khí {air:0.#}°C > {HeatAbove:0}°C", "Hái chè sớm trước 9h, che nắng búp non", now);
            else if (air < FrostBelow)
                yield return new(AlertKind.Frost, AlertLevel.Danger, station.ParcelCode, name,
                    $"Nguy cơ sương muối ở {name}", $"Nhiệt độ không khí {air:0.#}°C < {FrostBelow:0}°C", $"Phủ gốc, tưới phun chống sương muối {name}", now);
        }
        if (values.TryGetValue(SensorKind.Rainfall, out var rain) && rain >= HeavyRainMm)
            yield return new(AlertKind.HeavyRain, AlertLevel.Info, station.ParcelCode, name,
                $"Mưa lớn ở {name}", $"Lượng mưa {rain:0.#} mm trong một lần đo", null, now);
    }
}

/// <summary>Remembers when each (parcel, alert) was last raised so the feed is not flooded.</summary>
public sealed class AlertThrottle
{
    private readonly Dictionary<(string, AlertKind), DateTime> _last = new();

    public bool ShouldRaise(Alert alert)
    {
        var key = (alert.ParcelCode, alert.Kind);
        if (_last.TryGetValue(key, out var at) && alert.At - at < AlertRules.Cooldown) return false;
        _last[key] = alert.At;
        return true;
    }

    public void Reset() => _last.Clear();
}
