// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;
using TeaStaff.Desktop.ViewModels;
using TeaStaff.Desktop.Views;

namespace TeaStaff.Desktop.Services;

public interface IDialogService
{
    /// <summary>Shows an editor view model in a modal window; returns true when it was saved.</summary>
    bool ShowEditor(EditorViewModel editor);
    bool Confirm(string title, string message, string confirmText = "Đồng ý", bool danger = false);
    void Info(string title, string message);
    void Error(string message);
    string? Prompt(string title, string message, string? initial = null, bool required = false);
    string? SaveFile(string defaultName, string filter);
}

public sealed class DialogService : IDialogService
{
    private static Window? Owner => Application.Current.Windows.OfType<Window>().FirstOrDefault(w => w.IsActive) ?? Application.Current.MainWindow;

    public bool ShowEditor(EditorViewModel editor)
    {
        var window = new EditorWindow { DataContext = editor, Owner = Owner, Title = editor.Title };
        editor.CloseRequested += (_, ok) => window.DialogResult = ok;
        return window.ShowDialog() == true;
    }

    public bool Confirm(string title, string message, string confirmText = "Đồng ý", bool danger = false) =>
        MessageWindow.Show(Owner, title, message, confirmText, "Huỷ", danger ? MessageKind.Danger : MessageKind.Question);

    public void Info(string title, string message) => MessageWindow.Show(Owner, title, message, "Đóng", null, MessageKind.Info);

    public void Error(string message) => MessageWindow.Show(Owner, "Không thực hiện được", message, "Đóng", null, MessageKind.Danger);

    public string? Prompt(string title, string message, string? initial = null, bool required = false) =>
        PromptWindow.Ask(Owner, title, message, initial, required);

    public string? SaveFile(string defaultName, string filter)
    {
        var dialog = new Microsoft.Win32.SaveFileDialog { FileName = defaultName, Filter = filter, AddExtension = true };
        return dialog.ShowDialog(Owner) == true ? dialog.FileName : null;
    }
}
