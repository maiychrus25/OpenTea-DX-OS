// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using TeaStaff.Core.Abstractions;

namespace TeaStaff.Infrastructure.Storage;

/// <summary>Stores evidence under %LOCALAPPDATA%\TeaStaff\attachments\&lt;HTX&gt;\ with random names.</summary>
public sealed class LocalAttachmentStore : IAttachmentStore
{
    private readonly string _root;

    public LocalAttachmentStore(string? root = null) =>
        _root = Path.GetFullPath(root ?? Path.Combine(AppConfig.DataFolder, "attachments"));

    public async Task<string> SaveAsync(string htxCode, string extension, byte[] content, CancellationToken ct = default)
    {
        var folder = new string(htxCode.Where(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_').ToArray());
        if (folder.Length == 0) folder = "default";
        var relative = Path.Combine(folder, $"{DateTime.Now:yyyyMMdd}-{Guid.NewGuid():N}{extension}");
        var full = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await File.WriteAllBytesAsync(full, content, ct);
        return relative.Replace('\\', '/');
    }

    public async Task<byte[]?> ReadAsync(string path, CancellationToken ct = default)
    {
        var full = LocalPath(path);
        return full is not null && File.Exists(full) ? await File.ReadAllBytesAsync(full, ct) : null;
    }

    /// <summary>Resolves a stored path, refusing anything that would escape the attachment folder.</summary>
    public string? LocalPath(string path)
    {
        var full = Path.GetFullPath(Path.Combine(_root, path.Replace('/', Path.DirectorySeparatorChar)));
        return full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ? full : null;
    }
}
