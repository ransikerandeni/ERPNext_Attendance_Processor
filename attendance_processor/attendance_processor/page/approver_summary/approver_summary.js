// ─────────────────────────────────────────────────────────────────────────────
// Approver Summary — Frappe desk page
// ─────────────────────────────────────────────────────────────────────────────

frappe.pages["approver-summary"].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Approver Summary"),
		single_column: true,
	});

	new ApproverSummaryPage(page);
};

// ─────────────────────────────────────────────────────────────────────────────

class ApproverSummaryPage {
	constructor(page) {
		this.page = page;
		this._inject_styles();
		this._setup_filters();
		this._setup_actions();
		this._render_shell();
		// Auto-generate with the default date range on first load
		this._onGenerate();
	}

	// ── Styles ─────────────────────────────────────────────────────────────

	_inject_styles() {
		if (document.getElementById("approver-summary-page-styles")) return;
		const s = document.createElement("style");
		s.id = "approver-summary-page-styles";
		s.textContent = `
			/* ── Spinner ─────────────────────────────────────────────────── */
			.as-spinner-ring {
				display: inline-block;
				width: 40px; height: 40px;
				border: 4px solid #DEE2E6;
				border-top-color: #2563EB;
				border-radius: 50%;
				animation: as-spin 0.75s linear infinite;
				margin-bottom: 0.75rem;
			}
			@keyframes as-spin { to { transform: rotate(360deg); } }

			/* ── Error Message ───────────────────────────────────────────── */
			.as-error-msg {
				background: #fff5f5;
				border: 1px solid #f5c6cb;
				color: #721c24;
				border-radius: 6px;
				padding: 0.85rem 1.1rem;
				margin-bottom: 1rem;
				font-size: 0.9rem;
			}

			/* ── Approver Card ───────────────────────────────────────────── */
			.approver-card {
				background: #F8F9FA;
				border: 1px solid #DEE2E6;
				border-radius: 8px;
				margin-bottom: 1.5rem;
				overflow: hidden;
				box-shadow: 0 1px 4px rgba(0,0,0,0.06);
				transition: box-shadow 0.2s;
			}
			.approver-card:hover {
				box-shadow: 0 3px 10px rgba(37, 99, 235, 0.10);
			}
			.approver-card-header {
				background: #EFF6FF;
				color: #1E40AF;
				border-bottom: 1px solid #BFDBFE;
				padding: 0.9rem 1.5rem;
				display: flex;
				justify-content: space-between;
				align-items: center;
			}
			.approver-card-header h3 {
				margin: 0;
				font-size: 1.05rem;
				font-weight: 700;
				color: #1E40AF;
			}
			.pending-badge {
				background: #BFDBFE;
				border: 1px solid #2563EB;
				color: #1E40AF;
				border-radius: 20px;
				padding: 0.2rem 0.75rem;
				font-size: 0.82rem;
				font-weight: 700;
				white-space: nowrap;
			}
			.approver-card-body { padding: 1.25rem 1.5rem; }

			/* ── Overall Summary Chips ───────────────────────────────────── */
			.as-overall-summary {
				display: flex;
				gap: 0.75rem;
				flex-wrap: wrap;
				margin-bottom: 1.25rem;
			}
			.as-summary-chip {
				border-radius: 6px;
				padding: 0.5rem 1rem;
				font-size: 0.85rem;
				font-weight: 600;
				display: flex;
				align-items: center;
				gap: 0.5rem;
				transition: filter 0.15s;
			}
			.as-summary-chip:hover { filter: brightness(0.95); }
			.as-summary-chip .chip-count { font-size: 1.15rem; font-weight: 800; line-height: 1; }
			.chip-missed   { background: #FEE2E2; color: #991B1B; border: 1px solid #DC2626; }
			.chip-leave    { background: #FFEDD5; color: #9A3412; border: 1px solid #EA580C; }
			.chip-short    { background: #EFF6FF; color: #1E40AF; border: 1px solid #2563EB; }
			.chip-two-late { background: #EDE9FE; color: #5B21B6; border: 1px solid #7C3AED; }

			/* ── Detail Sections ─────────────────────────────────────────── */
			.detail-section {
				border-radius: 6px;
				margin-bottom: 0.85rem;
				overflow: hidden;
				border: 1px solid #DEE2E6;
			}
			.detail-section-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 0.65rem 1rem;
				cursor: pointer;
				user-select: none;
				font-weight: 600;
				font-size: 0.88rem;
				transition: filter 0.15s;
			}
			.detail-section-header:hover { filter: brightness(0.95); }
			.detail-section-header .toggle-icon { transition: transform 0.2s; font-size: 0.75rem; }
			.detail-section-header.collapsed .toggle-icon { transform: rotate(-90deg); }
			.missed-section   .detail-section-header { background: #FEE2E2; color: #991B1B; }
			.leave-section    .detail-section-header { background: #FFEDD5; color: #9A3412; }
			.short-section    .detail-section-header { background: #EFF6FF; color: #1E40AF; }
			.two-late-section .detail-section-header { background: #EDE9FE; color: #5B21B6; }
			.detail-section-body { overflow-x: auto; background: #fff; }
			.detail-section-body.hidden { display: none; }

			/* ── Data Table ──────────────────────────────────────────────── */
			.as-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
			.as-table th {
				background: #F1F3F5;
				color: #495057;
				font-weight: 700;
				text-align: left;
				padding: 0.5rem 0.75rem;
				border-bottom: 2px solid #DEE2E6;
				white-space: nowrap;
			}
			.as-table td {
				padding: 0.45rem 0.75rem;
				border-bottom: 1px solid #F1F3F5;
				color: #212529;
				vertical-align: middle;
			}
			.as-table tr:last-child td { border-bottom: none; }
			.as-table tr:hover td { background: #f8f9fa; }
			.as-table a {
				color: #2563EB;
				text-decoration: none;
				font-weight: 600;
				font-family: monospace;
				font-size: 0.8rem;
			}
			.as-table a:hover { text-decoration: underline; }

			/* ── No-Records ──────────────────────────────────────────────── */
			.as-no-records {
				text-align: center;
				padding: 3rem 1rem;
				color: #6c757d;
				font-size: 1rem;
			}
			.as-no-records .no-records-icon {
				font-size: 2.5rem;
				display: block;
				margin-bottom: 0.75rem;
			}
		`;
		document.head.appendChild(s);
	}

