import os
import sys
import time
import random
import threading
import webbrowser
import speech_recognition as sr
from flask import Flask, render_template, request, jsonify, session
from flask_mail import Mail, Message
from flask_socketio import SocketIO, emit
from logic import load_verses, VerseMatcher


def resource_path(relative_path):
    """Get absolute path to resource — works for dev and for PyInstaller exe."""
    base = getattr(sys, '_MEIPASS', os.path.abspath(os.path.dirname(__file__)))
    return os.path.join(base, relative_path)


app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = "gurbani-tracker-secret-2024"


app.config["MAIL_SERVER"]         = "smtp.gmail.com"
app.config["MAIL_PORT"]           = 587
app.config["MAIL_USE_TLS"]        = True
app.config["MAIL_USERNAME"]       = "karamjotkalra2005@gmail.com"
app.config["MAIL_PASSWORD"]       = "mvmi uxap wvbf jjrs"  
app.config["MAIL_DEFAULT_SENDER"] = "karamjotkalra2005@gmail.com"


mail    = Mail(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


_otp_store = {}
OTP_EXPIRY_SECONDS = 600 

@app.route("/login")
def login_page():
    return render_template("login_test.html")


@app.route("/auth/send-otp", methods=["POST"])
def send_otp():
    data  = request.get_json(silent=True) or {}
    name  = (data.get("name")  or "").strip()
    email = (data.get("email") or "").strip().lower()

    if not name or not email or "@" not in email:
        return jsonify({"success": False, "message": "Please provide a valid name and email."}), 400


    otp = str(random.randint(100000, 999999))
    _otp_store[email] = {
        "otp":        otp,
        "name":       name,
        "expires_at": time.time() + OTP_EXPIRY_SECONDS,
    }

    try:
        msg = Message(
            subject="Your Gurbani Tracker OTP",
            recipients=[email],
        )
        msg.html = f"""
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;
                    background:#0f1117;color:#e8eaf6;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#f97316,#db2777);padding:28px 32px;">
            <h1 style="margin:0;font-size:1.5rem;color:#fff;">ੴ Gurbani Live Tracker</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:.9rem;">One-Time Password</p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 8px;">ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, <strong>{name}</strong> 🙏</p>
            <p style="color:#9094b8;margin:0 0 24px;font-size:.9rem;">
              Use the code below to sign in. It expires in 10 minutes.
            </p>
            <div style="background:#1a1d27;border:1px solid #2e3250;border-radius:12px;
                        padding:24px;text-align:center;">
              <span style="font-size:2.8rem;font-weight:800;letter-spacing:12px;
                           color:#f97316;">
                {otp}
              </span>
            </div>
            <p style="color:#9094b8;font-size:.78rem;margin:20px 0 0;text-align:center;">
              If you didn't request this, please ignore this email.
            </p>
          </div>
        </div>
        """
        mail.send(msg)
        print(f"[Auth] OTP sent to {email}")
        return jsonify({"success": True, "message": "OTP sent successfully."})
    except Exception as e:
        print(f"[Auth] Mail error: {e}")
        return jsonify({"success": False, "message": f"Failed to send email: {str(e)}"}), 500


@app.route("/auth/verify-otp", methods=["POST"])
def verify_otp():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp   = (data.get("otp")   or "").strip()

    if not email or not otp:
        return jsonify({"success": False, "message": "Email and OTP are required."}), 400

    record = _otp_store.get(email)
    if not record:
        return jsonify({"success": False, "message": "No OTP was requested for this email."}), 400
    if time.time() > record["expires_at"]:
        _otp_store.pop(email, None)
        return jsonify({"success": False, "message": "OTP has expired. Please request a new one."}), 400
    if record["otp"] != otp:
        return jsonify({"success": False, "message": "Incorrect OTP. Please try again."}), 400


    _otp_store.pop(email, None)
    session["user"] = {"name": record["name"], "email": email}
    print(f"[Auth] Verified: {email}")
    return jsonify({"success": True, "message": "Verified successfully."})


@app.route("/auth/logout", methods=["POST"])
def logout():
    session.pop("user", None)
    return jsonify({"success": True})


@app.route("/auth/me")
def auth_me():
    user = session.get("user")
    if not user:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    return jsonify({"success": True, "user": user})


@app.route("/settings/update-name", methods=["POST"])
def settings_update_name():
    user = session.get("user")
    if not user:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    data = request.get_json(silent=True) or {}
    new_name = (data.get("name") or "").strip()
    if not new_name or len(new_name) < 2:
        return jsonify({"success": False, "message": "Name must be at least 2 characters."}), 400
    session["user"]["name"] = new_name
    session.modified = True
    return jsonify({"success": True, "message": "Name updated successfully.", "user": session["user"]})


_email_change_store = {}
EMAIL_CHANGE_EXPIRY = 600


@app.route("/settings/send-email-otp", methods=["POST"])
def settings_send_email_otp():
    user = session.get("user")
    if not user:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    data = request.get_json(silent=True) or {}
    new_email = (data.get("new_email") or "").strip().lower()
    if not new_email or "@" not in new_email:
        return jsonify({"success": False, "message": "Please provide a valid new email address."}), 400
    if new_email == user["email"]:
        return jsonify({"success": False, "message": "New email is the same as your current email."}), 400

    otp = str(random.randint(100000, 999999))
    _email_change_store[user["email"]] = {
        "otp": otp,
        "new_email": new_email,
        "expires_at": time.time() + EMAIL_CHANGE_EXPIRY,
    }
    try:
        msg = Message(
            subject="Confirm Your Email Change — Gurbani Tracker",
            recipients=[new_email],
        )
        msg.html = f"""
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;
                    background:#0f1117;color:#e8eaf6;border-radius:16px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#f97316,#db2777);padding:28px 32px;">
            <h1 style="margin:0;font-size:1.5rem;color:#fff;">ੴ Gurbani Live Tracker</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:.9rem;">Email Change Request</p>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 8px;">ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ, <strong>{user['name']}</strong> 🙏</p>
            <p style="color:#9094b8;margin:0 0 24px;font-size:.9rem;">
              Use the code below to confirm your new email address. It expires in 10 minutes.
            </p>
            <div style="background:#1a1d27;border:1px solid #2e3250;border-radius:12px;
                        padding:24px;text-align:center;">
              <span style="font-size:2.8rem;font-weight:800;letter-spacing:12px;color:#f97316;">
                {otp}
              </span>
            </div>
            <p style="color:#9094b8;font-size:.78rem;margin:20px 0 0;text-align:center;">
              If you didn't request this, please ignore this email.
            </p>
          </div>
        </div>
        """
        mail.send(msg)
        print(f"[Settings] Email change OTP sent to {new_email}")
        return jsonify({"success": True, "message": "OTP sent to your new email address."})
    except Exception as e:
        print(f"[Settings] Mail error: {e}")
        return jsonify({"success": False, "message": f"Failed to send email: {str(e)}"}), 500


@app.route("/settings/verify-email-otp", methods=["POST"])
def settings_verify_email_otp():
    user = session.get("user")
    if not user:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    data = request.get_json(silent=True) or {}
    otp = (data.get("otp") or "").strip()

    record = _email_change_store.get(user["email"])
    if not record:
        return jsonify({"success": False, "message": "No email change was requested."}), 400
    if time.time() > record["expires_at"]:
        _email_change_store.pop(user["email"], None)
        return jsonify({"success": False, "message": "OTP has expired. Please request a new one."}), 400
    if record["otp"] != otp:
        return jsonify({"success": False, "message": "Incorrect OTP. Please try again."}), 400

    old_email = user["email"]
    new_email = record["new_email"]
    _email_change_store.pop(old_email, None)
    session["user"]["email"] = new_email
    session.modified = True
    print(f"[Settings] Email changed: {old_email} → {new_email}")
    return jsonify({"success": True, "message": "Email updated successfully.", "user": session["user"]})



verses_path = resource_path(os.path.join("verses", "guru_granth_sahib.txt"))
print(f"[Loader] Loading verses from: {verses_path}")
guru_matcher = VerseMatcher(load_verses(verses_path))
print(f"[Loader] Loaded {len(guru_matcher.paragraphs)} paragraphs.")

recognizer = sr.Recognizer()
recognizer.pause_threshold = 0.5
recognizer.dynamic_energy_threshold = True
mic = sr.Microphone()

stop_listening_handle = None
is_listening = False
listener_lock = threading.Lock()

session_stats = {
    "total":           0,
    "matched":         0,
    "unmatched":       0,
    "total_sr_time":   0.0,
    "total_proc_time": 0.0,
    "session_start":   time.time(),
}


def speech_callback(recognizer_obj, audio):
    try:
        total_start = time.time()

        sr_start    = time.time()
        spoken_text = recognizer_obj.recognize_google(audio, language="pa-IN")
        sr_end      = time.time()
        sr_time     = sr_end - sr_start

        match_start = time.time()
        matches     = guru_matcher.find_next_line(spoken_text)
        match_end   = time.time()
        match_time  = match_end - match_start

        total_time  = time.time() - total_start

        print("\n=========== PERFORMANCE ===========")
        print(f"Speech Recognition Time : {sr_time:.3f} sec")
        print(f"Verse Matching Time     : {match_time:.3f} sec")
        print(f"Total Processing Time   : {total_time:.3f} sec")
        print("===================================\n")

        session_stats["total"]           += 1
        session_stats["total_sr_time"]   += sr_time
        session_stats["total_proc_time"] += total_time

        if matches:
            session_stats["matched"] += 1
            for res in matches:
                socketio.emit("match_result", {
                    "spoken":       spoken_text,
                    "matched_line": res["matched_line"],
                    "paragraph":    res["paragraph"],
                    "score":        res["score"],
                    "sr_time":      round(sr_time, 3),
                    "match_time":   round(match_time, 3),
                    "total_time":   round(total_time, 3),
                    "stats":        _stats_snapshot(),
                })
        else:
            session_stats["unmatched"] += 1
            socketio.emit("no_match", {
                "spoken":     spoken_text,
                "sr_time":    round(sr_time, 3),
                "match_time": round(match_time, 3),
                "total_time": round(total_time, 3),
                "stats":      _stats_snapshot(),
            })

    except sr.UnknownValueError:
        socketio.emit("status_update", {"message": "Could not understand audio", "type": "warn"})
    except Exception as e:
        socketio.emit("status_update", {"message": f"Error: {str(e)}", "type": "error"})


def _stats_snapshot():
    """Return a clean stats dict to send to the frontend."""
    total      = session_stats["total"]
    match_rate = round(session_stats["matched"] / total * 100, 1) if total > 0 else 0
    avg_sr     = round(session_stats["total_sr_time"]   / total, 3) if total > 0 else 0
    avg_proc   = round(session_stats["total_proc_time"] / total, 3) if total > 0 else 0
    elapsed    = round(time.time() - session_stats["session_start"])
    return {
        "total":      total,
        "matched":    session_stats["matched"],
        "unmatched":  session_stats["unmatched"],
        "match_rate": match_rate,
        "avg_sr":     avg_sr,
        "avg_proc":   avg_proc,
        "elapsed":    elapsed,
        "verse_pos":  guru_matcher.last_index,
    }


@socketio.on("get_stats")
def handle_get_stats():
    emit("stats_update", _stats_snapshot())


@socketio.on("reset_stats")
def handle_reset_stats():
    global session_stats
    session_stats = {
        "total":           0,
        "matched":         0,
        "unmatched":       0,
        "total_sr_time":   0.0,
        "total_proc_time": 0.0,
        "session_start":   time.time(),
    }
    emit("stats_update", _stats_snapshot())
    print("[Server] Stats reset.")


@socketio.on("start_listening")
def handle_start():
    global stop_listening_handle, is_listening
    with listener_lock:
        if is_listening:
            emit("status_update", {"message": "Already listening", "type": "info"})
            return
        try:
            with mic as source:
                recognizer.adjust_for_ambient_noise(source, duration=0.5)
            stop_listening_handle = recognizer.listen_in_background(mic, speech_callback)
            is_listening = True
            emit("status_update", {"message": "LIVE", "type": "live"})
            print("[Server] Listening started.")
        except Exception as e:
            emit("status_update", {"message": f"Mic error: {str(e)}", "type": "error"})


@socketio.on("stop_listening")
def handle_stop():
    global stop_listening_handle, is_listening
    with listener_lock:
        if stop_listening_handle:
            stop_listening_handle(wait_for_stop=False)
            stop_listening_handle = None
        is_listening = False
        emit("status_update", {"message": "Stopped", "type": "stopped"})
        print("[Server] Listening stopped.")


@socketio.on("reset_position")
def handle_reset():
    guru_matcher.last_index = 0
    emit("status_update", {"message": "Position reset to beginning", "type": "info"})
    print("[Server] Verse position reset.")


@app.route("/")
def index():
    return render_template("main.html")


@app.route("/legacy")
def index_legacy():
    return render_template("index.html")




if __name__ == "__main__":
    print("=" * 55)
    print("  Gurbani Live Tracker — Web Interface")
    print("  Open: http://localhost:5000/login")
    print("=" * 55)
    print("\n  ⚠  Mail Config: set MAIL_USERNAME and MAIL_PASSWORD")
    print("     env vars, or edit server.py lines 24-25.\n")
    threading.Timer(1.5, lambda: webbrowser.open("http://localhost:5000/login")).start()
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, allow_unsafe_werkzeug=True)
