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
