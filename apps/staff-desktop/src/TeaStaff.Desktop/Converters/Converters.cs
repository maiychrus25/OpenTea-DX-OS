// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using TeaStaff.Core.Domain;
using TeaStaff.Core.Services;

namespace TeaStaff.Desktop.Converters;

/// <summary>Enum value to its Vietnamese label.</summary>
public sealed class EnumLabelConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is Enum e ? Labels.Of(e) : value?.ToString() ?? string.Empty;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

/// <summary>Maps a status enum to a semantic tone brush. ConverterParameter "bg" or "fg".</summary>
public sealed class StatusToneConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var tone = value switch
        {
            WorkTaskStatus.Completed or LeaveStatus.Approved or PayslipStatus.Paid or EmployeeStatus.Active or AttendanceStatus.Present => "Success",
            WorkTaskStatus.InProgress or WorkTaskStatus.Accepted or PayslipStatus.Approved or AttendanceStatus.PaidLeave => "Info",
            WorkTaskStatus.Assigned or LeaveStatus.Pending or PayslipStatus.Draft or EmployeeStatus.OnLeave or AttendanceStatus.HalfDay => "Warning",
            WorkTaskStatus.Rejected or LeaveStatus.Rejected or AttendanceStatus.Absent or TaskPriority.Urgent => "Danger",
            TaskPriority.High => "Warning",
            string name when name is "Success" or "Info" or "Warning" or "Danger" or "Accent" => name,
            _ => "Neutral",
        };
        var key = parameter as string == "fg"
            ? tone == "Neutral" ? "InkSecondaryBrush" : tone + "Brush"
            : tone + "SubtleBrush";
        return Application.Current.TryFindResource(key) as Brush ?? Brushes.Transparent;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var flag = value switch
        {
            bool b => b,
            int i => i != 0,
            string s => !string.IsNullOrWhiteSpace(s),
            null => false,
            _ => true,
        };
        return flag ^ Invert ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

/// <summary>Formats decimals as Vietnamese dong: 7.500.000 ₫.</summary>
public sealed class MoneyConverter : IValueConverter
{
    public static readonly CultureInfo Vi = CultureInfo.GetCultureInfo("vi-VN");

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is decimal d ? Format(d) : string.Empty;

    public static string Format(decimal d) => d.ToString("#,##0", Vi) + " ₫";

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

public sealed class InitialsConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var parts = (value as string ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch
        {
            0 => "?",
            1 => parts[0][..1].ToUpperInvariant(),
            _ => (parts[^2][..1] + parts[^1][..1]).ToUpperInvariant(),
        };
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

/// <summary>True when all bound values are equal (used for the selected navigation item).</summary>
public sealed class EqualsMultiConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object? parameter, CultureInfo culture) =>
        values.Length >= 2 && Equals(values[0], values[1]);

    public object[] ConvertBack(object value, Type[] targetTypes, object? parameter, CultureInfo culture) =>
        targetTypes.Select(_ => Binding.DoNothing).ToArray();
}

/// <summary>Two-way DateOnly? &lt;-&gt; DateTime? for DatePicker.</summary>
public sealed class DateOnlyConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is DateOnly d ? d.ToDateTime(TimeOnly.MinValue) : null;

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is DateTime dt ? DateOnly.FromDateTime(dt) : null;
}
