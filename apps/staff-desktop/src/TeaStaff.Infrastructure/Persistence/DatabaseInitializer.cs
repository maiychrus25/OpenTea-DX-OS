// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using Microsoft.EntityFrameworkCore;
using TeaStaff.Core.Abstractions;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Infrastructure.Persistence;

/// <summary>Creates the schema on first run and seeds a demo cooperative (all names are fictitious).</summary>
public sealed class DatabaseInitializer(IDbContextFactory<AppDbContext> factory, IPasswordHasher hasher, AppConfig config, IClock clock)
{
    public const string DefaultOwnerUser = "admin";
    public const string DefaultOwnerPassword = "Admin@123";

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        if (config.Database.Provider == DatabaseProvider.Sqlite)
            Directory.CreateDirectory(Path.GetDirectoryName(config.Database.SqlitePath)!);

        await using var db = await factory.CreateDbContextAsync(ct);
        await db.Database.EnsureCreatedAsync(ct);
        await UpgradeAsync(db, ct);

        if (!await db.Owners.AnyAsync(ct))
        {
            db.Owners.Add(new OwnerAccount
            {
                HtxCode = config.HtxCode,
                Username = DefaultOwnerUser,
                DisplayName = "Chủ nhiệm HTX",
                PasswordHash = hasher.Hash(DefaultOwnerPassword),
            });
            await db.SaveChangesAsync(ct);
        }

        if (!await db.Employees.IgnoreQueryFilters().AnyAsync(ct)) await SeedDemoAsync(db, ct);
    }

    /// <summary>
    /// Adds columns introduced after 1.0.0 to databases created by an older version
    /// (EnsureCreated never alters an existing schema). Mirrors database/postgres/002_leave_attachments.sql.
    /// </summary>
    // Column names are compile-time constants, never user input.
#pragma warning disable EF1002
    private async Task UpgradeAsync(AppDbContext db, CancellationToken ct)
    {
        string[] columns = ["attachment_path", "attachment_name", "attachment_content_type"];
        if (config.Database.Provider == DatabaseProvider.Postgres)
        {
            foreach (var c in columns)
                await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {AppDbContext.CoreSchema}.leave_requests ADD COLUMN IF NOT EXISTS {c} text NULL", ct);
            return;
        }
        var existing = await db.Database.SqlQueryRaw<string>("SELECT name AS \"Value\" FROM pragma_table_info('leave_requests')").ToListAsync(ct);
        foreach (var c in columns.Where(c => !existing.Contains(c)))
            await db.Database.ExecuteSqlRawAsync($"ALTER TABLE leave_requests ADD COLUMN {c} TEXT NULL", ct);
    }
