// ─────────────────────────────────────────────────────────────────────────────
// HR Report — Frappe desk page
// Allows HR User / System Manager to send individual attendance summary emails
// and view the full history of sent reports.
// ─────────────────────────────────────────────────────────────────────────────

frappe.pages["hr-report"].on_page_load = function (wrapper) {
	var allowed = ["HR User", "System Manager"];
	var hasAccess = frappe.user_roles.some(r => allowed.includes(r));
	if (!hasAccess) {
		$(wrapper).html(`
			<div style="padding:60px;text-align:center;color:#888;font-family:Arial,sans-serif;">
				<div style="font-size:48px;margin-bottom:16px;">🔒</div>
				<p style="font-size:16px;">${__("You do not have permission to access this page.")}</p>
			</div>
		`);
		return;
	}

	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("HR Report"),
		single_column: true,
	});

	new HRReport(page);
};

// ─────────────────────────────────────────────────────────────────────────────

class HRReport {
	constructor(page) {
		this.page = page;
		this.data = [];
		this.filtered_data = [];
		this.sort_order = "issues_desc";
		this._setting_dates = false;
		this.selected_employees = [];
		this._active_tab = "report"; // "report" | "history"

		this._setup_filter_bar();
		this._setup_actions();
		this._render_shell();

		this._apply_preset("Last Month");
		this._load_email_history();
	}

	// ─── Filter bar ────────────────────────────────────────────────────────

	_setup_filter_bar() {
		var me = this;

		this.f_preset = this.page.add_field({
			label: __("Period"),
			fieldname: "period_preset",
			fieldtype: "Select",
			options: [
				"",
				"Last Week",
				"Last Month",
				"This Week",
				"This Month",
				"Custom",
			].join("\n"),
			change() {
				if (me._setting_dates) return;
				var v = me.f_preset.get_value();
				if (v && v !== "Custom") me._apply_preset(v);
			},
		});

		this.f_from = this.page.add_field({
			label: __("From Date"),
			fieldname: "from_date",
			fieldtype: "Date",
			change() {
				if (!me._setting_dates) me.f_preset.set_value("Custom");
			},
		});

		this.f_to = this.page.add_field({
			label: __("To Date"),
			fieldname: "to_date",
			fieldtype: "Date",
			change() {
				if (!me._setting_dates) me.f_preset.set_value("Custom");
			},
		});

		this.f_employee = this.page.add_field({
			label: __("Add Employee"),
			fieldname: "employee",
			fieldtype: "Link",
			options: "Employee",
			change() {
				var val = me.f_employee.get_value();
				if (val) {
					me._add_selected_employee(val);
					setTimeout(() => me.f_employee.set_value(""), 0);
				}
			},
		});
	}

	// ─── Multi-employee tag picker ─────────────────────────────────────────

	_add_selected_employee(emp_id) {
		emp_id = (emp_id || "").trim();
		if (!emp_id) return;
		if (!this.selected_employees.includes(emp_id)) {
			this.selected_employees.push(emp_id);
			this._render_emp_pills();
		}
	}

