// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Abstractions;

namespace TeaStaff.Infrastructure;

public sealed class SystemClock : IClock
{
    public DateTime Now => DateTime.Now;
}

public sealed class DataChangeNotifier : IDataChangeNotifier
{
    public event EventHandler<string>? Changed;

    public void Notify(string area) => Changed?.Invoke(this, area);
}
