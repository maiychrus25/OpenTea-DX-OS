// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaStaff.Core.Abstractions;

/// <summary>Who is signed in and which cooperative (HTX) the data belongs to.</summary>
public interface ITenantContext
{
    string HtxCode { get; }
    string UserName { get; }
    string DisplayName { get; }
    void SignIn(string htxCode, string userName, string displayName);
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);
}

public interface IClock
{
    DateTime Now { get; }
}

/// <summary>Raised when data changes outside the current screen (for example from the mobile API).</summary>
public interface IDataChangeNotifier
{
    event EventHandler<string>? Changed;
    void Notify(string area);
}

public static class DataAreas
{
    public const string Employees = "employees";
    public const string Tasks = "tasks";
    public const string Attendance = "attendance";
    public const string Leaves = "leaves";
    public const string Payroll = "payroll";
    public const string Automation = "automation";
}

/// <summary>
/// File storage for leave evidence. The desktop keeps files on disk; a DX-OS deployment can
/// swap in the core's S3 storage (SeaweedFS) behind the same port.
/// </summary>
public interface IAttachmentStore
{
    Task<string> SaveAsync(string htxCode, string extension, byte[] content, CancellationToken ct = default);
    Task<byte[]?> ReadAsync(string path, CancellationToken ct = default);
    string? LocalPath(string path);
}

/// <summary>A user-visible event worth announcing in the owner's app (e.g. a new leave request from a phone).</summary>
public sealed record ActivityEvent(string Area, string Message);

public interface IActivityFeed
{
    event EventHandler<ActivityEvent>? Raised;
    void Raise(string area, string message);
}

public sealed record SignInResult(bool Success, string? Error, string HtxCode = "", string UserName = "", string DisplayName = "");

/// <summary>
/// Authentication strategy. <c>LocalIdentityProvider</c> works offline;
/// <c>KeycloakIdentityProvider</c> signs in with the shared OpenTea DX-OS (Keycloak) account.
/// </summary>
public interface IIdentityProvider
{
    string Name { get; }
    Task<SignInResult> SignInAsync(string userName, string password, CancellationToken ct = default);
}
