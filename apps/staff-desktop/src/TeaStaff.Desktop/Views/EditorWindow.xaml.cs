// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;

namespace TeaStaff.Desktop.Views;

/// <summary>Generic modal host; the editor view is resolved from the view model's DataTemplate.</summary>
public partial class EditorWindow : Window
{
    public EditorWindow() => InitializeComponent();
}
