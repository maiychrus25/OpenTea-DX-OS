// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaStaff.Core.Domain;

public enum Gender { Male, Female, Other }

public enum ContractType { FullTime, PartTime, Seasonal, Probation }

public enum SalaryType { Monthly, Daily }

public enum EmployeeStatus { Active, OnLeave, Resigned }

public enum TaskPriority { Low, Normal, High, Urgent }

public enum WorkTaskStatus { Assigned, Accepted, InProgress, Completed, Rejected, Cancelled }

public enum AttendanceStatus { Present, HalfDay, Absent, PaidLeave, UnpaidLeave }

public enum LeaveType { Annual, Sick, Unpaid, Personal }

public enum LeaveStatus { Pending, Approved, Rejected, Cancelled }

public enum PayslipStatus { Draft, Approved, Paid }

public enum RecordSource { Desktop, Mobile, Core }
