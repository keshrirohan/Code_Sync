// ============================================================================
// leetcodeClient.js — Talks to LeetCode's GraphQL API.
//
// This file handles ALL communication with LeetCode. It has three small
// functions (one per API query) and one orchestrator that combines them.
//
// Every request needs these headers:
//   - Cookie:     Your session cookie so LeetCode knows who you are
//   - User-Agent: LeetCode blocks requests that don't look like a real browser
//   - Referer:    LeetCode's CSRF protection requires this header
//   - Content-Type: We're sending JSON (GraphQL queries)
// ============================================================================

import fetch from "node-fetch";

// The single GraphQL endpoint for all LeetCode API queries
const LEETCODE_API_URL = "https://leetcode.com/graphql";

/**
 * extractCsrfToken — Pulls the csrftoken value out of a cookie string.
 *
 * LeetCode's GraphQL endpoint requires the CSRF token to be sent as BOTH:
 *   1. Part of the Cookie header  (e.g. "csrftoken=abc123")
 *   2. A standalone x-csrftoken request header (value: "abc123")
 *
 * Without the header, POST requests return HTTP 400 even if the cookie is valid.
 */
function extractCsrfToken(cookie) {
  const match = cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1].trim() : "";
}

/**
 * buildHeaders — Creates the HTTP headers needed for every LeetCode request.
 *
 * Input:  cookie (string) — the user's LeetCode session cookie
 * Output: an object with all required headers
 *
 * Why each header matters:
 *   Cookie       → authenticates the request (tells LeetCode who the user is)
 *   x-csrftoken  → LeetCode's CSRF protection for POST requests (must match cookie)
 *   User-Agent   → LeetCode rejects requests without a browser-like User-Agent
 *   Referer      → Additional CSRF check — must be the leetcode.com origin
 *   Content-Type → we're sending a JSON body containing a GraphQL query
 */
function buildHeaders(cookie) {
  return {
    "Content-Type": "application/json",
    Cookie: cookie,
    "x-csrftoken": extractCsrfToken(cookie),
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://leetcode.com",
    Origin: "https://leetcode.com",
  };
}


/**
 * sleep — Pauses execution for a given number of milliseconds.
 *
 * Input:  ms (number) — how long to wait
 * Output: a Promise that resolves after `ms` milliseconds
 *
 * Used between retries and between API calls to avoid rate limiting.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// FUNCTION 1: Fetch the list of all solved questions
// ============================================================================

/**
 * fetchSolvedQuestions — Gets ALL unique questions the user has ever AC'd.
 *
 * Strategy: paginate "submissionList" (server-side cap = 20 per page) with
 * increasing offset, collect every unique accepted titleSlug, stop when a page
 * has fewer than PAGE_SIZE results.
 *
 * Why not userProgressQuestionList?
 *   — It has a hardcoded default of 10 results and accepts NO pagination args
 *     (limit / skip / pageSize all rejected). It would miss the majority of
 *     problems for any serious user.
 *
 * Why not recentAcSubmissionList?
 *   — Hard-capped at 20 by the server regardless of the limit argument.
 */
