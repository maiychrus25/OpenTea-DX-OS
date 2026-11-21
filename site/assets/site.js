/* SPDX-License-Identifier: MIT */
/* SPDX-FileCopyrightText: 2026 OpenTea Developers */
/* Optional enhancements only: theme switch and large-image viewer. The page works without this file. */
(function () {
  "use strict";
  // Header condenses after scrolling (a class only; the header works without it).
  var header = document.querySelector(".site-header");
  var onScroll = function () { if (header) header.classList.toggle("scrolled", window.scrollY > 24); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Count-up for the stats strip: the final numbers are already in the HTML.
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var counters = document.querySelectorAll("[data-count]");
  if (counters.length && !reduce && "IntersectionObserver" in window) {
    var countObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target, end = Number(el.getAttribute("data-count")), t0 = performance.now();
        countObs.unobserve(el);
        var step = function (now) {
          var k = Math.min(1, (now - t0) / 900), eased = 1 - Math.pow(1 - k, 3);
          el.textContent = String(Math.round(end * eased));
          if (k < 1) requestAnimationFrame(step);
        };
        el.textContent = "0";
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { countObs.observe(el); });
  }

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
