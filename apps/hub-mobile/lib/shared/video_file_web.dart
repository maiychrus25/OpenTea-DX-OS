// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'package:video_player/video_player.dart';

// image_picker returns a browser-owned blob URL, not a filesystem path.
VideoPlayerController fileVideoController(String path) => VideoPlayerController.networkUrl(Uri.parse(path));
