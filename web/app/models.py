from datetime import datetime
from .extensions import db
from sqlalchemy import CheckConstraint


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True, nullable=False)
    role_name = db.Column(db.String(50), unique=True, nullable=False)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    photo_url = db.Column(db.Text, nullable=True)
    is_white_knight = db.Column(db.Boolean, default=False, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=False)
    house_id = db.Column(db.Integer, db.ForeignKey("houses.id"), nullable=True)

    role = db.relationship("Role", backref="users")
    stats = db.relationship("Stat", 
                            backref="user", uselist=False, 
                            cascade="all, delete-orphan",
                            foreign_keys="Stat.user_id")
    nightwatch = db.Column(db.Boolean, nullable=True)

    __table_args__ = (
        CheckConstraint("length(username) >= 5 AND length(username) <= 20", name="check_username"),
    )


class House(db.Model):
    __tablename__ = "houses"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(20), unique=True, nullable=False)
    motto = db.Column(db.String(30), nullable=False)

    __table_args__ = (
        CheckConstraint("length(name) >= 5 AND length(name) <= 20", name="check_name"),
        CheckConstraint("length(motto) >= 5 AND length(motto) <= 30", name="check_motto"),
    )

class Stat(db.Model):
    __tablename__ = "stats"

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    strength = db.Column(db.Integer, default=10)
    defense = db.Column(db.Integer, default=10)
    endurance = db.Column(db.Integer, default=10)
    key = db.Column(db.String(64), nullable=True)
    next_key = db.Column(db.DateTime, nullable=True)
    gossip_target_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        CheckConstraint("strength >= 0 AND strength <= 20", name="check_strength"),
        CheckConstraint("defense >= 0 AND defense <= 20", name="check_defense"),
        CheckConstraint("endurance >= 0 AND endurance <= 20", name="check_endurance"),
    )


class Session(db.Model):
    __tablename__ = "sessions"

    id = db.Column(db.String(128), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    ip_address = db.Column(db.String(45))
    
class Requests(db.Model):
    __tablename__ = "requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    house_id = db.Column(db.Integer, db.ForeignKey("houses.id"), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

    user = db.relationship("User", backref="join_requests")
    house = db.relationship("House", backref="join_requests")