	_render_emp_pills() {
		var me    = this;
		var $wrap = this.$emp_tags_wrap;
		$wrap.empty();

		if (!this.selected_employees.length) {
			$wrap.append(
				`<span style="font-size:12px;color:#aaa;font-style:italic;">
					${__("No employee filter — showing all")}
				</span>`
			);
			return;
		}

		$wrap.append(
			`<span style="font-size:12px;color:#666;margin-right:2px;flex-shrink:0;">
				${__("Employees")}:
			</span>`
		);

		this.selected_employees.forEach(emp => {
			$wrap.append(`
				<span class="ap-emp-pill"
				      style="display:inline-flex;align-items:center;gap:3px;
				             background:#FFFBEB;color:#D97706;
				             border:1px solid #FDE68A;border-radius:20px;
				             padding:2px 10px;font-size:12px;font-weight:500;">
					${frappe.utils.escape_html(emp)}
					<span class="ap-pill-remove" data-emp="${frappe.utils.escape_html(emp)}"
					      style="cursor:pointer;font-size:15px;line-height:1;
					             color:#6c757d;margin-left:3px;" title="${__("Remove")}">
						&times;
					</span>
				</span>
			`);
		});

		if (this.selected_employees.length > 1) {
			$wrap.append(
				`<span class="ap-pill-clear-all"
				      style="font-size:11px;color:#888;cursor:pointer;
				             text-decoration:underline;margin-left:4px;flex-shrink:0;">
					${__("Clear all")}
				</span>`
			);
		}

		$wrap.find(".ap-pill-remove").on("click", function () {
			var emp = $(this).data("emp");
			me.selected_employees = me.selected_employees.filter(e => e !== emp);
			me._render_emp_pills();
		});
		$wrap.find(".ap-pill-clear-all").on("click", function () {
			me.selected_employees = [];
			me._render_emp_pills();
		});
	}

	_apply_preset(preset) {
		var me   = this;
		var from, to;
		switch (preset) {
			case "Last Week":
				from = moment().subtract(1, "weeks").startOf("isoWeek").format("YYYY-MM-DD");
				to   = moment().subtract(1, "weeks").endOf("isoWeek").format("YYYY-MM-DD");
				break;
			case "Last Month":
				from = moment().subtract(1, "months").startOf("month").format("YYYY-MM-DD");
				to   = moment().subtract(1, "months").endOf("month").format("YYYY-MM-DD");
				break;
			case "This Week":
				from = moment().startOf("isoWeek").format("YYYY-MM-DD");
				to   = moment().endOf("isoWeek").format("YYYY-MM-DD");
				break;
			case "This Month":
				from = moment().startOf("month").format("YYYY-MM-DD");
				to   = moment().endOf("month").format("YYYY-MM-DD");
				break;
			default:
				return;
		}

		me._setting_dates = true;
		me.f_from.set_value(from)
			.then(() => me.f_to.set_value(to))
			.then(() => {
				me.f_preset.$input && me.f_preset.$input.val(preset);
				me._setting_dates = false;
			});
	}

	// ─── Page action buttons ────────────────────────────────────────────────

	_setup_actions() {
		var me = this;

		this.page.add_button(__("Home"), function () {
			frappe.set_route("attendance-processor-home");
		}, { icon: "home", btn_class: "btn-default" });

		this.page.set_primary_action(__("Preview Report"), function () {
			me._switch_tab("report");
			me._load_data();
		}, "search");
	}

	// ─── Shell: tab bar + two panels ───────────────────────────────────────

