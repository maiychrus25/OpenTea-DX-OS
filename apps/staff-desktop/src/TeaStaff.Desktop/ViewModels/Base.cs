// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.EntityFrameworkCore;
using TeaStaff.Core.Services;
using TeaStaff.Desktop.Services;

namespace TeaStaff.Desktop.ViewModels;

/// <summary>A screen shown in the main shell.</summary>
public abstract partial class PageViewModel(IDialogService dialogs) : ObservableObject
{
    protected IDialogService Dialogs { get; } = dialogs;

    public abstract string Title { get; }
    public abstract string Subtitle { get; }

    [ObservableProperty] private bool _isBusy;

    public abstract Task LoadAsync();

    /// <summary>Data areas whose changes (e.g. from the mobile API) should reload this page.</summary>
    public virtual IReadOnlyCollection<string> WatchedAreas => [];

    /// <summary>Runs an action and shows business errors as a dialog instead of crashing.</summary>
    protected async Task<bool> RunAsync(Func<Task> action)
    {
        try
        {
            IsBusy = true;
            await action();
            return true;
        }
        catch (DomainException e)
        {
            Dialogs.Error(e.Message);
        }
        catch (DbUpdateException e)
        {
            Dialogs.Error("Lỗi lưu dữ liệu: " + (e.InnerException?.Message ?? e.Message));
        }
        finally
        {
            IsBusy = false;
        }
        return false;
    }

    [RelayCommand]
    private Task Refresh() => RunAsync(LoadAsync);
}

/// <summary>A form shown in <see cref="Views.EditorWindow"/>.</summary>
public abstract partial class EditorViewModel : ObservableObject
{
    public abstract string Title { get; }
    public virtual string SaveText => "Lưu";
    public virtual double Width => 640;

    [ObservableProperty] private string? _error;
    [ObservableProperty] private bool _isBusy;

    public event EventHandler<bool>? CloseRequested;

    protected abstract Task SaveCoreAsync();

    [RelayCommand]
    private async Task Save()
    {
        Error = null;
        try
        {
            IsBusy = true;
            await SaveCoreAsync();
            CloseRequested?.Invoke(this, true);
        }
        catch (DomainException e)
        {
            Error = e.Message;
        }
        catch (DbUpdateException e)
        {
            Error = "Lỗi lưu dữ liệu: " + (e.InnerException?.Message ?? e.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private void Cancel() => CloseRequested?.Invoke(this, false);

    protected void Close(bool saved) => CloseRequested?.Invoke(this, saved);

    protected static decimal ParseMoney(string? text, string field)
    {
        var raw = (text ?? "0").Replace(".", "").Replace(",", "").Replace("₫", "").Replace(" ", "").Trim();
        if (raw.Length == 0) return 0;
        if (!decimal.TryParse(raw, out var v) || v < 0) throw new DomainException($"{field} phải là số không âm.");
        return v;
    }

    protected static decimal ParseDecimal(string? text, string field)
    {
        var raw = (text ?? "0").Replace(',', '.').Trim();
        if (raw.Length == 0) return 0;
        if (!decimal.TryParse(raw, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var v) || v < 0)
            throw new DomainException($"{field} phải là số không âm.");
        return v;
    }

    protected static string Money(decimal v) => v.ToString("#,##0", Converters.MoneyConverter.Vi);
}

public sealed record Option<T>(T Value, string Label)
{
    public override string ToString() => Label;
}

public static class Options
{
    public static IReadOnlyList<Option<T>> Of<T>() where T : struct, Enum =>
        Enum.GetValues<T>().Select(v => new Option<T>(v, Labels.Of(v))).ToList();
}

public static class UiThread
{
    public static void Post(Action action)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null) return;
        if (dispatcher.CheckAccess()) action();
        else dispatcher.BeginInvoke(action);
    }
}
