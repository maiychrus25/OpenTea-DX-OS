// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using System.Text;
using TeaStaff.Core.Domain;

namespace TeaStaff.Core.Services;

/// <summary>What the owner wants done; the advisor ranks who could do it.</summary>
public sealed record AssignmentRequest(string Title, string? Location, DateTime Start, DateTime Due, int? DepartmentId = null, int? ExcludeEmployeeId = null);

/// <summary>One fact behind a ranking, taken from the cooperative's own records.</summary>
public sealed record AssignmentFact(string Text, bool Positive);

public sealed record AssignmentCandidate(Employee Employee, double Score, bool Available, IReadOnlyList<AssignmentFact> Facts)
{
    public int Percent => (int)Math.Round(Score * 100);
    public string Summary => string.Join(" · ", Facts.Select(f => f.Text));
}

/// <summary>
/// Ranks staff for a task from history: similar work done, on-time rate, current workload,
/// team, familiarity with the place, past rejections, leave and today's attendance.
/// Following the DX-OS AI rule, it never assigns by itself: it shows the facts behind each
/// score and the owner (or a rule the owner switched on) makes the choice.
/// </summary>
public static class AssignmentAdvisor
{
    public const double SimilarityThreshold = 0.5;

    private const double WExperience = 0.30, WOnTime = 0.20, WLoad = 0.25, WTeam = 0.15, WPlace = 0.10;
    private const double PenaltyRejected = 0.15, BonusPresent = 0.05;