#pragma warning restore EF1002

    private async Task SeedDemoAsync(AppDbContext db, CancellationToken ct)
    {
        var htx = config.HtxCode;
        var departments = new[]
        {
            new Department { HtxCode = htx, Name = "Tổ hái chè", Description = "Thu hái búp chè tươi theo lứa", ManagerName = "Nguyễn Văn An" },
            new Department { HtxCode = htx, Name = "Tổ chế biến", Description = "Sao, vò, phân loại chè", ManagerName = "Trần Thị Bình" },
            new Department { HtxCode = htx, Name = "Tổ chăm sóc vườn", Description = "Bón phân, tưới, phòng trừ sâu bệnh" },
            new Department { HtxCode = htx, Name = "Kho vận & bán hàng", Description = "Đóng gói, giao hàng, cửa hàng" },
            new Department { HtxCode = htx, Name = "Văn phòng", Description = "Kế toán, hành chính" },
        };
        db.Departments.AddRange(departments);
        await db.SaveChangesAsync(ct);

        var password = hasher.Hash(EmployeeService.DefaultMobilePassword);
        Employee Make(int n, string name, Gender g, int dept, string position, ContractType contract, SalaryType st, decimal salary, decimal allowance, int birthYear, int hiredMonthsAgo) => new()
        {
            HtxCode = htx,
            Code = $"NV{n:000}",
            FullName = name,
            Gender = g,
            DateOfBirth = new DateOnly(birthYear, (n % 12) + 1, (n * 3 % 27) + 1),
            Phone = $"09{n:00}{(n * 7919) % 1000000:000000}",
            Email = $"nv{n:000}@htxchetancuong.example",
            Address = "Xã Tân Cương, TP Thái Nguyên",
            IdentityNumber = n == 8 ? null : $"0192{n:00}{(n * 7331) % 1000000:000000}",
            DepartmentId = departments[dept].Id,
            Position = position,
            HireDate = DateOnly.FromDateTime(clock.Now.AddMonths(-hiredMonthsAgo)),
            ContractType = contract,
            SalaryType = st,
            BaseSalary = salary,
            Allowance = allowance,
            BankName = "Agribank",
            BankAccount = $"3900{n:000}{(n * 104729) % 100000:00000}",
            Status = EmployeeStatus.Active,
            AnnualLeaveDays = contract == ContractType.FullTime ? 12 : 0,
            Username = $"nv{n:000}",
            PasswordHash = password,
        };

        var employees = new[]
        {
            Make(1, "Nguyễn Văn An", Gender.Male, 0, "Tổ trưởng hái chè", ContractType.FullTime, SalaryType.Monthly, 7_500_000, 500_000, 1985, 60),
            Make(2, "Trần Thị Bình", Gender.Female, 1, "Tổ trưởng chế biến", ContractType.FullTime, SalaryType.Monthly, 8_000_000, 700_000, 1983, 72),
            Make(3, "Lê Thị Cúc", Gender.Female, 0, "Công nhân hái chè", ContractType.Seasonal, SalaryType.Daily, 280_000, 0, 1995, 8),
            Make(4, "Phạm Văn Dũng", Gender.Male, 2, "Kỹ thuật viên vườn", ContractType.FullTime, SalaryType.Monthly, 7_000_000, 400_000, 1990, 36),
            Make(5, "Hoàng Thị Em", Gender.Female, 1, "Thợ sao chè", ContractType.FullTime, SalaryType.Monthly, 6_500_000, 300_000, 1992, 30),
            Make(6, "Vũ Văn Giang", Gender.Male, 3, "Nhân viên kho", ContractType.PartTime, SalaryType.Daily, 300_000, 0, 1998, 12),
            Make(7, "Đỗ Thị Hà", Gender.Female, 4, "Kế toán", ContractType.FullTime, SalaryType.Monthly, 9_000_000, 800_000, 1988, 48),
            Make(8, "Bùi Văn Khánh", Gender.Male, 0, "Công nhân hái chè", ContractType.Probation, SalaryType.Daily, 250_000, 0, 2001, 1),
        };
        db.Employees.AddRange(employees);
        await db.SaveChangesAsync(ct);

        var today = DateOnly.FromDateTime(clock.Now);
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var random = new Random(2026);
        for (var d = monthStart; d < today; d = d.AddDays(1))
        {
            if (d.DayOfWeek == DayOfWeek.Sunday) continue;
            foreach (var e in employees)
            {
                var roll = random.Next(100);
                var status = roll switch { < 86 => AttendanceStatus.Present, < 93 => AttendanceStatus.HalfDay, _ => AttendanceStatus.Absent };
                var start = d.ToDateTime(new TimeOnly(6, 30 + random.Next(0, 25)));
                db.Attendance.Add(new AttendanceRecord
                {
                    HtxCode = htx,
                    EmployeeId = e.Id,
                    WorkDate = d,
                    Status = status,
                    CheckIn = status == AttendanceStatus.Absent ? null : start,
                    CheckOut = status switch
                    {
                        AttendanceStatus.Present => start.AddHours(9 + random.Next(0, 3) * 0.5),
                        AttendanceStatus.HalfDay => start.AddHours(3.5),
                        _ => null,
                    },
                    OvertimeHours = status == AttendanceStatus.Present && random.Next(10) == 0 ? 1.5m : 0,
                    Source = random.Next(2) == 0 ? RecordSource.Mobile : RecordSource.Desktop,
                });
            }
        }

        // Most staff have already checked in this morning from their phones.
        foreach (var e in employees.Take(6))
        {
            db.Attendance.Add(new AttendanceRecord
            {
                HtxCode = htx, EmployeeId = e.Id, WorkDate = today, Status = AttendanceStatus.Present,
                CheckIn = today.ToDateTime(new TimeOnly(6, 35 + random.Next(0, 20))), Source = RecordSource.Mobile,
            });
        }

        var now = clock.Now;
        db.Tasks.AddRange(
            new WorkTask { HtxCode = htx, Title = "Hái chè lứa 6 đồi A3", Description = "Hái 1 tôm 2 lá, tránh dập búp. Giao búp về xưởng trước 11h.", Location = "Đồi A3 - Tân Cương", AssigneeId = employees[0].Id, Priority = TaskPriority.High, StartDate = now.Date.AddHours(7), DueDate = now.Date.AddHours(17), Status = WorkTaskStatus.InProgress, Progress = 40, AssignedBy = "Chủ nhiệm HTX" },
            new WorkTask { HtxCode = htx, Title = "Hái chè đồi B1", Description = "Phối hợp tổ trưởng An, cân búp tại điểm thu mua.", Location = "Đồi B1", AssigneeId = employees[2].Id, Priority = TaskPriority.Normal, StartDate = now.Date.AddHours(7), DueDate = now.Date.AddHours(17), Status = WorkTaskStatus.Assigned, AssignedBy = "Chủ nhiệm HTX" },
            new WorkTask { HtxCode = htx, Title = "Sao mẻ chè đinh 20kg", Description = "Nhiệt độ chảo 280°C, sao 3 lửa.", Location = "Xưởng chế biến", AssigneeId = employees[4].Id, Priority = TaskPriority.High, StartDate = now.Date.AddHours(7), DueDate = now.Date.AddDays(1).AddHours(17), Status = WorkTaskStatus.Accepted, AssignedBy = "Chủ nhiệm HTX" },
            new WorkTask { HtxCode = htx, Title = "Phun chế phẩm sinh học thửa A3", Description = "Ghi nhật ký phun và thời gian cách ly 7 ngày vào DX-OS.", Location = "Thửa TC-A3", AssigneeId = employees[3].Id, Priority = TaskPriority.Urgent, StartDate = now.Date.AddDays(-3), DueDate = now.Date.AddDays(-1).AddHours(17), Status = WorkTaskStatus.InProgress, Progress = 70, AssignedBy = "Chủ nhiệm HTX" },
            new WorkTask { HtxCode = htx, Title = "Đóng gói 50 hộp quà Tết", Description = "Hộp 200g, dán tem QR truy xuất lô TC-CHE-A3-001.", Location = "Kho thành phẩm", AssigneeId = employees[5].Id, Priority = TaskPriority.Normal, StartDate = now.Date.AddHours(7), DueDate = now.Date.AddDays(3).AddHours(17), Status = WorkTaskStatus.Assigned, AssignedBy = "Chủ nhiệm HTX" },
            new WorkTask { HtxCode = htx, Title = "Đối chiếu công nợ thu mua tháng trước", Location = "Văn phòng", AssigneeId = employees[6].Id, Priority = TaskPriority.Normal, StartDate = now.Date.AddDays(-5), DueDate = now.Date.AddDays(-2).AddHours(17), Status = WorkTaskStatus.Completed, Progress = 100, CompletedAt = now.AddDays(-2), ReportNote = "Đã đối chiếu xong, chênh lệch 0 đồng.", AssignedBy = "Chủ nhiệm HTX" },
            new WorkTask { HtxCode = htx, Title = "Làm cỏ, xới gốc đồi C2", Location = "Đồi C2", AssigneeId = employees[7].Id, Priority = TaskPriority.Low, StartDate = now.Date.AddDays(1), DueDate = now.Date.AddDays(4).AddHours(17), Status = WorkTaskStatus.Assigned, AssignedBy = "Chủ nhiệm HTX" });

        db.Leaves.AddRange(
            new LeaveRequest { HtxCode = htx, EmployeeId = employees[4].Id, FromDate = today.AddDays(3), ToDate = today.AddDays(4), Type = LeaveType.Annual, Reason = "Về quê dự đám cưới em gái", Status = LeaveStatus.Pending, Source = RecordSource.Mobile },
            new LeaveRequest { HtxCode = htx, EmployeeId = employees[2].Id, FromDate = today.AddDays(1), ToDate = today.AddDays(1), Type = LeaveType.Personal, Reason = "Đưa con đi tiêm chủng", Status = LeaveStatus.Pending, Source = RecordSource.Mobile },
            // History so the leave charts have something to show (approved, earlier months).
            new LeaveRequest { HtxCode = htx, EmployeeId = employees[0].Id, FromDate = today.AddMonths(-1).AddDays(-3), ToDate = today.AddMonths(-1).AddDays(-2), Type = LeaveType.Annual, Reason = "Việc gia đình", Status = LeaveStatus.Approved, ReviewedBy = "Chủ nhiệm HTX", Source = RecordSource.Mobile },
            new LeaveRequest { HtxCode = htx, EmployeeId = employees[3].Id, FromDate = today.AddMonths(-2), ToDate = today.AddMonths(-2).AddDays(2), Type = LeaveType.Sick, Reason = "Sốt xuất huyết", Status = LeaveStatus.Approved, ReviewedBy = "Chủ nhiệm HTX", Source = RecordSource.Mobile },
            new LeaveRequest { HtxCode = htx, EmployeeId = employees[5].Id, FromDate = today.AddMonths(-3), ToDate = today.AddMonths(-3), Type = LeaveType.Unpaid, Reason = "Việc riêng", Status = LeaveStatus.Approved, ReviewedBy = "Chủ nhiệm HTX", Source = RecordSource.Desktop },
            new LeaveRequest { HtxCode = htx, EmployeeId = employees[6].Id, FromDate = today.AddMonths(-4), ToDate = today.AddMonths(-4).AddDays(1), Type = LeaveType.Personal, Reason = "Dự đám cưới", Status = LeaveStatus.Approved, ReviewedBy = "Chủ nhiệm HTX", Source = RecordSource.Mobile });

        await db.SaveChangesAsync(ct);
    }
}