	_render_shell() {
		this.$wrap = $(`
			<div class="ap-hr-wrap" style="padding:0 20px 60px;">

				<!-- ── Tab bar ─────────────────────────────────────────── -->
				<div class="ap-tab-bar"
				     style="display:flex; align-items:flex-end; gap:0;
				            border-bottom:2px solid #e5e7eb;
				            margin-bottom:0; margin-top:4px;">

					<button class="ap-tab ap-tab--report"
					        data-tab="report"
					        style="background:none; border:none; outline:none;
					               padding:10px 22px; font-size:13px; font-weight:600;
					               cursor:pointer; color:#D97706;
					               border-bottom:2px solid #D97706;
					               margin-bottom:-2px;">
						📋 ${__("Attendance Report")}
					</button>

					<button class="ap-tab ap-tab--history"
					        data-tab="history"
					        style="background:none; border:none; outline:none;
					               padding:10px 22px; font-size:13px; font-weight:600;
					               cursor:pointer; color:#9ca3af;
					               border-bottom:2px solid transparent;
					               margin-bottom:-2px;">
						📧 ${__("Send History")}
						<span class="ap-history-badge"
						      style="display:none; background:#D97706; color:#fff;
						             border-radius:10px; font-size:11px; font-weight:700;
						             padding:1px 7px; margin-left:5px;">0</span>
					</button>
				</div>

				<!-- ── Report panel ─────────────────────────────────────── -->
				<div class="ap-panel ap-panel--report" style="padding-top:14px;">

					<div class="ap-emp-tags-wrap"
					     style="display:flex;flex-wrap:wrap;align-items:center;
					            gap:6px;padding:8px 0;
					            border-bottom:1px solid #eee;margin-bottom:12px;
					            min-height:36px;">
					</div>

					<div class="ap-empty-state text-center text-muted"
					     style="padding:80px 0 60px;">
						<div style="font-size:52px;margin-bottom:14px;">&#x1F4CB;</div>
						<p style="font-size:15px;">
							Choose a date range and click
							<strong>Preview Report</strong> to analyse attendance records.
						</p>
					</div>

					<div class="ap-results" style="display:none;"></div>
				</div>

				<!-- ── History panel (hidden by default) ────────────────── -->
				<div class="ap-panel ap-panel--history" style="display:none; padding-top:20px;">

					<div style="display:flex; align-items:center; justify-content:space-between;
					            margin-bottom:16px;">
						<h3 style="margin:0; font-size:15px; font-weight:700;
						           color:#D97706; font-family:Arial,sans-serif;">
							${__("Email Send History")}
						</h3>
						<button class="ap-history-refresh btn btn-xs btn-default">
							&#8635; ${__("Refresh")}
						</button>
					</div>

					<div class="ap-history-body">
						<div style="color:#aaa;font-size:13px;font-style:italic;padding:16px 0;">
							${__("Loading history…")}
						</div>
					</div>
				</div>

			</div>
		`).appendTo($(this.page.main));

		this.$emp_tags_wrap = this.$wrap.find(".ap-emp-tags-wrap");
		this.$history_body  = this.$wrap.find(".ap-history-body");
		this._render_emp_pills();

		// Tab click wiring
		var me = this;
		this.$wrap.find(".ap-tab").on("click", function () {
			me._switch_tab($(this).data("tab"));
		});

		// Refresh button
		this.$wrap.find(".ap-history-refresh").on("click", function () {
			me._load_email_history();
		});
	}

	// ─── Tab switching ──────────────────────────────────────────────────────

	_switch_tab(tab) {
		this._active_tab = tab;

		// Update tab button styles
		this.$wrap.find(".ap-tab").each(function () {
			var isActive = $(this).data("tab") === tab;
			$(this).css({
				"color":          isActive ? "#D97706" : "#9ca3af",
				"border-bottom":  isActive ? "2px solid #D97706" : "2px solid transparent",
			});
		});

		// Show / hide panels
		this.$wrap.find(".ap-panel--report").toggle(tab === "report");
		this.$wrap.find(".ap-panel--history").toggle(tab === "history");

		// Refresh history data when switching to the history tab
		if (tab === "history") {
			this._load_email_history();
		}
	}

	// ─── Data load ─────────────────────────────────────────────────────────

	_load_data() {
		var me   = this;
		var from = this.f_from.get_value();
		var to   = this.f_to.get_value();

		if (!from || !to) {
			frappe.msgprint({
				title:     __("Missing Dates"),
				message:   __("Please select both From Date and To Date."),
				indicator: "orange",
			});
			return;
		}
		if (moment(from).isAfter(moment(to))) {
			frappe.msgprint({
				title:     __("Invalid Range"),
				message:   __("From Date must be on or before To Date."),
				indicator: "red",
			});
			return;
		}

		frappe.call({
			method: "attendance_processor.utils.api.get_attendance_analysis",
			args:   { from_date: from, to_date: to,
			          employees: JSON.stringify(this.selected_employees) },
			freeze: true,
			freeze_message: __("Analysing attendance records…"),
			callback(r) {
				if (r.message !== undefined) {
					me.data          = r.message;
					me.filtered_data = [...me.data];
					me.sort_order    = "issues_desc";
					me._render_results();
				}
			},
		});
	}

