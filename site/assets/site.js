/* SPDX-License-Identifier: MIT */
/* SPDX-FileCopyrightText: 2026 OpenTea Developers */
/* Optional enhancements only: theme switch and large-image viewer. The page works without this file. */
(function () {
  "use strict";
  var KEY = "opentea-theme";
  var root = document.documentElement;
  var isVi = root.lang === "vi";
  var LABELS = isVi
    ? { system: "Giao diện: hệ thống", light: "Giao diện: sáng", dark: "Giao diện: tối" }
    : { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };
  var NEXT = { system: "light", light: "dark", dark: "system" };

  function readTheme() {
    try {
      var t = localStorage.getItem(KEY);
      return t === "light" || t === "dark" ? t : "system";
    } catch (e) { return "system"; }
  }
  function writeTheme(t) {
    try {
      if (t === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t);
    } catch (e) { /* storage blocked: the choice lasts for this page view only */ }
  }
  function applyTheme(t) {
    if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  }

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    var current = readTheme();
    toggle.hidden = false;
    toggle.textContent = LABELS[current];
    toggle.addEventListener("click", function () {
      current = NEXT[current];
      applyTheme(current);
      writeTheme(current);
      toggle.textContent = LABELS[current];
    });
  }

  var dialog = document.getElementById("lightbox");
  if (dialog && typeof dialog.showModal === "function") {
    var img = document.getElementById("lightbox-img");
    var caption = document.getElementById("lightbox-caption");
    var closeButton = document.getElementById("lightbox-close");
    document.querySelectorAll("a.zoom").forEach(function (link) {
      link.addEventListener("click", function (event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        var target = link.querySelector("img");
        img.src = link.getAttribute("href");
        img.alt = target ? target.alt : "";
        img.width = target ? target.width : 1280;
        img.height = target ? target.height : 800;
        caption.textContent = link.getAttribute("data-caption") || "";
        dialog.showModal();
      });
    });
    closeButton.addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog || event.target.classList.contains("lightbox-inner")) dialog.close();
    });
  }
})();
