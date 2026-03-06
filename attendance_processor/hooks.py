app_name = "attendance_processor"
app_title = "Attendance Processor"
app_publisher = "UCSC"
app_description = "Processes Employee Attendance Summaries"
app_email = "erp@ucsc.cmb.ac.lk"
app_license = "MIT"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/attendance_processor/css/attendance_processor.css"
# app_include_js = "/assets/attendance_processor/js/attendance_processor.js"

# include js, css files in header of web template
# web_include_css = "/assets/attendance_processor/css/attendance_processor.css"
# web_include_js = "/assets/attendance_processor/js/attendance_processor.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "attendance_processor/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "attendance_processor.utils.jinja_methods",
# 	"filters": "attendance_processor.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "attendance_processor.install.before_install"
# after_install = "attendance_processor.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "attendance_processor.uninstall.before_uninstall"
# after_uninstall = "attendance_processor.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "attendance_processor.utils.before_app_install"
# after_app_install = "attendance_processor.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "attendance_processor.utils.before_app_uninstall"
# after_app_uninstall = "attendance_processor.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "attendance_processor.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"attendance_processor.tasks.all"
# 	],
# 	"daily": [
# 		"attendance_processor.tasks.daily"
# 	],
# 	"hourly": [
# 		"attendance_processor.tasks.hourly"
# 	],
# 	"weekly": [
# 		"attendance_processor.tasks.weekly"
# 	],
# 	"monthly": [
# 		"attendance_processor.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "attendance_processor.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "attendance_processor.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "attendance_processor.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["attendance_processor.utils.before_request"]
# after_request = ["attendance_processor.utils.after_request"]

# Job Events
# ----------
# before_job = ["attendance_processor.utils.before_job"]
# after_job = ["attendance_processor.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"attendance_processor.auth.validate"
# ]

scheduler_events = {
	"weekly_long": [
		"attendance_processor.scheduler.send_weekly_attendance_summary"
	],
	"monthly_long": [
		"attendance_processor.scheduler.send_monthly_attendance_summary"
	],
}
