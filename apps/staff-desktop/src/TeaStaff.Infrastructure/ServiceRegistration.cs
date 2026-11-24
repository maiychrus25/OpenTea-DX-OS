// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Services;
using TeaStaff.Infrastructure.Identity;
using TeaStaff.Infrastructure.MobileApi;
using TeaStaff.Infrastructure.Persistence;

namespace TeaStaff.Infrastructure;

public static class ServiceRegistration
{
    public static IServiceCollection AddTeaStaffInfrastructure(this IServiceCollection services, AppConfig config)
    {
        // DX-OS stores local timestamps; keep Npgsql's pre-6.0 behaviour so DateTime.Now round-trips.
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

        services.AddSingleton(config);
        services.AddSingleton(config.Database);
        services.AddSingleton<ITenantContext, TenantContext>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IDataChangeNotifier, DataChangeNotifier>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IActivityFeed, ActivityFeed>();
        services.AddSingleton<IAttachmentStore>(_ => new Storage.LocalAttachmentStore());

        services.AddDbContextFactory<AppDbContext>(options =>
        {
            if (config.Database.Provider == DatabaseProvider.Postgres)
                options.UseNpgsql(config.Database.PostgresConnection, o => o.MigrationsHistoryTable("__ef_migrations", AppDbContext.CoreSchema));
            else
                options.UseSqlite($"Data Source={config.Database.SqlitePath}");
        }, ServiceLifetime.Singleton);

        services.AddSingleton<IDepartmentRepository, DepartmentRepository>();
        services.AddSingleton<IEmployeeRepository, EmployeeRepository>();
        services.AddSingleton<ITaskRepository, TaskRepository>();
        services.AddSingleton<IAttendanceRepository, AttendanceRepository>();
        services.AddSingleton<ILeaveRepository, LeaveRepository>();
        services.AddSingleton<IPayslipRepository, PayslipRepository>();
        services.AddSingleton<ISettingsRepository, SettingsRepository>();
        services.AddSingleton<IOwnerAccountRepository, OwnerAccountRepository>();
        services.AddSingleton<IRecurringTaskRepository, RecurringTaskRepository>();
        services.AddSingleton<IAutomationRepository, AutomationRepository>();

        services.AddSingleton<PolicyService>();
        services.AddSingleton<EmployeeService>();
        services.AddSingleton<TaskService>();
        services.AddSingleton<AttendanceService>();
        services.AddSingleton<LeaveService>();
        services.AddSingleton<PayrollService>();
        services.AddSingleton<AutomationEngine>();

        services.AddSingleton(new HttpClient { Timeout = TimeSpan.FromSeconds(15) });
        services.AddSingleton<LocalIdentityProvider>();
        services.AddSingleton<KeycloakIdentityProvider>();
        services.AddSingleton<IIdentityProvider>(sp => config.AuthMode == AuthMode.Keycloak
            ? sp.GetRequiredService<KeycloakIdentityProvider>()
            : sp.GetRequiredService<LocalIdentityProvider>());

        services.AddSingleton<DatabaseInitializer>();
        services.AddSingleton<MobileApiServer>();
        services.AddSingleton<Diagnostics.ConnectionChecker>();
        return services;
    }
}
