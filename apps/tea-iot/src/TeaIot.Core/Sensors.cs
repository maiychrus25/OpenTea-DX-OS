// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using System.Text.Json;

namespace TeaIot.Core;

/// <summary>
/// The five sensors the DX-OS ingest worker accepts, with the same codes, units and valid
/// ranges as platform/dataops (a reading outside the range is stored in telemetry.ingest_rejects).
/// </summary>
public enum SensorKind { SoilMoisture, SoilTemperature, AirTemperature, AirHumidity, Rainfall }

public sealed record SensorInfo(SensorKind Kind, string Code, string Name, string Unit, double Min, double Max, string Glyph);

public static class Sensors
{
    public static readonly IReadOnlyList<SensorInfo> All =
    [
        new(SensorKind.SoilMoisture, "soil_moisture", "Độ ẩm đất", "%", 0, 100, "\uE913"),
        new(SensorKind.SoilTemperature, "soil_temperature", "Nhiệt độ đất", "°C", -10, 60, "\uE9CA"),
        new(SensorKind.AirTemperature, "air_temperature", "Nhiệt độ không khí", "°C", -10, 55, "\uE9CA"),
        new(SensorKind.AirHumidity, "air_humidity", "Độ ẩm không khí", "%", 0, 100, "\uEB42"),
        new(SensorKind.Rainfall, "rainfall", "Lượng mưa", "mm", 0, 500, "\uE753"),
    ];

    public static SensorInfo Of(SensorKind kind) => All.First(s => s.Kind == kind);

    public static bool InRange(SensorKind kind, double value)
    {
        var s = Of(kind);
        return value >= s.Min && value <= s.Max && double.IsFinite(value);
    }
}

/// <summary>One reading as it travels to the core broker.</summary>
public sealed record Reading(string HtxCode, string ParcelCode, SensorKind Sensor, DateTimeOffset Ts, double Value)
{
    /// <summary>Topic format of the DX-OS broker: htx/&lt;htx_code&gt;/plot/&lt;parcel_code&gt;/&lt;sensor&gt;.</summary>
    public string Topic => $"htx/{HtxCode}/plot/{ParcelCode}/{Sensors.Of(Sensor).Code}";

    /// <summary>JSON body: {"ts": ISO 8601 with offset, "value": number}.</summary>
    public string Payload => JsonSerializer.Serialize(new Body(Ts.ToString("yyyy-MM-ddTHH:mm:ssK", CultureInfo.InvariantCulture), Math.Round(Value, 2)));

    private sealed record Body(string ts, double value);
}

/// <summary>Codes allowed in topics by the broker ACL and the ingest worker.</summary>
public static class Codes
{
    public static bool IsValidHtx(string? code) => !string.IsNullOrWhiteSpace(code) && code.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-') && code.Length <= 20;

    public static bool IsValidParcel(string? code) => !string.IsNullOrWhiteSpace(code) && !code.Contains('/') && !code.Contains('+') && !code.Contains('#') && code.Length <= 40;
}
