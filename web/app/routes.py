import os
import base64
import secrets
import random
import hmac
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import Blueprint, request, jsonify, render_template, redirect, url_for, make_response, current_app, session
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from .extensions import db
from .models import User, Role, House, Stat, Session, Requests, Tournament, Participant

web_ui = Blueprint("web_ui", __name__, url_prefix="/")
photo_path = "./app/static/pictures/"  #path for uploaded photos

@web_ui.before_request
def require_auth():
    if request.path in ("/login", "/lord-setup", "/knight-setup") or request.path.startswith("/static"):
        return None
    if is_banished_ip():
        if request.path != "/nightwatch":
            return redirect(url_for("web_ui.nightwatch"))
        return None
    if request.path == "/login":
        return None
    
    token = request.cookies.get("token")
    if not token:
        return redirect(url_for("web_ui.login"))
    if compare_ip():
        resp = redirect(url_for("web_ui.login"))
        resp.delete_cookie("token", path="/")
        return resp
            
    check_expired_requests()
    
    session_obj = Session.query.filter_by(id=token).first()   
    
    if not session_obj or session_obj.expires_at <= datetime.utcnow():
        return redirect(url_for("web_ui.login"))
    else:
        current_user = User.query.get(session_obj.user_id)
        if current_user and current_user.nightwatch:
            if request.path != "/nightwatch":
                return redirect(url_for("web_ui.nightwatch"))
            return None

@web_ui.route("/")
@web_ui.route("/houses")
def index():
    return render_template("index.html")

@web_ui.route("/knights")
def knights():
    return render_template("knights.html")

@web_ui.route("/lords")
def lords():
    return render_template("lords.html")

@web_ui.route("/login")
def login():
    return render_template("login.html")

@web_ui.route("/profile")
def profile():
    return render_template("profile.html")

@web_ui.route("/house")
def house():
    return render_template("house.html")

@web_ui.route("/nightwatch")
def nightwatch():
    return render_template("nightwatch.html")
  
@web_ui.route("/lord-setup")
def lord_setup():
    return render_template("lord_setup.html")

@web_ui.route("/knight-setup")
def knight_setup():
    return render_template("knight_setup.html")

@web_ui.route("/tournaments")
def tournaments():
    return render_template("tournaments.html")

@web_ui.route("/tournaments/<int:tournament_id>")
def tournament_detail(tournament_id):
    return render_template("tournament_detail.html", tournament_id=tournament_id)

@web_ui.app_errorhandler(404)
def handle_404(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Resource not found"}), 404
    return render_template("404.html"), 404

api = Blueprint("api", __name__, url_prefix="/api")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get("token", "")
        if not token:
            return jsonify({"error": "Missing session token"}), 401

        if compare_ip():
            resp = jsonify({"error": "Session invalidated: IP changed"}), 401
            resp = make_response(resp)
            resp.delete_cookie("token", path="/")
            return resp

        session_obj = Session.query.filter_by(id=token).first()
        if not session_obj or session_obj.expires_at <= datetime.utcnow():
            return jsonify({"error": "Invalid or expired session"}), 401

        current_user = User.query.get(session_obj.user_id)
        if not current_user:
            return jsonify({"error": "User not found"}), 404
        
        if current_user.nightwatch or is_banished_ip():
            return jsonify({"error": "Banished"}), 403

        return f(current_user, *args, **kwargs)
    return decorated


@api.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "service": "the-great-books-web"}), 200


@api.route("/roles", methods=["GET"])
def get_roles():
    roles = Role.query.all()
    return jsonify([{"id": r.id, "role_name": r.role_name} for r in roles]), 200


@api.route("/houses", methods=["GET"])
def get_houses():
    houses = House.query.all()
    result = []
    for h in houses:
        result.append({
            "id": h.id,
            "name": h.name,
            "motto": h.motto,
        })
    return jsonify(result), 200


