// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Net.Http.Json;
using System.Text.Json;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;

namespace TeaStaff.Infrastructure.Identity;

public sealed record CoreStaffResult(Employee? Employee, string? Error);

/// <summary>
/// Lets staff sign in to Tea Work with their shared OpenTea DX-OS account (Keycloak realm
/// <c>agrimarket</c>), the same account they use on the web and in mini-apps. The phone sends the
/// credentials to this app, which asks Keycloak (password grant of the staff client), checks the
/// <c>htx_code</c> claim against this cooperative and links the account to an employee profile:
/// by Keycloak subject once linked, otherwise by the mobile login name (<c>preferred_username</c>).
/// </summary>
public sealed class CoreStaffAuthenticator(AppConfig config, HttpClient http, IEmployeeRepository employees)
{
    public bool Enabled => config.MobileApi.AllowCoreAccounts && !string.IsNullOrWhiteSpace(config.Keycloak.BaseUrl);

    public async Task<CoreStaffResult> SignInAsync(string userName, string password, CancellationToken ct = default)
    {
        var kc = config.Keycloak;
        var url = $"{kc.BaseUrl.TrimEnd('/')}/realms/{Uri.EscapeDataString(kc.Realm)}/protocol/openid-connect/token";
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "password", ["client_id"] = kc.ClientId, ["username"] = userName, ["password"] = password, ["scope"] = "openid",
        };
        if (!string.IsNullOrEmpty(kc.ClientSecret)) form["client_secret"] = kc.ClientSecret;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        HttpResponseMessage response;
        try
        {
            response = await http.PostAsync(url, new FormUrlEncodedContent(form), timeout.Token);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            return new CoreStaffResult(null, null); // core not reachable: behave as a wrong local password
        }
        if (!response.IsSuccessStatusCode) return new CoreStaffResult(null, null);

        var token = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        // The token comes straight from Keycloak's token endpoint over this request, so its payload can be read as is.
        var claims = JwtPayload.Decode(token.GetProperty("access_token").GetString() ?? string.Empty);
        if (claims is null) return new CoreStaffResult(null, "Token DX-OS không hợp lệ.");
        var c = claims.Value;
        var htx = c.TryGetProperty("htx_code", out var h) ? h.GetString() : null;
        if (!string.Equals(htx, config.HtxCode, StringComparison.OrdinalIgnoreCase))
            return new CoreStaffResult(null, "Tài khoản DX-OS này thuộc HTX khác.");
        var sub = c.TryGetProperty("sub", out var s) ? s.GetString() : null;
        var preferred = (c.TryGetProperty("preferred_username", out var p) ? p.GetString() : userName) ?? userName;

        var all = await employees.ListAsync(ct);
        var employee = all.FirstOrDefault(e => sub is not null && e.CoreUserId == sub)
                       ?? all.FirstOrDefault(e => e.CoreUserId is null && string.Equals(e.Username, preferred, StringComparison.OrdinalIgnoreCase));
        if (employee is null) return new CoreStaffResult(null, "Tài khoản DX-OS chưa được liên kết với hồ sơ nhân viên nào. Nhờ chủ HTX đặt tên đăng nhập trùng với tài khoản DX-OS.");
        if (!employee.IsActive) return new CoreStaffResult(null, "Nhân viên đã nghỉ việc.");
        if (employee.CoreUserId is null && sub is not null)
        {
            employee.CoreUserId = sub;
            employee.Department = null;
            await employees.SaveAsync(employee, ct);
        }
        return new CoreStaffResult(employee, null);
    }
}
