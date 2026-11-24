// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace TeaIot.App;

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var on = value switch { bool b => b, int i => i > 0, string s => !string.IsNullOrEmpty(s), null => false, _ => true };
        return on ^ Invert ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

/// <summary>Maps "ok" / "warn" / "danger" to the theme's status colours; parameter "bg" gives the subtle background.</summary>
public sealed class ToneConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var bg = parameter as string == "bg";
        var key = (value as string) switch
        {
            "danger" => bg ? "DangerSubtleBrush" : "DangerBrush",
            "warn" => bg ? "WarningSubtleBrush" : "WarningBrush",
            _ => bg ? "SuccessSubtleBrush" : "PrimaryBrush",
        };
        return Application.Current.TryFindResource(key) as Brush ?? Brushes.Gray;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}
