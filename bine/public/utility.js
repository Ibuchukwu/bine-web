import { signOut , onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { auth } from "./firebase.js";
connectAuthEmulator(auth, "http://localhost:9099");
let currentUser = null;

onAuthStateChanged(auth, async (User) => {
  if (User) {
    currentUser = User;
    console.log("UID is :", currentUser.uid);
  } else {
    console.error("No user is signed in.");
    if(window.location.pathname != '/login' && window.location.pathname != '/signup'){
      notice("No user is signed in.", "error");
      window.location.href = '/login.html';
    }
  }
});

export const token = async function () {
    if (currentUser) {
      console.log("About to fetch token..");
      const token = await currentUser.getIdToken(); // `true` forces refresh
      console.log("Token", token);
      return token;
    } else {
      throw new Error("No authenticated user");
    }
  };


/**
 * Displays temporary notification messages and logs them to console
 * @param {string} message - The message to display and log
 * @param {'success'|'error'|'info'} type - Type of notice ('success', 'error', 'info')
 */
function notice(message, type = 'success') {
  // Calculate display duration based on message length
  const displayDuration = (message.toString().length) * 230;
  const existingNotices = document.querySelectorAll('.notice');
  
  // Calculate vertical offset based on existing notices
  let offsetY = 20;
  existingNotices.forEach(notice => {
    offsetY += notice.offsetHeight + 10;
  });

  // Create notice element
  const noticeElement = document.createElement('div');
  noticeElement.className = `notice ${type}`;
  noticeElement.style.top = `${offsetY}px`;
  noticeElement.innerHTML = `
    <i class="fas ${type === 'error' ? 'fa-times-circle' : 
      (type === 'info' ? 'fa-circle-info' : 'fa-check-circle')}"></i>
    <span>${message}</span>
    <div class="progress"></div>
  `;

  // Add to DOM
  document.body.appendChild(noticeElement);
  
  // Enhanced console logging
  const logMessage = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}`;
  switch(type) {
    case 'error':
      console.error(logMessage);
      break;
    case 'info':
      console.info(logMessage);
      break;
    case 'success':
      console.log(logMessage); // or console.info for success messages
      break;
    default:
      console.log(logMessage);
  }

  // Trigger animations
  setTimeout(() => {
    noticeElement.style.transform = 'translateX(0)';
    noticeElement.querySelector('.progress').style.width = '0%';
  }, 10);

  // Auto-remove after delay
  setTimeout(() => {
    noticeElement.style.transform = 'translateX(100%)';
    setTimeout(() => noticeElement.remove(), 500);
  }, displayDuration);
}
/**
 * Displays modal windows with smooth animations
 * @param {"load"|"open"|"close"|"update"} action - "load"|"open"|"close"|"update"
 * @param {string|null} content - HTML content for the window
 * @param {object} options - Additional configuration
 * @param {boolean} modal - 
 */
function runWindow(action, content = null, options = {}, modal) {
  // Configuration defaults
  const config = {
    closeButton: true,
    animationDuration: 300,
    ...options
  };

  // Get or create window elements
  let frame = document.getElementById("window-frame");
  let windowEl = document.querySelector(".window");

  // Create elements if they don't exist
  if (!frame) {
    frame = document.createElement("div");
    frame.id = "window-frame";
    frame.className = "window-frame";
    document.body.appendChild(frame);
  }

  if (!windowEl) {
    windowEl = document.createElement("div");
    windowEl.className = "window";
    document.body.appendChild(windowEl);
  }

  // Handle different actions
  switch (action.toLowerCase()) {
    case "load":
      renderLoading(windowEl);
      showElements(frame, windowEl);
      break;

    case "open":
    case "show":
      if (content) {
        renderContent(windowEl, content, config.closeButton);
        showElements(frame, windowEl);
      }
      break;

    case "close":
    case "hide":
      hideElements(frame, windowEl, config.animationDuration);
      break;

    case "update":
      if (content) {
        renderContent(windowEl, content, config.closeButton);
      }
      break;

    default:
      console.warn(`Unknown action: ${action}`);
  }
}

// Helper functions
function renderLoading(container) {
  container.innerHTML = `
    <div class="loading-content">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading, please wait...</p>
    </div>
  `;
}

function renderContent(container, content, showCloseButton) {
  container.innerHTML = `
    ${showCloseButton ? '<span class="modal-close-btn" onclick="runWindow(\'close\')">×</span>' : ''}
    ${content}
  `;
}

function showElements(frame, windowEl) {
  // Ensure elements are in DOM
  if (!document.body.contains(frame)) document.body.appendChild(frame);
  if (!document.body.contains(windowEl)) document.body.appendChild(windowEl);

  // Trigger reflow before adding visible class
  void frame.offsetHeight;
  void windowEl.offsetHeight;

  frame.classList.add("visible");
  windowEl.classList.add("visible");
}

function hideElements(frame, windowEl, duration) {
  if (!frame || !windowEl) return;

  frame.classList.remove("visible");
  windowEl.classList.remove("visible");

  // Remove after animation completes
  setTimeout(() => {
    if (frame && document.body.contains(frame)) {
      frame.remove();
    }
    if (windowEl && document.body.contains(windowEl)) {
      windowEl.remove();
    }
  }, duration);
}
/**
 * Shows or hides a loading spinner on a button element while managing its state.
 * @param {"show" | "hide"} action - "show" to display spinner, "hide" to restore original content
 * @param {string} elementId - ID of the button element to modify
 * @param {object} [options] - Optional configuration
 * @param {string} [options.spinnerClass] - Custom spinner classes (default: 'fas fa-spinner fa-spin')
 * @param {string} [options.fallbackText] - Fallback text if original content can't be restored
 */
export function showLoad(action, elementId, options = {}) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Element with ID "${elementId}" not found.`);
    return;
  }

  const {
    spinnerClass = 'fas fa-spinner fa-spin',
    fallbackText = 'Submit'
  } = options;

  if (action === "show") {
    // Store original state
    element.dataset.prevContent = element.innerHTML;
    element.dataset.prevAriaLabel = element.getAttribute('aria-label') || '';
    
    // Apply loading state
    element.innerHTML = `<i class="${spinnerClass}" aria-hidden="true"></i>`;
    element.disabled = true;
    element.setAttribute('aria-label', 'Loading...');
    
  } else if (action === "hide") {
    // Restore original state
    element.innerHTML = element.dataset.prevContent || fallbackText;
    element.disabled = false;
    element.setAttribute('aria-label', element.dataset.prevAriaLabel);
    
    // Clean up data attributes
    delete element.dataset.prevContent;
    delete element.dataset.prevAriaLabel;
  }
}

