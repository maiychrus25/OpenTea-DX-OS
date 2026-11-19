// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using Microsoft.EntityFrameworkCore;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;

namespace TeaStaff.Infrastructure.Persistence;

/// <summary>
/// Each operation opens a short-lived context, so the WPF UI thread and the mobile API
/// can use the repositories concurrently.
/// </summary>
public abstract class EfRepository(IDbContextFactory<AppDbContext> factory)
{
    protected async Task<T> RunAsync<T>(Func<AppDbContext, Task<T>> work, CancellationToken ct)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        return await work(db);
    }

    protected async Task<T> UpsertAsync<T>(T entity, CancellationToken ct) where T : TenantEntity
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        // Entry().State attaches only the root entity, never the navigation graph.
        db.Entry(entity).State = entity.Id == 0 ? EntityState.Added : EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return entity;
    }

    protected async Task RemoveAsync<T>(int id, CancellationToken ct) where T : TenantEntity
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var entity = await db.Set<T>().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return;
        db.Remove(entity);
        await db.SaveChangesAsync(ct);
    }
}

public sealed class DepartmentRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), IDepartmentRepository
{
    public Task<IReadOnlyList<Department>> ListAsync(CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<Department>>(async db => await db.Departments.AsNoTracking().OrderBy(d => d.Name).ToListAsync(ct), ct);

    public Task<Department> SaveAsync(Department department, CancellationToken ct = default) => UpsertAsync(department, ct);

    public Task DeleteAsync(int id, CancellationToken ct = default) => RemoveAsync<Department>(id, ct);

    public Task<int> CountEmployeesAsync(int departmentId, CancellationToken ct = default) =>
        RunAsync(db => db.Employees.CountAsync(e => e.DepartmentId == departmentId, ct), ct);
}

public sealed class EmployeeRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), IEmployeeRepository
{
    public Task<IReadOnlyList<Employee>> ListAsync(CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<Employee>>(async db => await db.Employees.AsNoTracking().Include(e => e.Department).OrderBy(e => e.Code).ToListAsync(ct), ct);

    public Task<Employee?> GetAsync(int id, CancellationToken ct = default) =>
        RunAsync(db => db.Employees.AsNoTracking().Include(e => e.Department).FirstOrDefaultAsync(e => e.Id == id, ct), ct);

    public Task<Employee?> FindByUsernameAsync(string username, CancellationToken ct = default) =>
        RunAsync(db => db.Employees.AsNoTracking().Include(e => e.Department).FirstOrDefaultAsync(e => e.Username == username, ct), ct);

    public Task<bool> CodeExistsAsync(string code, int exceptId, CancellationToken ct = default) =>
        RunAsync(db => db.Employees.AnyAsync(e => e.Code == code && e.Id != exceptId, ct), ct);

    public Task<bool> UsernameExistsAsync(string username, int exceptId, CancellationToken ct = default) =>
        RunAsync(db => db.Employees.IgnoreQueryFilters().AnyAsync(e => e.Username == username && e.Id != exceptId, ct), ct);

    public Task<Employee> SaveAsync(Employee employee, CancellationToken ct = default) => UpsertAsync(employee, ct);

    public Task DeleteAsync(int id, CancellationToken ct = default) => RemoveAsync<Employee>(id, ct);

    public Task<string> NextCodeAsync(CancellationToken ct = default) => RunAsync(async db =>
    {
        var codes = await db.Employees.IgnoreQueryFilters().Select(e => e.Code).ToListAsync(ct);
        var max = codes.Select(c => int.TryParse(c.TrimStart('N', 'V'), out var n) ? n : 0).DefaultIfEmpty(0).Max();
        return $"NV{max + 1:000}";
    }, ct);
}

public sealed class TaskRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), ITaskRepository
{
    public Task<IReadOnlyList<WorkTask>> ListAsync(int? assigneeId = null, CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<WorkTask>>(async db =>
        {
            var q = db.Tasks.AsNoTracking().Include(t => t.Assignee).AsQueryable();
            if (assigneeId is not null) q = q.Where(t => t.AssigneeId == assigneeId);
            var list = await q.ToListAsync(ct);
            return list.OrderBy(t => t.IsOpen ? 0 : 1).ThenBy(t => t.DueDate).ToList();
        }, ct);

    public Task<WorkTask?> GetAsync(int id, CancellationToken ct = default) =>
        RunAsync(db => db.Tasks.AsNoTracking().Include(t => t.Assignee).FirstOrDefaultAsync(t => t.Id == id, ct), ct);

    public Task<WorkTask> SaveAsync(WorkTask task, CancellationToken ct = default) => UpsertAsync(task, ct);

    public Task DeleteAsync(int id, CancellationToken ct = default) => RemoveAsync<WorkTask>(id, ct);
}

public sealed class AttendanceRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), IAttendanceRepository
{
    public Task<IReadOnlyList<AttendanceRecord>> ListAsync(DateOnly from, DateOnly to, int? employeeId = null, CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<AttendanceRecord>>(async db =>
        {
            var q = db.Attendance.AsNoTracking().Include(a => a.Employee).Where(a => a.WorkDate >= from && a.WorkDate <= to);
            if (employeeId is not null) q = q.Where(a => a.EmployeeId == employeeId);
            return await q.OrderBy(a => a.WorkDate).ToListAsync(ct);
        }, ct);

    public Task<AttendanceRecord?> GetAsync(int employeeId, DateOnly day, CancellationToken ct = default) =>
        RunAsync(db => db.Attendance.AsNoTracking().FirstOrDefaultAsync(a => a.EmployeeId == employeeId && a.WorkDate == day, ct), ct);

    public Task<AttendanceRecord> SaveAsync(AttendanceRecord record, CancellationToken ct = default) => UpsertAsync(record, ct);

    public Task DeleteAsync(int id, CancellationToken ct = default) => RemoveAsync<AttendanceRecord>(id, ct);
}

public sealed class LeaveRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), ILeaveRepository
{
    public Task<IReadOnlyList<LeaveRequest>> ListAsync(int? employeeId = null, CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<LeaveRequest>>(async db =>
        {
            var q = db.Leaves.AsNoTracking().Include(l => l.Employee).AsQueryable();
            if (employeeId is not null) q = q.Where(l => l.EmployeeId == employeeId);
            var list = await q.ToListAsync(ct);
            return list.OrderBy(l => l.Status == LeaveStatus.Pending ? 0 : 1).ThenByDescending(l => l.FromDate).ToList();
        }, ct);

    public Task<LeaveRequest?> GetAsync(int id, CancellationToken ct = default) =>
        RunAsync(db => db.Leaves.AsNoTracking().Include(l => l.Employee).FirstOrDefaultAsync(l => l.Id == id, ct), ct);

    public Task<LeaveRequest> SaveAsync(LeaveRequest request, CancellationToken ct = default) => UpsertAsync(request, ct);
}

public sealed class PayslipRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), IPayslipRepository
{
    public Task<IReadOnlyList<Payslip>> ListAsync(int year, int month, CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<Payslip>>(async db => await db.Payslips.AsNoTracking().Include(p => p.Employee)
            .Where(p => p.Year == year && p.Month == month).OrderBy(p => p.Employee!.Code).ToListAsync(ct), ct);

    public Task<IReadOnlyList<Payslip>> ListForEmployeeAsync(int employeeId, CancellationToken ct = default) =>
        RunAsync<IReadOnlyList<Payslip>>(async db => await db.Payslips.AsNoTracking()
            .Where(p => p.EmployeeId == employeeId).OrderByDescending(p => p.Year).ThenByDescending(p => p.Month).ToListAsync(ct), ct);

    public Task<Payslip> SaveAsync(Payslip payslip, CancellationToken ct = default) => UpsertAsync(payslip, ct);

    public Task DeleteAsync(int id, CancellationToken ct = default) => RemoveAsync<Payslip>(id, ct);
}

public sealed class SettingsRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), ISettingsRepository
{
    public Task<string?> GetAsync(string key, CancellationToken ct = default) =>
        RunAsync(async db => (await db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == key, ct))?.Value, ct);

    public Task SetAsync(string key, string value, CancellationToken ct = default) => RunAsync(async db =>
    {
        var row = await db.Settings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row is null) db.Settings.Add(new AppSetting { Key = key, Value = value });
        else row.Value = value;
        return await db.SaveChangesAsync(ct);
    }, ct);
}

public sealed class OwnerAccountRepository(IDbContextFactory<AppDbContext> f) : EfRepository(f), IOwnerAccountRepository
{
    public Task<OwnerAccount?> FindAsync(string username, CancellationToken ct = default) =>
        RunAsync(db => db.Owners.AsNoTracking().FirstOrDefaultAsync(o => o.Username == username, ct), ct);

    public Task<OwnerAccount> SaveAsync(OwnerAccount account, CancellationToken ct = default) => UpsertAsync(account, ct);

    public Task<bool> AnyAsync(CancellationToken ct = default) => RunAsync(db => db.Owners.AnyAsync(ct), ct);
}
