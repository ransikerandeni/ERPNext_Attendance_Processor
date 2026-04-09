import frappe
from frappe.utils import getdate
from datetime import time, datetime

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SHIFT_WINDOWS = {
    "Shift-A": (time(9, 0, 0),  time(9, 15, 59)),   # 09:00:00 – 09:15:59
    "Shift-C": (time(8, 30, 0), time(8, 45, 59)),   # 08:30:00 – 08:45:59
}

SHORT_LEAVE_MONTHLY_LIMIT = 2
TWO_LATE_MONTHLY_LIMIT    = 2


# ---------------------------------------------------------------------------
# Data Loaders
# ---------------------------------------------------------------------------

def get_attendance_records(from_date, to_date, employee=None, employees=None):
    """
    Return a flat list of Attendance records for the given period.
    Cancelled records (docstatus=2) are excluded at the DB level.
    Pass `employees` (list) to filter by multiple IDs, or `employee` (str) for one.
    """
    filters = [
        ["attendance_date", "between", [from_date, to_date]],
        ["docstatus", "!=", 2],
    ]
    if employees:
        filters.append(["employee", "in", employees])
    elif employee:
        filters.append(["employee", "=", employee])

    return frappe.db.get_all(
        "Attendance",
        filters=filters,
        fields=[
            "name", "employee", "employee_name", "attendance_date",
            "in_time", "out_time", "status", "shift",
            "custom_ucsc_status", "custom_remarks", "leave_application",
        ],
        order_by="attendance_date asc",
    )


def get_missed_requests_lookup(from_date, to_date):
    """Return {employee_id: [attendance_date, ...]} for Missed Attendance Requests."""
    records = frappe.db.get_all(
        "Missed Attendance Request",
        filters=[
            ["attendance_date", "between", [from_date, to_date]],
            ["docstatus", "!=", 2],
        ],
        fields=["employee", "attendance_date"],
    )
    result = {}
    for r in records:
        result.setdefault(r.employee, []).append(r.attendance_date)
    return result


def get_leave_applications_lookup(from_date, to_date):
    """
    Return {employee_id: [{"from": date, "to": date}, ...]} for approved/open
    Leave Applications that overlap with the given period.
    """
    records = frappe.db.get_all(
        "Leave Application",
        filters=[
            ["status", "in", ["Approved", "Open"]],
            ["docstatus", "!=", 2],
            ["from_date", "<=", to_date],
            ["to_date", ">=", from_date],
        ],
        fields=["employee", "from_date", "to_date"],
    )
    result = {}
    for r in records:
        result.setdefault(r.employee, []).append(
            {"from": r.from_date, "to": r.to_date}
        )
    return result


def get_short_leave_lookup(from_date, to_date):
    """Return {employee_id: [attendance_date, ...]} for Short Leave Applications."""
    records = frappe.db.get_all(
        "Short Leave Application",
        filters=[
            ["attendance_date", "between", [from_date, to_date]],
            ["docstatus", "!=", 2],
        ],
        fields=["employee", "attendance_date"],
    )
    result = {}
    for r in records:
        result.setdefault(r.employee, []).append(r.attendance_date)
    return result


def get_two_late_lookup(from_date, to_date):
    """
    Return {employee_id: [(attendance_date, second_attendance_date_or_None), ...]}
    for Two Late Attendance To One Half Day records.
    """
    records = frappe.db.get_all(
        "Two Late Attendance To One Half Day",
        filters=[
            ["attendance_date", "between", [from_date, to_date]],
            ["docstatus", "!=", 2],
        ],
        fields=["employee", "attendance_date", "second_attendance_date"],
    )
    result = {}
    for r in records:
        result.setdefault(r.employee, []).append(
            (r.attendance_date, r.second_attendance_date)
        )
    return result


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def is_covered_by_leave(check_date, leave_ranges):
    """Return True if check_date falls within any approved leave range."""
    check_date = getdate(check_date)
    for r in leave_ranges:
        if getdate(r["from"]) <= check_date <= getdate(r["to"]):
            return True
    return False


def has_date_in_list(check_date, date_list):
    """Return True if check_date matches any date in date_list."""
    check_date = getdate(check_date)
    return any(getdate(d) == check_date for d in date_list)


