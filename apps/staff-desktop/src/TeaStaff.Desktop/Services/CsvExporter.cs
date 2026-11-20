// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Vu Dinh Dat
using System.Globalization;
using System.IO;
using System.Text;

namespace TeaStaff.Desktop.Services;

/// <summary>UTF-8 with BOM and CRLF so Excel opens Vietnamese text correctly (same convention as the DX-OS app kit).</summary>
public static class CsvExporter
{
    public static void Write(string path, IReadOnlyList<string> header, IEnumerable<object?[]> rows)
    {
        var sb = new StringBuilder();
        sb.Append(string.Join(',', header.Select(Escape))).Append("\r\n");
        foreach (var row in rows) sb.Append(string.Join(',', row.Select(Format))).Append("\r\n");
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
    }

    private static string Format(object? value) => value switch
    {
        null => string.Empty,
        decimal d => d.ToString("0.##", CultureInfo.InvariantCulture),
        _ => Escape(value.ToString() ?? string.Empty),
    };

    private static string Escape(string s)
    {
        // Neutralise spreadsheet formulas.
        if (s.Length > 0 && "=+-@".Contains(s[0])) s = "'" + s;
        return s.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? "\"" + s.Replace("\"", "\"\"") + "\"" : s;
    }
}
