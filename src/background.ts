interface User {
  id: string;
  email: string;
}

interface TimeEntry {
  id: string;
  project_id: string;
  end_time?: string;
}

import { API_URL } from './config';

// Initialize state
let authState = {
  isAuthenticated: false,
  user: null as User | null
};


// Check if user is already authenticated on startup
chrome.storage.local.get(['userData', 'token'], (result) => {
  if (result.userData && result.token) {
    authState.isAuthenticated = true;
    authState.user = result.userData;

    // Set badge to indicate logged-in state
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#00873c' });
  } else {
    // Clear auth state if incomplete data
    authState.isAuthenticated = false;
    authState.user = null;
    chrome.storage.local.remove(['userData', 'token', 'activeTimeEntry']);
    chrome.action.setBadgeText({ text: '' });
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'AUTH_SUCCESS') {

    // Store user data
    authState.isAuthenticated = true;
    authState.user = message.user;


    // Save to storage
    chrome.storage.local.set({
      userData: message.user,
      token: message.token
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[AUTH DEBUG] Error saving to storage:', chrome.runtime.lastError);
      } else {
        console.log('[AUTH DEBUG] Successfully saved auth data to storage');
      }
    });

    // Set badge to indicate logged-in state
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#00873c' });

    // Notify all extension pages about the auth update
    chrome.runtime.sendMessage({
      type: 'AUTH_UPDATED',
      isAuthenticated: true,
      user: message.user
    }, (broadcastResponse) => {
      if (chrome.runtime.lastError) {
        console.log('[AUTH DEBUG] Error broadcasting update:', chrome.runtime.lastError);
      } else {
        console.log('[AUTH DEBUG] Broadcast response:', broadcastResponse);
      }
    });

    // Close any auth tabs that might be open
    chrome.tabs.query({ url: `${API_URL}/signin*` }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.remove(tab.id);
      });
    });

    // Close any auth success tabs
    chrome.tabs.query({ url: `${API_URL}/extension-auth-success*` }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.remove(tab.id);
      });
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getAuthStatus') {
    sendResponse({
      isAuthenticated: authState.isAuthenticated,
      user: authState.user
    });
    return true;
  }

  if (message.action === 'logout') {
    // Clear auth state
    authState.isAuthenticated = false;
    authState.user = null;

    // Clear storage
    chrome.storage.local.remove(['userData', 'token', 'activeTimeEntry']);

    // Clear badge
    chrome.action.setBadgeText({ text: '' });

    // Notify all extension pages
    chrome.runtime.sendMessage({
      type: 'AUTH_UPDATED',
      isAuthenticated: false
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'openLoginPage') {
    try {
      const loginUrl = `${API_URL}/signin?extension=true`;

      chrome.windows.create({
        url: loginUrl,
        type: 'popup',
        width: 800,
        height: 600
      }, (window) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        sendResponse({ success: true, windowId: window?.id });
      });
    } catch (error: any) {
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    }
    return true; // Keep the message channel open for async response
  }
});

// Listen for alarm to sync data periodically
if (chrome.alarms) {
  chrome.alarms.create('syncData', { periodInMinutes: 5 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'syncData') {
      syncActiveTimeEntry();
    }
  });
} else {
  console.warn('Alarms API not available. Periodic sync disabled.');
}

// Sync active time entry with the server
async function syncActiveTimeEntry() {
  try {
    const { userData, activeTimeEntry } = await chrome.storage.local.get(['userData', 'activeTimeEntry']) as {
      userData?: User;
      activeTimeEntry?: { id: string; projectId: string };
    };

    if (!userData || !activeTimeEntry) return;

    // Check if the time entry is still active on the server
    const response = await fetch(`${API_URL}/api/time-entries/${activeTimeEntry.id}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();

      // If the time entry has been stopped on the server, update local state
      if (data.end_time) {
        await chrome.storage.local.remove('activeTimeEntry');

        // Notify all extension pages
        chrome.runtime.sendMessage({
          type: 'TIME_ENTRY_STOPPED',
          timeEntryId: activeTimeEntry.id
        });
      }
    }
  } catch (error) {
    console.error('Error syncing active time entry:', error);
  }
}
