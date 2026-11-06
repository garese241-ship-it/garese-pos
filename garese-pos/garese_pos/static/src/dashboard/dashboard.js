/** @odoo-module */

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { Component, onMounted, onPatched, onWillStart, onWillUnmount, useRef, useState } from "@odoo/owl";

const REFRESH_MS = 30000;
const PERIOD_LABELS = () => [
    { id: "today", label: _t("Today"), versus: _t("vs yesterday") },
    { id: "yesterday", label: _t("Yesterday"), versus: _t("vs the day before") },
    { id: "7d", label: _t("Last 7 days"), versus: _t("vs the previous 7 days") },
    { id: "30d", label: _t("Last 30 days"), versus: _t("vs the previous 30 days") },
];
// same palette as the colors of the payment methods in the Point of Sale
const SOLID = {
    blue: "#2f7de1",
    green: "#2e9e5b",
    orange: "#f08a24",
    red: "#e23d3d",
    purple: "#7c5ce0",
    teal: "#17a398",
    pink: "#e0559b",
    yellow: "#e5b300",
    grey: "#6b7190",
};
const FALLBACK = ["green", "blue", "yellow", "purple", "grey", "teal"];

export class GpDashboard extends Component {
    static template = "garese_pos.Dashboard";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.lineRef = useRef("line");
        this.donutRef = useRef("donut");
        this.state = useState({
            loading: true,
            data: null,
            period: "today",
            configId: 0,
            paused: false,
            clock: this.clockText(),
        });
        this.periods = PERIOD_LABELS();
        onWillStart(async () => {
            await this.load();
            // Chart.js ships with Odoo; the page works without it (no curve)
            try {
                await loadJS("/web/static/lib/Chart/Chart.js");
            } catch {
                /* tables stay readable */
            }
        });
        onMounted(() => {
            this.drawCharts();
            this.timer = setInterval(() => {
                this.state.clock = this.clockText();
                if (!this.state.paused && !document.hidden) {
                    this.load();
                }
            }, REFRESH_MS);
        });
        onPatched(() => this.drawCharts());
        onWillUnmount(() => {
            clearInterval(this.timer);
            this.destroyCharts();
        });
    }

    // ------------------------------------------------------------------
    // Data
    // ------------------------------------------------------------------
    async load() {
        try {
            this.state.data = await this.orm.call("garese.pos.dashboard", "get_data", [], {
                config_id: this.state.configId || false,
                period: this.state.period,
            });
        } finally {
            this.state.loading = false;
            this.state.clock = this.clockText();
        }
    }
    clockText() {
        const now = luxon.DateTime.now();
        return {
            date: now.toLocaleString({ weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
            time: now.toLocaleString(luxon.DateTime.TIME_24_SIMPLE),
        };
    }
    async onChangeConfig(ev) {
        this.state.configId = parseInt(ev.target.value) || 0;
        await this.load();
    }
    async onChangePeriod(period) {
        this.state.period = period;
        await this.load();
    }
    togglePause() {
        this.state.paused = !this.state.paused;
        if (!this.state.paused) {
            this.load();
        }
    }

    // ------------------------------------------------------------------
    // Formatting
    // ------------------------------------------------------------------
    money(amount) {
        return formatCurrency(amount || 0, this.state.data.currency_id);
    }
    number(value) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value || 0);
    }
    get pauseLabel() {
        return this.state.paused ? _t("Resume live updates") : _t("Pause live updates");
    }
    get versus() {
        return this.periods.find((p) => p.id === this.state.period).versus;
    }
    /** KPI cards: label, value, variation against the previous period */
    get kpis() {
        const { current, previous } = this.state.data.kpis;
        const make = (key, label, icon, tone, value, prevValue) => {
            let delta = null;
            if (prevValue) {
                delta = ((current[key] - previous[key]) / Math.abs(previous[key])) * 100;
            }
            return {
                key,
                label,
                icon,
                tone,
                value,
                delta,
                deltaText: delta === null ? "" : `${delta >= 0 ? "+" : ""}${Math.round(delta)}%`,
                up: delta !== null && delta >= 0,
                previous: prevValue,
            };
        };
        return [
            make("turnover", _t("Turnover"), "fa-bank", "blue", this.money(current.turnover), this.money(previous.turnover)),
            make("tickets", _t("Number of tickets"), "fa-shopping-cart", "green", this.number(current.tickets), this.number(previous.tickets)),
            make("average", _t("Average basket"), "fa-circle-o", "yellow", this.money(current.average), this.money(previous.average)),
            make("clients", _t("Customers served"), "fa-users", "purple", this.number(current.clients), this.number(previous.clients)),
        ].map((kpi) => ({ ...kpi, hasPrevious: previous[kpi.key] !== 0 }));
    }
    paymentColor(method, index) {
        return SOLID[method.color] || SOLID[FALLBACK[index % FALLBACK.length]];
    }
    productImage(product) {
        return `/web/image/product.product/${product.id}/image_128`;
    }
    userImage(register) {
        return `/web/image/res.users/${register.user_id}/avatar_128`;
    }
    categoryBar(share) {
        return `width: ${Math.max(share, 2)}%`;
    }
    shortRef(reference) {
        return reference || "";
    }

    // ------------------------------------------------------------------
    // Registers: the same details and buttons as the standard dashboard
    // ------------------------------------------------------------------
    registerBadges(register) {
        const badges = [];
        if (!register.current_session_id && register.pos_session_username) {
            badges.push({ tone: "info", text: _t("Opened by %s", register.pos_session_username) });
        }
        if (register.pos_session_state === "opening_control") {
            badges.push({ tone: "info", text: _t("Opening Control") });
        }
        if (register.pos_session_state === "closing_control") {
            badges.push({ tone: "info", text: _t("Closing Control") });
        }
        if (register.pos_session_state === "opened" && register.pos_session_duration > 1) {
            badges.push({
                tone: register.pos_session_duration > 3 ? "danger" : "warning",
                text: _t("To Close"),
                title: _t("The session has been opened for an unusually long period. Please consider closing."),
            });
        }
        return badges;
    }
    registerButton(register) {
        if (register.current_session_state === "closing_control") {
            return { label: _t("Close"), method: "open_existing_session_cb", secondary: true };
        }
        if (register.current_session_state === "opened") {
            return { label: _t("Continue Selling"), method: "open_ui" };
        }
        if (!register.current_session_id && !register.pos_session_username) {
            return { label: _t("New Session"), method: "open_ui" };
        }
        if (register.current_session_state === "opening_control") {
            return { label: _t("Open Session"), method: "open_ui" };
        }
        return null;
    }
    registerStatus(register) {
        if (register.pos_session_state === "opened") {
            return { tone: "on", text: _t("Session open") };
        }
        if (register.pos_session_state === "opening_control" || register.pos_session_state === "closing_control") {
            return { tone: "wait", text: _t("In progress") };
        }
        return { tone: "off", text: _t("Session closed") };
    }
    async callRegister(register, method) {
        const result = await this.orm.call("pos.config", method, [[register.id]]);
        if (result) {
            // some server methods return an action without "views": complete it
            if (result.type === "ir.actions.act_window" && !result.views) {
                result.views = (result.view_mode || "form").split(",").map((mode) => [false, mode.trim()]);
            }
            await this.action.doAction(result);
        }
    }
    async openList(register, xmlid) {
        const action = await this.orm.call("garese.pos.dashboard", "get_action", [xmlid, register.id]);
        await this.action.doAction(action);
    }
    openOrders(register) {
        return this.openList(register, "point_of_sale.action_pos_order_filtered");
    }
    openSessions(register) {
        return this.openList(register, "point_of_sale.action_pos_session_filtered");
    }
    openReport(register) {
        return this.openList(register, "point_of_sale.action_report_pos_order_all_filtered");
    }
    editRegister(register) {
        return this.callRegister(register, "action_pos_config_modal_edit");
    }
    openRescue(register) {
        return this.callRegister(register, "open_opened_rescue_session_form");
    }
    openTransaction(transaction) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "pos.order",
            res_id: transaction.id,
            views: [[false, "form"]],
        });
    }

    // ------------------------------------------------------------------
    // Activity feed
    // ------------------------------------------------------------------
    activityText(event) {
        const via = (event.payments || []).length ? ` (${event.payments.join(", ")})` : "";
        switch (event.type) {
            case "sale":
                return _t("Sale %s%s - %s", this.money(event.amount), via, event.register);
            case "refund":
                return _t("Refund %s%s - %s", this.money(event.amount), via, event.register);
            case "open":
                return _t("Cash desk opened - %s", event.register);
            default:
                return _t("Cash desk closed - %s", event.register);
        }
    }
    activityIcon(event) {
        return {
            sale: "fa-shopping-cart",
            refund: "fa-undo",
            open: "fa-unlock",
            close: "fa-lock",
        }[event.type];
    }

    // ------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------
    destroyCharts() {
        for (const chart of [this.lineChart, this.donutChart]) {
            chart?.destroy();
        }
        this.lineChart = this.donutChart = null;
    }
    drawCharts() {
        const data = this.state.data;
        if (!data?.is_manager || typeof Chart === "undefined") {
            return;
        }
        this.drawLine(data);
        this.drawDonut(data);
    }
    cumulate(values) {
        let total = 0;
        return values.map((v) => (total += v));
    }
    drawLine(data) {
        const canvas = this.lineRef.el;
        if (!canvas) {
            return;
        }
        const { labels, current, previous, cumulative } = data.chart;
        let cur = current;
        let prev = previous;
        if (cumulative) {
            cur = this.cumulate(current);
            prev = this.cumulate(previous);
        }
        // hours without any sale at the ends of the day are not worth the space
        let first = 0;
        let last = labels.length - 1;
        if (cumulative) {
            const active = labels.map((_l, i) => (current[i] || 0) !== 0 || (previous[i] || 0) !== 0);
            first = Math.max(0, active.indexOf(true) - 1);
            last = Math.min(labels.length - 1, Math.max(active.lastIndexOf(true), current.length - 1) + 1);
            if (last - first < 5) {
                last = Math.min(labels.length - 1, first + 5);
            }
        }
        const slice = (arr) => arr.slice(first, last + 1);
        const currentSlice = slice(cur);
        while (currentSlice.length < last - first + 1) {
            currentSlice.push(null);
        }
        const config = {
            type: "line",
            data: {
                labels: slice(labels),
                datasets: [
                    {
                        label: _t("Current period"),
                        data: currentSlice,
                        borderColor: "#2f6fe0",
                        backgroundColor: "rgba(47, 111, 224, 0.14)",
                        fill: true,
                        tension: 0.35,
                        pointRadius: 3,
                        borderWidth: 2.5,
                    },
                    {
                        label: _t("Previous period"),
                        data: slice(prev),
                        borderColor: "#aab0c4",
                        backgroundColor: "rgba(170, 176, 196, 0.12)",
                        fill: true,
                        tension: 0.35,
                        pointRadius: 0,
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${this.money(ctx.parsed.y)}` } },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { callback: (v) => this.number(v) } },
                },
            },
        };
        this.lineChart?.destroy();
        this.lineChart = new Chart(canvas, config);
    }
    drawDonut(data) {
        const canvas = this.donutRef.el;
        if (!canvas) {
            return;
        }
        this.donutChart?.destroy();
        const payments = data.payments;
        if (!payments.length) {
            return;
        }
        this.donutChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: payments.map((m) => m.name),
                datasets: [
                    {
                        data: payments.map((m) => Math.max(m.amount, 0)),
                        backgroundColor: payments.map((m, i) => this.paymentColor(m, i)),
                        borderWidth: 2,
                        borderColor: "#fff",
                    },
                ],
            },
            options: {
                maintainAspectRatio: false,
                animation: false,
                cutout: "68%",
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${this.money(payments[ctx.dataIndex].amount)}` } },
                },
            },
        });
    }
}

registry.category("actions").add("garese_pos.dashboard", GpDashboard);
