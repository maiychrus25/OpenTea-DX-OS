# Dependencies

Tea Staff Manager uses the .NET platform libraries wherever possible (WPF, ASP.NET Core minimal APIs, System.Text.Json, PBKDF2 from System.Security.Cryptography). Third-party packages are restored from NuGet at build time; none are vendored or modified in this repository.

| Package | Version | Licence | Used for |
| --- | --- | --- | --- |
| [CommunityToolkit.Mvvm](https://github.com/CommunityToolkit/dotnet) | 8.4.2 | MIT | `ObservableObject`, source-generated properties and commands (MVVM) |
| [Microsoft.Extensions.DependencyInjection](https://github.com/dotnet/runtime) | 10.0.4 | MIT | Dependency injection container |
| [Microsoft.EntityFrameworkCore.Sqlite](https://github.com/dotnet/efcore) | 10.0.4 | MIT | Offline SQLite storage |
| [SQLitePCLRaw.lib.e_sqlite3](https://github.com/ericsink/SQLitePCL.raw) | 3.53.3 | Apache-2.0 (SQLite is public domain) | Up-to-date native SQLite build |
| [Npgsql.EntityFrameworkCore.PostgreSQL](https://github.com/npgsql/efcore.pg) | 10.0.3 | PostgreSQL License | Storage in the OpenTea DX-OS PostgreSQL database |
| Microsoft.AspNetCore.App (shared framework) | 10.0 | MIT | Embedded REST API for the mobile app |

Test-only:

| Package | Version | Licence |
| --- | --- | --- |
| xunit, xunit.runner.visualstudio | 2.9.3, 3.1.4 | Apache-2.0 |
| Microsoft.NET.Test.Sdk | 17.14.1 | MIT |
| coverlet.collector | 6.0.4 | MIT |

Icons come from the *Segoe Fluent Icons* / *Segoe MDL2 Assets* fonts that ship with Windows; they are not redistributed. The tea-leaf logo is original artwork in this repository (MIT).
