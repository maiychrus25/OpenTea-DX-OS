// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Collections;
using System.Globalization;
using System.Windows;
using System.Windows.Media;

namespace TeaStaff.Desktop.Controls;

public sealed record ChartPoint(string Label, double Value, Brush? Brush = null);

public sealed record ChartSeries(string Name, Brush Brush, IReadOnlyList<double> Values);

/// <summary>Shared drawing helpers so every chart has the same grid, fonts and colours.</summary>
public abstract class ChartBase : FrameworkElement
{
    protected static readonly Typeface Font = new(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
    protected static readonly Typeface Bold = new(new FontFamily("Segoe UI"), FontStyles.Normal, FontWeights.SemiBold, FontStretches.Normal);
    protected static readonly Brush Ink = Frozen("#475569");
    protected static readonly Brush Muted = Frozen("#5F6B7A");
    protected static readonly Pen Grid = FrozenPen("#E8EEE9", 1, dashed: true);
    protected static readonly Pen Axis = FrozenPen("#DCE3DD", 1);

    public static readonly Brush[] Palette =
    [
        Frozen("#176C4B"), Frozen("#1D4ED8"), Frozen("#B45309"), Frozen("#15803D"), Frozen("#B91C1C"), Frozen("#6B7280"), Frozen("#125C3F"), Frozen("#4CC38A"),
    ];

    protected double Dpi => VisualTreeHelper.GetDpi(this).PixelsPerDip;

    protected FormattedText Text(string s, double size, Brush brush, bool bold = false) =>
        new(s, CultureInfo.CurrentCulture, FlowDirection.LeftToRight, bold ? Bold : Font, size, brush, Dpi);

    protected static Brush Frozen(string hex)
    {
        var b = (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;
        b.Freeze();
        return b;
    }

    private static Pen FrozenPen(string hex, double width, bool dashed = false)
    {
        var p = new Pen(Frozen(hex), width);
        if (dashed) p.DashStyle = new DashStyle([3, 3], 0);
        p.Freeze();
        return p;
    }

    /// <summary>Rounds the axis maximum up to a friendly value and returns the step between grid lines.</summary>
    protected static (double Max, double Step) NiceScale(double max)
    {
        if (max <= 0) return (4, 1);
        var raw = max / 4;
        var magnitude = Math.Pow(10, Math.Floor(Math.Log10(raw)));
        var step = new[] { 1, 2, 2.5, 5, 10 }.Select(m => m * magnitude).First(s => s >= raw);
        if (step < 1 && max <= 4) step = 1;
        return (Math.Ceiling(max / step) * step, step);
    }

    protected static string Short(double v) => v switch
    {
        >= 1_000_000_000 => (v / 1_000_000_000).ToString("0.#") + " tỷ",
        >= 1_000_000 => (v / 1_000_000).ToString("0.#") + " tr",
        >= 10_000 => (v / 1_000).ToString("0.#") + "k",
        _ => v.ToString("0.#"),
    };

    /// <summary>Draws horizontal grid lines with value labels and returns the plot rectangle.</summary>
    protected Rect DrawGrid(DrawingContext dc, double max, double step, double bottomLabelSpace)
    {
        var labelWidth = Math.Max(24, Text(Short(max), 11, Muted).Width + 8);
        var plot = new Rect(labelWidth, 8, Math.Max(10, ActualWidth - labelWidth - 6), Math.Max(10, ActualHeight - 8 - bottomLabelSpace));
        for (var v = 0.0; v <= max + step / 2; v += step)
        {
            var y = plot.Bottom - v / max * plot.Height;
            dc.DrawLine(v == 0 ? Axis : Grid, new Point(plot.Left, y), new Point(plot.Right, y));
            var t = Text(Short(v), 11, Muted);
            dc.DrawText(t, new Point(plot.Left - t.Width - 6, y - t.Height / 2));
        }
        return plot;
    }
}

/// <summary>Vertical bars, one per point.</summary>
public sealed class BarChart : ChartBase
{
    public static readonly DependencyProperty ItemsProperty = DependencyProperty.Register(
        nameof(Items), typeof(IEnumerable), typeof(BarChart), new FrameworkPropertyMetadata(null, FrameworkPropertyMetadataOptions.AffectsRender));

    public IEnumerable? Items { get => (IEnumerable?)GetValue(ItemsProperty); set => SetValue(ItemsProperty, value); }

    protected override void OnRender(DrawingContext dc)
    {
        var points = Items?.OfType<ChartPoint>().ToList() ?? [];
        var (max, step) = NiceScale(points.Count == 0 ? 0 : points.Max(p => p.Value));
        var plot = DrawGrid(dc, max, step, 22);
        if (points.Count == 0) return;
        var slot = plot.Width / points.Count;
        var barWidth = Math.Min(56, slot * 0.56);
        for (var i = 0; i < points.Count; i++)
        {
            var p = points[i];
            var h = p.Value / max * plot.Height;
            var x = plot.Left + slot * i + (slot - barWidth) / 2;
            var brush = p.Brush ?? Palette[i % Palette.Length];
            if (h > 0) dc.DrawRoundedRectangle(brush, null, new Rect(x, plot.Bottom - h, barWidth, h), 4, 4);
            var value = Text(Short(p.Value), 12, Ink, bold: true);
            dc.DrawText(value, new Point(x + (barWidth - value.Width) / 2, plot.Bottom - h - value.Height - 2));
            var label = Text(p.Label, 11.5, Muted);
            label.MaxTextWidth = Math.Max(10, slot - 4);
            label.MaxLineCount = 1;
            label.Trimming = TextTrimming.CharacterEllipsis;
            dc.DrawText(label, new Point(plot.Left + slot * i + (slot - Math.Min(label.Width, slot - 4)) / 2, plot.Bottom + 5));
        }
    }
}

/// <summary>One or more series over the same x labels, drawn as lines with point markers.</summary>
public sealed class LineChart : ChartBase
{
    public static readonly DependencyProperty SeriesProperty = DependencyProperty.Register(
        nameof(Series), typeof(IEnumerable), typeof(LineChart), new FrameworkPropertyMetadata(null, FrameworkPropertyMetadataOptions.AffectsRender));

    public static readonly DependencyProperty LabelsProperty = DependencyProperty.Register(
        nameof(Labels), typeof(IEnumerable), typeof(LineChart), new FrameworkPropertyMetadata(null, FrameworkPropertyMetadataOptions.AffectsRender));

    public IEnumerable? Series { get => (IEnumerable?)GetValue(SeriesProperty); set => SetValue(SeriesProperty, value); }
    public IEnumerable? Labels { get => (IEnumerable?)GetValue(LabelsProperty); set => SetValue(LabelsProperty, value); }

    protected override void OnRender(DrawingContext dc)
    {
        var series = Series?.OfType<ChartSeries>().ToList() ?? [];
        var labels = Labels?.OfType<string>().ToList() ?? [];
        var all = series.SelectMany(s => s.Values).DefaultIfEmpty(0);
        var (max, step) = NiceScale(all.Max());
        var plot = DrawGrid(dc, max, step, 22);
        var count = Math.Max(labels.Count, series.Select(s => s.Values.Count).DefaultIfEmpty(0).Max());
        if (count == 0) return;
        double X(int i) => count == 1 ? plot.Left + plot.Width / 2 : plot.Left + plot.Width * i / (count - 1);

        // X labels: show about eight, always the last one.
        var every = Math.Max(1, (int)Math.Ceiling(count / 8.0));
        for (var i = 0; i < labels.Count; i++)
        {
            if (i % every != 0 && i != labels.Count - 1) continue;
            var t = Text(labels[i], 11, Muted);
            dc.DrawLine(Grid, new Point(X(i), plot.Top), new Point(X(i), plot.Bottom));
            dc.DrawText(t, new Point(Math.Clamp(X(i) - t.Width / 2, 0, ActualWidth - t.Width), plot.Bottom + 5));
        }

        foreach (var s in series)
        {
            if (s.Values.Count == 0) continue;
            var pen = new Pen(s.Brush, 2.2) { LineJoin = PenLineJoin.Round };
            var geometry = new StreamGeometry();
            using (var ctx = geometry.Open())
            {
                ctx.BeginFigure(new Point(X(0), plot.Bottom - s.Values[0] / max * plot.Height), false, false);
                for (var i = 1; i < s.Values.Count; i++) ctx.LineTo(new Point(X(i), plot.Bottom - s.Values[i] / max * plot.Height), true, true);
            }
            dc.DrawGeometry(null, pen, geometry);
            if (s.Values.Count <= 40)
                for (var i = 0; i < s.Values.Count; i++)
                    dc.DrawEllipse(Brushes.White, new Pen(s.Brush, 1.6), new Point(X(i), plot.Bottom - s.Values[i] / max * plot.Height), 2.8, 2.8);
        }
    }
}

/// <summary>Share of a whole as a ring, with the total in the middle.</summary>
public sealed class DonutChart : ChartBase
{
    public static readonly DependencyProperty ItemsProperty = DependencyProperty.Register(
        nameof(Items), typeof(IEnumerable), typeof(DonutChart), new FrameworkPropertyMetadata(null, FrameworkPropertyMetadataOptions.AffectsRender));

    public static readonly DependencyProperty CenterLabelProperty = DependencyProperty.Register(
        nameof(CenterLabel), typeof(string), typeof(DonutChart), new FrameworkPropertyMetadata("", FrameworkPropertyMetadataOptions.AffectsRender));

    public IEnumerable? Items { get => (IEnumerable?)GetValue(ItemsProperty); set => SetValue(ItemsProperty, value); }
    public string CenterLabel { get => (string)GetValue(CenterLabelProperty); set => SetValue(CenterLabelProperty, value); }

    protected override void OnRender(DrawingContext dc)
    {
        var points = Items?.OfType<ChartPoint>().Where(p => p.Value > 0).ToList() ?? [];
        var total = points.Sum(p => p.Value);
        var size = Math.Min(ActualWidth, ActualHeight);
        if (size < 20) return;
        var center = new Point(ActualWidth / 2, ActualHeight / 2);
        var outer = size / 2 - 2;
        var thickness = Math.Max(14, outer * 0.32);
        var radius = outer - thickness / 2;

        if (total <= 0)
        {
            dc.DrawEllipse(null, new Pen(Frozen("#EEF1ED"), thickness), center, radius, radius);
        }
        else
        {
            var angle = -90.0;
            for (var i = 0; i < points.Count; i++)
            {
                var sweep = points[i].Value / total * 360;
                var pen = new Pen(points[i].Brush ?? Palette[i % Palette.Length], thickness) { StartLineCap = PenLineCap.Flat, EndLineCap = PenLineCap.Flat };
                if (sweep >= 359.99) dc.DrawEllipse(null, pen, center, radius, radius);
                else dc.DrawGeometry(null, pen, Arc(center, radius, angle, sweep));
                angle += sweep;
            }
        }
        var value = Text(Short(total), Math.Max(14, size * 0.16), Frozen("#19231E"), bold: true);
        dc.DrawText(value, new Point(center.X - value.Width / 2, center.Y - value.Height / 2 - 7));
        var label = Text(CenterLabel, 11.5, Muted);
        dc.DrawText(label, new Point(center.X - label.Width / 2, center.Y + value.Height / 2 - 9));
    }

    private static Geometry Arc(Point c, double r, double startDeg, double sweepDeg)
    {
        static Point On(Point c, double r, double deg) => new(c.X + r * Math.Cos(deg * Math.PI / 180), c.Y + r * Math.Sin(deg * Math.PI / 180));
        var g = new StreamGeometry();
        using (var ctx = g.Open())
        {
            ctx.BeginFigure(On(c, r, startDeg), false, false);
            ctx.ArcTo(On(c, r, startDeg + sweepDeg), new Size(r, r), 0, sweepDeg > 180, SweepDirection.Clockwise, true, false);
        }
        g.Freeze();
        return g;
    }
}
