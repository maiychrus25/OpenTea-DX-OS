// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Infrastructure.MobileApi;

/// <summary>
/// Small REST API hosted inside the owner app so staff phones on the same network can
/// receive tasks. The contract (docs/mobile-api.md) is the same one a DX-OS mini-app
/// would expose under <c>/apps/staff-work/api</c>, so the Android app can switch servers.
/// </summary>
public sealed class MobileApiServer(IServiceProvider services, AppConfig config) : IAsyncDisposable, IDisposable
{
    private WebApplication? _app;
    private readonly ConcurrentDictionary<string, Session> _sessions = new();
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(12);

    public bool IsRunning => _app is not null;
    public string? LastError { get; private set; }
    public int Port => config.MobileApi.Port;

    private sealed record Session(int EmployeeId, DateTime ExpiresAt);

    public async Task<bool> StartAsync()
    {
        if (_app is not null) return true;
        LastError = null;
        try
        {
            var builder = WebApplication.CreateSlimBuilder();
            builder.Logging.ClearProviders();
            builder.WebHost.UseUrls($"http://0.0.0.0:{config.MobileApi.Port}");
            builder.Services.ConfigureHttpJsonOptions(o =>
            {
                o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
                o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
            });
            var app = builder.Build();
            Map(app);
            await app.StartAsync();
            _app = app;
            return true;
        }
        catch (Exception e) when (e is IOException or SocketException or InvalidOperationException)
        {
            LastError = $"Không mở được cổng {config.MobileApi.Port}: {e.Message}";
            return false;
        }
    }

    public async Task StopAsync()
    {
        if (_app is null) return;
        await _app.StopAsync();
        await _app.DisposeAsync();
        _app = null;
    }

    public async ValueTask DisposeAsync() => await StopAsync();

    public void Dispose() => Task.Run(StopAsync).Wait(TimeSpan.FromSeconds(3));