@api.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    role_id = data.get("role_id")

    if not username or not password or not role_id:
        return jsonify({"error": "username, password and role_id are required"}), 400

    if len(username) < 5 or len(username) > 20:
        return jsonify({"error": "Username must be between 5 and 20 characters"}), 400

    if len(password) < 8 or len(password) > 20:
        return jsonify({"error": "Password must be between 8 and 20 characters"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    role = Role.query.get(role_id)
    if not role:
        return jsonify({"error": "Invalid role_id"}), 400

    user = User(
        username=username,
        password=generate_password_hash(password),
        role_id=role.id,
        house_id=None,
        is_white_knight=False,
    )
    db.session.add(user)
    db.session.flush()

    if role.role_name.lower() == "knight":
        stat = Stat(user_id=user.id, strength=10, defense=10, endurance=10)
        db.session.add(stat)

    token = secrets.token_hex(32)
    ip_now = get_client_ip()
    
    new_session = Session(
        id=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=1),
        ip_address=ip_now,
    )
    db.session.add(new_session)
    db.session.commit()

    response = make_response(jsonify({
        "message": "Registered successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": role.role_name,
            "house_id": user.house_id,
        }
    }), 201)
    response.set_cookie(
        "token", token,
        httponly=True,
        path="/",
        samesite="Lax",
        max_age=86400
    )
    return response


@api.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    remember_me = data.get("remember_me", False)

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({"error": "Invalid credentials"}), 401
    
    check_expired_requests()

    token = secrets.token_hex(32)
    ip_now = get_client_ip()
        
    new_session = Session(
        id=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=28 if remember_me else 1),
        ip_address=ip_now,
        remember_me=remember_me,
    )
    db.session.add(new_session)
    db.session.commit()

    payload = {
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role.role_name,
            "house_id": user.house_id,
        }
    }

    if user.nightwatch:
        payload["redirect_url"] = url_for("web_ui.nightwatch")

    response = make_response(jsonify(payload), 200)
    response.set_cookie(
        "token", token,
        httponly=True,
        path="/",
        samesite="Lax",
        max_age=2592000 if remember_me else 86400
    )

    return response


@api.route("/auth/logout", methods=["POST"])
@login_required
def logout(current_user):
    token = request.cookies.get("token", "")
    session = Session.query.filter_by(id=token).first()
    if session:
        session.expires_at = datetime.utcnow()
        db.session.commit()
    response = make_response(jsonify({"message": "Logged out"}), 200)
    response.set_cookie("token", "", max_age=0, path="/", httponly=True, samesite="Lax")
    return response


@api.route("/me", methods=["GET"])
@login_required
def get_me(current_user):
    check_expired_requests()
    role_name = current_user.role.role_name.lower() if current_user.role else ""
    is_knight = role_name == "knight"
    active_req = Requests.query.filter_by(user_id=current_user.id).first()
    
    return jsonify({
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role.role_name,
        "house_id": current_user.house_id,
        "pending_request_house_id": active_req.house_id if active_req else None,
        "photo_url": current_user.photo_url,
        "is_white_knight": current_user.is_white_knight,
        "stats": {
            "strength": current_user.stats.strength if current_user.stats else 0,
            "defense": current_user.stats.defense if current_user.stats else 0,
            "endurance": current_user.stats.endurance if current_user.stats else 0,
        },
        "gossip_key": current_user.stats.key if (is_knight and current_user.stats) else None,
        "next_key": current_user.stats.next_key.isoformat() if (is_knight and current_user.stats and current_user.stats.next_key) else None,
        "gossip_target_id": current_user.stats.gossip_target_id if (is_knight and current_user.stats) else None,
    }), 200


