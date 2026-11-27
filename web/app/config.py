import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    IP_SECRET = os.getenv("IP_SECRET")
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is not set in environment or .env file")
    if not IP_SECRET:
        raise RuntimeError("IP_SECRET is not set in environment or .env file")

    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URI") or (
        f"postgresql+psycopg2://{os.getenv('DB_USER')}:{os.getenv('DB_PASS')}"
        f"@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
