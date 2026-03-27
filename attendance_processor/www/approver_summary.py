import frappe
from frappe import _
from frappe.utils import getdate


def get_context(context):
    # The Approver Summary has been moved to the Frappe desk.
    # Redirect all web-page requests to the desk route so that
    # the public URL (/approver_summary) is no longer accessible.
    frappe.local.flags.redirect_location = "/app/approver-summary"
    raise frappe.Redirect


# ---------------------------------------------------------------------------
# Whitelisted API  (called by approver_summary.js via frappe.call)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_approver_summary(from_date, to_date):
    """
    Return a dict keyed by leave_approver user-id, each value containing
    the pending application records for that approver grouped by type.
    """
    try:
        fd = getdate(from_date)
        td = getdate(to_date)

        # ------------------------------------------------------------------
        # STEP 1 — Fetch all four application datasets
        # ------------------------------------------------------------------

        leave_applications = frappe.db.get_all(
            "Leave Application",
            filters=[
                ["from_date", "<=", td],
                ["to_date", ">=", fd],
                ["status", "=", "Open"],
                ["docstatus", "!=", 2],
            ],
            fields=[
                "name", "employee", "employee_name",
                "from_date", "to_date", "status",
                "leave_type", "total_leave_days",
            ],
        )

        two_late_applications = frappe.db.get_all(
            "Two Late Attendance To One Half Day",
            filters=[
                ["attendance_date", ">=", fd],
                ["second_attendance_date", "<=", td],
                ["status", "=", "Department Head Review"],
                ["docstatus", "!=", 2],
            ],
            fields=[
                "name", "employee", "employee_name",
                "attendance_date", "second_attendance_date", "status",
            ],
        )

        short_leave_applications = frappe.db.get_all(
            "Short Leave Application",
            filters=[
                ["attendance_date", ">=", fd],
                ["attendance_date", "<=", td],
                ["status", "=", "Waiting for Department Head Review"],
                ["docstatus", "!=", 2],
            ],
            fields=[
                "name", "employee", "employee_name",
                "attendance_date", "status",
            ],
        )

        missed_attendance_requests = frappe.db.get_all(
            "Missed Attendance Request",
            filters=[
                ["attendance_date", ">=", fd],
                ["attendance_date", "<=", td],
                ["status", "=", "Department Head Review"],
                ["docstatus", "!=", 2],
            ],
            fields=[
                "name", "employee", "employee_name",
                "attendance_date", "status",
            ],
        )

        # ------------------------------------------------------------------
        # STEP 2 — Collect all unique employee IDs and fetch their
        #          leave_approver + department in one pass each
        # ------------------------------------------------------------------

        all_datasets = (
            leave_applications
            + two_late_applications
            + short_leave_applications
            + missed_attendance_requests
        )

        unique_employees = {rec.employee for rec in all_datasets if rec.employee}

        # Cache: { employee_id: {"leave_approver": ..., "department": ...,
        #                         "employee_name": ...} }
        emp_cache = {}
        for emp_id in unique_employees:
            info = frappe.db.get_value(
                "Employee",
                emp_id,
                ["leave_approver", "department", "employee_name"],
                as_dict=True,
            )
            emp_cache[emp_id] = info or {
                "leave_approver": None,
                "department": None,
                "employee_name": emp_id,
            }

        # ------------------------------------------------------------------
        # STEP 3 — Group records by leave_approver
        # ------------------------------------------------------------------

        NO_APPROVER_KEY = "No Approver Assigned"

        # Cache approver full names: { user_id: full_name }
        approver_name_cache = {}

        def _approver_key_name(user_id):
            """Return (key, display_name) for an approver user_id."""
            if not user_id:
                return NO_APPROVER_KEY, NO_APPROVER_KEY
            if user_id not in approver_name_cache:
                full_name = frappe.db.get_value("User", user_id, "full_name")
                approver_name_cache[user_id] = full_name or user_id
            return user_id, approver_name_cache[user_id]

        grouped = {}

        def _ensure_approver(key, display_name):
            if key not in grouped:
                grouped[key] = {
                    "approver_name": display_name,
                    "leave_applications": [],
                    "two_late_applications": [],
                    "short_leave_applications": [],
                    "missed_attendance_requests": [],
                }

        def _enrich(rec):
            """Return rec as a plain dict with department & employee_name added."""
            emp_info = emp_cache.get(rec.employee, {})
            d = dict(rec)
            # Convert date objects to ISO strings for JSON serialisation
            for date_field in ("from_date", "to_date", "attendance_date",
                               "second_attendance_date"):
                if date_field in d and d[date_field]:
                    d[date_field] = str(d[date_field])
            d["department"] = emp_info.get("department") or ""
            # Prefer the value already on the record; fall back to Employee
            if not d.get("employee_name"):
                d["employee_name"] = emp_info.get("employee_name") or rec.employee
            return d

        for rec in leave_applications:
            emp_info = emp_cache.get(rec.employee, {})
            key, name = _approver_key_name(emp_info.get("leave_approver"))
            _ensure_approver(key, name)
            grouped[key]["leave_applications"].append(_enrich(rec))

        for rec in two_late_applications:
            emp_info = emp_cache.get(rec.employee, {})
            key, name = _approver_key_name(emp_info.get("leave_approver"))
            _ensure_approver(key, name)
            grouped[key]["two_late_applications"].append(_enrich(rec))

        for rec in short_leave_applications:
            emp_info = emp_cache.get(rec.employee, {})
            key, name = _approver_key_name(emp_info.get("leave_approver"))
            _ensure_approver(key, name)
            grouped[key]["short_leave_applications"].append(_enrich(rec))

        for rec in missed_attendance_requests:
            emp_info = emp_cache.get(rec.employee, {})
            key, name = _approver_key_name(emp_info.get("leave_approver"))
            _ensure_approver(key, name)
            grouped[key]["missed_attendance_requests"].append(_enrich(rec))

        # ------------------------------------------------------------------
        # STEP 4 — Restrict to the logged-in approver unless the user has
        #          an administrative role (System Manager or HR Manager).
        # ------------------------------------------------------------------
        current_user = frappe.session.user
        admin_roles = {"System Manager", "HR Manager"}
        user_roles = set(frappe.get_roles(current_user))
        is_admin = bool(admin_roles & user_roles)

        if not is_admin:
            # Return only the section that belongs to the current user.
            grouped = {k: v for k, v in grouped.items() if k == current_user}

        return grouped

    except Exception:
        frappe.log_error(frappe.get_traceback(), "Approver Summary Error")
        raise
