// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Services;

/// <summary>State machine for an assigned task, shared by the owner app and the staff API.</summary>
public static class TaskWorkflow
{
    private static readonly Dictionary<WorkTaskStatus, WorkTaskStatus[]> StaffTransitions = new()
    {
        [WorkTaskStatus.Assigned] = [WorkTaskStatus.Accepted, WorkTaskStatus.Rejected],
        [WorkTaskStatus.Accepted] = [WorkTaskStatus.InProgress, WorkTaskStatus.Completed],
        [WorkTaskStatus.InProgress] = [WorkTaskStatus.InProgress, WorkTaskStatus.Completed],
        [WorkTaskStatus.Completed] = [],
        [WorkTaskStatus.Rejected] = [],
        [WorkTaskStatus.Cancelled] = [],
    };

    public static bool CanStaffMove(WorkTaskStatus from, WorkTaskStatus to) =>
        StaffTransitions.TryGetValue(from, out var allowed) && allowed.Contains(to);

    public static IReadOnlyList<WorkTaskStatus> NextStatesForStaff(WorkTaskStatus from) =>
        StaffTransitions.TryGetValue(from, out var allowed) ? allowed : [];

    /// <summary>Applies a staff update and returns the mutated task.</summary>
    public static WorkTask ApplyStaffUpdate(WorkTask task, WorkTaskStatus to, int? progress, string? note, DateTime now)
    {
        if (!CanStaffMove(task.Status, to))
            throw new DomainException($"Không thể chuyển công việc từ \"{Labels.Of(task.Status)}\" sang \"{Labels.Of(to)}\".");
        if (to == WorkTaskStatus.Rejected && string.IsNullOrWhiteSpace(note))
            throw new DomainException("Vui lòng ghi lý do từ chối công việc.");

        task.Status = to;
        task.Progress = to switch
        {
            WorkTaskStatus.Completed => 100,
            WorkTaskStatus.InProgress => Math.Clamp(progress ?? Math.Max(task.Progress, 10), 0, 99),
            _ => task.Progress,
        };
        if (!string.IsNullOrWhiteSpace(note)) task.ReportNote = note.Trim();
        task.CompletedAt = to == WorkTaskStatus.Completed ? now : null;
        task.UpdatedAt = DateTime.UtcNow;
        return task;
    }
}
