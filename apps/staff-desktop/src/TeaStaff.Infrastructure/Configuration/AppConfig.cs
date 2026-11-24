// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TeaStaff.Infrastructure;

public enum DatabaseProvider { Sqlite, Postgres }

public enum AuthMode { Local, Keycloak }

public sealed class DatabaseOptions
{
    public DatabaseProvider Provider { get; set; } = DatabaseProvider.Sqlite;

    /// <summary>Used when <see cref="Provider"/> is Postgres, e.g. the DX-OS database role <c>app_staff_work</c>.</summary>
    public string PostgresConnection { get; set; } =
        "Host=localhost;Port=5432;Database=agrimarket;Username=app_staff_work;Password=change-me";

    public string SqlitePath { get; set; } = Path.Combine(AppConfig.DataFolder, "teastaff.db");
}

public sealed class KeycloakOptions
{
    /// <summary>Base URL of Keycloak in the DX-OS stack.</summary>
    public string BaseUrl { get; set; } = "http://localhost:8080";
    public string Realm { get; set; } = "agrimarket";
    public string ClientId { get; set; } = "staff-desktop";
    public string? ClientSecret { get; set; }
    public string RequiredRole { get; set; } = "manager";
}

public sealed class MobileApiOptions
{
    public bool Enabled { get; set; } = true;
    public int Port { get; set; } = 5080;

    /// <summary>Staff may also sign in to Tea Work with their OpenTea DX-OS (Keycloak) account.</summary>
    public bool AllowCoreAccounts { get; set; } = true;
}

/// <summary>Field sensors (Tea IoT Station) that may post alerts to /api/iot/alerts.</summary>
public sealed class IotOptions
{
    public bool Enabled { get; set; } = true;

    /// <summary>Shared key sent by the station in the X-Device-Key header.</summary>
    public string DeviceKey { get; set; } = "tea-iot-demo";
}

/// <summary>Machine-level configuration stored in %LOCALAPPDATA%\TeaStaff\config.json.</summary>
public sealed class AppConfig
{
    /// <summary>Data root; override with the TEASTAFF_DATA environment variable (portable installs, demos, tests).</summary>
    public static string DataFolder { get; } =
        Environment.GetEnvironmentVariable("TEASTAFF_DATA") is { Length: > 0 } custom
            ? Path.GetFullPath(custom)
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TeaStaff");

    public static string FilePath => Path.Combine(DataFolder, "config.json");

    /// <summary>Cooperative (HTX) code. Matches the <c>htx_code</c> claim of DX-OS accounts.</summary>
    public string HtxCode { get; set; } = "TC";
    public string HtxName { get; set; } = "HTX Chè Tân Cương";
    public AuthMode AuthMode { get; set; } = AuthMode.Local;
    public DatabaseOptions Database { get; set; } = new();
    public KeycloakOptions Keycloak { get; set; } = new();
    public MobileApiOptions MobileApi { get; set; } = new();
    public IotOptions Iot { get; set; } = new();

    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    public static AppConfig Load()
    {
        try
        {
            if (File.Exists(FilePath))
                return JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(FilePath), Json) ?? new AppConfig();
        }
        catch (JsonException)
        {
            // A corrupt file falls back to defaults; the next Save rewrites it.
        }
        return new AppConfig();
    }

    public void Save()
    {
        Directory.CreateDirectory(DataFolder);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(this, Json));
    }
}