async function fetchSolvedQuestions(cookie) {
  console.log("Fetching your solved questions from LeetCode...");

  const seen      = new Set();  // titleSlugs already added (dedup)
  const questions = [];
  let   offset    = 0;
  const PAGE_SIZE = 20;         // LeetCode caps submissionList at 20 per page

  while (true) {
    const query = `
      query submissionList($offset: Int!, $limit: Int!) {
        submissionList(offset: $offset, limit: $limit) {
          submissions {
            id
            titleSlug
            statusDisplay
          }
        }
      }
    `;

    const response = await fetch(LEETCODE_API_URL, {
      method: "POST",
      headers: buildHeaders(cookie),
      body: JSON.stringify({
        query,
        variables: { offset, limit: PAGE_SIZE },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch submissions (HTTP ${response.status}). ` +
          "Is your cookie valid?"
      );
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(
        `GraphQL error: ${data.errors.map((e) => e.message).join("; ")}`
      );
    }

    const submissions = data.data.submissionList.submissions;
    if (!submissions || submissions.length === 0) break;

    for (const sub of submissions) {
      if (sub.statusDisplay === "Accepted" && !seen.has(sub.titleSlug)) {
        seen.add(sub.titleSlug);
        questions.push({
          id:              null, // filled later from submissionDetails.question.questionId
          title:           null, // filled later from submissionDetails.question.title
          titleSlug:       sub.titleSlug,
          lastSubmittedAt: null, // filled later from submissionDetails.timestamp
        });
      }
    }

    if (submissions.length < PAGE_SIZE) break; // last page reached
    offset += PAGE_SIZE;
    await sleep(300); // be polite to LeetCode's servers
  }

  console.log(`Found ${questions.length} solved questions.`);
  return questions;
}

// ============================================================================
// FUNCTION 2: Fetch the latest accepted submission ID for a specific question
// ============================================================================

/**
 * fetchLatestSubmissionId — Gets the submission ID of the most recent accepted
 *                           submission for a given question.
 *
 * Input:  cookie (string), titleSlug (string) — e.g. "two-sum"
 * Output: the submission ID (number) of the latest accepted submission,
 *         or null if no accepted submission exists
 *
 * We use the "questionSubmissionList" query and filter for ACCEPTED status.
 * We only need the first result (limit: 1) since they come in newest-first order.
 */
async function fetchLatestSubmissionId(cookie, titleSlug) {
  const query = `
    query questionSubmissionList {
      questionSubmissionList(
        questionSlug: "${titleSlug}"
        status: 10
        limit: 1
        offset: 0
      ) {
        submissions {
          id
          lang
        }
      }
    }
  `;
  // status: 10 means ACCEPTED in LeetCode's internal numbering

  const response = await fetch(LEETCODE_API_URL, {
    method: "POST",
    headers: buildHeaders(cookie),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch submissions for "${titleSlug}" (HTTP ${response.status})`
    );
  }

  const data = await response.json();
  const submissions = data.data.questionSubmissionList.submissions;

  // If the user has no accepted submissions for this question, return null
  if (!submissions || submissions.length === 0) {
    return null;
  }

  // Return the first (latest) accepted submission's ID and language
  return {
    submissionId: submissions[0].id,
    lang: submissions[0].lang,
  };
}

// ============================================================================
// FUNCTION 3: Fetch the actual code for a specific submission
// ============================================================================

/**
 * fetchSubmissionCode — Gets the actual source code of a specific submission.
 *
 * Input:  cookie (string), submissionId (number)
 * Output: the code string
 *
 * IMPORTANT: LeetCode's API is FLAKY for this endpoint. It sometimes returns
 * empty data or errors randomly. So we wrap this in a retry loop:
 *   - Try up to 5 times
 *   - Wait 1 second between retries
 *   - If all 5 retries fail, throw an error
 */
/**
 * fetchSubmissionDetails — Gets the code AND the frontend question number
 *                          for a specific submission.
 *
 * Returns { code, questionId } where questionId is the human-visible number
 * (e.g. "1" for Two Sum). This replaces the old fetchSubmissionCode because
 * we now also need questionId here since userProgressQuestionList no longer
 * returns frontendQuestionId.
 *
 * NOTE: "frontendQuestionId" was removed from QuestionNode in mid-2026.
 *       Use "questionId" instead (same value).
 */
async function fetchSubmissionDetails(cookie, submissionId) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const query = `
        query submissionDetails($submissionId: Int!) {
          submissionDetails(submissionId: $submissionId) {
            code
            lang { name verboseName }
            question {
              questionId
              title
              titleSlug
            }
            timestamp
          }
        }
      `;

      const response = await fetch(LEETCODE_API_URL, {
        method: "POST",
        headers: buildHeaders(cookie),
        body: JSON.stringify({ query, variables: { submissionId: Number(submissionId) } }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.data || !data.data.submissionDetails) {
        throw new Error("Empty response from LeetCode");
      }

      const details = data.data.submissionDetails;

      if (!details.code) {
        throw new Error("Code field is empty");
      }

      return {
        code:            details.code,
        lang:            details.lang?.name || "unknown",
        questionId:      details.question?.questionId || null,
        // title from the question node (so we don't need a separate query)
        title:           details.question?.title || "",
        // timestamp from submissionDetails is a Unix epoch integer (seconds)
        // Convert to ISO 8601 string so handler.js / gitClient.js can use it directly
        lastSubmittedAt: details.timestamp
          ? new Date(details.timestamp * 1000).toISOString()
          : new Date().toISOString(),
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to fetch details for submission ${submissionId} after ` +
            `${MAX_RETRIES} retries. Last error: ${error.message}`
        );
      }
      console.log(
        `  Retry ${attempt}/${MAX_RETRIES} for submission ${submissionId}` +
          ` (${error.message})`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// ============================================================================
// ORCHESTRATOR: Combine all three functions to get complete submission data
// ============================================================================

/**
 * fetchAllSubmissions — Fetches ALL data for every solved question.
 *
 * Input:  cookie (string) — the user's LeetCode session cookie
 * Output: array of complete submission objects:
 *         [{ id, title, titleSlug, lastSubmittedAt, lang, code }]
 *
 * How it works:
 *   Step 1: Get the list of all solved questions
 *   Step 2: For EACH question, fetch its latest submission ID and language
 *   Step 3: For EACH submission ID, fetch the actual code
 *
 * We add a small delay (300ms) between questions to avoid hammering
 * LeetCode's API and getting rate-limited.
 */
async function fetchAllSubmissions(cookie) {
  // Step 1: Get all solved questions (title, titleSlug, lastSubmittedAt)
  const questions = await fetchSolvedQuestions(cookie);

  const allSubmissions = [];

  // Step 2 & 3: For each question, get the latest submission ID, then full details
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];

    console.log(
      `Fetching submission ${i + 1}/${questions.length}: ${question.title}...`
    );

    // Step 2: Get the latest accepted submission ID + lang
    const submissionInfo = await fetchLatestSubmissionId(
      cookie,
      question.titleSlug
    );

    if (!submissionInfo) {
      console.log(`  Skipping "${question.title}" — no accepted submission found`);
      continue;
    }

    // Step 3: Get code, questionId, title, and original timestamp
    const details = await fetchSubmissionDetails(cookie, submissionInfo.submissionId);

    allSubmissions.push({
      id:              details.questionId || question.titleSlug,
      title:           details.title      || question.titleSlug,
      titleSlug:       question.titleSlug,
      lastSubmittedAt: details.lastSubmittedAt, // ISO string from Unix*1000
      lang:            details.lang || submissionInfo.lang,
      code:            details.code,
    });

    // Polite delay between questions to avoid rate limiting
    await sleep(300);
  }

  console.log(
    `\nSuccessfully fetched ${allSubmissions.length} submissions.\n`
  );
  return allSubmissions;
}

export {
  fetchSolvedQuestions,
  fetchLatestSubmissionId,
  fetchSubmissionDetails,
  fetchAllSubmissions,
};
