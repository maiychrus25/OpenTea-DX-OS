// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace TeaStaff.Desktop.Views;

public enum MessageKind { Info, Question, Danger }

/// <summary>Themed replacement for MessageBox, built in code to keep it small.</summary>
public static class MessageWindow
{
    public static bool Show(Window? owner, string title, string message, string okText, string? cancelText, MessageKind kind)
    {
        var (glyph, fg, bg) = kind switch
        {
            MessageKind.Danger => ("", "DangerBrush", "DangerSubtleBrush"),
            MessageKind.Question => ("", "PrimaryBrush", "PrimarySubtleBrush"),
            _ => ("", "PrimaryBrush", "PrimarySubtleBrush"),
        };
        var window = BuildWindow(owner, title);
        var result = false;

        var body = new StackPanel { Margin = new Thickness(28, 24, 28, 20) };
        var head = new StackPanel { Orientation = Orientation.Horizontal };
        head.Children.Add(new Border
        {
            Width = 38, Height = 38, CornerRadius = new CornerRadius(19), Background = Brush(bg),
            Child = new TextBlock
            {
                Text = glyph, FontFamily = (FontFamily)Application.Current.FindResource("IconFont"), FontSize = 17,
                Foreground = Brush(fg), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
            },
        });
        head.Children.Add(new TextBlock { Text = title, FontSize = 17, FontWeight = FontWeights.SemiBold, Margin = new Thickness(12, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, Foreground = Brush("InkBrush") });
        body.Children.Add(head);
        body.Children.Add(new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(50, 10, 0, 0), FontSize = 13.5, LineHeight = 21, Foreground = Brush("InkSecondaryBrush") });

        var footer = Footer();
        var ok = new Button
        {
            Content = okText, MinWidth = 100, IsDefault = true,
            Style = (Style)Application.Current.FindResource(kind == MessageKind.Danger ? "DangerButton" : "PrimaryButton"),
        };
        ok.Click += (_, _) => { result = true; window.Close(); };
        if (cancelText is not null)
        {
            var cancel = new Button { Content = cancelText, MinWidth = 90, IsCancel = true, Margin = new Thickness(0, 0, 10, 0), Style = (Style)Application.Current.FindResource("SecondaryButton") };
            cancel.Click += (_, _) => window.Close();
            DockPanel.SetDock(cancel, Dock.Right);
            ((DockPanel)((Border)footer).Child).Children.Add(ok);
            ((DockPanel)((Border)footer).Child).Children.Add(cancel);
        }
        else
        {
            ok.IsCancel = true;
            ((DockPanel)((Border)footer).Child).Children.Add(ok);
        }
        DockPanel.SetDock(ok, Dock.Right);

        var root = new DockPanel();
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(footer);
        root.Children.Add(body);
        window.Content = root;
        window.ShowDialog();
        return result;
    }

    internal static Window BuildWindow(Window? owner, string title) => new()
    {
        Title = title, Width = 480, SizeToContent = SizeToContent.Height, ResizeMode = ResizeMode.NoResize, ShowInTaskbar = false,
        WindowStartupLocation = owner is null ? WindowStartupLocation.CenterScreen : WindowStartupLocation.CenterOwner,
        Owner = owner, Background = Brush("CardBrush"), FontFamily = (FontFamily)Application.Current.FindResource("AppFont"),
    };

    internal static FrameworkElement Footer() => new Border
    {
        Background = Brush("LeafLightBrush"), BorderBrush = Brush("BorderSubtleBrush"), BorderThickness = new Thickness(0, 1, 0, 0),
        Padding = new Thickness(28, 14, 28, 14), Child = new DockPanel { LastChildFill = false },
    };

    internal static Brush Brush(string key) => (Brush)Application.Current.FindResource(key);
}

public static class PromptWindow
{
    public static string? Ask(Window? owner, string title, string message, string? initial, bool required)
    {
        var window = MessageWindow.BuildWindow(owner, title);
        string? result = null;
        var body = new StackPanel { Margin = new Thickness(28, 24, 28, 20) };
        body.Children.Add(new TextBlock { Text = title, FontSize = 17, FontWeight = FontWeights.SemiBold, Foreground = MessageWindow.Brush("InkBrush") });
        body.Children.Add(new TextBlock { Text = message, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 10), FontSize = 13.5, Foreground = MessageWindow.Brush("InkSecondaryBrush") });
        var input = new TextBox { Text = initial ?? string.Empty };
        body.Children.Add(input);
        var error = new TextBlock { Foreground = MessageWindow.Brush("DangerBrush"), Margin = new Thickness(0, 6, 0, 0), Visibility = Visibility.Collapsed, Text = "Vui lòng nhập nội dung." };
        body.Children.Add(error);

        var footer = MessageWindow.Footer();
        var panel = (DockPanel)((Border)footer).Child;
        var ok = new Button { Content = "Xác nhận", MinWidth = 100, IsDefault = true, Style = (Style)Application.Current.FindResource("PrimaryButton") };
        var cancel = new Button { Content = "Huỷ", MinWidth = 90, IsCancel = true, Margin = new Thickness(0, 0, 10, 0), Style = (Style)Application.Current.FindResource("SecondaryButton") };
        DockPanel.SetDock(ok, Dock.Right);
        DockPanel.SetDock(cancel, Dock.Right);
        panel.Children.Add(ok);
        panel.Children.Add(cancel);
        ok.Click += (_, _) =>
        {
            if (required && string.IsNullOrWhiteSpace(input.Text)) { error.Visibility = Visibility.Visible; return; }
            result = input.Text.Trim();
            window.Close();
        };
        cancel.Click += (_, _) => window.Close();

        var root = new DockPanel();
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(footer);
        root.Children.Add(body);
        window.Content = root;
        window.Loaded += (_, _) => input.Focus();
        window.ShowDialog();
        return result;
    }
}
