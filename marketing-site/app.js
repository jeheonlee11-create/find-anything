/* Find Anything marketing site — progressive enhancement.
   Everything degrades gracefully: with JS off the page is fully readable,
   the theme follows the OS, and all content is visible. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Theme toggle (persisted) ---------- */
  var THEME_KEY = "fa-theme";
  var themeBtn = document.getElementById("themeBtn");
  try {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage may be unavailable */ }

  function currentTheme() {
    var attr = root.getAttribute("data-theme");
    if (attr) return attr;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  function syncToggleState() {
    if (themeBtn) themeBtn.setAttribute("aria-pressed", currentTheme() === "light" ? "true" : "false");
  }
  syncToggleState();
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      syncToggleState();
    });
  }

  /* ---------- Sticky nav border ---------- */
  var nav = document.getElementById("nav");
  function onScroll() {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Staggered evidence rows (hero) ---------- */
  var evRows = Array.prototype.slice.call(document.querySelectorAll(".ev-row"));
  function playEvidence() {
    evRows.forEach(function (row, i) {
      if (reduce) { row.style.opacity = "1"; row.style.transform = "none"; return; }
      setTimeout(function () {
        row.style.transition = "opacity .5s cubic-bezier(.22,.61,.36,1), transform .5s cubic-bezier(.22,.61,.36,1)";
        row.style.opacity = "1";
        row.style.transform = "none";
      }, 260 + i * 220);
    });
  }
  if (evRows.length) {
    if (reduce || !("IntersectionObserver" in window)) { playEvidence(); }
    else {
      var evIo = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { playEvidence(); evIo.disconnect(); }
      }, { threshold: 0.4 });
      evIo.observe(evRows[0].parentNode);
    }
  }

  /* ---------- Confidence bar fill ---------- */
  var fill = document.getElementById("confFill");
  if (fill) {
    var to = fill.getAttribute("data-to") || "60%";
    if (reduce) { fill.style.transition = "none"; fill.style.width = to; }
    else if ("IntersectionObserver" in window) {
      var cIo = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { fill.style.width = to; cIo.disconnect(); }
      }, { threshold: 0.5 });
      cIo.observe(fill);
    } else { fill.style.width = to; }
  }

  /* ---------- Access form (client-only demo) ---------- */
  var form = document.getElementById("accessForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // Honeypot: silently ignore bots.
      if (form.website && form.website.value) return;
      var name = (form.fullName.value || "").trim();
      var email = (form.email.value || "").trim();
      var valid = name.length > 0 && /.+@.+\..+/.test(email);
      if (!valid) {
        (name ? form.email : form.fullName).focus();
        form.reportValidity && form.reportValidity();
        return;
      }
      var success = document.createElement("div");
      success.className = "form-success";
      success.setAttribute("role", "status");
      success.innerHTML =
        "<b>Request received (demo)</b><p style='margin:10px 0 0;color:var(--muted)'>Thanks, " +
        name.replace(/[<>&]/g, "") +
        ". This preview validated your request in-browser and sent nothing over the network. " +
        "On the live site, the secure application takes it from here.</p>";
      form.replaceWith(success);
      success.focus && success.focus();
    });
  }

  /* ---------- Footer year ---------- */
  // (Year is static 2026 in markup to match the demonstration context.)
})();