@api.route("/me", methods=["PUT", "PATCH"])
@login_required
def update_me(current_user):
    is_multipart = request.content_type and "multipart/form-data" in request.content_type
    data = request.form if is_multipart else (request.get_json() or {})

    if "username" in data:
        new_username = str(data["username"]).strip()
        if not new_username:
            return jsonify({"error": "Username cannot be empty"}), 400
        if len(new_username) < 5 or len(new_username) > 20:
            return jsonify({"error": "Username must be between 5 and 20 characters long"}), 400
        existing = User.query.filter(User.username == new_username, User.id != current_user.id).first()
        if existing:
            return jsonify({"error": "Username already taken"}), 409
        current_user.username = new_username

    if "house_id" in data:
        if not current_user.role or current_user.role.role_name.lower() != "noble":
            return jsonify({"error": "Only Nobles can choose or change their Sworn House"}), 403

        raw_house = data.get("house_id")
        if raw_house is None or str(raw_house).strip() == "":
            current_user.house_id = None
        else:
            try:
                house_id_int = int(raw_house)
            except (ValueError, TypeError):
                return jsonify({"error": "Invalid house_id"}), 400
            house = House.query.get(house_id_int)
            if not house:
                return jsonify({"error": "Invalid house_id"}), 400
            current_user.house_id = house.id
            current_user.is_white_knight = False


    photo_file = request.files.get("photo") if is_multipart else None
    if photo_file and photo_file.filename:
        allowed_exts = {"png", "jpg", "jpeg", "webp"}
        ext = photo_file.filename.rsplit(".", 1)[-1].lower() if "." in photo_file.filename else ""
        if ext not in allowed_exts:
            return jsonify({"error": "Invalid format. Please choose PNG, JPG, or WEBP."}), 400

        photo_file.seek(0, os.SEEK_END)
        file_size = photo_file.tell()
        photo_file.seek(0)
        if file_size > 5 * 1024 * 1024:
            return jsonify({"error": "Image is too large. Maximum size is 5 MB."}), 400

        encoded_url = save_uploaded_photo(photo_file, current_user.id, current_user.username)
        if not encoded_url:
            return jsonify({"error": "Failed to process uploaded image."}), 400
        current_user.photo_url = encoded_url
    elif str(data.get("remove_photo", "")).lower() in ("1", "true"):
        current_user.photo_url = None

    if data.get("new_password"):
        current_password = data.get("current_password", "")
        new_password = str(data["new_password"])
        if not current_password or not check_password_hash(current_user.password, current_password):
            return jsonify({"error": "Current password is incorrect"}), 400
        if len(new_password) < 8 or len(new_password) > 20:
            return jsonify({"error": "New password must be between 8 and 20 characters long"}), 400
        current_user.password = generate_password_hash(new_password)

    db.session.commit()

    return jsonify({
        "message": "Profile updated successfully",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "role": current_user.role.role_name,
            "house_id": current_user.house_id,
            "photo_url": current_user.photo_url,
            "is_white_knight": current_user.is_white_knight,
        }
    }), 200


@api.route("/me/gossip-key", methods=["POST"])
@login_required
def update_gossip_key(current_user):
    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name != "knight":
        return jsonify({"error": "Only knights can generate a gossip key."}), 403
    
    stat = current_user.stats
    if not stat:
        stat = Stat(user_id=current_user.id)
        db.session.add(stat)
    
    now = datetime.utcnow()
    if stat.next_key and now < stat.next_key:
        remaining = stat.next_key - now
        hours, remainder = divmod(int(remaining.total_seconds()), 3600)
        minutes = remainder // 60
        return jsonify({
            "error": f"Key cannot be updated yet. Try again in {hours}h {minutes}m.",
            "next_key": stat.next_key.isoformat()
        }), 429
    
    stat.key = secrets.token_hex(8)
    stat.next_key = now + timedelta(days=1)
    stat.gossip_target_id = None
    db.session.commit()
    
    return jsonify({
        "message": "Gossip key updated",
        "gossip_key": stat.key,
        "next_key": stat.next_key.isoformat()
    }), 200


@api.route("/houses/<int:house_id>/members", methods=["GET"])
@login_required
def get_house_members(current_user, house_id):
    if current_user.house_id != house_id:
        return jsonify({"error": "Access denied. You can only view members of your own house."}), 403

    members = User.query.filter_by(house_id=house_id).all()
    result = []
    for m in members:
        result.append({
            "id": m.id,
            "username": m.username,
            "role": m.role.role_name,
            "stats": {
                "strength": m.stats.strength if m.stats else 0,
                "defense": m.stats.defense if m.stats else 0,
                "endurance": m.stats.endurance if m.stats else 0,
            }
        })
    return jsonify(result), 200