	// ── Filter bar (Frappe page fields) ────────────────────────────────────

	_setup_filters() {
		this.f_from = this.page.add_field({
			label: __("From Date"),
			fieldname: "from_date",
			fieldtype: "Date",
		});

		this.f_to = this.page.add_field({
			label: __("To Date"),
			fieldname: "to_date",
			fieldtype: "Date",
		});

		// Default: first day of current month → today
		this.f_from.set_value(moment().startOf("month").format("YYYY-MM-DD"));
		this.f_to.set_value(frappe.datetime.get_today());
	}

	// ── Primary action ─────────────────────────────────────────────────────

	_setup_actions() {
		this.page.set_primary_action(__("Generate Summary"), () => this._onGenerate(), "refresh");
	}

	// ── Static shell injected into page.main ───────────────────────────────

	_render_shell() {
		this.$wrap = $(`
			<div style="padding: 1rem 1.5rem 3rem;">
				<div class="as-error-msg" id="as-page-error-msg" style="display:none;"></div>
				<div id="as-page-spinner"
				     style="display:none;text-align:center;padding:3rem 0;
				            color:#6c757d;font-size:0.95rem;">
					<div><div class="as-spinner-ring"></div></div>
					<div>${__("Loading summary\u2026")}</div>
				</div>
				<div id="as-page-results"></div>
			</div>
		`).appendTo($(this.page.main));

		this.resultsEl  = document.getElementById("as-page-results");
		this.spinnerEl  = document.getElementById("as-page-spinner");
		this.errorMsgEl = document.getElementById("as-page-error-msg");
	}

	// ── Generate ───────────────────────────────────────────────────────────

	_onGenerate() {
		const fromDate = this.f_from.get_value();
		const toDate   = this.f_to.get_value();

		if (!fromDate || !toDate) {
			frappe.msgprint({
				title:     __("Missing Dates"),
				message:   __("Please select both From Date and To Date."),
				indicator: "orange",
			});
			return;
		}
		if (fromDate > toDate) {
			frappe.msgprint({
				title:     __("Invalid Range"),
				message:   __("From Date must be on or before To Date."),
				indicator: "red",
			});
			return;
		}

		this._clearError();
		this._setLoading(true);
		this.resultsEl.innerHTML = "";

		frappe.call({
			method: "attendance_processor.www.approver_summary.get_approver_summary",
			args:   { from_date: fromDate, to_date: toDate },
			callback: (r) => {
				this._setLoading(false);
				if (r && r.message) {
					this._renderResults(r.message);
				} else {
					this._renderNoRecords();
				}
			},
			error: () => {
				this._setLoading(false);
				this._showError(__("An error occurred while loading the summary."));
			},
		});
	}

