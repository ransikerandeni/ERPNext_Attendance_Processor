import frappe
from frappe.utils import getdate, nowdate, add_days, get_first_day, now_datetime, get_time

from attendance_processor.utils.processor import (
    get_attendance_records,
    get_missed_requests_lookup,
    get_leave_applications_lookup,
    get_short_leave_lookup,
    get_two_late_lookup,
    analyse_employee,
)
from attendance_processor.utils.email_report import (
    send_summary_email,
)
from attendance_processor.utils.approver_report import (
    fetch_approver_data,
    send_approver_summary_email,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_employee_active(att_records):
    """
    Return True if at least one attendance record shows the employee as
    Present or Half Day.  Employees with only Absent records are skipped
    (they may have left the organisation).
    """
    for rec in att_records:
        if rec.status in ("Present", "Half Day"):
            return True
        if rec.custom_ucsc_status in ("Present", "Half Day"):
            return True
    return False


def _run_for_period(from_date, to_date, period_label):
    """
    Core routine: load data, analyse every active employee for the given
    period, send personalised email summaries, and commit once at the end.

    Args:
        from_date:    date — period start (inclusive)
        to_date:      date — period end   (inclusive)
        period_label: str  — human-readable label used in email subject/header
    """
    logger = frappe.logger("attendance_processor")
    logger.info(
        f"Attendance summary job started | period: {period_label} "
        f"({from_date} to {to_date})"
    )

    # 1. Load all lookup tables with one DB query each
    missed_lookup      = get_missed_requests_lookup(from_date, to_date)
    leave_lookup       = get_leave_applications_lookup(from_date, to_date)
    short_leave_lookup = get_short_leave_lookup(from_date, to_date)
    two_late_lookup    = get_two_late_lookup(from_date, to_date)

    # 2. Fetch all attendance records for the period in one query
    all_records = get_attendance_records(from_date, to_date)

    # 3. Group records by employee
    emp_data = {}
    for rec in all_records:
        if rec.employee not in emp_data:
            emp_data[rec.employee] = {
                "name":    rec.employee_name,
                "records": [],
            }
        emp_data[rec.employee]["records"].append(rec)

    processed = 0
    skipped   = 0

    # 4. Process each employee
    for employee_id, data in emp_data.items():
        # Skip employees who show no active attendance in the period
        if not _is_employee_active(data["records"]):
            skipped += 1
            continue

        try:
            issues = analyse_employee(
                employee_id,
                data["records"],
                missed_lookup,
                leave_lookup,
                short_leave_lookup,
                two_late_lookup,
            )

            send_summary_email(
                employee_id,
                data["name"],
                issues,
                period_label,
            )
        except Exception as exc:
            frappe.log_error(
                f"Error processing employee {employee_id} "
                f"({data['name']}): {exc}",
                title="Attendance Summary: Processing Error",
            )
            skipped += 1
            continue

        processed += 1

    logger.info(
        f"Attendance summary job completed | period: {period_label} | "
        f"processed: {processed} | skipped: {skipped}"
    )


# ---------------------------------------------------------------------------
# Scheduled entry points
# ---------------------------------------------------------------------------

def send_weekly_attendance_summary():
    """
    Scheduled job — sends attendance summaries for the previous Mon–Sun week.

    Period calculation:
      today          = current date
      days_since_mon = today.weekday()   (0 if today is Monday)
      last_monday    = today − (days_since_mon + 7)
      last_sunday    = last_monday + 6
    """
    today          = getdate(nowdate())
    days_since_mon = today.weekday()                    # 0=Mon … 6=Sun
    last_monday    = add_days(today, -(days_since_mon + 7))
    last_sunday    = add_days(last_monday, 6)

    period_label = f"{last_monday} to {last_sunday} (Weekly)"
    _run_for_period(last_monday, last_sunday, period_label)


def send_monthly_attendance_summary():
    """
    Scheduled job — sends attendance summaries for the previous calendar month.

    Period calculation:
      first_this = first day of the current month
      last_prev  = first_this − 1 day          → last day of previous month
      first_prev = first day of last_prev's month
    """
    today      = getdate(nowdate())
    first_this = get_first_day(today)
    last_prev  = add_days(first_this, -1)
    first_prev = get_first_day(last_prev)

    period_label = last_prev.strftime("%B %Y") + " (Monthly)"
    _run_for_period(first_prev, last_prev, period_label)


def send_approver_attendance_summary(from_date=None, to_date=None, lookback_days=90):
    """
    Send a pending-applications summary email to every Leave Approver.

    When ``from_date`` and ``to_date`` are supplied they are used directly.
    Otherwise the window is the last ``lookback_days`` days up to today.

    Args:
        from_date:     date-like or None — explicit period start
        to_date:       date-like or None — explicit period end
        lookback_days: int — fallback lookback when dates are not provided (default: 90)
    """
    today = getdate(nowdate())

    if from_date and to_date:
        from_date    = getdate(from_date)
        to_date      = getdate(to_date)
        period_label = f"{from_date} to {to_date}"
    else:
        from_date    = add_days(today, -int(lookback_days))
        to_date      = today
        period_label = f"Last {lookback_days} Days (as of {today})"

    logger = frappe.logger("attendance_processor")
    logger.info(
        f"Approver summary job started | period: {period_label} "
        f"({from_date} to {to_date})"
    )

    grouped = fetch_approver_data(from_date, to_date)

    sent    = 0
    skipped = 0

    for approver_user_id, data in grouped.items():
        approver_name = data.get("approver_name", approver_user_id)
        try:
            send_approver_summary_email(
                approver_user_id,
                approver_name,
                data,
                period_label,
            )
            sent += 1
        except Exception as exc:
            frappe.log_error(
                f"Error sending approver summary to {approver_user_id} "
                f"({approver_name}): {exc}",
                title="Approver Summary: Processing Error",
            )
            skipped += 1

    logger.info(
        f"Approver summary job completed | period: {period_label} | "
        f"sent: {sent} | skipped: {skipped}"
    )


# ---------------------------------------------------------------------------
# Hourly dispatcher — reads Attendance Processor Settings
# ---------------------------------------------------------------------------

def run_scheduled_reports():
    """
    Runs every hour (via scheduler_events in hooks.py).
    Reads Attendance Processor Settings and triggers the weekly and/or monthly
    report jobs when the configured day and hour are reached, ensuring each
    job fires at most once per day.
    """
    try:
        settings = frappe.get_single("Attendance Processor Settings")
    except Exception:
        # Settings DocType not yet installed; skip silently
        return

    now   = now_datetime()
    today = getdate(nowdate())

    # ── Weekly ────────────────────────────────────────────────────────────
    if settings.enable_weekly_report:
        send_day  = settings.weekly_send_day or "Monday"
        send_hour = get_time(settings.weekly_send_time).hour if settings.weekly_send_time else 8

        if now.strftime("%A") == send_day and now.hour == send_hour:
            last_sent = getdate(settings.weekly_last_sent) if settings.weekly_last_sent else None
            if last_sent != today:
                send_weekly_attendance_summary()
                frappe.db.set_value(
                    "Attendance Processor Settings", None,
                    "weekly_last_sent", today,
                    update_modified=False,
                )
                frappe.db.commit()

    # ── Monthly ───────────────────────────────────────────────────────────
    if settings.enable_monthly_report:
        send_day_of_month = int(settings.monthly_send_day or 1)
        send_hour         = get_time(settings.monthly_send_time).hour if settings.monthly_send_time else 8

        if today.day == send_day_of_month and now.hour == send_hour:
            last_sent = getdate(settings.monthly_last_sent) if settings.monthly_last_sent else None
            if last_sent != today:
                send_monthly_attendance_summary()
                frappe.db.set_value(
                    "Attendance Processor Settings", None,
                    "monthly_last_sent", today,
                    update_modified=False,
                )
                frappe.db.commit()

    # ── Approver Summary ─────────────────────────────────────────────────
    if settings.enable_approver_summary:
        send_day  = settings.approver_summary_send_day or "Monday"
        send_hour = get_time(settings.approver_summary_send_time).hour if settings.approver_summary_send_time else 8

        if now.strftime("%A") == send_day and now.hour == send_hour:
            last_sent = getdate(settings.approver_summary_last_sent) if settings.approver_summary_last_sent else None
            if last_sent != today:
                lookback = int(settings.approver_summary_lookback_days or 90)
                send_approver_attendance_summary(lookback_days=lookback)
                frappe.db.set_value(
                    "Attendance Processor Settings", None,
                    "approver_summary_last_sent", today,
                    update_modified=False,
                )
                frappe.db.commit()
