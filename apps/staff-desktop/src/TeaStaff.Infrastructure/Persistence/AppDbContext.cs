// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Text;
using Microsoft.EntityFrameworkCore;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;

namespace TeaStaff.Infrastructure.Persistence;

/// <summary>
/// EF Core context. Table and column names are snake_case so the same model maps onto
/// the DX-OS PostgreSQL schema <c>app_staff_work</c> (see database/postgres/001_init.sql).
/// Every query is filtered by the current tenant's HTX code.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenant, DatabaseOptions db) : DbContext(options)
{
    public const string CoreSchema = "app_staff_work";

    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<WorkTask> Tasks => Set<WorkTask>();
    public DbSet<AttendanceRecord> Attendance => Set<AttendanceRecord>();
    public DbSet<LeaveRequest> Leaves => Set<LeaveRequest>();
    public DbSet<Payslip> Payslips => Set<Payslip>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();
    public DbSet<OwnerAccount> Owners => Set<OwnerAccount>();
    public DbSet<RecurringTask> RecurringTasks => Set<RecurringTask>();
    public DbSet<AutomationSuggestion> Suggestions => Set<AutomationSuggestion>();
    public DbSet<AutomationLog> AutomationLogs => Set<AutomationLog>();

    private string Htx => tenant.HtxCode;

    protected override void OnModelCreating(ModelBuilder b)
    {
        if (db.Provider == DatabaseProvider.Postgres) b.HasDefaultSchema(CoreSchema);

        b.Entity<Department>(e =>
        {
            e.ToTable("departments");
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.HasIndex(x => new { x.HtxCode, x.Name }).IsUnique();
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<Employee>(e =>
        {
            e.ToTable("employees");
            e.Property(x => x.Code).HasMaxLength(20).IsRequired();
            e.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            e.Property(x => x.BaseSalary).HasPrecision(14, 0);
            e.Property(x => x.Allowance).HasPrecision(14, 0);
            e.HasIndex(x => new { x.HtxCode, x.Code }).IsUnique();
            e.HasIndex(x => x.Username).IsUnique();
            e.HasOne(x => x.Department).WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.SetNull);
            e.Ignore(x => x.IsActive);
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<WorkTask>(e =>
        {
            e.ToTable("work_tasks");
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.HasOne(x => x.Assignee).WithMany().HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.HtxCode, x.AssigneeId, x.Status });
            e.Ignore(x => x.IsOpen);
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<AttendanceRecord>(e =>
        {
            e.ToTable("attendance_records");
            e.Property(x => x.OvertimeHours).HasPrecision(5, 1);
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.HtxCode, x.EmployeeId, x.WorkDate }).IsUnique();
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<LeaveRequest>(e =>
        {
            e.ToTable("leave_requests");
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            e.Ignore(x => x.Days);
            e.Ignore(x => x.HasAttachment);
            e.Property(x => x.AttachmentPath).HasMaxLength(260);
            e.Property(x => x.AttachmentName).HasMaxLength(120);
            e.Property(x => x.AttachmentContentType).HasMaxLength(60);
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<Payslip>(e =>
        {
            e.ToTable("payslips");
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.HtxCode, x.EmployeeId, x.Year, x.Month }).IsUnique();
            foreach (var p in typeof(Payslip).GetProperties().Where(p => p.PropertyType == typeof(decimal)))
                e.Property(p.Name).HasPrecision(14, 1);
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<AppSetting>(e =>
        {
            e.ToTable("app_settings");
            e.HasIndex(x => new { x.HtxCode, x.Key }).IsUnique();
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<RecurringTask>(e =>
        {
            e.ToTable("recurring_tasks");
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Weekdays).HasMaxLength(20);
            e.HasOne(x => x.Department).WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.PreferredAssignee).WithMany().HasForeignKey(x => x.PreferredAssigneeId).OnDelete(DeleteBehavior.SetNull);
            e.Ignore(x => x.Days);
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<AutomationSuggestion>(e =>
        {
            e.ToTable("automation_suggestions");
            e.Property(x => x.Title).HasMaxLength(240).IsRequired();
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.HtxCode, x.Status });
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<AutomationLog>(e =>
        {
            e.ToTable("automation_logs");
            e.Property(x => x.Rule).HasMaxLength(60);
            e.HasIndex(x => new { x.HtxCode, x.CreatedAt });
            e.HasQueryFilter(x => x.HtxCode == Htx);
        });
        b.Entity<OwnerAccount>(e =>
        {
            e.ToTable("owner_accounts");
            e.HasIndex(x => x.Username).IsUnique();
        });

        foreach (var entity in b.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
                if (property.ClrType.IsEnum) property.SetProviderClrType(typeof(string));
                if (property.Name == nameof(TenantEntity.HtxCode)) property.SetMaxLength(20);
            }
        }
    }

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<TenantEntity>())
        {
            if (entry.State == EntityState.Added)
            {
                if (string.IsNullOrEmpty(entry.Entity.HtxCode)) entry.Entity.HtxCode = Htx;
                entry.Entity.CreatedAt = DateTime.UtcNow;
            }
            if (entry.State is EntityState.Added or EntityState.Modified) entry.Entity.UpdatedAt = DateTime.UtcNow;
        }
        return base.SaveChangesAsync(ct);
    }

    private static string ToSnakeCase(string name)
    {
        var sb = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c) && i > 0) sb.Append('_');
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}
