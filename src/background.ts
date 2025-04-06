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
chrome.storage.local.get(['userData'], (result) => {
  if (result.userData) {
    authState.isAuthenticated = true;
    authState.user = result.userData;
    console.log('User is already authenticated:', authState.user);
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  if (message.type === 'AUTH_SUCCESS') {
    // Store user data
    authState.isAuthenticated = true;
    authState.user = message.user;

    console.log('Saving auth data to storage:', { user: message.user, token: message.token });
    
    // Save to storage
    chrome.storage.local.set({
      userData: message.user,
      token: message.token
    });

    // Notify all extension pages about the auth update
    chrome.runtime.sendMessage({
      type: 'AUTH_UPDATED',
      isAuthenticated: true,
      user: message.user
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
    chrome.storage.local.remove(['userData', 'activeTimeEntry']);

    // Notify all extension pages
    chrome.runtime.sendMessage({
      type: 'AUTH_UPDATED',
      isAuthenticated: false
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'openLoginPage') {
    console.log('Opening login page...');
    try {
      chrome.windows.create({
        url: `${API_URL}/signin?extension=true`,
        type: 'popup',
        width: 800,
        height: 600
      }, (window) => {
        console.log('Login window created:', window);
        sendResponse({ success: true, windowId: window?.id });
      });
    } catch (error: any) {
      console.error('Error opening login window:', error);
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