@api.route("/houses/<int:house_id>", methods=["GET"])
@login_required
def get_house(current_user, house_id):
    house = House.query.get(house_id)
    if not house:
        return jsonify({"error": "House not found"}), 404
    return jsonify({
        "id": house.id,
        "name": house.name,
        "motto": house.motto,
    }), 200


@api.route("/house", methods=["GET"])
@login_required
def get_my_house(current_user):
    if not current_user.house_id:
        return jsonify({"error": "You are not sworn to any house"}), 404
    house = House.query.get(current_user.house_id)
    if not house:
        return jsonify({"error": "House not found"}), 404
    return jsonify({
        "id": house.id,
        "name": house.name,
        "motto": house.motto,
    }), 200


@api.route("/house/leave", methods=["POST"])
@login_required
def leave_house(current_user):
    if not current_user.house_id:
        return jsonify({"error": "You are not sworn to any house"}), 400

    current_user.house_id = None
    current_user.is_white_knight = False
    db.session.commit()

    return jsonify({
        "message": "You have renounced your allegiance and left the house successfully.",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "house_id": None
        }
    }), 200


@api.route("/houses/<int:house_id>", methods=["PUT", "PATCH"])
@login_required
def update_house(current_user, house_id):
    house = House.query.get(house_id)
    if not house:
        return jsonify({"error": "House not found"}), 404

    user_role = current_user.role.role_name.lower() if current_user.role else ""
    is_house_lord = user_role == "noble"

    if current_user.house_id != house_id or not is_house_lord:
        return jsonify({"error": "Access denied. Only lords of this house can edit its info."}), 403

    data = request.get_json() or {}

    if "name" in data:
        new_name = str(data["name"]).strip()
        if not new_name:
            return jsonify({"error": "House name cannot be empty"}), 400
        if len(new_name) < 5 or len(new_name) > 20:
            return jsonify({"error": "House name must be between 5 and 20 characters"}), 400
        existing = House.query.filter(House.name == new_name, House.id != house_id).first()
        if existing:
            return jsonify({"error": "A house with this name already exists"}), 409
        house.name = new_name

    if "motto" in data:
        new_motto = str(data["motto"]).strip()
        if not new_motto:
            return jsonify({"error": "House motto cannot be empty"}), 400
        if len(new_motto) < 5 or len(new_motto) > 30:
            return jsonify({"error": "Motto must be between 5 and 30 characters"}), 400
        house.motto = new_motto

    db.session.commit()

    return jsonify({
        "message": "House info updated successfully",
        "house": {
            "id": house.id,
            "name": house.name,
            "motto": house.motto,
        }
    }), 200


@api.route("/knights", methods=["GET"])
@login_required
def get_knights(current_user):
    knight_role = Role.query.filter(db.func.lower(Role.role_name) == "knight").first()
    if not knight_role:
        return jsonify([]), 200
    
    knights = User.query.filter(
        User.role_id == knight_role.id,
        User.nightwatch.isnot(True)
    ).all()
    viewer_role = current_user.role.role_name.lower() if current_user.role.role_name else ""
    revealed_target_id = current_user.stats.gossip_target_id if (current_user.stats and current_user.stats.gossip_target_id) else ""
    
    result = []
    for k in knights:
        is_same_house = (current_user.house_id is not None and current_user.house_id == k.house_id)
        is_revealed = (viewer_role == "knight" and revealed_target_id == k.id)
        can_see_stats = k.is_white_knight or (k.id == current_user.id) or is_revealed or is_same_house
        
        result.append({
            "id": k.id,
            "username": k.username,
            "role": k.role.role_name,
            "house_id": k.house_id,
            "photo_url": k.photo_url,
            "is_white_knight": k.is_white_knight,
            "stats": {
                "strength": k.stats.strength,
                "defense": k.stats.defense,
                "endurance": k.stats.endurance,
            } if (can_see_stats and k.stats) else None
        })
        
    return jsonify(result), 200


@api.route("/lords", methods=["GET"])
@login_required
def get_lords(current_user):
    noble_role = Role.query.filter(db.func.lower(Role.role_name) == "noble").first()
    if not noble_role:
        return jsonify([]), 200

    lords = User.query.filter(
        User.role_id == noble_role.id,
        User.nightwatch.isnot(True)
    ).all()
    return jsonify([
        {
            "id": l.id,
            "username": l.username,
            "role": l.role.role_name,
            "house_id": l.house_id,
            "photo_url": l.photo_url,
            "stats": None
        }
        for l in lords
    ]), 200


