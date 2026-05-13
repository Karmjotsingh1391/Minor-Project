# ੴ Gurbani Live Tracker

A real-time Gurbani recitation tracking system that listens to speech, matches it against Sri Guru Granth Sahib Ji verses using fuzzy matching, and displays results instantly in a modern web interface.

---

## ✨ Features

- 🎙️ **Live Speech Recognition** — Captures microphone input and converts it to text using Google's Speech API (Punjabi / `pa-IN`)
- 📖 **Intelligent Verse Matching** — Fuzzy matches spoken text against the full Sri Guru Granth Sahib Ji scripture using `rapidfuzz`
- ⚡ **Real-Time Updates** — Results pushed instantly to the browser via WebSockets (Flask-SocketIO)
- 🔐 **OTP Authentication** — Secure email-based one-time password login using Gmail SMTP
- 📊 **Session Dashboard** — Live stats: match rate, total/matched/missed counts
- 🕐 **Activity Log** — Full searchable & filterable history of all speech recognition events
- 🌗 **Light / Dark Mode** — Toggle between themes, preference saved in `localStorage`

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask, Flask-SocketIO, Flask-Mail |
| Speech Recognition | `SpeechRecognition` library → Google Speech API |
| Verse Matching | `rapidfuzz` (token set ratio fuzzy matching) |
| Real-Time Comms | WebSockets via `socket.io` |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Authentication | Email OTP (Gmail SMTP) |

---

## 📁 Project Structure

```
Minor Project/
│
├── app.py                  # Main Flask server — routes, SocketIO events, speech logic
├── logic.py                # load_verses() + VerseMatcher class (fuzzy matching engine)
│
├── verses/
│   └── guru_granth_sahib.txt   # Full scripture dataset (UTF-8)
│
├── templates/
│   ├── main.html           # Main app UI (Dashboard, Go Live, Activity Log)
│   ├── login_test.html     # Login page (OTP flow — all CSS/JS inline)
│   └── index.html          # Legacy UI (accessible at /legacy)
│
└── static/
    ├── main.css            # Styles for main.html (sidebar, pages, components)
    ├── main.js             # JS for main.html (SocketIO, speech control, activity log)
    ├── style.css           # Styles for legacy index.html
    ├── app.js              # JS for legacy index.html
    └── socket.io.min.js    # SocketIO client library (shared)
```

---

## 🔄 How It Works

```
User speaks Gurbani into microphone
        │
        ▼
SpeechRecognition (pa-IN) → spoken text string
        │
        ▼
VerseMatcher.find_next_line(spoken_text)
  ├── 1. Searches next 15 paragraphs from last match (fast path ~0.001s)
  └── 2. Falls back to full-book search if not found
        │
        ▼
Match result emitted via SocketIO → browser displays matched verse instantly
```

### Matching Algorithm
- Uses **`fuzz.token_set_ratio`** from `rapidfuzz` with a default threshold of **60**
- Maintains a **position anchor** (`last_index`) so the matcher remembers where you are in the scripture — making real-time recitation tracking sequential and fast

---

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- A working microphone
- A Gmail account with an **App Password** (for OTP emails)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/gurbani-live-tracker.git
cd gurbani-live-tracker
```

### 2. Install Dependencies

```bash
pip install flask flask-socketio flask-mail SpeechRecognition rapidfuzz pyaudio
```

> **Windows users:** If `pyaudio` fails, install via:
> ```bash
> pip install pipwin && pipwin install pyaudio
> ```

### 3. Configure Gmail OTP (in `app.py`)

```python
app.config["MAIL_USERNAME"] = "your-email@gmail.com"
app.config["MAIL_PASSWORD"] = "your-app-password"   # Gmail App Password, not your regular password
app.config["MAIL_DEFAULT_SENDER"] = "your-email@gmail.com"
```

> Generate a Gmail App Password at: [myaccount.google.com → Security → App Passwords](https://myaccount.google.com/apppasswords)

### 4. Run the Server

```bash
python app.py
```

The browser will open automatically at `http://localhost:5000/login`.

---

## 🌐 Routes

| URL | Description |
|---|---|
| `/login` | OTP login page |
| `/` | Main app (Dashboard, Go Live, Activity Log) |
| `/legacy` | Old single-page UI (kept as fallback) |
| `POST /auth/send-otp` | Sends OTP to provided email |
| `POST /auth/verify-otp` | Verifies OTP and creates session |
| `POST /auth/logout` | Clears session |

---

## 📸 Screenshots

> *(Add screenshots of your login page, dashboard, and Go Live page here)*

---

## 📝 Notes

- OTP expires after **10 minutes**
- The verse matcher searches **15 paragraphs ahead** of the last match for speed, then falls back to a full-book search
- Session stats reset on server restart (not persisted to a database)
- The app uses `allow_unsafe_werkzeug=True` — intended for local/dev use only

---

## 🙏 Acknowledgements

- Sri Guru Granth Sahib Ji — the living scripture this project is built to honour
- [RapidFuzz](https://github.com/maxbachmann/RapidFuzz) for fast fuzzy string matching
- [Flask-SocketIO](https://flask-socketio.readthedocs.io/) for real-time WebSocket support
- [SpeechRecognition](https://github.com/Uberi/speech_recognition) for microphone and Google Speech API integration

---

*Built with reverence for Gurbani · Powered by Python & Flask-SocketIO*

