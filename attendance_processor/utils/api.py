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
def get_attendance_analysis(from_date, to_date, employees=None):
    """
    Run the 4-check attendance analysis for the given period and return
    JSON-serialisable results.  Called by the Attendance Summary Report page.

    Args:
        from_date: str  "YYYY-MM-DD"
        to_date:   str  "YYYY-MM-DD"
        employees: str  JSON list of employee IDs to restrict analysis to;
                        pass an empty list or omit to analyse all.

    Returns:
        List of dicts, one per active employee, sorted by issue count desc.
    """
    import json
    from_date = getdate(from_date)
    to_date   = getdate(to_date)

    employees_list = None
    if employees:
        raw = json.loads(employees) if isinstance(employees, str) else employees
        employees_list = [e for e in raw if e] or None

    missed_lookup      = get_missed_requests_lookup(from_date, to_date)
    leave_lookup       = get_leave_applications_lookup(from_date, to_date)
    short_leave_lookup = get_short_leave_lookup(from_date, to_date)
    two_late_lookup    = get_two_late_lookup(from_date, to_date)
    all_records        = get_attendance_records(from_date, to_date,
                                                employees=employees_list)

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
                           send_even_if_no_issues=0,
                           selected_employees=None):
    """
    Enqueue a background job to send attendance summary emails for the period.
    Returns immediately; emails are sent asynchronously.
    Restricted to users with the System Manager role.

    Args:
        from_date:               str   "YYYY-MM-DD"
        to_date:                 str   "YYYY-MM-DD"
        employee:                str   optional — send to one employee only
        send_even_if_no_issues:  int   1 to email employees with no issues too
        selected_employees:      str   JSON list of employee IDs to restrict sending to

    Returns:
        {"status": "queued", "message": str}
    """
    import json
    if "System Manager" not in frappe.get_roles():
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

    allowed = None
    if selected_employees:
        allowed = json.loads(selected_employees) if isinstance(selected_employees, str) else selected_employees

    frappe.enqueue(
        "attendance_processor.attendance_processor.utils.api._do_send_emails",
        from_date=from_date,
        to_date=to_date,
        employee=employee or None,
        send_even_if_no_issues=cint(send_even_if_no_issues),
        selected_employees=allowed,
        queue="long",
        timeout=3600,
    )
    count = len(allowed) if allowed is not None else "all selected"
    return {
        "status":  "queued",
        "message": f"Email job queued for {from_date} to {to_date} "
                   f"({count} employee(s)). "
                   "Emails will be delivered in the background.",
    }


@frappe.whitelist()
def get_email_send_preview(from_date, to_date, employees=None):
    """
    Return the list of employees who would receive an email if Send Emails
    were triggered right now: active employees with at least one issue.
    Restricted to System Manager.

    Returns:
        List of dicts: [{employee_id, employee_name, email, issue_count}, ...]
    """
    import json
    if "System Manager" not in frappe.get_roles():
        frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

    from_date = getdate(from_date)
    to_date   = getdate(to_date)

    employees_list = None
    if employees:
        raw = json.loads(employees) if isinstance(employees, str) else employees
        employees_list = [e for e in raw if e] or None

    missed_lookup      = get_missed_requests_lookup(from_date, to_date)
    leave_lookup       = get_leave_applications_lookup(from_date, to_date)
    short_leave_lookup = get_short_leave_lookup(from_date, to_date)
    two_late_lookup    = get_two_late_lookup(from_date, to_date)
    all_records        = get_attendance_records(from_date, to_date,
                                                employees=employees_list)

    emp_data   = _build_emp_data(all_records)
    active_ids = _get_active_employee_ids()

    # Batch-fetch email (user_id) for all active candidates in one query
    candidate_ids = [eid for eid in emp_data if eid in active_ids]
    email_map = {
        r.name: r.user_id
        for r in frappe.get_all(
            "Employee",
            filters={"name": ["in", candidate_ids]},
            fields=["name", "user_id"],
        )
    } if candidate_ids else {}

    recipients = []
    for emp_id, data in emp_data.items():
        if emp_id not in active_ids:
            continue
        issues = analyse_employee(
            emp_id, data["records"],
            missed_lookup, leave_lookup,
            short_leave_lookup, two_late_lookup,
        )
        total_issues = sum(len(v) for v in issues.values())
        if total_issues == 0:
            continue
        recipients.append({
            "employee_id":   emp_id,
            "employee_name": data["name"],
            "email":         email_map.get(emp_id) or "",
            "issue_count":   total_issues,
        })

    recipients.sort(key=lambda x: (x["employee_name"] or "").lower())
    return recipients


# ---------------------------------------------------------------------------
# Background worker (called via frappe.enqueue — not directly by users)
# ---------------------------------------------------------------------------

def _do_send_emails(from_date, to_date, employee=None,
                    send_even_if_no_issues=False, period_label=None,
                    selected_employees=None):
    """
    Background worker: runs the full attendance analysis and sends summary
    emails.  Errors per employee are logged and do not abort other employees.
    selected_employees: optional list of employee IDs — only these are emailed.
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

    emp_data   = _build_emp_data(all_records)
    active_ids = _get_active_employee_ids(employee=employee)
    allowed    = set(selected_employees) if selected_employees else None

    for emp_id, data in emp_data.items():
        if emp_id not in active_ids:
            continue
        if allowed is not None and emp_id not in allowed:
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
