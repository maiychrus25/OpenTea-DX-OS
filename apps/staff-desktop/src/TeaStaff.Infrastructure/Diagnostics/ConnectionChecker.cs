// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Diagnostics;
using Npgsql;
using TeaStaff.Infrastructure.MobileApi;

namespace TeaStaff.Infrastructure.Diagnostics;

public sealed record CheckResult(bool Ok, string Message);

/// <summary>Self-tests shown in Settings: can phones reach the PC, and can the PC reach the DX-OS core?</summary>
public sealed class ConnectionChecker(AppConfig config, HttpClient http)
{
    /// <summary>Calls the staff API through the PC's own LAN address, the same path a phone takes.</summary>
    public async Task<CheckResult> CheckPhoneApiAsync(bool running, CancellationToken ct = default)
    {
        if (!running) return new CheckResult(false, "Máy chủ cho điện thoại đang tắt. Bật nó trong mục này rồi thử lại.");
        var ips = MobileApiServer.LocalAddresses();
        if (ips.Count == 0) return new CheckResult(false, "Máy tính chưa kết nối mạng Wi-Fi/LAN nào.");
        var lines = new List<string>();
        var ok = false;
        foreach (var ip in ips)
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(3));
                var response = await http.GetAsync($"http://{ip}:{config.MobileApi.Port}/api/health", cts.Token);
                ok |= response.IsSuccessStatusCode;
                lines.Add($"http://{ip}:{config.MobileApi.Port} → {(response.IsSuccessStatusCode ? "trả lời bình thường" : $"lỗi {(int)response.StatusCode}")}");
            }
            catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
            {
                lines.Add($"http://{ip}:{config.MobileApi.Port} → không phản hồi");
            }
        }
        var hint = ok
            ? "Máy chủ chạy tốt. Nếu điện thoại vẫn không kết nối: điện thoại phải dùng cùng Wi-Fi (không dùng 4G), router không bật chế độ cách ly thiết bị (AP isolation), và tường lửa Windows phải cho phép cổng này (nút bên cạnh)."
            : "Máy chủ không trả lời qua địa chỉ mạng. Hãy bấm \"Cho phép qua tường lửa\" rồi thử lại.";
        return new CheckResult(ok, string.Join("\n", lines) + "\n\n" + hint);
    }

    /// <summary>Opens a firewall rule for the API port. Windows asks the user to confirm (UAC).</summary>
    public CheckResult AllowThroughFirewall()
    {
        var port = config.MobileApi.Port;
        var args = $"advfirewall firewall add rule name=\"Tea Staff Manager - dien thoai (TCP {port})\" dir=in action=allow protocol=TCP localport={port} profile=any";
        try
        {
            using var p = Process.Start(new ProcessStartInfo("netsh", args) { Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden });
            p?.WaitForExit(15_000);
            return p is { ExitCode: 0 }
                ? new CheckResult(true, $"Đã mở cổng {port} cho mọi mạng (kể cả Wi-Fi \"Công cộng\"). Thử kết nối lại từ điện thoại.")
                : new CheckResult(false, "Không thêm được quy tắc tường lửa.");
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return new CheckResult(false, "Đã huỷ ở hộp thoại quyền quản trị của Windows.");
        }
    }

    /// <summary>Checks Keycloak discovery and, when configured, the PostgreSQL schema of the DX-OS core.</summary>
    public async Task<CheckResult> CheckCoreAsync(string keycloakUrl, string realm, string postgres, CancellationToken ct = default)
    {
        var lines = new List<string>();
        var ok = true;
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(5));
            var r = await http.GetAsync($"{keycloakUrl.TrimEnd('/')}/realms/{Uri.EscapeDataString(realm)}/.well-known/openid-configuration", cts.Token);
            lines.Add(r.IsSuccessStatusCode ? $"Keycloak: realm \"{realm}\" sẵn sàng." : $"Keycloak: lỗi {(int)r.StatusCode} (kiểm tra địa chỉ và tên realm).");
            ok &= r.IsSuccessStatusCode;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or UriFormatException)
        {
            lines.Add($"Keycloak: không kết nối được {keycloakUrl}. Lõi DX-OS đã chạy (make up-core) chưa?");
            ok = false;
        }

        try
        {
            await using var conn = new NpgsqlConnection(postgres);
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(6));
            await conn.OpenAsync(cts.Token);
            await using var cmd = new NpgsqlCommand(
                "select count(*) from information_schema.tables where table_schema = 'app_staff_work'", conn);
            var tables = Convert.ToInt32(await cmd.ExecuteScalarAsync(cts.Token));
            lines.Add(tables > 0
                ? $"PostgreSQL: kết nối được database \"{conn.Database}\", schema app_staff_work có {tables} bảng."
                : $"PostgreSQL: kết nối được database \"{conn.Database}\", schema app_staff_work chưa có bảng (app sẽ tự tạo khi chuyển sang PostgreSQL).");
        }
        catch (Exception e) when (e is NpgsqlException or InvalidOperationException or ArgumentException or OperationCanceledException or System.Net.Sockets.SocketException)
        {
            lines.Add("PostgreSQL: " + (e is ArgumentException ? "chuỗi kết nối không hợp lệ." : e.Message));
            ok = false;
        }
        return new CheckResult(ok, string.Join("\n", lines));
    }
}
