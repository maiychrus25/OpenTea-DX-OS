// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;
using System.Windows.Controls;
using TeaStaff.Desktop.ViewModels;

namespace TeaStaff.Desktop.Views;

public partial class SettingsView : UserControl
{
    public SettingsView() => InitializeComponent();

    // PasswordBox.Password is not bindable by design; the view hands it to the view model.
    private void OnSaveCoreSync(object sender, RoutedEventArgs e)
    {
        if (DataContext is not SettingsViewModel vm) return;
        vm.SaveCoreSync(CoreSecretBox.Password);
        CoreSecretBox.Clear();
    }
}