export function formatCurrency(amount) {
    return parseFloat(amount).toLocaleString('en-NG', { 
        style: 'currency', 
        currency: 'NGN',
        minimumFractionDigits: 2
    });
}

export function getCharge(amount) {
    const numericAmount = parseFloat(amount); 
    if (isNaN(numericAmount) || numericAmount < 0) {
        console.error("Invalid or negative amount provided for charge calculation.");
        return 0.00;
    }
    const rate = 1.2;
    const chargePercentage = numericAmount * (rate / 100);
    const cappedCharge = Math.min(chargePercentage, 250);
    const finalCharge = Math.round(cappedCharge * 100) / 100;

    console.log(`Charge of ${numericAmount} is ${finalCharge.toFixed(2)}`); // Log formatted
    return finalCharge; // Return as a number
}

/**
 * Makes an authenticated API request with error handling and automatic token management
 * @async
 * @function makeRequest
 * @param {string} url - The endpoint URL to make the request to
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method - The HTTP method for the request
 * @param {Object} [body] - The request payload (optional, not used for GET requests)
 * @param {Object} [options] - Additional request options
 * @param {Object} [options.headers] - Additional headers to include
 * @param {number} [options.timeout=8000] - Request timeout in milliseconds
 * @returns {Promise<Response>} - Returns the response object or throws an error
 * @throws {Error} Will throw an error if the request fails or times out
 * 
 * @example
 * // GET request
 * const response = await makeRequest('/api/users', 'GET');
 * 
 * @example
 * // POST request with body
 * const response = await makeRequest('/api/users', 'POST', { name: 'John' });
 * 
 * @example
 * // With custom headers and timeout
 * const response = await makeRequest('/api/users', 'GET', null, {
 *   headers: { 'X-Custom-Header': 'value' },
 *   timeout: 10000
 * });
 */
export async function makeRequest(url, method, body = null, options = {}) {
  const { headers = {}, timeout = 8000 } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const idToken = await token();
    
    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        ...headers
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }

    console.error(`API Request Error (${method} ${url}):`, error);
    throw error; // Re-throw for the caller to handle
  }
}

export function toCentralISOString(value, fallbackToNow = false) {
  try {
    let date;

    // Handle null/undefined
    if (value == null) {
      return fallbackToNow ? toCentralISOString(new Date()) : null;
    }

    // Firestore Timestamp (both v8 and v9 formats)
    if (typeof value === 'object') {
      if ('toDate' in value) {
        // Firestore v9 Timestamp
        date = value.toDate();
      } else if ('_seconds' in value) {
        // Firestore v8 Timestamp
        date = new Date(value._seconds * 1000 + (value._nanoseconds / 1000000));
      }
    }
    
    // JavaScript Date object
    else if (value instanceof Date) {
      date = new Date(value); // Create new instance to avoid mutation
    }
    
    // Number (timestamp in milliseconds or seconds)
    else if (typeof value === 'number') {
      date = new Date(value > 9999999999 ? value : value * 1000);
    }
    
    // String (try parsing various formats)
    else if (typeof value === 'string') {
      // Try ISO format first
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        date = new Date(value);
      } else {
        // Try other common formats
        date = new Date(value.replace(/-/g, '/'));
      }
    }

    // Validate date
    if (!date || isNaN(date.getTime())) {
      return fallbackToNow ? toCentralISOString(new Date()) : null;
    }

    // Format for Central Africa Time (UTC+1)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const partMap = {};
    parts.forEach(part => {
      partMap[part.type] = part.value;
    });

    // Get actual timezone offset
    const tzOffset = -date.toLocaleString('en', { timeZone: 'Africa/Lagos', timeZoneName: 'longOffset' })
      .split('GMT')[1]
      .trim();

    return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}`;

  } catch (err) {
    console.error('Date conversion error:', err);
    return fallbackToNow ? toCentralISOString(new Date()) : null;
  }
}

export {notice, runWindow};