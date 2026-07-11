"""PostgreSQL connection layer — Person 2.

One job: give the rest of the API a way to talk to Postgres. Three things live here:

  * engine        — the actual connection pool to the database
  * SessionLocal  — a factory that hands out short-lived "sessions" (one per request);
                    a session is your unit of work: you add rows to it, then commit.
  * Base          — the parent class every table (in db_models.py) inherits from, so
                    SQLAlchemy knows they're tables.

The DATABASE_URL is injected by docker-compose.yml
(`postgresql://ev:ev@db:5432/ev_charging`). The localhost fallback only matters if you
ever run the API outside Docker.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ev:ev@localhost:5432/ev_charging")

# pool_pre_ping: quietly check a connection is alive before using it (survives the DB
# container restarting under us). future=True opts into the modern SQLAlchemy 2.0 style.
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def init_db() -> None:
    """Create every table (if it doesn't already exist). Safe to call on every startup.

    Importing db_models here (not at the top) registers the table classes on
    Base.metadata *before* create_all runs, while avoiding a circular import.
    """
    from . import db_models  # noqa: F401  (import for side effect: registers the tables)
    Base.metadata.create_all(bind=engine)
