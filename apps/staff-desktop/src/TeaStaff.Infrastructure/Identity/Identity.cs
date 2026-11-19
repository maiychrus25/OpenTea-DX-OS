// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using TeaStaff.Core.Abstractions;

namespace TeaStaff.Infrastructure.Identity;

/// <summary>PBKDF2-SHA256 with a per-password salt. Format: <c>pbkdf2$iterations$salt$hash</c>.</summary>
public sealed class Pbkdf2PasswordHasher : IPasswordHasher
{
    private const int Iterations = 100_000;

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public bool Verify(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2" || !int.TryParse(parts[1], out var iterations)) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed class TenantContext(AppConfig config) : ITenantContext
{
    public string HtxCode { get; private set; } = config.HtxCode;
    public string UserName { get; private set; } = string.Empty;
    public string DisplayName { get; private set; } = string.Empty;

    public void SignIn(string htxCode, string userName, string displayName)
    {
        HtxCode = htxCode;
        UserName = userName;
        DisplayName = displayName;
    }
}

/// <summary>Offline owner account stored in the local database.</summary>
public sealed class LocalIdentityProvider(IOwnerAccountRepository owners, IPasswordHasher hasher, AppConfig config) : IIdentityProvider
{
    public string Name => "Tài khoản trên máy";

    public async Task<SignInResult> SignInAsync(string userName, string password, CancellationToken ct = default)
    {
        var owner = await owners.FindAsync(userName.Trim().ToLowerInvariant(), ct);
        if (owner is null || !hasher.Verify(password, owner.PasswordHash))
            return new SignInResult(false, "Tên đăng nhập hoặc mật khẩu không đúng.");
        return new SignInResult(true, null, string.IsNullOrEmpty(owner.HtxCode) ? config.HtxCode : owner.HtxCode, owner.Username, owner.DisplayName);
    }
}

/// <summary>
/// Signs in with the shared OpenTea DX-OS account (Keycloak, realm <c>agrimarket</c>) using the
/// OAuth2 password grant, then reads the <c>htx_code</c>, <c>name</c> and <c>realm_access.roles</c> claims.
/// The client must have "Direct access grants" enabled in Keycloak.
/// </summary>
public sealed class KeycloakIdentityProvider(AppConfig config, HttpClient http) : IIdentityProvider
{
    public string Name => "Tài khoản OpenTea DX-OS";

    public string? AccessToken { get; private set; }

    public async Task<SignInResult> SignInAsync(string userName, string password, CancellationToken ct = default)
    {
        var kc = config.Keycloak;
        var url = $"{kc.BaseUrl.TrimEnd('/')}/realms/{Uri.EscapeDataString(kc.Realm)}/protocol/openid-connect/token";
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "password",
            ["client_id"] = kc.ClientId,
            ["username"] = userName,
            ["password"] = password,
            ["scope"] = "openid",
        };
        if (!string.IsNullOrEmpty(kc.ClientSecret)) form["client_secret"] = kc.ClientSecret;

        HttpResponseMessage response;
        try
        {
            response = await http.PostAsync(url, new FormUrlEncodedContent(form), ct);
        }
        catch (HttpRequestException)
        {
            return new SignInResult(false, $"Không kết nối được máy chủ DX-OS ({kc.BaseUrl}).");
        }
        catch (TaskCanceledException)
        {
            return new SignInResult(false, "Máy chủ DX-OS không phản hồi.");
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            return new SignInResult(false, body.Contains("OTP", StringComparison.OrdinalIgnoreCase) || body.Contains("not fully set up")
                ? "Tài khoản yêu cầu mã TOTP, hãy dùng tài khoản không bật TOTP hoặc đăng nhập trên web trước."
                : "Tên đăng nhập hoặc mật khẩu DX-OS không đúng.");
        }

        var token = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        AccessToken = token.GetProperty("access_token").GetString();
        var claims = JwtPayload.Decode(AccessToken ?? string.Empty);
        if (claims is null) return new SignInResult(false, "Token DX-OS không hợp lệ.");

        var roles = claims.Value.TryGetProperty("realm_access", out var ra) && ra.TryGetProperty("roles", out var r)
            ? r.EnumerateArray().Select(x => x.GetString()).ToList()
            : [];
        if (!roles.Contains(kc.RequiredRole))
            return new SignInResult(false, "Chỉ ban quản trị HTX (vai trò manager) được dùng ứng dụng này.");

        var htx = claims.Value.TryGetProperty("htx_code", out var h) ? h.GetString() : null;
        if (string.IsNullOrWhiteSpace(htx)) return new SignInResult(false, "Tài khoản chưa được gán mã HTX (NO_HTX).");
        var name = claims.Value.TryGetProperty("name", out var n) ? n.GetString()
            : claims.Value.TryGetProperty("preferred_username", out var u) ? u.GetString() : userName;
        return new SignInResult(true, null, htx, userName, name ?? userName);
    }
}

public static class JwtPayload
{
    public static JsonElement? Decode(string jwt)
    {
        var parts = jwt.Split('.');
        if (parts.Length < 2) return null;
        var payload = parts[1].Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
        try
        {
            return JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload))).RootElement.Clone();
        }
        catch (Exception e) when (e is FormatException or JsonException)
        {
            return null;
        }
    }
}
