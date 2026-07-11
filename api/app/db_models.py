"""The database tables — Person 2.

The persistence chain you saw in the design:

    ChargeRequest  ->  AssignmentRecord  ->  BillingRecord
    "a car asked"      "we decided"           "we billed it"

Each class is one table. Each attribute is one column. `ForeignKey` is the arrow that
links a row back to the row it came from (an assignment knows its request; a bill knows
its assignment), so a charge can always be traced back to the original demand.

Class names are deliberately *Record-suffixed* so they don't clash with the Pydantic
`Assignment` in models.py — that one is the API's wire shape, these are the DB rows.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ChargeRequest(Base):
    """One 'I need to charge' event — the demand record (the system's input history)."""
    __tablename__ = "charge_requests"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(String, nullable=False, index=True)
    target_battery_percent = Column(Float, nullable=False, default=100.0)
    status = Column(String, nullable=False, default="pending")   # pending -> assigned
    source = Column(String, nullable=False, default="batch")     # batch (/optimize) | live (/requests)
    requested_at = Column(DateTime(timezone=True), default=_utcnow)


class AssignmentRecord(Base):
    """One engine decision — where/when a car was sent, and the estimated cost."""
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("charge_requests.id"), nullable=True)
    vehicle_id = Column(String, nullable=False, index=True)
    station_id = Column(String, nullable=False)
    time_slot = Column(Integer, nullable=False)
    est_cost = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class BillingRecord(Base):
    """One charge to a driver — money owed. Kept forever (it's a financial record)."""
    __tablename__ = "billing"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    vehicle_id = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
