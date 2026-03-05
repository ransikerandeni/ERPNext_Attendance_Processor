import frappe
from frappe.utils import getdate, nowdate, add_days, get_first_day

from attendance_processor.attendance_processor.utils.processor import (
    get_attendance_records,
    get_missed_requests_lookup,
    get_leave_applications_lookup,
    get_short_leave_lookup,
    get_two_late_lookup,
    analyse_employee,
)
from attendance_processor.attendance_processor.utils.email_report import (
    send_summary_email,
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

        processed += 1

    # 5. Commit once after all employees have been processed
    frappe.db.commit()

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