@api.route("/gossip", methods=["POST"])
@login_required
def use_gossip(current_user):
    viewer_role = current_user.role.role_name.lower() if current_user.role else ""
    if viewer_role != "knight":
        return jsonify({"error": "Only knights can use gossip."}), 403

    data = request.get_json() or {}
    provided_key = str(data.get("key", "")).strip()
    target_id = data.get("target_id")

    if not provided_key or not target_id:
        return jsonify({"error": "Both gossip key and target_id are required."}), 400

    stat = current_user.stats
    if not stat or not stat.key:
        return jsonify({"error": "You do not have an active gossip key. Generate one in your Profile first."}), 400

    if stat.next_key and datetime.utcnow() >= stat.next_key:
        return jsonify({"error": "Your gossip key has expired. Update it in your Profile."}), 400

    if not secrets.compare_digest(stat.key, provided_key):
        return jsonify({"error": "Invalid gossip key."}), 403

    if stat.gossip_target_id is not None:
        return jsonify({"error": "You have already used your gossip key for today."}), 429

    target = User.query.get(target_id)
    if not target or not target.role or target.role.role_name.lower() != "knight":
        return jsonify({"error": "Target knight not found."}), 404

    if current_user.house_id is not None and target.house_id == current_user.house_id:
        return jsonify({"error": "You already know the stats of knights from your own house."}), 400

    stat.gossip_target_id = target.id
    db.session.commit()

    return jsonify({
        "message": f"Combat stats revealed for {target.username}.",
        "target_id": target.id,
        "stats": {
            "strength": target.stats.strength if target.stats else 0,
            "defense": target.stats.defense if target.stats else 0,
            "endurance": target.stats.endurance if target.stats else 0,
        }
    }), 200 
    
def hash_ip(ip: str) -> str:
    if not ip:
        return ""

    secret = current_app.config.get("IP_SECRET") or current_app.config.get("SECRET_KEY")
    return hmac.new(secret.encode("utf-8"), ip.encode("utf-8"), hashlib.sha256).hexdigest()

def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.remote_addr or ""
    return hash_ip(ip)


@api.route("/nightwatch/<int:target_id>", methods=["POST"])
@login_required
def ban_with_nightwatch(current_user, target_id):
    target = User.query.get(target_id)
    if not target:
        return jsonify({
            "error": "Can't find offender"
        }), 404

    if target.id == current_user.id:
        return jsonify({
            "error": "Can't ban yourself"
        }), 400

    if not target.role or not current_user.role:
        return jsonify({
            "error": "Can't detect your highness"
        }), 400

    if current_user.role.role_name.lower() != "noble":
        return jsonify({
            "error": "Only lords can send someone to the Night's Watch"
        }), 403

    target_role = target.role.role_name.lower()

    if target_role in ("noble", "knight"):
        if current_user.house_id and target.house_id and current_user.house_id == target.house_id:
            target.nightwatch = True
            target.house_id = None
            db.session.commit()
            return jsonify({
                "message": f"{target_role.capitalize()} was banned"
            }), 200
        else:
            return jsonify({
                "error": f"Can't ban {target_role} from another house"
            }), 403
    else:
        target.nightwatch = True
        db.session.commit()
        return jsonify({
            "message": "Commonfolk was banned"
        }), 200


@api.route("/houses/<int:house_id>/kick/<int:target_id>", methods=["POST"])
@login_required
def kick_from_house(current_user, house_id, target_id):
    if not current_user.role or current_user.role.role_name.lower() != "noble":
        return jsonify({"error": "Only lords can kick members from a house"}), 403

    if current_user.house_id != house_id:
        return jsonify({"error": "Access denied. You can only manage your own house"}), 403

    if current_user.id == target_id:
        return jsonify({"error": "You cannot kick yourself from your own house"}), 400

    target = User.query.get(target_id)
    if not target or target.house_id != house_id:
        return jsonify({"error": "Member not found in this house"}), 404

    target.house_id = None
    target.is_white_knight = False
    db.session.commit()

    return jsonify({
        "message": f"{target.username} was cast out of House."
    }), 200
        
        
