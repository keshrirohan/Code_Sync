// ─── CodeSync Content Script ─────────────────────────────────────────────────
// Runs on: https://leetcode.com/problems/*
// Detects accepted submissions, extracts code + metadata, sends to background.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  // Guard against re-injection
  if (window.__codeSyncInjected) return;
  window.__codeSyncInjected = true;

  console.log("🚀 CodeSync: Content script loaded");

  // ─── State ───────────────────────────────────────────────────────────────

  let isProcessing = false;
  let lastProcessedSlug = null;
  let lastProcessedTime = 0;
  const COOLDOWN_MS = 10000; // 10 seconds between syncs for same problem

  // ─── Toast Notification System ───────────────────────────────────────────

  function createToastContainer() {
    let container = document.getElementById("codesync-toast-container");
    if (container) return container;

    container = document.createElement("div");
    container.id = "codesync-toast-container";
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(container);
    return container;
  }

  function showToast(message, type = "info") {
    const container = createToastContainer();

    const colors = {
      info: { bg: "rgba(59,130,246,0.95)", icon: "⚡" },
      success: { bg: "rgba(34,197,94,0.95)", icon: "✅" },
      error: { bg: "rgba(239,68,68,0.95)", icon: "❌" },
      warning: { bg: "rgba(234,179,8,0.95)", icon: "⚠️" },
    };

    const { bg, icon } = colors[type] || colors.info;

    const toast = document.createElement("div");
    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 20px;
      border-radius: 12px;
      background: ${bg};
      color: white;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      backdrop-filter: blur(8px);
      transform: translateX(120%);
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 0.35s ease;
      opacity: 0;
      max-width: 360px;
      line-height: 1.4;
    `;

    toast.innerHTML = `<span style="font-size:16px">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
      toast.style.transform = "translateX(0)";
      toast.style.opacity = "1";
    });

    // Auto-dismiss
    setTimeout(() => {
      toast.style.transform = "translateX(120%)";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  // ─── Problem Metadata Extraction ─────────────────────────────────────────

  function extractProblemSlug() {
    return extractSlugFromUrl(window.location.href);
  }

  function extractProblemName() {
    // LeetCode renders the title in an <a> tag with the problem link
    // or in a specific heading element
    const titleEl =
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector(".text-title-large a") ||
      document.querySelector('a[href*="/problems/"][class*="text-label"]') ||
      document.querySelector('div[data-track-load="description_content"] h4') ||
      document.querySelector('[class*="flexlayout__tab"] [class*="title"]');

    if (titleEl) {
      return titleEl.textContent.trim().replace(/^\d+\.\s*/, "");
    }

    // Fallback: derive from slug
    const slug = extractProblemSlug();
    if (slug) {
      return slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }

    return null;
  }

  function extractDifficulty() {
    // LeetCode shows difficulty with specific color-coded classes
    const difficultyEl =
      document.querySelector('[diff]') ||
      document.querySelector('div[class*="text-difficulty"]') ||
      document.querySelector('[class*="text-olive"]') ||   // Easy
      document.querySelector('[class*="text-yellow"]') ||  // Medium  
      document.querySelector('[class*="text-pink"]');      // Hard

    if (difficultyEl) {
      const text = difficultyEl.textContent.trim().toLowerCase();
      if (text.includes("easy")) return "Easy";
      if (text.includes("medium")) return "Medium";
      if (text.includes("hard")) return "Hard";
    }

    // Try matching by color classes
    const easyEl = document.querySelector('[class*="text-olive"], [class*="text-green"], .text-difficulty-easy');
    if (easyEl) return "Easy";
    const medEl = document.querySelector('[class*="text-yellow"], [class*="text-orange"], .text-difficulty-medium');
    if (medEl) return "Medium";
    const hardEl = document.querySelector('[class*="text-pink"], [class*="text-red"], .text-difficulty-hard');
    if (hardEl) return "Hard";

    return "Unknown";
  }

  function extractCategory() {
    // Try to find topic tags on the problem page
    const tagEls = document.querySelectorAll(
      'a[href*="/tag/"], [class*="topic-tag"], div[class*="tag-"] a'
    );

    if (tagEls.length > 0) {
      // Return the first tag as the primary category
      return tagEls[0].textContent.trim();
    }

    return "Uncategorized";
  }

  // ─── Code & Language Extraction ──────────────────────────────────────────

  function extractLanguage() {
    // LeetCode's language selector button contains the current language
    const langButton =
      document.querySelector('[id*="headlessui-listbox-button"]') ||
      document.querySelector('button[class*="rounded"][class*="items-center"] .text-label-2') ||
      document.querySelector('div[class*="flex"][class*="cursor-pointer"] .text-label-2') ||
      document.querySelector('[data-cy="lang-btn"]');

    if (langButton) {
      const langText = langButton.textContent.trim().toLowerCase();
      return normalizeLeetCodeLanguage(langText);
    }

    // Fallback: try to find from the editor's language mode
    const editorEl = document.querySelector('.monaco-editor');
    if (editorEl) {
      const modeAttr = editorEl.getAttribute('data-mode-id');
      if (modeAttr) return normalizeLeetCodeLanguage(modeAttr);
    }

    return "python3"; // Safe default
  }

  function normalizeLeetCodeLanguage(lang) {
    const map = {
      "c++": "cpp",
      "c#": "csharp",
      "python 3": "python3",
      "python3": "python3",
      "python": "python3",
      "javascript": "javascript",
      "typescript": "typescript",
      "java": "java",
      "go": "go",
      "golang": "go",
      "ruby": "ruby",
      "swift": "swift",
      "kotlin": "kotlin",
      "rust": "rust",
      "scala": "scala",
      "php": "php",
      "c": "c",
      "dart": "dart",
      "racket": "racket",
      "erlang": "erlang",
      "elixir": "elixir",
      "mysql": "mysql",
      "ms sql server": "mssql",
      "oracle": "oraclesql",
    };

    const normalized = lang.toLowerCase().trim();
    return map[normalized] || normalized;
  }

  function extractCode() {
    // Strategy 1: Monaco editor — read from the view lines
    const monacoLines = document.querySelectorAll(
      '.monaco-editor .view-lines .view-line'
    );
    if (monacoLines.length > 0) {
      const lines = Array.from(monacoLines).map((line) => {
        // Get the text content, preserving whitespace structure
        return line.textContent;
      });
      const code = lines.join("\n");
      if (code.trim().length > 0) return code;
    }

    // Strategy 2: Try the textarea-based editor (older LeetCode)
    const textarea = document.querySelector(
      'textarea[name="typed-code"], .CodeMirror textarea'
    );
    if (textarea && textarea.value.trim().length > 0) {
      return textarea.value;
    }

    // Strategy 3: Try CodeMirror content
    const cmContent = document.querySelector('.CodeMirror-code');
    if (cmContent) {
      const lines = Array.from(cmContent.querySelectorAll('.CodeMirror-line')).map(
        (line) => line.textContent
      );
      const code = lines.join("\n");
      if (code.trim().length > 0) return code;
    }

    return null;
  }

  // ─── Submission Detection ────────────────────────────────────────────────

  /**
   * Check if an element or its children contain the "Accepted" text
   * that LeetCode shows after a successful submission.
   */
  function isAcceptedResult(node) {
    if (!node || !node.textContent) return false;

    const text = node.textContent.toLowerCase();

    // LeetCode shows "Accepted" in the result panel
    if (
      text.includes("accepted") &&
      !text.includes("not accepted") &&
      !text.includes("wrong answer") &&
      !text.includes("time limit") &&
      !text.includes("runtime error") &&
      !text.includes("compile error") &&
      !text.includes("memory limit")
    ) {
      // Verify it's actually the result indicator, not description text
      const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!el) return false;

      // Check for LeetCode's success indicator classes/attributes
      const isResultPanel =
        el.closest('[data-e2e-locator="submission-result"]') ||
        el.closest('[class*="result-"]') ||
        el.closest('[class*="success"]') ||
        el.querySelector('[class*="text-green"]') ||
        el.querySelector('[data-e2e-locator="submission-result"]');

      // Also check by matching LeetCode's specific "Accepted" heading style  
      const hasSuccessColor =
        el.style?.color?.includes("rgb(45") || // green tones
        el.classList?.toString()?.includes("green") ||
        el.classList?.toString()?.includes("success") ||
        el.classList?.toString()?.includes("accepted");

      return !!(isResultPanel || hasSuccessColor);
    }

    return false;
  }

  /**
   * Broader check: scan the result area for accepted status.
   */
  function checkForAcceptedSubmission() {
    // LeetCode's submission result panel selectors
    const resultSelectors = [
      '[data-e2e-locator="submission-result"]',
      '#qd-content [class*="success"]',
      '[class*="result__"] [class*="accepted"]',
      '[class*="text-green-s"][class*="text-"]',
    ];

    for (const selector of resultSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.toLowerCase().includes("accepted")) {
        return true;
      }
    }

    return false;
  }

  // ─── Sync Handler ────────────────────────────────────────────────────────

  async function handleAcceptedSubmission() {
    // Prevent duplicate processing
    const slug = extractProblemSlug();
    const now = Date.now();

    if (!slug) {
      console.warn("CodeSync: Could not extract problem slug");
      return;
    }

    if (isProcessing) {
      console.log("CodeSync: Already processing, skipping");
      return;
    }

    if (slug === lastProcessedSlug && now - lastProcessedTime < COOLDOWN_MS) {
      console.log("CodeSync: Cooldown active for this problem, skipping");
      return;
    }

    isProcessing = true;
    lastProcessedSlug = slug;
    lastProcessedTime = now;

    try {
      // Check auto-sync preference
      const autoSync = await getAutoSync();
      if (!autoSync) {
        console.log("CodeSync: Auto-sync is disabled");
        isProcessing = false;
        return;
      }

      // Small delay to let LeetCode finish rendering
      await new Promise((r) => setTimeout(r, 1500));

      const problemName = extractProblemName();
      const difficulty = extractDifficulty();
      const language = extractLanguage();
      const code = extractCode();
      const category = extractCategory();

      if (!code) {
        showToast("Could not extract code from the editor", "error");
        isProcessing = false;
        return;
      }

      if (!problemName) {
        showToast("Could not detect problem name", "error");
        isProcessing = false;
        return;
      }

      showToast(`Syncing "${problemName}" to GitHub...`, "info");

      // Build payload matching the SyncPayload interface from the backend
      const payload = {
        problemName,
        slug,
        difficulty,
        language,
        code,
        category,
      };

      // Send to background script for API submission
      const response = await chrome.runtime.sendMessage({
        type: "SYNC_SOLUTION",
        payload,
      });

      if (response?.success) {
        const status = response.data?.status || "SUCCESS";
        if (status === "SKIPPED") {
          showToast(`"${problemName}" already synced (identical code)`, "warning");
        } else {
          showToast(`"${problemName}" synced to GitHub!`, "success");
        }
      } else {
        const errorMsg = response?.error || "Sync failed";
        showToast(errorMsg, "error");
      }
    } catch (error) {
      console.error("CodeSync: Sync error", error);
      showToast("Sync failed — check your connection", "error");
    } finally {
      isProcessing = false;
    }
  }

  // ─── DOM Mutation Observer ───────────────────────────────────────────────

  const debouncedCheck = debounce(() => {
    if (checkForAcceptedSubmission()) {
      console.log("CodeSync: Accepted submission detected!");
      handleAcceptedSubmission();
    }
  }, 1000);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check added nodes for the "Accepted" result
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isAcceptedResult(node)) {
            console.log("CodeSync: Accepted result node detected!");
            handleAcceptedSubmission();
            return;
          }
        }
      }

      // Also check for text changes in existing nodes
      if (mutation.type === "characterData" || mutation.type === "childList") {
        const target = mutation.target;
        if (target && isAcceptedResult(target)) {
          handleAcceptedSubmission();
          return;
        }
      }
    }

    // Fallback: general page scan after DOM changes
    debouncedCheck();
  });

  // Start observing once the page is ready
  function startObserving() {
    const targetNode = document.querySelector("#app") || document.body;
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    console.log("CodeSync: Observing for accepted submissions");
  }

  // Wait for the LeetCode app to mount
  if (document.querySelector("#app")) {
    startObserving();
  } else {
    const readyObserver = new MutationObserver(() => {
      if (document.querySelector("#app")) {
        readyObserver.disconnect();
        startObserving();
      }
    });
    readyObserver.observe(document.body, { childList: true, subtree: true });
  }
})();