	// ── UI state helpers ───────────────────────────────────────────────────

	_setLoading(on) {
		this.spinnerEl.style.display = on ? "block" : "none";
	}

	_showError(msg) {
		this.errorMsgEl.textContent = msg;
		this.errorMsgEl.style.display = "block";
	}

	_clearError() {
		this.errorMsgEl.textContent = "";
		this.errorMsgEl.style.display = "none";
	}

	// ── Rendering ──────────────────────────────────────────────────────────

	_renderNoRecords() {
		this.resultsEl.innerHTML =
			'<div class="as-no-records">' +
			'<span class="no-records-icon">\uD83D\uDCCB</span>' +
			__("No pending applications found for the selected date range.") +
			"</div>";
	}

	_renderResults(approverData) {
		if (!approverData || Object.keys(approverData).length === 0) {
			this._renderNoRecords();
			return;
		}

		// Build array with totals for sorting
		const entries = Object.keys(approverData).map((key) => {
			const data  = approverData[key];
			const total =
				(data.missed_attendance_requests || []).length +
				(data.leave_applications || []).length +
				(data.short_leave_applications || []).length +
				(data.two_late_applications || []).length;
			return { key, data, total };
		});

		// Sort descending by total pending count
		entries.sort((a, b) => b.total - a.total);

		let html = "";
		entries.forEach((entry) => { html += this._buildApproverCard(entry.data, entry.total); });
		this.resultsEl.innerHTML = html;

		// Attach collapsible toggle listeners
		this.resultsEl.querySelectorAll(".detail-section-header").forEach((header) => {
			header.addEventListener("click", () => {
				const body        = header.nextElementSibling;
				const isCollapsed = body.classList.contains("hidden");
				if (isCollapsed) {
					body.classList.remove("hidden");
					header.classList.remove("collapsed");
				} else {
					body.classList.add("hidden");
					header.classList.add("collapsed");
				}
			});
		});
	}

	_buildApproverCard(data, total) {
		const missedCount  = (data.missed_attendance_requests || []).length;
		const leaveCount   = (data.leave_applications || []).length;
		const shortCount   = (data.short_leave_applications || []).length;
		const twoLateCount = (data.two_late_applications || []).length;

		let html =
			'<div class="approver-card">' +
			'<div class="approver-card-header">' +
			"<h3>" + this._esc(data.approver_name) + "</h3>" +
			'<span class="pending-badge">' + total + " pending</span>" +
			"</div>" +
			'<div class="approver-card-body">';

		// Summary chips
		html += '<div class="as-overall-summary">';
		if (missedCount)   html += this._chip("chip-missed",   missedCount,  __("Missed Attendance"));
		if (leaveCount)    html += this._chip("chip-leave",    leaveCount,   __("Leave Applications"));
		if (shortCount)    html += this._chip("chip-short",    shortCount,   __("Short Leave"));
		if (twoLateCount)  html += this._chip("chip-two-late", twoLateCount, __("Two Late \u2192 Half Day"));
		html += "</div>";

		// Detail sections
		if (missedCount)   html += this._buildSection("missed-section",   __("Missed Attendance Requests"),          missedCount,   this._buildMissedTable(data.missed_attendance_requests));
		if (leaveCount)    html += this._buildSection("leave-section",    __("Leave Applications"),                  leaveCount,    this._buildLeaveTable(data.leave_applications));
		if (shortCount)    html += this._buildSection("short-section",    __("Short Leave Applications"),            shortCount,    this._buildShortTable(data.short_leave_applications));
		if (twoLateCount)  html += this._buildSection("two-late-section", __("Two Late Attendance \u2192 One Half Day"), twoLateCount, this._buildTwoLateTable(data.two_late_applications));

		html += "</div></div>";
		return html;
	}

	_chip(cls, count, label) {
		return (
			'<div class="as-summary-chip ' + cls + '">' +
			'<span class="chip-count">' + count + "</span>" +
			"<span>" + this._esc(label) + "</span>" +
			"</div>"
		);
	}

