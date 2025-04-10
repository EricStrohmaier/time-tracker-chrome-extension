// Content script that runs on the signin and extension-auth-success pages
// This script listens for authentication success and sends it to the extension

import { API_URL } from "./config";

// Function to extract URL parameters
function getUrlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryString = url.split("?")[1];

  if (!queryString) return params;

  const pairs = queryString.split("&");

  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    params[decodeURIComponent(key)] = decodeURIComponent(value || "");
  }

  return params;
}

// Check if this is the extension-auth-success page
const isExtensionAuthSuccess =
  window.location.pathname === "/extension-auth-success";

// Check if this is the signin page with extension=true parameter
const urlParams = getUrlParams(window.location.href);
const isExtensionAuth = urlParams.extension === "true";

// Function to fetch session data and send to extension
async function fetchSessionAndNotifyExtension() {
  try {
    // Fetch the current session
    const response = await fetch(`${API_URL}/api/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const sessionData = await response.json();

      // Extract user and token from the response
      const user = sessionData.user || sessionData.session?.user;
      const token =
        sessionData.token ||
        sessionData.access_token ||
        sessionData.session?.access_token;

      if (user && token) {


        // Try multiple ways to communicate with the extension
        try {
          // Method 1: Direct message to extension
          chrome.runtime.sendMessage(
            {
              type: "AUTH_SUCCESS",
              user: user,
              token: token,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "[AUTH DEBUG] Chrome runtime error:",
                  chrome.runtime.lastError
                );
              }
            }
          );

          // Method 2: Also notify any parent window (in case opened as popup)
          if (window.opener) {
            window.opener.postMessage(
              {
                type: "AUTH_SUCCESS",
                user: user,
                token: token,
              },
              window.location.origin
            );
          }

          return true;
        } catch (err) {
          console.error("Error sending message to extension:", err);
          throw err;
        }
      } else {
        console.error("No user data in session");
        throw new Error("No user data in session");
      }
    } else {
      console.error("Failed to fetch session data:", response.status);
      throw new Error("Failed to fetch session data: " + response.status);
    }
  } catch (error) {
    console.error("Error fetching session:", error);
    throw error;
  }
}

// Handle extension auth success page
if (isExtensionAuthSuccess) {
  // Add a visible message to the page for debugging
  const debugElement = document.createElement("div");
  debugElement.style.position = "fixed";
  debugElement.style.top = "10px";
  debugElement.style.right = "10px";
  debugElement.style.padding = "10px";
  debugElement.style.background = "rgba(0,0,0,0.7)";
  debugElement.style.color = "white";
  debugElement.style.borderRadius = "5px";
  debugElement.style.zIndex = "9999";
  debugElement.textContent = "Connecting to extension...";
  document.body.appendChild(debugElement);

  // Fetch session data and notify extension
  fetchSessionAndNotifyExtension()
    .then(() => {
      debugElement.textContent = "Connected to extension successfully!";
      setTimeout(() => {
        debugElement.style.opacity = "0";
        debugElement.style.transition = "opacity 0.5s";
      }, 2000);
    })
    .catch((error) => {
      debugElement.textContent =
        "Error connecting to extension: " + error.message;
      debugElement.style.background = "rgba(255,0,0,0.7)";
    });
}

// Handle signin page with extension=true
if (isExtensionAuth) {
  // Listen for auth success event from the page
  window.addEventListener("message", (event) => {
    // Only accept messages from the same origin
    if (event.origin !== window.location.origin) return;

    if (event.data.type === "AUTH_SUCCESS") {
      console.log("Auth success message received");
      fetchSessionAndNotifyExtension();
    }
  });
}

// Also listen for auth success in localStorage
const originalSetItem = localStorage.setItem;
localStorage.setItem = function (key, value) {
  // Call the original implementation
  originalSetItem.apply(this, [key, value]);

  // If this is an auth token and we're in extension mode
  if (key === "supabase.auth.token" && isExtensionAuth) {
    try {
      const tokenData = JSON.parse(value);
      if (tokenData.access_token && tokenData.user) {
        console.log("Auth token detected in localStorage");

        // Send message to the extension background script
        chrome.runtime.sendMessage({
          type: "AUTH_SUCCESS",
          token: tokenData.access_token,
          user: tokenData.user,
        });
      }
    } catch (error) {
      console.error("Error parsing auth token:", error);
    }
  }
};