	_period_label() {
		var preset = this.f_preset.get_value();
		var from   = this.f_from.get_value();
		var to     = this.f_to.get_value();
		return (preset && preset !== "Custom")
			? `${preset} (${from} to ${to})`
			: `${from} to ${to}`;
	}

	// ─── Results rendering ──────────────────────────────────────────────────

	_render_results() {
		var $placeholder = this.$wrap.find(".ap-empty-state");
		var $results     = this.$wrap.find(".ap-results");

		$placeholder.hide();
		$results.show().empty();

		if (!this.data.length) {
			$results.html(`
				<div class="text-center text-muted" style="padding:60px 0;">
					<div style="font-size:44px;margin-bottom:14px;">&#10003;</div>
					<p style="font-size:15px;">No active employees found for this period.</p>
				</div>
			`);
			return;
		}

		this._render_stats($results);
		this._render_toolbar($results);
		this._render_list($results);
	}

	// ── Summary stat cards ─────────────────────────────────────────────────

	_render_stats($c) {
		var total       = this.data.length;
		var with_issues = this.data.filter(e => e.total_issues > 0).length;

		var counts = {
			missed_attendance_request: 0,
			leave_application:         0,
			short_leave_application:   0,
			two_late_to_half_day:      0,
		};
		this.data.forEach(emp => {
			Object.keys(counts).forEach(k => {
				counts[k] += (emp.issues[k] || []).length;
			});
		});

		const CARDS = [
			{ icon: "👥",  label: "Employees Analysed",    val: total,                            color: "#D97706" },
			{ icon: "⚠️",  label: "Employees with Issues", val: with_issues,                      color: "#DC2626" },
			{ icon: "🕐",  label: "Missed Attendance",     val: counts.missed_attendance_request, color: "#DC2626" },
			{ icon: "📋",  label: "Leave Applications",    val: counts.leave_application,         color: "#EA580C" },
			{ icon: "🌤",  label: "Short Leave",           val: counts.short_leave_application,   color: "#2563EB" },
			{ icon: "⏰",  label: "Two Late → Half Day",   val: counts.two_late_to_half_day,      color: "#7C3AED" },
		];

		var cards_html = CARDS.map(c => `
			<div class="col-xs-6 col-sm-4 col-md-2" style="padding:6px;">
				<div style="border:1px solid #e4e4e4; border-top:3px solid ${c.color};
				            border-radius:6px; text-align:center; padding:14px 8px;
				            background:#fff; height:100%;">
					<div style="font-size:24px;margin-bottom:4px;">${c.icon}</div>
					<div style="font-size:26px; font-weight:700; line-height:1;
					            color:${c.val > 0 ? c.color : "#aaa"};">
						${c.val}
					</div>
					<div style="font-size:11px; color:#777; margin-top:5px; line-height:1.3;">
						${__(c.label)}
					</div>
				</div>
			</div>
		`).join("");

		$c.append(`
			<div style="margin-bottom:24px;">
				<div class="row" style="margin:0 -6px;">${cards_html}</div>
			</div>
		`);
	}

	// ── Toolbar ────────────────────────────────────────────────────────────

