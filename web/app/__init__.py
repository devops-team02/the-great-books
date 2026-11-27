from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .extensions import cors, db, migrate
from .models import House, Role
from .routes import api, web_ui


def create_app():
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=2, x_proto=1, x_host=1)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app)
    app.register_blueprint(api)
    app.register_blueprint(web_ui)

    @app.cli.command("seed-db")
    def seed_db():
        _seed_initial_data()
        print("Database seeded successfully.")

    return app


def _seed_initial_data():
    if Role.query.count() == 0:
        for name in ["noble", "knight", "commonfolk"]:
            db.session.add(Role(role_name=name))
        db.session.commit()

    if House.query.count() == 0:
        houses_data = [
            ("Stark", "Winter is Coming"),
            ("Lannister", "Hear Me Roar!"),
            ("Targaryen", "Fire and Blood"),
            ("Baratheon", "Ours is the Fury"),
        ]
        for house_name, house_motto in houses_data:
            db.session.add(House(name=house_name, motto=house_motto))
        db.session.commit()