	_buildSection(sectionClass, title, count, tableHtml) {
		return (
			'<div class="detail-section ' + sectionClass + '">' +
			'<div class="detail-section-header">' +
			"<span>" + this._esc(title) + " (" + count + ")</span>" +
			'<span class="toggle-icon">\u25BC</span>' +
			"</div>" +
			'<div class="detail-section-body">' + tableHtml + "</div>" +
			"</div>"
		);
	}

	// ── Table builders ─────────────────────────────────────────────────────

	_tableWrap(headCells, rows) {
		const th = headCells.map((c) => "<th>" + this._esc(c) + "</th>").join("");
		return (
			'<table class="as-table"><thead><tr>' + th + "</tr></thead>" +
			"<tbody>" + rows.join("") + "</tbody></table>"
		);
	}

	_buildMissedTable(records) {
		const rows = records.map((r) =>
			"<tr>" +
			"<td>" + this._esc(r.employee) + "</td>" +
			"<td>" + this._esc(r.employee_name) + "</td>" +
			"<td>" + this._esc(r.department) + "</td>" +
			"<td>" + this._esc(r.attendance_date) + "</td>" +
			"<td>" + this._esc(r.status) + "</td>" +
			"<td>" + this._deskLink("Missed Attendance Request", r.name) + "</td>" +
			"</tr>"
		);
		return this._tableWrap(
			[__("Employee ID"), __("Employee Name"), __("Department"), __("Attendance Date"), __("Status"), __("ID")],
			rows
		);
	}

	_buildLeaveTable(records) {
		const rows = records.map((r) =>
			"<tr>" +
			"<td>" + this._esc(r.employee) + "</td>" +
			"<td>" + this._esc(r.employee_name) + "</td>" +
			"<td>" + this._esc(r.department) + "</td>" +
			"<td>" + this._esc(r.from_date) + "</td>" +
			"<td>" + this._esc(r.to_date) + "</td>" +
			"<td>" + this._esc(r.total_leave_days) + "</td>" +
			"<td>" + this._esc(r.status) + "</td>" +
			"<td>" + this._esc(r.leave_type) + "</td>" +
			"<td>" + this._deskLink("Leave Application", r.name) + "</td>" +
			"</tr>"
		);
		return this._tableWrap(
			[__("Employee ID"), __("Employee Name"), __("Department"), __("From Date"), __("To Date"),
			 __("Total Days"), __("Status"), __("Leave Type"), __("ID")],
			rows
		);
	}

	_buildShortTable(records) {
		const rows = records.map((r) =>
			"<tr>" +
			"<td>" + this._esc(r.employee) + "</td>" +
			"<td>" + this._esc(r.employee_name) + "</td>" +
			"<td>" + this._esc(r.department) + "</td>" +
			"<td>" + this._esc(r.attendance_date) + "</td>" +
			"<td>" + this._esc(r.status) + "</td>" +
			"<td>" + this._deskLink("Short Leave Application", r.name) + "</td>" +
			"</tr>"
		);
		return this._tableWrap(
			[__("Employee ID"), __("Employee Name"), __("Department"), __("Attendance Date"), __("Status"), __("ID")],
			rows
		);
	}

	_buildTwoLateTable(records) {
		const rows = records.map((r) =>
			"<tr>" +
			"<td>" + this._esc(r.employee) + "</td>" +
			"<td>" + this._esc(r.employee_name) + "</td>" +
			"<td>" + this._esc(r.department) + "</td>" +
			"<td>" + this._esc(r.attendance_date) + "</td>" +
			"<td>" + this._esc(r.second_attendance_date) + "</td>" +
			"<td>" + this._esc(r.status) + "</td>" +
			"<td>" + this._deskLink("Two Late Attendance To One Half Day", r.name) + "</td>" +
			"</tr>"
		);
		return this._tableWrap(
			[__("Employee ID"), __("Employee Name"), __("Department"), __("First Date"), __("Second Date"), __("Status"), __("ID")],
			rows
		);
	}

	// ── Utilities ──────────────────────────────────────────────────────────

	_esc(str) {
		if (str === null || str === undefined) return "";
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}

	_deskLink(doctype, docname) {
		const slug = doctype.toLowerCase().replace(/\s+/g, "-");
		const href = "/app/" + slug + "/" + encodeURIComponent(docname);
		return '<a href="' + href + '" target="_blank">' + this._esc(docname) + "</a>";
	}
}
