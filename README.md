# Stofus 🛡️

**Stofus** is a professional-grade Chrome extension designed to help you reclaim your focus and eliminate digital distractions. Built on the latest **Manifest V3** architecture, it provides a reliable, performant, and privacy-focused way to manage your online habits.

---

## ✨ Features

### 🚫 Intelligent Website Blocking
- **Exact & Wildcard Matching**: Block specific domains (e.g., `facebook.com`) or entire subdomains using wildcards (e.g., `*.youtube.com`).
- **Timed Blocks**: Set duration-based blocks for minutes, hours, or days.
- **Smart Redirects**: Automatically diverts you to a beautiful, distraction-free landing page when you try to access a blocked site.

### 🔍 Keyword Content Filtering
- **Strict Filtering**: Block pages based on specific keywords to avoid falling down "rabbit holes."
- **Soft Bypass**: A 3-minute "Unintentional" bypass for keywords, allowing brief access when necessary with a mandatory cooldown period.

### 🚨 Emergency Bypass
- **Controlled Access**: Provides a 2-minute emergency unlock for blocked sites.
- **Cooldown Mechanism**: Prevents abuse with a mandatory 1-hour cooldown after every emergency use.

### 📊 Real-time Productivity Stats
- **Blocked Attempts**: Track how many times Stofus saved you from distraction.
- **Focus Streaks**: Monitor your daily progress and build long-term focus habits.

### 🎨 Modern UI/UX
- **Glassmorphism Design**: A clean, modern aesthetic that feels like a native part of your OS.
- **Responsive Dashboard**: Manage all your settings, blocked sites, and keywords from a single, intuitive popup.

---

## 🛠️ Technical Overview

Stofus is built with performance and stability in mind:

- **Manifest V3**: Fully compliant with the latest Chrome Extension standards.
- **Service Workers**: Efficient background processing using `background.js` for monitoring and blocking logic.
- **Storage API**: Uses `chrome.storage.local` for fast, persistent, and private data management.
- **Alarms API**: Handles timed events and expiration logic reliably, even when the browser is inactive.
- **Content Scripts**: Dynamic keyword filtering and UI overlays injected directly into web pages.

---

## 🚀 Installation (Development Mode)

Since Stofus is currently in development, you can install it manually:

1. Clone this repository or download the source code.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the folder containing the Stofus source code.
5. Pin the Stofus icon to your toolbar for easy access!

---

## 📂 Project Structure

- `manifest.json`: Extension configuration and permissions.
- `background.js`: The heart of the extension, handling blocking logic and state.
- `content.js`: Injected script for keyword filtering and UI overlays.
- `popup.html/js`: The main user interface for managing focus settings.
- `blocked.html/js`: The landing page displayed when a site is blocked.
- `friction.html/js`: Optional "friction" page to discourage impulsive browsing.

---

## 🛡️ Privacy

Stofus is built with privacy as a core principle. **All data, including your blocked sites, keywords, and stats, is stored locally on your device.** No data is ever sent to external servers.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

*Reclaim your time. Focus with Stofus.*
