import frappe


@frappe.whitelist()
def get_leave_balance_data(month, year):
    from attendance_processor.utils.api import get_leave_balance_data as _impl
    return _impl(month, year)
