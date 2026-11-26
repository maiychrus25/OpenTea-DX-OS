// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Hosting;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Infrastructure.Sync;

/// <summary>
/// Every minute: pushes the roster and today's attendance to the DX-OS core and pulls the tasks a manager
/// approved there. The core never calls this app. With no settings it does nothing.
/// </summary>
public sealed class CoreSyncService(AppConfig config, ICoreSecretStore secrets, HttpClient http, IEmployeeRepository employees,
    ITaskRepository tasks, IAttendanceRepository attendance, TaskService taskService, IClock clock) : BackgroundService
{
    public const string AssistantName = "Trợ lý AI";
    private const int MaxRoster = 500;
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    /// <summary>Last problem of the latest round, or null when it went well (shown nowhere else; for diagnostics).</summary>
    public string? LastError { get; private set; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            await RunOnceAsync(stoppingToken);
        }
        while (await WaitAsync(timer, stoppingToken));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try { return await timer.WaitForNextTickAsync(ct); }
        catch (OperationCanceledException) { return false; }
    }

    /// <summary>One round. Never throws: a failed step is recorded in <see cref="LastError"/> and retried next round.</summary>
    public async Task RunOnceAsync(CancellationToken ct = default)
    {
        var secret = secrets.Read();
        var options = config.CoreSync;
        if (!CoreSyncOptions.IsValidBaseUrl(options.BaseUrl) || string.IsNullOrWhiteSpace(options.ClientId) || string.IsNullOrEmpty(secret)) return;

        LastError = null;
        var baseUrl = options.BaseUrl.Trim().TrimEnd('/');
        string token;
        try { token = await GetTokenAsync(options.ClientId.Trim(), secret, ct); }
        catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested) { LastError = "token: " + e.Message; return; }

        await StepAsync("roster", () => PushRosterAsync(baseUrl, token, ct), ct);
        await StepAsync("attendance", () => PushAttendanceAsync(baseUrl, token, ct), ct);
        await StepAsync("tasks", () => PullTasksAsync(baseUrl, token, ct), ct);
    }

    private async Task StepAsync(string name, Func<Task> step, CancellationToken ct)
    {
        try { await step(); }
        catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested) { LastError = $"{name}: {e.Message}"; }
    }

    private async Task<string> GetTokenAsync(string clientId, string secret, CancellationToken ct)
    {
        var k = config.Keycloak;
        var url = $"{k.BaseUrl.TrimEnd('/')}/realms/{k.Realm}/protocol/openid-connect/token";
        using var response = await http.PostAsync(url, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials", ["client_id"] = clientId, ["client_secret"] = secret,
        }), ct);
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<TokenBody>(ct);
        return string.IsNullOrEmpty(body?.AccessToken) ? throw new InvalidOperationException("no access_token") : body.AccessToken;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, string token, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, url) { Content = body is null ? null : JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await http.SendAsync(request, ct);
    }

    private async Task PushRosterAsync(string baseUrl, string token, CancellationToken ct)
    {
        var staff = (await employees.ListAsync(ct)).Take(MaxRoster)
            .Select(e => new RosterEntry(e.Id.ToString(), e.FullName, e.Department?.Name, e.IsActive)).ToList();
        using var response = await SendAsync(HttpMethod.Put, baseUrl + "/api/internal/staff/roster", token, new { staff }, ct);
        response.EnsureSuccessStatusCode();
    }

    private async Task PushAttendanceAsync(string baseUrl, string token, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(clock.Now);
        var present = (await attendance.ListAsync(today, today, null, ct)).Count(a => a.Status is AttendanceStatus.Present or AttendanceStatus.HalfDay);
        using var response = await SendAsync(HttpMethod.Put, baseUrl + "/api/internal/staff/attendance", token,
            new { day = today.ToString("yyyy-MM-dd"), present }, ct);
        response.EnsureSuccessStatusCode();
    }

    private async Task PullTasksAsync(string baseUrl, string token, CancellationToken ct)
    {
        using var response = await SendAsync(HttpMethod.Get, baseUrl + "/api/internal/staff/tasks", token, null, ct);
        response.EnsureSuccessStatusCode();
        var pulled = (await response.Content.ReadFromJsonAsync<TasksEnvelope>(ct))?.Data?.Tasks ?? [];
        foreach (var item in pulled)
        {
            // One bad task must not hold back the others.
            try { await HandleTaskAsync(baseUrl, token, item, ct); }
            catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested) { LastError = $"task {item.ProposalId}: {e.Message}"; }
        }
    }

    private async Task HandleTaskAsync(string baseUrl, string token, PulledTask item, CancellationToken ct)
    {
        // The proposal id is the key: a restart between "create" and "ack" must never create a second task.
        var task = await tasks.FindByExternalRefAsync(item.ProposalId, ct);
        if (task is null)
        {
            var assignee = int.TryParse(item.AssigneeRef, out var id) ? await employees.GetAsync(id, ct) : null;
            // shortcut: a task needs an assignee in this app; one without a usable assignee waits until the manager edits it or it expires.
            if (assignee is not { IsActive: true }) { LastError = $"task {item.ProposalId}: no active assignee"; return; }
            task = await taskService.SaveAsync(ToTask(item, assignee, clock.Now), ct);
        }

        using var ack = await SendAsync(HttpMethod.Post, $"{baseUrl}/api/internal/staff/tasks/{Uri.EscapeDataString(item.ProposalId)}/ack", token,
            new { task_id = task.Id.ToString() }, ct);
        if (ack.StatusCode == HttpStatusCode.Conflict)
        {
            // The proposal expired meanwhile: keep the task, but untouched work is closed.
            if (task.Status == WorkTaskStatus.Assigned)
            {
                task.Status = WorkTaskStatus.Cancelled;
                task.UpdatedAt = DateTime.UtcNow;
                await taskService.SaveAsync(task, ct);
            }
            return;
        }
        if (ack.StatusCode != HttpStatusCode.NotFound) ack.EnsureSuccessStatusCode();
    }

    internal static WorkTask ToTask(PulledTask item, Employee assignee, DateTime now)
    {
        var dueDay = DateTime.TryParse(item.DueDate, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d) ? d.Date : now.Date;
        var due = dueDay.AddHours(23).AddMinutes(59);
        var notes = new List<string>();
        if (!string.IsNullOrWhiteSpace(item.NoteVi)) notes.Add(item.NoteVi.Trim());
        if (!string.IsNullOrWhiteSpace(item.ApprovedByName)) notes.Add($"Duyệt bởi {item.ApprovedByName.Trim()}");
        return new WorkTask
        {
            HtxCode = assignee.HtxCode,
            Title = item.TitleVi.Trim(),
            Description = notes.Count == 0 ? null : string.Join("\n", notes),
            Location = string.IsNullOrWhiteSpace(item.ParcelCode) ? null : $"Thửa {item.ParcelCode.Trim()}",
            AssigneeId = assignee.Id,
            StartDate = now < due ? now : due,
            DueDate = due,
            AssignedBy = AssistantName,
            ExternalRef = item.ProposalId,
        };
    }

    private sealed record TokenBody([property: JsonPropertyName("access_token")] string? AccessToken);

    private sealed record RosterEntry(
        [property: JsonPropertyName("staff_ref")] string StaffRef,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("department"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Department,
        [property: JsonPropertyName("active")] bool Active);

    private sealed record TasksEnvelope([property: JsonPropertyName("data")] TasksData? Data);

    private sealed record TasksData([property: JsonPropertyName("tasks")] List<PulledTask>? Tasks);

    internal sealed record PulledTask(
        [property: JsonPropertyName("proposal_id")] string ProposalId,
        [property: JsonPropertyName("title_vi")] string TitleVi,
        [property: JsonPropertyName("note_vi")] string? NoteVi,
        [property: JsonPropertyName("parcel_code")] string? ParcelCode,
        [property: JsonPropertyName("due_date")] string? DueDate,
        [property: JsonPropertyName("assignee_ref")] string? AssigneeRef,
        [property: JsonPropertyName("approved_by_name")] string? ApprovedByName);
}