def has_two_late_for_date(check_date, two_late_entries):
    """
    Return True if check_date matches either attendance_date or
    second_attendance_date in any Two Late entry.
    """
    check_date = getdate(check_date)
    for (date1, date2) in two_late_entries:
        if getdate(date1) == check_date:
            return True
        if date2 and getdate(date2) == check_date:
            return True
    return False


def parse_in_time(in_time_value):
    """
    Accept a datetime, time, or string and return a time object.
    Returns None if parsing fails or value is None.
    """
    if in_time_value is None:
        return None
    if isinstance(in_time_value, time):
        return in_time_value
    if isinstance(in_time_value, datetime):
        return in_time_value.time()
    if isinstance(in_time_value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                return datetime.strptime(in_time_value, fmt).time()
            except ValueError:
                continue
    return None


def is_application_already_linked(rec):
    """
    Return True if the Attendance record is already linked to an application,
    meaning it should be skipped for all issue checks.
    """
    if rec.leave_application:
        return True
    # Uncomment the lines below if you add link fields to the Attendance DocType:
    # if rec.get("custom_missed_attendance_request"):
    #     return True
    # if rec.get("custom_short_leave_application"):
    #     return True
    # if rec.get("custom_two_late_application"):
    #     return True
    return False


# ---------------------------------------------------------------------------
# Short Leave / Two Late Classification
# ---------------------------------------------------------------------------

def classify_short_leave_records(pending_rows, emp_short_dates, emp_two_late):
    """
    Classify pending 'Half Day / Short Leave' records into three buckets.

    Args:
        pending_rows:    list of (att_date, rec) tuples
        emp_short_dates: list of already-filed Short Leave dates (date objects)
        emp_two_late:    list of (date1, date2_or_None) for filed Two Late apps

    Returns:
        (short_leave_list, leave_app_list, two_late_list)
        two_late_list contains rec objects only (not tuples).

    Rules (applied in order):
      1. Two Late Promotion  — shift-window eligible, not already filed, under limit
      2. Short Leave or overflow — based on per-month short leave count
      3. Unpaired Two Late demotion — lone promoted record → demote to short/overflow
    """
    short_leave_list = []
    leave_app_list   = []
    two_late_list    = []

    # Pre-compute already-filed short leave counts per (year, month)
    filed_short_per_month = {}
    for d in emp_short_dates:
        d = getdate(d)
        key = (d.year, d.month)
        filed_short_per_month[key] = filed_short_per_month.get(key, 0) + 1

    # Pre-compute months that already have a filed Two Late application
    filed_two_late_months = set()
    for (d1, _d2) in emp_two_late:
        d1 = getdate(d1)
        filed_two_late_months.add((d1.year, d1.month))

    # Running counters for this classification pass
    promoted_per_month    = {}  # (year, month) → count promoted in this run
    assigned_short_per_month = {}  # (year, month) → count assigned to short_leave

    # Track promoted records for potential demotion in Step 3
    promoted_rows = []  # list of (month_key, rec)

    for (att_date, rec) in pending_rows:
        att_date  = getdate(att_date)
        month_key = (att_date.year, att_date.month)

        # ── Step 1: Two Late Promotion ──────────────────────────────────────
        is_late_eligible = False
        if rec.shift in SHIFT_WINDOWS:
            window_start, window_end = SHIFT_WINDOWS[rec.shift]
            parsed = parse_in_time(rec.in_time)
            if parsed and window_start <= parsed <= window_end:
                is_late_eligible = True

        if (
            is_late_eligible
            and month_key not in filed_two_late_months
            and promoted_per_month.get(month_key, 0) < TWO_LATE_MONTHLY_LIMIT
        ):
            two_late_list.append(rec)
            promoted_rows.append((month_key, rec))
            promoted_per_month[month_key] = promoted_per_month.get(month_key, 0) + 1
            continue

        # ── Step 2: Short Leave / Overflow ──────────────────────────────────
        already_filed   = filed_short_per_month.get(month_key, 0)
        assigned_so_far = assigned_short_per_month.get(month_key, 0)

        if already_filed + assigned_so_far >= SHORT_LEAVE_MONTHLY_LIMIT:
            leave_app_list.append(rec)
        else:
            short_leave_list.append(rec)
            assigned_short_per_month[month_key] = assigned_so_far + 1

    # ── Step 3: Unpaired Two Late Reconciliation ────────────────────────────
    # A Two Late application needs exactly 2 records. If only 1 was promoted,
    # demote it back to short_leave or overflow.
    for month_key, count in promoted_per_month.items():
        if count % 2 == 0:
            continue

        demote_rec = next(
            (r for (mk, r) in promoted_rows if mk == month_key), None
        )
        if demote_rec is None:
            continue

        two_late_list.remove(demote_rec)

        already_filed   = filed_short_per_month.get(month_key, 0)
        assigned_so_far = assigned_short_per_month.get(month_key, 0)

        if already_filed + assigned_so_far >= SHORT_LEAVE_MONTHLY_LIMIT:
            leave_app_list.append(demote_rec)
        else:
            short_leave_list.append(demote_rec)
            assigned_short_per_month[month_key] = assigned_so_far + 1

    return short_leave_list, leave_app_list, two_late_list


# ---------------------------------------------------------------------------
# Per-Employee Analysis
# ---------------------------------------------------------------------------

def analyse_employee(
    employee_id, att_records, missed_lookup, leave_lookup,
    short_leave_lookup, two_late_lookup,
):
    """
    Run all 4 attendance checks for one employee.

    Returns a dict with four issue lists:
        {
            "missed_attendance_request": [...],
            "leave_application":         [...],
            "short_leave_application":   [...],
            "two_late_to_half_day":      [...],
        }
    """
    emp_missed_dates = missed_lookup.get(employee_id, [])
    emp_leave_ranges = leave_lookup.get(employee_id, [])
    emp_short_dates  = short_leave_lookup.get(employee_id, [])
    emp_two_late     = two_late_lookup.get(employee_id, [])

    missed_req_issues = []
    leave_app_issues  = []
    pending_short     = []

    for rec in att_records:
        att_date = getdate(rec.attendance_date)

        # ── Pre-checks ─────────────────────────────────────────────────────
        if att_date.weekday() in (5, 6):        # Saturday=5, Sunday=6
            continue
        if is_application_already_linked(rec):
            continue

        status             = rec.status or ""
        custom_ucsc_status = rec.custom_ucsc_status or ""
        custom_remarks     = rec.custom_remarks or ""
        in_time            = rec.in_time
        out_time           = rec.out_time

        # ── CHECK 1: Missed Attendance Request ─────────────────────────────
        # One punch is present and the other is missing
        if (not in_time and out_time) or (in_time and not out_time):
            if not has_date_in_list(att_date, emp_missed_dates):
                missed_req_issues.append(rec)

        # ── CHECK 2: Leave Application (full absence) ──────────────────────
        # Absent status with no punch-in and no punch-out
        elif (
            (status == "Absent" or custom_ucsc_status == "Absent")
            and not in_time
            and not out_time
        ):
            if not is_covered_by_leave(att_date, emp_leave_ranges):
                leave_app_issues.append(rec)

        # ── CHECK 2b: Leave Application (uncovered Half Day) ───────────────
        # Half Day in status/remarks, but remarks say plain "Half Day" (not Short Leave)
        elif (
            (status == "Half Day" or custom_ucsc_status == "Half Day")
            and "Half Day" in custom_remarks
            and "Short Leave" not in custom_remarks
        ):
            if (
                not is_covered_by_leave(att_date, emp_leave_ranges)
                and not has_date_in_list(att_date, emp_short_dates)
                and not has_two_late_for_date(att_date, emp_two_late)
            ):
                leave_app_issues.append(rec)

        # ── CHECK 3 & 4: Short Leave / Two Late (deferred) ─────────────────
        # Remarks indicate "Half Day / Short Leave" — classify after the loop
        elif "Half Day / Short Leave" in custom_remarks:
            if not has_date_in_list(att_date, emp_short_dates):
                pending_short.append((att_date, rec))

    # Classify deferred Short Leave / Two Late records
    sl_list, sl_overflow, promoted_two_late = classify_short_leave_records(
        pending_short, emp_short_dates, emp_two_late
    )
    leave_app_issues.extend(sl_overflow)

    return {
        "missed_attendance_request": missed_req_issues,
        "leave_application":         leave_app_issues,
        "short_leave_application":   sl_list,
        "two_late_to_half_day":      promoted_two_late,
    }