	_render_toolbar($c) {
		var me = this;
		var period_label = this._period_label();

		$c.append(`
			<div class="ap-toolbar"
			     style="display:flex; align-items:center; gap:10px;
			            flex-wrap:wrap; margin-bottom:14px;">

				<div style="flex:1; min-width:220px;">
					<input class="ap-search form-control"
					       placeholder="&#128269;  Filter by employee name or ID…"
					       style="max-width:340px; font-size:13px;">
				</div>

				<div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
					<label style="margin:0; font-size:12px; color:#888;">${__("Sort")}:</label>
					<select class="ap-sort form-control"
					        style="font-size:12px; width:auto; height:30px; padding:0 6px;">
						<option value="issues_desc">${__("Issues: High → Low")}</option>
						<option value="issues_asc">${__("Issues: Low → High")}</option>
						<option value="name_asc">${__("Name: A → Z")}</option>
						<option value="name_desc">${__("Name: Z → A")}</option>
					</select>
				</div>

				<div style="flex-shrink:0;">
					<button class="btn btn-xs btn-default ap-expand-all">${__("Expand All")}</button>
					<button class="btn btn-xs btn-default ap-collapse-all"
					        style="margin-left:4px;">${__("Collapse All")}</button>
				</div>

				<div style="flex-shrink:0; margin-left:auto;">
					<span style="font-size:12px; color:#888;">
						${__("Period")}: <strong>${frappe.utils.escape_html(period_label)}</strong>
						&nbsp;|&nbsp;
						Showing <span class="ap-count">${this.filtered_data.length}</span>
						/ ${this.data.length} ${__("employees")}
					</span>
				</div>
			</div>
		`);

		$c.find(".ap-search").on("input", function () {
			var q = $(this).val().toLowerCase().trim();
			me.filtered_data = me.data.filter(e =>
				(e.employee_name || "").toLowerCase().includes(q) ||
				(e.employee_id  || "").toLowerCase().includes(q)
			);
			me._apply_sort();
			me._refresh_list();
			$c.find(".ap-count").text(me.filtered_data.length);
		});

		$c.find(".ap-sort").on("change", function () {
			me.sort_order = $(this).val();
			me._apply_sort();
			me._refresh_list();
		});

		$c.find(".ap-expand-all").on("click", function () {
			$c.find(".ap-emp-body").slideDown(150);
			$c.find(".ap-toggle-icon").text("▾");
		});
		$c.find(".ap-collapse-all").on("click", function () {
			$c.find(".ap-emp-body").slideUp(150);
			$c.find(".ap-toggle-icon").text("▸");
		});
	}

	// ── Employee accordion list ────────────────────────────────────────────

	_render_list($c) {
		this._apply_sort();
		this.$list = $('<div class="ap-emp-list"></div>').appendTo($c);
		this._populate_list();
	}

	_refresh_list() {
		if (!this.$list) return;
		this.$list.empty();
		this._populate_list();
	}

	_populate_list() {
		var me = this;
		this.filtered_data.forEach((emp) => {
			var $card = $(this._build_emp_card(emp));
			me.$list.append($card);
			$card.find(".ap-send-email-btn").on("click", function (e) {
				e.stopPropagation();
				me._send_individual_email(emp.employee_id, emp.employee_name);
			});
		});
		this._wire_accordion(this.$list);
	}

	_apply_sort() {
		var order = this.sort_order;
		this.filtered_data.sort((a, b) => {
			if (order === "issues_desc") return b.total_issues - a.total_issues;
			if (order === "issues_asc")  return a.total_issues - b.total_issues;
			var na = (a.employee_name || "").toLowerCase();
			var nb = (b.employee_name || "").toLowerCase();
			if (order === "name_asc")  return na < nb ? -1 : na > nb ? 1 : 0;
			if (order === "name_desc") return na > nb ? -1 : na < nb ? 1 : 0;
			return 0;
		});
	}

	// ── Employee accordion card ────────────────────────────────────────────

