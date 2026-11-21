// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;
using System.Windows.Input;
using TeaStaff.Desktop.ViewModels;

namespace TeaStaff.Desktop.Views;

public partial class LoginWindow : Window
{
    public LoginWindow()
    {
        InitializeComponent();
        Loaded += (_, _) => PasswordBox.Focus();
    }

    // PasswordBox.Password is not bindable by design; the view hands it to the view model.
    private async void OnSignIn(object sender, RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel vm && !vm.IsBusy) await vm.SignInAsync(PasswordBox.Password);
    }
}
