# Contributing

Thanks for helping improve Tea Staff Manager.

## Reporting bugs and ideas

Open an issue at <https://github.com/Vudinhdat02/appManageStaff/issues>. Include the app version (Settings page), Windows version, the steps to reproduce and, if possible, a screenshot. Never attach real employee data.

## Making changes

1. Fork the repository and create a branch from `main`.
2. Build and test: `dotnet build AppManageStaff.sln` and `dotnet test AppManageStaff.sln` must pass with no warnings.
3. Keep business rules in `TeaStaff.Core` (framework-free) and UI logic in view models; views should only bind.
4. Code identifiers are English; user-facing text is Vietnamese.
5. Add the SPDX header to every new file:
   ```csharp
   // SPDX-License-Identifier: MIT
   // SPDX-FileCopyrightText: 2026 <your name>
   ```
6. Record user-visible changes in `CHANGELOG.md` and new libraries in `DEPENDENCIES.md`.
7. Open a pull request describing what changed and how you tested it.

By contributing you agree that your work is released under the [MIT License](LICENSE).