	_build_emp_card(emp) {
		const COLORS = {
			missed_attendance_request: "#DC2626",
			leave_application:         "#EA580C",
			short_leave_application:   "#2563EB",
			two_late_to_half_day:      "#7C3AED",
		};
		const LIGHT_COLORS = {
			missed_attendance_request: "#FEE2E2",
			leave_application:         "#FFEDD5",
			short_leave_application:   "#EFF6FF",
			two_late_to_half_day:      "#EDE9FE",
		};
		const DARK_TEXTS = {
			missed_attendance_request: "#991B1B",
			leave_application:         "#9A3412",
			short_leave_application:   "#1E40AF",
			two_late_to_half_day:      "#5B21B6",
		};
		const LABELS = {
			missed_attendance_request: __("Missed Attendance"),
			leave_application:         __("Leave Application"),
			short_leave_application:   __("Short Leave"),
			two_late_to_half_day:      __("Two Late → Half Day"),
		};

		var has_issues = emp.total_issues > 0;
		var header_bg  = has_issues ? "#fafafa" : "#F0FDF4";

		var badges_html = "";
		if (has_issues) {
			Object.keys(COLORS).forEach(k => {
				var n = (emp.issues[k] || []).length;
				if (!n) return;
				badges_html += `
					<span style="display:inline-block; padding:2px 9px;
					             border-radius:10px; background:${LIGHT_COLORS[k]};
					             color:${DARK_TEXTS[k]}; font-size:11px; margin-left:6px;
					             border:1px solid ${COLORS[k]}; white-space:nowrap;">
						${n} ${LABELS[k]}
					</span>`;
			});
		} else {
			badges_html = `
				<span style="display:inline-block; padding:2px 9px;
				             border-radius:10px; background:#DCFCE7;
				             color:#166534; font-size:11px; margin-left:6px;
				             border:1px solid #16A34A;">
					&#10003; ${__("No Issues")}
				</span>`;
		}

		var tables_html = "";
		if (has_issues) {
			Object.keys(COLORS).forEach(k => {
				var recs = emp.issues[k] || [];
				if (recs.length) {
					tables_html += this._build_issue_table(
						recs, LABELS[k], COLORS[k], LIGHT_COLORS[k], DARK_TEXTS[k]
					);
				}
			});
		} else {
			tables_html = `
				<p style="color:#166534; padding:16px 20px 14px; margin:0; font-size:13px;
				          background:#F0FDF4; border-left:3px solid #16A34A;">
					&#10003; ${__("No uncovered attendance issues found for this period.")}
				</p>`;
		}

		var e_id   = frappe.utils.escape_html(emp.employee_id);
		var e_name = frappe.utils.escape_html(emp.employee_name);

		return `
			<div class="ap-emp-card"
			     style="border:1px solid #DEE2E6; border-radius:6px;
			            margin-bottom:8px; overflow:hidden;">

				<div class="ap-emp-header"
				     style="padding:11px 16px; cursor:pointer; background:${header_bg};
				            display:flex; align-items:center;
				            justify-content:space-between; user-select:none;">

					<div style="display:flex; align-items:center; gap:8px; min-width:0;">
						<span class="ap-toggle-icon"
						      style="font-size:12px; color:#aaa; min-width:12px;">▸</span>

						<button class="ap-send-email-btn btn btn-xs"
						        style="background:#D97706; color:#fff; border:none;
						               border-radius:4px; padding:3px 10px; font-size:11px;
						               font-weight:600; white-space:nowrap; cursor:pointer;
						               flex-shrink:0;"
						        title="${__("Send attendance summary email to this employee")}">
							${__("Send Email")}
						</button>

						<span style="font-weight:600; color:#333; font-size:13px;
						            white-space:nowrap; overflow:hidden;
						            text-overflow:ellipsis;">
							${e_name}
						</span>
						<span style="color:#999; font-size:12px; white-space:nowrap;">
							(${e_id})
						</span>
					</div>

					<div style="flex-shrink:0; text-align:right;">${badges_html}</div>
				</div>

				<div class="ap-emp-body"
				     style="display:none; border-top:1px solid #eee; background:#fff;">
					${tables_html}
					<div style="padding:10px 20px 14px;
					            border-top:1px solid #f0f0f0; background:#fafafa;">
						<a href="/app/employee/${e_id}" target="_blank"
						   style="font-size:12px; color:#2563EB; text-decoration:none; font-weight:500;">
							${__("View Employee Record")} &#8599;
						</a>
					</div>
				</div>
			</div>
		`;
	}

	// ── Single issue-category table ────────────────────────────────────────