    /// <summary>IPv4 addresses of active network adapters, for display in the owner app.</summary>
    public static IReadOnlyList<string> LocalAddresses() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address))
            .Select(a => a.Address.ToString())
            .Distinct()
            .ToList();

    private T Get<T>() where T : notnull => services.GetRequiredService<T>();

    private int? Authenticate(HttpContext http)
    {
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.Ordinal)) return null;
        var token = header["Bearer ".Length..].Trim();
        if (!_sessions.TryGetValue(token, out var s)) return null;
        if (s.ExpiresAt < DateTime.UtcNow)
        {
            _sessions.TryRemove(token, out _);
            return null;
        }
        return s.EmployeeId;
    }

    private async Task<IResult> Guard(HttpContext http, Func<int, Task<IResult>> action)
    {
        var id = Authenticate(http);
        if (id is null) return Results.Json(new ApiError("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."), statusCode: 401);
        try
        {
            return await action(id.Value);
        }
        catch (DomainException e)
        {
            return Results.Json(new ApiError(e.Message), statusCode: 400);
        }
    }

    private void Map(WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Ok(new { status = "ok", htxCode = config.HtxCode, htxName = config.HtxName, version = "1.2.0" }));

        api.MapPost("/auth/login", async (LoginRequest body) =>
        {
            if (string.IsNullOrWhiteSpace(body.Username) || string.IsNullOrEmpty(body.Password))
                return Results.Json(new ApiError("Vui lòng nhập tên đăng nhập và mật khẩu."), statusCode: 400);
            var employee = await Get<EmployeeService>().AuthenticateAsync(body.Username, body.Password);
            if (employee is null) return Results.Json(new ApiError("Tên đăng nhập hoặc mật khẩu không đúng."), statusCode: 401);
            var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace('+', '-').Replace('/', '_').TrimEnd('=');
            _sessions[token] = new Session(employee.Id, DateTime.UtcNow.Add(SessionLifetime));
            return Results.Ok(new LoginResponse(token, ProfileDto.From(employee, config)));
        });

        api.MapPost("/auth/logout", (HttpContext http) =>
        {
            var header = http.Request.Headers.Authorization.ToString();
            if (header.StartsWith("Bearer ", StringComparison.Ordinal)) _sessions.TryRemove(header[7..].Trim(), out _);
            return Results.NoContent();
        });

        api.MapGet("/me", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
        {
            var e = await Get<IEmployeeRepository>().GetAsync(id);
            return e is null ? Results.NotFound() : Results.Ok(ProfileDto.From(e, config));
        }));

        api.MapPost("/me/password", (HttpContext http, ChangePasswordRequest body) => Guard(http, async id =>
        {
            await Get<EmployeeService>().ChangePasswordAsync(id, body.CurrentPassword ?? "", body.NewPassword ?? "");
            return Results.NoContent();
        }));

        api.MapGet("/tasks", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
        {
            var tasks = await Get<ITaskRepository>().ListAsync(id);
            return Results.Ok(tasks.Where(t => t.Status != WorkTaskStatus.Cancelled).Select(t => TaskDto.From(t, DateTime.Now)));
        }));

        api.MapGet("/tasks/{taskId:int}", (HttpContext http, int taskId) => Guard(http, async id =>
        {
            var t = await Get<ITaskRepository>().GetAsync(taskId);
            return t is null || t.AssigneeId != id ? Results.NotFound() : Results.Ok(TaskDto.From(t, DateTime.Now));
        }));

        api.MapPost("/tasks/{taskId:int}/status", (HttpContext http, int taskId, TaskStatusRequest body) => Guard(http, async id =>
        {
            var t = await Get<TaskService>().StaffUpdateAsync(id, taskId, body.Status, body.Progress, body.Note);
            var fresh = await Get<ITaskRepository>().GetAsync(t.Id);
            return Results.Ok(TaskDto.From(fresh ?? t, DateTime.Now));
        }));

        api.MapGet("/attendance", (HttpContext http, string? month) => Guard(http, async id =>
        {
            var (from, to) = MonthRange(month);
            var records = await Get<IAttendanceRepository>().ListAsync(from, to, id);
            var dtos = records.Select(AttendanceDto.From).ToList();
            return Results.Ok(new AttendanceMonthDto(
                from.ToString("yyyy-MM"),
                records.Sum(r => PayrollCalculator.WorkDayValue(r.Status)),
                records.Count(r => r.Status is AttendanceStatus.PaidLeave or AttendanceStatus.UnpaidLeave),
                records.Count(r => r.Status == AttendanceStatus.Absent),
                records.Sum(r => r.OvertimeHours),
                dtos));
        }));

        api.MapGet("/attendance/today", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
        {
            var r = await Get<IAttendanceRepository>().GetAsync(id, DateOnly.FromDateTime(DateTime.Now));
            return Results.Ok(r is null ? null : AttendanceDto.From(r));
        }));

        api.MapPost("/attendance/check-in", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
            Results.Ok(AttendanceDto.From(await Get<AttendanceService>().CheckInAsync(id, RecordSource.Mobile)))));

        api.MapPost("/attendance/check-out", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
            Results.Ok(AttendanceDto.From(await Get<AttendanceService>().CheckOutAsync(id)))));

        api.MapGet("/leaves", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
        {
            var list = await Get<ILeaveRepository>().ListAsync(id);
            var remaining = await Get<LeaveService>().RemainingAnnualDaysAsync(id, DateTime.Now.Year);
            return Results.Ok(new LeaveListDto(remaining, list.Select(LeaveDto.From).ToList()));
        }));

        api.MapPost("/leaves", (HttpContext http, LeaveCreateRequest body) => Guard(http, async id =>
        {
            if (!DateOnly.TryParseExact(body.FromDate, "yyyy-MM-dd", out var from) || !DateOnly.TryParseExact(body.ToDate, "yyyy-MM-dd", out var to))
                throw new DomainException("Ngày nghỉ không hợp lệ (định dạng yyyy-MM-dd).");
            LeaveAttachment? file = null;
            if (!string.IsNullOrEmpty(body.Attachment?.DataBase64))
            {
                try { file = new LeaveAttachment(body.Attachment.FileName ?? "", Convert.FromBase64String(body.Attachment.DataBase64)); }
                catch (FormatException) { throw new DomainException("Tệp minh chứng bị lỗi, vui lòng chọn lại."); }
            }
            var saved = await Get<LeaveService>().SubmitAsync(new LeaveRequest
            {
                EmployeeId = id, FromDate = from, ToDate = to, Type = body.Type, Reason = body.Reason, Source = RecordSource.Mobile,
            }, file);
            return Results.Ok(LeaveDto.From(saved));
        }));

        api.MapGet("/leaves/{leaveId:int}/attachment", (HttpContext http, int leaveId, CancellationToken ct) => Guard(http, async id =>
        {
            var leave = await Get<ILeaveRepository>().GetAsync(leaveId);
            if (leave is null || leave.EmployeeId != id || !leave.HasAttachment) return Results.NotFound();
            var bytes = await Get<LeaveService>().ReadAttachmentAsync(leave);
            return bytes is null ? Results.NotFound() : Results.File(bytes, leave.AttachmentContentType ?? "application/octet-stream", leave.AttachmentName);
        }));

        api.MapPost("/leaves/{leaveId:int}/cancel", (HttpContext http, int leaveId) => Guard(http, async id =>
        {
            await Get<LeaveService>().CancelAsync(id, leaveId);
            return Results.NoContent();
        }));

        api.MapGet("/payslips", (HttpContext http, CancellationToken ct) => Guard(http, async id =>
        {
            var list = await Get<IPayslipRepository>().ListForEmployeeAsync(id);
            return Results.Ok(list.Where(p => p.Status != PayslipStatus.Draft).Select(PayslipDto.From));
        }));
    }

    private static (DateOnly From, DateOnly To) MonthRange(string? month)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        var start = new DateOnly(today.Year, today.Month, 1);
        if (!string.IsNullOrEmpty(month) && DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", out var parsed)) start = parsed;
        return (start, start.AddMonths(1).AddDays(-1));
    }
}
