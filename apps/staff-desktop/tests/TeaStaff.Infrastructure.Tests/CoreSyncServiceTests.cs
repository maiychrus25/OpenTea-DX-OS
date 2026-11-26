// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Infrastructure;
using TeaStaff.Infrastructure.Persistence;
using TeaStaff.Infrastructure.Sync;

namespace TeaStaff.Infrastructure.Tests;

public sealed class CoreSyncServiceTests : IAsyncLifetime
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "teastaff-sync-" + Guid.NewGuid().ToString("N"));
    private ServiceProvider _sp = null!;
    private AppConfig _config = null!;
    private FakeCore _core = null!;
    private MemorySecrets _secrets = null!;

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(_folder);
        _config = new AppConfig
        {
            HtxCode = "TC",
            Database = new DatabaseOptions { Provider = DatabaseProvider.Sqlite, SqlitePath = Path.Combine(_folder, "t.db") },
            CoreSync = new CoreSyncOptions { BaseUrl = "https://core.example", ClientId = "dxos-staff-tc" },
        };
        _secrets = new MemorySecrets { Value = "s3cret" };
        _core = new FakeCore();
        var services = new ServiceCollection();
        services.AddTeaStaffInfrastructure(_config);
        services.AddSingleton<ICoreSecretStore>(_secrets);
        services.AddSingleton(_ => new CoreSyncService(_config, _secrets, new HttpClient(_core), _sp.GetRequiredService<IEmployeeRepository>(),
            _sp.GetRequiredService<ITaskRepository>(), _sp.GetRequiredService<IAttendanceRepository>(), _sp.GetRequiredService<TeaStaff.Core.Services.TaskService>(),
            _sp.GetRequiredService<IClock>()));
        _sp = services.BuildServiceProvider();
        await _sp.GetRequiredService<DatabaseInitializer>().InitializeAsync();
    }

    public Task DisposeAsync()
    {
        _sp.Dispose();
        try { Directory.Delete(_folder, true); } catch (IOException) { }
        return Task.CompletedTask;
    }

    private CoreSyncService Sync => _sp.GetRequiredService<CoreSyncService>();
    private ITaskRepository Tasks => _sp.GetRequiredService<ITaskRepository>();

    private static string TaskJson(string proposal, string? assignee, string title = "Tưới thửa A3") =>
        JsonSerializer.Serialize(new
        {
            data = new
            {
                tasks = new[]
                {
                    new { proposal_id = proposal, title_vi = title, note_vi = "Đất khô", parcel_code = "A3", due_date = DateTime.Today.ToString("yyyy-MM-dd"),
                          assignee_ref = assignee, approved_by_name = "Chủ nhiệm", approved_at = DateTime.UtcNow },
                },
            },
        });

    [Fact]
    public async Task No_settings_makes_no_calls()
    {
        _config.CoreSync.BaseUrl = "";
        await Sync.RunOnceAsync();
        Assert.Empty(_core.Requests);

        _config.CoreSync.BaseUrl = "https://core.example";
        _secrets.Value = null;
        await Sync.RunOnceAsync();
        Assert.Empty(_core.Requests);
    }

    [Fact]
    public async Task Plain_http_to_a_remote_host_is_refused()
    {
        _config.CoreSync.BaseUrl = "http://core.example";
        await Sync.RunOnceAsync();
        Assert.Empty(_core.Requests);
        Assert.True(CoreSyncOptions.IsValidBaseUrl("http://localhost:9081"));
        Assert.True(CoreSyncOptions.IsValidBaseUrl("https://core.example"));
        Assert.False(CoreSyncOptions.IsValidBaseUrl("ftp://core.example"));
    }

    [Fact]
    public async Task Token_uses_client_credentials_and_bearer_is_sent()
    {
        await Sync.RunOnceAsync();
        var token = _core.Requests[0];
        Assert.Equal("http://localhost:8080/realms/agrimarket/protocol/openid-connect/token", token.Url);
        Assert.Contains("grant_type=client_credentials", token.Body);
        Assert.Contains("client_id=dxos-staff-tc", token.Body);
        Assert.Contains("client_secret=s3cret", token.Body);
        Assert.All(_core.Requests.Skip(1), r => Assert.Equal("Bearer tok", r.Authorization));
    }

    [Fact]
    public async Task Roster_and_attendance_bodies()
    {
        await Sync.RunOnceAsync();
        var roster = _core.Requests.Single(r => r.Method == "PUT" && r.Url.EndsWith("/api/internal/staff/roster"));
        var staff = JsonDocument.Parse(roster.Body).RootElement.GetProperty("staff");
        Assert.Equal(8, staff.GetArrayLength());
        var first = staff[0];
        Assert.Equal("Nguyễn Văn An", first.GetProperty("name").GetString());
        Assert.Equal("Tổ hái chè", first.GetProperty("department").GetString());
        Assert.True(first.GetProperty("active").GetBoolean());
        Assert.False(first.TryGetProperty("phone", out _));
        Assert.DoesNotContain("BaseSalary", roster.Body, StringComparison.OrdinalIgnoreCase);

        var att = _core.Requests.Single(r => r.Url.EndsWith("/api/internal/staff/attendance"));
        var body = JsonDocument.Parse(att.Body).RootElement;
        Assert.Equal(DateTime.Today.ToString("yyyy-MM-dd"), body.GetProperty("day").GetString());
        Assert.Equal(6, body.GetProperty("present").GetInt32()); // the demo data has six check-ins today
    }

    [Fact]
    public async Task Pulled_task_is_created_once_and_acknowledged_with_its_id()
    {
        var assignee = (await _sp.GetRequiredService<IEmployeeRepository>().ListAsync()).First().Id.ToString();
        _core.TasksJson = TaskJson("p-1", assignee);
        await Sync.RunOnceAsync();
        await Sync.RunOnceAsync(); // the proposal is listed again: a restart before the ack was recorded

        var created = (await Tasks.ListAsync()).Where(t => t.ExternalRef == "p-1").ToList();
        var task = Assert.Single(created);
        Assert.Equal("Tưới thửa A3", task.Title);
        Assert.Equal(WorkTaskStatus.Assigned, task.Status);
        Assert.Equal(assignee, task.AssigneeId.ToString());
        var acks = _core.Requests.Where(r => r.Url.EndsWith("/api/internal/staff/tasks/p-1/ack")).ToList();
        Assert.Equal(2, acks.Count);
        Assert.All(acks, a => Assert.Equal(task.Id.ToString(), JsonDocument.Parse(a.Body).RootElement.GetProperty("task_id").GetString()));
    }

    [Fact]
    public async Task Expired_ack_marks_the_task_cancelled_and_keeps_it()
    {
        var assignee = (await _sp.GetRequiredService<IEmployeeRepository>().ListAsync()).First().Id.ToString();
        _core.TasksJson = TaskJson("p-2", assignee);
        _core.AckStatus = HttpStatusCode.Conflict;
        await Sync.RunOnceAsync();
        var task = Assert.Single(await Tasks.ListAsync(), t => t.ExternalRef == "p-2");
        Assert.Equal(WorkTaskStatus.Cancelled, task.Status);
    }

    [Fact]
    public async Task Task_without_a_usable_assignee_is_not_created_or_acknowledged()
    {
        _core.TasksJson = TaskJson("p-3", null);
        await Sync.RunOnceAsync();
        _core.TasksJson = TaskJson("p-4", "99999");
        await Sync.RunOnceAsync();
        Assert.DoesNotContain(await Tasks.ListAsync(), t => t.ExternalRef is "p-3" or "p-4");
        Assert.DoesNotContain(_core.Requests, r => r.Url.EndsWith("/ack"));
    }

    [Fact]
    public async Task A_failing_step_never_throws_and_the_next_steps_still_run()
    {
        _core.FailRoster = true;
        var assignee = (await _sp.GetRequiredService<IEmployeeRepository>().ListAsync()).First().Id.ToString();
        _core.TasksJson = TaskJson("p-5", assignee);
        await Sync.RunOnceAsync();
        Assert.Single(await Tasks.ListAsync(), t => t.ExternalRef == "p-5");
    }

    [Fact]
    public async Task Service_can_be_stopped_on_sign_out_and_started_again_on_the_next_sign_in()
    {
        await Sync.StartAsync(default);
        await Sync.StopAsync(default);
        var before = _core.Requests.Count;
        await Sync.StartAsync(default);
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (_core.Requests.Count == before && DateTime.UtcNow < deadline) await Task.Delay(20);
        await Sync.StopAsync(default);
        Assert.True(_core.Requests.Count > before);
    }

    [Fact]
    public async Task Token_failure_stops_the_round_without_throwing()
    {
        _core.TokenStatus = HttpStatusCode.Unauthorized;
        await Sync.RunOnceAsync();
        Assert.Single(_core.Requests);
    }

    [Fact]
    public async Task Database_from_an_older_version_gains_the_external_ref_column_and_index()
    {
        var factory = _sp.GetRequiredService<IDbContextFactory<AppDbContext>>();
        await using (var db = await factory.CreateDbContextAsync())
        {
            await db.Database.ExecuteSqlRawAsync("DROP INDEX \"IX_work_tasks_external_ref\"");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE work_tasks DROP COLUMN external_ref");
        }
        await _sp.GetRequiredService<DatabaseInitializer>().InitializeAsync();
        await _sp.GetRequiredService<DatabaseInitializer>().InitializeAsync(); // idempotent
        var assignee = (await _sp.GetRequiredService<IEmployeeRepository>().ListAsync()).First();
        await Tasks.SaveAsync(new WorkTask { HtxCode = "TC", Title = "a", AssigneeId = assignee.Id, ExternalRef = "dup" });
        await Assert.ThrowsAnyAsync<Exception>(() => Tasks.SaveAsync(new WorkTask { HtxCode = "TC", Title = "b", AssigneeId = assignee.Id, ExternalRef = "dup" }));
    }

    private sealed class MemorySecrets : ICoreSecretStore
    {
        public string? Value { get; set; }
        public string? Read() => Value;
        public void Save(string? secret) => Value = secret;
    }

    private sealed record Seen(string Method, string Url, string Body, string? Authorization);

    private sealed class FakeCore : HttpMessageHandler
    {
        public List<Seen> Requests { get; } = [];
        public string TasksJson { get; set; } = "{\"data\":{\"tasks\":[]}}";
        public HttpStatusCode AckStatus { get; set; } = HttpStatusCode.OK;
        public HttpStatusCode TokenStatus { get; set; } = HttpStatusCode.OK;
        public bool FailRoster { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            var url = request.RequestUri!.ToString();
            Requests.Add(new Seen(request.Method.Method, url, body, request.Headers.Authorization?.ToString()));
            if (url.EndsWith("/protocol/openid-connect/token"))
                return Json(TokenStatus, "{\"access_token\":\"tok\",\"expires_in\":300}");
            if (url.EndsWith("/roster")) return FailRoster ? Json(HttpStatusCode.InternalServerError, "{}") : Json(HttpStatusCode.OK, "{\"data\":{}}");
            if (url.EndsWith("/attendance")) return Json(HttpStatusCode.OK, "{\"data\":{}}");
            if (url.EndsWith("/ack")) return Json(AckStatus, "{\"data\":{}}");
            if (url.EndsWith("/api/internal/staff/tasks")) return Json(HttpStatusCode.OK, TasksJson);
            return Json(HttpStatusCode.NotFound, "{}");
        }

        private static HttpResponseMessage Json(HttpStatusCode code, string body) =>
            new(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }
}
