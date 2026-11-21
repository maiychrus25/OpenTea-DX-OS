/* SPDX-License-Identifier: MIT */
/* SPDX-FileCopyrightText: 2026 OpenTea Developers */
/* Documentation enhancements: copy buttons, search over the build-time index, current section in the table of contents.
   Without this file every page still reads and navigates through the sidebar, the table of contents and the links. */
(function () {
  "use strict";
  var root = document.body.getAttribute("data-root") || "./";

  // Copy buttons appear only when the clipboard API exists.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    document.querySelectorAll(".codebox .copy").forEach(function (button) {
      button.hidden = false;
      button.addEventListener("click", function () {
        var code = button.parentNode.querySelector("pre").innerText;
        navigator.clipboard.writeText(code).then(function () {
          button.textContent = "Đã chép";
          setTimeout(function () { button.textContent = "Sao chép"; }, 1600);
        }, function () {
          button.textContent = "Không chép được";
        });
      });
    });
  }

  // Search over docs/search-index.json (generated at build time).
  var box = document.querySelector(".side-search");
  var input = document.getElementById("doc-search");
  var results = document.getElementById("doc-results");
  if (box && input && results && window.fetch) {
    var index = null;
    box.hidden = false;
    var load = function () {
      if (index) return Promise.resolve(index);
      return fetch(root + "docs/search-index.json").then(function (r) { return r.json(); }).then(function (json) {
        index = json;
        return index;
      });
    };
    var render = function (items, q) {
      results.innerHTML = "";
      if (!q) return;
      if (!items.length) {
        var none = document.createElement("li");
        none.className = "empty";
        none.textContent = "Không có kết quả.";
        results.appendChild(none);
        return;
      }
      items.slice(0, 8).forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = root + item.url;
        a.textContent = item.title;
        var small = document.createElement("small");
        small.textContent = item.excerpt;
        a.appendChild(small);
        li.appendChild(a);
        results.appendChild(li);
      });
    };
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { render([], ""); return; }
      load().then(function (all) {
        var found = all.filter(function (p) {
          return (p.title + " " + p.text).toLowerCase().indexOf(q) !== -1;
        }).map(function (p) {
          var at = p.text.toLowerCase().indexOf(q);
          var from = Math.max(0, at - 50);
          return { title: p.title, url: p.url, excerpt: at === -1 ? "" : (from > 0 ? "…" : "") + p.text.substr(from, 110) + "…" };
        });
        render(found, q);
      });
    });
  }

  // Table of contents: mark the section that is at the top of the viewport.
  var links = Array.prototype.slice.call(document.querySelectorAll(".doc-toc a"));
  if (links.length && "IntersectionObserver" in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (a) { a.classList.remove("is-current"); });
          var a = byId[entry.target.id];
          if (a) a.classList.add("is-current");
        }
      });
    }, { rootMargin: "0px 0px -70% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();