    public static IReadOnlyList<AssignmentCandidate> Rank(AssignmentRequest request, IEnumerable<Employee> staff, IEnumerable<WorkTask> history,
        IEnumerable<LeaveRequest> leaves, IEnumerable<AttendanceRecord> attendanceToday, DateTime now)
    {
        var tasks = history.ToList();
        var leaveList = leaves.Where(l => l.Status is LeaveStatus.Approved or LeaveStatus.Pending).ToList();
        var present = attendanceToday.Where(a => a.WorkDate == DateOnly.FromDateTime(now)).ToDictionary(a => a.EmployeeId);
        var wanted = Tokens(request.Title);
        var from = DateOnly.FromDateTime(request.Start);
        var to = DateOnly.FromDateTime(request.Due);
        var result = new List<AssignmentCandidate>();

        foreach (var e in staff.Where(e => e.IsActive && e.Id != request.ExcludeEmployeeId))
        {
            var facts = new List<AssignmentFact>();
            var mine = tasks.Where(t => t.AssigneeId == e.Id).ToList();

            var leave = leaveList.FirstOrDefault(l => l.EmployeeId == e.Id && l.FromDate <= to && l.ToDate >= from);
            if (leave is not null || e.Status == EmployeeStatus.OnLeave)
            {
                facts.Add(new(leave is null
                    ? "Đang ở trạng thái nghỉ"
                    : $"Nghỉ phép {leave.FromDate:dd/MM}–{leave.ToDate:dd/MM} ({(leave.Status == LeaveStatus.Approved ? "đã duyệt" : "chờ duyệt")})", false));
                result.Add(new AssignmentCandidate(e, 0, false, facts));
                continue;
            }

            var done = mine.Where(t => t.Status == WorkTaskStatus.Completed).ToList();
            var similar = done.Where(t => Similarity(wanted, Tokens(t.Title)) >= SimilarityThreshold).OrderByDescending(t => t.CompletedAt ?? t.DueDate).ToList();
            var experience = Math.Min(similar.Count, 5) / 5.0;
            if (similar.Count > 0)
                facts.Add(new($"Đã làm {similar.Count} việc tương tự, gần nhất \"{similar[0].Title}\" ngày {(similar[0].CompletedAt ?? similar[0].DueDate):dd/MM}", true));
            else
                facts.Add(new("Chưa làm việc tương tự", false));

            var recent = done.Where(t => (now - (t.CompletedAt ?? t.DueDate)).TotalDays <= 90).ToList();
            double onTime;
            if (recent.Count == 0)
            {
                onTime = 0.5;
            }
            else
            {
                var punctual = recent.Count(t => (t.CompletedAt ?? t.DueDate) <= t.DueDate);
                onTime = (double)punctual / recent.Count;
                facts.Add(new($"Đúng hạn {punctual}/{recent.Count} việc trong 90 ngày", onTime >= 0.7));
            }

            var overlapping = mine.Count(t => t.IsOpen && t.StartDate < request.Due && t.DueDate > request.Start);
            var load = 1.0 / (1 + overlapping);
            facts.Add(overlapping == 0
                ? new("Không có việc nào trùng thời gian", true)
                : new($"Đang có {overlapping} việc trùng thời gian", false));

            double team = 0;
            if (request.DepartmentId is not null)
            {
                team = e.DepartmentId == request.DepartmentId ? 1 : 0;
                if (team > 0) facts.Add(new($"Thuộc {e.Department?.Name ?? "đúng tổ"}", true));
            }

            double place = 0;
            if (!string.IsNullOrWhiteSpace(request.Location))
            {
                var key = Fold(request.Location);
                var atPlace = done.Count(t => !string.IsNullOrWhiteSpace(t.Location) && (Fold(t.Location!).Contains(key) || key.Contains(Fold(t.Location!))));
                place = Math.Min(atPlace, 3) / 3.0;
                if (atPlace > 0) facts.Add(new($"Đã làm {atPlace} việc ở {request.Location.Trim()}", true));
            }

            var rejected = mine.Count(t => t.Status == WorkTaskStatus.Rejected && Similarity(wanted, Tokens(t.Title)) >= SimilarityThreshold);
            if (rejected > 0) facts.Add(new($"Từng từ chối {rejected} việc tương tự", false));

            double bonus = 0;
            if (DateOnly.FromDateTime(request.Start) == DateOnly.FromDateTime(now) && present.TryGetValue(e.Id, out var att))
            {
                if (att.CheckIn is not null)
                {
                    bonus = BonusPresent;
                    facts.Add(new($"Đã chấm công vào lúc {att.CheckIn:HH:mm} hôm nay", true));
                }
                else if (att.Status == AttendanceStatus.Absent)
                {
                    bonus = -BonusPresent;
                    facts.Add(new("Vắng mặt hôm nay", false));
                }
            }

            var weights = WExperience + WOnTime + WLoad + (request.DepartmentId is null ? 0 : WTeam) + (string.IsNullOrWhiteSpace(request.Location) ? 0 : WPlace);
            var raw = (WExperience * experience + WOnTime * onTime + WLoad * load + WTeam * team + WPlace * place) / weights;
            var score = Math.Clamp(raw - PenaltyRejected * Math.Min(rejected, 2) + bonus, 0, 1);
            result.Add(new AssignmentCandidate(e, score, true, facts));
        }

        return result.OrderByDescending(c => c.Available).ThenByDescending(c => c.Score).ThenBy(c => c.Employee.Code).ToList();
    }

    /// <summary>Jaccard similarity of two word sets.</summary>
    public static double Similarity(IReadOnlySet<string> a, IReadOnlySet<string> b)
    {
        if (a.Count == 0 || b.Count == 0) return 0;
        var inter = a.Count(b.Contains);
        return (double)inter / (a.Count + b.Count - inter);
    }

    private static readonly HashSet<string> StopWords = ["va", "cho", "cua", "o", "tai", "the", "lan", "lua", "ngay", "so"];

    public static IReadOnlySet<string> Tokens(string? text) =>
        Fold(text ?? string.Empty).Split([' ', ',', '.', '-', '/', '(', ')', ':', ';'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 1 && !StopWords.Contains(w) && !w.All(char.IsDigit))
            .ToHashSet();

    /// <summary>Lower case without Vietnamese accents, so "Hái chè" matches "hai che".</summary>
    public static string Fold(string s)
    {
        var normalized = s.Trim().ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) sb.Append(c);
        return sb.ToString().Normalize(NormalizationForm.FormC);
    }
}
