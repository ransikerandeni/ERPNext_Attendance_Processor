import frappe
from frappe.utils import getdate, cint

from attendance_processor.utils.processor import (
    get_attendance_records,
    get_missed_requests_lookup,
    get_leave_applications_lookup,
    get_short_leave_lookup,
    get_two_late_lookup,
    analyse_employee,
)
from attendance_processor.utils.email_report import send_summary_email


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_employee_active(att_records):
    for rec in att_records:
        if rec.status in ("Present", "Half Day"):
            return True
        if rec.custom_ucsc_status in ("Present", "Half Day"):
            return True
    return False


def _get_active_employee_ids(employee=None):
    """Return a set of employee IDs whose HR status is 'Active'."""
    filters = {"status": "Active"}
    if employee:
        filters["name"] = employee
    return set(frappe.get_all("Employee", filters=filters, pluck="name"))


def _fmt_time(val):
    """Extract HH:MM:SS portion from a datetime/string; return None if absent."""
    if not val:
        return None
    s = str(val).strip()
    return s.split(" ", 1)[1] if " " in s else s


def _serialize_record(rec):
    """Convert a frappe._dict attendance record to a plain JSON-safe dict."""
    return {
        "name":              rec.name,
        "attendance_date":   str(rec.attendance_date) if rec.attendance_date else None,
        "status":            rec.status or "",
        "custom_ucsc_status": rec.custom_ucsc_status or "",
        "in_time":           _fmt_time(rec.in_time),
        "out_time":          _fmt_time(rec.out_time),
        "shift":             rec.shift or "",
        "custom_remarks":    (rec.custom_remarks or "")[:80],
        "employee":          rec.employee,
        "employee_name":     rec.employee_name,
    }


def _build_emp_data(all_records):
    """Group a flat list of attendance records by employee."""
    emp_data = {}
    for rec in all_records:
        if rec.employee not in emp_data:
            emp_data[rec.employee] = {"name": rec.employee_name, "records": []}
        emp_data[rec.employee]["records"].append(rec)
    return emp_data


# ---------------------------------------------------------------------------
# Public whitelisted API
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_attendance_analysis(from_date, to_date, employee=None):
    """
    Run the 4-check attendance analysis for the given period and return
    JSON-serialisable results.  Called by the Attendance Summary Report page.

    Args:
        from_date: str  "YYYY-MM-DD"
        to_date:   str  "YYYY-MM-DD"
        employee:  str  optional employee ID — analyse one employee only

    Returns:
        List of dicts, one per active employee, sorted by issue count desc:
        [
          {
            "employee_id":   str,
            "employee_name": str,
            "total_issues":  int,
            "issues": {
              "missed_attendance_request": [...serialised records...],
              "leave_application":         [...],
              "short_leave_application":   [...],
              "two_late_to_half_day":      [...],
            }
          },
          ...
        ]
    """
    from_date = getdate(from_date)
    to_date   = getdate(to_date)

    missed_lookup      = get_missed_requests_lookup(from_date, to_date)
    leave_lookup       = get_leave_applications_lookup(from_date, to_date)
    short_leave_lookup = get_short_leave_lookup(from_date, to_date)
    two_late_lookup    = get_two_late_lookup(from_date, to_date)
    all_records        = get_attendance_records(from_date, to_date,
                                                employee=employee or None)

    emp_data = _build_emp_data(all_records)

    # Enforce ERPNext User Permissions: frappe.get_list applies role permissions
    # and User Permissions automatically, so non-privileged users only see the
    # Employee records they are permitted to access.
    if "System Manager" not in frappe.get_roles():
        permitted_ids = set(frappe.get_list("Employee", pluck="name"))
        emp_data = {k: v for k, v in emp_data.items() if k in permitted_ids}

    results = []
    for emp_id, data in emp_data.items():
        if not _is_employee_active(data["records"]):
            continue

        issues = analyse_employee(
            emp_id, data["records"],
            missed_lookup, leave_lookup,
            short_leave_lookup, two_late_lookup,
        )

        total_issues = sum(len(v) for v in issues.values())
        results.append({
            "employee_id":   emp_id,
            "employee_name": data["name"],
            "total_issues":  total_issues,
            "issues": {
                key: [_serialize_record(r) for r in recs]
                for key, recs in issues.items()
            },
        })

    # employees with issues first, then alphabetically
    results.sort(key=lambda x: (-x["total_issues"], (x["employee_name"] or "").lower()))
    return results


@frappe.whitelist()
def send_attendance_emails(from_date, to_date, employee=None,
                           send_even_if_no_issues=0):
    """
    Enqueue a background job to send attendance summary emails for the period.
    Returns immediately; emails are sent asynchronously.
    Restricted to users with the System Manager role.

    Args:
        from_date:               str  "YYYY-MM-DD"
        to_date:                 str  "YYYY-MM-DD"
        employee:                str  optional — send to one employee only
        send_even_if_no_issues:  int  1 to email employees with no issues too

    Returns:
        {"status": "queued", "message": str}
    """
    if "System Manager" not in frappe.get_roles():
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

    frappe.enqueue(
        "attendance_processor.attendance_processor.utils.api._do_send_emails",
        from_date=from_date,
        to_date=to_date,
        employee=employee or None,
        send_even_if_no_issues=cint(send_even_if_no_issues),
        queue="long",
        timeout=3600,
    )
    scope = f"employee {employee}" if employee else "all active employees"
    return {
        "status":  "queued",
        "message": f"Email job queued for {from_date} to {to_date} ({scope}). "
                   "Emails will be delivered in the background.",
    }


# ---------------------------------------------------------------------------
# Background worker (called via frappe.enqueue — not directly by users)
# ---------------------------------------------------------------------------

def _do_send_emails(from_date, to_date, employee=None,
                    send_even_if_no_issues=False, period_label=None):
    """
    Background worker: runs the full attendance analysis and sends summary
    emails.  Errors per employee are logged and do not abort other employees.
    """
    from_date = getdate(from_date)
    to_date   = getdate(to_date)

    if not period_label:
        period_label = f"{from_date} to {to_date} (Custom)"

    missed_lookup      = get_missed_requests_lookup(from_date, to_date)
    leave_lookup       = get_leave_applications_lookup(from_date, to_date)
    short_leave_lookup = get_short_leave_lookup(from_date, to_date)
    two_late_lookup    = get_two_late_lookup(from_date, to_date)
    all_records        = get_attendance_records(from_date, to_date,
                                                employee=employee)

    emp_data = _build_emp_data(all_records)
    active_ids = _get_active_employee_ids(employee=employee)

    for emp_id, data in emp_data.items():
        if emp_id not in active_ids:
            continue
        try:
            issues = analyse_employee(
                emp_id, data["records"],
                missed_lookup, leave_lookup,
                short_leave_lookup, two_late_lookup,
            )
            send_summary_email(
                emp_id, data["name"], issues, period_label,
                send_even_if_no_issues=bool(send_even_if_no_issues),
            )
        except Exception as exc:
            frappe.log_error(
                f"Error sending email to {emp_id} ({data['name']}): {exc}",
                title="Attendance Summary: Email Send Failed",
            )

    frappe.db.commit()
