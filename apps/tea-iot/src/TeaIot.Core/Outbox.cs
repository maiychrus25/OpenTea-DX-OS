// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
namespace TeaIot.Core;

/// <summary>Sends one reading to the broker; returns false when it could not be delivered.</summary>
public interface IReadingSink
{
    bool IsConnected { get; }
    Task<bool> PublishAsync(Reading reading, CancellationToken ct = default);
}

/// <summary>
/// Store-and-forward queue, like a field gateway on a weak 4G link: readings taken while the
/// broker is unreachable wait here (oldest dropped past <see cref="Capacity"/>) and are sent in
/// order once it is back. The ingest worker accepts past timestamps, so nothing is lost.
/// </summary>
public sealed class Outbox(IReadingSink sink, int capacity = 20_000)
{
    private readonly LinkedList<Reading> _queue = new();
    private readonly object _lock = new();

    public int Capacity { get; } = capacity;
    public long Sent { get; private set; }
    public long Dropped { get; private set; }
    public int Pending { get { lock (_lock) return _queue.Count; } }

    public void Enqueue(IEnumerable<Reading> readings)
    {
        lock (_lock)
        {
            foreach (var r in readings)
            {
                _queue.AddLast(r);
                if (_queue.Count > Capacity)
                {
                    _queue.RemoveFirst();
                    Dropped++;
                }
            }
        }
    }

    /// <summary>Sends queued readings in order; stops at the first failure and keeps the rest.</summary>
    public async Task<int> FlushAsync(int max = 500, CancellationToken ct = default)
    {
        var sent = 0;
        while (sent < max && sink.IsConnected && !ct.IsCancellationRequested)
        {
            Reading? next;
            lock (_lock) next = _queue.First?.Value;
            if (next is null) break;
            if (!await sink.PublishAsync(next, ct)) break;
            lock (_lock)
            {
                if (_queue.First?.Value == next) _queue.RemoveFirst();
            }
            Sent++;
            sent++;
        }
        return sent;
    }
}
