// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;
using TeaIot.App.ViewModels;

namespace TeaIot.App.Views;

public partial class SettingsWindow : Window
{
    public SettingsWindow()
    {
        InitializeComponent();
        DataContextChanged += (_, e) =>
        {
            if (e.NewValue is SettingsViewModel vm) vm.CloseRequested += (_, ok) => DialogResult = ok;
        };
    }
}
