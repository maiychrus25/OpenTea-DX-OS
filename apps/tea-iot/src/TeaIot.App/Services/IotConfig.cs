// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.IO;
using System.Text.Json;
using TeaIot.Core;

namespace TeaIot.App.Services;

/// <summary>Settings saved in %LOCALAPPDATA%\TeaIot\config.json (or the folder in TEAIOT_DATA).</summary>
public sealed class IotConfig
{
    /// <summary>Cooperative code; also the MQTT device account (the broker ACL lets it write only htx/&lt;code&gt;/...).</summary>
    public string HtxCode { get; set; } = "TC";
    public string HtxName { get; set; } = "HTX Chè Tân Cương";

    public string BrokerHost { get; set; } = "127.0.0.1";
    public int BrokerPort { get; set; } = 1883;

    /// <summary>Device password from DXOS_MQTT_DEVICES in docker/.env.local of the core.</summary>
    public string BrokerPassword { get; set; } = "change_me_mqtt_tc";

    /// <summary>Seconds between two rounds of readings.</summary>
    public int IntervalSeconds { get; set; } = 10;

    /// <summary>Simulated minutes per round; 10 means a day passes in about 24 minutes at a 10 s interval.</summary>
    public double SimulatedMinutesPerRound { get; set; } = 10;

    /// <summary>Tea Staff Manager endpoint that turns alerts into task suggestions; empty disables it.</summary>
    public string StaffApiUrl { get; set; } = "http://127.0.0.1:5080";
    public string StaffDeviceKey { get; set; } = "tea-iot-demo";

    public List<StationConfig> Stations { get; set; } =
    [
        new() { ParcelCode = "TC-A1", Name = "Đồi A1" },
        new() { ParcelCode = "TC-A2", Name = "Đồi A2" },
        new() { ParcelCode = "TC-A3", Name = "Đồi A3" },
        new() { ParcelCode = "TC-B1", Name = "Đồi B1", DryThreshold = 38 },
        new() { ParcelCode = "TC-B2", Name = "Đồi B2" },
    ];

    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    public static string Folder => Environment.GetEnvironmentVariable("TEAIOT_DATA") is { Length: > 0 } custom
        ? custom
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TeaIot");

    public static string FilePath => Path.Combine(Folder, "config.json");

    public static IotConfig Load()
    {
        try
        {
            if (File.Exists(FilePath)) return JsonSerializer.Deserialize<IotConfig>(File.ReadAllText(FilePath)) ?? new IotConfig();
        }
        catch (JsonException)
        {
            // A broken file falls back to defaults instead of stopping the station.
        }
        return new IotConfig();
    }

    public void Save()
    {
        Directory.CreateDirectory(Folder);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(this, Json));
    }
}
