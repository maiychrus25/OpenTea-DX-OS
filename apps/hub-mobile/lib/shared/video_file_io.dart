// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import 'dart:io';
import 'package:video_player/video_player.dart';

VideoPlayerController fileVideoController(String path) => VideoPlayerController.file(File(path));
