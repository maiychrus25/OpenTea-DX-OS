// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Net.Http;
using System.Net.Http.Json;
using TeaIot.Core;

namespace TeaIot.App.Services;

/// <summary>
/// Sends field alerts to Tea Staff Manager (POST /api/iot/alerts). The staff app turns each one
/// into a suggestion with the best-placed worker; the owner confirms it in one click.
/// </summary>
public sealed class StaffAlertClient(IotConfig config)
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };

    public bool Enabled => !string.IsNullOrWhiteSpace(config.StaffApiUrl) && !string.IsNullOrWhiteSpace(config.StaffDeviceKey);

    public async Task<(bool Ok, string Message)> SendAsync(Alert alert, CancellationToken ct = default)
    {
        if (!Enabled || alert.SuggestedTask is null) return (false, "Không gửi");
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, config.StaffApiUrl.TrimEnd('/') + "/api/iot/alerts")
            {
                Content = JsonContent.Create(new
                {
                    htxCode = config.HtxCode,
                    parcelCode = alert.ParcelCode,
                    parcelName = alert.ParcelName,
                    kind = alert.Kind.ToString(),
                    message = alert.Message,
                    evidence = alert.Evidence,
                    suggestedTask = alert.SuggestedTask,
                    at = alert.At,
                }),
            };
            request.Headers.Add("X-Device-Key", config.StaffDeviceKey);
            using var response = await _http.SendAsync(request, ct);
            return response.IsSuccessStatusCode
                ? (true, "Đã gửi gợi ý sang Tea Staff Manager")
                : (false, $"Tea Staff Manager trả lỗi {(int)response.StatusCode}");
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            return (false, "Chưa gửi được sang Tea Staff Manager (app chưa mở?)");
        }
    }
}