	_build_issue_table(records, heading, color, lightBg, darkText) {
		var rows_html = records.map((rec, i) => {
			var bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
			var es = s => frappe.utils.escape_html(String(s || "—"));
			var trim_time = t => t ? String(t).replace(/(\d{2}:\d{2}:\d{2})\.\d+/, "$1") : null;
			var in_t   = es(trim_time(rec.in_time));
			var out_t  = es(trim_time(rec.out_time));
			var att_dt = es(rec.attendance_date);
			var shift  = es(rec.shift);
			var remark = es(rec.custom_remarks);
			var status = es(rec.status || rec.custom_ucsc_status);
			var link   = frappe.utils.escape_html(rec.name || "");

			return `
				<tr style="background:${bg};">
					<td style="padding:6px 10px; border:1px solid #eee;">${att_dt}</td>
					<td style="padding:6px 10px; border:1px solid #eee;">${status}</td>
					<td style="padding:6px 10px; border:1px solid #eee; white-space:nowrap;">${in_t}</td>
					<td style="padding:6px 10px; border:1px solid #eee; white-space:nowrap;">${out_t}</td>
					<td style="padding:6px 10px; border:1px solid #eee;">${shift}</td>
					<td style="padding:6px 10px; border:1px solid #eee;
					           max-width:220px; overflow:hidden;
					           text-overflow:ellipsis; white-space:nowrap;"
					    title="${remark}">${remark}</td>
					<td style="padding:6px 10px; border:1px solid #eee; text-align:center;">
						${link ? `<a href="/app/attendance/${link}" target="_blank"
						             style="font-size:11px; color:#2563EB; font-weight:600;">
						             ${__("Open")} &#8599;</a>` : ""}
					</td>
				</tr>`;
		}).join("");

		return `
			<div style="padding:16px 20px 4px;">
				<h4 style="color:${color}; font-size:12px; font-weight:700; margin:0 0 8px;
				           text-transform:uppercase; letter-spacing:.5px;">
					${frappe.utils.escape_html(heading)}
					<span style="font-weight:400; text-transform:none; font-size:11px; color:#888;">
						&mdash; ${records.length} ${records.length === 1 ? __("record") : __("records")}
					</span>
				</h4>
				<div style="overflow-x:auto; margin-bottom:16px;">
					<table style="width:100%; border-collapse:collapse;
					              font-size:12px; min-width:560px;">
						<thead>
							<tr style="background:${lightBg}; color:${darkText};">
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Date")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Status")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("In Time")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Out Time")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Shift")}</th>
								<th style="padding:7px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Remarks")}</th>
								<th style="padding:7px 10px; text-align:center; border:1px solid rgba(0,0,0,.08);">${__("Action")}</th>
							</tr>
						</thead>
						<tbody>${rows_html}</tbody>
					</table>
				</div>
			</div>
		`;
	}

	// ── Accordion toggle wiring ────────────────────────────────────────────

	_wire_accordion($list) {
		$list.find(".ap-emp-header").on("click", function (e) {
			if ($(e.target).closest(".ap-send-email-btn").length) return;
			var $card   = $(this).closest(".ap-emp-card");
			var $body   = $card.find(".ap-emp-body");
			var $toggle = $card.find(".ap-toggle-icon");
			if ($body.is(":visible")) {
				$body.slideUp(150);
				$toggle.text("▸");
			} else {
				$body.slideDown(200);
				$toggle.text("▾");
			}
		});
	}

	// ─── Individual email send ─────────────────────────────────────────────

	_send_individual_email(employee_id, employee_name) {
		var me   = this;
		var from = this.f_from.get_value();
		var to   = this.f_to.get_value();

		if (!from || !to) {
			frappe.msgprint({
				title:     __("Missing Dates"),
				message:   __("Please select a date range first."),
				indicator: "orange",
			});
			return;
		}

		frappe.confirm(
			__("Send attendance summary email to <strong>{0}</strong> for the period <strong>{1}</strong> to <strong>{2}</strong>?",
				[frappe.utils.escape_html(employee_name),
				 frappe.utils.escape_html(from),
				 frappe.utils.escape_html(to)]),
			function () {
				frappe.call({
					method: "attendance_processor.utils.api.send_hr_individual_email",
					args:   { employee_id, from_date: from, to_date: to },
					freeze: true,
					freeze_message: __("Sending email…"),
					callback(r) {
						if (r.message) {
							var ok = r.message.status === "sent";
							frappe.show_alert({
								message:   r.message.message,
								indicator: ok ? "green" : "red",
							}, 8);
							// Refresh the badge + history data in the background
							me._load_email_history();
						}
					},
				});
			}
		);
	}

	// ─── Send History tab ──────────────────────────────────────────────────

	_load_email_history() {
		var me = this;
		frappe.call({
			method: "attendance_processor.utils.api.get_hr_email_log",
			callback(r) {
				me._render_history(r.message || []);
			},
		});
	}

	_render_history(logs) {
		// Update badge on the tab
		var $badge = this.$wrap.find(".ap-history-badge");
		if (logs.length) {
			$badge.text(logs.length).show();
		} else {
			$badge.hide();
		}

		var $body = this.$history_body;
		$body.empty();

		if (!logs.length) {
			$body.html(`
				<div style="text-align:center; padding:60px 0; color:#aaa;">
					<div style="font-size:44px; margin-bottom:14px;">📭</div>
					<p style="font-size:14px;">${__("No emails have been sent yet.")}</p>
				</div>
			`);
			return;
		}

		var rows_html = logs.map((log, i) => {
			var bg         = i % 2 === 0 ? "#fffbf0" : "#fff";
			var es         = s => frappe.utils.escape_html(String(s || "—"));
			var status_clr = log.status === "sent" ? "#166534" : "#991B1B";
			var status_bg  = log.status === "sent" ? "#DCFCE7"  : "#FEE2E2";
			var status_bdr = log.status === "sent" ? "#16A34A"  : "#DC2626";
			var sent_on    = log.sent_on
				? frappe.datetime.str_to_user(log.sent_on)
				: "—";

			return `
				<tr style="background:${bg};">
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px; font-weight:600;">
						${es(log.employee_name)}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px; color:#666;">
						${es(log.employee)}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px;">
						${es(log.from_date)}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px;">
						${es(log.to_date)}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px;
					           text-align:center; font-weight:600;
					           color:${log.issue_count > 0 ? "#DC2626" : "#aaa"};">
						${log.issue_count}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px; color:#555;">
						${es(log.email_address)}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; text-align:center;">
						<span style="display:inline-block; padding:2px 8px;
						             border-radius:10px; font-size:11px; font-weight:600;
						             background:${status_bg}; color:${status_clr};
						             border:1px solid ${status_bdr};">
							${es(log.status)}
						</span>
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px; color:#666;">
						${es(log.sent_by)}
					</td>
					<td style="padding:8px 10px; border:1px solid #eee; font-size:12px;
					           white-space:nowrap; color:#555;">
						${frappe.utils.escape_html(sent_on)}
					</td>
				</tr>
			`;
		}).join("");

		$body.html(`
			<div style="overflow-x:auto;">
				<table style="width:100%; border-collapse:collapse; font-size:12px; min-width:700px;">
					<thead>
						<tr style="background:#FFFBEB; color:#92400E;">
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Employee Name")}</th>
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Employee ID")}</th>
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("From Date")}</th>
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("To Date")}</th>
							<th style="padding:8px 10px; text-align:center; border:1px solid rgba(0,0,0,.08);">${__("Issues")}</th>
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Email")}</th>
							<th style="padding:8px 10px; text-align:center; border:1px solid rgba(0,0,0,.08);">${__("Status")}</th>
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Sent By")}</th>
							<th style="padding:8px 10px; text-align:left; border:1px solid rgba(0,0,0,.08);">${__("Sent On")}</th>
						</tr>
					</thead>
					<tbody>${rows_html}</tbody>
				</table>
			</div>
			<div style="margin-top:8px; font-size:11px; color:#aaa;">
				${__("Showing the {0} most recent sends.", [logs.length])}
			</div>
		`);
	}
}
