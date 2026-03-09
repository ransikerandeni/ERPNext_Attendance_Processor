/* ─────────────────────────────────────────────────────────────────────────
   Approver Summary – client-side controller
   Served from: /assets/attendance_processor/js/approver_summary.js
───────────────────────────────────────────────────────────────────────── */

(function () {
    "use strict";

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Return today as YYYY-MM-DD */
    function todayISO() {
        var d = new Date();
        return d.toISOString().slice(0, 10);
    }

    /** Return the first day of the current month as YYYY-MM-DD */
    function firstOfMonthISO() {
        var d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    }

    /** Escape HTML special characters to prevent XSS */
    function esc(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    /** Convert a DocType name to its URL slug (lowercase, hyphens) */
    function doctypeSlug(name) {
        return name.toLowerCase().replace(/\s+/g, "-");
    }

    /** Build a clickable ERPNext desk link for a document */
    function deskLink(doctype, docname) {
        var slug = doctypeSlug(doctype);
        var href = "/app/" + slug + "/" + encodeURIComponent(docname);
        return '<a href="' + href + '" target="_blank">' + esc(docname) + "</a>";
    }

    // ── DOM refs ──────────────────────────────────────────────────────────

    var fromDateEl   = document.getElementById("from-date");
    var toDateEl     = document.getElementById("to-date");
    var generateBtn  = document.getElementById("generate-btn");
    var spinnerEl    = document.getElementById("loading-spinner");
    var resultsEl    = document.getElementById("summary-results");
    var errorMsgEl   = document.getElementById("error-msg");

    // ── Initialise defaults ───────────────────────────────────────────────

    function init() {
        if (fromDateEl) fromDateEl.value = firstOfMonthISO();
        if (toDateEl)   toDateEl.value   = todayISO();
        if (generateBtn) generateBtn.addEventListener("click", onGenerate);

        // Allow pressing Enter in either date field
        [fromDateEl, toDateEl].forEach(function (el) {
            if (el) el.addEventListener("keydown", function (e) {
                if (e.key === "Enter") onGenerate();
            });
        });
    }

    // ── Generate Summary ──────────────────────────────────────────────────

    function onGenerate() {
        var fromDate = fromDateEl ? fromDateEl.value : "";
        var toDate   = toDateEl   ? toDateEl.value   : "";

        // Validation
        if (!fromDate || !toDate) {
            showError("Please select both From Date and To Date.");
            return;
        }
        if (fromDate > toDate) {
            showError("From Date must be on or before To Date.");
            return;
        }

        clearError();
        setLoading(true);
        resultsEl.innerHTML = "";

        frappe.call({
            method: "attendance_processor.www.approver_summary.get_approver_summary",
            args: { from_date: fromDate, to_date: toDate },
            callback: function (r) {
                setLoading(false);
                if (r && r.message) {
                    renderResults(r.message);
                } else {
                    renderNoRecords();
                }
            },
            error: function (r) {
                setLoading(false);
                var msg = (r && r.message) ? r.message : "An error occurred while loading the summary.";
                showError(msg);
            },
        });
    }

    // ── UI state helpers ──────────────────────────────────────────────────

    function setLoading(on) {
        spinnerEl.style.display = on ? "block" : "none";
        generateBtn.disabled = on;
    }

    function showError(msg) {
        errorMsgEl.textContent = msg;
        errorMsgEl.style.display = "block";
    }

    function clearError() {
        errorMsgEl.textContent = "";
        errorMsgEl.style.display = "none";
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    function renderNoRecords() {
        resultsEl.innerHTML =
            '<div class="as-no-records">' +
            '<span class="no-records-icon">📋</span>' +
            "No pending applications found for the selected date range." +
            "</div>";
    }

    /**
     * Main renderer — sorts approvers by total pending count and injects cards.
     * @param {Object} approverData  dict from API
     */
    function renderResults(approverData) {
        if (!approverData || Object.keys(approverData).length === 0) {
            renderNoRecords();
            return;
        }

        // Build array with totals for sorting
        var entries = Object.keys(approverData).map(function (key) {
            var data = approverData[key];
            var total =
                (data.missed_attendance_requests || []).length +
                (data.leave_applications || []).length +
                (data.short_leave_applications || []).length +
                (data.two_late_applications || []).length;
            return { key: key, data: data, total: total };
        });

        // Sort descending by total
        entries.sort(function (a, b) { return b.total - a.total; });

        var html = "";
        entries.forEach(function (entry) {
            html += buildApproverCard(entry.data, entry.total);
        });

        resultsEl.innerHTML = html;

        // Attach collapsible toggle listeners after injection
        resultsEl.querySelectorAll(".detail-section-header").forEach(function (header) {
            header.addEventListener("click", function () {
                var body = header.nextElementSibling;
                var isCollapsed = body.classList.contains("hidden");
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

    /** Build HTML for a single approver card */
    function buildApproverCard(data, total) {
        var missedCount   = (data.missed_attendance_requests || []).length;
        var leaveCount    = (data.leave_applications || []).length;
        var shortCount    = (data.short_leave_applications || []).length;
        var twoLateCount  = (data.two_late_applications || []).length;

        var html =
            '<div class="approver-card">' +
            '<div class="approver-card-header">' +
            '<h3>' + esc(data.approver_name) + "</h3>" +
            '<span class="pending-badge">' + total + " pending</span>" +
            "</div>" +
            '<div class="approver-card-body">';

        // ── Overall summary chips ─────────────────────────────────────────
        html += '<div class="as-overall-summary">';
        if (missedCount)  html += chip("chip-missed",   missedCount,  "Missed Attendance");
        if (leaveCount)   html += chip("chip-leave",    leaveCount,   "Leave Applications");
        if (shortCount)   html += chip("chip-short",    shortCount,   "Short Leave");
        if (twoLateCount) html += chip("chip-two-late", twoLateCount, "Two Late → Half Day");
        html += "</div>";

        // ── Detail sections ───────────────────────────────────────────────
        if (missedCount) {
            html += buildSection(
                "missed-section",
                "Missed Attendance Requests",
                missedCount,
                buildMissedTable(data.missed_attendance_requests)
            );
        }
        if (leaveCount) {
            html += buildSection(
                "leave-section",
                "Leave Applications",
                leaveCount,
                buildLeaveTable(data.leave_applications)
            );
        }
        if (shortCount) {
            html += buildSection(
                "short-section",
                "Short Leave Applications",
                shortCount,
                buildShortTable(data.short_leave_applications)
            );
        }
        if (twoLateCount) {
            html += buildSection(
                "two-late-section",
                "Two Late Attendance → One Half Day",
                twoLateCount,
                buildTwoLateTable(data.two_late_applications)
            );
        }

        html += "</div></div>"; // approver-card-body / approver-card
        return html;
    }

    function chip(cls, count, label) {
        return (
            '<div class="as-summary-chip ' + cls + '">' +
            '<span class="chip-count">' + count + "</span>" +
            "<span>" + esc(label) + "</span>" +
            "</div>"
        );
    }

    function buildSection(sectionClass, title, count, tableHtml) {
        return (
            '<div class="detail-section ' + sectionClass + '">' +
            '<div class="detail-section-header">' +
            "<span>" + esc(title) + " (" + count + ")</span>" +
            '<span class="toggle-icon">▼</span>' +
            "</div>" +
            '<div class="detail-section-body">' + tableHtml + "</div>" +
            "</div>"
        );
    }

    // ── Table builders ────────────────────────────────────────────────────

    function tableWrap(headCells, rows) {
        var th = headCells.map(function (c) {
            return "<th>" + esc(c) + "</th>";
        }).join("");
        return (
            '<table class="as-table"><thead><tr>' + th + "</tr></thead>" +
            "<tbody>" + rows.join("") + "</tbody></table>"
        );
    }

    function buildMissedTable(records) {
        var rows = records.map(function (r) {
            return (
                "<tr>" +
                "<td>" + esc(r.employee) + "</td>" +
                "<td>" + esc(r.employee_name) + "</td>" +
                "<td>" + esc(r.department) + "</td>" +
                "<td>" + esc(r.attendance_date) + "</td>" +
                "<td>" + esc(r.status) + "</td>" +
                "<td>" + deskLink("Missed Attendance Request", r.name) + "</td>" +
                "</tr>"
            );
        });
        return tableWrap(
            ["Employee ID", "Employee Name", "Department", "Attendance Date", "Status", "ID"],
            rows
        );
    }

    function buildLeaveTable(records) {
        var rows = records.map(function (r) {
            return (
                "<tr>" +
                "<td>" + esc(r.employee) + "</td>" +
                "<td>" + esc(r.employee_name) + "</td>" +
                "<td>" + esc(r.department) + "</td>" +
                "<td>" + esc(r.from_date) + "</td>" +
                "<td>" + esc(r.to_date) + "</td>" +
                "<td>" + esc(r.total_leave_days) + "</td>" +
                "<td>" + esc(r.status) + "</td>" +
                "<td>" + esc(r.leave_type) + "</td>" +
                "<td>" + deskLink("Leave Application", r.name) + "</td>" +
                "</tr>"
            );
        });
        return tableWrap(
            ["Employee ID", "Employee Name", "Department", "From Date", "To Date",
             "Total Days", "Status", "Leave Type", "ID"],
            rows
        );
    }

    function buildShortTable(records) {
        var rows = records.map(function (r) {
            return (
                "<tr>" +
                "<td>" + esc(r.employee) + "</td>" +
                "<td>" + esc(r.employee_name) + "</td>" +
                "<td>" + esc(r.department) + "</td>" +
                "<td>" + esc(r.attendance_date) + "</td>" +
                "<td>" + esc(r.status) + "</td>" +
                "<td>" + deskLink("Short Leave Application", r.name) + "</td>" +
                "</tr>"
            );
        });
        return tableWrap(
            ["Employee ID", "Employee Name", "Department", "Attendance Date", "Status", "ID"],
            rows
        );
    }

    function buildTwoLateTable(records) {
        var rows = records.map(function (r) {
            return (
                "<tr>" +
                "<td>" + esc(r.employee) + "</td>" +
                "<td>" + esc(r.employee_name) + "</td>" +
                "<td>" + esc(r.department) + "</td>" +
                "<td>" + esc(r.attendance_date) + "</td>" +
                "<td>" + esc(r.second_attendance_date) + "</td>" +
                "<td>" + esc(r.status) + "</td>" +
                "<td>" + deskLink("Two Late Attendance To One Half Day", r.name) + "</td>" +
                "</tr>"
            );
        });
        return tableWrap(
            ["Employee ID", "Employee Name", "Department", "First Date", "Second Date", "Status", "ID"],
            rows
        );
    }

    // ── Boot ──────────────────────────────────────────────────────────────

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}());
