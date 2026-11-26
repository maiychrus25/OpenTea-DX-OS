// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers
using System.Runtime.InteropServices;
using System.Text;

namespace TeaStaff.Infrastructure.Sync;

/// <summary>Keeps the core client secret out of config.json.</summary>
public interface ICoreSecretStore
{
    string? Read();
    void Save(string? secret);
}

/// <summary>
/// One file next to config.json. On Windows the content is protected with DPAPI (current user);
/// elsewhere the file is created with mode 0600.
/// </summary>
public sealed class FileSecretStore(string path) : ICoreSecretStore
{
    public FileSecretStore() : this(Path.Combine(AppConfig.DataFolder, "core-sync.secret")) { }

    public string? Read()
    {
        if (!File.Exists(path)) return null;
        try
        {
            var bytes = File.ReadAllBytes(path);
            if (bytes.Length == 0) return null;
            return Encoding.UTF8.GetString(OperatingSystem.IsWindows() ? Dpapi.Unprotect(bytes) : bytes);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // A DPAPI blob made by another Windows user cannot be opened: treat it as "no secret".
            return null;
        }
    }

    public void Save(string? secret)
    {
        if (string.IsNullOrEmpty(secret))
        {
            if (File.Exists(path)) File.Delete(path);
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var bytes = Encoding.UTF8.GetBytes(secret);
        if (OperatingSystem.IsWindows())
        {
            File.WriteAllBytes(path, Dpapi.Protect(bytes));
            return;
        }
        File.Delete(path);
        using var stream = new FileStream(path, new FileStreamOptions
        {
            Mode = FileMode.CreateNew, Access = FileAccess.Write, UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite,
        });
        stream.Write(bytes);
    }

    /// <summary>CryptProtectData / CryptUnprotectData, so no extra package is needed.</summary>
    private static class Dpapi
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct DataBlob { public int Size; public IntPtr Data; }

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CryptProtectData(ref DataBlob input, string? description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);

        [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);

        [DllImport("kernel32.dll")]
        private static extern IntPtr LocalFree(IntPtr handle);

        public static byte[] Protect(byte[] clear) => Run(clear, protect: true);
        public static byte[] Unprotect(byte[] sealedBytes) => Run(sealedBytes, protect: false);

        private static byte[] Run(byte[] input, bool protect)
        {
            var handle = GCHandle.Alloc(input, GCHandleType.Pinned);
            try
            {
                var inBlob = new DataBlob { Size = input.Length, Data = handle.AddrOfPinnedObject() };
                var ok = protect
                    ? CryptProtectData(ref inBlob, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out var outBlob)
                    : CryptUnprotectData(ref inBlob, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out outBlob);
                if (!ok) throw new IOException("DPAPI failed: " + Marshal.GetLastWin32Error());
                try
                {
                    var result = new byte[outBlob.Size];
                    Marshal.Copy(outBlob.Data, result, 0, outBlob.Size);
                    return result;
                }
                finally { LocalFree(outBlob.Data); }
            }
            finally { handle.Free(); }
        }
    }
}