def is_banished_ip():    
    ip_now = get_client_ip()
    
    if ip_now:
        found_user = (
            User.query
            .join(Session, User.id == Session.user_id)
            .filter(Session.ip_address == ip_now, User.nightwatch.is_(True))
            .first()
        )
        if found_user:
            return True
            
    return False

def compare_ip():
    ip_now = get_client_ip()
    token = request.cookies.get("token")
    if not ip_now or not token:
        return False

    session_obj = Session.query.filter_by(id=token).first()
    if session_obj and session_obj.remember_me:
        return False
    if session_obj and session_obj.ip_address and session_obj.ip_address != ip_now:
        session_obj.expires_at = datetime.utcnow()
        db.session.commit()
        return True

    return False

def save_uploaded_photo(photo, user_id, user_name):
    if not photo or not photo.filename:
        return None
    ext = photo.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp"):
        return None

    photo_name = f"{user_name}-{random.randint(0, 100)}.jpg"
    with open(f"{photo_path}/{photo_name}", "wb") as f:
        f.write(photo.read())

    return photo_name


@api.route("/lords/setup", methods=["POST"])
@login_required
def setup_lord(current_user):
    if current_user.role.role_name.lower() != "noble":
        return jsonify({"error": "Only lords can access this"}), 403

    house_raw = (request.form.get("house_id") or "").strip()
    photo = request.files.get("photo")

    if not house_raw:
        return jsonify({"error": "House is required"}), 400

    house = House.query.get(int(house_raw))
    if not house:
        return jsonify({"error": "House not found"}), 404

    photo_url = save_uploaded_photo(photo, current_user.id, current_user.username)
    if not photo_url:
        return jsonify({"error": "Valid photo (png, jpg, webp) is required"}), 400

    current_user.photo_url = photo_url
    current_user.house_id = house.id

    db.session.commit()
    return jsonify({"message": "Lord profile saved"}), 200


@api.route("/knights/setup", methods=["POST"])
@login_required
def setup_knight(current_user):
    if current_user.role.role_name.lower() != "knight":
        return jsonify({"error": "Only knights can access this"}), 403

    is_white_knight = request.form.get("is_white_knight") == "true"
    photo = request.files.get("photo")

    try:
        strength = int(request.form.get("strength", 10))
        defense = int(request.form.get("defense", 10))
        endurance = int(request.form.get("endurance", 10))
    except ValueError:
        return jsonify({"error": "Stats must be numbers"}), 400

    for stat_val, stat_name in [(strength, "Strength"), (defense, "Defense"), (endurance, "Endurance")]:
        if not (0 <= stat_val <= 20):
            return jsonify({"error": f"{stat_name} must be between 0 and 20"}), 400

    photo_url = save_uploaded_photo(photo, current_user.id, current_user.username)
    if not photo_url:
        return jsonify({"error": "Valid photo (png, jpg, webp) is required"}), 400

    current_user.photo_url = photo_url
    current_user.is_white_knight = is_white_knight
    current_user.house_id = None

    if not current_user.stats:
        current_user.stats = Stat(user_id=current_user.id)

    current_user.stats.strength = strength
    current_user.stats.defense = defense
    current_user.stats.endurance = endurance

    db.session.commit()
    return jsonify({"message": "Knight profile saved"}), 200


def check_expired_requests():
    expired = Requests.query.filter(Requests.expires_at <= datetime.utcnow()).all()
    if not expired:
        return
    for req in expired:
        user = User.query.get(req.user_id)
        if user and user.role and user.role.role_name.lower() == "knight":
            user.nightwatch = True
            user.house_id = None
        db.session.delete(req)
    db.session.commit()


