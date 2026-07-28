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
  } catch { /* storage may be unavailable */ }

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
      try { localStorage.setItem(THEME_KEY, next); } catch {}
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

  /* ---------- Mobile menu (keyboard + AT aware) ---------- */
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  var collapsed = window.matchMedia("(max-width: 940px)");

  function menuOpen() {
    return navLinks ? navLinks.classList.contains("open") : false;
  }
  /* Closed on a collapsed viewport → fully hidden from assistive tech.
     Open, or on desktop where links are inline → exposed again. */
  function syncMenuAccessibility() {
    if (!navLinks) return;
    var hidden = collapsed.matches && !menuOpen();
    navLinks.setAttribute("aria-hidden", hidden ? "true" : "false");
    if ("inert" in navLinks) navLinks.inert = hidden;
  }
  function setMenu(open, opts) {
    if (!navToggle || !navLinks) return;
    navLinks.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    syncMenuAccessibility();
    if (open) {
      var first = navLinks.querySelector("a");
      if (first) first.focus();
    } else if (opts && opts.refocus) {
      navToggle.focus();
    }
  }
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () { setMenu(!menuOpen()); });
    navLinks.addEventListener("click", function (e) {
      if (e.target.tagName === "A") setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuOpen()) setMenu(false, { refocus: true });
    });
    if (collapsed.addEventListener) collapsed.addEventListener("change", syncMenuAccessibility);
    syncMenuAccessibility();
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

  /* ---------- Access request form ----------
     Endpoint comes from <meta name="fa-waitlist-endpoint">. When set (the page
     is served from — or allowed by — the application origin) the form POSTs to
     the real waitlist API and only claims success on the server's 202. When
     empty (static hosting, no backend), a valid submission opens a mailto
     request instead — never a fake success. No secrets live in this file. */
  var form = document.getElementById("accessForm");
  var statusEl = document.getElementById("formStatus");
  var submitBtn = document.getElementById("formSubmit");
  var modeEl = document.getElementById("formMode");
  var endpointMeta = document.querySelector('meta[name="fa-waitlist-endpoint"]');
  var endpoint = endpointMeta ? endpointMeta.getAttribute("content").trim() : "";
  var startedAt = Date.now();
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var SENT_KEY = "fa-waitlist-sent";
  var MAILTO = "hello@findanything.dev";

  // The shipped page runs in live mode (endpoint set, markup says so). When the
  // endpoint is blank — the single-file bundle, or hosting without _worker.js —
  // flip the notice to describe the honest mailto fallback instead.
  if (modeEl && !endpoint) {
    modeEl.textContent = "This copy of the page has no submission backend — a valid request opens your email client instead. Nothing is transmitted silently.";
    modeEl.setAttribute("data-mode", "mailto");
  }

  function sentEmails() {
    try { return JSON.parse(sessionStorage.getItem(SENT_KEY) || "[]"); } catch { return []; }
  }
  function rememberEmail(email) {
    try {
      var list = sentEmails();
      if (list.indexOf(email) === -1) list.push(email);
      sessionStorage.setItem(SENT_KEY, JSON.stringify(list));
    } catch {}
  }
  function showStatus(kind, message, link) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    if (link) {
      statusEl.appendChild(document.createTextNode(" "));
      var a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.text;
      a.style.color = "var(--accent)";
      statusEl.appendChild(a);
    }
    statusEl.className = "form-status is-" + kind;
  }
  function setSubmitting(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "Submitting…" : "Request access";
  }
  function collect() {
    var tools = Array.prototype.slice
      .call(form.querySelectorAll('input[name="knowledgeTools"]:checked'))
      .map(function (el) { return el.value; });
    return {
      fullName: (form.fullName.value || "").trim(),
      email: (form.email.value || "").trim().toLowerCase(),
      company: (form.company.value || "").trim(),
      jobTitle: (form.jobTitle.value || "").trim(),
      companySize: form.companySize.value,
      knowledgeTools: tools,
      usesAiAgents: form.usesAiAgents.value === "yes",
      usesAiAgentsChosen: form.usesAiAgents.value !== "",
      knowledgeProblem: (form.knowledgeProblem.value || "").trim(),
      willingLimitedFolder: form.willingLimitedFolder.value === "yes",
      willingChosen: form.willingLimitedFolder.value !== "",
      intent: form.intent && form.intent.value === "demo" ? "demo" : "beta",
      website: form.website ? form.website.value : "",
    };
  }
  function validate(v) {
    if (v.fullName.length < 2) return { message: "Please enter your full name.", el: form.fullName };
    if (!EMAIL_RE.test(v.email)) return { message: "Please enter a valid work email address.", el: form.email };
    if (!v.company) return { message: "Please enter your company.", el: form.company };
    if (!v.jobTitle) return { message: "Please enter your role.", el: form.jobTitle };
    if (!v.companySize) return { message: "Please select a company size.", el: form.companySize };
    if (!v.usesAiAgentsChosen) return { message: "Please tell us whether your team uses AI agents.", el: form.usesAiAgents };
    if (!v.knowledgeTools.length) return { message: "Pick at least one place your team's knowledge lives.", el: form.querySelector('input[name="knowledgeTools"]') };
    if (v.knowledgeProblem.length < 20) return { message: "Tell us a bit more (at least 20 characters) about what your agents should trust.", el: form.knowledgeProblem };
    if (!v.willingChosen) return { message: "Please answer the limited-folder pilot question.", el: form.willingLimitedFolder };
    return null;
  }
  function successCard(message) {
    var success = document.createElement("div");
    success.className = "form-success";
    success.setAttribute("role", "status");
    success.setAttribute("tabindex", "-1");
    var b = document.createElement("b");
    b.textContent = "Request received";
    var p = document.createElement("p");
    p.style.cssText = "margin:10px 0 0;color:var(--muted)";
    p.textContent = message;
    success.appendChild(b);
    success.appendChild(p);
    form.replaceWith(success);
    success.focus();
  }
  function mailtoFallback(v) {
    var subject = "Find Anything — access request (" + v.company + ")";
    var body = [
      "Interested in: " + (v.intent === "demo" ? "booking a demo" : "beta access"),
      "Full name: " + v.fullName,
      "Work email: " + v.email,
      "Company: " + v.company,
      "Role: " + v.jobTitle,
      "Company size: " + v.companySize,
      "Uses AI agents: " + (v.usesAiAgents ? "yes" : "not yet"),
      "Knowledge lives in: " + v.knowledgeTools.join(", "),
      "Willing to pilot with a limited Drive folder: " + (v.willingLimitedFolder ? "yes" : "no"),
      "",
      "What our agents should be able to trust:",
      v.knowledgeProblem,
    ].join("\n");
    window.location.href = "mailto:" + MAILTO + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    showStatus("info", "Opened your email client with the request addressed to " + MAILTO + ". This static preview has no submission backend, so nothing was sent automatically.");
  }

  if (form) {
    var inFlight = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // A disabled button doesn't stop Enter-key or programmatic submits —
      // guard the handler itself so one request is in flight at a time.
      if (inFlight) return;
      // Honeypot: silently ignore bots.
      if (form.website && form.website.value) return;
      var v = collect();
      var problem = validate(v);
      if (problem) {
        showStatus("error", problem.message);
        if (problem.el) problem.el.focus();
        return;
      }
      if (sentEmails().indexOf(v.email) !== -1) {
        showStatus("info", "A request for " + v.email + " was already submitted from this browser session. We review every request — no need to send it twice.");
        return;
      }
      if (!endpoint) {
        mailtoFallback(v);
        return;
      }
      inFlight = true;
      setSubmitting(true);
      showStatus("info", "Submitting your request…");
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: v.fullName,
          email: v.email,
          company: v.company,
          jobTitle: v.jobTitle,
          companySize: v.companySize,
          knowledgeTools: v.knowledgeTools,
          usesAiAgents: v.usesAiAgents,
          knowledgeProblem: v.knowledgeProblem,
          willingLimitedFolder: v.willingLimitedFolder,
          website: v.website,
          intent: v.intent,
          startedAt: startedAt,
        }),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            if (res.status === 202) {
              rememberEmail(v.email);
              successCard(body.message || "Thanks. Your request was accepted for review. We'll contact you if there's a fit for the controlled beta.");
              return;
            }
            var message = body && body.error && body.error.message
              ? body.error.message
              : res.status === 429
                ? "Too many requests right now. Please try again later."
                : "The server couldn't save your request (HTTP " + res.status + "). Please try again.";
            // Submissions relayed through this page share one rate-limit
            // bucket upstream, so on 429 offer the application's own form,
            // which is limited per visitor instead.
            showStatus("error", message, res.status === 429 ? { href: "https://app.findanything.dev/#request-access", text: "Or submit directly on the application form →" } : null);
            inFlight = false;
            setSubmitting(false);
          });
        })
        .catch(function () {
          showStatus("error", "Network problem — nothing was saved. Check your connection and try again.");
          inFlight = false;
          setSubmitting(false);
        });
    });
  }
})();
