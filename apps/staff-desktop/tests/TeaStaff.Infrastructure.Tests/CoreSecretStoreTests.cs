// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
using System.Text.Json;
using TeaStaff.Infrastructure.Sync;

namespace TeaStaff.Infrastructure.Tests;

public sealed class CoreSecretStoreTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "teastaff-secret-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(_folder, true); } catch (IOException) { }
    }

    [Fact]
    public void Secret_round_trips_and_can_be_cleared()
    {
        var store = new FileSecretStore(Path.Combine(_folder, "core-sync.secret"));
        Assert.Null(store.Read());
        store.Save("s3cret");
        Assert.Equal("s3cret", store.Read());
        store.Save(null);
        Assert.Null(store.Read());
    }

    [Fact]
    public void Secret_file_is_private_and_not_plain_text_on_windows()
    {
        var path = Path.Combine(_folder, "core-sync.secret");
        new FileSecretStore(path).Save("s3cret");
        if (OperatingSystem.IsWindows())
            Assert.DoesNotContain("s3cret", File.ReadAllText(path));
        else
            Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(path));
    }

    [Fact]
    public void Config_json_never_holds_the_secret()
    {
        var json = JsonSerializer.Serialize(new CoreSyncOptions { BaseUrl = "https://x", ClientId = "c" });
        Assert.DoesNotContain("ecret", json);
    }
}