@api.route("/houses/<int:house_id>/request", methods=["POST"])
@login_required
def create_join_request(current_user, house_id):
    check_expired_requests()

    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name == "commonfolk":
        return jsonify({"error": "Commonfolk cannot send join requests"}), 403

    if current_user.house_id is not None:
        return jsonify({"error": "You are already sworn to a house"}), 400

    if current_user.is_white_knight:
        return jsonify({"error": "White Knights cannot join a Great House"}), 400

    house = House.query.get(house_id)
    if not house:
        return jsonify({"error": "House not found"}), 404

    existing = Requests.query.filter_by(user_id=current_user.id).first()
    if existing:
        return jsonify({"error": "You already have an active join request"}), 409

    new_req = Requests(
        user_id=current_user.id,
        house_id=house_id,
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db.session.add(new_req)
    db.session.commit()

    return jsonify({"message": f"Join request sent to House {house.name}"}), 201


@api.route("/houses/<int:house_id>/requests", methods=["GET"])
@login_required
def get_house_requests(current_user, house_id):
    check_expired_requests()

    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if current_user.house_id != house_id or role_name != "noble":
        return jsonify({"error": "Access denied"}), 403

    reqs = Requests.query.filter_by(house_id=house_id).all()
    result = []
    for r in reqs:
        result.append({
            "id": r.id,
            "user_id": r.user.id,
            "username": r.user.username,
            "role": r.user.role.role_name if r.user.role else "",
            "photo_url": r.user.photo_url,
            "expires_at": r.expires_at.isoformat(),
            "stats": {
                "strength": r.user.stats.strength,
                "defense": r.user.stats.defense,
                "endurance": r.user.stats.endurance,
            } if r.user.stats else None,
        })
    return jsonify(result), 200


@api.route("/requests/<int:req_id>/accept", methods=["POST"])
@login_required
def accept_join_request(current_user, req_id):
    check_expired_requests()

    req = Requests.query.get(req_id)
    if not req:
        return jsonify({"error": "Request not found or expired"}), 404

    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name != "noble" or current_user.house_id != req.house_id:
        return jsonify({"error": "Access denied"}), 403

    req.user.house_id = req.house_id
    req.user.is_white_knight = False
    db.session.delete(req)
    db.session.commit()

    return jsonify({"message": f"{req.user.username} accepted into the house"}), 200


@api.route("/requests/<int:req_id>/reject", methods=["POST"])
@login_required
def reject_join_request(current_user, req_id):
    req = Requests.query.get(req_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404

    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name != "noble" or current_user.house_id != req.house_id:
        return jsonify({"error": "Access denied"}), 403

    username = req.user.username
    db.session.delete(req)
    db.session.commit()

    return jsonify({"message": f"Request from {username} rejected"}), 200


@api.route("/requests/<int:req_id>/imposter", methods=["POST"])
@login_required
def mark_request_imposter(current_user, req_id):
    req = Requests.query.get(req_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404

    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name != "noble" or current_user.house_id != req.house_id:
        return jsonify({"error": "Access denied"}), 403

    username = req.user.username
    req.user.nightwatch = True
    req.user.house_id = None
    db.session.delete(req)
    db.session.commit()

    return jsonify({"message": f"{username} marked as imposter and banished to the Night's Watch"}), 200


@api.route("/tournaments", methods=["GET"])
@login_required
def get_tournaments(current_user):
    now = datetime.utcnow()
    tournaments = (Tournament.query.filter(Tournament.end_date > now).order_by(Tournament.start_date.asc()).all())
    result = []
    for t in tournaments:
        lord_house_name = t.lord.house.name if (t.lord and t.lord.house) else None
        result.append(
        {
            "id": t.id,
            "tournament_date": t.tournament_date,
            "max_participants": t.max_participants,
            "start_date": t.start_date.isoformat(),
            "end_date": t.end_date.isoformat(),
            "participants_count": len(t.participants),
            "is_started": now >= t.start_date,
            "lord": {
                "id": t.lord.id if t.lord else None,
                "username": t.lord.username if t.lord else "Unknown",
                "house_name": lord_house_name,
            },
        })
    
    return jsonify(result), 200


@api.route("/tournaments", methods=["POST"])
@login_required
def create_tournament(current_user):
    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name != "noble":
        return jsonify({"error": "Only lords can create tournaments"}), 403

    data = request.get_json() or {}
    tournament_date = str(data.get("tournament_date", "")).strip()
    max_participants_raw = data.get("max_participants")
    start_date_raw = str(data.get("start_date", "")).strip()
    end_date_raw = str(data.get("end_date", "")).strip()

    if not tournament_date or max_participants_raw is None or not start_date_raw or not end_date_raw:
        return jsonify({"error": "All fields are required"}), 400

    if len(tournament_date) > 30:
        return jsonify({"error": "Tournament date/title must be 30 characters or fewer"}), 400

    try:
        max_participants = int(max_participants_raw)
    except (ValueError, TypeError):
        return jsonify({"error": "max_participants must be a number"}), 400

    if max_participants <= 0:
        return jsonify({"error": "max_participants must be greater than 0"}), 400

    try:
        start_date = datetime.fromisoformat(start_date_raw.replace("Z", ""))
        end_date = datetime.fromisoformat(end_date_raw.replace("Z", ""))
    except ValueError:
        return jsonify({"error": "Invalid date format"}), 400

    now = datetime.utcnow()
    if start_date >= end_date:
        return jsonify({"error": "Start date must be before end date"}), 400

    if end_date <= now:
        return jsonify({"error": "End date must be in the future"}), 400

    tournament = Tournament(
        lord_id=current_user.id,
        tournament_date=tournament_date,
        max_participants=max_participants,
        start_date=start_date,
        end_date=end_date,
    )
    db.session.add(tournament)
    db.session.commit()

    return jsonify({
        "message": "Tournament created successfully",
        "tournament": {
            "id": tournament.id,
            "tournament_date": tournament.tournament_date,
            "max_participants": tournament.max_participants,
            "start_date": tournament.start_date.isoformat(),
            "end_date": tournament.end_date.isoformat(),
        }
    }), 201


@api.route("/tournaments/<int:tournament_id>", methods=["GET"])
@login_required
def get_tournament_detail(current_user, tournament_id):
    t = Tournament.query.get(tournament_id)
    if not t:
        return jsonify({"error": "Tournament not found"}), 404

    now = datetime.utcnow()
    if now >= t.end_date:
        return jsonify({"error": "Tournament has already ended"}), 404

    participants_list = []
    for p in t.participants:
        knight = p.knight
        if not knight:
            continue
        participants_list.append({
            "id": knight.id,
            "username": knight.username,
            "photo_url": knight.photo_url,
            "house_name": knight.house.name if knight.house else None,
            "is_white_knight": knight.is_white_knight,
            "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        })

    is_joined = any(p.knight_id == current_user.id for p in t.participants)

    return jsonify({
        "id": t.id,
        "tournament_date": t.tournament_date,
        "max_participants": t.max_participants,
        "start_date": t.start_date.isoformat(),
        "end_date": t.end_date.isoformat(),
        "is_started": now >= t.start_date,
        "is_joined": is_joined,
        "participants_count": len(participants_list),
        "lord": {
            "id": t.lord.id if t.lord else None,
            "username": t.lord.username if t.lord else "Unknown",
            "house_name": t.lord.house.name if (t.lord and t.lord.house) else None,
        },
        "participants": participants_list,
    }), 200


@api.route("/tournaments/<int:tournament_id>/join", methods=["POST"])
@login_required
def join_tournament(current_user, tournament_id):
    role_name = current_user.role.role_name.lower() if current_user.role else ""
    if role_name != "knight":
        return jsonify({"error": "Only knights can join tournaments"}), 403

    t = Tournament.query.get(tournament_id)
    if not t:
        return jsonify({"error": "Tournament not found"}), 404

    now = datetime.utcnow()
    if now >= t.start_date:
        return jsonify({"error": "Registration for this tournament is closed"}), 400

    if len(t.participants) >= t.max_participants:
        return jsonify({"error": "Tournament is already full"}), 400

    existing = Participant.query.filter_by(
        tournament_id=t.id,
        knight_id=current_user.id
    ).first()
    if existing:
        return jsonify({"error": "You have already joined this tournament"}), 409

    participant = Participant(
        tournament_id=t.id,
        knight_id=current_user.id,
    )
    db.session.add(participant)
    db.session.commit()

    return jsonify({"message": "Successfully joined the tournament"}), 201