import secrets
from datetime import datetime, timedelta
from functools import wraps
from flask import Blueprint, request, jsonify, render_template, redirect, url_for, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from .extensions import db
from .models import User, Role, House, Stat, Session

web_ui = Blueprint("web_ui", __name__, url_prefix="/")

@web_ui.before_request
def require_auth():
    if request.path == "/login" or request.path.startswith("/static"):
        return None
    token = request.cookies.get("token")
    if not token:
        return redirect(url_for("web_ui.login"))
    session_obj = Session.query.filter_by(id=token).first()
    if not session_obj or session_obj.expires_at <= datetime.utcnow():
        return redirect(url_for("web_ui.login"))

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

api = Blueprint("api", __name__, url_prefix="/api")

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get("token", "")
        if not token:
            return jsonify({"error": "Missing session token"}), 401

        session_obj = Session.query.filter_by(id=token).first()
        if not session_obj or session_obj.expires_at <= datetime.utcnow():
            return jsonify({"error": "Invalid or expired session"}), 401

        current_user = User.query.get(session_obj.user_id)
        if not current_user:
            return jsonify({"error": "User not found"}), 404

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
    return jsonify([
        {
            "id": h.id,
            "name": h.name,
            "motto": h.motto,
            "lord_id": h.lord_id,
        }
        for h in houses
    ]), 200


@api.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    role_id = data.get("role_id")
    house_id = data.get("house_id")

    if not username or not password or not role_id:
        return jsonify({"error": "username, password and role_id are required"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    role = Role.query.get(role_id)
    if not role:
        return jsonify({"error": "Invalid role_id"}), 400

    if house_id and not House.query.get(house_id):
        return jsonify({"error": "Invalid house_id"}), 400

    user = User(
        username=username,
        password=generate_password_hash(password),
        role_id=role.id,
        house_id=house_id,
    )
    db.session.add(user)
    db.session.flush()

    if house_id and role.role_name.lower() == "noble":
        house = House.query.get(house_id)
        if house and not house.lord_id:
            house.lord_id = user.id

    base_stats = {
        "noble": (10, 12, 12),
        "knight": (16, 15, 14),
        "commonfolk": (12, 10, 16),
    }.get(role.role_name.lower(), (10, 10, 10))

    stat = Stat(
        user_id=user.id,
        strength=base_stats[0],
        defense=base_stats[1],
        endurance=base_stats[2],
    )
    db.session.add(stat)

    token = secrets.token_hex(32)
    new_session = Session(
        id=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=1),
        ip_address=(request.remote_addr or "")[:15],
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

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password, password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = secrets.token_hex(32)
    new_session = Session(
        id=token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=1),
        ip_address=(request.remote_addr or "")[:15],
    )
    db.session.add(new_session)
    db.session.commit()

    response = make_response(jsonify({
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role.role_name,
            "house_id": user.house_id,
        }
    }), 200)
    response.set_cookie(
        "token", token,
        httponly=True,
        path="/",
        samesite="Lax",
        max_age=86400
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
    return jsonify({
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role.role_name,
        "house_id": current_user.house_id,
        "stats": {
            "strength": current_user.stats.strength if current_user.stats else 0,
            "defense": current_user.stats.defense if current_user.stats else 0,
            "endurance": current_user.stats.endurance if current_user.stats else 0,
        }
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


@api.route("/houses/<int:house_id>", methods=["PUT", "PATCH"])
@login_required
def update_house(current_user, house_id):
    house = House.query.get(house_id)
    if not house:
        return jsonify({"error": "House not found"}), 404

    user_role = current_user.role.role_name.lower() if current_user.role else ""
    is_house_lord = user_role == "noble" or house.lord_id == current_user.id

    if current_user.house_id != house_id or not is_house_lord:
        return jsonify({"error": "Access denied. Only lords of this house can edit its info."}), 403

    data = request.get_json() or {}

    if "name" in data:
        new_name = str(data["name"]).strip()
        if not new_name:
            return jsonify({"error": "House name cannot be empty"}), 400
        if len(new_name) > 50:
            return jsonify({"error": "House name must be 50 characters or fewer"}), 400
        existing = House.query.filter(House.name == new_name, House.id != house_id).first()
        if existing:
            return jsonify({"error": "A house with this name already exists"}), 409
        house.name = new_name

    if "motto" in data:
        new_motto = str(data["motto"]).strip()
        if len(new_motto) > 100:
            return jsonify({"error": "Motto must be 100 characters or fewer"}), 400
        house.motto = new_motto if new_motto else None

    db.session.commit()

    return jsonify({
        "message": "House info updated successfully",
        "house": {
            "id": house.id,
            "name": house.name,
            "motto": house.motto,
            "lord_id": house.lord_id,
        }
    }), 200
